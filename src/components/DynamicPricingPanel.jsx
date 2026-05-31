import React, { useEffect, useMemo, useState } from 'react';
import { Zap, Info, AlertTriangle, TrendingUp } from 'lucide-react';
import {
  calcJewelleryPrice, fmtINR, MAKING_CHARGE_MODES,
  DEFAULT_HALLMARK_FEE, DEFAULT_LAB_DIAMOND_RATE,
  purityToMetalType, resolveMetalRate,
} from '../lib/pricing';
import { METAL_PURITY_GROUPS, db } from '../lib/config';
import styles from './DynamicPricingPanel.module.css';

const GOLD_OPTIONS   = METAL_PURITY_GROUPS.find(g => g.label === 'Gold Purity')?.options || [];
const SILVER_OPTIONS = METAL_PURITY_GROUPS.find(g => g.label === 'Silver Purity')?.options || [];

// ── DynamicPricingPanel ─────────────────────────────────────────────
// Lives INLINE inside ProductModal when the owner picks "Dynamic" mode.
// Owner enters gold/silver purity + grams; the panel pulls today's
// per-gram rates from public.metal_rates and shows a live breakdown.
// Whenever the computed total changes, onChange(total, dynamicFields)
// is fired so the parent can keep its `price` field in sync.
// ────────────────────────────────────────────────────────────────────
export default function DynamicPricingPanel({ value, onChange, onTotalChange }) {
  const v = value || {};

  // Persisted (parent-owned) fields ───────────────────────────────────
  const goldPurity         = v.gold_purity          || '';
  const goldGrams          = v.gold_weight_grams    ?? '';
  const silverPurity       = v.silver_purity        || '';
  const silverGrams        = v.silver_weight_grams  ?? '';
  const wastage            = v.wastage_percent      ?? '';
  const makingMode         = v.making_charge_type   || 'per_gram';
  const makingValue        = v.making_charge_value  ?? '';
  const hallmark           = v.hallmark_charge      ?? DEFAULT_HALLMARK_FEE;
  const diamondCertFee     = v.diamond_cert_fee     ?? 0;
  const stoneWeightCt      = v.stone_weight_ct      ?? '';
  const stoneRatePerCt     = v.stone_rate_per_ct    ?? '';
  const flatStoneCost      = v.flat_stone_cost      ?? '';

  const patch = (delta) => onChange({ ...v, ...delta });

  // Live rates from the shared daily_metal_rates reference table ─────
  // Rows look like: { metal_key: 'gold_999_pm', rate_inr: 156072, ... }
  // We strip the trailing '_pm' marker and map rate_inr → rate_per_gram
  // so resolveMetalRate() sees the same shape it's always used.
  const [rates,    setRates]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [ratesErr, setRatesErr] = useState(null);

  useEffect(() => {
    setLoading(true);
    db.from('daily_metal_rates')
      .select('rate_date, metal_key, rate_inr')
      .order('rate_date', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) { setRatesErr(error.message); setRates([]); setLoading(false); return; }
        const rows = data || [];
        if (!rows.length) { setRatesErr(null); setRates([]); setLoading(false); return; }
        const latestDate = rows[0].rate_date;
        const normalized = rows
          .filter(r => r.rate_date === latestDate)
          .map(r => ({
            metal_type:    r.metal_key.replace(/_pm$/i, ''),
            rate_per_gram: Number(r.rate_inr),
          }));
        setRatesErr(null);
        setRates(normalized);
        setLoading(false);
      });
  }, []);

  const goldInfo   = useMemo(() => resolveMetalRate(goldPurity,   rates), [goldPurity, rates]);
  const silverInfo = useMemo(() => resolveMetalRate(silverPurity, rates), [silverPurity, rates]);

  // Apply wastage to gold rate only (industry-standard)
  const goldRpgEff = useMemo(
    () => goldInfo.rate * (1 + (Number(wastage) || 0) / 100),
    [goldInfo.rate, wastage]
  );

  const result = useMemo(() => calcJewelleryPrice({
    goldGrams,            goldRatePerGram:   goldRpgEff,
    silverGrams,          silverRatePerGram: silverInfo.rate,
    making: makingValue,  makingMode,
    stoneWeightCt, stoneRatePerCt, flatStoneCost,
    hallmarkFee: hallmark,
    diamondCertFee,
  }), [goldGrams, goldRpgEff, silverGrams, silverInfo.rate,
       makingValue, makingMode, stoneWeightCt, stoneRatePerCt, flatStoneCost, hallmark, diamondCertFee]);

  // Push the live total + persisted snapshot of metal_type/weight up to parent
  useEffect(() => {
    const total = Math.round(result.total);
    onTotalChange?.(total, {
      metal_type:           purityToMetalType(goldPurity || silverPurity) || null,
      metal_weight_grams:   Number(goldGrams || 0) + Number(silverGrams || 0) || null,
      stone_value_inr:      Number(result.stoneCost) || 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.total, goldPurity, silverPurity, goldGrams, silverGrams, result.stoneCost]);

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <Zap size={13} color="#8B6914"/>
        <span>Live pricing from today's metal rates</span>
        {loading && <span className={styles.muted}>· loading rates…</span>}
        {ratesErr && <span className={styles.warn}>· rates error: {ratesErr}</span>}
      </div>

      {/* Gold ──────────────────────────────────────────── */}
      <div className={styles.section}>Gold</div>
      <div className={styles.row}>
        <div className={styles.field}>
          <label>Gold Purity</label>
          <select value={goldPurity} onChange={e => patch({ gold_purity: e.target.value })}>
            <option value="">— none —</option>
            {GOLD_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <RateHint info={goldInfo} purity={goldPurity}/>
        </div>
        <div className={styles.field}>
          <label>Gold Weight (grams)</label>
          <input type="number" min="0" step="0.001"
            value={goldGrams}
            onChange={e => patch({ gold_weight_grams: e.target.value })}
            placeholder="e.g. 5.20"/>
        </div>
      </div>

      {/* Silver ────────────────────────────────────────── */}
      <div className={styles.section}>Silver</div>
      <div className={styles.row}>
        <div className={styles.field}>
          <label>Silver Purity</label>
          <select value={silverPurity} onChange={e => patch({ silver_purity: e.target.value })}>
            <option value="">— none —</option>
            {SILVER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <RateHint info={silverInfo} purity={silverPurity}/>
        </div>
        <div className={styles.field}>
          <label>Silver Weight (grams)</label>
          <input type="number" min="0" step="0.001"
            value={silverGrams}
            onChange={e => patch({ silver_weight_grams: e.target.value })}
            placeholder="e.g. 10.00"/>
        </div>
      </div>

      {/* Making + wastage ──────────────────────────────── */}
      <div className={styles.section}>Making Charges</div>
      <div className={styles.row3}>
        <div className={styles.field}>
          <label>Wastage % (gold)</label>
          <input type="number" min="0" step="0.1" value={wastage}
            onChange={e => patch({ wastage_percent: e.target.value })} placeholder="e.g. 3"/>
        </div>
        <div className={styles.field}>
          <label>Charging Mode</label>
          <select value={makingMode}
            onChange={e => patch({ making_charge_type: e.target.value })}>
            {MAKING_CHARGE_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label>Making Value</label>
          <input type="number" min="0" value={makingValue}
            onChange={e => patch({ making_charge_value: e.target.value })}
            placeholder={makingMode==='per_gram'?'₹ / gram':makingMode==='percent'?'% of metal':'Flat ₹'}/>
        </div>
      </div>

      {/* Stones (optional) ─────────────────────────────── */}
      <details className={styles.details}>
        <summary>Stones / Diamonds (optional)</summary>
        <div className={styles.row3} style={{ marginTop: 8 }}>
          <div className={styles.field}>
            <label>Stone weight (ct)</label>
            <input type="number" min="0" step="0.01" value={stoneWeightCt}
              onChange={e => patch({ stone_weight_ct: e.target.value })} placeholder="e.g. 0.50"/>
          </div>
          <div className={styles.field}>
            <label>Rate (₹/carat)</label>
            <input type="number" min="0" value={stoneRatePerCt}
              onChange={e => patch({ stone_rate_per_ct: e.target.value })}
              placeholder={`e.g. ${DEFAULT_LAB_DIAMOND_RATE}`}/>
          </div>
          <div className={styles.field}>
            <label>Other stone cost (₹)</label>
            <input type="number" min="0" value={flatStoneCost}
              onChange={e => patch({ flat_stone_cost: e.target.value })}
              placeholder="pearls, enamel…"/>
          </div>
        </div>
      </details>

      {/* Hallmark + Diamond cert ───────────────────────── */}
      <div className={styles.section}>Hallmark / BIS &amp; Diamond Certification</div>
      <div className={styles.row}>
        <div className={styles.field}>
          <label>Hallmark fee (₹)</label>
          <input type="number" min="0" value={hallmark}
            onChange={e => patch({ hallmark_charge: e.target.value })}/>
        </div>
        <div className={styles.field}>
          <label>Diamond certification fee (₹)</label>
          <input type="number" min="0" value={diamondCertFee}
            onChange={e => patch({ diamond_cert_fee: e.target.value })}
            placeholder="e.g. 500"/>
        </div>
      </div>

      {/* Live Breakdown ────────────────────────────────── */}
      <div className={styles.breakdown}>
        <BrkRow label="Gold cost"      value={result.goldCost}/>
        <BrkRow label="Silver cost"    value={result.silverCost}/>
        <BrkRow label="Making charges" value={result.makingCost}/>
        <BrkRow label="Stones / diamonds" value={result.stoneCost}/>
        <BrkRow label="Hallmark"       value={result.hallmark}/>
        <BrkRow label="Diamond cert"   value={result.diamondCert}/>
        <div className={styles.line}/>
        <BrkRow label="TOTAL (ex-GST)" value={result.total} big bold/>
      </div>

      <div className={styles.footnote}>
        <Info size={11}/>
        Final price recomputes automatically when today's metal rates change.
        Stored as snapshot in the Price field for offline display.
      </div>
    </div>
  );
}

function BrkRow({ label, value, big, bold }) {
  if (!value && value !== 0) return null;
  if (!big && !value) return null;
  return (
    <div className={`${styles.brkRow} ${bold ? styles.brkBold : ''} ${big ? styles.brkBig : ''}`}>
      <span>{label}</span>
      <span>{fmtINR(value)}</span>
    </div>
  );
}

function RateHint({ info, purity }) {
  if (!purity) return null;
  if (info.source === 'missing' || info.rate === 0) {
    return (
      <div className={`${styles.rateCard} ${styles.rateCardWarn}`}>
        <AlertTriangle size={12}/>
        <span>No rate published for this purity yet.</span>
      </div>
    );
  }
  const unit       = info.unitLabel || '/g';
  const isDerived  = info.source === 'derived';
  return (
    <div className={styles.rateCard}>
      <div className={styles.rateCardTop}>
        <TrendingUp size={11} className={styles.rateIcon}/>
        <span className={styles.rateLabel}>{isDerived ? 'Derived rate' : "Today's rate"}</span>
        <span className={styles.ratePrice}>{fmtINR(info.displayRate)}<small>{unit}</small></span>
      </div>
      <div className={styles.rateCardBottom}>
        {isDerived && <span>from 999 base · </span>}
        <span>per-gram <strong>{fmtINR(info.rate)}</strong></span>
      </div>
    </div>
  );
}
