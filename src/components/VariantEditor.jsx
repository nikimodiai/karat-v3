import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Zap, Tag, ChevronDown, ChevronUp } from 'lucide-react';
import { METAL_PURITY_GROUPS, db } from '../lib/config';
import {
  MAKING_CHARGE_MODES, calcJewelleryPrice, fmtINR,
  purityToMetalType, resolveMetalRate, DEFAULT_HALLMARK_FEE,
} from '../lib/pricing';
import styles from './VariantEditor.module.css';

// ── Constants ────────────────────────────────────────────────────────
export const VARIANT_COLORS = [
  { value: 'Yellow Gold', label: 'Yellow Gold', hex: '#C9A84C' },
  { value: 'Rose Gold',   label: 'Rose Gold',   hex: '#B76E79' },
  { value: 'White Gold',  label: 'White Gold',  hex: '#D0D0D0' },
  { value: 'Two-Tone',    label: 'Two-Tone',    hex: null },
  { value: 'Silver',      label: 'Silver',      hex: '#A8A9AD' },
];

const ALL_PURITY_OPTIONS = METAL_PURITY_GROUPS.flatMap(g =>
  g.options.map(o => ({ group: g.label, value: o }))
);

function newVariant() {
  return {
    _key:               Math.random().toString(36).slice(2),
    id:                 null,           // null = not yet saved to DB
    carat:              '',
    color:              'Yellow Gold',
    customColor:        '',
    gross_weight:       '',
    gold_purity:        '',
    gold_weight_grams:  '',
    silver_purity:      '',
    silver_weight_grams:'',
    wastage_percent:    0,
    making_charge_type: 'per_gram',
    making_charge_value:0,
    hallmark_charge:    DEFAULT_HALLMARK_FEE,
    stone_value_inr:    0,
    dynamic_price:      false,
    fixed_price:        '',
    price:              '',
    is_in_stock:        true,
    sort_order:         0,
  };
}

// ── VariantEditor ─────────────────────────────────────────────────────
// Managed outside ProductModal state — parent calls onVariantsChange on
// every edit. Accepts variants[] (including existing saved rows) and fires
// onVariantsChange(newArray) on every mutation.
export default function VariantEditor({ variants, onVariantsChange, productId }) {
  const [expanded, setExpanded] = useState(null); // _key of expanded row

  // Fetch live rates once for per-variant dynamic pricing
  const [rates, setRates] = useState([]);
  useEffect(() => {
    db.from('daily_metal_rates')
      .select('rate_date, metal_key, rate_inr')
      .order('rate_date', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        const rows = data || [];
        if (!rows.length) return;
        const latest = rows[0].rate_date;
        setRates(
          rows
            .filter(r => r.rate_date === latest)
            .map(r => ({ metal_type: r.metal_key.replace(/_pm$/i, ''), rate_per_gram: Number(r.rate_inr) }))
        );
      });
  }, []);

  const patch = useCallback((key, delta) => {
    onVariantsChange(variants.map(v => v._key === key ? { ...v, ...delta } : v));
  }, [variants, onVariantsChange]);

  const addRow = () => {
    const v = newVariant();
    v.sort_order = variants.length;
    onVariantsChange([...variants, v]);
    setExpanded(v._key);
  };

  const removeRow = (key) => {
    onVariantsChange(variants.filter(v => v._key !== key));
    if (expanded === key) setExpanded(null);
  };

  return (
    <div className={styles.editor}>
      {variants.length === 0 && (
        <p className={styles.empty}>
          No variants yet. The product's default purity &amp; price are used.
          Add a variant to offer this design in multiple carats or colors.
        </p>
      )}

      {variants.map((v, idx) => (
        <VariantRow
          key={v._key}
          variant={v}
          index={idx}
          expanded={expanded === v._key}
          rates={rates}
          onToggle={() => setExpanded(expanded === v._key ? null : v._key)}
          onChange={delta => patch(v._key, delta)}
          onRemove={() => removeRow(v._key)}
        />
      ))}

      <button type="button" className={styles.addBtn} onClick={addRow}>
        <Plus size={13}/> Add variant
      </button>
    </div>
  );
}

