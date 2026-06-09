import React, { useState, useRef, useCallback } from 'react';
import { Upload, Sparkles, RefreshCw, PlusCircle, X, AlertCircle, Camera, Maximize2, Share2, Copy, Check } from 'lucide-react';
import { N8N_AI_MODEL, db, CLOUDINARY_CLOUD, CLOUDINARY_PRESET, MAX_IMAGE_BYTES } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import { effectiveLimit, hasFeature } from '../lib/plans';
import { compressImage } from '../lib/imageUtils';
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

// Upload generated image blob to Cloudinary and return the secure_url
async function uploadBlobToCloudinary(blob, filename) {
  const compressed = await compressImage(blob);
  const fd = new FormData();
  fd.append('file', compressed, filename);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', 'karat-ai-models');
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
  const [resultUrl, setResultUrl]   = useState(null);
  const [error, setError]           = useState(null);
  const [added, setAdded]           = useState(false);
  const [lightbox, setLightbox]     = useState(false);
  const [copied, setCopied]         = useState(false);
  const [shareOpen, setShareOpen]   = useState(false);

  const aiUsed  = store?._ai_used || 0;
  const aiLimit = effectiveLimit(store, 'ai_models');
  const canUse  = hasFeature(store, 'ai_models') && (aiLimit === Infinity || aiUsed < aiLimit);

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
    setResultUrl(null);
    setAdded(false);
    setSrcFile(file);
    setSrcPrev(URL.createObjectURL(file));
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, []);

  const generate = async () => {
    if (!srcFile) return;
    if (!canUse) return;

    setGenerating(true);
    setError(null);
    setResultUrl(null);
    setAdded(false);

    try {
      const jewelryType = jewelryTypeForCategory(category);
      const fd = new FormData();
      fd.append('image', srcFile);
      fd.append('owner_id', store.owner_id);
      fd.append('jewelry_type', jewelryType);
      fd.append('source', 'web');

      const res = await fetch(N8N_AI_MODEL, {
        method: 'POST',
        body: fd,
        credentials: 'omit',
        mode: 'cors',
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Generation failed (${res.status})${text ? ': ' + text.slice(0, 120) : ''}`);
      }

      // n8n returns JSON: { result_url: "https://..." } or { data: [{ b64_json: "..." }] }
      const data = await res.json();
      let url = null;

      if (data?.result_url) {
        url = data.result_url;
      } else if (data?.secure_url) {
        url = data.secure_url;
      } else if (data?.[0]?.result_url) {
        url = data[0].result_url;
      } else if (data?.data?.[0]?.b64_json) {
        // Inline base64 — upload to Cloudinary
        const b64 = data.data[0].b64_json;
        const binary = atob(b64);
        const arr = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
        const blob = new Blob([arr], { type: 'image/jpeg' });
        const filename = `ai_model_${store.owner_id}_${Date.now()}.jpg`;
        url = await uploadBlobToCloudinary(blob, filename);
      }

      if (!url) throw new Error('No image URL in response. Check n8n workflow output.');

      setResultUrl(url);

      // Increment _ai_used in stores table (always stored as integer)
      await db
        .from('stores')
        .update({ _ai_used: Math.floor(aiUsed || 0) + 1 })
        .eq('owner_id', store.owner_id);
      await refreshStore();
    } catch (err) {
      setError(err.message || 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddToProduct = () => {
    if (!resultUrl) return;
    onAddImage(resultUrl);
    setAdded(true);
  };

  const reset = () => {
    setSrcFile(null);
    setSrcPrev(null);
    setResultUrl(null);
    setError(null);
    setAdded(false);
    setLightbox(false);
    setShareOpen(false);
    setCopied(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleCopyLink = async () => {
    if (!resultUrl) return;
    try {
      await navigator.clipboard.writeText(resultUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback: open in new tab */
      window.open(resultUrl, '_blank');
    }
  };

  const handleShare = (platform) => {
    if (!resultUrl) return;
    const text = encodeURIComponent('Check out this jewellery look! 💎');
    const url  = encodeURIComponent(resultUrl);
    const shareUrls = {
      whatsapp:  `https://wa.me/?text=${text}%20${url}`,
      instagram: `https://www.instagram.com/`,          // Instagram doesn't support deep-link sharing from web
      gmail:     `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent('Jewellery Look')}&body=${text}%20${url}`,
      twitter:   `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
    };
    // For Instagram: try Web Share API first (mobile), fallback open app
    if (platform === 'instagram' && navigator.share) {
      navigator.share({ title: 'Jewellery Look', text: 'Check out this jewellery look! 💎', url: resultUrl }).catch(() => {});
      return;
    }
    if (shareUrls[platform]) window.open(shareUrls[platform], '_blank');
    setShareOpen(false);
  };

  // Native share (mobile)
  const handleNativeShare = async () => {
    if (!resultUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'AI Jewellery Model', text: 'Check out this jewellery look! 💎', url: resultUrl });
        return;
      } catch { /* user cancelled */ }
    }
    setShareOpen(v => !v);
  };

  const limitHit = !canUse && hasFeature(store, 'ai_models');

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <Sparkles size={13} className={styles.sparkIcon} />
        <span className={styles.headerText}>Generate AI Model</span>
        {aiLimit !== Infinity && (
          <span className={styles.usageBadge}>
            {aiUsed}/{aiLimit} used
          </span>
        )}
      </div>

      {!hasFeature(store, 'ai_models') ? (
        <div className={styles.upgradeNote}>
          AI model generation is available on Pro and higher plans. Upgrade to generate campaign-quality model photos.
        </div>
      ) : (
        <>
          <p className={styles.hint}>
            Upload a jewellery photo — AI will place it on a professional model. Add the result to your product images.
          </p>

          {/* Source image upload — hidden when limit hit and no result yet */}
          {!srcPreview && !limitHit && (
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

          {/* Limit reached — only show when there's no active result to display */}
          {limitHit && !resultUrl && (
            <div className={styles.upgradeNote}>
              Monthly AI model limit reached ({aiUsed}/{aiLimit}). Upgrade your plan for more.
            </div>
          )}

          {srcPreview && (
            <div className={styles.previewRow}>
              {/* Source */}
              <div className={styles.previewCard}>
                <span className={styles.previewLabel}>Jewellery Photo</span>
                <div className={styles.imgWrap}>
                  <img src={srcPreview} alt="jewellery" className={styles.previewImg} />
                  {!generating && (
                    <button className={styles.removeBtn} onClick={reset} title="Remove">
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>

              {/* Arrow */}
              <div className={styles.arrow}>
                <Sparkles size={16} className={styles.sparkIcon} />
              </div>

              {/* Result */}
              <div className={styles.previewCard}>
                <span className={styles.previewLabel}>AI Model</span>
                <div className={styles.imgWrap}>
                  {generating ? (
                    <div className={styles.generatingBox}>
                      <div className="spinner" />
                      <span>Generating…</span>
                      <small>30–60 seconds</small>
                    </div>
                  ) : resultUrl ? (
                    <>
                      <img src={resultUrl} alt="AI model" className={styles.previewImg} />
                      <button
                        className={styles.maximizeBtn}
                        onClick={() => setLightbox(true)}
                        title="View full size"
                      >
                        <Maximize2 size={12} />
                      </button>
                    </>
                  ) : (
                    <div className={styles.resultPlaceholder}>
                      <Sparkles size={20} strokeWidth={1.5} style={{ opacity: 0.3 }} />
                      <span>Result appears here</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className={styles.errorRow}>
              <AlertCircle size={13} />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          {srcPreview && (
            <div className={styles.actions}>
              <button
                className={styles.generateBtn}
                onClick={generate}
                disabled={generating || limitHit}
              >
                {generating ? (
                  <><div className="spinner spinner-sm" /> Generating…</>
                ) : resultUrl ? (
                  <><RefreshCw size={13} /> Regenerate</>
                ) : (
                  <><Sparkles size={13} /> Generate AI Model</>
                )}
              </button>

              {resultUrl && !added && (
                <button className={styles.addBtn} onClick={handleAddToProduct}>
                  <PlusCircle size={13} /> Add to Images
                </button>
              )}
              {resultUrl && added && (
                <span className={styles.addedBadge}>✓ Added to images</span>
              )}

              {/* Share button */}
              {resultUrl && (
                <div className={styles.shareWrap}>
                  <button className={styles.shareBtn} onClick={handleNativeShare} title="Share">
                    <Share2 size={13} /> Share
                  </button>
                  {shareOpen && (
                    <div className={styles.shareMenu}>
                      <button className={styles.shareMenuItem} onClick={() => handleShare('whatsapp')}>
                        <span className={styles.shareIcon} style={{ background: '#25D366' }}>W</span>
                        WhatsApp
                      </button>
                      <button className={styles.shareMenuItem} onClick={() => handleShare('gmail')}>
                        <span className={styles.shareIcon} style={{ background: '#EA4335' }}>G</span>
                        Gmail
                      </button>
                      <button className={styles.shareMenuItem} onClick={() => handleShare('instagram')}>
                        <span className={styles.shareIcon} style={{ background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' }}>I</span>
                        Instagram
                      </button>
                      <button className={styles.shareMenuItem} onClick={() => handleShare('twitter')}>
                        <span className={styles.shareIcon} style={{ background: '#000' }}>𝕏</span>
                        Twitter / X
                      </button>
                      <button className={styles.shareMenuItem} onClick={handleCopyLink}>
                        {copied
                          ? <><Check size={12} color="#166534" /> Copied!</>
                          : <><Copy size={12} /> Copy Link</>
                        }
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Lightbox */}
      {lightbox && resultUrl && (
        <div className={styles.lightboxOverlay} onClick={() => setLightbox(false)}>
          <div className={styles.lightboxContent} onClick={e => e.stopPropagation()}>
            <button className={styles.lightboxClose} onClick={() => setLightbox(false)}>
              <X size={18} />
            </button>
            <img src={resultUrl} alt="AI model full size" className={styles.lightboxImg} />
            <div className={styles.lightboxActions}>
              {!added && (
                <button className={styles.addBtn} onClick={() => { handleAddToProduct(); setLightbox(false); }}>
                  <PlusCircle size={13} /> Add to Images
                </button>
              )}
              {added && <span className={styles.addedBadge}>✓ Added to images</span>}
              <button className={styles.shareBtn} onClick={handleNativeShare}>
                <Share2 size={13} /> Share
              </button>
              <button className={styles.copyBtnLb} onClick={handleCopyLink}>
                {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy Link</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
