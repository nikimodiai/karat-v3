import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Search, SlidersHorizontal, Plus, Package, TrendingUp, TrendingDown,
  X, Grid, List, ArrowUpDown, Tag, Gem, Sparkles,
} from 'lucide-react';
import {
  db, CLOUDINARY_CLOUD, CLOUDINARY_PRESET,
  CATEGORIES, GOLD_CARATS, MAX_IMAGE_BYTES,
} from '../lib/config';
import { effectiveLimit, planKey, PLAN_LABELS } from '../lib/plans';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useStoreData } from '../hooks/useStoreData';
import { usePermissions } from '../hooks/usePermissions';
import ProductModal from '../components/ProductModal';
import ProductCard from '../components/ProductCard';
import ConfirmDialog from '../components/ConfirmDialog';
import { UpgradeDialog } from '../components/UpgradeNotice';
import BulkImportModal from '../components/BulkImportModal';
import styles from './Inventory.module.css';

const SORT_OPTIONS = [
  { value: 'newest',     label: 'Newest First' },
  { value: 'oldest',     label: 'Oldest First' },
  { value: 'price-asc',  label: 'Price: Low → High' },
  { value: 'price-desc', label: 'Price: High → Low' },
  { value: 'name-asc',   label: 'Name A → Z' },
  { value: 'name-desc',  label: 'Name Z → A' },
  { value: 'weight-asc', label: 'Weight: Light → Heavy' },
];

function matchesSearch(p, q) {
  if (!q) return true;
  const lower = q.toLowerCase();
  const fields = [
    p.sku, p.name, p.category, p.sub_category,
    p.material, p.gold_carat, p.occasion, p.diamond_purity, p.description,
  ];
  return fields.some(f => f && String(f).toLowerCase().includes(lower));
}

function sortProducts(arr, sort) {
  const copy = [...arr];
  switch (sort) {
    case 'oldest':     return copy.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    case 'price-asc':  return copy.sort((a,b) => (a.price||0) - (b.price||0));
    case 'price-desc': return copy.sort((a,b) => (b.price||0) - (a.price||0));
    case 'name-asc':   return copy.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    case 'name-desc':  return copy.sort((a,b) => (b.name||'').localeCompare(a.name||''));
    case 'weight-asc': return copy.sort((a,b) => (a.weight||0) - (b.weight||0));
    default:           return copy.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  }
}

// ── Cloudinary upload helpers ───────────────────────────────────────
async function uploadImageToCloudinary(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: 'POST', body: fd,
  });
  if (!res.ok) throw new Error('Image upload failed');
  const json = await res.json();
  return json.secure_url || null;
}

// Rough storage estimate for images already uploaded (best-effort; the
// real check belongs in a Supabase aggregate or Cloudinary API call,
// but this catches the common "running well past plan" case).
function estimateStorageGB(products) {
  // Cloudinary doesn't expose per-asset size cheaply on the client.
  // Estimate ~0.6 MB / image as a reasonable jewellery-photo average.
  let imgBytes = 0;
  for (const p of products) {
    const n = Array.isArray(p.images) ? p.images.length : (p.images ? 1 : 0);
    imgBytes += n * 600 * 1024;
  }
  return imgBytes / (1024 * 1024 * 1024);
}

