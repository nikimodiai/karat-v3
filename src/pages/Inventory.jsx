import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { compressImage } from '../lib/imageUtils';
import {
  Search, SlidersHorizontal, Plus, Package, TrendingUp, TrendingDown,
  X, Grid, List, ArrowUpDown, Tag, Gem, Sparkles,
  CheckSquare, Trash2, Download, ChevronDown,
} from 'lucide-react';
import {
  db, CLOUDINARY_CLOUD, CLOUDINARY_PRESET,
  CATEGORIES, GOLD_CARATS, MAX_IMAGE_BYTES,
  N8N_ADD_PRODUCT_VECTOR,
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

// Export columns in the exact order of the Add/Edit product form
const EXPORT_COLS = [
  { key: 'sku',                 label: 'SKU / Item Code' },
  { key: 'name',                label: 'Item Name' },
  { key: 'category',            label: 'Category' },
  { key: 'sub_category',        label: 'Sub-category' },
  { key: 'collection',          label: 'Collection' },
  { key: 'size',                label: 'Size / Measurement' },
  { key: 'gold_carat',          label: 'Metal Purity' },
  { key: 'color',               label: 'Color' },
  { key: 'diamond_purity',      label: 'Diamond Purity' },
  { key: 'diamond_color',       label: 'Diamond Color' },
  { key: 'diamond_weight',      label: 'Diamond Weight (ct)' },
  { key: 'diamond_cut',         label: 'Diamond Cut' },
  { key: 'diamond_shape',       label: 'Diamond Shape' },
  { key: 'diamond_count',       label: 'No. of Diamonds' },
  { key: 'material',            label: 'Stone / Material' },
  { key: 'stone_count',         label: 'No. of Stones' },
  { key: 'occasion',            label: 'Occasion' },
  { key: 'huid',                label: 'HUID (BIS Hallmark UID)' },
  { key: 'diamond_cert_issuer', label: 'Diamond Cert Issuer' },
  { key: 'diamond_cert_no',     label: 'Diamond Certificate No.' },
  { key: 'hallmark_cert_url',   label: 'Hallmark Certificate URL' },
  { key: 'diamond_cert_url',    label: 'Diamond Certificate URL' },
  { key: 'weight',              label: 'Gross Weight (g)' },
  { key: 'net_weight_grams',    label: 'Net Metal Weight (g)' },
  { key: 'stock_qty',           label: 'Stock Quantity' },
  { key: 'visibility',          label: 'Visible To' },
  { key: 'price',               label: 'Price (₹)' },
  { key: 'dynamic_price',       label: 'Dynamic Pricing' },
  { key: 'gold_purity',         label: 'Gold Purity' },
  { key: 'gold_weight_grams',   label: 'Gold Weight (g)' },
  { key: 'silver_purity',       label: 'Silver Purity' },
  { key: 'silver_weight_grams', label: 'Silver Weight (g)' },
  { key: 'wastage_percent',     label: 'Wastage %' },
  { key: 'making_charge_type',  label: 'Making Charge Type' },
  { key: 'making_charge_value', label: 'Making Charge Value' },
  { key: 'stone_value_inr',     label: 'Stone Value (₹)' },
  { key: 'diamond_value_inr',   label: 'Diamond Value (₹)' },
  { key: 'hallmark_charge',     label: 'Hallmark Charge (₹)' },
  { key: 'description',         label: 'Description / Notes' },
  { key: 'in_stock',            label: 'In Stock' },
  { key: 'created_at',          label: 'Created Date' },
];

const VISIBILITY_LABELS = {
  all:      'All Customers',
  vvip:     'VVIP Only',
  vvip_vip: 'VVIP & VIP',
};

function mapProductToExportRow(p) {
  const hallmarkCert = Array.isArray(p.cert_urls) ? (p.cert_urls.find(c => c.type === 'hallmark')?.url || '') : '';
  const diamondCert  = Array.isArray(p.cert_urls) ? (p.cert_urls.find(c => c.type === 'diamond')?.url  || '') : '';
  return {
    sku:                 p.sku                 || '',
    name:                p.name                || '',
    category:            p.category            || '',
    sub_category:        p.sub_category        || '',
    collection:          p.collection          || '',
    size:                p.size                || '',
    gold_carat:          p.gold_carat          || '',
    color:               p.color               || '',
    diamond_purity:      p.diamond_purity      || '',
    diamond_color:       p.diamond_color       || '',
    diamond_weight:      p.diamond_weight      ?? '',
    diamond_cut:         p.diamond_cut         || '',
    diamond_shape:       p.diamond_shape       || '',
    diamond_count:       p.diamond_count       ?? '',
    material:            p.material            || '',
    stone_count:         p.stone_count         ?? '',
    occasion:            p.occasion            || '',
    huid:                p.huid                || '',
    diamond_cert_issuer: p.diamond_cert_issuer || '',
    diamond_cert_no:     p.diamond_cert_no     || '',
    hallmark_cert_url:   hallmarkCert,
    diamond_cert_url:    diamondCert,
    weight:              p.weight              ?? '',
    net_weight_grams:    p.net_weight_grams    ?? '',
    stock_qty:           p.stock_qty           ?? '',
    visibility:          VISIBILITY_LABELS[p.visibility] || p.visibility || '',
    price:               p.price               ?? '',
    dynamic_price:       p.dynamic_price ? 'Yes' : 'No',
    gold_purity:         p.gold_purity         || '',
    gold_weight_grams:   p.gold_weight_grams   ?? '',
    silver_purity:       p.silver_purity       || '',
    silver_weight_grams: p.silver_weight_grams ?? '',
    wastage_percent:     p.wastage_percent      ?? '',
    making_charge_type:  p.making_charge_type  || '',
    making_charge_value: p.making_charge_value ?? '',
    stone_value_inr:     p.stone_value_inr     ?? '',
    diamond_value_inr:   p.diamond_value_inr   ?? '',
    hallmark_charge:     p.hallmark_charge     ?? '',
    description:         p.description         || '',
    in_stock:            p.in_stock ? 'Yes' : 'No',
    created_at:          p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN') : '',
  };
}

function downloadCSV(rows, filename) {
  const headers = EXPORT_COLS.map(c => c.label);
  const csvData = rows.map(row =>
    EXPORT_COLS.map(c => {
      const val = row[c.key];
      if (val === null || val === undefined) return '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? '"' + str.replace(/"/g, '""') + '"'
        : str;
    })
  );
  const csv = [headers, ...csvData].map(r => r.join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename + '.csv'; a.click();
  URL.revokeObjectURL(url);
}

async function downloadXLSX(rows, filename) {
  const { utils, writeFile } = await import('xlsx');
  const headers = EXPORT_COLS.map(c => c.label);
  const dataRows = rows.map(row => EXPORT_COLS.map(c => {
    const val = row[c.key];
    return val === null || val === undefined ? '' : val;
  }));
  const ws = utils.aoa_to_sheet([headers, ...dataRows]);
  // Auto column widths
  ws['!cols'] = headers.map((h, i) => ({
    wch: Math.max(h.length, ...dataRows.map(r => String(r[i] ?? '').length), 10),
  }));
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Products');
  writeFile(wb, filename + '.xlsx');
}

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
  const compressed = await compressImage(file);
  const fd = new FormData();
  fd.append('file', compressed, 'image.jpg');
  fd.append('upload_preset', CLOUDINARY_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: 'POST', body: fd,
  });
  if (!res.ok) throw new Error('Image upload failed');
  const json = await res.json();
  return json.secure_url || null;
}

