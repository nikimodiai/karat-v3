import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, CalendarDays, Pencil, X, Check, Info } from 'lucide-react';
import { db, N8N_OWNER_RATE_SAVE } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import styles from './MetalRatesCard.module.css';

// Fineness -> karat, for the golds IBJA/our pricing engine actually quotes
const FINENESS_KARAT = { 999: 24, 995: 24, 916: 22, 750: 18, 585: 14 };

function metalType(key) {
  const k = key.toLowerCase();
  if (k.includes('silver')) return 'Silver';
  if (k.includes('plat'))   return 'Platinum';
  return 'Gold';
}

// "999 Purity" told you nothing useful — show the metal + karat jewellers
// actually think in, e.g. "Gold 24K (999)" / "Silver 999 (Fine)".
function purityLabel(key) {
  const type = metalType(key);
  const m = key.match(/(\d+)/);
  const fineness = m ? Number(m[1]) : null;

  if (type === 'Gold') {
    const karat = fineness != null ? FINENESS_KARAT[fineness] : null;
    return karat ? `Gold ${karat}K (${fineness})` : (fineness != null ? `Gold (${fineness})` : 'Gold');
  }
  if (type === 'Silver') {
    return fineness != null ? `Silver ${fineness}` : 'Silver';
  }
  if (type === 'Platinum') return 'Platinum';
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Short form for chips already grouped under a Gold/Silver header — the
// metal name would just be noise there, so show karat/fineness only.
function purityLabelShort(key) {
  const type = metalType(key);
  const m = key.match(/(\d+)/);
  const fineness = m ? Number(m[1]) : null;

  if (type === 'Gold') {
    const karat = fineness != null ? FINENESS_KARAT[fineness] : null;
    return karat ? `${karat}K (${fineness})` : (fineness != null ? `${fineness}` : 'Gold');
  }
  if (fineness != null) return `${fineness} Fine`;
  return type;
}

function unitLabel(key) {
  return /silver/i.test(key) ? '1 Kg' : '10 Gm';
}

// Strip the IBJA am/pm suffix → the base metal_key stored in app_owner_metal_rates
function baseKey(key) {
  return key.replace(/_(am|pm)$/i, '');
}

// Only gold & silver support jeweller overrides (platinum/others stay IBJA-only)
function isOverridable(key) {
  const t = metalType(key);
  return t === 'Gold' || t === 'Silver';
}

function sortRates(rows) {
  const TYPE_ORDER = { Gold: 0, Platinum: 1, Silver: 2 };
  return [...rows].sort((a, b) => {
    const tA = metalType(a.metal_key), tB = metalType(b.metal_key);
    if (TYPE_ORDER[tA] !== TYPE_ORDER[tB]) return TYPE_ORDER[tA] - TYPE_ORDER[tB];
    const pA = Number(a.metal_key.match(/(\d+)/)?.[1] || 0);
    const pB = Number(b.metal_key.match(/(\d+)/)?.[1] || 0);
    return pB - pA;
  });
}

function fmtRateDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

const TYPE_COLOR = {
  Gold:     { bg: 'rgba(201,168,76,.12)', text: '#8B6914', unit: 'rgba(201,168,76,.25)' },
  Silver:   { bg: 'rgba(120,120,140,.1)', text: '#5a5a72', unit: 'rgba(120,120,140,.2)' },
  Platinum: { bg: 'rgba(80,100,140,.1)',  text: '#3a4f7a', unit: 'rgba(80,100,140,.2)'  },
};

const RATES_CACHE_KEY = 'swarnix_cached_metal_rates';
const DEFAULT_STALE_DAYS = 3;

// Read the last-seen rates synchronously so the card paints instantly on
// refresh instead of waiting behind Supabase's on-load auth token refresh
// (which blocks DB queries for several seconds).
function readCachedRates() {
  try {
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.rates) && parsed.rates.length) return parsed;
  } catch (_) {}
  return null;
}

