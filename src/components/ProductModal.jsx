import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Upload, Trash2, Tag, Zap, Image as ImageIcon, Layers, Sparkles, Camera, ChevronDown, ChevronUp, Gem, Award, Maximize2, Share2, Copy, Check } from 'lucide-react';
import { shareImageFile } from '../lib/imageUtils';
import {
  CATEGORIES, SUBCATEGORY_MAP, METAL_PURITY_GROUPS, DIAMOND_PURITIES,
  SILVER_CATEGORIES, MAX_IMAGE_BYTES, db,
} from '../lib/config';

const ALL_METAL_OPTIONS = METAL_PURITY_GROUPS.flatMap(g => g.options);
import DynamicPricingPanel from './DynamicPricingPanel';
import VariantEditor, { VARIANT_COLORS } from './VariantEditor';
import AIModelPanel from './AIModelPanel';
import styles from './ProductModal.module.css';

// DB column names (Supabase schema):
//   sku, name, category, sub_category, gold_carat, diamond_purity,
//   material, occasion, weight, price, stock_qty, description, in_stock,
//   images (array), primary_image_url, owner_id, is_current
//
// AI fields (ai_title, ai_description, etc.) are intentionally NOT
// referenced or sent — feature removed per Nikhil's spec #1.

const DIAMOND_CUTS   = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
const DIAMOND_SHAPES = ['Round Brilliant', 'Princess', 'Oval', 'Cushion', 'Marquise', 'Pear', 'Heart', 'Emerald', 'Radiant', 'Asscher', 'Trillion'];
const CERT_ISSUERS   = ['GIA', 'IGI', 'HRD', 'SGL', 'Other'];

const EMPTY_FORM = {
  sku: '', name: '', category: '', sub_category: '',
  collection: '',           // e.g. Bridal, Everyday Wear, Antique
  size: '',                 // Ring size, bangle size, chain length, etc.
  gold_carat: '',
  // Stone & Diamond
  diamond_purity: '', diamond_color: '', diamond_weight: '',
  diamond_cut: '', diamond_shape: '', diamond_count: '',
  stone_count: '',
  material: '', occasion: '',
  // Certification
  huid: '',                 // BIS Hallmark Unique ID (6-char)
  diamond_cert_no: '',      // GIA/IGI certificate number
  diamond_cert_issuer: '',  // GIA / IGI / HRD / SGL / Other
  color: '',
  weight: '',               // Gross total weight
  net_weight_grams: '',     // Net metal weight after stone deduction
  // Two parallel price slots. `fixed_price` is what the owner types in
  // Fixed mode; `price` is what gets persisted to products.price and is
  // owned by the panel in Dynamic mode. We keep both in the form so a
  // toggle Fixed→Dynamic→Fixed restores the typed value verbatim.
  fixed_price: '',
  price: '',
  stock_qty: 1,
  description: '', in_stock: true,
  // Visibility
  visibility: 'all',
  // Pricing mode: false → owner types a fixed price; true → live recompute
  dynamic_price: false,
  // Dynamic pricing breakdown (one row per metal component)
  gold_purity: '',
  gold_weight_grams: '',
  silver_purity: '',
  silver_weight_grams: '',
  // Charges (Dynamic mode only)
  metal_type: '',
  metal_weight_grams: '',
  wastage_percent: 0,
  making_charge_type: 'per_gram',
  making_charge_value: 0,
  stone_value_inr: 0,
  diamond_value_inr: 0,
  hallmark_charge: 45,
  diamond_cert_fee: 0,
  // Optional stone breakdown — local-only, not persisted as separate columns
  stone_weight_ct: '',
  stone_rate_per_ct: '',
  flat_stone_cost: '',
};