// ── Image-search vectorization ──────────────────────────────────────
async function vectorizeProductImage(productId, primaryImageUrl) {
  try {
    const res = await fetch(N8N_ADD_PRODUCT_VECTOR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, primary_image_url: primaryImageUrl }),
      credentials: 'omit',
      mode: 'cors',
    });

    const raw = await res.text().catch(() => '');
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { /* non-JSON body */ }

    if (res.ok && data?.success === true) {
      return { ok: true };
    }

    const error =
      data?.message ||
      (data && data.success === false && 'workflow reported failure') ||
      (raw && raw.slice(0, 200)) ||
      `HTTP ${res.status}`;
    return { ok: false, error };
  } catch (e) {
    return { ok: false, error: e.message || 'network error' };
  }
}

function estimateStorageGB(products) {
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
  const { products, setProducts, reload, inventoryPrefill, setInventoryPrefill } = useStoreData();

  const [activeCat, setActiveCat]       = useState('All');
  const [search, setSearch]             = useState('');
  const [sort, setSort]                 = useState('newest');
  const [stockFilter, setStockFilter]   = useState('All');
  const [caratFilter, setCaratFilter]   = useState('');
  const [showFilters, setShowFilters]   = useState(false);
  const [viewMode, setViewMode]         = useState('grid');
  const [sortOpen, setSortOpen]         = useState(false);
  const [exportOpen, setExportOpen]     = useState(false);
  const sortRef   = useRef(null);
  const exportRef = useRef(null);

  // Multi-select state
  const [selectMode, setSelectMode]     = useState(false);
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [exporting, setExporting]       = useState(false);

  const [modalOpen, setModalOpen]       = useState(false);
  const [editProduct, setEditProduct]   = useState(null);
  // Prefill handed over from Studio Suite → AI Model "Add to Inventory".
  const [prefillData, setPrefillData]   = useState(null);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [variantMap, setVariantMap]     = useState({});
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const [upgradeOpen, setUpgradeOpen]   = useState(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false);
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    };
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

  // SKU uniqueness check
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
  const handleSave = useCallback(async ({ form, slotFiles, existingUrls, variants, isEdit, certFiles = {}, certExistingUrls = {} }) => {
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

    // 1b) Upload any new certificate images to Cloudinary
    const certUploadedUrls = { ...certExistingUrls };
    for (const type of ['hallmark', 'diamond']) {
      if (certFiles[type]) {
        try {
          certUploadedUrls[type] = await uploadImageToCloudinary(certFiles[type]);
        } catch (e) {
          showToast(`${type === 'hallmark' ? 'Hallmark' : 'Diamond'} certificate upload failed`, '#C0392B');
        }
      }
    }
    const cert_urls = Object.entries(certUploadedUrls)
      .filter(([, url]) => !!url)
      .map(([type, url]) => ({ type, url }));

    // 2) Build payload
    const payload = {
      sku:            form.sku,
      name:           form.name,
      category:       form.category,
      sub_category:   form.sub_category || null,
      gold_carat:     form.gold_carat,
      color:          form.color || null,
      collection:          form.collection          || null,
      size:                form.size                || null,
      net_weight_grams:    form.net_weight_grams    ? Number(form.net_weight_grams)  : null,
      diamond_purity:      form.diamond_purity      || null,
      diamond_color:       form.diamond_color       || null,
      diamond_weight:      form.diamond_weight      ? Number(form.diamond_weight)    : null,
      diamond_cut:         form.diamond_cut         || null,
      diamond_shape:       form.diamond_shape       || null,
      diamond_count:       form.diamond_count       ? Number(form.diamond_count)     : null,
      stone_count:         form.stone_count         ? Number(form.stone_count)       : null,
      huid:                form.huid                || null,
      diamond_cert_no:     form.diamond_cert_no     || null,
      diamond_cert_issuer: form.diamond_cert_issuer || null,
      cert_urls:           cert_urls,
      material:            form.material            || null,
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
      visibility:          form.visibility     || 'all',
      dynamic_price:       form.dynamic_price  ?? false,
      gold_purity:         form.gold_purity         || null,
      gold_weight_grams:   form.gold_weight_grams   ? Number(form.gold_weight_grams)   : null,
      silver_purity:       form.silver_purity       || null,
      silver_weight_grams: form.silver_weight_grams ? Number(form.silver_weight_grams) : null,
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
      const { data, error } = await db
        .from('products')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      setProducts(prev => [data, ...prev]);
      savedProductId = data.id;
      showToast('Product saved — now vectorizing for image search…', '#1D4ED8');

      if (data.primary_image_url) {
        vectorizeProductImage(data.id, data.primary_image_url).then(({ ok, error }) => {
          showToast(
            ok ? 'Vectorization complete — product ready for image search!'
               : `Image-search vectorization failed: ${error}`,
            ok ? '#166534' : '#C0392B'
          );
        });
      }
    }

    // 3) Persist variants
    if (savedProductId && Array.isArray(variants)) {
      const keptIds = variants.filter(v => v.id).map(v => v.id);

      if (keptIds.length > 0) {
        const { error: delErr } = await db
          .from('product_variants')
          .update({ is_active: false })
          .eq('product_id', savedProductId)
          .not('id', 'in', `(${keptIds.join(',')})` );
        if (delErr) console.error('[variants] soft-delete error', delErr);
      } else if (isEdit) {
        const { error: delErr } = await db
          .from('product_variants')
          .update({ is_active: false })
          .eq('product_id', savedProductId);
        if (delErr) console.error('[variants] delete-all error', delErr);
      }

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];

        // Upload any new variant image files to Cloudinary
        const varImageUrls = [...(v.existingImageUrls || [null,null,null,null,null])];
        const varFiles = v.images || [null,null,null,null,null];
        for (let s = 0; s < 5; s++) {
          if (varFiles[s]) {
            try {
              varImageUrls[s] = await uploadImageToCloudinary(varFiles[s]);
            } catch (e) {
              varImageUrls[s] = null;
              showToast(`Variant ${i+1} image ${s+1} upload failed`, '#C0392B');
            }
          }
        }
        const finalVarImages = varImageUrls.filter(Boolean);

        const varPayload = {
          images:              finalVarImages,
          primary_image_url:   finalVarImages[0] || null,
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
          diamond_purity:      v.diamond_purity      || null,
          diamond_color:       v.diamond_color       || null,
          diamond_weight:      v.diamond_weight      ? Number(v.diamond_weight)    : null,
          size:                v.size                || null,
          net_weight_grams:    v.net_weight_grams    ? Number(v.net_weight_grams)  : null,
          huid:                v.huid                || null,
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

  // ── Bulk delete ─────────────────────────────────────────────────
  const handleBulkDelete = useCallback(async () => {
    if (!selectedIds.size) return;
    setBulkConfirmOpen(false);
    const ids = [...selectedIds];
    try {
      const { error } = await db
        .from('products')
        .update({ is_current: false })
        .in('id', ids)
        .eq('owner_id', store.owner_id);
      if (error) throw error;
      setProducts(prev => prev.filter(p => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      setSelectMode(false);
      showToast(`${ids.length} product${ids.length !== 1 ? 's' : ''} deleted.`, '#C0392B');
    } catch (err) {
      showToast('Bulk delete failed: ' + err.message, '#C0392B');
    }
  }, [selectedIds, store, setProducts, showToast]);

  const toggleSelectMode = () => {
    setSelectMode(p => !p);
    setSelectedIds(new Set());
  };

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Export ──────────────────────────────────────────────────────
  const handleExport = useCallback(async (format) => {
    setExportOpen(false);
    setExporting(true);
    showToast('Preparing export…', '#1D4ED8');
    try {
      const { data, error } = await db
        .from('products')
        .select('*')
        .eq('owner_id', store.owner_id)
        .eq('is_current', true)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = (data || []).map(mapProductToExportRow);
      const filename = `swarnix_products_${new Date().toISOString().slice(0, 10)}`;

      if (format === 'csv') {
        downloadCSV(rows, filename);
      } else {
        await downloadXLSX(rows, filename);
      }
      showToast(`Exported ${rows.length} products as ${format.toUpperCase()}`, '#166534');
    } catch (err) {
      showToast('Export failed: ' + err.message, '#C0392B');
    } finally {
      setExporting(false);
    }
  }, [store, showToast]);

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

  // When Studio Suite hands over an AI-model photo, open the Add Product modal
  // pre-populated. Consume-and-clear so it only fires once per hand-off.
  useEffect(() => {
    if (inventoryPrefill) {
      setEditProduct(null);
      setPrefillData(inventoryPrefill);
      setModalOpen(true);
      setInventoryPrefill(null);
    }
  }, [inventoryPrefill, setInventoryPrefill]);

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

  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id));

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

          {/* Export dropdown */}
          <div className={styles.sortWrap} ref={exportRef}>
            <button
              className={styles.importBtn}
              onClick={() => setExportOpen(p => !p)}
              disabled={exporting}
              title="Export products"
            >
              <Download size={14} />
              Export
              <ChevronDown size={12} />
            </button>
            {exportOpen && (
              <div className={styles.sortDropdown} style={{ minWidth: 150 }}>
                <button className={styles.sortOpt} onClick={() => handleExport('csv')}>
                  Export as CSV
                </button>
                <button className={styles.sortOpt} onClick={() => handleExport('xlsx')}>
                  Export as Excel (XLSX)
                </button>
              </div>
            )}
          </div>

          {canWrite && (
            <button
              className={`${styles.importBtn} ${selectMode ? styles.importBtnActive : ''}`}
              onClick={toggleSelectMode}
              title={selectMode ? 'Exit select mode' : 'Select products'}
            >
              <CheckSquare size={14} />
              {selectMode ? 'Cancel' : 'Select'}
            </button>
          )}

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

      {/* Selection action bar */}
      {selectMode && (
        <div className={styles.selectionBar}>
          <label className={styles.selectionCheckAll}>
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(p => p.id)) : new Set())}
              style={{ accentColor: 'var(--navy)', width: 15, height: 15, cursor: 'pointer' }}
            />
            {allFilteredSelected ? 'Deselect All' : 'Select All'}
          </label>
          <span className={styles.selectionCount}>
            {selectedIds.size > 0
              ? `${selectedIds.size} item${selectedIds.size !== 1 ? 's' : ''} selected`
              : 'Click products to select'}
          </span>
          {selectedIds.size > 0 && (
            <button
              className={styles.selectionDeleteBtn}
              onClick={() => setBulkConfirmOpen(true)}
            >
              <Trash2 size={13} />
              Delete {selectedIds.size} selected
            </button>
          )}
        </div>
      )}

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
                onEdit={canWrite && !selectMode ? () => openEdit(p) : null}
                onDelete={canWrite && !selectMode ? () => openDelete(p.id) : null}
                onToggleStock={canWrite && !selectMode ? () => handleToggleStock(p) : null}
                selectable={selectMode}
                selected={selectedIds.has(p.id)}
                onSelect={() => toggleSelect(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <ProductModal
          product={editProduct}
          store={store}
          prefill={prefillData}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditProduct(null); setPrefillData(null); }}
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
      {bulkConfirmOpen && (
        <ConfirmDialog
          message={`Delete ${selectedIds.size} selected product${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`}
          onConfirm={handleBulkDelete}
          onCancel={() => setBulkConfirmOpen(false)}
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
