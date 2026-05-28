import React, { useState, useEffect, useMemo } from 'react';
import { Calculator, X, RefreshCw, Info, Check } from 'lucide-react';
import {
  calculatePrice, defaultRateFor, fmtINR,
  MAKING_CHARGE_MODES, DEFAULT_HALLMARK_FEE, GST_RATE,
  DEFAULT_LAB_DIAMOND_RATE,
  metalType, parseGoldCarat, parseSilverFineness, isPlatinum,
} from '../lib/pricing';
import { db } from '../lib/config';
import styles from './PricingCalculator.module.css';

// Find a rate in daily_metal_rates rows for a given carat string.
// Handles various metal_key naming conventions (gold_22k, gold_916, etc.)
function findDailyRate(carat, rows) {
  if (!rows?.length || !carat) return null;
  const g  = parseGoldCarat(carat);
  const sf = parseSilverFineness(carat);
  const pt = isPlatinum(carat);
  const match = rows.find(r => {
    const k = r.metal_key.toLowerCase().replace(/[\s-]/g, '_');
    if (pt) return k.includes('plat');
    if (g) {
      const purity = Math.round(g / 24 * 1000);
      return (
        k === `gold_${g}k` || k === `gold_${purity}` ||
        k.includes(`gold`) && (k.includes(`${g}k`) || k.includes(`${purity}`))
      );
    }
    if (sf) {
      const f = Math.round(sf * 1000);
      return k.includes('silver') && (k.includes(String(f)) || k === 'silver');
    }
    return false;
  });
  return match ? Number(match.rate_inr) : null;
}

// ── PricingCalculator ────────────────────────────────────────────────
// Embedded panel inside ProductModal. Owner enters today's rate, making
// charges, stones — gets a live breakdown they can paste into the price
// field. Modeled on how a real Indian jeweller calculates: metal cost
// (rate × purity × weight) + making charges + stones + hallmark + GST.
// ────────────────────────────────────────────────────────────────────

