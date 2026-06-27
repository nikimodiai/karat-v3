import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Sparkles, RefreshCw, PlusCircle, X, AlertCircle, Camera, Maximize2, Share2, Copy, Check, ChevronRight } from 'lucide-react';
import { N8N_AI_MODEL, db, CLOUDINARY_CLOUD, CLOUDINARY_PRESET, MAX_IMAGE_BYTES } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import { effectiveLimit, hasFeature } from '../lib/plans';
import { compressImage, shareImageFile } from '../lib/imageUtils';
import styles from './AIModelPanel.module.css';

// Map jewelry category → jewelry type label sent to the n8n workflow
const CATEGORY_TO_JEWELRY_TYPE = {
  Earring:       'earrings',
  Necklace:      'necklace',
  Pendant:       'necklace',
  Mangalsutra:   'mangalsutra',
  Chain:         'necklace',
  Ring:          'ring',
  Bangle:        'bangles',
  Bracelet:      'bracelet',
  Anklet:        'anklet',
  Nosepin:       'nose_pin',
  'Maang Tikka': 'maang_tikka',
  Bajuband:      'armlet',
  Kamarband:     'waist_chain',
  'Haath Phool': 'bracelet',
  Bichhiya:      'anklet',
  Set:           'necklace',
};

function jewelryTypeForCategory(category) {
  return CATEGORY_TO_JEWELRY_TYPE[category] || 'jewellery';
}

