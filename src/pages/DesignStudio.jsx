import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Wand2, Library, Plus, ArrowLeft, Lock, Gem } from 'lucide-react';
import {
  db, N8N_DESIGN_GENERATE, N8N_ADD_PRODUCT_VECTOR,
  CLOUDINARY_CLOUD, CLOUDINARY_PRESET,
} from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { effectiveLimit, hasFeature, fmtLimit } from '../lib/plans';
import { compressImage } from '../lib/imageUtils';
import { composeDesignPrompt } from '../lib/designPrompt';
import { toGoldCaratLabel, isDiamondStone, pieceTypeToCategory } from '../lib/designTaxonomy';
import { buildSpecSheet } from '../components/SpecSheet';
import DesignForm from '../components/DesignForm';
import DesignOutputs from '../components/DesignOutputs';
import PublishDesignDialog from '../components/PublishDesignDialog';
import styles from './DesignStudio.module.css';

// Sensible starting point so an owner can pick a piece type and generate fast.
function freshParams() {
  return {
    piece_type: '', earring_subtype: '',
    style: 'Contemporary / Minimalist',
    metal_type: 'Yellow Gold', purity: '22K', metal_weight_g: '', finish: 'High polish',
    hallmark: true,
    center: { stone_type: 'None' },
    accents: [],
    dimensions: {},
    motifs: [], motif_custom: '',
    occasion: '', target_wearer: 'Women',
    pricing: undefined,
    spec_notes: '',
  };
}

// Upload a File/Blob to Cloudinary (same unsigned preset the rest of the app
// uses). Used for the Mode-B reference image and the b64 generation fallback.
async function uploadToCloudinary(fileOrBlob, filename = 'design.jpg') {
  const compressed = await compressImage(fileOrBlob);
  const fd = new FormData();
  fd.append('file', compressed, filename);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', 'swarnix-designs');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Cloudinary upload failed');
  return (await res.json()).secure_url;
}

// Tell the WhatsApp image-search workflow about a freshly published product —
// the exact call the Inventory add flow makes.
async function vectorizeProductImage(productId, primaryImageUrl) {
  try {
    const res = await fetch(N8N_ADD_PRODUCT_VECTOR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, primary_image_url: primaryImageUrl }),
      credentials: 'omit', mode: 'cors',
    });
    const raw = await res.text().catch(() => '');
    let data = null; try { data = raw ? JSON.parse(raw) : null; } catch {}
    if (res.ok && data?.success === true) return { ok: true };
    return { ok: false, error: data?.message || raw?.slice(0, 160) || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e.message || 'network error' };
  }
}

// Short size string for the catalog "size" column.
function dimensionSummary(params) {
  return Object.entries(params.dimensions || {})
    .filter(([, v]) => v).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(', ');
}

// Readable description for the catalog/WhatsApp agent, built from the spec.
function buildDescription(spec) {
  const lines = [];
  const head = [spec.style, spec.earring_subtype, spec.piece_type].filter(Boolean).join(' ');
  if (head) lines.push(head + '.');
  if (spec.motifs.length) lines.push(`Motifs: ${spec.motifs.join(', ')}.`);
  if (spec.finish) lines.push(`${spec.finish} finish.`);
  const dims = Object.entries(spec.dimensions || {}).filter(([, v]) => v).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ');
  if (dims) lines.push(`Dimensions: ${dims}.`);
  if (spec.notes) lines.push(spec.notes);
  lines.push('Designed in Swarnix Design Studio.');
  return lines.join(' ');
}