// ── Effective-rate resolution (mirrors the n8n Daily Dynamic Pricing Updater) ──
// 1. Fresh absolute override (entered within stale_days) → MAX(override, IBJA)
// 2. Else premium_pct > 0 → IBJA × (1 + premium_pct/100)
// 3. Else → IBJA
// Returns { value, source: 'ibja' | 'override' | 'premium' | 'stale' }.
function resolveEffective(ibjaValue, override, staleDays) {
  const ibja = Number(ibjaValue) || 0;
  if (!override) return { value: ibja, source: 'ibja' };

  const hasAbs = override.rate_inr != null && override.rate_inr !== '';
  const ageDays = override.entered_at
    ? (Date.now() - new Date(override.entered_at).getTime()) / 86400000
    : Infinity;
  const fresh = ageDays <= (staleDays ?? DEFAULT_STALE_DAYS);
  const prem = Number(override.premium_pct) || 0;

  if (hasAbs && fresh) {
    const ov = Number(override.rate_inr) || 0;
    return ov >= ibja
      ? { value: ov, source: 'override' }
      : { value: ibja, source: 'ibja' }; // MAX picked IBJA — override below market
  }
  if (prem > 0) {
    return { value: Math.round(ibja * (1 + prem / 100)), source: 'premium' };
  }
  // had an absolute but it's stale, no premium → IBJA (protects against old low rate)
  return { value: ibja, source: hasAbs ? 'stale' : 'ibja' };
}