// ── Owner tuning options (chips) ────────────────────────────────────
const OCCASIONS = [
  { v: 'bridal',  label: '💍 Bridal',     tip: 'Heavy traditional bridal styling — rich outfit, ornate backdrop, full glam. Best for wedding-season pieces.' },
  { v: 'festive', label: '🪔 Festive',    tip: 'Festival look — vibrant ethnic wear and a warm festive backdrop. Great for Diwali / Navratri collections.' },
  { v: 'party',   label: '🎉 Party',      tip: 'Party / cocktail styling — modern outfit, glam lighting. Good for contemporary & diamond pieces.' },
  { v: 'daily',   label: '☀️ Daily wear', tip: 'Everyday casual look — light outfit, simple background. Best for lightweight daily-wear jewellery.' },
  { v: 'office',  label: '💼 Office',      tip: 'Clean minimal look — neutral outfit, plain studio background. Best for subtle office-wear jewellery.' },
];
const MODELS = [
  { v: 'female', label: 'Female', tip: 'A female model wears the jewellery. Best for earrings, necklaces, bangles, mangalsutra.' },
  { v: 'male',   label: 'Male',   tip: "A male model wears the jewellery. Best for men's rings, chains, bracelets, kada." },
];
const SKIN = [
  { v: 'auto',     label: 'Auto',                    tip: 'Let AI pick a natural skin tone.' },
  { v: 'fair',     label: 'Fair',     dot: '#f3d6bd', tip: 'Light / fair complexion.' },
  { v: 'wheatish', label: 'Wheatish', dot: '#d9ab84', tip: 'Wheatish / medium complexion — the most common Indian skin tone.' },
  { v: 'dusky',    label: 'Dusky',    dot: '#a9743f', tip: 'Dusky / tan complexion.' },
  { v: 'deep',     label: 'Deep',     dot: '#6b4424', tip: 'Deep / dark complexion.' },
];
const FRAMING = [
  { v: 'full_portrait', label: 'Full portrait',   tip: 'Full face and shoulders visible — a classic model portrait.' },
  { v: 'half_face',     label: 'Half-face',        tip: 'Only the lower half of the face shows (lips, neck, jewellery). Keeps focus on the piece and avoids a recognisable face.' },
  { v: 'close_up',      label: 'Close-up region',  tip: 'Tight close-up on just the area that matters — ears for earrings, neckline for necklaces, hand for rings.' },
  { v: 'neck_only',     label: 'Neck only',        tip: 'Only the neck and collarbone are shown — no full face. Clean look for necklaces & pendants.' },
  { v: 'hands_only',    label: 'Hands only',       tip: 'Only the hands are shown — no face. Best for rings and bracelets.' },
  { v: 'macro',         label: 'Macro on skin',    tip: 'Extreme macro of the jewellery resting on skin — almost product-like, with a human touch.' },
];
const POSE = [
  { v: 'auto',           label: 'Auto',           tip: 'Let AI pick the most flattering angle for this jewellery.' },
  { v: 'front',          label: 'Front',          tip: 'Model looks straight at the camera. Best for necklaces & mangalsutra.' },
  { v: 'three_quarter',  label: '3/4 turn',       tip: 'Model turned slightly — shows both the face and the side. A natural, editorial look.' },
  { v: 'side_profile',   label: 'Side profile',   tip: 'Full side view. Best for earrings, nose pins and maang tikka.' },
  { v: 'hand_near_face', label: 'Hand near face', tip: 'Hand raised near the face — shows rings, bangles and earrings together in one shot.' },
];
const ATTIRE = [
  { v: 'auto',        label: 'Auto',         tip: 'Let AI pick an outfit that suits the jewellery.' },
  { v: 'saree',       label: 'Saree',        tip: 'Traditional saree — elegant draping, great for necklaces & mangalsutra.' },
  { v: 'lehenga',     label: 'Lehenga',      tip: 'Festive lehenga — full ethnic look for bridal and festive jewellery.' },
  { v: 'bridal',      label: 'Bridal',       tip: 'Full bridal outfit with heavy detailing — for premium wedding sets.' },
  { v: 'indo_western',label: 'Indo-western', tip: 'Indo-western fusion — modern yet ethnic. Good for contemporary pieces.' },
  { v: 'gown',        label: 'Gown',         tip: 'Western evening gown — for diamond and contemporary jewellery.' },
  { v: 'plain',       label: 'Plain neutral',tip: 'A plain, neutral top so nothing competes with the jewellery.' },
];
const ATTIRE_COLOR = [
  { v: 'neutral', label: 'Neutral',    dot: '#cfcfcf', tip: 'Neutral / muted outfit colour — lets the jewellery stand out.' },
  { v: 'red',     label: 'Red',        dot: '#b4232a', tip: 'Red outfit — classic festive & bridal contrast for gold.' },
  { v: 'pastel',  label: 'Pastel',     dot: '#f2c9d4', tip: 'Soft pastel outfit — gentle, modern look.' },
  { v: 'jewel',   label: 'Jewel-tone', dot: '#1f5c4d', tip: 'Rich jewel-tone outfit (emerald, royal blue, maroon).' },
  { v: 'black',   label: 'Black',      dot: '#111111', tip: 'Black outfit — high contrast, makes diamonds & polki shine.' },
];
const BACKGROUND = [
  { v: 'studio_white', label: 'Studio white',   tip: 'Clean white studio — the standard e-commerce / catalogue look.' },
  { v: 'studio_grey',  label: 'Studio grey',    tip: 'Neutral grey studio — soft and premium.' },
  { v: 'beige',        label: 'Beige',          tip: 'Warm beige backdrop — flatters gold jewellery.' },
  { v: 'gradient',     label: 'Soft gradient',  tip: 'Soft colour gradient behind the model — modern and vibrant.' },
  { v: 'mandap',       label: 'Wedding mandap', tip: 'Decorated wedding stage / mandap — for bridal sets.' },
  { v: 'palace',       label: 'Palace',         tip: 'Royal palace interior — luxurious, regal feel.' },
  { v: 'outdoor',      label: 'Outdoor bokeh',  tip: 'Blurred outdoor background (bokeh) — natural lifestyle look.' },
  { v: 'brand',        label: 'Brand colour',   tip: 'Use your own brand colour as the background. Pick the swatch.' },
];
const ASPECT = [
  { v: '1:1',  label: 'Square 1:1',    tip: 'Square — best for Instagram & catalogue grids.' },
  { v: '4:5',  label: 'Portrait 4:5',  tip: 'Tall portrait — fills more of the phone screen.' },
  { v: '9:16', label: 'Story 9:16',    tip: 'Full-screen vertical — for WhatsApp / Instagram Stories & Reels.' },
  { v: '16:9', label: 'Landscape 16:9',tip: 'Wide — for website banners.' },
];
const LIGHTING = [
  { v: 'clean',     label: 'Clean e-commerce', tip: 'Bright, even lighting — clean catalogue style.' },
  { v: 'soft',      label: 'Soft studio',      tip: 'Gentle, flattering studio light.' },
  { v: 'editorial', label: 'Editorial',        tip: 'High-fashion magazine look with dramatic shadows.' },
  { v: 'golden',    label: 'Golden hour',      tip: 'Warm sunset glow — flatters gold jewellery.' },
  { v: 'moody',     label: 'Moody dark',       tip: 'Dark, moody background — makes diamonds & polki sparkle.' },
];
const PHOTOS = [1, 2, 4];