export default function Inventory() {
  const { user, store } = useAuth();
  const { canWrite } = usePermissions();
  const { showToast } = useToast();
  const { products, setProducts, reload } = useStoreData();

  const [activeCat, setActiveCat]       = useState('All');
  const [search, setSearch]             = useState('');
  const [sort, setSort]                 = useState('newest');
  const [stockFilter, setStockFilter]   = useState('All');
  const [caratFilter, setCaratFilter]   = useState('');
  const [showFilters, setShowFilters]   = useState(false);
  const [viewMode, setViewMode]         = useState('grid');
  const [sortOpen, setSortOpen]         = useState(false);
  const sortRef = useRef(null);

  const [modalOpen, setModalOpen]       = useState(false);
  const [editProduct, setEditProduct]   = useState(null);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // variantMap: { [productId]: [{ color, carat }] } — for swatch display
  const [variantMap, setVariantMap]     = useState({});
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  // Limit-reached dialog state
  const [upgradeOpen, setUpgradeOpen]   = useState(null); // { feature, message } | null

  // Close sort dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load variant summaries for all products owned by this user
  useEffect(() => {
    if (!user?.id || !products.length) return;
    db.from('product_variants')
      .select('product_id, color, carat, is_in_stock')
      .eq('owner_id', store.owner_id)
      .eq('is_active', true)
      .then(({ data }) => {
        if (!data?.length) return;
        const map = {};
        data.forEach(row => {
          if (!map[row.product_id]) map[row.product_id] = [];
          map[row.product_id].push({ color: row.color, carat: row.carat, is_in_stock: row.is_in_stock });
        });
        setVariantMap(map);
      });
  }, [user?.id, products.length]);

  // ── Limits ──────────────────────────────────────────────────────
  const prodLimit     = effectiveLimit(store, 'products');
  const storageLimit  = effectiveLimit(store, 'image_storage');
  const planName      = planKey(store);
  const storageUsedGB = useMemo(() => estimateStorageGB(products), [products]);
  const isProdLimitHit    = prodLimit !== Infinity && products.length >= prodLimit;
  const isStorageLimitHit = storageLimit !== Infinity && storageUsedGB >= storageLimit;

  // SKU uniqueness check — current rows only
  const checkSKU = useCallback(async (sku, excludeId) => {
    const { data } = await db.from('products')
      .select('id, owner_id')
      .eq('sku', sku)
      .eq('owner_id', store.owner_id)
      .eq('is_current', true);
    if (!data) return true;
    return excludeId ? data.every(d => d.id === excludeId) : data.length === 0;
  }, [user]);

  // ── Save handler ────────────────────────────────────────────────
  // Direct Supabase UPDATE on edit (one row per product — fixes
  // "multiple records per edit" bug). New products go through INSERT.
  // No n8n round-trip, no AI generation, no soft-insert duplicates.
  const handleSave = useCallback(async ({ form, slotFiles, existingUrls, variants, isEdit }) => {
    // 1) Upload any new images to Cloudinary
    const imageUrls = [...existingUrls];
    for (let i = 0; i < 5; i++) {
      if (slotFiles[i]) {
        try {
          imageUrls[i] = await uploadImageToCloudinary(slotFiles[i]);
        } catch (e) {
          imageUrls[i] = null;
          showToast(`Image ${i+1} upload failed`, '#C0392B');
        }
      }
    }
    const finalImages = imageUrls.filter(Boolean);

    // 2) Build payload (DB column names only; AI fields excluded)
    const payload = {
      sku:            form.sku,
      name:           form.name,
      category:       form.category,
      sub_category:   form.sub_category || null,
      gold_carat:     form.gold_carat,
      color:          form.color || null,
      diamond_purity: form.diamond_purity || null,
      material:       form.material || null,
      occasion:       form.occasion || null,
      weight:         form.weight,
      price:          form.price,
      stock_qty:      form.stock_qty,
      description:    form.description || null,
      in_stock:       form.in_stock,
      owner_id:       store.owner_id,
      images:         finalImages,
      primary_image_url: finalImages[0] || null,
      is_current:     true,
      // Visibility & dynamic pricing
      visibility:          form.visibility     || 'all',
      dynamic_price:       form.dynamic_price  ?? false,
      // Dual-metal breakdown (NEW — see 2026_05_28_dynamic_pricing.sql)
      gold_purity:         form.gold_purity         || null,
      gold_weight_grams:   form.gold_weight_grams   ? Number(form.gold_weight_grams)   : null,
      silver_purity:       form.silver_purity       || null,
      silver_weight_grams: form.silver_weight_grams ? Number(form.silver_weight_grams) : null,
      // Legacy single-metal snapshot fields (kept for back-compat / search)
      metal_type:          form.metal_type     || null,
      metal_weight_grams:  form.metal_weight_grams ? Number(form.metal_weight_grams) : null,
      wastage_percent:     Number(form.wastage_percent)    || 0,
      making_charge_type:  form.making_charge_type  || 'per_gram',
      making_charge_value: Number(form.making_charge_value) || 0,
      stone_value_inr:     Number(form.stone_value_inr)     || 0,
      diamond_value_inr:   Number(form.diamond_value_inr)   || 0,
      hallmark_charge:     Number(form.hallmark_charge)     ?? 45,
    };

    let savedProductId;
    if (isEdit && editProduct) {
      // ── Direct UPDATE: 1 row per product ──────────────────────
      const { data, error } = await db
        .from('products')
        .update(payload)
        .eq('id', editProduct.id)
        .eq('owner_id', store.owner_id)
        .select()
        .single();
      if (error) throw error;
      setProducts(prev => prev.map(p => p.id === data.id ? data : p));
      savedProductId = data.id;
      showToast('Product updated!', '#166534');
    } else {
      // ── INSERT new product ────────────────────────────────────
      const { data, error } = await db
        .from('products')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      setProducts(prev => [data, ...prev]);
      savedProductId = data.id;
      showToast('Product added!', '#166534');
    }

    // 3) Persist variants ─────────────────────────────────────────
    if (savedProductId && Array.isArray(variants)) {
      const keptIds = variants.filter(v => v.id).map(v => v.id);

      // Soft-delete removed variants. When nothing is kept we delete all
      // (can't use .not with an empty list).
      if (keptIds.length > 0) {
        const { error: delErr } = await db
          .from('product_variants')
          .update({ is_active: false })
          .eq('product_id', savedProductId)
          .not('id', 'in', `(${keptIds.join(',')})` );
        if (delErr) console.error('[variants] soft-delete error', delErr);
      } else if (isEdit) {
        // All variants removed — soft-delete every row for this product
        const { error: delErr } = await db
          .from('product_variants')
          .update({ is_active: false })
          .eq('product_id', savedProductId);
        if (delErr) console.error('[variants] delete-all error', delErr);
      }

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const varPayload = {
          product_id:          savedProductId,
          owner_id:            store.owner_id,
          carat:               v.carat || '',
          color:               v.color === '__custom__' ? (v.customColor || 'Custom') : (v.color || 'Yellow Gold'),
          gross_weight:        v.gross_weight        ? Number(v.gross_weight)        : null,
          gold_purity:         v.gold_purity         || null,
          gold_weight_grams:   v.gold_weight_grams   ? Number(v.gold_weight_grams)   : null,
          silver_purity:       v.silver_purity       || null,
          silver_weight_grams: v.silver_weight_grams ? Number(v.silver_weight_grams) : null,
          wastage_percent:     Number(v.wastage_percent)      || 0,
          making_charge_type:  v.making_charge_type  || 'per_gram',
          making_charge_value: Number(v.making_charge_value) || 0,
          hallmark_charge:     Number(v.hallmark_charge)      || 45,
          stone_value_inr:     Number(v.stone_value_inr)      || 0,
          dynamic_price:       v.dynamic_price ?? false,
          price:               v.price       ? Number(v.price)       : null,
          fixed_price:         v.fixed_price ? Number(v.fixed_price) : null,
          is_in_stock:         v.is_in_stock ?? true,
          sort_order:          i,
          is_active:           true,
        };

        if (v.id) {
          await db.from('product_variants').update(varPayload).eq('id', v.id);
        } else {
          await db.from('product_variants').insert(varPayload);
        }
      }

      // Refresh variant map so cards update immediately without a full reload
      const { data: freshVars } = await db
        .from('product_variants')
        .select('product_id, color, carat, is_in_stock')
        .eq('owner_id', store.owner_id)
        .eq('is_active', true);
      if (freshVars) {
        const map = {};
        freshVars.forEach(row => {
          if (!map[row.product_id]) map[row.product_id] = [];
          map[row.product_id].push({ color: row.color, carat: row.carat, is_in_stock: row.is_in_stock });
        });
        setVariantMap(map);
      }
    }

    setModalOpen(false);
    setEditProduct(null);
  }, [user, store, editProduct, setProducts, showToast, setVariantMap]);

  // ── Delete (soft) ───────────────────────────────────────────────
  // Pure client-side soft delete. Avoids the legacy n8n delete webhook.
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setConfirmOpen(false);
    try {
      const { error } = await db
        .from('products')
        .update({ is_current: false })
        .eq('id', deleteTarget)
        .eq('owner_id', store.owner_id);
      if (error) throw error;
      setProducts(prev => prev.filter(p => p.id !== deleteTarget));
      showToast('Product deleted.', '#C0392B');
    } catch (err) {
      showToast('Delete failed: ' + err.message, '#C0392B');
    }
    setDeleteTarget(null);
  }, [deleteTarget, user, setProducts, showToast]);

  const handleToggleStock = useCallback(async (product) => {
    const newInStock = !product.in_stock;
    const { error } = await db
      .from('products')
      .update({ in_stock: newInStock })
      .eq('id', product.id)
      .eq('owner_id', store.owner_id);
    if (!error) {
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, in_stock: newInStock } : p));
      showToast(`Marked as ${newInStock ? 'In Stock' : 'Sold Out'}`, newInStock ? '#166534' : '#C0392B');
    } else {
      showToast('Could not update stock status', '#C0392B');
    }
  }, [user, setProducts, showToast]);

  // ── UI handlers ────────────────────────────────────────────────
  const openAdd = () => {
    if (isProdLimitHit) {
      setUpgradeOpen({
        feature: 'Adding more products',
        message: `You've reached your plan's product limit of ${prodLimit}. Upgrade to add more.`,
      });
      return;
    }
    if (isStorageLimitHit) {
      setUpgradeOpen({
        feature: 'Image storage limit',
        message: `You've used ${storageUsedGB.toFixed(1)} GB of your ${storageLimit} GB image storage. Upgrade or remove some products.`,
      });
      return;
    }
    setEditProduct(null);
    setModalOpen(true);
  };
  const openEdit  = (p)   => { setEditProduct(p); setModalOpen(true); };
  const openDelete = (id) => { setDeleteTarget(id); setConfirmOpen(true); };

  // ── Derived view state ─────────────────────────────────────────
  const filtered = useMemo(() => {
    let arr = products;
    if (activeCat !== 'All')         arr = arr.filter(p => p.category === activeCat);
    if (stockFilter === 'In Stock')  arr = arr.filter(p => p.in_stock === true);
    if (stockFilter === 'Sold Out')  arr = arr.filter(p => p.in_stock === false);
    if (caratFilter)                 arr = arr.filter(p => p.gold_carat === caratFilter);
    arr = arr.filter(p => matchesSearch(p, search));
    return sortProducts(arr, sort);
  }, [products, activeCat, stockFilter, caratFilter, search, sort]);

  const catCounts = useMemo(() => {
    const counts = { All: products.length };
    products.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
    return counts;
  }, [products]);

  const totalIn  = useMemo(() => products.filter(p => p.in_stock === true).length, [products]);
  const totalOut = useMemo(() => products.filter(p => p.in_stock === false).length, [products]);
  const hasFilters = stockFilter !== 'All' || caratFilter;

  return (
    <div className={styles.page}>
      {/* Stats row */}
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <div className={styles.statIconWrap} style={{ background: 'rgba(13,27,42,.06)' }}>
            <Package size={18} color="#0D1B2A" strokeWidth={1.5} />
          </div>
          <div>
            <div className={styles.statNum}>{products.length}</div>
            <div className={styles.statLbl}>Total SKUs</div>
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statIconWrap} style={{ background: 'rgba(22,101,52,.08)' }}>
            <TrendingUp size={18} color="#16a34a" strokeWidth={1.5} />
          </div>
          <div>
            <div className={styles.statNum} style={{ color: '#16a34a' }}>{totalIn}</div>
            <div className={styles.statLbl}>In Stock</div>
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statIconWrap} style={{ background: 'rgba(220,38,38,.07)' }}>
            <TrendingDown size={18} color="#dc2626" strokeWidth={1.5} />
          </div>
          <div>
            <div className={styles.statNum} style={{ color: '#dc2626' }}>{totalOut}</div>
            <div className={styles.statLbl}>Sold Out</div>
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statIconWrap} style={{ background: 'rgba(201,168,76,.1)' }}>
            <Gem size={18} color="#C9A84C" strokeWidth={1.5} />
          </div>
          <div>
            <div className={styles.statNum} style={{ color: '#8B6914' }}>
              {products.length}
              <span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(13,27,42,.38)' }}>
                /{prodLimit === Infinity ? '∞' : prodLimit}
              </span>
            </div>
            <div className={styles.statLbl}>Plan Usage · {PLAN_LABELS[planName]}</div>
          </div>
        </div>
      </div>

      {/* Category chips */}
      <div className={styles.catStrip}>
        <button
          className={`${styles.chip} ${activeCat === 'All' ? styles.chipActive : ''}`}
          onClick={() => setActiveCat('All')}
        >
          All <span className={styles.chipCount}>{catCounts.All || 0}</span>
        </button>
        {CATEGORIES.filter(c => catCounts[c.value]).map(c => (
          <button
            key={c.value}
            className={`${styles.chip} ${activeCat === c.value ? styles.chipActive : ''}`}
            onClick={() => setActiveCat(c.value)}
          >
            {c.label} <span className={styles.chipCount}>{catCounts[c.value] || 0}</span>
          </button>
        ))}
      </div>

      {/* Header / toolbar */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>
            {activeCat === 'All' ? 'All Inventory' : activeCat + 's'}
          </h2>
          <p className={styles.sub}>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        <div className={styles.controls}>
          <div className={styles.searchWrap}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search SKU, name, category, material…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className={styles.searchClear} onClick={() => setSearch('')}>
                <X size={13} />
              </button>
            )}
          </div>

          <button
            className={`${styles.iconBtn} ${(showFilters || hasFilters) ? styles.iconBtnActive : ''}`}
            onClick={() => setShowFilters(p => !p)}
            title="Filters"
          >
            <SlidersHorizontal size={15} />
            {hasFilters && <span className={styles.filterDot} />}
          </button>

          <div className={styles.sortWrap} ref={sortRef}>
            <button className={styles.iconBtn} onClick={() => setSortOpen(p => !p)} title="Sort">
              <ArrowUpDown size={15} />
            </button>
            {sortOpen && (
              <div className={styles.sortDropdown}>
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`${styles.sortOpt} ${sort === opt.value ? styles.sortOptActive : ''}`}
                    onClick={() => { setSort(opt.value); setSortOpen(false); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.viewToggle}>
            <button className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewBtnActive : ''}`} onClick={() => setViewMode('grid')}>
              <Grid size={14} />
            </button>
            <button className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewBtnActive : ''}`} onClick={() => setViewMode('list')}>
              <List size={14} />
            </button>
          </div>

          {canWrite && (
            <button className={styles.importBtn} onClick={() => setBulkImportOpen(true)}>
              <Sparkles size={14}/>
              AI Bulk Import
            </button>
          )}

          {canWrite && (
            <button className="btn-gold" onClick={openAdd}>
              <Plus size={15} strokeWidth={2.5} />
              Add Product
            </button>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className={styles.filterPanel}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}><Tag size={12} /> Stock Status</span>
            <div className={styles.filterPills}>
              {['All','In Stock','Sold Out'].map(s => (
                <button
                  key={s}
                  className={`${styles.filterPill} ${stockFilter === s ? styles.filterPillActive : ''}`}
                  onClick={() => setStockFilter(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}><Gem size={12} /> Metal Purity</span>
            <div className={styles.filterPills}>
              <button
                className={`${styles.filterPill} ${!caratFilter ? styles.filterPillActive : ''}`}
                onClick={() => setCaratFilter('')}
              >
                Any
              </button>
              {GOLD_CARATS.map(c => (
                <button
                  key={c}
                  className={`${styles.filterPill} ${caratFilter === c ? styles.filterPillActive : ''}`}
                  onClick={() => setCaratFilter(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          {hasFilters && (
            <button
              className={styles.clearFiltersBtn}
              onClick={() => { setStockFilter('All'); setCaratFilter(''); }}
            >
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      )}

      {/* Product grid/list */}
      <div className={styles.gridArea}>
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <Package size={48} strokeWidth={1} color="rgba(13,27,42,.2)" />
            <h3>{search ? 'No results found' : 'No products yet'}</h3>
            <p>{search ? `No items match "${search}"` : 'Click Add Product to get started.'}</p>
            {!search && canWrite && (
              <button className="btn-gold" style={{ marginTop: 16 }} onClick={openAdd}>
                <Plus size={15} /> Add First Product
              </button>
            )}
          </div>
        ) : (
          <div className={viewMode === 'grid' ? styles.grid : styles.listGrid}>
            {filtered.map(p => (
              <ProductCard
                key={p.id}
                product={p}
                variants={variantMap[p.id] || []}
                viewMode={viewMode}
                onEdit={canWrite ? () => openEdit(p) : null}
                onDelete={canWrite ? () => openDelete(p.id) : null}
                onToggleStock={canWrite ? () => handleToggleStock(p) : null}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <ProductModal
          product={editProduct}
          store={store}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditProduct(null); }}
          checkSKU={checkSKU}
        />
      )}
      {confirmOpen && (
        <ConfirmDialog
          message="Delete this product? This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => { setConfirmOpen(false); setDeleteTarget(null); }}
        />
      )}
      {upgradeOpen && (
        <UpgradeDialog
          feature={upgradeOpen.feature}
          currentPlan={PLAN_LABELS[planName] || 'Trial'}
          recommendedPlan={planName === 'starter' ? 'Professional' : 'Enterprise'}
          message={upgradeOpen.message}
          onClose={() => setUpgradeOpen(null)}
        />
      )}
      {bulkImportOpen && (
        <BulkImportModal
          onClose={() => setBulkImportOpen(false)}
          onImportDone={() => { reload(); setBulkImportOpen(false); }}
        />
      )}
    </div>
  );
}
