import React, { useState, useRef, useCallback } from 'react';
import { X, Check, AlertCircle, LayoutGrid, PlusCircle, Sparkles } from 'lucide-react';
import { BG_SWATCHES, composeSetUrl, removeBackground } from '../lib/imageStudio';
import styles from './SetComposer.module.css';

// Auto-arrange a "set" from already-uploaded pieces: necklace centred with
// earrings flanking it. Pure Cloudinary overlay compositing (₹0) on top of
// transparent cut-outs from rembg.
//
//   pieces → [{ key, src, file, url }]  (filled image slots from ProductModal)
//   onAdd(finalUrl) → add the composed image to the product
export default function SetComposer({ pieces, onAdd, onClose }) {
  const [centerKey, setCenterKey] = useState(pieces[0]?.key ?? null);
  const [sideKeys, setSideKeys]   = useState(() => pieces.slice(1, 3).map(p => p.key));
  const [bg, setBg]       = useState('white');
  const [layout, setLayout] = useState('corners');
  const [status, setStatus] = useState('idle'); // idle | working | ready | error
  const [resultUrl, setResultUrl] = useState(null);
  const [error, setError] = useState(null);
  const idCache = useRef({}); // key → transparent public_id

  const toggleSide = (key) => {
    setResultUrl(null);
    setSideKeys(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= 2) return [prev[1], key]; // keep last two
      return [...prev, key];
    });
  };

  const pieceFor = (key) => pieces.find(p => p.key === key);

  const ensureId = useCallback(async (key) => {
    if (idCache.current[key]) return idCache.current[key];
    const p = pieceFor(key);
    const { public_id } = await removeBackground(p.file || p.url);
    idCache.current[key] = public_id;
    return public_id;
  }, [pieces]);

  const activeBgToken = BG_SWATCHES.find(s => s.value === bg)?.bg ?? null;

  const generate = async () => {
    if (!centerKey) { setError('Pick a centre piece first.'); return; }
    setStatus('working');
    setError(null);
    setResultUrl(null);
    try {
      const center = await ensureId(centerKey);
      const sides = [];
      for (const k of sideKeys) sides.push(await ensureId(k));
      const url = composeSetUrl({
        center,
        left:  sides[0] || null,
        right: sides[1] || null,
        bg: activeBgToken,
        layout,
      });
      setResultUrl(url);
      setStatus('ready');
    } catch (e) {
      setError(e.message || 'Could not arrange the set.');
      setStatus('error');
    }
  };

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}><LayoutGrid size={15} /> Auto-Arrange Set</h3>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <div className={styles.body}>
          {pieces.length < 2 ? (
            <div className={styles.emptyNote}>
              Upload at least two pieces (e.g. a necklace and earrings) to arrange them as a set.
            </div>
          ) : (
            <>
              {/* 1. Centre piece */}
              <div className={styles.stepLabel}>① Centre piece <small>(necklace)</small></div>
              <div className={styles.thumbRow}>
                {pieces.map(p => (
                  <button
                    key={p.key}
                    type="button"
                    className={`${styles.thumb} ${centerKey === p.key ? styles.thumbCenter : ''}`}
                    onClick={() => { setCenterKey(p.key); setResultUrl(null); }}
                  >
                    <img src={p.src} alt="" />
                    {centerKey === p.key && <span className={styles.thumbBadge}>Centre</span>}
                  </button>
                ))}
              </div>

              {/* 2. Side pieces */}
              <div className={styles.stepLabel}>② Side pieces <small>(earrings — pick 1 or 2; one is mirrored)</small></div>
              <div className={styles.thumbRow}>
                {pieces.map(p => {
                  const i = sideKeys.indexOf(p.key);
                  const disabled = p.key === centerKey;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      disabled={disabled}
                      className={`${styles.thumb} ${i >= 0 ? styles.thumbSide : ''} ${disabled ? styles.thumbDisabled : ''}`}
                      onClick={() => !disabled && toggleSide(p.key)}
                    >
                      <img src={p.src} alt="" />
                      {i >= 0 && <span className={styles.thumbBadge}>{i === 0 ? 'Left' : 'Right'}</span>}
                    </button>
                  );
                })}
              </div>

              {/* 3. Layout + background */}
              <div className={styles.stepLabel}>③ Layout &amp; background</div>
              <div className={styles.layoutRow}>
                <button type="button" className={`${styles.layoutBtn} ${layout === 'corners' ? styles.layoutActive : ''}`} onClick={() => { setLayout('corners'); setResultUrl(null); }}>Top corners</button>
                <button type="button" className={`${styles.layoutBtn} ${layout === 'sides' ? styles.layoutActive : ''}`} onClick={() => { setLayout('sides'); setResultUrl(null); }}>Mid sides</button>
              </div>
              <div className={styles.swatchRow}>
                {BG_SWATCHES.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    className={`${styles.swatch} ${bg === s.value ? styles.swatchActive : ''}`}
                    onClick={() => { setBg(s.value); setResultUrl(null); }}
                    title={s.label}
                  >
                    <span
                      className={`${styles.swatchChip} ${s.value === 'transparent' ? styles.swatchChecker : ''}`}
                      style={s.value === 'transparent' ? undefined : { background: s.css, border: s.value === 'white' ? '1px solid #ddd' : 'none' }}
                    />
                  </button>
                ))}
              </div>

              {/* Result */}
              {(status === 'working' || status === 'ready' || status === 'error') && (
                <div className={styles.preview}>
                  {status === 'working' && (
                    <div className={styles.center}>
                      <div className="spinner" />
                      <span>Arranging…</span>
                      <small>removing backgrounds &amp; composing</small>
                    </div>
                  )}
                  {status === 'error' && (
                    <div className={styles.center}>
                      <AlertCircle size={20} color="#C0392B" />
                      <span className={styles.errText}>{error}</span>
                    </div>
                  )}
                  {status === 'ready' && resultUrl && (
                    <img src={resultUrl} alt="composed set" className={styles.previewImg} />
                  )}
                </div>
              )}
              {error && status !== 'error' && <div className={styles.errText} style={{ marginTop: 8 }}>{error}</div>}
            </>
          )}
        </div>

        <div className={styles.footer}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          {status === 'ready' && resultUrl ? (
            <button className="btn-gold" onClick={() => { onAdd(resultUrl); onClose(); }}>
              <PlusCircle size={14} /> Add to Images
            </button>
          ) : (
            <button className="btn-gold" onClick={generate} disabled={pieces.length < 2 || status === 'working' || !centerKey}>
              {status === 'working' ? <><div className="spinner spinner-sm" /> Arranging…</> : <><Sparkles size={14} /> Arrange Set</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
