import React, { useCallback, useState } from 'react';
import { Plus, Trash2, Zap, Tag, ChevronDown, ChevronUp } from 'lucide-react';
import { METAL_PURITY_GROUPS, DIAMOND_PURITIES } from '../lib/config';
import { DEFAULT_HALLMARK_FEE } from '../lib/pricing';
import DynamicPricingPanel from './DynamicPricingPanel';
import modalStyles from './ProductModal.module.css';
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

function newVariant(prefill = {}) {
  return {
    _key:               Math.random().toString(36).slice(2),
    id:                 null,
    carat:              prefill.carat              ?? '',
    color:              prefill.color              ?? 'Yellow Gold',
    customColor:        '',
    diamond_purity:     prefill.diamond_purity     ?? '',
    diamond_color:      prefill.diamond_color      ?? '',
    gross_weight:       prefill.gross_weight       ?? '',
    gold_purity:        prefill.gold_purity        ?? '',
    gold_weight_grams:  prefill.gold_weight_grams  ?? '',
    silver_purity:      prefill.silver_purity      ?? '',
    silver_weight_grams:prefill.silver_weight_grams?? '',
    wastage_percent:    prefill.wastage_percent     ?? 0,
    making_charge_type: prefill.making_charge_type ?? 'per_gram',
    making_charge_value:prefill.making_charge_value?? 0,
    hallmark_charge:    prefill.hallmark_charge     ?? DEFAULT_HALLMARK_FEE,
    diamond_cert_fee:   prefill.diamond_cert_fee   ?? 0,
    stone_value_inr:    prefill.stone_value_inr     ?? 0,
    dynamic_price:      prefill.dynamic_price       ?? false,
    fixed_price:        prefill.fixed_price         ?? '',
    price:              prefill.price               ?? '',
    is_in_stock:        true,
    sort_order:         0,
  };
}

