import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Info } from 'lucide-react';
import {
  calcJewelleryPrice, fmtINR, MAKING_CHARGE_MODES,
  resolveMetalRate, purityToMetalType, RATE_UNIT,
} from '../lib/pricing';
import { db } from '../lib/config';
import { toGoldCaratLabel } from '../lib/designTaxonomy';
import InfoTip from './InfoTip';
import styles from './DesignPriceEstimate.module.css';

// Default per-design pricing inputs. These live inside params.pricing so
// they're saved with the design and restored when it's reopened.
export const DEFAULT_PRICING = {
  making_mode: 'percent',   // 'per_gram' | 'percent' | 'flat'
  making_value: '',
  // Jeweller-entered metal rate for the chosen purity, in the quoting unit
  // (per 10g for gold/platinum, per kg for silver). Blank by default — the
  // estimate does NOT auto-populate from IBJA; today's IBJA rate is only
  // offered as a tap-to-fill hint. See metal_rate_per_unit below.
  metal_rate_per_unit: '',
  stone_weight_ct: '',
  stone_rate_per_ct: '',
  flat_stone_cost: '',
  hallmark_fee: '45',
  diamond_cert_fee: '',
  gst_pct: '3',
};

// Pure estimate calculator. Reuses calcJewelleryPrice (ex-GST) from
// lib/pricing, then adds GST as its own line so the breakdown matches the
// formula: metal + stones + making + GST. `rates` is the normalized
// daily_metal_rates list (metal_type + rate_per_gram).
//
// Returns { metalCost, makingCost, stoneCost, hallmark, diamondCert,
//           subtotal, gstPct, gst, total, rateInfo } — or rateInfo.source
// === 'missing' when there is no published rate for the chosen purity.
// Unit (per 10g / per kg) + label for the chosen purity, so the manual rate
// input is interpreted the same way jewellers quote it. Falls back to the
// gold /10g convention for anything unrecognised.
export function metalRateUnitFor(purityLabel) {
  const key = purityToMetalType(purityLabel);
  const family = key?.startsWith('silver') ? 'silver' : key === 'platinum' ? 'platinum' : 'gold';
  return RATE_UNIT[family] || RATE_UNIT.gold;
}

export function computeDesignEstimate(params = {}, rates = []) {
  const p = { ...DEFAULT_PRICING, ...(params.pricing || {}) };
  const weight = Number(params.metal_weight_g) || 0;
  const isSilver = params.metal_type === 'Silver';
  const purityLabel = toGoldCaratLabel(params.metal_type, params.purity);
  // IBJA rate is looked up only to offer a tap-to-fill hint — it never drives
  // the estimate. The metal cost uses the jeweller's entered rate below.
  const rateInfo = resolveMetalRate(purityLabel, rates);

  // Jeweller-entered rate (in the quoting unit) → per-gram for the calculator.
  const unit = metalRateUnitFor(purityLabel);
  const enteredRatePerGram = (Number(p.metal_rate_per_unit) || 0) / unit.perGramFactor;

  const base = calcJewelleryPrice({
    goldGrams:        isSilver ? 0 : weight,
    goldRatePerGram:  isSilver ? 0 : enteredRatePerGram,
    silverGrams:      isSilver ? weight : 0,
    silverRatePerGram: isSilver ? enteredRatePerGram : 0,
    making:           p.making_value,
    makingMode:       p.making_mode,
    stoneWeightCt:    p.stone_weight_ct,
    stoneRatePerCt:   p.stone_rate_per_ct,
    flatStoneCost:    p.flat_stone_cost,
    hallmarkFee:      p.hallmark_fee,
    diamondCertFee:   p.diamond_cert_fee,
  });

  const subtotal = base.total;                       // ex-GST
  const gstPct = Number(p.gst_pct) || 0;
  const gst = Math.round(subtotal * (gstPct / 100));
  const total = subtotal + gst;

  return {
    metalCost: base.metalCost,
    makingCost: base.makingCost,
    stoneCost: base.stoneCost,
    hallmark: base.hallmark,
    diamondCert: base.diamondCert,
    subtotal,
    gstPct,
    gst,
    total,
    rateInfo,
    unitLabel: unit.label,
    enteredRatePerUnit: Number(p.metal_rate_per_unit) || 0,
  };
}

// Load + normalize today's metal rates, the same way DynamicPricingPanel
// does (strip the _am/_pm IBJA suffix, map rate_inr → rate_per_gram).
function useMetalRates() {
  const [rates, setRates] = useState([]);
  useEffect(() => {
    db.from('daily_metal_rates')
      .select('rate_date, metal_key, rate_inr')
      .order('rate_date', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error || !data?.length) return;
        const latest = data[0].rate_date;
        setRates(
          data.filter(r => r.rate_date === latest).map(r => ({
            metal_type: r.metal_key.replace(/_(am|pm)$/i, ''),
            rate_per_gram: Number(r.rate_inr),
          }))
        );
      });
  }, []);
  return rates;
}