export default function DesignStudio() {
  const { store, refreshStore } = useAuth();
  const { showToast } = useToast();

  const [view, setView] = useState('new');           // 'new' | 'library'
  const [params, setParams] = useState(freshParams);
  const [mode, setMode] = useState('scratch');        // 'scratch' | 'reference'

  const [referenceFile, setReferenceFile] = useState(null);
  const [referencePreview, setReferencePreview] = useState(null);
  const [referenceUrl, setReferenceUrl] = useState(null); // persisted Cloudinary URL once saved

  const [generating, setGenerating] = useState(false);
  const [renders, setRenders] = useState([]);
  const [error, setError] = useState(null);
  const [estimate, setEstimate] = useState(null);

  const [currentId, setCurrentId] = useState(null);
  const [status, setStatus] = useState('draft');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [suggestedSku, setSuggestedSku] = useState('');

  const [library, setLibrary] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  const objectUrlRef = useRef(null);

  // ── Plan gating (separate Design Studio quota) ──────────────────────
  const designUsed = store?._design_used || 0;
  const designLimit = effectiveLimit(store, 'design_studio');
  const featureOn = hasFeature(store, 'design_studio');
  const canUse = featureOn && (designLimit === Infinity || designUsed < designLimit);
  const usageText = designLimit === Infinity ? null : `${designUsed}/${fmtLimit(designLimit)} generations this month`;

  // ── Reference image handlers ────────────────────────────────────────
  const pickReference = (file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/')) { setError('Please choose an image file.'); return; }
    setError(null);
    setReferenceFile(file);
    setReferenceUrl(null);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setReferencePreview(objectUrlRef.current);
  };
  const clearReference = () => {
    setReferenceFile(null);
    setReferencePreview(null);
    setReferenceUrl(null);
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
  };
  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);

  // ── Generate ────────────────────────────────────────────────────────
  const runGenerate = useCallback(async (variation = false) => {
    if (!params.piece_type) { setError('Pick a piece type first.'); return; }
    if (mode === 'reference' && !referenceFile && !referenceUrl) { setError('Upload a reference image, or switch to "From scratch".'); return; }
    if (!canUse) return;

    setGenerating(true);
    setError(null);
    try {
      const prompt = composeDesignPrompt(params, { mode });
      const fd = new FormData();
      fd.append('owner_id', store.owner_id);
      fd.append('prompt', prompt);
      fd.append('mode', mode);
      fd.append('variation', variation ? '1' : '0');
      if (mode === 'reference' && referenceFile) fd.append('reference', referenceFile);

      const res = await fetch(N8N_DESIGN_GENERATE, { method: 'POST', body: fd, credentials: 'omit', mode: 'cors' });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`Generation failed (${res.status})${t ? ': ' + t.slice(0, 120) : ''}`);
      }
      const data = await res.json();

      // Accept a few shapes: { renders: [...] }, { result_url }, { secure_url },
      // or inline base64 we upload ourselves as a safety net.
      let urls = [];
      if (Array.isArray(data?.renders)) urls = data.renders.filter(Boolean);
      else if (data?.result_url) urls = [data.result_url];
      else if (data?.secure_url) urls = [data.secure_url];
      else if (data?.data?.[0]?.b64_json) {
        const b64 = data.data[0].b64_json;
        const bin = atob(b64); const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const url = await uploadToCloudinary(new Blob([arr], { type: 'image/jpeg' }), `design_${store.owner_id}_${Date.now()}.jpg`);
        urls = [url];
      }
      if (!urls.length) throw new Error('No image URL in response. Check the n8n workflow output.');

      setRenders(urls);
      setStatus('draft');

      // Count the generation against the monthly quota.
      await db.from('stores').update({ _design_used: Math.floor(designUsed || 0) + 1 }).eq('owner_id', store.owner_id);
      await refreshStore();
    } catch (e) {
      setError(e.message || 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }, [params, mode, referenceFile, referenceUrl, canUse, store, designUsed, refreshStore]);

  // ── Library ─────────────────────────────────────────────────────────
  const loadLibrary = useCallback(async () => {
    if (!store?.owner_id) return;
    setLibraryLoading(true);
    const { data } = await db
      .from('design_studio_designs')
      .select('id, piece_type, style, status, mode, primary_render_url, price_estimate, created_at, params, render_urls, reference_image_url')
      .eq('owner_id', store.owner_id)
      .in('status', ['saved', 'published'])
      .order('created_at', { ascending: false });
    setLibrary(data || []);
    setLibraryLoading(false);
  }, [store]);

  useEffect(() => { if (view === 'library') loadLibrary(); }, [view, loadLibrary]);

  // ── Save / publish / discard ────────────────────────────────────────
  const persist = useCallback(async (targetStatus) => {
    // Persist the reference image so a Mode-B design reopens with it.
    let refUrl = referenceUrl;
    if (mode === 'reference' && referenceFile && !refUrl) {
      try { refUrl = await uploadToCloudinary(referenceFile, `ref_${store.owner_id}_${Date.now()}.jpg`); setReferenceUrl(refUrl); } catch {}
    }
    const spec = buildSpecSheet(params, estimate);
    const row = {
      owner_id: store.owner_id,
      piece_type: params.piece_type || null,
      style: params.style || null,
      status: targetStatus,
      mode,
      params,
      reference_image_url: refUrl || null,
      prompt_text: composeDesignPrompt(params, { mode }),
      render_urls: renders,
      primary_render_url: renders[0] || null,
      price_estimate: estimate || null,
      spec_sheet: spec,
    };
    if (currentId) {
      await db.from('design_studio_designs').update(row).eq('id', currentId).eq('owner_id', store.owner_id);
      return currentId;
    }
    const { data, error: err } = await db.from('design_studio_designs').insert(row).select('id').single();
    if (err) throw err;
    setCurrentId(data.id);
    return data.id;
  }, [params, mode, renders, estimate, referenceFile, referenceUrl, currentId, store]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await persist('saved');
      setStatus('saved');
      showToast('Saved to your design library.', '#15803d');
    } catch (e) {
      showToast('Save failed: ' + (e.message || 'unknown'), '#be123c');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setParams(freshParams());
    setMode('scratch');
    clearReference();
    setRenders([]);
    setEstimate(null);
    setCurrentId(null);
    setStatus('draft');
    setError(null);
  };

  const handleDiscard = async () => {
    try {
      if (currentId) {
        await db.from('design_studio_designs').update({ status: 'discarded' }).eq('id', currentId).eq('owner_id', store.owner_id);
      }
      showToast('Design discarded.', '#be123c');
    } catch (e) {
      showToast('Could not discard: ' + e.message, '#be123c');
    }
    resetForm();
  };

  const checkSKU = useCallback(async (sku) => {
    const { data } = await db.from('products').select('id').eq('sku', sku).eq('owner_id', store.owner_id).eq('is_current', true);
    return !data || data.length === 0;
  }, [store]);

  const openPublish = () => {
    if (!renders.length) { setError('Generate a render first — the catalog needs a product image.'); return; }
    setSuggestedSku(`DSN-${Math.floor(1000 + Math.random() * 9000)}`);
    setPublishOpen(true);
  };

  const doPublish = async ({ sku, name, category, sub_category }) => {
    setPublishing(true);
    try {
      const designId = await persist('saved');       // make sure it's stored first
      const spec = buildSpecSheet(params, estimate);
      const center = params.center || {};
      const diamond = isDiamondStone(center.stone_type);

      const payload = {
        sku, name,
        category, sub_category: sub_category || null,
        gold_carat: toGoldCaratLabel(params.metal_type, params.purity),
        collection: 'Design Studio',
        size: dimensionSummary(params) || null,
        color: null,
        material: (center.stone_type && center.stone_type !== 'None') ? center.stone_type : null,
        diamond_purity: diamond ? (center.clarity || null) : null,
        diamond_color: diamond ? (center.color || null) : null,
        diamond_weight: diamond && center.carat ? Number(center.carat) : null,
        diamond_shape: diamond ? (center.shape || null) : null,
        diamond_count: diamond && center.count ? Number(center.count) : null,
        stone_count: center.count ? Number(center.count) : null,
        occasion: params.occasion || null,
        weight: Number(params.metal_weight_g) || 0,
        net_weight_grams: Number(params.metal_weight_g) || null,
        price: estimate?.total || 0,
        stock_qty: 1,
        description: buildDescription(spec),
        in_stock: true,
        visibility: 'all',
        dynamic_price: false,
        hallmark_charge: Number(params.pricing?.hallmark_fee) || 45,
        owner_id: store.owner_id,
        images: renders,
        primary_image_url: renders[0] || null,
        is_current: true,
      };

      const { data, error: err } = await db.from('products').insert(payload).select().single();
      if (err) throw err;

      await db.from('design_studio_designs')
        .update({ status: 'published', published_product_id: data.id })
        .eq('id', designId).eq('owner_id', store.owner_id);

      setStatus('published');
      setPublishOpen(false);
      showToast('Published to catalog — now findable by the WhatsApp assistant.', '#15803d');

      if (data.primary_image_url) {
        vectorizeProductImage(data.id, data.primary_image_url).then(({ ok, error: vErr }) => {
          showToast(ok ? 'Image-search indexing complete.' : `Image-search indexing failed: ${vErr}`, ok ? '#15803d' : '#be123c');
        });
      }
    } catch (e) {
      showToast('Publish failed: ' + (e.message || 'unknown'), '#be123c');
    } finally {
      setPublishing(false);
    }
  };

  // Open a saved/published design back into the editor.
  const openDesign = (row) => {
    setParams({ ...freshParams(), ...(row.params || {}) });
    setMode(row.mode || 'scratch');
    setRenders(row.render_urls || []);
    setCurrentId(row.id);
    setStatus(row.status || 'saved');
    setReferenceUrl(row.reference_image_url || null);
    setReferencePreview(row.reference_image_url || null);
    setReferenceFile(null);
    setEstimate(row.price_estimate || null);
    setError(null);
    setView('new');
  };

  const headerSub = useMemo(() => (
    mode === 'reference'
      ? 'Upload a reference, set the specs, and generate a reinterpretation.'
      : 'Design a piece field by field, then generate a photorealistic render.'
  ), [mode]);

  // ── Feature locked ──────────────────────────────────────────────────
  if (!featureOn) {
    return (
      <div className={styles.page}>
        <div className={styles.lock}>
          <Lock size={30} strokeWidth={1.4} />
          <h2>Design Studio is a Professional feature</h2>
          <p>Generate photorealistic jewellery designs, price estimates and maker's spec sheets. Upgrade your plan to use it.</p>
        </div>
      </div>
    );
  }

  const generateDisabled = generating || !canUse || !params.piece_type || (mode === 'reference' && !referenceFile && !referenceUrl);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headLeft}>
          <h1 className={styles.title}><Gem size={20} /> Design Studio</h1>
          <p className={styles.sub}>{view === 'library' ? 'Your private design library.' : headerSub}</p>
        </div>
        <div className={styles.headActions}>
          {view === 'new' ? (
            <>
              <button className={styles.tabBtn} onClick={resetForm} title="Start a new design"><Plus size={15} /> New</button>
              <button className={styles.tabBtn} onClick={() => setView('library')}><Library size={15} /> Library</button>
            </>
          ) : (
            <button className={styles.tabBtn} onClick={() => setView('new')}><ArrowLeft size={15} /> Back to design</button>
          )}
        </div>
      </div>

      {!canUse && (
        <div className={styles.limitNote}>
          You've used all {fmtLimit(designLimit)} Design Studio generations this month. Saved designs still publish; new renders resume next cycle or after an upgrade.
        </div>
      )}

      {view === 'new' ? (
        <div className={styles.layout}>
          <div className={styles.col}>
            <DesignForm
              params={params} setParams={setParams}
              mode={mode} setMode={setMode}
              referencePreview={referencePreview}
              onPickReference={pickReference} onClearReference={clearReference}
              onGenerate={() => runGenerate(false)}
              generating={generating}
              generateDisabled={generateDisabled}
              usageText={usageText}
            />
          </div>
          <div className={styles.col}>
            <DesignOutputs
              renders={renders} generating={generating} error={error}
              onRegenerate={() => runGenerate(false)} onVariation={() => runGenerate(true)}
              params={params} setParams={setParams}
              estimate={estimate} onEstimate={setEstimate}
              status={status} saving={saving} publishing={publishing}
              onDiscard={handleDiscard} onSave={handleSave} onPublish={openPublish}
            />
          </div>
        </div>
      ) : (
        <LibraryView library={library} loading={libraryLoading} onOpen={openDesign} />
      )}

      {publishOpen && (
        <PublishDesignDialog
          params={params} estimate={estimate} primaryRenderUrl={renders[0]}
          suggestedSku={suggestedSku} checkSKU={checkSKU}
          publishing={publishing} onConfirm={doPublish} onClose={() => setPublishOpen(false)}
        />
      )}
    </div>
  );
}

// ── Library grid ──────────────────────────────────────────────────────
function LibraryView({ library, loading, onOpen }) {
  if (loading) {
    return <div className={styles.libState}><div className="spinner" /></div>;
  }
  if (!library.length) {
    return (
      <div className={styles.libEmpty}>
        <Library size={40} strokeWidth={1.1} />
        <h3>No saved designs yet</h3>
        <p>Designs you save appear here. Open one anytime to edit, regenerate or publish.</p>
      </div>
    );
  }
  return (
    <div className={styles.libGrid}>
      {library.map(d => (
        <button key={d.id} className={styles.libCard} onClick={() => onOpen(d)}>
          <div className={styles.libThumb}>
            {d.primary_render_url
              ? <img src={d.primary_render_url} alt={d.piece_type || 'design'} />
              : <Gem size={26} />}
            {d.status === 'published' && <span className={styles.libBadge}>Published</span>}
          </div>
          <div className={styles.libMeta}>
            <strong>{[d.style, d.piece_type].filter(Boolean).join(' · ') || 'Design'}</strong>
            <span>{d.price_estimate?.total ? '₹' + Number(d.price_estimate.total).toLocaleString('en-IN') : 'No estimate'}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
