import React, { useEffect, useState } from 'react';
import { X, Send, Tag } from 'lucide-react';
import { fmtINR } from '../lib/pricing';
import { pieceTypeToCategory } from '../lib/designTaxonomy';
import { CATEGORIES } from '../lib/config';
import styles from './PublishDesignDialog.module.css';

const catLabel = (value) => CATEGORIES.find(c => c.value === value)?.label || value || '—';

// Confirm step before a design becomes a catalog product. Auto-fills an
// editable SKU and item name; checks SKU uniqueness per owner (same rule
// the Inventory add/edit form uses).
export default function PublishDesignDialog({
  params, estimate, primaryRenderUrl, suggestedSku, checkSKU, publishing, onConfirm, onClose,
}) {
  const { category, sub_category } = pieceTypeToCategory(params.piece_type, params.earring_subtype);
  const suggestedName = [params.style, params.earring_subtype, params.piece_type].filter(Boolean).join(' ').trim();

  const [sku, setSku] = useState(suggestedSku || '');
  const [name, setName] = useState(suggestedName || 'New design');
  const [skuError, setSkuError] = useState('');

  useEffect(() => { setSku(suggestedSku || ''); }, [suggestedSku]);

  const handleSkuBlur = async () => {
    if (!sku.trim()) { setSkuError('SKU is required'); return; }
    const unique = await checkSKU(sku.trim());
    setSkuError(unique ? '' : 'SKU already exists — choose another');
  };

  const confirm = async () => {
    if (!sku.trim()) { setSkuError('SKU is required'); return; }
    const unique = await checkSKU(sku.trim());
    if (!unique) { setSkuError('SKU already exists — choose another'); return; }
    onConfirm({ sku: sku.trim(), name: name.trim() || 'New design', category, sub_category });
  };

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Publish to catalog</h2>
          <button className={styles.close} onClick={onClose}><X size={18} /></button>
        </div>

        <div className={styles.body}>
          <p className={styles.intro}>
            This creates a product in your inventory so the WhatsApp assistant and storefront
            can show it. You can edit everything later in Inventory.
          </p>

          <div className={styles.previewRow}>
            {primaryRenderUrl
              ? <img src={primaryRenderUrl} alt="render" className={styles.thumb} />
              : <div className={styles.thumbEmpty}><Tag size={20} /></div>}
            <div className={styles.previewMeta}>
              <div><span>Category</span><strong>{catLabel(category)}{sub_category ? ` · ${sub_category}` : ''}</strong></div>
              <div><span>Estimated price</span><strong>{estimate?.total ? fmtINR(estimate.total) : '—'}</strong></div>
            </div>
          </div>

          <div className="fld" style={{ marginTop: 4 }}>
            <label className="lbl">Item name</label>
            <input className="inp" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Temple Jhumka Earrings" />
          </div>

          <div className="fld" style={{ marginTop: 14 }}>
            <label className="lbl">SKU / Item code <span className="req">*</span></label>
            <input className="inp" value={sku}
              onChange={e => { setSku(e.target.value.toUpperCase()); setSkuError(''); }}
              onBlur={handleSkuBlur} placeholder="e.g. DSN-0001" />
            {skuError && <div className={styles.err}>{skuError}</div>}
          </div>
        </div>

        <div className={styles.footer}>
          <button className="btn-ghost" onClick={onClose} disabled={publishing}>Cancel</button>
          <button className="btn-gold" onClick={confirm} disabled={publishing || !!skuError}>
            {publishing ? <><div className="spinner spinner-sm" /> Publishing…</> : <><Send size={15} /> Publish</>}
          </button>
        </div>
      </div>
    </div>
  );
}