export default function MetalRatesCard() {
  const { store, isOwner } = useAuth();
  const ownerId = store?.owner_id || null;
  // Only the Google-authenticated owner can edit — app_owner_metal_rates RLS is
  // keyed on auth.uid()=owner_id, and staff (store_user) sessions have no auth.uid().
  const canEdit = isOwner;

  const cached = readCachedRates();
  const [rates,    setRates]    = useState(cached?.rates || []);
  const [rateDate, setRateDate] = useState(cached?.rateDate || null);
  const [loading,  setLoading]  = useState(!cached);
  const [error,    setError]    = useState(null);

  // owner overrides keyed by base metal_key, + staleness window
  const [overrides, setOverrides] = useState({});      // { 'gold_916': { rate_inr, premium_pct, entered_at } }
  const [staleDays, setStaleDays] = useState(store?.metal_rate_stale_days ?? DEFAULT_STALE_DAYS);

  const [editing, setEditing] = useState(false);

  const loadOverrides = useCallback(async () => {
    if (!ownerId) return;
    const { data } = await db
      .from('app_owner_metal_rates')
      .select('metal_key, rate_inr, premium_pct, entered_at')
      .eq('owner_id', ownerId);
    const map = {};
    (data || []).forEach(r => { map[r.metal_key] = r; });
    setOverrides(map);
  }, [ownerId]);

  useEffect(() => {
    async function load() {
      setError(null);
      const { data, error: err } = await db
        .from('daily_metal_rates')
        .select('rate_date, metal_key, rate_inr')
        .order('rate_date', { ascending: false })
        .limit(50);
      if (err) {
        if (!cached) setError(`Could not load rates — ${err.message}`);
        setLoading(false);
        return;
      }
      if (!data?.length) { setLoading(false); return; }
      const latestDate = data[0].rate_date;
      const sorted = sortRates(data.filter(r => r.rate_date === latestDate));
      setRates(sorted);
      setRateDate(latestDate);
      setLoading(false);
      try {
        localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({ rates: sorted, rateDate: latestDate }));
      } catch (_) {}
    }
    load();
    loadOverrides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (store?.metal_rate_stale_days != null) setStaleDays(store.metal_rate_stale_days);
  }, [store?.metal_rate_stale_days]);

  // Annotate each IBJA row with its effective (post-override) rate for display
  function effectiveFor(r) {
    const ov = isOverridable(r.metal_key) ? overrides[baseKey(r.metal_key)] : null;
    return resolveEffective(r.rate_inr, ov, staleDays);
  }

  const flatItems = rates.map(r => {
    const eff = effectiveFor(r);
    return {
      ...r,
      group: metalType(r.metal_key),
      color: TYPE_COLOR[metalType(r.metal_key)] || TYPE_COLOR.Gold,
      effValue: eff.value,
      effSource: eff.source,
    };
  });

  const tickerDuration = Math.max(16, flatItems.length * 2.2);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <TrendingUp size={14} color="#C9A84C" />
          <span className={styles.title}>Today's Metal Rates</span>
          {rateDate && (
            <span className={styles.dateTag}>
              <CalendarDays size={11} />
              {fmtRateDate(rateDate)}
            </span>
          )}
        </div>
        {canEdit && rates.length > 0 && !loading && !error && (
          <button className={styles.editBtn} onClick={() => setEditing(true)}>
            <Pencil size={12} /> Edit my rates
          </button>
        )}
      </div>

      {loading ? (
        <div className={styles.stateRow}>
          <div className="spinner spinner-sm" /> Loading rates…
        </div>
      ) : error ? (
        <div className={styles.stateRow} style={{ color: 'var(--err)' }}>{error}</div>
      ) : rates.length === 0 ? (
        <div className={styles.emptyState}>
          No rates in <code>daily_metal_rates</code> — check the table has rows and RLS allows authenticated reads.
        </div>
      ) : (
        <>
          {/* ── Desktop / tablet strip ─────────────────────────── */}
          <div className={styles.strip}>
            {['Gold', 'Silver', 'Platinum'].map(group => {
              const groupItems = flatItems.filter(r => r.group === group);
              if (!groupItems.length) return null;
              const color = TYPE_COLOR[group] || TYPE_COLOR.Gold;
              return (
                <div key={group} className={styles.group} style={{ flexGrow: groupItems.length }}>
                  <div className={styles.groupLabel} style={{ color: color.text, borderBottomColor: color.unit }}>
                    {group}
                  </div>
                  <div className={styles.groupChips}>
                    {groupItems.map((r, i) => {
                      const custom = r.effSource === 'override' || r.effSource === 'premium';
                      return (
                        <div
                          key={r.metal_key}
                          className={styles.chip}
                          style={i < groupItems.length - 1 ? { borderRight: '1px solid var(--border)' } : {}}
                        >
                          <span className={styles.chipPurity}>{purityLabelShort(r.metal_key)}</span>
                          <div className={styles.chipRate}>
                            <span className={styles.chipSym}>₹</span>
                            <span className={styles.chipNum}>{Math.round(r.effValue).toLocaleString('en-IN')}</span>
                          </div>
                          <span className={styles.chipUnit} style={{ background: color.unit, color: color.text }}>
                            {unitLabel(r.metal_key)}
                          </span>
                          {custom && <span className={styles.myTag}>My rate</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Mobile sliding ticker ──────────────────────────── */}
          <div className={styles.ticker}>
            <div
              className={styles.tickerTrack}
              style={{ animationDuration: `${tickerDuration}s` }}
            >
              {[...flatItems, ...flatItems].map((item, i) => {
                const custom = item.effSource === 'override' || item.effSource === 'premium';
                return (
                  <div key={i} className={styles.tickerChip}>
                    <span className={styles.tickerMetal} style={{ color: item.color.text }}>
                      {item.group}
                    </span>
                    <span className={styles.tickerDot} />
                    <span className={styles.tickerPurity}>{purityLabelShort(item.metal_key)}</span>
                    <span className={styles.tickerRate}>
                      ₹{Math.round(item.effValue).toLocaleString('en-IN')}
                    </span>
                    {custom && <span className={styles.myTagSm}>mine</span>}
                    <span className={styles.tickerUnit} style={{ color: item.color.text, background: item.color.unit }}>
                      {unitLabel(item.metal_key)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {editing && (
        <RateEditor
          ownerId={ownerId}
          ibjaRates={rates.filter(r => isOverridable(r.metal_key))}
          overrides={overrides}
          staleDays={staleDays}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            await loadOverrides();
            setEditing(false);
          }}
          setStaleDaysOuter={setStaleDays}
        />
      )}
    </div>
  );
}

// ── Editor modal ────────────────────────────────────────────────────────────
function RateEditor({ ownerId, ibjaRates, overrides, staleDays, onClose, onSaved, setStaleDaysOuter }) {
  const { updateStore } = useAuth();

  // One editable row per overridable IBJA purity, seeded from existing overrides.
  const [rows, setRows] = useState(() =>
    ibjaRates.map(r => {
      const bk = baseKey(r.metal_key);
      const ov = overrides[bk] || {};
      return {
        metal_key: bk,
        type: metalType(r.metal_key),
        label: purityLabel(r.metal_key),
        unit: unitLabel(r.metal_key),
        ibja: Number(r.rate_inr) || 0,
        rate_inr: ov.rate_inr != null ? String(ov.rate_inr) : '',
        premium_pct: ov.premium_pct != null && Number(ov.premium_pct) !== 0 ? String(ov.premium_pct) : '',
      };
    })
  );
  const [days, setDays] = useState(String(staleDays ?? DEFAULT_STALE_DAYS));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function setField(idx, field, value) {
    setRows(rs => rs.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();

      // Rows the jeweller actually filled in (absolute rate OR premium).
      const toUpsert = rows
        .filter(r => r.rate_inr !== '' || (r.premium_pct !== '' && Number(r.premium_pct) !== 0))
        .map(r => ({
          owner_id: ownerId,
          metal_key: r.metal_key,
          rate_inr: r.rate_inr === '' ? null : Number(r.rate_inr),
          premium_pct: r.premium_pct === '' ? 0 : Number(r.premium_pct),
          entered_at: nowIso,
        }));

      // Rows cleared back to empty → remove any existing override so pricing reverts to IBJA.
      const toClear = rows
        .filter(r => r.rate_inr === '' && (r.premium_pct === '' || Number(r.premium_pct) === 0))
        .filter(r => overrides[r.metal_key])
        .map(r => r.metal_key);

      if (toUpsert.length) {
        const { error } = await db
          .from('app_owner_metal_rates')
          .upsert(toUpsert, { onConflict: 'owner_id,metal_key' });
        if (error) throw error;
      }
      if (toClear.length) {
        const { error } = await db
          .from('app_owner_metal_rates')
          .delete()
          .eq('owner_id', ownerId)
          .in('metal_key', toClear);
        if (error) throw error;
      }

      // Persist staleness window on the store row.
      const daysNum = Math.max(1, Math.min(30, Number(days) || DEFAULT_STALE_DAYS));
      const { error: sErr } = await db
        .from('stores')
        .update({ metal_rate_stale_days: daysNum })
        .eq('owner_id', ownerId);
      if (!sErr) {
        setStaleDaysOuter(daysNum);
        updateStore({ metal_rate_stale_days: daysNum });
      }

      // Fire the scoped re-pricing workflow (fire-and-forget — prices update
      // server-side within a few seconds; the UI already reflects the new rate).
      fetch(N8N_OWNER_RATE_SAVE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: ownerId }),
      }).catch(() => {});

      await onSaved();
    } catch (e) {
      setErr(e.message || 'Could not save your rates. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <div className={styles.modalTitle}>My Metal Rates</div>
          <button className={styles.modalClose} onClick={onClose}><X size={16} /></button>
        </div>

        <div className={styles.modalHint}>
          <Info size={13} />
          <span>
            Set your own rate (per 10g gold / 1kg silver) or a premium over IBJA.
            We always price at the <strong>higher</strong> of your rate and today's IBJA,
            so you never sell below market. If you don't refresh your rate for more than{' '}
            <strong>{days || DEFAULT_STALE_DAYS} days</strong>, we auto-switch to IBJA + your premium.
          </span>
        </div>

        <div className={styles.editTable}>
          <div className={styles.editRowHead}>
            <span>Karat / Purity</span>
            <span>IBJA today</span>
            <span>My rate (₹)</span>
            <span>Premium %</span>
          </div>
          {rows.map((r, i) => {
            const prevType = i > 0 ? rows[i - 1].type : null;
            const showGroupHead = r.type !== prevType;
            return (
              <div key={r.metal_key}>
                {showGroupHead && (
                  <div className={styles.editGroupHead}>{r.type}</div>
                )}
                <div className={styles.editRow}>
                  <span className={styles.editPurity}>
                    {r.label}<em className={styles.editUnit}>/{r.unit}</em>
                  </span>
                  <span className={styles.editIbja}>₹{Math.round(r.ibja).toLocaleString('en-IN')}</span>
                  <input
                    type="number" inputMode="numeric" placeholder="—"
                    className={styles.editInput}
                    value={r.rate_inr}
                    onChange={e => setField(i, 'rate_inr', e.target.value)}
                  />
                  <input
                    type="number" inputMode="decimal" placeholder="0" step="0.5"
                    className={styles.editInputSm}
                    value={r.premium_pct}
                    onChange={e => setField(i, 'premium_pct', e.target.value)}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.staleRow}>
          <label>Auto-switch to IBJA + premium if my rate is older than</label>
          <input
            type="number" inputMode="numeric" min="1" max="30"
            className={styles.editInputSm}
            value={days}
            onChange={e => setDays(e.target.value)}
          />
          <span>days</span>
        </div>

        {err && <div className={styles.editErr}>{err}</div>}

        <div className={styles.modalActions}>
          <button className={styles.btnGhost} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.btnGold} onClick={save} disabled={saving}>
            {saving ? <><div className="spinner spinner-sm" /> Saving…</> : <><Check size={14} /> Save &amp; re-price</>}
          </button>
        </div>
      </div>
    </div>
  );
}
