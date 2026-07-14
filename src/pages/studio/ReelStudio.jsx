import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Film, Upload, X, Sparkles, AlertCircle, ArrowLeft, CheckCircle2, Loader2, Images, Camera } from 'lucide-react';
import { db, MAX_IMAGE_BYTES } from '../../lib/config';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { hasFeature, reelSuiteCost } from '../../lib/plans';
import { canUseSuite, suiteUnitsLeft, chargeSuite } from '../../lib/studioSuite';
import {
  RATIOS, QUALITIES, DEFAULT_RATIO, DEFAULT_RESOLUTION,
  LENGTH_MIN, LENGTH_MAX, LENGTH_DEFAULT, MAX_REEL_IMAGES,
  endOverlayDuration, uploadReelImage, submitReel, fetchReel, subscribeToReel, reelPosterUrl,
  fetchReelMusic,
} from '../../lib/reels';
import { SuiteFeatureHeader } from '../StudioSuite';
import StudioLibraryPicker from '../../components/StudioLibraryPicker';
import hub from '../StudioSuite.module.css';
import styles from './ReelStudio.module.css';

export default function ReelStudio({ onBack }) {
  const { store, refreshStore } = useAuth();
  const { showToast } = useToast();

  const [view, setView] = useState('create');   // 'create' | 'result'
  const [images, setImages] = useState([]);      // [{ file, preview }]
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [resolution, setResolution] = useState(DEFAULT_RESOLUTION);
  const [length, setLength] = useState(LENGTH_DEFAULT);
  const [musicId, setMusicId] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [overlayText, setOverlayText] = useState('');
  const [overlayPosition, setOverlayPosition] = useState('end');
  const [customPrompt, setCustomPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [job, setJob] = useState(null);          // active reel_jobs row
  const [libOpen, setLibOpen] = useState(false);
  const chargedRef = useRef(false);              // guard: charge once per job
  const fileRef = useRef(null);
  const camRef = useRef(null);

  const featureOn = hasFeature(store, 'ai_studio_suite');
  const unitsLeft = suiteUnitsLeft(store);
  const cost = useMemo(() => reelSuiteCost(length, resolution), [length, resolution]);
  const enough = unitsLeft === Infinity || unitsLeft >= cost;
  const canGenerate = featureOn && images.length > 0 && !submitting && enough;

  // Load music once (failure → no music option).
  useEffect(() => {
    let active = true;
    fetchReelMusic().then((t) => active && setTracks(t));
    return () => { active = false; };
  }, []);

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []);
    const room = MAX_REEL_IMAGES - images.length;
    const next = [];
    for (const f of files.slice(0, room)) {
      if (f.size > MAX_IMAGE_BYTES) { setError(`One image is over 5 MB and was skipped.`); continue; }
      if (!f.type.startsWith('image/')) continue;
      next.push({ file: f, preview: URL.createObjectURL(f) });
    }
    if (next.length) { setError(null); setImages((prev) => [...prev, ...next].slice(0, MAX_REEL_IMAGES)); }
  };
  // Add already-hosted images picked from the Studio Library (no upload needed).
  const addFromLibrary = (urls) => {
    setLibOpen(false);
    const room = MAX_REEL_IMAGES - images.length;
    const next = urls.slice(0, room).map((url) => ({ url, preview: url }));
    if (next.length) { setError(null); setImages((prev) => [...prev, ...next].slice(0, MAX_REEL_IMAGES)); }
  };
  const removeImage = (i) => setImages((prev) => {
    const copy = [...prev];
    const [gone] = copy.splice(i, 1);
    // Only blob previews (device files) need revoking; library previews are URLs.
    if (gone?.file && gone?.preview) URL.revokeObjectURL(gone.preview);
    return copy;
  });
  useEffect(() => () => { images.forEach((im) => im.file && im.preview && URL.revokeObjectURL(im.preview)); }, []); // eslint-disable-line

  // Charge on completion: when the watched job flips to 'completed', add the
  // reel's cost to the shared meter once. Failed reels cost nothing.
  const onJobChange = useCallback(async (next) => {
    setJob(next);
    if (next.status === 'completed' && !chargedRef.current) {
      chargedRef.current = true;
      const units = reelSuiteCost(next.lengthSeconds || length, next.resolution || resolution);
      await chargeSuite(store.owner_id, units);
      await refreshStore();
    }
  }, [store, length, resolution, refreshStore]);

  const generate = async () => {
    if (!canGenerate) return;
    setSubmitting(true);
    setError(null);
    chargedRef.current = false;
    try {
      // Resolve every image to a public URL in scene order. Library picks are
      // already hosted; device files are uploaded to Cloudinary.
      const urls = [];
      for (const im of images) {
        urls.push(im.url || await uploadReelImage(im.file, `reel_${store.owner_id}_${Date.now()}.jpg`));
      }
      const jobId = await submitReel({
        userId: store.owner_id,
        imageUrls: urls,
        lengthSeconds: length,
        ratio,
        resolution,
        customPrompt,
        musicId,
        overlayText,
        overlayPosition,
      });
      // Seed a processing job row locally, switch to the result view, and watch.
      setJob({ id: jobId, status: 'processing', outputUrl: null, lengthSeconds: length, resolution });
      setView('result');
      const initial = await fetchReel(jobId);
      if (initial) await onJobChange(initial);
    } catch (e) {
      setError(e.message || 'Couldn’t create your reel. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Subscribe to the active job while on the result view.
  useEffect(() => {
    if (view !== 'result' || !job?.id) return;
    const unsub = subscribeToReel(job.id, (next) => { onJobChange(next); });
    return unsub;
  }, [view, job?.id, onJobChange]);

  const startNew = () => {
    images.forEach((im) => im.preview && URL.revokeObjectURL(im.preview));
    setImages([]); setJob(null); setError(null); setView('create');
    setOverlayText(''); setCustomPrompt('');
    chargedRef.current = false;
  };

  const lengthHint = length < 8 ? 'Single-scene reel' : length <= 12 ? 'Two-scene reel' : 'Three-scene reel';

  // ── Result / progress view ──
  if (view === 'result') {
    const poster = reelPosterUrl(job?.outputUrl);
    return (
      <div className={hub.page}>
        <SuiteFeatureHeader onBack={onBack} icon={Film} title="Generate Reels" sub="Your reel is rendering — this usually takes 1–4 minutes." />
        <button className={styles.linkBtn} onClick={startNew}><ArrowLeft size={14} /> Make another reel</button>

        <div className={styles.resultCard}>
          {job?.status === 'completed' && job.outputUrl ? (
            <>
              <video className={styles.video} src={job.outputUrl} poster={poster || undefined} controls playsInline />
              <div className={styles.resultMeta}>
                <span className={styles.doneBadge}><CheckCircle2 size={15} /> Ready</span>
                <a className={styles.dlBtn} href={job.outputUrl} target="_blank" rel="noreferrer">Open / Download</a>
              </div>
            </>
          ) : job?.status === 'failed' ? (
            <div className={styles.progressBox}>
              <AlertCircle size={26} color="#be123c" />
              <b>Reel failed to render</b>
              <span>{job.errorMessage || 'Something went wrong. You were not charged — please try again.'}</span>
            </div>
          ) : (
            <div className={styles.progressBox}>
              <Loader2 size={26} className={styles.spin} />
              <b>Rendering your reel…</b>
              <span>You can leave this screen — it’ll be in your Library when it’s done.</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Create view ──
  return (
    <div className={hub.page}>
      <SuiteFeatureHeader
        onBack={onBack} icon={Film} title="Generate Reels"
        sub="Turn your photos into a short, shareable video — with AI motion and music."
        right={unitsLeft !== Infinity ? <span className={styles.usage}>{unitsLeft} Studio credits left</span> : null}
      />

      {!featureOn ? (
        <div className={hub.lock}>
          <Sparkles size={28} strokeWidth={1.4} />
          <h2>Reels aren’t available on your plan</h2>
          <p>Upgrade your plan to use AI Studio Suite.</p>
        </div>
      ) : (
        <div className={styles.form}>
          {/* Images */}
          <div className={styles.section}>
            <label className={styles.label}>Images <span className={styles.muted}>· up to {MAX_REEL_IMAGES}, in scene order</span></label>
            <div className={styles.imgGrid}>
              {images.map((im, i) => (
                <div key={i} className={styles.imgSlot}>
                  <img src={im.preview} alt={`scene ${i + 1}`} />
                  <button className={styles.imgRemove} onClick={() => removeImage(i)}><X size={11} /></button>
                  <span className={styles.imgIdx}>{i + 1}</span>
                </div>
              ))}
              {images.length < MAX_REEL_IMAGES && (
                <>
                  <button className={styles.addSlot} onClick={() => fileRef.current?.click()}>
                    <Upload size={18} /><small>Upload</small>
                  </button>
                  <button className={styles.addSlot} onClick={() => camRef.current?.click()}>
                    <Camera size={18} /><small>Camera</small>
                  </button>
                  <button className={styles.addSlot} onClick={() => setLibOpen(true)}>
                    <Images size={18} /><small>Library</small>
                  </button>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                onChange={(e) => addFiles(e.target.files)} />
              <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                onChange={(e) => addFiles(e.target.files)} />
            </div>
            {images.length === 0 && <p className={styles.hint}>Add at least one image — upload, camera, or your Studio Library. The reel flows through them in order.</p>}
          </div>

          {/* Format */}
          <div className={styles.section}>
            <label className={styles.label}>Format</label>
            <div className={styles.fmtCards}>
              {RATIOS.map((r) => (
                <button key={r.value} className={`${styles.fmtCard} ${ratio === r.value ? styles.fmtActive : ''}`} onClick={() => setRatio(r.value)}>
                  <b>{r.label}</b><small>{r.hint}</small>
                </button>
              ))}
            </div>
          </div>

          {/* Length slider */}
          <div className={styles.section}>
            <div className={styles.rowBetween}>
              <label className={styles.label}>Length</label>
              <span className={styles.lengthVal}>{length}s</span>
            </div>
            <input type="range" className={styles.slider} min={LENGTH_MIN} max={LENGTH_MAX} step={1}
              value={length} onChange={(e) => setLength(Number(e.target.value))} />
            <div className={styles.rowBetween}>
              <small className={styles.muted}>{LENGTH_MIN}s</small>
              <small className={styles.muted}>{lengthHint}</small>
              <small className={styles.muted}>{LENGTH_MAX}s</small>
            </div>
          </div>

          {/* Quality */}
          <div className={styles.section}>
            <label className={styles.label}>Quality</label>
            <div className={styles.segment}>
              {QUALITIES.map((q) => (
                <button key={q.value} className={`${styles.segItem} ${resolution === q.value ? styles.segActive : ''}`} onClick={() => setResolution(q.value)}>
                  <b>{q.label}</b><small>{q.hint}</small>
                </button>
              ))}
            </div>
          </div>

          {/* Music */}
          {tracks.length > 0 && (
            <div className={styles.section}>
              <label className={styles.label}>Music <span className={styles.muted}>· optional</span></label>
              <div className={styles.chips}>
                <button className={`${styles.chip} ${musicId === null ? styles.chipActive : ''}`} onClick={() => setMusicId(null)}>No music</button>
                {tracks.map((t) => (
                  <button key={t.musicId} className={`${styles.chip} ${musicId === t.musicId ? styles.chipActive : ''}`} onClick={() => setMusicId(t.musicId)}>
                    {t.name}{t.mood ? ` · ${t.mood}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Contact overlay */}
          <div className={styles.section}>
            <label className={styles.label}>Contact text <span className={styles.muted}>· optional</span></label>
            <input className={styles.input} maxLength={80} placeholder="e.g. Contact XYZ Jewellers · 98765 43210"
              value={overlayText} onChange={(e) => setOverlayText(e.target.value)} />
            {overlayText.trim() && (
              <div className={styles.segment} style={{ marginTop: 8 }}>
                {['end', 'whole'].map((pos) => (
                  <button key={pos} className={`${styles.segItem} ${overlayPosition === pos ? styles.segActive : ''}`} onClick={() => setOverlayPosition(pos)}>
                    <b>{pos === 'end' ? 'At the end' : 'Whole reel'}</b>
                    <small>{pos === 'end' ? `Last ${endOverlayDuration(length)}s` : 'Always visible'}</small>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Prompt */}
          <div className={styles.section}>
            <label className={styles.label}>Anything to add? <span className={styles.muted}>· optional</span></label>
            <textarea className={styles.textarea} maxLength={300} placeholder="e.g. focus on the diamond, slow elegant motion…"
              value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} />
          </div>

          {error && <div className={styles.errorRow}><AlertCircle size={13} /><span>{error}</span></div>}

          {/* Cost + generate */}
          <div className={styles.costRow}>
            <span>Cost: <b className={styles.costVal}>{cost} Studio credit{cost === 1 ? '' : 's'}</b></span>
            {unitsLeft !== Infinity && (
              <span className={enough ? styles.muted : styles.danger}>{unitsLeft} left</span>
            )}
          </div>
          <button className={styles.generateBtn} onClick={generate} disabled={!canGenerate}>
            {submitting ? (<><div className="spinner spinner-sm" /> Submitting…</>) : (<><Film size={15} /> Generate Reel · {cost} Studio credit{cost === 1 ? '' : 's'}</>)}
          </button>
          {images.length > 0 && !enough && (
            <p className={styles.danger} style={{ textAlign: 'center', marginTop: 8 }}>
              Not enough Studio credits left for this reel — reduce length or quality.
            </p>
          )}
        </div>
      )}

      {libOpen && (
        <StudioLibraryPicker multi onClose={() => setLibOpen(false)} onPickMany={addFromLibrary} />
      )}
    </div>
  );
}