// ── Single variant row ───────────────────────────────────────────────
function VariantRow({ variant: v, index, expanded, rates, onToggle, onChange, onRemove }) {
  const colorMeta = VARIANT_COLORS.find(c => c.value === v.color);
  const isCustomColor = v.color === '__custom__' || (v.color && !VARIANT_COLORS.find(c => c.value === v.color));
  const displayColor = isCustomColor ? (v.customColor || 'Custom') : (v.color || '—');

  // Live price calc for dynamic rows
  const goldInfo   = useMemo(() => resolveMetalRate(v.gold_purity,   rates), [v.gold_purity,   rates]);
  const silverInfo = useMemo(() => resolveMetalRate(v.silver_purity, rates), [v.silver_purity, rates]);
  const goldRpg    = goldInfo.rate * (1 + (Number(v.wastage_percent) || 0) / 100);

  const dynResult  = useMemo(() => calcJewelleryPrice({
    goldGrams:          v.gold_weight_grams,   goldRatePerGram:   goldRpg,
    silverGrams:        v.silver_weight_grams, silverRatePerGram: silverInfo.rate,
    making:             v.making_charge_value, makingMode:        v.making_charge_type,
    stoneWeightCt: 0, stoneRatePerCt: 0, flatStoneCost: v.stone_value_inr || 0,
    hallmarkFee:        v.hallmark_charge,
  }), [v.gold_weight_grams, goldRpg, v.silver_weight_grams, silverInfo.rate,
       v.making_charge_value, v.making_charge_type, v.stone_value_inr, v.hallmark_charge]);

  // Keep price synced in dynamic mode
  useEffect(() => {
    if (v.dynamic_price && dynResult.total) {
      onChange({ price: String(Math.round(dynResult.total)) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.dynamic_price, dynResult.total]);

  const displayPrice = v.dynamic_price
    ? (dynResult.total ? fmtINR(Math.round(dynResult.total)) : '—')
    : (v.fixed_price   ? fmtINR(Number(v.fixed_price))       : '—');

  return (
    <div className={`${styles.row} ${expanded ? styles.rowExpanded : ''}`}>
      {/* ── Summary bar (always visible) ── */}
      <div className={styles.summary} onClick={onToggle}>
        <span className={styles.varIdx}>#{index + 1}</span>

        {/* Color swatch */}
        {colorMeta?.hex
          ? <span className={styles.swatch} style={{ background: colorMeta.hex }}/>
          : <span className={styles.swatchTwoTone}/>
        }

        <span className={styles.varName}>
          {v.carat || <em>No carat</em>}
          {v.color && <span className={styles.colorLabel}>&nbsp;·&nbsp;{displayColor}</span>}
        </span>

        {v.gross_weight && (
          <span className={styles.varMeta}>{v.gross_weight}g</span>
        )}

        <span className={styles.varPrice}>{displayPrice}</span>

        <span className={`${styles.stockDot} ${v.is_in_stock ? styles.stockIn : styles.stockOut}`}
              title={v.is_in_stock ? 'In stock' : 'Sold out'}/>

        <button type="button" className={styles.removeBtn}
          onClick={e => { e.stopPropagation(); onRemove(); }}
          title="Remove variant">
          <Trash2 size={12}/>
        </button>

        <span className={styles.chevron}>
          {expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
        </span>
      </div>

      {/* ── Detail panel (expanded) ── */}
      {expanded && (
        <div className={styles.detail}>
          {/* Row 1: Carat + Color */}
          <div className={styles.dRow}>
            <div className={styles.dField}>
              <label>Carat / Purity</label>
              <select value={v.carat} onChange={e => onChange({ carat: e.target.value })}>
                <option value="">Select…</option>
                {METAL_PURITY_GROUPS.map(g => (
                  <optgroup key={g.label} label={g.label}>
                    {g.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className={styles.dField}>
              <label>Color</label>
              <div className={styles.colorRow}>
                {VARIANT_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    className={`${styles.colorBtn} ${v.color === c.value ? styles.colorBtnActive : ''}`}
                    onClick={() => onChange({ color: c.value, customColor: '' })}
                  >
                    {c.hex
                      ? <span className={styles.colorCircle} style={{ background: c.hex }}/>
                      : <TwoToneCircle active={v.color === c.value}/>
                    }
                    <span>{c.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className={`${styles.colorBtn} ${isCustomColor ? styles.colorBtnActive : ''}`}
                  onClick={() => onChange({ color: '__custom__' })}
                >
                  <span className={styles.colorCircleCustom}>+</span>
                  <span>Custom</span>
                </button>
              </div>
              {isCustomColor && (
                <input className={styles.customColorInput}
                  value={v.customColor || ''}
                  onChange={e => onChange({ customColor: e.target.value, color: '__custom__' })}
                  placeholder="e.g. Green Gold, Rhodium Plated…"
                  autoFocus
                />
              )}
            </div>
          </div>

          {/* Row 2: Weights */}
          <div className={styles.dRow3}>
            <div className={styles.dField}>
              <label>Total Weight (g)</label>
              <input type="number" min="0" step="0.001" value={v.gross_weight}
                onChange={e => onChange({ gross_weight: e.target.value })} placeholder="e.g. 4.20"/>
            </div>
            <div className={styles.dField}>
              <label>Gold Weight (g)</label>
              <input type="number" min="0" step="0.001" value={v.gold_weight_grams}
                onChange={e => onChange({ gold_weight_grams: e.target.value })} placeholder="e.g. 3.80"/>
            </div>
            <div className={styles.dField}>
              <label>Silver Weight (g)</label>
              <input type="number" min="0" step="0.001" value={v.silver_weight_grams}
                onChange={e => onChange({ silver_weight_grams: e.target.value })} placeholder="optional"/>
            </div>
          </div>

          {/* Row 3: Gold purity + silver purity */}
          <div className={styles.dRow}>
            <div className={styles.dField}>
              <label>Gold Purity</label>
              <select value={v.gold_purity} onChange={e => onChange({ gold_purity: e.target.value })}>
                <option value="">— none —</option>
                {METAL_PURITY_GROUPS.find(g => g.label === 'Gold Purity')?.options.map(o =>
                  <option key={o} value={o}>{o}</option>
                )}
              </select>
            </div>
            <div className={styles.dField}>
              <label>Silver Purity</label>
              <select value={v.silver_purity} onChange={e => onChange({ silver_purity: e.target.value })}>
                <option value="">— none —</option>
                {METAL_PURITY_GROUPS.find(g => g.label === 'Silver Purity')?.options.map(o =>
                  <option key={o} value={o}>{o}</option>
                )}
              </select>
            </div>
          </div>

          {/* Row 4: Making charges */}
          <div className={styles.dRow3}>
            <div className={styles.dField}>
              <label>Wastage % (gold)</label>
              <input type="number" min="0" step="0.1" value={v.wastage_percent}
                onChange={e => onChange({ wastage_percent: e.target.value })} placeholder="0"/>
            </div>
            <div className={styles.dField}>
              <label>Making mode</label>
              <select value={v.making_charge_type}
                onChange={e => onChange({ making_charge_type: e.target.value })}>
                {MAKING_CHARGE_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className={styles.dField}>
              <label>Making value</label>
              <input type="number" min="0" value={v.making_charge_value}
                onChange={e => onChange({ making_charge_value: e.target.value })}
                placeholder={v.making_charge_type === 'per_gram' ? '₹/g' : v.making_charge_type === 'percent' ? '%' : '₹ flat'}/>
            </div>
          </div>

          {/* Row 5: Hallmark + Stone */}
          <div className={styles.dRow}>
            <div className={styles.dField}>
              <label>Hallmark fee (₹)</label>
              <input type="number" min="0" value={v.hallmark_charge}
                onChange={e => onChange({ hallmark_charge: e.target.value })}/>
            </div>
            <div className={styles.dField}>
              <label>Stone / other cost (₹)</label>
              <input type="number" min="0" value={v.stone_value_inr}
                onChange={e => onChange({ stone_value_inr: e.target.value })} placeholder="0"/>
            </div>
          </div>

          {/* Row 6: Pricing mode */}
          <div className={styles.pricingModeRow}>
            <button type="button"
              className={`${styles.modeBtn} ${!v.dynamic_price ? styles.modeBtnActive : ''}`}
              onClick={() => onChange({ dynamic_price: false })}>
              <Tag size={11}/> Fixed Price
            </button>
            <button type="button"
              className={`${styles.modeBtn} ${v.dynamic_price ? styles.modeBtnActive : ''}`}
              onClick={() => onChange({ dynamic_price: true })}>
              <Zap size={11}/> Dynamic
            </button>
          </div>

          {!v.dynamic_price ? (
            <div className={styles.dField} style={{ marginTop: 8 }}>
              <label>Price (₹ ex-GST)</label>
              <input type="number" min="0"
                value={v.fixed_price}
                onChange={e => onChange({ fixed_price: e.target.value, price: e.target.value })}
                placeholder="e.g. 45000"/>
            </div>
          ) : (
            <div className={styles.dynPreview}>
              <div className={styles.dynRow}>
                <span>Gold cost</span><span>{fmtINR(dynResult.goldCost)}</span>
              </div>
              <div className={styles.dynRow}>
                <span>Silver cost</span><span>{fmtINR(dynResult.silverCost)}</span>
              </div>
              <div className={styles.dynRow}>
                <span>Making</span><span>{fmtINR(dynResult.makingCost)}</span>
              </div>
              <div className={styles.dynRow}>
                <span>Stones + Hallmark</span>
                <span>{fmtINR((dynResult.stoneCost || 0) + (dynResult.hallmark || 0))}</span>
              </div>
              <div className={`${styles.dynRow} ${styles.dynTotal}`}>
                <span>Total (ex-GST)</span>
                <strong>{dynResult.total ? fmtINR(Math.round(dynResult.total)) : '—'}</strong>
              </div>
            </div>
          )}

          {/* Stock toggle */}
          <label className={styles.stockToggle}>
            <input type="checkbox" checked={v.is_in_stock}
              onChange={e => onChange({ is_in_stock: e.target.checked })}
              style={{ width: 15, height: 15, accentColor: 'var(--navy)' }}/>
            In stock
          </label>
        </div>
      )}
    </div>
  );
}

function TwoToneCircle({ active }) {
  return (
    <span className={styles.twoToneCircle} style={{
      background: 'linear-gradient(135deg, #C9A84C 50%, #D0D0D0 50%)',
      outline: active ? '2px solid var(--navy)' : 'none',
    }}/>
  );
}
