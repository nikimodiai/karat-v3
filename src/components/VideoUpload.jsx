import React, { useState, useRef, useEffect } from 'react';
import { Video, Upload, Trash2, Lock, AlertTriangle } from 'lucide-react';
import { MAX_VIDEO_SECONDS, MAX_VIDEO_BYTES } from '../lib/config';
import styles from './VideoUpload.module.css';

// ── VideoUpload ─────────────────────────────────────────────────────
// Single video slot. Owner picks a video; we probe its duration via
// the HTML5 metadata event and reject anything > MAX_VIDEO_SECONDS.
// The actual Cloudinary upload happens in the parent (Inventory.jsx)
// so retry/error handling is centralized.
// ────────────────────────────────────────────────────────────────────

export default function VideoUpload({
  existingUrl,    // URL of already-uploaded video (edit mode)
  pendingFile,    // File object not yet uploaded
  onFileSelect,   // (file | null) → void
  onRemoveExisting, // () => void
  locked,         // true = plan doesn't allow video; show lock screen
  lockedMessage = 'Video uploads are available on the Professional plan.',
}) {
  const [err, setErr] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileRef = useRef(null);

  // Build preview URL from pending file
  useEffect(() => {
    if (!pendingFile) { setPreviewUrl(null); return; }
    const u = URL.createObjectURL(pendingFile);
    setPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [pendingFile]);

  const handleFile = (file) => {
    setErr('');
    if (!file) return;

    if (file.size > MAX_VIDEO_BYTES) {
      setErr(`Video too large (${(file.size/1024/1024).toFixed(1)} MB). Max ${(MAX_VIDEO_BYTES/1024/1024).toFixed(0)} MB.`);
      return;
    }
    if (!file.type.startsWith('video/')) {
      setErr('Please select a video file (MP4, MOV, WebM).');
      return;
    }

    // Probe duration before accepting — must be ≤ MAX_VIDEO_SECONDS
    const tempUrl = URL.createObjectURL(file);
    const probe   = document.createElement('video');
    probe.preload = 'metadata';
    probe.src     = tempUrl;
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(tempUrl);
      const dur = probe.duration;
      if (!isFinite(dur)) {
        setErr('Could not read video duration — please re-encode and try again.');
        return;
      }
      if (dur > MAX_VIDEO_SECONDS + 0.5) {     // +0.5 grace for FP imprecision
        setErr(`Video is ${dur.toFixed(1)}s — max allowed is ${MAX_VIDEO_SECONDS}s. Please trim it first.`);
        return;
      }
      onFileSelect?.(file);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(tempUrl);
      setErr('Could not read this video — file may be corrupt or unsupported.');
    };
  };

  // ── Render ────────────────────────────────────────────────────────
  if (locked) {
    return (
      <div className={`${styles.wrap} ${styles.wrapLocked}`}>
        <div className={styles.lockIcon}><Lock size={18}/></div>
        <div>
          <div className={styles.lockTitle}>Video upload locked</div>
          <div className={styles.lockMsg}>{lockedMessage}</div>
        </div>
      </div>
    );
  }

  const hasVideo = !!(pendingFile || existingUrl);

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <div className={styles.preview}>
          {hasVideo ? (
            <video
              src={previewUrl || existingUrl}
              controls
              playsInline
              className={styles.video}
            />
          ) : (
            <button type="button" className={styles.addBtn} onClick={() => fileRef.current?.click()}>
              <Video size={22} strokeWidth={1.5}/>
              <span>Upload video</span>
              <small>Max {MAX_VIDEO_SECONDS}s · MP4/MOV/WebM</small>
            </button>
          )}
        </div>

        {hasVideo && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={12}/> Replace
            </button>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              onClick={() => {
                if (pendingFile) onFileSelect?.(null);
                if (existingUrl) onRemoveExisting?.();
              }}
            >
              <Trash2 size={12}/> Remove
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/*"
        style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files?.[0])}
      />

      {err && (
        <div className={styles.err}>
          <AlertTriangle size={11}/> {err}
        </div>
      )}

      <p className={styles.note}>
        Customers see this video on WhatsApp when they ask for a closer look. Keep it short and well-lit.
      </p>
    </div>
  );
}