const DEFAULT_SEL = {
  occasion: 'festive',
  model_gender: 'female',
  skin_tone: 'auto',
  framing: 'half_face',
  pose: 'auto',
  attire: 'auto',
  attire_color: 'neutral',
  background: 'studio_white',
  brand_color: '#0B1829',
  aspect: '1:1',
  lighting: 'clean',
  custom_note: '',
  photos: 1,
};

// Upload generated image blob to Cloudinary and return the secure_url
async function uploadBlobToCloudinary(blob, filename) {
  const compressed = await compressImage(blob);
  const fd = new FormData();
  fd.append('file', compressed, filename);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', 'swarnix-ai-models');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) throw new Error('Cloudinary upload failed');
  const json = await res.json();
  return json.secure_url;
}

export default function AIModelPanel({ category, onAddImage }) {
  const { store, refreshStore } = useAuth();
  const fileRef = useRef(null);
  const camRef  = useRef(null);

  const [srcFile, setSrcFile]       = useState(null);
  const [srcPreview, setSrcPrev]    = useState(null);
  const [generating, setGenerating] = useState(false);
  const [results, setResults]       = useState([]);     // [{ url, added }]
  const [error, setError]           = useState(null);
  const [lightboxUrl, setLightbox]  = useState(null);
  const [copied, setCopied]         = useState(false);
  const [shareOpen, setShareOpen]   = useState(false);
  const [showAdvanced, setAdvanced] = useState(false);
  const [sel, setSel]               = useState(DEFAULT_SEL);

  // ── Tooltip (hover on laptop, tap on touch) ──
  const isTouch = useRef(typeof window !== 'undefined' && window.matchMedia?.('(hover:none)').matches).current;
  const [tip, setTip] = useState(null);   // { text, rect, place }
  const tipTimer = useRef(null);
  const openTip = (el, text) => {
    if (!text) return;
    const rect = el.getBoundingClientRect();
    setTip({ text, rect, place: rect.top > 170 ? 'above' : 'below' });
  };
  const openTipTimed = (el, text) => {
    openTip(el, text);
    clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip(null), 3200);
  };
  const closeTip = () => setTip(null);
  useEffect(() => {
    const h = () => setTip(null);
    window.addEventListener('scroll', h, true);
    window.addEventListener('resize', h);
    return () => { window.removeEventListener('scroll', h, true); window.removeEventListener('resize', h); };
  }, []);

  const aiUsed  = store?._ai_used || 0;
  const aiLimit = effectiveLimit(store, 'ai_models');
  const remaining = aiLimit === Infinity ? Infinity : Math.max(0, aiLimit - aiUsed);
  const canUse  = hasFeature(store, 'ai_models') && remaining > 0;

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    setError(null);
    setResults([]);
    setSrcFile(file);
    setSrcPrev(URL.createObjectURL(file));
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, []);

  // Build the multipart body for one generation request
  const buildFormData = () => {
    const fd = new FormData();
    fd.append('image', srcFile);
    fd.append('owner_id', store.owner_id);
    fd.append('jewelry_type', jewelryTypeForCategory(category));
    fd.append('source', 'web');
    fd.append('occasion', sel.occasion);
    fd.append('model_gender', sel.model_gender);
    fd.append('skin_tone', sel.skin_tone);
    fd.append('framing', sel.framing);
    fd.append('pose', sel.pose);
    fd.append('attire', sel.attire);
    fd.append('attire_color', sel.attire_color);
    fd.append('background', sel.background);
    if (sel.background === 'brand') fd.append('brand_color', sel.brand_color);
    fd.append('aspect_ratio', sel.aspect);
    fd.append('lighting', sel.lighting);
    if (sel.custom_note.trim()) fd.append('custom_note', sel.custom_note.trim().slice(0, 300));
    return fd;
  };

  // One webhook call → returns a result URL (throws on failure)
  const generateOne = async () => {
    const res = await fetch(N8N_AI_MODEL, {
      method: 'POST',
      body: buildFormData(),
      credentials: 'omit',
      mode: 'cors',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Generation failed (${res.status})${text ? ': ' + text.slice(0, 120) : ''}`);
    }
    const data = await res.json();
    if (data?.result_url)        return data.result_url;
    if (data?.secure_url)        return data.secure_url;
    if (data?.[0]?.result_url)   return data[0].result_url;
    if (data?.data?.[0]?.b64_json) {
      const b64 = data.data[0].b64_json;
      const binary = atob(b64);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      const blob = new Blob([arr], { type: 'image/jpeg' });
      return uploadBlobToCloudinary(blob, `ai_model_${store.owner_id}_${Date.now()}.jpg`);
    }
    throw new Error('No image URL in response. Check n8n workflow output.');
  };

  const generate = async () => {
    if (!srcFile || !canUse) return;
    const n = sel.photos;
    if (remaining !== Infinity && n > remaining) {
      setError(`Generating ${n} photos would exceed your monthly limit (${remaining} left). Pick fewer photos.`);
      return;
    }

    setGenerating(true);
    setError(null);
    setResults([]);
    setShareOpen(false);

    try {
      const settled = await Promise.allSettled(Array.from({ length: n }, () => generateOne()));
      const urls = settled.filter(s => s.status === 'fulfilled' && s.value).map(s => s.value);

      if (urls.length === 0) {
        const firstErr = settled.find(s => s.status === 'rejected');
        throw new Error(firstErr?.reason?.message || 'Generation failed. Please try again.');
      }

      setResults(urls.map(url => ({ url, added: false })));

      // Charge the quota by the number of photos actually produced
      await db
        .from('stores')
        .update({ _ai_used: Math.floor(aiUsed || 0) + urls.length })
        .eq('owner_id', store.owner_id);
      await refreshStore();

      if (urls.length < n) {
        setError(`${urls.length} of ${n} photos generated — the rest failed. You were only charged for ${urls.length}.`);
      }
    } catch (err) {
      setError(err.message || 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddToProduct = (url) => {
    onAddImage(url);
    setResults(rs => rs.map(r => (r.url === url ? { ...r, added: true } : r)));
  };

  const reset = () => {
    setSrcFile(null);
    setSrcPrev(null);
    setResults([]);
    setError(null);
    setLightbox(null);
    setShareOpen(false);
    setCopied(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleCopyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleShare = (platform, url) => {
    const text = encodeURIComponent('Check out this jewellery look! 💎');
    const u    = encodeURIComponent(url);
    const shareUrls = {
      whatsapp:  `https://wa.me/?text=${text}%20${u}`,
      instagram: `https://www.instagram.com/`,
      gmail:     `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent('Jewellery Look')}&body=${text}%20${u}`,
      twitter:   `https://twitter.com/intent/tweet?text=${text}&url=${u}`,
    };
    if (platform === 'instagram' && navigator.share) {
      navigator.share({ title: 'Jewellery Look', text: 'Check out this jewellery look! 💎', url }).catch(() => {});
      return;
    }
    if (shareUrls[platform]) window.open(shareUrls[platform], '_blank');
    setShareOpen(false);
  };

  const handleNativeShare = async (url) => {
    const shared = await shareImageFile(url, { title: 'AI Jewellery Model', text: 'Check out this jewellery look! 💎' });
    if (!shared) setShareOpen(v => !v);
  };

  // ── Tooltip prop helpers ──
  const tipProps = (text) => isTouch
    ? { onClick: (e) => { e.stopPropagation(); openTipTimed(e.currentTarget, text); } }
    : { onMouseEnter: (e) => openTip(e.currentTarget, text), onMouseLeave: closeTip };

  const infoDot = (text) => (
    <span className={styles.infoDot} role="button" aria-label="Help" {...tipProps(text)}>i</span>
  );

  // Render a single-select chip group
  const chipGroup = (key, options) => (
    <div className={styles.chips}>
      {options.map(o => {
        const active = sel[key] === o.v;
        const onPick = (e) => {
          setSel(s => ({ ...s, [key]: o.v }));
          if (isTouch) openTipTimed(e.currentTarget, o.tip);
        };
        return (
          <button
            key={o.v}
            type="button"
            className={`${styles.chip} ${active ? styles.chipActive : ''}`}
            onClick={onPick}
            {...(!isTouch ? { onMouseEnter: (e) => openTip(e.currentTarget, o.tip), onMouseLeave: closeTip } : {})}
          >
            {o.dot && <span className={styles.dot} style={{ background: o.dot }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );

  const groupHead = (label, tipText, hint) => (
    <div className={styles.groupHead}>
      <span className={styles.groupLabel}>{label}</span>
      {tipText && infoDot(tipText)}
      {hint && <span className={styles.groupHint}>{hint}</span>}
    </div>
  );

  const tipStyle = () => {
    if (!tip) return {};
    const tw = 220;
    let left = tip.rect.left + tip.rect.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    const top = tip.place === 'above' ? tip.rect.top - 8 : tip.rect.bottom + 8;
    return {
      left, top, maxWidth: tw,
      transform: tip.place === 'above' ? 'translateY(-100%)' : 'none',
    };
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <Sparkles size={13} className={styles.sparkIcon} />
        <span className={styles.headerText}>Generate AI Model</span>
        {aiLimit !== Infinity && (
          <span className={styles.usageBadge}>{aiUsed}/{aiLimit} used</span>
        )}
      </div>

      {!hasFeature(store, 'ai_models') ? (
        <div className={styles.upgradeNote}>
          AI model generation is available on Pro and higher plans. Upgrade to generate campaign-quality model photos.
        </div>
      ) : (
        <>
          <p className={styles.hint}>
            Upload a jewellery photo, tune the model below, then generate. Leave anything on “Auto” to let AI decide.
          </p>

          {/* Source image upload */}
          {!srcPreview && (
            <div className={styles.dropZoneWrap}>
              <div
                className={styles.dropZone}
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
              >
                <Upload size={22} strokeWidth={1.5} className={styles.dropIcon} />
                <span>Click or drag jewellery photo here</span>
                <small>JPG, PNG, WebP · Max 5 MB</small>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files?.[0])}
                />
              </div>
              <button
                type="button"
                className={styles.camBtn}
                onClick={() => camRef.current?.click()}
                title="Take photo with camera"
              >
                <Camera size={15} strokeWidth={1.5} /> Camera
              </button>
              <input
                ref={camRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files?.[0])}
              />
            </div>
          )}

          {srcPreview && (
            <>
              {/* Uploaded jewellery thumb */}
              <div className={styles.upRow}>
                <div className={styles.upThumbWrap}>
                  <img src={srcPreview} alt="jewellery" className={styles.upThumb} />
                  {!generating && (
                    <button className={styles.removeBtn} onClick={reset} title="Remove">
                      <X size={11} />
                    </button>
                  )}
                </div>
                <div className={styles.upMeta}>
                  <b>Jewellery photo ready</b>
                  <span>Category: {category || '—'}</span>
                </div>
              </div>

              {/* ── Occasion (top) ── */}
              <div className={styles.occasionBox}>
                {groupHead('Occasion', 'Pick the occasion first. One tap sets a matching outfit, background and mood below — you can still change any of them after.')}
                {chipGroup('occasion', OCCASIONS)}
              </div>

              {/* ── Core controls ── */}
              <div className={styles.group}>
                {groupHead('Model', 'Who wears the jewellery in the photo.')}
                {chipGroup('model_gender', MODELS)}
              </div>

              <div className={styles.group}>
                {groupHead('Skin tone', 'Show your jewellery on the complexion your customers actually have — gold and diamond read very differently on fair vs deep skin.')}
                {chipGroup('skin_tone', SKIN)}
              </div>

              <div className={styles.group}>
                {groupHead('Framing', "How much of the model is in the photo. Tighter crops keep all attention on the jewellery. 'Hands only' / 'Neck only' crop out the face entirely.")}
                {chipGroup('framing', FRAMING)}
              </div>

              <div className={styles.group}>
                {groupHead('Pose / angle', 'The angle the model faces. Side profile shows off earrings, nose pins and maang tikka best.')}
                {chipGroup('pose', POSE)}
              </div>

              <div className={styles.group}>
                {groupHead('Attire', 'The outfit the model wears, and its colour. A neckline and colour that complement your metal make the jewellery pop.')}
                {chipGroup('attire', ATTIRE)}
                <div style={{ marginTop: 7 }}>{chipGroup('attire_color', ATTIRE_COLOR)}</div>
              </div>

              <div className={styles.group}>
                {groupHead('Background', 'The setting behind the model. Plain studio looks are clean for catalogues; lifestyle backdrops tell a story for social media.')}
                {chipGroup('background', BACKGROUND)}
                {sel.background === 'brand' && (
                  <label className={styles.brandColorRow}>
                    <span>Brand colour:</span>
                    <input
                      type="color"
                      className={styles.swatchInput}
                      value={sel.brand_color}
                      onChange={e => setSel(s => ({ ...s, brand_color: e.target.value }))}
                    />
                    <code>{sel.brand_color}</code>
                  </label>
                )}
              </div>

              {/* ── Advanced ── */}
              <button
                type="button"
                className={`${styles.advToggle} ${showAdvanced ? styles.advOpen : ''}`}
                onClick={() => setAdvanced(v => !v)}
              >
                <ChevronRight size={14} className={styles.caret} /> Advanced options
              </button>
              {showAdvanced && (
                <div className={styles.advBody}>
                  <div className={styles.group}>
                    {groupHead('Aspect ratio', "The shape of the final image — match it to where you'll post. Square for the feed, 9:16 for a WhatsApp / Instagram Story.")}
                    {chipGroup('aspect', ASPECT)}
                  </div>
                  <div className={styles.group}>
                    {groupHead('Lighting / look', 'The overall mood of the photo — from bright catalogue lighting to dramatic editorial shadows.')}
                    {chipGroup('lighting', LIGHTING)}
                  </div>
                </div>
              )}

              {/* ── Custom note ── */}
              <div className={styles.group}>
                {groupHead('Custom note', "Type anything the buttons above don't cover, in plain language. The AI will try to follow it.", 'optional')}
                <textarea
                  className={styles.note}
                  placeholder="e.g. open hair, red bindi, temple jewellery vibe, soft smile…"
                  maxLength={300}
                  value={sel.custom_note}
                  onChange={e => setSel(s => ({ ...s, custom_note: e.target.value }))}
                />
              </div>

              {/* ── Results ── */}
              {(generating || results.length > 0) && (
                <div className={styles.resultsBlock}>
                  <div className={styles.resultsHead}>
                    {generating
                      ? `Generating ${sel.photos} photo${sel.photos > 1 ? 's' : ''}…`
                      : results.length > 1
                        ? 'Pick the photos to add to your product'
                        : 'Your AI model'}
                  </div>
                  <div className={styles.resultsGrid} data-multi={(generating ? sel.photos : results.length) > 1}>
                    {generating
                      ? Array.from({ length: sel.photos }).map((_, i) => (
                          <div key={i} className={styles.resultCell}>
                            <div className={styles.generatingBox}>
                              <div className="spinner" />
                              <small>30–60s</small>
                            </div>
                          </div>
                        ))
                      : results.map(({ url, added }) => (
                          <div key={url} className={styles.resultCell}>
                            <div className={styles.imgWrap}>
                              <img src={url} alt="AI model" className={styles.resultImg} />
                              <button className={styles.maximizeBtn} onClick={() => setLightbox(url)} title="View full size">
                                <Maximize2 size={12} />
                              </button>
                            </div>
                            {added ? (
                              <span className={styles.addedBadge}>✓ Added</span>
                            ) : (
                              <button className={styles.addBtnSm} onClick={() => handleAddToProduct(url)}>
                                <PlusCircle size={13} /> Add to Images
                              </button>
                            )}
                          </div>
                        ))}
                  </div>
                </div>
              )}

              {error && (
                <div className={styles.errorRow}>
                  <AlertCircle size={13} />
                  <span>{error}</span>
                </div>
              )}

              {/* ── Actions ── */}
              <div className={styles.actions}>
                <button className={styles.generateBtn} onClick={generate} disabled={generating || !canUse}>
                  {generating ? (
                    <><div className="spinner spinner-sm" /> Generating…</>
                  ) : results.length > 0 ? (
                    <><RefreshCw size={13} /> Regenerate</>
                  ) : (
                    <><Sparkles size={13} /> Generate AI Model</>
                  )}
                </button>

                <div className={styles.photosWrap}>
                  <span className={styles.photosLabel}>Photos</span>
                  {infoDot('How many photos to generate in one go. More photos give you variety to choose from, but use up more of your monthly quota.')}
                  <div className={styles.photoToggle}>
                    {PHOTOS.map(p => (
                      <button
                        key={p}
                        type="button"
                        className={`${styles.photoBtn} ${sel.photos === p ? styles.photoBtnActive : ''}`}
                        onClick={() => setSel(s => ({ ...s, photos: p }))}
                        disabled={generating}
                        title={`Generate ${p} photo${p > 1 ? 's' : ''}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {!canUse && (
                <div className={styles.upgradeNote}>
                  Monthly AI model limit reached ({aiUsed}/{aiLimit}). Upgrade your plan for more.
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Floating tooltip */}
      {tip && (
        <div className={`${styles.tip} ${styles[tip.place]}`} style={tipStyle()}>{tip.text}</div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className={styles.lightboxOverlay} onClick={() => { setLightbox(null); setShareOpen(false); }}>
          <div className={styles.lightboxContent} onClick={e => e.stopPropagation()}>
            <button className={styles.lightboxClose} onClick={() => { setLightbox(null); setShareOpen(false); }}>
              <X size={18} />
            </button>
            <img src={lightboxUrl} alt="AI model full size" className={styles.lightboxImg} />
            <div className={styles.lightboxActions}>
              {!results.find(r => r.url === lightboxUrl)?.added ? (
                <button className={styles.addBtn} onClick={() => { handleAddToProduct(lightboxUrl); }}>
                  <PlusCircle size={13} /> Add to Images
                </button>
              ) : (
                <span className={styles.addedBadge}>✓ Added to images</span>
              )}
              <div className={styles.shareWrap}>
                <button className={styles.shareBtn} onClick={() => handleNativeShare(lightboxUrl)}>
                  <Share2 size={13} /> Share
                </button>
                {shareOpen && (
                  <div className={styles.shareMenu}>
                    <button className={styles.shareMenuItem} onClick={() => handleShare('whatsapp', lightboxUrl)}>
                      <span className={styles.shareIcon} style={{ background: '#25D366' }}>W</span> WhatsApp
                    </button>
                    <button className={styles.shareMenuItem} onClick={() => handleShare('gmail', lightboxUrl)}>
                      <span className={styles.shareIcon} style={{ background: '#EA4335' }}>G</span> Gmail
                    </button>
                    <button className={styles.shareMenuItem} onClick={() => handleShare('instagram', lightboxUrl)}>
                      <span className={styles.shareIcon} style={{ background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' }}>I</span> Instagram
                    </button>
                    <button className={styles.shareMenuItem} onClick={() => handleShare('twitter', lightboxUrl)}>
                      <span className={styles.shareIcon} style={{ background: '#000' }}>𝕏</span> Twitter / X
                    </button>
                    <button className={styles.shareMenuItem} onClick={() => handleCopyLink(lightboxUrl)}>
                      {copied ? <><Check size={12} color="#166534" /> Copied!</> : <><Copy size={12} /> Copy Link</>}
                    </button>
                  </div>
                )}
              </div>
              <button className={styles.copyBtnLb} onClick={() => handleCopyLink(lightboxUrl)}>
                {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy Link</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
