import { useState, useEffect } from 'react';
import { TrendingUp, CalendarDays } from 'lucide-react';
import { db } from '../lib/config';
import styles from './MetalRatesCard.module.css';

function purityLabel(key) {
  const m = key.match(/(\d+)/);
  if (m) return `${m[1]} Purity`;
  if (/plat/i.test(key)) return 'Platinum';
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function metalType(key) {
  const k = key.toLowerCase();
  if (k.includes('silver')) return 'Silver';
  if (k.includes('plat'))   return 'Platinum';
  return 'Gold';
}

function unitLabel(key) {
  return /silver/i.test(key) ? '1 Kg' : '10 Gm';
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

export default function MetalRatesCard() {
  const [rates,    setRates]    = useState([]);
  const [rateDate, setRateDate] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const { data, error: err } = await db
        .from('daily_metal_rates')
        .select('rate_date, metal_key, rate_inr')
        .order('rate_date', { ascending: false })
        .limit(50);
      if (err) {
        setError(`Could not load rates — ${err.message}`);
        setLoading(false);
        return;
      }
      if (!data?.length) { setLoading(false); return; }
      const latestDate = data[0].rate_date;
      const sorted = sortRates(data.filter(r => r.rate_date === latestDate));
      setRates(sorted);
      setRateDate(latestDate);
      setLoading(false);
    }
    load();
  }, []);

  // Flat annotated list used by both strip (desktop) and ticker (mobile)
  const flatItems = rates.map(r => ({
    ...r,
    group: metalType(r.metal_key),
    color: TYPE_COLOR[metalType(r.metal_key)] || TYPE_COLOR.Gold,
  }));

  // Duration scales with item count so the ticker doesn't feel too fast or too slow
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
              const groupRates = rates.filter(r => metalType(r.metal_key) === group);
              if (!groupRates.length) return null;
              const color = TYPE_COLOR[group] || TYPE_COLOR.Gold;
              return (
                <div key={group} className={styles.group} style={{ flexGrow: groupRates.length }}>
                  <div className={styles.groupLabel} style={{ color: color.text, borderBottomColor: color.unit }}>
                    {group}
                  </div>
                  <div className={styles.groupChips}>
                    {groupRates.map((r, i) => (
                      <div
                        key={r.metal_key}
                        className={styles.chip}
                        style={i < groupRates.length - 1 ? { borderRight: '1px solid var(--border)' } : {}}
                      >
                        <span className={styles.chipPurity}>{purityLabel(r.metal_key)}</span>
                        <div className={styles.chipRate}>
                          <span className={styles.chipSym}>₹</span>
                          <span className={styles.chipNum}>{Math.round(r.rate_inr).toLocaleString('en-IN')}</span>
                        </div>
                        <span className={styles.chipUnit} style={{ background: color.unit, color: color.text }}>
                          {unitLabel(r.metal_key)}
                        </span>
                      </div>
                    ))}
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
              {/* Duplicate for seamless loop */}
              {[...flatItems, ...flatItems].map((item, i) => (
                <div key={i} className={styles.tickerChip}>
                  <span className={styles.tickerMetal} style={{ color: item.color.text }}>
                    {item.group}
                  </span>
                  <span className={styles.tickerDot} />
                  <span className={styles.tickerPurity}>{purityLabel(item.metal_key)}</span>
                  <span className={styles.tickerRate}>
                    ₹{Math.round(item.rate_inr).toLocaleString('en-IN')}
                  </span>
                  <span className={styles.tickerUnit} style={{ color: item.color.text, background: item.color.unit }}>
                    {unitLabel(item.metal_key)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
