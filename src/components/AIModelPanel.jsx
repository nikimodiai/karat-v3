import React, { useState, useRef, useCallback } from 'react';
import { Upload, Sparkles, RefreshCw, PlusCircle, X, AlertCircle } from 'lucide-react';
import { N8N_AI_MODEL, db, CLOUDINARY_CLOUD, CLOUDINARY_PRESET, MAX_IMAGE_BYTES } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import { effectiveLimit, hasFeature } from '../lib/plans';
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
  const fd = new FormData();
  fd.append('file', blob, filename);
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

  const [srcFile, setSrcFile]     = useState(null);
  const [srcPreview, setSrcPrev]  = useState(null);
  const [generating, setGenerating] = useState(false);
  const [resultUrl, setResultUrl]   = useState(null);
  const [error, setError]           = useState(null);
  const [added, setAdded]           = useState(false);

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

      // Increment _ai_used in stores table
      await db
        .from('stores')
        .update({ _ai_used: aiUsed + 1 })
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
    if (fileRef.current) fileRef.current.value = '';
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
      ) : limitHit ? (
        <div className={styles.upgradeNote}>
          Monthly AI model limit reached ({aiLimit}/{aiLimit}). Upgrade your plan for more.
        </div>
      ) : (
        <>
          <p className={styles.hint}>
            Upload a jewellery photo — AI will place it on a professional model. Add the result to your product images.
          </p>

          {/* Source image upload */}
          {!srcPreview ? (
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
          ) : (
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
                disabled={generating}
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
                  <PlusCircle size={13} /> Add to Product Images
                </button>
              )}
              {resultUrl && added && (
                <span className={styles.addedBadge}>Added to images</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
