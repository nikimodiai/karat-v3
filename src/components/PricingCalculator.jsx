import React, { useState, useEffect, useMemo } from 'react';
import { Calculator, X, Info, Check, Zap, Tag } from 'lucide-react';
import { calcJewelleryPrice, fmtINR, MAKING_CHARGE_MODES, DEFAULT_HALLMARK_FEE, DEFAULT_LAB_DIAMOND_RATE } from '../lib/pricing';
import { METAL_PURITY_GROUPS } from '../lib/config';
import { db } from '../lib/config';
import styles from './PricingCalculator.module.css';

const GOLD_OPTIONS   = METAL_PURITY_GROUPS.find(g => g.label === 'Gold Purity')?.options || [];
const SILVER_OPTIONS = METAL_PURITY_GROUPS.find(g => g.label === 'Silver Purity')?.options || [];

// Map a purity string to a daily_metal_rates metal_key for live rate lookup
function purityToKey(purity) {
  if (!purity) return null;
  const m = purity.match(/^(\d+)K/);
  if (m) {
    const k = Number(m[1]);
    const code = Math.round(k / 24 * 1000);
    const map = { 24: 'gold_999', 22: 'gold_916', 18: 'gold_750', 14: 'gold_585', 9: 'gold_375' };
    return map[k] || `gold_${code}`;
  }
  const s = purity.match(/^(\d{3})\s*Silver/i);
  if (s) return `silver_${s[1]}`;
  if (/plat/i.test(purity)) return 'platinum';
  return null;
}

// Find a row in daily_metal_rates that matches a purity string
function findRate(purity, rows) {
  if (!purity || !rows?.length) return null;
  const key = purityToKey(purity);
  if (!key) return null;
  // Exact match first
  let found = rows.find(r => r.metal_key === key);
  if (found) return found;
  // Fuzzy: same metal family + purity number contained in key
  const [family, num] = key.split('_');
  found = rows.find(r => r.metal_key.startsWith(family) && r.metal_key.includes(num || ''));
  return found ?? null;
}

// Convert daily_metal_rates.rate_inr to ₹ per gram
function ratePerGram(row) {
  if (!row) return 0;
  return /silver/i.test(row.metal_key) ? row.rate_inr / 1000 : row.rate_inr / 10;
}

function Row({ label, value, bold, big }) {
  if (!value) return null;
  return (
    <div className={`${styles.brkRow} ${bold ? styles.brkBold : ''} ${big ? styles.brkBig : ''}`}>
      <span>{label}</span>
      <span>{fmtINR(value)}</span>
    </div>
  );
}

