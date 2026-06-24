import React, { useState } from 'react';
import {
  RefreshCw, Sparkles, Wand2, AlertCircle, Maximize2, X,
  Trash2, Save, Send, ImageOff, CheckCircle2,
} from 'lucide-react';
import DesignPriceEstimate from './DesignPriceEstimate';
import SpecSheet from './SpecSheet';
import styles from './DesignOutputs.module.css';

// The three outputs (render, estimate, spec) plus the per-design decision.
export default function DesignOutputs({
  renders, generating, error, onRegenerate, onVariation,
  params, setParams, estimate, onEstimate,
  status, saving, publishing, onDiscard, onSave, onPublish,
}) {
  const [zoom, setZoom] = useState(null);
  const hasRender = renders && renders.length > 0;

  return (
    <div className={styles.outputs}>
      {/* ── Output 1: render(s) ── */}
      <div className={styles.block}>
        <div className={styles.blockHead}><Sparkles size={14} /> Render</div>

        {generating ? (
          <div className={styles.generating}>
            <div className="spinner" />
            <span>Generating your design…</span>
            <small>15–40 seconds</small>
          </div>
        ) : hasRender ? (
          <>
            <div className={styles.renderGrid}>
              {renders.map((url, i) => (
                <div key={i} className={styles.renderCell}>
                  <img src={url} alt={`design render ${i + 1}`} />
                  <button className={styles.zoomBtn} onClick={() => setZoom(url)} title="View full size">
                    <Maximize2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className={styles.renderActions}>
              <button className={styles.secondaryBtn} onClick={onRegenerate} disabled={generating}>
                <RefreshCw size={13} /> Regenerate
              </button>
              <button className={styles.secondaryBtn} onClick={onVariation} disabled={generating}>
                <Wand2 size={13} /> Small variation
              </button>
            </div>
          </>
        ) : (
          <div className={styles.placeholder}>
            <ImageOff size={26} strokeWidth={1.4} />
            <span>Your render will appear here after you generate.</span>
          </div>
        )}

        {error && (
          <div className={styles.error}>
            <AlertCircle size={14} /> <span>{error}</span>
          </div>
        )}
      </div>

      {/* ── Output 2: price estimate ── */}
      <div className={styles.block}>
        <DesignPriceEstimate params={params} setParams={setParams} onEstimate={onEstimate} />
      </div>

      {/* ── Output 3: maker's spec sheet ── */}
      <div className={styles.block}>
        <SpecSheet params={params} setParams={setParams} estimate={estimate} />
      </div>

      {/* ── Per-design decision ── */}
      <div className={styles.decision}>
        {status === 'published' && (
          <div className={styles.publishedNote}><CheckCircle2 size={14} /> Published to your catalog.</div>
        )}
        <div className={styles.decisionBtns}>
          <button className={styles.discardBtn} onClick={onDiscard} disabled={saving || publishing}>
            <Trash2 size={14} /> Discard
          </button>
          <button className="btn-ghost" onClick={onSave} disabled={saving || publishing}>
            {saving ? <><div className="spinner spinner-sm" /> Saving…</> : <><Save size={14} /> Save to library</>}
          </button>
          <button className="btn-gold" onClick={onPublish} disabled={publishing || saving || !hasRender}
            title={!hasRender ? 'Generate a render first' : undefined}>
            {publishing ? <><div className="spinner spinner-sm" /> Publishing…</> : <><Send size={14} /> Publish to catalog</>}
          </button>
        </div>
        {!hasRender && <p className={styles.decisionHint}>Generate a render before publishing — the catalog needs a product image.</p>}
      </div>

      {/* Zoom overlay */}
      {zoom && (
        <div className={styles.zoomOverlay} onClick={() => setZoom(null)}>
          <button className={styles.zoomClose} onClick={() => setZoom(null)}><X size={18} /></button>
          <img src={zoom} alt="render full size" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
