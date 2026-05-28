import React, { useState, useEffect, useMemo } from 'react';
import { Calculator, X, Info, Check, Zap, Tag } from 'lucide-react';
import { calcJewelleryPrice, fmtINR, MAKING_CHARGE_MODES, DEFAULT_HALLMARK_FEE, DEFAULT_LAB_DIAMOND_RATE } from '../lib/pricing';
import { METAL_PURITY_GROUPS } from '../lib/config';
import { db } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import styles from './PricingCalculator.module.css';

const GOLD_OPTIONS   = METAL_PURITY_GROUPS.find(g => g.label === 'Gold Purity')?.options || [];
const SILVER_OPTIONS = METAL_PURITY_GROUPS.find(g => g.label === 'Silver Purity')?.options || [];

// Map a purity string to a metal_rates.metal_type key
function purityToMetalType(purity) {
  if (!purity) return null;
  const m = purity.match(/^(\d+)K/);
  if (m) {
    const k = Number(m[1]);
    const code = Math.round(k / 24 * 1000);
    return `gold_${code}`;
  }
  const s = purity.match(/^(\d{3})\s*Silver/i);
  if (s) return `silver_${s[1]}`;
  if (/plat/i.test(purity)) return 'platinum';
  return null;
}

// Look up rate in metal_rates rows; fallback to 999 purity if exact not found
function resolveRate(purity, rows) {
  if (!purity || !rows?.length) return 0;
  const targetKey = purityToMetalType(purity);
  if (!targetKey) return 0;

  // 1) Exact match
  const exact = rows.find(r => r.metal_type === targetKey);
  if (exact) return Number(exact.rate_per_gram);

  // 2) Derive from base (gold_999 or silver_999) using purity ratio
  const isGold   = targetKey.startsWith('gold');
  const isSilver = targetKey.startsWith('silver');
  const baseKey  = isGold ? 'gold_999' : isSilver ? 'silver_999' : null;
  if (!baseKey) return 0;

  const base = rows.find(r => r.metal_type === baseKey);
  if (!base) return 0;

  const targetPurity = Number(targetKey.split('_')[1]);   // e.g. 916
  const basePurity   = 999;
  return Number(base.rate_per_gram) * (targetPurity / basePurity);
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
  const { user } = useAuth();
  const [mode,         setMode]         = useState('dynamic');
  const [fixedPrice,   setFixedPrice]   = useState('');

  const [goldPurity,   setGoldPurity]   = useState('');
  const [goldGrams,    setGoldGrams]    = useState('');
  const [silverPurity, setSilverPurity] = useState('');
  const [silverGrams,  setSilverGrams]  = useState('');
  const [making,       setMaking]       = useState('');
  const [makingMode,   setMakingMode]   = useState('per_gram');
  const [wastage,      setWastage]      = useState('0');
  const [stoneWt,      setStoneWt]      = useState('');
  const [stoneRate,    setStoneRate]    = useState('');
  const [flatStone,    setFlatStone]    = useState('');
  const [hallmark,     setHallmark]     = useState(DEFAULT_HALLMARK_FEE);

  // Per-store metal_rates (is_current = true)
  const [metalRates,   setMetalRates]   = useState([]);

  // Fetch current rates from per-store metal_rates table
  useEffect(() => {
    if (!open || !user?.id) return;
    db.from('metal_rates')
      .select('metal_type, purity_factor, rate_per_gram')
      .eq('store_id', user.id)
      .eq('is_current', true)
      .then(({ data }) => setMetalRates(data || []));
  }, [open, user?.id]);

  // Pre-fill from product fields
  useEffect(() => {
    if (!carat) return;
    if (GOLD_OPTIONS.includes(carat)) {
      setGoldPurity(carat);
      setGoldGrams(weight ? String(weight) : '');
    } else if (SILVER_OPTIONS.includes(carat)) {
      setSilverPurity(carat);
      setSilverGrams(weight ? String(weight) : '');
    }
    if (!stoneRate && /lab[- ]grown/i.test(carat)) setStoneRate(String(DEFAULT_LAB_DIAMOND_RATE));
  }, [carat, weight]);

  const goldRpg   = useMemo(() => resolveRate(goldPurity,   metalRates), [goldPurity,   metalRates]);
  const silverRpg = useMemo(() => resolveRate(silverPurity, metalRates), [silverPurity, metalRates]);

  // Effective gold rate after wastage
  const goldRpgWithWastage = goldRpg * (1 + Number(wastage || 0) / 100);

  const result = useMemo(() => calcJewelleryPrice({
    goldGrams, goldRatePerGram: goldRpgWithWastage,
    silverGrams, silverRatePerGram: silverRpg,
    making, makingMode,
    stoneWeightCt: stoneWt, stoneRatePerCt: stoneRate, flatStoneCost: flatStone,
    hallmarkFee: hallmark,
  }), [goldGrams, goldRpgWithWastage, silverGrams, silverRpg, making, makingMode, stoneWt, stoneRate, flatStone, hallmark]);

  const applyTotal = mode === 'fixed' ? Number(fixedPrice) : result.total;

  const handleApply = () => {
    if (!applyTotal) return;
    // Pass back all fields so ProductModal can persist them to DB
    onApply?.({
      total:               Math.round(applyTotal),
      metalType:           purityToMetalType(goldPurity || silverPurity) || '',
      metalWeightGrams:    goldGrams || silverGrams || '',
      wastagePercent:      wastage || '0',
      makingChargeType:    makingMode,
      makingChargeValue:   making || '0',
      stoneValueInr:       String(result.stoneCost || 0),
      hallmarkCharge:      hallmark,
    });
    onClose?.();
  };

  if (!open) return null;

  const goldRow   = metalRates.find(r => r.metal_type === purityToMetalType(goldPurity));
  const silverRow = metalRates.find(r => r.metal_type === purityToMetalType(silverPurity));

  function RateHint({ purity, rpg, exactRow }) {
    if (!purity) return null;
    if (rpg === 0) return (
      <small className={styles.liveRate} style={{ color: '#d97706' }}>
        No rate in metal_rates — add it first
      </small>
    );
    return (
      <small className={styles.liveRate}>
        {exactRow
          ? <>Live: <strong>{fmtINR(rpg)}/g</strong> (exact match)</>
          : <>Derived from 999 base: <strong>{fmtINR(rpg)}/g</strong></>
        }
      </small>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <Calculator size={14} color="#8B6914"/>
          <span>Price Calculator</span>
        </div>
        {onClose && <button className={styles.closeBtn} onClick={onClose}><X size={13}/></button>}
      </div>

      <div className={styles.modeTabs}>
        <button type="button" className={`${styles.modeTab} ${mode==='fixed'?styles.modeTabActive:''}`} onClick={() => setMode('fixed')}>
          <Tag size={12}/> Fixed Price
        </button>
        <button type="button" className={`${styles.modeTab} ${mode==='dynamic'?styles.modeTabActive:''}`} onClick={() => setMode('dynamic')}>
          <Zap size={12}/> Dynamic (Formula)
        </button>
      </div>

      {/* ── Fixed ─────────────────────────────────────────────────── */}
      {mode === 'fixed' && (
        <div className={styles.fixedWrap}>
          <div className={styles.field}>
            <label>Final Price (₹ ex-GST)</label>
            <input type="number" min="0" className={styles.fixedInput} value={fixedPrice}
              onChange={e => setFixedPrice(e.target.value)} placeholder="e.g. 45000" autoFocus/>
          </div>
        </div>
      )}

      {/* ── Dynamic ───────────────────────────────────────────────── */}
      {mode === 'dynamic' && (
        <>
          <div className={styles.section}>Gold (optional)</div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Gold Purity</label>
              <select value={goldPurity} onChange={e => setGoldPurity(e.target.value)}>
                <option value="">— none —</option>
                {GOLD_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <RateHint purity={goldPurity} rpg={goldRpg} exactRow={goldRow}/>
            </div>
            <div className={styles.field}>
              <label>Gold Weight (grams)</label>
              <input type="number" min="0" step="0.01" value={goldGrams}
                onChange={e => setGoldGrams(e.target.value)} placeholder="e.g. 5.20"/>
            </div>
          </div>

          <div className={styles.section}>Silver (optional)</div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Silver Purity</label>
              <select value={silverPurity} onChange={e => setSilverPurity(e.target.value)}>
                <option value="">— none —</option>
                {SILVER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <RateHint purity={silverPurity} rpg={silverRpg} exactRow={silverRow}/>
            </div>
            <div className={styles.field}>
              <label>Silver Weight (grams)</label>
              <input type="number" min="0" step="0.01" value={silverGrams}
                onChange={e => setSilverGrams(e.target.value)} placeholder="e.g. 10.00"/>
            </div>
          </div>

          <div className={styles.section}>Making Charges</div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Wastage (%)</label>
              <input type="number" min="0" step="0.1" value={wastage} onChange={e => setWastage(e.target.value)} placeholder="e.g. 3"/>
              <small className={styles.smallHint}>Applied to gold rate only</small>
            </div>
            <div className={styles.field}>
              <label>Mode</label>
              <select value={makingMode} onChange={e => setMakingMode(e.target.value)}>
                {MAKING_CHARGE_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Making Charge Value</label>
              <input type="number" min="0" value={making} onChange={e => setMaking(e.target.value)}
                placeholder={makingMode==='per_gram'?'₹/gram':makingMode==='percent'?'% of metal cost':'Flat ₹'}/>
            </div>
          </div>

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

          <div className={styles.section}>Other Charges</div>
          <div style={{ maxWidth: '50%' }}>
            <div className={styles.field}>
              <label>Hallmark fee (₹)</label>
              <input type="number" min="0" value={hallmark} onChange={e => setHallmark(e.target.value)}/>
            </div>
          </div>

          <div className={styles.breakdown}>
            <Row label="Gold cost"        value={result.goldCost}   />
            <Row label="Silver cost"      value={result.silverCost} />
            <Row label="Making charges"   value={result.makingCost} />
            <Row label="Stone / diamond"  value={result.stoneCost}  />
            <Row label="Hallmark fee"     value={result.hallmark}   />
            <div className={styles.brkLine}/>
            <Row label="TOTAL (ex-GST)"   value={result.total}      big />
          </div>
          <div className={styles.gstNote}>
            <Info size={11}/> Price stored ex-GST. "+GST" is shown on product listings.
          </div>
        </>
      )}

      {applyTotal > 0 && (
        <div className={styles.applyRow}>
          <button type="button" className="btn-gold" onClick={handleApply}>
            <Check size={13}/> Apply ₹{Math.round(applyTotal).toLocaleString('en-IN')} to Price field
          </button>
        </div>
      )}
    </div>
  );
}
