import React, { useState, useEffect, useCallback } from 'react';
import { X, Check, AlertCircle, Wand2 } from 'lucide-react';
import { BG_SWATCHES, colorToBgToken, bgFillUrl, removeBackground, publicIdFromUrl } from '../lib/imageStudio';
import styles from './BackgroundPicker.module.css';

// Per-slot background editor.
//   file  → the freshly-picked File (preferred source for rembg)
//   url   → an existing Cloudinary URL (when editing a saved image)
//   onApply(finalUrl) → called with the chosen background-filled delivery URL
export default function BackgroundPicker({ file, url, onApply, onClose }) {
  const [status, setStatus]   = useState('removing'); // removing | ready | error
  const [publicId, setPublicId] = useState(null);
  const [error, setError]     = useState(null);
  const [bg, setBg]           = useState('white');     // selected swatch value
  const [customColor, setCustom] = useState('');

  const cut = useCallback(async () => {
    setStatus('removing');
    setError(null);
    try {
      const { public_id } = await removeBackground(file || url);
      setPublicId(public_id);
      setStatus('ready');
    } catch (e) {
      setError(e.message || 'Background removal failed.');
      setStatus('error');
    }
  }, [file, url]);

  useEffect(() => { cut(); }, [cut]);

  // Resolve the currently-selected background to a Cloudinary token.
  const activeToken = (() => {
    if (bg === '__custom__') return colorToBgToken(customColor);
    const sw = BG_SWATCHES.find(s => s.value === bg);
    return sw ? sw.bg : null;
  })();

  const previewUrl = publicId ? bgFillUrl(publicId, { bg: activeToken, size: 700 }) : null;

  const handleApply = () => {
    if (!publicId) return;
    onApply(bgFillUrl(publicId, { bg: activeToken, size: 1200 }));
  };

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}><Wand2 size={15} /> Change Background</h3>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <div className={styles.body}>
          <div className={styles.preview}>
            {status === 'removing' && (
              <div className={styles.center}>
                <div className="spinner" />
                <span>Removing background…</span>
                <small>5–10 seconds</small>
              </div>
            )}
            {status === 'error' && (
              <div className={styles.center}>
                <AlertCircle size={20} color="#C0392B" />
                <span className={styles.errText}>{error}</span>
                <button className="btn-ghost" onClick={cut} style={{ marginTop: 8 }}>Try again</button>
              </div>
            )}
            {status === 'ready' && previewUrl && (
              <img src={previewUrl} alt="preview" className={styles.previewImg} />
            )}
          </div>

          {status === 'ready' && (
            <>
              <div className={styles.swatchRow}>
                {BG_SWATCHES.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    className={`${styles.swatch} ${bg === s.value ? styles.swatchActive : ''}`}
                    onClick={() => setBg(s.value)}
                    title={s.label}
                  >
                    <span
                      className={`${styles.swatchChip} ${s.value === 'transparent' ? styles.swatchChecker : ''}`}
                      style={s.value === 'transparent' ? undefined : { background: s.css, border: s.value === 'white' ? '1px solid #ddd' : 'none' }}
                    />
                    {s.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`${styles.swatch} ${bg === '__custom__' ? styles.swatchActive : ''}`}
                  onClick={() => setBg('__custom__')}
                  title="Custom colour"
                >
                  <span className={styles.swatchChip} style={{ background: colorToBgToken(customColor) ? customColor : 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' }} />
                  Custom
                </button>
              </div>

              {bg === '__custom__' && (
                <div className={styles.customRow}>
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(customColor) ? customColor : '#cccccc'}
                    onChange={e => setCustom(e.target.value)}
                    className={styles.colorInput}
                  />
                  <input
                    className="inp"
                    value={customColor}
                    onChange={e => setCustom(e.target.value)}
                    placeholder="#RRGGBB or colour name"
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className={styles.footer}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-gold" onClick={handleApply} disabled={status !== 'ready'}>
            <Check size={14} /> Apply Background
          </button>
        </div>
      </div>
    </div>
  );
}