export default function PricingCalculator({
  open, weight, carat, onApply, onClose,
  initial = {},
}) {
  // ── State ─────────────────────────────────────────────────────────
  const [ratePerGram,    setRatePerGram]    = useState(initial.ratePerGram ?? '');
  const [making,         setMaking]         = useState(initial.making ?? '');
  const [makingMode,     setMakingMode]     = useState(initial.makingMode || 'per_gram');
  const [stoneWeightCt,  setStoneWeightCt]  = useState(initial.stoneWeightCt ?? '');
  const [stoneRatePerCt, setStoneRatePerCt] = useState(initial.stoneRatePerCt ?? '');
  const [flatStoneCost,  setFlatStoneCost]  = useState(initial.flatStoneCost ?? '');
  const [hallmarkFee,    setHallmarkFee]    = useState(initial.hallmarkFee ?? DEFAULT_HALLMARK_FEE);
  const [gstPct,         setGstPct]         = useState(initial.gstPct ?? GST_RATE * 100);
  const [liveRates,      setLiveRates]      = useState([]);
  const [usingLive,      setUsingLive]      = useState(false);

  // Fetch today's rates from daily_metal_rates when the calculator opens
  useEffect(() => {
    if (!open) return;
    db.from('daily_metal_rates')
      .select('rate_date, metal_key, rate_inr')
      .order('rate_date', { ascending: false })
      .limit(20)                              // latest date's rows (≤ ~10 metals)
      .then(({ data }) => {
        if (!data?.length) return;
        // Keep only the most recent date's rows
        const latest = data[0].rate_date;
        setLiveRates(data.filter(r => r.rate_date === latest));
      });
  }, [open]);

  // Helper: look up a rate from daily_metal_rates for a given carat string
  const liveRateFor = (c) => findDailyRate(c, liveRates);

  // Pre-fill rate from live DB rates (preferred), falling back to static defaults
  useEffect(() => {
    if (!ratePerGram && carat) {
      const live = liveRateFor(carat);
      if (live) { setRatePerGram(String(live)); setUsingLive(true); }
      else {
        const r = defaultRateFor(carat);
        if (r) { setRatePerGram(String(r)); setUsingLive(false); }
      }
    }
    // Pre-fill stone rate suggestion for lab-grown diamonds
    if (!stoneRatePerCt && /lab[- ]grown/i.test(carat || '')) {
      setStoneRatePerCt(String(DEFAULT_LAB_DIAMOND_RATE));
    }
  }, [carat, liveRates]);   // re-run when liveRates arrive after carat is already set

  const result = useMemo(() => calculatePrice({
    weight, carat,
    ratePerGram, making, makingMode,
    stoneWeightCt, stoneRatePerCt, flatStoneCost,
    hallmarkFee, gstPct,
  }), [weight, carat, ratePerGram, making, makingMode, stoneWeightCt, stoneRatePerCt, flatStoneCost, hallmarkFee, gstPct]);

  // ── Derived UI hints ──────────────────────────────────────────────
  const mt = metalType(carat);
  const goldK = parseGoldCarat(carat);
  const silverF = parseSilverFineness(carat);
  const isPt = isPlatinum(carat);
  const purityNote = mt === 'gold' && goldK
    ? `${goldK}K → purity factor ${(goldK/24).toFixed(3)} (= ${goldK}/24)`
    : mt === 'silver' && silverF
    ? `${(silverF*1000).toFixed(0)} fineness → purity factor ${silverF.toFixed(3)}`
    : isPt
    ? `Platinum → purity factor 0.950 (PT950 standard)`
    : 'Select a Gold Carat / Silver purity in the form above to begin.';

  const handleApply = () => {
    onApply?.(Math.round(result.total));
    onClose?.();
  };

  if (!open) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <Calculator size={15} color="#8B6914"/>
          <span>Pricing Calculator</span>
          <span className={styles.hint}>Indian jewellery formula · live</span>
        </div>
        {onClose && (
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={14}/>
          </button>
        )}
      </div>

      <div className={styles.formula}>
        <strong>Formula:</strong>{' '}
        <code>((Metal × Purity × Weight) + Making + Stones + Hallmark) × (1 + GST)</code>
      </div>

      <div className={styles.purityNote}>
        <Info size={11}/> {purityNote}
      </div>

      {/* ── Inputs ─────────────────────────────────────────────────── */}
      <div className={styles.row}>
        <div className={styles.field}>
          <label>Today's rate (₹/gram)</label>
          <div className={styles.rateRow}>
            <input
              type="number" inputMode="decimal" min="0" step="1"
              value={ratePerGram} onChange={e => setRatePerGram(e.target.value)}
              placeholder="e.g. 7150"
            />
            <button
              type="button"
              className={styles.refreshBtn}
              onClick={() => {
                const live = liveRateFor(carat);
                if (live) { setRatePerGram(String(live)); setUsingLive(true); }
                else { setRatePerGram(String(defaultRateFor(carat) || '')); setUsingLive(false); }
              }}
              title={liveRateFor(carat) ? 'Reset to your saved rate' : 'Reset to indicative default'}
            >
              <RefreshCw size={11}/>
            </button>
          </div>
          <small className={styles.smallHint}>
            For {carat || '—'} ·{' '}
            {usingLive
              ? 'Auto-filled from your saved rate (Dashboard → Today\'s Metal Rates)'
              : 'Enter today\'s market rate — save it on the Dashboard to auto-fill here next time'}
          </small>
        </div>
        <div className={styles.field}>
          <label>Weight (g)</label>
          <input value={weight || ''} disabled readOnly />
          <small className={styles.smallHint}>From the form above (auto-synced)</small>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label>Making charge mode</label>
          <select value={makingMode} onChange={e => setMakingMode(e.target.value)}>
            {MAKING_CHARGE_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label>Making charge value</label>
          <input
            type="number" inputMode="decimal" min="0"
            value={making} onChange={e => setMaking(e.target.value)}
            placeholder={makingMode === 'per_gram' ? 'e.g. 450' : makingMode === 'percent' ? 'e.g. 12' : 'e.g. 5000'}
          />
          <small className={styles.smallHint}>
            {makingMode === 'per_gram' && 'Charged per gram of metal'}
            {makingMode === 'percent'  && '% of the pure metal cost'}
            {makingMode === 'flat'     && 'Flat ₹ amount (handcraft, exclusive design, etc.)'}
          </small>
        </div>
      </div>

      <div className={styles.section}>Stones / Diamonds (optional)</div>
      <div className={styles.row3}>
        <div className={styles.field}>
          <label>Total stone weight (ct)</label>
          <input
            type="number" inputMode="decimal" min="0" step="0.01"
            value={stoneWeightCt} onChange={e => setStoneWeightCt(e.target.value)}
            placeholder="e.g. 0.50"
          />
        </div>
        <div className={styles.field}>
          <label>Stone rate (₹/carat)</label>
          <input
            type="number" inputMode="decimal" min="0"
            value={stoneRatePerCt} onChange={e => setStoneRatePerCt(e.target.value)}
            placeholder="e.g. 18000"
          />
        </div>
        <div className={styles.field}>
          <label>Other stone cost (₹)</label>
          <input
            type="number" inputMode="decimal" min="0"
            value={flatStoneCost} onChange={e => setFlatStoneCost(e.target.value)}
            placeholder="pearls, enamel…"
          />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label>Hallmark fee (₹)</label>
          <input
            type="number" inputMode="decimal" min="0"
            value={hallmarkFee} onChange={e => setHallmarkFee(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>GST (%)</label>
          <input
            type="number" inputMode="decimal" min="0" step="0.5"
            value={gstPct} onChange={e => setGstPct(e.target.value)}
          />
          <small className={styles.smallHint}>3% is the standard rate on gold/silver jewellery in India</small>
        </div>
      </div>

      {/* ── Breakdown ──────────────────────────────────────────────── */}
      <div className={styles.breakdown}>
        <Row label="Metal cost"                value={result.metalCost} />
        <Row label="Making charges"            value={result.makingCost} />
        <Row label="Stone / diamond cost"      value={result.stoneCost} />
        <Row label="Hallmark fee"              value={result.hallmark} />
        <div className={styles.brkLine}/>
        <Row label="Subtotal"                  value={result.subtotal} bold />
        <Row label={`GST @ ${Number(gstPct).toFixed(1)}%`} value={result.gst} />
        <div className={styles.brkLine}/>
        <Row label="FINAL PRICE" value={result.total} big />
      </div>

      <div className={styles.applyRow}>
        <button type="button" className="btn-gold" onClick={handleApply}>
          <Check size={13}/> Apply ₹{Math.round(result.total).toLocaleString('en-IN')} to Price field
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, bold, big }) {
  return (
    <div className={`${styles.brkRow} ${bold ? styles.brkBold : ''} ${big ? styles.brkBig : ''}`}>
      <span>{label}</span>
      <span>{fmtINR(value)}</span>
    </div>
  );
}
