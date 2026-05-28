import React, { useEffect, useMemo, useState } from 'react';
import { Zap, Info, AlertTriangle, TrendingUp } from 'lucide-react';
import {
  calcJewelleryPrice, fmtINR, MAKING_CHARGE_MODES,
  DEFAULT_HALLMARK_FEE, DEFAULT_LAB_DIAMOND_RATE,
  purityToMetalType, resolveMetalRate,
} from '../lib/pricing';
import { METAL_PURITY_GROUPS, db } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
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
  const { user } = useAuth();
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
  const stoneWeightCt      = v.stone_weight_ct      ?? '';
  const stoneRatePerCt     = v.stone_rate_per_ct    ?? '';
  const flatStoneCost      = v.flat_stone_cost      ?? '';

  const patch = (delta) => onChange({ ...v, ...delta });

  // Per-store live rates ──────────────────────────────────────────────
  const [rates,    setRates]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [ratesErr, setRatesErr] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    db.from('metal_rates')
      .select('metal_type, purity_factor, rate_per_gram, fetched_at')
      .eq('store_id', user.id)
      .eq('is_current', true)
      .then(({ data, error }) => {
        if (error) { setRatesErr(error.message); setRates([]); }
        else       { setRatesErr(null);          setRates(data || []); }
        setLoading(false);
      });
  }, [user?.id]);

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
  }), [goldGrams, goldRpgEff, silverGrams, silverInfo.rate,
       makingValue, makingMode, stoneWeightCt, stoneRatePerCt, flatStoneCost, hallmark]);

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

      {/* Hallmark ──────────────────────────────────────── */}
      <div className={styles.section}>Hallmark / BIS Fee</div>
      <div className={styles.row}>
        <div className={styles.field}>
          <label>Hallmark fee (₹)</label>
          <input type="number" min="0" value={hallmark}
            onChange={e => patch({ hallmark_charge: e.target.value })}/>
        </div>
        <div className={styles.field} aria-hidden style={{ visibility: 'hidden' }}>
          <label>.</label><input/>
        </div>
      </div>

      {/* Live Breakdown ────────────────────────────────── */}
      <div className={styles.breakdown}>
        <BrkRow label="Gold cost"      value={result.goldCost}/>
        <BrkRow label="Silver cost"    value={result.silverCost}/>
        <BrkRow label="Making charges" value={result.makingCost}/>
        <BrkRow label="Stones / diamonds" value={result.stoneCost}/>
        <BrkRow label="Hallmark"       value={result.hallmark}/>
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
      <small className={`${styles.hint} ${styles.hintWarn}`}>
        <AlertTriangle size={10}/> No rate for this purity in metal_rates. Update today's rate first.
      </small>
    );
  }
  if (info.source === 'derived') {
    return (
      <small className={styles.hint}>
        <TrendingUp size={10}/> Derived from 999 base:&nbsp;
        <strong>{fmtINR(info.rate)}/g</strong>
        <span className={styles.muted}>&nbsp;({fmtINR(info.baseRate)} × {info.ratio.toFixed(3)})</span>
      </small>
    );
  }
  return (
    <small className={styles.hint}>
      <TrendingUp size={10}/> Today's rate: <strong>{fmtINR(info.rate)}/g</strong>
    </small>
  );
}