// ── VariantEditor ─────────────────────────────────────────────────────
// Managed outside ProductModal state — parent calls onVariantsChange on
// every edit. Accepts variants[] (including existing saved rows) and fires
// onVariantsChange(newArray) on every mutation.
export default function VariantEditor({ variants, onVariantsChange, productId, productForm }) {
  const [expanded, setExpanded] = useState(null); // _key of expanded row


  const patch = useCallback((key, delta) => {
    onVariantsChange(variants.map(v => v._key === key ? { ...v, ...delta } : v));
  }, [variants, onVariantsChange]);

  const addRow = () => {
    // Pre-fill from parent product so owner only changes the differentiator
    const prefill = productForm ? {
      carat:               productForm.gold_carat        || productForm.gold_purity || '',
      diamond_purity:      productForm.diamond_purity     || '',
      diamond_color:       productForm.diamond_color      || '',
      gold_purity:         productForm.gold_purity        || '',
      gold_weight_grams:   productForm.gold_weight_grams  || '',
      silver_purity:       productForm.silver_purity      || '',
      silver_weight_grams: productForm.silver_weight_grams|| '',
      gross_weight:        productForm.weight              || '',
      wastage_percent:     productForm.wastage_percent     ?? 0,
      making_charge_type:  productForm.making_charge_type  || 'per_gram',
      making_charge_value: productForm.making_charge_value ?? 0,
      hallmark_charge:     productForm.hallmark_charge     ?? DEFAULT_HALLMARK_FEE,
      diamond_cert_fee:    productForm.diamond_cert_fee    ?? 0,
      stone_value_inr:     productForm.stone_value_inr     ?? 0,
      dynamic_price:       productForm.dynamic_price       ?? false,
      fixed_price:         productForm.fixed_price         || '',
      price:               productForm.price               || '',
    } : {};
    const v = newVariant(prefill);
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
function VariantRow({ variant: v, index, expanded, onToggle, onChange, onRemove }) {
  const colorMeta = VARIANT_COLORS.find(c => c.value === v.color);
  const isCustomColor = v.color === '__custom__' || (v.color && !VARIANT_COLORS.find(c => c.value === v.color));
  const displayColor = isCustomColor ? (v.customColor || 'Custom') : (v.color || '—');

  const displayPrice = v.dynamic_price
    ? (v.price ? '₹' + Number(v.price).toLocaleString('en-IN') : '—')
    : (v.fixed_price ? '₹' + Number(v.fixed_price).toLocaleString('en-IN') : '—');

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

      {/* ── Detail panel (expanded) — mirrors main product form layout ── */}
      {expanded && (
        <div className={styles.detail}>

          {/* Color — same chip row as main product */}
          <div className="fld">
            <label className="lbl">Color</label>
            <div className={modalStyles.colorRow}>
              {VARIANT_COLORS.map(c => {
                const isActive = v.color === c.value;
                return (
                  <button key={c.value} type="button" title={c.label}
                    className={`${modalStyles.colorChip} ${isActive ? modalStyles.colorChipActive : ''}`}
                    onClick={() => onChange({ color: isActive ? '' : c.value, customColor: '' })}>
                    {c.hex
                      ? <span className={modalStyles.colorCircle} style={{ background: c.hex }}/>
                      : <span className={modalStyles.colorCircleTwoTone}/>
                    }
                    {c.label}
                  </button>
                );
              })}
              <button type="button" className={modalStyles.colorChipCustom}
                onClick={() => {
                  const c = window.prompt('Enter custom color name:');
                  if (c?.trim()) onChange({ color: '__custom__', customColor: c.trim() });
                }}>+ Custom</button>
            </div>
            {isCustomColor && (
              <input className="inp" style={{ marginTop: 6 }}
                value={v.customColor || ''}
                onChange={e => onChange({ customColor: e.target.value, color: '__custom__' })}
                placeholder="e.g. Green Gold, Rhodium Plated…"
                autoFocus
              />
            )}
          </div>

          {/* Carat — always visible (shown in summary bar) */}
          <div className="fld" style={{ marginTop: 12 }}>
            <label className="lbl">Metal Purity / Carat</label>
            <select className="inp" value={v.carat} onChange={e => onChange({ carat: e.target.value })}>
              <option value="">Select purity…</option>
              {METAL_PURITY_GROUPS.map(g => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map(o => <option key={o} value={o}>{o}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Diamond fields */}
          <div className="fg fg2" style={{ marginTop: 12 }}>
            <div className="fld">
              <label className="lbl">Diamond Purity</label>
              <select className="inp" value={v.diamond_purity || ''} onChange={e => onChange({ diamond_purity: e.target.value })}>
                <option value="">None / N/A</option>
                {DIAMOND_PURITIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="fld">
              <label className="lbl">Diamond Color</label>
              <input className="inp"
                value={v.diamond_color || ''}
                onChange={e => onChange({ diamond_color: e.target.value })}
                placeholder="e.g. D, E, F, G, H…"
              />
            </div>
          </div>

          {/* Pricing mode toggle */}
          <div className="sec-label" style={{ marginTop: 16 }}>Pricing</div>

          <div className={modalStyles.priceModeRow}>
            <button type="button"
              className={`${modalStyles.priceModeBtn} ${!v.dynamic_price ? modalStyles.priceModeBtnActive : ''}`}
              onClick={() => onChange({ dynamic_price: false })}>
              <Tag size={13}/> Fixed Price
              <small>Owner enters one final number</small>
            </button>
            <button type="button"
              className={`${modalStyles.priceModeBtn} ${v.dynamic_price ? modalStyles.priceModeBtnActive : ''}`}
              onClick={() => onChange({ dynamic_price: true })}>
              <Zap size={13}/> Dynamic Pricing
              <small>Auto-updates with daily metal rates</small>
            </button>
          </div>

          {!v.dynamic_price ? (
            /* Fixed mode — just a price input, same as main product */
            <div style={{ marginTop: 12 }}>
              <div className="fld">
                <label className="lbl">Price (₹ ex-GST)</label>
                <input className="inp" type="number" min="0"
                  value={v.fixed_price}
                  onChange={e => onChange({ fixed_price: e.target.value, price: e.target.value })}
                  placeholder="e.g. 45000"/>
              </div>
            </div>
          ) : (
            /* Dynamic mode — weight/purity inputs live inside DynamicPricingPanel,
               exactly like the main product form */
            <>
              <DynamicPricingPanel
                value={v}
                onChange={delta => onChange(delta)}
                onTotalChange={(total, snapshot) => {
                  onChange({
                    price: total ? String(total) : '',
                    ...snapshot,
                  });
                }}
              />
              <div className={modalStyles.priceSnapshot}>
                <span>Computed Price</span>
                <strong>₹{v.price ? Number(v.price).toLocaleString('en-IN') : '—'}</strong>
                <small>auto-recomputed from today's rates</small>
              </div>
            </>
          )}

          {/* Stock toggle */}
          <label className={modalStyles.stockToggle} style={{ marginTop: 14 }}>
            <input type="checkbox" checked={v.is_in_stock}
              onChange={e => onChange({ is_in_stock: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: 'var(--navy)' }}/>
            Mark as currently in stock
          </label>
        </div>
      )}
    </div>
  );
}