export default function PricingCalculator({ open, weight, carat, onApply, onClose }) {
  const [mode,         setMode]         = useState('dynamic'); // 'fixed' | 'dynamic'
  const [fixedPrice,   setFixedPrice]   = useState('');

  // Dynamic fields
  const [goldPurity,   setGoldPurity]   = useState('');
  const [goldGrams,    setGoldGrams]    = useState('');
  const [silverPurity, setSilverPurity] = useState('');
  const [silverGrams,  setSilverGrams]  = useState('');
  const [making,       setMaking]       = useState('');
  const [makingMode,   setMakingMode]   = useState('per_gram');
  const [stoneWt,      setStoneWt]      = useState('');
  const [stoneRate,    setStoneRate]    = useState('');
  const [flatStone,    setFlatStone]    = useState('');
  const [hallmark,     setHallmark]     = useState(DEFAULT_HALLMARK_FEE);

  const [liveRates,    setLiveRates]    = useState([]);

  // Fetch live rates from daily_metal_rates when calculator opens
  useEffect(() => {
    if (!open) return;
    db.from('daily_metal_rates')
      .select('rate_date, metal_key, rate_inr')
      .order('rate_date', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!data?.length) return;
        const latest = data[0].rate_date;
        setLiveRates(data.filter(r => r.rate_date === latest));
      });
  }, [open]);

  // Pre-fill gold/silver purity and grams from the product's carat + weight
  useEffect(() => {
    if (!carat) return;
    const isGold   = GOLD_OPTIONS.includes(carat);
    const isSilver = SILVER_OPTIONS.includes(carat);
    if (isGold)   { setGoldPurity(carat);   setGoldGrams(weight ? String(weight) : ''); }
    if (isSilver) { setSilverPurity(carat); setSilverGrams(weight ? String(weight) : ''); }
    // Pre-fill lab diamond stone rate
    if (!stoneRate && /lab[- ]grown/i.test(carat)) setStoneRate(String(DEFAULT_LAB_DIAMOND_RATE));
  }, [carat, weight]);

  // Derived live rates per gram
  const goldRow   = useMemo(() => findRate(goldPurity,   liveRates), [goldPurity,   liveRates]);
  const silverRow = useMemo(() => findRate(silverPurity, liveRates), [silverPurity, liveRates]);
  const goldRpg   = ratePerGram(goldRow);
  const silverRpg = ratePerGram(silverRow);

  // Live calculation
  const result = useMemo(() => calcJewelleryPrice({
    goldGrams: goldGrams, goldRatePerGram: goldRpg,
    silverGrams: silverGrams, silverRatePerGram: silverRpg,
    making, makingMode,
    stoneWeightCt: stoneWt, stoneRatePerCt: stoneRate, flatStoneCost: flatStone,
    hallmarkFee: hallmark,
  }), [goldGrams, goldRpg, silverGrams, silverRpg, making, makingMode, stoneWt, stoneRate, flatStone, hallmark]);

  const applyTotal = mode === 'fixed' ? Number(fixedPrice) : result.total;

  if (!open) return null;

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <Calculator size={14} color="#8B6914"/>
          <span>Price Calculator</span>
        </div>
        {onClose && (
          <button className={styles.closeBtn} onClick={onClose}><X size={13}/></button>
        )}
      </div>

      {/* Mode tabs */}
      <div className={styles.modeTabs}>
        <button
          type="button"
          className={`${styles.modeTab} ${mode === 'fixed' ? styles.modeTabActive : ''}`}
          onClick={() => setMode('fixed')}
        >
          <Tag size={12}/> Fixed Price
        </button>
        <button
          type="button"
          className={`${styles.modeTab} ${mode === 'dynamic' ? styles.modeTabActive : ''}`}
          onClick={() => setMode('dynamic')}
        >
          <Zap size={12}/> Dynamic (Formula)
        </button>
      </div>

      {/* ── Fixed mode ────────────────────────────────────────────── */}
      {mode === 'fixed' && (
        <div className={styles.fixedWrap}>
          <div className={styles.field}>
            <label>Final Price (₹ ex-GST)</label>
            <input
              type="number" min="0"
              className={styles.fixedInput}
              value={fixedPrice}
              onChange={e => setFixedPrice(e.target.value)}
              placeholder="e.g. 45000"
              autoFocus
            />
            <small className={styles.smallHint}>Enter the price you want to set directly</small>
          </div>
        </div>
      )}

      {/* ── Dynamic mode ──────────────────────────────────────────── */}
      {mode === 'dynamic' && (
        <>
          {/* Gold section */}
          <div className={styles.section}>Gold (optional)</div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Gold Purity</label>
              <select value={goldPurity} onChange={e => setGoldPurity(e.target.value)}>
                <option value="">— none —</option>
                {GOLD_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {goldPurity && (
                <small className={styles.liveRate}>
                  {goldRow
                    ? <>Live: {fmtINR(goldRow.rate_inr)}/10g → <strong>{fmtINR(goldRpg)}/g</strong></>
                    : <span style={{color:'#d97706'}}>Rate not in daily_metal_rates</span>}
                </small>
              )}
            </div>
            <div className={styles.field}>
              <label>Gold Weight (grams)</label>
              <input
                type="number" min="0" step="0.01"
                value={goldGrams}
                onChange={e => setGoldGrams(e.target.value)}
                placeholder="e.g. 5.20"
              />
            </div>
          </div>

          {/* Silver section */}
          <div className={styles.section}>Silver (optional)</div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Silver Purity</label>
              <select value={silverPurity} onChange={e => setSilverPurity(e.target.value)}>
                <option value="">— none —</option>
                {SILVER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {silverPurity && (
                <small className={styles.liveRate}>
                  {silverRow
                    ? <>Live: {fmtINR(silverRow.rate_inr)}/kg → <strong>{fmtINR(silverRpg)}/g</strong></>
                    : <span style={{color:'#d97706'}}>Rate not in daily_metal_rates</span>}
                </small>
              )}
            </div>
            <div className={styles.field}>
              <label>Silver Weight (grams)</label>
              <input
                type="number" min="0" step="0.01"
                value={silverGrams}
                onChange={e => setSilverGrams(e.target.value)}
                placeholder="e.g. 10.00"
              />
            </div>
          </div>

          {/* Making charges */}
          <div className={styles.section}>Making Charges</div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Mode</label>
              <select value={makingMode} onChange={e => setMakingMode(e.target.value)}>
                {MAKING_CHARGE_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Value</label>
              <input
                type="number" min="0"
                value={making}
                onChange={e => setMaking(e.target.value)}
                placeholder={makingMode === 'per_gram' ? 'e.g. 450' : makingMode === 'percent' ? 'e.g. 12' : 'e.g. 5000'}
              />
              <small className={styles.smallHint}>
                {makingMode === 'per_gram' && 'Per gram of total metal (gold + silver)'}
                {makingMode === 'percent'  && '% of total metal cost'}
                {makingMode === 'flat'     && 'Flat ₹ amount'}
              </small>
            </div>
          </div>

          {/* Stones / Diamonds */}
          <div className={styles.section}>Stones / Diamonds (optional)</div>
          <div className={styles.row3}>
            <div className={styles.field}>
              <label>Stone weight (ct)</label>
              <input type="number" min="0" step="0.01" value={stoneWt} onChange={e => setStoneWt(e.target.value)} placeholder="e.g. 0.50"/>
            </div>
            <div className={styles.field}>
              <label>Rate (₹/carat)</label>
              <input type="number" min="0" value={stoneRate} onChange={e => setStoneRate(e.target.value)} placeholder="e.g. 18000"/>
            </div>
            <div className={styles.field}>
              <label>Other stone cost (₹)</label>
              <input type="number" min="0" value={flatStone} onChange={e => setFlatStone(e.target.value)} placeholder="pearls, enamel…"/>
            </div>
          </div>

          {/* Other charges */}
          <div className={styles.section}>Other Charges</div>
          <div className={styles.row} style={{ maxWidth: '50%' }}>
            <div className={styles.field}>
              <label>Hallmark fee (₹)</label>
              <input type="number" min="0" value={hallmark} onChange={e => setHallmark(e.target.value)}/>
            </div>
          </div>

          {/* Breakdown */}
          <div className={styles.breakdown}>
            <Row label="Gold cost"         value={result.goldCost}   />
            <Row label="Silver cost"       value={result.silverCost} />
            <Row label="Making charges"    value={result.makingCost} />
            <Row label="Stone / diamond"   value={result.stoneCost}  />
            <Row label="Hallmark fee"      value={result.hallmark}   />
            <div className={styles.brkLine}/>
            <Row label="TOTAL (ex-GST)"    value={result.total}      big />
          </div>
          <div className={styles.gstNote}>
            <Info size={11}/> Price stored ex-GST. "+GST" is shown on product listings.
          </div>
        </>
      )}

      {/* Apply button */}
      {applyTotal > 0 && (
        <div className={styles.applyRow}>
          <button type="button" className="btn-gold" onClick={() => { onApply?.(Math.round(applyTotal)); onClose?.(); }}>
            <Check size={13}/> Apply ₹{Math.round(applyTotal).toLocaleString('en-IN')} to Price field
          </button>
        </div>
      )}
    </div>
  );
}