export default function ProductModal({ product, store, onSave, onClose, checkSKU, planLimits }) {
  const [form, setForm]             = useState(EMPTY_FORM);
  const [slotFiles, setSlotFiles]   = useState([null,null,null,null,null]);
  const [slotBlobUrls, setSlotBlobUrls] = useState([null,null,null,null,null]);
  const [existingUrls, setExisting] = useState([null,null,null,null,null]);
  const [skuError, setSkuError]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [subcats, setSubcats]       = useState([]);
  const [variants, setVariants]     = useState([]);
  const fileRefs = useRef([null,null,null,null,null]);
  const camRefs  = useRef([null,null,null,null,null]);
  const isEdit   = !!product;

  const [customCatMode,     setCustomCatMode]     = useState(false);
  const [customSubcatMode,  setCustomSubcatMode]  = useState(false);
  const [customMetalMode,   setCustomMetalMode]   = useState(false);
  const [customDiamondMode, setCustomDiamondMode] = useState(false);
  const [stoneOpen,         setStoneOpen]         = useState(true);
  const [certOpen,          setCertOpen]          = useState(false);
  const [lightboxUrl,       setLightboxUrl]       = useState(null);
  const [lbCopied,          setLbCopied]          = useState(false);
  const [lbShareOpen,       setLbShareOpen]       = useState(false);

  // Certificate uploads: { hallmark, diamond } — each holds a File or null
  const [certFiles,  setCertFiles]  = useState({ hallmark: null, diamond: null });
  // Preview URLs or existing Cloudinary URLs loaded from DB
  const [certStates, setCertStates] = useState({ hallmark: '', diamond: '' });
  const hallmarkRef    = useRef(null);
  const diamondCertRef = useRef(null);

  useEffect(() => {
    if (product) {
      setForm({
        sku:            product.sku            || '',
        name:           product.name           || '',
        category:            product.category            || '',
        sub_category:        product.sub_category        || '',
        collection:          product.collection          || '',
        size:                product.size                || '',
        gold_carat:          product.gold_carat          || '',
        diamond_purity:      product.diamond_purity      || '',
        diamond_color:       product.diamond_color       || '',
        diamond_weight:      product.diamond_weight      ?? '',
        diamond_cut:         product.diamond_cut         || '',
        diamond_shape:       product.diamond_shape       || '',
        diamond_count:       product.diamond_count       ?? '',
        stone_count:         product.stone_count         ?? '',
        material:            product.material            || '',
        occasion:            product.occasion            || '',
        huid:                product.huid                || '',
        diamond_cert_no:     product.diamond_cert_no     || '',
        diamond_cert_issuer: product.diamond_cert_issuer || '',
        color:               product.color               || '',
        weight:              product.weight              || '',
        net_weight_grams:    product.net_weight_grams    ?? '',
        // For a saved fixed-price product, seed both slots with the stored value
        // so toggling modes doesn't lose data. Dynamic-priced rows still keep it
        // as a sensible fallback if the owner switches back to Fixed.
        fixed_price:    product.dynamic_price ? '' : (product.price || ''),
        price:          product.price          || '',
        stock_qty:      product.stock_qty ?? 1,
        description:    product.description    || '',
        in_stock:       typeof product.in_stock === 'boolean' ? product.in_stock : true,
        visibility:     product.visibility     || 'all',
        dynamic_price:  product.dynamic_price  ?? false,
        gold_purity:    product.gold_purity    || '',
        gold_weight_grams:   product.gold_weight_grams   ?? '',
        silver_purity:       product.silver_purity       || '',
        silver_weight_grams: product.silver_weight_grams ?? '',
        metal_type:     product.metal_type     || '',
        metal_weight_grams: product.metal_weight_grams ?? '',
        wastage_percent:    product.wastage_percent    ?? 0,
        making_charge_type:  product.making_charge_type  || 'per_gram',
        making_charge_value: product.making_charge_value ?? 0,
        stone_value_inr:     product.stone_value_inr     ?? 0,
        diamond_value_inr:   product.diamond_value_inr   ?? 0,
        hallmark_charge:     product.hallmark_charge     ?? 45,
        diamond_cert_fee:    product.diamond_cert_fee    ?? 0,
        stone_weight_ct:     '',
        stone_rate_per_ct:   '',
        flat_stone_cost:     '',
      });
      const urls = Array.isArray(product.images) ? product.images : [];
      const existing = [null,null,null,null,null];
      urls.forEach((u, i) => { if (i < 5) existing[i] = u; });
      setExisting(existing);
      setSlotFiles([null,null,null,null,null]);
      setSlotBlobUrls(prev => { prev.forEach(u => u && URL.revokeObjectURL(u)); return [null,null,null,null,null]; });
      if (product.category) setSubcats(SUBCATEGORY_MAP[product.category] || []);
      // Detect custom (not-in-list) values saved in older or manually-entered products
      const knownSubs = product.category ? (SUBCATEGORY_MAP[product.category] || []) : [];
      setCustomCatMode(!!product.category && !CATEGORIES.some(c => c.value === product.category));
      setCustomSubcatMode(!!product.sub_category && knownSubs.length > 0 && !knownSubs.includes(product.sub_category));
      setCustomMetalMode(!!product.gold_carat && !ALL_METAL_OPTIONS.includes(product.gold_carat));
      setCustomDiamondMode(!!product.diamond_purity && !DIAMOND_PURITIES.includes(product.diamond_purity));
      // Load existing variants from DB
      db.from('product_variants')
        .select('*')
        .eq('product_id', product.id)
        .eq('is_active', true)
        .order('sort_order')
        .then(({ data }) => {
          setVariants(
            (data || []).map(row => ({
              ...row,
              _key:        row.id,
              customColor: '',
              fixed_price: row.fixed_price ?? row.price ?? '',
              gross_weight:        row.gross_weight        ?? '',
              gold_weight_grams:   row.gold_weight_grams   ?? '',
              silver_weight_grams: row.silver_weight_grams ?? '',
              wastage_percent:     row.wastage_percent      ?? 0,
              making_charge_value: row.making_charge_value ?? 0,
              hallmark_charge:     row.hallmark_charge      ?? 45,
              diamond_cert_fee:    row.diamond_cert_fee     ?? 0,
              diamond_purity:      row.diamond_purity       ?? '',
              diamond_color:       row.diamond_color        ?? '',
              diamond_weight:      row.diamond_weight       ?? '',
              size:                row.size                 ?? '',
              net_weight_grams:    row.net_weight_grams     ?? '',
              huid:                row.huid                 ?? '',
              stone_value_inr:     row.stone_value_inr      ?? 0,
              images:              [null, null, null, null, null],
              existingImageUrls:   (() => {
                const ex = [null, null, null, null, null];
                (row.images || []).forEach((u, i) => { if (i < 5) ex[i] = u; });
                return ex;
              })(),
            }))
          );
        });
      // Load existing certificate URLs
      const existingCerts = product.cert_urls || [];
      const hEntry = existingCerts.find(c => c.type === 'hallmark');
      const dEntry = existingCerts.find(c => c.type === 'diamond');
      setCertStates({ hallmark: hEntry?.url || '', diamond: dEntry?.url || '' });
      setCertFiles({ hallmark: null, diamond: null });
    } else {
      setForm(EMPTY_FORM);
      setSlotFiles([null,null,null,null,null]);
      setSlotBlobUrls(prev => { prev.forEach(u => u && URL.revokeObjectURL(u)); return [null,null,null,null,null]; });
      setExisting([null,null,null,null,null]);
      setSubcats([]);
      setVariants([]);
      setCustomCatMode(false); setCustomSubcatMode(false);
      setCustomMetalMode(false); setCustomDiamondMode(false);
      setCertFiles({ hallmark: null, diamond: null });
      setCertStates({ hallmark: '', diamond: '' });
    }
    setSkuError('');
  }, [product]);

  const set = useCallback((key, val) => {
    setForm(f => ({ ...f, [key]: val }));
  }, []);

  const handleCategory = (cat) => {
    set('category', cat);
    set('sub_category', '');
    setSubcats(SUBCATEGORY_MAP[cat] || []);
    setCustomCatMode(false);
    setCustomSubcatMode(false);
    // Auto-suggest a sensible Carat default when category is Silver
    if (SILVER_CATEGORIES.has(cat) && !/silver/i.test(form.gold_carat)) {
      set('gold_carat', '925 Silver (Sterling)');
    }
  };

  const handleSKUBlur = async (val) => {
    if (!val) return;
    const unique = await checkSKU(val, isEdit ? product.id : null);
    setSkuError(unique ? '' : 'SKU already exists — please use a different one');
  };

  const handleFile = (i, file) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      alert(`Image too large (${(file.size/1024/1024).toFixed(1)} MB). Max 5 MB per image.`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }
    // Create a stable blob URL so re-renders don't flicker the image
    const url = URL.createObjectURL(file);
    setSlotBlobUrls(prev => {
      const n = [...prev];
      if (n[i]) URL.revokeObjectURL(n[i]);
      n[i] = url;
      return n;
    });
    const newFiles = [...slotFiles]; newFiles[i] = file; setSlotFiles(newFiles);
    const newExisting = [...existingUrls]; newExisting[i] = null; setExisting(newExisting);
  };

  const removeSlot = (i) => {
    setSlotBlobUrls(prev => {
      const n = [...prev];
      if (n[i]) URL.revokeObjectURL(n[i]);
      n[i] = null;
      return n;
    });
    const nf = [...slotFiles]; nf[i] = null; setSlotFiles(nf);
    const ne = [...existingUrls]; ne[i] = null; setExisting(ne);
  };

  // Insert an AI-generated model URL into the first empty image slot
  const handleAIImage = useCallback((url) => {
    setExisting(prev => {
      const ne = [...prev];
      const emptyIdx = ne.findIndex((v, i) => !v && !slotFiles[i]);
      const target = emptyIdx >= 0 ? emptyIdx : 4; // fallback to last slot
      ne[target] = url;
      return ne;
    });
  }, [slotFiles]);

  const previewSrc = (i) => slotBlobUrls[i] || existingUrls[i] || null;

  const handleCertFile = (type, file) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) { alert('Image too large (max 5 MB)'); return; }
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return; }
    setCertFiles(prev => ({ ...prev, [type]: file }));
    setCertStates(prev => ({ ...prev, [type]: URL.createObjectURL(file) }));
  };
  const removeCert = (type) => {
    setCertFiles(prev => ({ ...prev, [type]: null }));
    setCertStates(prev => ({ ...prev, [type]: '' }));
  };

  // Has any image at all?
  const imageCount = useMemo(
    () => slotFiles.filter(Boolean).length + existingUrls.filter(Boolean).length,
    [slotFiles, existingUrls]
  );

  const handleSubmit = async () => {
    if (!form.sku.trim())     return alert('SKU is required');
    if (!form.name.trim())    return alert('Item name is required');
    if (!form.category)       return alert('Category is required');
    if (!form.gold_carat)     return alert('Gold/Silver/Metal purity is required');
    if (!form.weight)         return alert('Weight is required');
    if (form.dynamic_price) {
      const hasGold   = form.gold_purity   && Number(form.gold_weight_grams)   > 0;
      const hasSilver = form.silver_purity && Number(form.silver_weight_grams) > 0;
      if (!hasGold && !hasSilver) return alert('Dynamic pricing needs at least one metal (gold or silver) with a purity and weight.');
      if (!Number(form.price))    return alert('Live price is ₹0 — check that today\'s metal rates are loaded.');
    } else {
      if (!form.fixed_price)    return alert('Price is required');
    }
    if (skuError)             return alert('Fix the SKU error first');
    if (imageCount === 0)     return alert('At least one product image is required');

    // Persisted price column: computed (dynamic) or owner-typed (fixed)
    const finalPrice = form.dynamic_price ? Number(form.price) : Number(form.fixed_price);

    setSaving(true);
    try {
      await onSave({
        form: {
          ...form,
          weight:    Number(form.weight),
          price:     finalPrice,
          stock_qty: Number(form.stock_qty) || 1,
        },
        slotFiles,
        existingUrls,
        variants,
        isEdit,
        certFiles,
        certExistingUrls: { ...certStates },
      });
    } catch(err) {
      alert('Save failed: ' + (err.message || 'Unknown'));
    } finally {
      setSaving(false);
    }
  };

  const handleLbShare = (platform) => {
    if (!lightboxUrl) return;
    const text = encodeURIComponent('Check out this jewellery! 💎');
    const url  = encodeURIComponent(lightboxUrl);
    const map = {
      whatsapp:  `https://wa.me/?text=${text}%20${url}`,
      gmail:     `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent('Jewellery Photo')}&body=${text}%20${url}`,
      instagram: null,
      twitter:   `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
    };
    if (platform === 'instagram' && navigator.share) {
      navigator.share({ title: 'Jewellery Photo', text: 'Check out this jewellery! 💎', url: lightboxUrl }).catch(() => {});
      return;
    }
    if (map[platform]) window.open(map[platform], '_blank');
    setLbShareOpen(false);
  };

  const handleLbNativeShare = async () => {
    if (!lightboxUrl) return;
    const shared = await shareImageFile(lightboxUrl, { title: 'Jewellery Photo', text: 'Check out this jewellery! 💎' });
    if (!shared) setLbShareOpen(v => !v);
  };

  const handleLbCopy = async () => {
    if (!lightboxUrl) return;
    try { await navigator.clipboard.writeText(lightboxUrl); }
    catch { window.open(lightboxUrl, '_blank'); return; }
    setLbCopied(true);
    setTimeout(() => setLbCopied(false), 2000);
  };

  return (
    <div className="overlay-backdrop">
      <div className={styles.modal} style={{ animation: 'slideUp .2s ease' }}>
        <div className={styles.header}>
          <h2 className={styles.title}>{isEdit ? 'Edit Product' : 'Add New Product'}</h2>
          <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        <div className={styles.body}>
          {/* ① Item Details */}
          <div className="sec-label">① Item Details</div>
          <div className="fg fg2">
            <div className="fld">
              <label className="lbl">SKU / Item Code <span className="req">*</span></label>
              <input
                className="inp"
                value={form.sku}
                onChange={e => set('sku', e.target.value.toUpperCase())}
                onBlur={e => handleSKUBlur(e.target.value)}
                placeholder="e.g. RNG001"
              />
              {skuError && <div className={styles.fieldError}>{skuError}</div>}
            </div>
            <div className="fld">
              <label className="lbl">Item Name <span className="req">*</span></label>
              <input
                className="inp"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Floral Kundan Ring"
              />
            </div>
          </div>

          <div className="fg fg3" style={{ marginTop: 14 }}>
            <div className="fld">
              <label className="lbl">Category <span className="req">*</span></label>
              {customCatMode ? (
                <div className={styles.customInputWrap}>
                  <input className="inp" value={form.category} autoFocus
                    onChange={e => { set('category', e.target.value); set('sub_category', ''); setSubcats([]); }}
                    placeholder="e.g. Bajuband, Haath Phool…" />
                  <button type="button" className={styles.customBack}
                    onClick={() => { setCustomCatMode(false); setCustomSubcatMode(false); set('category', ''); set('sub_category', ''); setSubcats([]); }}>
                    ← Choose from list
                  </button>
                </div>
              ) : (
                <select className="inp" value={form.category} onChange={e => {
                  if (e.target.value === '__custom__') { setCustomCatMode(true); set('category', ''); set('sub_category', ''); setSubcats([]); setCustomSubcatMode(false); }
                  else handleCategory(e.target.value);
                }}>
                  <option value="">Select category…</option>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  <option disabled>──────────────</option>
                  <option value="__custom__">➕ Other / type your own…</option>
                </select>
              )}
            </div>
            <div className="fld">
              <label className="lbl">Sub-category</label>
              {customSubcatMode ? (
                <div className={styles.customInputWrap}>
                  <input className="inp" value={form.sub_category} autoFocus
                    onChange={e => set('sub_category', e.target.value)}
                    placeholder="e.g. Navratna Ring, Chuda Set…" />
                  <button type="button" className={styles.customBack}
                    onClick={() => { setCustomSubcatMode(false); set('sub_category', ''); }}>
                    ← Choose from list
                  </button>
                </div>
              ) : (
                <select className="inp" value={form.sub_category} onChange={e => {
                  if (e.target.value === '__custom__') { setCustomSubcatMode(true); set('sub_category', ''); }
                  else set('sub_category', e.target.value);
                }}>
                  <option value="">{subcats.length ? 'Select…' : 'Select category first'}</option>
                  {subcats.map(s => <option key={s} value={s}>{s}</option>)}
                  <option disabled>──────────────</option>
                  <option value="__custom__">➕ Other / type your own…</option>
                </select>
              )}
            </div>
            <div className="fld">
              <label className="lbl">Metal Purity <span className="req">*</span></label>
              {customMetalMode ? (
                <div className={styles.customInputWrap}>
                  <input className="inp" value={form.gold_carat} autoFocus
                    onChange={e => set('gold_carat', e.target.value)}
                    placeholder="e.g. Panchdhatu, 20K Green Gold…" />
                  <button type="button" className={styles.customBack}
                    onClick={() => { setCustomMetalMode(false); set('gold_carat', ''); }}>
                    ← Choose from list
                  </button>
                </div>
              ) : (
                <select className="inp" value={form.gold_carat} onChange={e => {
                  if (e.target.value === '__custom__') { setCustomMetalMode(true); set('gold_carat', ''); }
                  else set('gold_carat', e.target.value);
                }}>
                  <option value="">Select purity…</option>
                  {METAL_PURITY_GROUPS.map(g => (
                    <optgroup key={g.label} label={g.label}>
                      {g.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </optgroup>
                  ))}
                  <option disabled>──────────────</option>
                  <option value="__custom__">➕ Other / type your own…</option>
                </select>
              )}
            </div>
          </div>

          <div className="fg fg2" style={{ marginTop: 14 }}>
            <div className="fld">
              <label className="lbl">Collection</label>
              <input
                className="inp"
                value={form.collection}
                onChange={e => set('collection', e.target.value)}
                placeholder="e.g. Bridal, Everyday Wear, Antique, Solitaire…"
              />
            </div>
            <div className="fld">
              <label className="lbl">Size / Measurement</label>
              <input
                className="inp"
                value={form.size}
                onChange={e => set('size', e.target.value)}
                placeholder="e.g. Ring 15, Bangle 2.6″, 18″ Chain, Free Size"
              />
            </div>
          </div>

          {/* Color — same swatch picker used in Variants */}
          <div className="fld" style={{ marginTop: 14 }}>
            <label className="lbl">Color</label>
            <div className={styles.colorRow}>
              {VARIANT_COLORS.map(c => {
                const isActive = form.color === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    className={`${styles.colorChip} ${isActive ? styles.colorChipActive : ''}`}
                    onClick={() => set('color', isActive ? '' : c.value)}
                  >
                    {c.hex
                      ? <span className={styles.colorCircle} style={{ background: c.hex }}/>
                      : <span className={styles.colorCircleTwoTone}/>
                    }
                    {c.label}
                  </button>
                );
              })}
              {/* Custom color — shown only when color is typed outside the 5 presets */}
              {form.color && !VARIANT_COLORS.find(c => c.value === form.color) && (
                <span className={`${styles.colorChip} ${styles.colorChipActive}`}>
                  {form.color} <button type="button" style={{ background:'none',border:'none',cursor:'pointer',fontSize:11,color:'var(--navy)',marginLeft:2 }} onClick={() => set('color','')}>×</button>
                </span>
              )}
              <button
                type="button"
                className={styles.colorChipCustom}
                onClick={() => {
                  const c = window.prompt('Enter custom color name (e.g. Green Gold):');
                  if (c?.trim()) set('color', c.trim());
                }}
                title="Custom color"
              >+ Custom</button>
            </div>
          </div>

          {/* ── Stone & Diamond Details (collapsible, open by default) ── */}
          <div className={styles.stoneSection} style={{ marginTop: 14 }}>
            <button
              type="button"
              className={styles.stoneSectionHeader}
              onClick={() => setStoneOpen(o => !o)}
            >
              <span className={styles.stoneSectionTitle}>
                <Gem size={13} strokeWidth={1.8} /> Stone &amp; Diamond Details
              </span>
              {stoneOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>

            {stoneOpen && (
              <>
                <div className="fg fg3" style={{ marginTop: 12 }}>
                  <div className="fld">
                    <label className="lbl">Diamond Purity</label>
                    {customDiamondMode ? (
                      <div className={styles.customInputWrap}>
                        <input className="inp" value={form.diamond_purity} autoFocus
                          onChange={e => set('diamond_purity', e.target.value)}
                          placeholder="e.g. GIA Certified, SI3…" />
                        <button type="button" className={styles.customBack}
                          onClick={() => { setCustomDiamondMode(false); set('diamond_purity', ''); }}>
                          ← Choose from list
                        </button>
                      </div>
                    ) : (
                      <select className="inp" value={form.diamond_purity} onChange={e => {
                        if (e.target.value === '__custom__') { setCustomDiamondMode(true); set('diamond_purity', ''); }
                        else set('diamond_purity', e.target.value);
                      }}>
                        <option value="">None / N/A</option>
                        {DIAMOND_PURITIES.map(d => <option key={d} value={d}>{d}</option>)}
                        <option disabled>──────────────</option>
                        <option value="__custom__">➕ Other / type your own…</option>
                      </select>
                    )}
                  </div>
                  <div className="fld">
                    <label className="lbl">Diamond Color</label>
                    <input
                      className="inp"
                      value={form.diamond_color}
                      onChange={e => set('diamond_color', e.target.value)}
                      placeholder="e.g. D, E, F, G, H…"
                    />
                  </div>
                  <div className="fld">
                    <label className="lbl">Diamond Weight (ct)</label>
                    <input
                      className="inp"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.diamond_weight}
                      onChange={e => set('diamond_weight', e.target.value)}
                      placeholder="e.g. 0.25"
                    />
                  </div>
                </div>

                <div className="fg fg3" style={{ marginTop: 12 }}>
                  <div className="fld">
                    <label className="lbl">Diamond Cut</label>
                    <select className="inp" value={form.diamond_cut} onChange={e => set('diamond_cut', e.target.value)}>
                      <option value="">None / N/A</option>
                      {DIAMOND_CUTS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="fld">
                    <label className="lbl">Diamond Shape</label>
                    <select className="inp" value={form.diamond_shape} onChange={e => set('diamond_shape', e.target.value)}>
                      <option value="">None / N/A</option>
                      {DIAMOND_SHAPES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="fld">
                    <label className="lbl">No. of Diamonds</label>
                    <input
                      className="inp"
                      type="number"
                      min="0"
                      step="1"
                      value={form.diamond_count}
                      onChange={e => set('diamond_count', e.target.value)}
                      placeholder="e.g. 1, 12, 52"
                    />
                  </div>
                </div>

                <div className="fg fg3" style={{ marginTop: 12 }}>
                  <div className="fld">
                    <label className="lbl">Stone / Material</label>
                    <input
                      className="inp"
                      value={form.material}
                      onChange={e => set('material', e.target.value)}
                      placeholder="e.g. Ruby, Polki, Kundan, Pearl"
                    />
                  </div>
                  <div className="fld">
                    <label className="lbl">No. of Stones</label>
                    <input
                      className="inp"
                      type="number"
                      min="0"
                      step="1"
                      value={form.stone_count}
                      onChange={e => set('stone_count', e.target.value)}
                      placeholder="e.g. 5, 18"
                    />
                  </div>
                  <div className="fld">
                    <label className="lbl">Occasion</label>
                    <input
                      className="inp"
                      value={form.occasion}
                      onChange={e => set('occasion', e.target.value)}
                      placeholder="e.g. Wedding, Festival"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="fg fg2" style={{ marginTop: 14 }}>
            <div className="fld">
              <label className="lbl">Gross Weight (grams) <span className="req">*</span></label>
              <input
                className="inp" type="number" step="0.01" min="0"
                value={form.weight} onChange={e => set('weight', e.target.value)}
                placeholder="e.g. 5.20"
              />
            </div>
            <div className="fld">
              <label className="lbl">Net Metal Weight (grams)</label>
              <input
                className="inp" type="number" step="0.01" min="0"
                value={form.net_weight_grams} onChange={e => set('net_weight_grams', e.target.value)}
                placeholder="Gold/silver weight after stones"
              />
            </div>
          </div>
          <div className="fg fg2" style={{ marginTop: 12 }}>
            <div className="fld">
              <label className="lbl">Stock Quantity</label>
              <input
                className="inp" type="number" min="0"
                value={form.stock_qty} onChange={e => set('stock_qty', e.target.value)}
              />
            </div>
            <div className="fld">
              <label className="lbl">Visible To</label>
              <select className="inp" value={form.visibility} onChange={e => set('visibility', e.target.value)}>
                <option value="all">All Customers</option>
                <option value="vvip">VVIP Only</option>
                <option value="vvip_vip">VVIP &amp; VIP Only</option>
              </select>
            </div>
          </div>

          {/* ── Pricing ─────────────────────────────────────────────── */}
          <div className="sec-label" style={{ marginTop: 20 }}>
            ② Pricing <span className="req">*</span>
          </div>

          <div className={styles.priceModeRow}>
            <button
              type="button"
              className={`${styles.priceModeBtn} ${!form.dynamic_price ? styles.priceModeBtnActive : ''}`}
              onClick={() => set('dynamic_price', false)}
            >
              <Tag size={13}/> Fixed Price
              <small>Owner enters one final number</small>
            </button>
            <button
              type="button"
              className={`${styles.priceModeBtn} ${form.dynamic_price ? styles.priceModeBtnActive : ''}`}
              onClick={() => set('dynamic_price', true)}
            >
              <Zap size={13}/> Dynamic Pricing
              <small>Auto-updates with daily metal rates</small>
            </button>
          </div>

          {!form.dynamic_price ? (
            <div style={{ marginTop: 12 }}>
              <div className="fld">
                <label className="lbl">Price (₹ ex-GST) <span className="req">*</span></label>
                <input
                  className="inp" type="number" min="0"
                  value={form.fixed_price}
                  onChange={e => set('fixed_price', e.target.value)}
                  placeholder="e.g. 45000"
                />
              </div>
            </div>
          ) : (
            <>
              <DynamicPricingPanel
                value={form}
                onChange={(next) => setForm(f => ({ ...f, ...next }))}
                onTotalChange={(total, snapshot) => {
                  setForm(f => ({
                    ...f,
                    price: total ? String(total) : '',
                    ...snapshot,
                  }));
                }}
              />
              <div className={styles.priceSnapshot}>
                <span>Computed Price</span>
                <strong>₹{form.price ? Number(form.price).toLocaleString('en-IN') : '—'}</strong>
              </div>
            </>
          )}

          <div style={{ marginTop: 14 }}>
            <div className="fld">
              <label className="lbl">Description / Notes</label>
              <textarea
                className="inp"
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={3}
                placeholder="Craftsmanship notes, certificate numbers, special features…"
              />
            </div>
          </div>

          {/* ── Certificates & Compliance (collapsible, closed by default) ── */}
          <div className={styles.stoneSection} style={{ marginTop: 14 }}>
            <button
              type="button"
              className={styles.stoneSectionHeader}
              onClick={() => setCertOpen(o => !o)}
            >
              <span className={styles.stoneSectionTitle}>
                <Award size={13} strokeWidth={1.8} /> Certificates &amp; Compliance
                <span className={styles.optionalBadge}>optional</span>
              </span>
              {certOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>

            {certOpen && (
              <div style={{ padding: '0 14px 14px' }}>
                {/* HUID */}
                <div className="fg fg2" style={{ marginTop: 12 }}>
                  <div className="fld">
                    <label className="lbl">HUID <span style={{ fontWeight: 400, fontSize: 10, color: 'var(--ink-soft)', textTransform: 'none', letterSpacing: 0 }}>(BIS Hallmark Unique ID)</span></label>
                    <input
                      className="inp"
                      value={form.huid}
                      onChange={e => set('huid', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                      placeholder="e.g. AB1C2D"
                      maxLength={6}
                    />
                    <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 4 }}>6-character code stamped on the hallmark</div>
                  </div>
                  <div className="fld">
                    <label className="lbl">Hallmark Certificate</label>
                    {certStates.hallmark ? (
                      <div className={styles.certSlot}>
                        <img src={certStates.hallmark} alt="Hallmark cert" className={styles.certThumb} />
                        <button type="button" className={styles.certRemove} onClick={() => removeCert('hallmark')}>Remove</button>
                      </div>
                    ) : (
                      <div className={styles.certUpload} onClick={() => hallmarkRef.current?.click()}>
                        <Upload size={13} /> <span>Upload photo / scan</span>
                      </div>
                    )}
                    <input ref={hallmarkRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" style={{ display: 'none' }} onChange={e => handleCertFile('hallmark', e.target.files?.[0])} />
                  </div>
                </div>

                {/* Diamond certificate */}
                <div className="fg fg3" style={{ marginTop: 12 }}>
                  <div className="fld">
                    <label className="lbl">Cert. Issuer</label>
                    <select className="inp" value={form.diamond_cert_issuer} onChange={e => set('diamond_cert_issuer', e.target.value)}>
                      <option value="">None</option>
                      {CERT_ISSUERS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="fld">
                    <label className="lbl">Certificate Number</label>
                    <input
                      className="inp"
                      value={form.diamond_cert_no}
                      onChange={e => set('diamond_cert_no', e.target.value)}
                      placeholder="e.g. 2315678901"
                    />
                  </div>
                  <div className="fld">
                    <label className="lbl">Diamond Certificate</label>
                    {certStates.diamond ? (
                      <div className={styles.certSlot}>
                        <img src={certStates.diamond} alt="Diamond cert" className={styles.certThumb} />
                        <button type="button" className={styles.certRemove} onClick={() => removeCert('diamond')}>Remove</button>
                      </div>
                    ) : (
                      <div className={styles.certUpload} onClick={() => diamondCertRef.current?.click()}>
                        <Upload size={13} /> <span>Upload photo / scan</span>
                      </div>
                    )}
                    <input ref={diamondCertRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" style={{ display: 'none' }} onChange={e => handleCertFile('diamond', e.target.files?.[0])} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ③ Images */}
          <div className="sec-label" style={{ marginTop: 20 }}>
            <ImageIcon size={11} style={{verticalAlign: 'middle', marginRight: 4}}/> ③ Product Images (up to 5) <span className="req">*</span>
          </div>
          <div className={styles.imgGrid}>
            {[0,1,2,3,4].map(i => {
              const src = previewSrc(i);
              return (
                <div key={i} className={styles.imgSlot}>
                  {src ? (
                    <>
                      <img src={src} alt="" className={styles.imgPreview} />
                      <button className={styles.imgMaximize} onClick={() => { setLightboxUrl(src); setLbShareOpen(false); setLbCopied(false); }} title="View full size">
                        <Maximize2 size={11} />
                      </button>
                      <button className={styles.imgRemove} onClick={() => removeSlot(i)} title="Remove">
                        <Trash2 size={12} />
                      </button>
                      {i === 0 && <span className={styles.imgPrimary}>Primary</span>}
                    </>
                  ) : (
                    <div className={styles.imgAddWrap}>
                      <button className={styles.imgAdd} onClick={() => fileRefs.current[i]?.click()}>
                        <Upload size={15} strokeWidth={1.5} />
                        <span>{i === 0 ? 'Primary image' : 'Add photo'}</span>
                      </button>
                      <button className={styles.imgCam} onClick={() => camRefs.current[i]?.click()} title="Take photo">
                        <Camera size={13} strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
                  <input
                    ref={el => fileRefs.current[i] = el}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    style={{ display: 'none' }}
                    onChange={e => handleFile(i, e.target.files?.[0])}
                  />
                  <input
                    ref={el => camRefs.current[i] = el}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={e => handleFile(i, e.target.files?.[0])}
                  />
                </div>
              );
            })}
          </div>
          <p className={styles.imgNote}>
            Primary image (slot 1) must be a clear jewellery only photo — plain background, no model — it is used for image search for WhatsApp customers. Max 5 MB file size each.
          </p>

          {/* ④ AI Model */}
          <div className="sec-label" style={{ marginTop: 20 }}>
            <Sparkles size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} /> ④ AI Model Try-On
            <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11, marginLeft: 8, color: 'var(--ink-soft)' }}>
              — generate a campaign-quality model photo
            </span>
          </div>
          <AIModelPanel category={form.category} onAddImage={handleAIImage} />

          {/* Stock toggle */}
          <label className={styles.stockToggle}>
            <input
              type="checkbox"
              checked={form.in_stock === true}
              onChange={e => set('in_stock', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--navy)' }}
            />
            Mark as currently in stock
          </label>

          {/* ⑤ Variants */}
          <div className="sec-label" style={{ marginTop: 20 }}>
            <Layers size={11} style={{ verticalAlign: 'middle', marginRight: 4 }}/>
            ⑤ Variants
            <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11, marginLeft: 8, color: 'var(--ink-soft)' }}>
              — offer this design in multiple carats or colors
            </span>
          </div>
          <VariantEditor
            variants={variants}
            onVariantsChange={setVariants}
            productId={product?.id}
            productForm={form}
          />
        </div>

        <div className={styles.footer}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-gold" onClick={handleSubmit} disabled={saving || !!skuError}>
            {saving ? (
              <><div className="spinner spinner-sm" /> Saving…</>
            ) : (
              isEdit ? 'Update Product' : 'Add Product'
            )}
          </button>
        </div>
      </div>

      {/* Image lightbox */}
      {lightboxUrl && (
        <div className={styles.imgLightboxOverlay} onClick={() => setLightboxUrl(null)}>
          <div className={styles.imgLightboxContent} onClick={e => e.stopPropagation()}>
            <button className={styles.imgLightboxClose} onClick={() => setLightboxUrl(null)}><X size={18} /></button>
            <img src={lightboxUrl} alt="product" className={styles.imgLightboxImg} />
            <div className={styles.imgLightboxActions}>
              <button className={styles.imgLbShareBtn} onClick={handleLbNativeShare}>
                <Share2 size={13} /> Share
              </button>
              {lbShareOpen && (
                <div className={styles.imgLbShareMenu}>
                  <button className={styles.imgLbShareItem} onClick={() => handleLbShare('whatsapp')}>
                    <span className={styles.imgLbShareIcon} style={{ background: '#25D366' }}>W</span> WhatsApp
                  </button>
                  <button className={styles.imgLbShareItem} onClick={() => handleLbShare('gmail')}>
                    <span className={styles.imgLbShareIcon} style={{ background: '#EA4335' }}>G</span> Gmail
                  </button>
                  <button className={styles.imgLbShareItem} onClick={() => handleLbShare('instagram')}>
                    <span className={styles.imgLbShareIcon} style={{ background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' }}>I</span> Instagram
                  </button>
                  <button className={styles.imgLbShareItem} onClick={() => handleLbShare('twitter')}>
                    <span className={styles.imgLbShareIcon} style={{ background: '#000' }}>𝕏</span> Twitter / X
                  </button>
                </div>
              )}
              <button className={styles.imgLbCopyBtn} onClick={handleLbCopy}>
                {lbCopied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy Link</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