// Live, editable price estimate. Edits write back into params.pricing via
// setParams; the computed breakdown is pushed up through onEstimate so the
// page can persist it with the design.
export default function DesignPriceEstimate({ params, setParams, onEstimate }) {
  const rates = useMetalRates();
  const p = { ...DEFAULT_PRICING, ...(params.pricing || {}) };

  const est = useMemo(() => computeDesignEstimate(params, rates), [params, rates]);

  // Hand the freshest breakdown to the parent for saving.
  useEffect(() => { onEstimate?.(est); }, [est, onEstimate]);

  const setPricing = (key, val) =>
    setParams(f => ({ ...f, pricing: { ...DEFAULT_PRICING, ...(f.pricing || {}), [key]: val } }));

  const purityLabel = toGoldCaratLabel(params.metal_type, params.purity);
  const metalName = params.metal_type === 'Silver' ? 'Silver' : 'Gold';
  // Today's IBJA rate, offered only as a tap-to-fill convenience (never auto-applied).
  const ibjaRate = est.rateInfo.source !== 'missing' ? Math.round(est.rateInfo.displayRate) : 0;

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <Calculator size={14} />
        <span>Price estimate</span>
        <InfoTip text="A rough price only. You enter today's metal rate and set the making, stone and GST values below." label="Price estimate" />
        <span className={styles.estimateTag}>Estimate</span>
      </div>

      {/* Jeweller-entered metal rate — the estimate never auto-fills from IBJA. */}
      <div className={styles.rateEntry}>
        <label>
          {metalName} rate ({purityLabel || 'purity'})
          <InfoTip text={`Enter today's ${metalName.toLowerCase()} rate for this purity, the way you quote it (${est.unitLabel || '/10g'}). The metal cost is this rate × weight.`} label="Metal rate" />
        </label>
        <div className={styles.rateInputRow}>
          <input
            type="number" min="0" inputMode="decimal"
            value={p.metal_rate_per_unit}
            onChange={e => setPricing('metal_rate_per_unit', e.target.value)}
            placeholder={`enter rate ${est.unitLabel || '/10g'}`}
          />
          <span className={styles.rateUnit}>{est.unitLabel || '/10g'}</span>
        </div>
        {ibjaRate > 0 && Number(p.metal_rate_per_unit) !== ibjaRate && (
          <button
            type="button"
            className={styles.rateHint}
            onClick={() => setPricing('metal_rate_per_unit', String(ibjaRate))}
          >
            Today's IBJA {purityLabel}: {fmtINR(ibjaRate)} {est.unitLabel} — use this
          </button>
        )}
      </div>

      {/* Editable per-design charges */}
      <div className={styles.inputs}>
        <div className={styles.row3}>
          <div className={styles.field}>
            <label>Making mode <InfoTip text="How you charge for making the piece: a rate per gram, a percent of the gold value, or a flat amount." label="Making mode" /></label>
            <select value={p.making_mode} onChange={e => setPricing('making_mode', e.target.value)}>
              {MAKING_CHARGE_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label>Making value</label>
            <input
              type="number" min="0" inputMode="decimal"
              value={p.making_value}
              onChange={e => setPricing('making_value', e.target.value)}
              placeholder={p.making_mode === 'per_gram' ? '₹ / gram' : p.making_mode === 'percent' ? '% of metal' : 'Flat ₹'}
            />
          </div>
          <div className={styles.field}>
            <label>GST % <InfoTip text="Government tax added on top. Usually 3% on gold jewellery in India." label="GST %" /></label>
            <input
              type="number" min="0" step="0.1" inputMode="decimal"
              value={p.gst_pct}
              onChange={e => setPricing('gst_pct', e.target.value)}
              placeholder="e.g. 3"
            />
          </div>
        </div>

        <div className={styles.row3}>
          <div className={styles.field}>
            <label>Stone weight (ct)</label>
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={p.stone_weight_ct}
              onChange={e => setPricing('stone_weight_ct', e.target.value)}
              placeholder="total carats"
            />
          </div>
          <div className={styles.field}>
            <label>Stone rate (₹/ct) <InfoTip text="Price per carat for the stones. Leave blank if there is no stone." label="Stone rate" /></label>
            <input
              type="number" min="0" inputMode="decimal"
              value={p.stone_rate_per_ct}
              onChange={e => setPricing('stone_rate_per_ct', e.target.value)}
              placeholder="enter per-carat rate"
            />
          </div>
          <div className={styles.field}>
            <label>Other stone cost (₹)</label>
            <input
              type="number" min="0" inputMode="decimal"
              value={p.flat_stone_cost}
              onChange={e => setPricing('flat_stone_cost', e.target.value)}
              placeholder="pearls, enamel…"
            />
          </div>
        </div>

        <div className={styles.row2}>
          <div className={styles.field}>
            <label>Hallmark fee (₹)</label>
            <input
              type="number" min="0" inputMode="decimal"
              value={p.hallmark_fee}
              onChange={e => setPricing('hallmark_fee', e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Diamond cert fee (₹)</label>
            <input
              type="number" min="0" inputMode="decimal"
              value={p.diamond_cert_fee}
              onChange={e => setPricing('diamond_cert_fee', e.target.value)}
              placeholder="optional"
            />
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className={styles.breakdown}>
        <Row label={`Metal (${Number(params.metal_weight_g) || 0} g)`} value={est.metalCost} />
        <Row label="Making charges" value={est.makingCost} />
        <Row label="Stones" value={est.stoneCost} />
        <Row label="Hallmark" value={est.hallmark} />
        <Row label="Diamond cert" value={est.diamondCert} />
        <div className={styles.divider} />
        <Row label="Subtotal" value={est.subtotal} />
        <Row label={`GST (${est.gstPct}%)`} value={est.gst} />
        <div className={styles.divider} />
        <Row label="Estimated total" value={est.total} big />
      </div>

      <div className={styles.footnote}>
        <Info size={11} />
        An estimate only. Metal cost uses today's published rate × weight; you set making,
        stone and GST values above.
      </div>
    </div>
  );
}

function Row({ label, value, big }) {
  return (
    <div className={`${styles.brkRow} ${big ? styles.brkBig : ''}`}>
      <span>{label}</span>
      <span>{fmtINR(value)}</span>
    </div>
  );
}
