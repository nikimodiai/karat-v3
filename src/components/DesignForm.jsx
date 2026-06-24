import React, { useRef, useState } from 'react';
import {
  ChevronDown, ChevronUp, Plus, Trash2, Upload, Camera, X,
  Wand2, Image as ImageIcon, Layers,
} from 'lucide-react';
import {
  PIECE_TYPES, EARRING_SUBTYPES, STYLES, METAL_TYPES, PURITIES, FINISHES,
  STONE_TYPES, STONE_SHAPES, DIAMOND_COLORS, DIAMOND_CLARITIES, SETTING_STYLES,
  MOTIFS, OCCASIONS, TARGET_WEARERS,
  dimensionFieldsFor, isDiamondStone, defaultPurityFor,
} from '../lib/designTaxonomy';
import styles from './DesignForm.module.css';

// Collapsible step wrapper.
function Step({ n, title, hint, open, onToggle, children }) {
  return (
    <section className={styles.step}>
      <button type="button" className={styles.stepHead} onClick={onToggle} aria-expanded={open}>
        <span className={styles.stepNum}>{n}</span>
        <span className={styles.stepTitle}>{title}{hint && <small> · {hint}</small>}</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className={styles.stepBody}>{children}</div>}
    </section>
  );
}

export default function DesignForm({
  params, setParams,
  mode, setMode,
  referencePreview, onPickReference, onClearReference,
  onGenerate, generating, generateDisabled, usageText,
}) {
  // Steps 1–3 open by default so an owner can fill the essentials and
  // generate quickly; the rest stay collapsed but every field is present.
  const [open, setOpen] = useState({ 1: true, 2: true, 3: true, 4: false, 5: false, 6: false, 7: false, 8: false });
  const toggle = (n) => setOpen(o => ({ ...o, [n]: !o[n] }));

  const fileRef = useRef(null);
  const camRef = useRef(null);

  // Field setters — all write into the single params object.
  const set = (key, val) => setParams(f => ({ ...f, [key]: val }));
  const setCenter = (key, val) => setParams(f => ({ ...f, center: { ...(f.center || {}), [key]: val } }));
  const setDim = (key, val) => setParams(f => ({ ...f, dimensions: { ...(f.dimensions || {}), [key]: val } }));

  // When the centre stone changes, nudge the purity default (18K for
  // diamonds, 22K otherwise) — but only if the owner hasn't set one.
  const handleStoneType = (val) => {
    setParams(f => {
      const next = { ...f, center: { ...(f.center || {}), stone_type: val } };
      if (!f._purityTouched) next.purity = defaultPurityFor(val);
      return next;
    });
  };

  const center = params.center || {};
  const accents = params.accents || [];
  const motifs = params.motifs || [];
  const dimFields = dimensionFieldsFor(params.piece_type);

  const toggleMotif = (m) => setParams(f => {
    const cur = f.motifs || [];
    return { ...f, motifs: cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m] };
  });

  const addAccent = () => setParams(f => ({
    ...f, accents: [...(f.accents || []), { stone_type: '', shape: '', count: '', setting: '' }],
  }));
  const setAccent = (i, key, val) => setParams(f => {
    const arr = [...(f.accents || [])];
    arr[i] = { ...arr[i], [key]: val };
    return { ...f, accents: arr };
  });
  const removeAccent = (i) => setParams(f => ({ ...f, accents: (f.accents || []).filter((_, idx) => idx !== i) }));

  return (
    <div className={styles.form}>
      {/* Mode selector */}
      <div className={styles.modeRow}>
        <button
          type="button"
          className={`${styles.modeBtn} ${mode === 'scratch' ? styles.modeBtnActive : ''}`}
          onClick={() => setMode('scratch')}
        >
          <Wand2 size={14} /> From scratch
          <small>Design from the fields below</small>
        </button>
        <button
          type="button"
          className={`${styles.modeBtn} ${mode === 'reference' ? styles.modeBtnActive : ''}`}
          onClick={() => setMode('reference')}
        >
          <ImageIcon size={14} /> From a reference
          <small>Upload a photo/sketch, then set specs</small>
        </button>
      </div>

      {/* Reference upload (Mode B) */}
      {mode === 'reference' && (
        <div className={styles.refWrap}>
          {referencePreview ? (
            <div className={styles.refPreview}>
              <img src={referencePreview} alt="reference" />
              <button type="button" className={styles.refRemove} onClick={onClearReference} title="Remove">
                <X size={13} />
              </button>
            </div>
          ) : (
            <>
              <div className={styles.refDrop} onClick={() => fileRef.current?.click()}>
                <Upload size={20} strokeWidth={1.5} />
                <span>Upload a reference image</span>
                <small>A sketch, an inspiration photo, or an existing piece · max 5 MB</small>
              </div>
              <button type="button" className={styles.refCam} onClick={() => camRef.current?.click()}>
                <Camera size={14} /> Camera
              </button>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*"
            style={{ display: 'none' }} onChange={e => onPickReference(e.target.files?.[0])} />
          <input ref={camRef} type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }} onChange={e => onPickReference(e.target.files?.[0])} />
        </div>
      )}

      {/* STEP 1 — Piece type */}
      <Step n="1" title="Piece" hint="what are you making" open={open[1]} onToggle={() => toggle(1)}>
        <div className="fg fg2">
          <div className="fld">
            <label className="lbl">Piece type <span className="req">*</span></label>
            <select className="inp" value={params.piece_type || ''} onChange={e => set('piece_type', e.target.value)}>
              <option value="">Select…</option>
              {PIECE_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {params.piece_type === 'Earrings' && (
            <div className="fld">
              <label className="lbl">Earring style</label>
              <select className="inp" value={params.earring_subtype || ''} onChange={e => set('earring_subtype', e.target.value)}>
                <option value="">Select…</option>
                {EARRING_SUBTYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
      </Step>

      {/* STEP 2 — Style */}
      <Step n="2" title="Style" hint="tradition" open={open[2]} onToggle={() => toggle(2)}>
        <div className="fld">
          <label className="lbl">Style / tradition</label>
          <select className="inp" value={params.style || ''} onChange={e => set('style', e.target.value)}>
            <option value="">Select…</option>
            {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </Step>

      {/* STEP 3 — Metal */}
      <Step n="3" title="Metal" open={open[3]} onToggle={() => toggle(3)}>
        <div className="fg fg2">
          <div className="fld">
            <label className="lbl">Metal type</label>
            <select className="inp" value={params.metal_type || ''} onChange={e => set('metal_type', e.target.value)}>
              {METAL_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="fld">
            <label className="lbl">Purity</label>
            <select className="inp" value={params.purity || ''}
              onChange={e => setParams(f => ({ ...f, purity: e.target.value, _purityTouched: true }))}>
              {PURITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="fg fg2" style={{ marginTop: 14 }}>
          <div className="fld">
            <label className="lbl">Approx. metal weight (g)</label>
            <input className="inp" type="number" min="0" step="0.01" inputMode="decimal"
              value={params.metal_weight_g || ''} onChange={e => set('metal_weight_g', e.target.value)}
              placeholder="e.g. 12.5" />
          </div>
          <div className="fld">
            <label className="lbl">Finish</label>
            <select className="inp" value={params.finish || ''} onChange={e => set('finish', e.target.value)}>
              {FINISHES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
        <label className={styles.toggle}>
          <input type="checkbox" checked={!!params.hallmark} onChange={e => set('hallmark', e.target.checked)} />
          BIS hallmark
        </label>
      </Step>

      {/* STEP 4 — Centre stone */}
      <Step n="4" title="Centre stone" open={open[4]} onToggle={() => toggle(4)}>
        <div className="fld">
          <label className="lbl">Stone type</label>
          <select className="inp" value={center.stone_type || 'None'} onChange={e => handleStoneType(e.target.value)}>
            {STONE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {center.stone_type && center.stone_type !== 'None' && (
          <>
            <div className="fg fg3" style={{ marginTop: 14 }}>
              <div className="fld">
                <label className="lbl">Shape / cut</label>
                <select className="inp" value={center.shape || ''} onChange={e => setCenter('shape', e.target.value)}>
                  <option value="">Select…</option>
                  {STONE_SHAPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="fld">
                <label className="lbl">Carat weight</label>
                <input className="inp" type="number" min="0" step="0.01" inputMode="decimal"
                  value={center.carat || ''} onChange={e => setCenter('carat', e.target.value)} placeholder="e.g. 1.0" />
              </div>
              <div className="fld">
                <label className="lbl">Stone count</label>
                <input className="inp" type="number" min="0" step="1" inputMode="numeric"
                  value={center.count || ''} onChange={e => setCenter('count', e.target.value)} placeholder="e.g. 1" />
              </div>
            </div>
            {isDiamondStone(center.stone_type) && (
              <div className="fg fg2" style={{ marginTop: 14 }}>
                <div className="fld">
                  <label className="lbl">Diamond colour</label>
                  <select className="inp" value={center.color || ''} onChange={e => setCenter('color', e.target.value)}>
                    <option value="">Select…</option>
                    {DIAMOND_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="fld">
                  <label className="lbl">Diamond clarity</label>
                  <select className="inp" value={center.clarity || ''} onChange={e => setCenter('clarity', e.target.value)}>
                    <option value="">Select…</option>
                    {DIAMOND_CLARITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}
          </>
        )}
      </Step>

      {/* STEP 5 — Accent stones */}
      <Step n="5" title="Accent stones" hint="optional" open={open[5]} onToggle={() => toggle(5)}>
        {accents.length === 0 && <p className={styles.emptyHint}>No accent stones. Add one if the piece has surrounding stones.</p>}
        {accents.map((a, i) => (
          <div key={i} className={styles.accentRow}>
            <div className={styles.accentGrid}>
              <div className="fld">
                <label className="lbl">Type</label>
                <select className="inp" value={a.stone_type || ''} onChange={e => setAccent(i, 'stone_type', e.target.value)}>
                  <option value="">Select…</option>
                  {STONE_TYPES.filter(s => s !== 'None').map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="fld">
                <label className="lbl">Shape</label>
                <select className="inp" value={a.shape || ''} onChange={e => setAccent(i, 'shape', e.target.value)}>
                  <option value="">Select…</option>
                  {STONE_SHAPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="fld">
                <label className="lbl">Count</label>
                <input className="inp" type="number" min="0" step="1" inputMode="numeric"
                  value={a.count || ''} onChange={e => setAccent(i, 'count', e.target.value)} placeholder="e.g. 24" />
              </div>
              <div className="fld">
                <label className="lbl">Setting</label>
                <select className="inp" value={a.setting || ''} onChange={e => setAccent(i, 'setting', e.target.value)}>
                  <option value="">Select…</option>
                  {SETTING_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <button type="button" className={styles.accentRemove} onClick={() => removeAccent(i)} title="Remove">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button type="button" className={styles.addBtn} onClick={addAccent}>
          <Plus size={14} /> Add accent stone
        </button>
      </Step>

      {/* STEP 6 — Size & dimensions */}
      <Step n="6" title="Size & dimensions" open={open[6]} onToggle={() => toggle(6)}>
        {!params.piece_type ? (
          <p className={styles.emptyHint}>Pick a piece type first to see the relevant size fields.</p>
        ) : (
          <div className="fg fg2">
            {dimFields.map(f => (
              <div className="fld" key={f.key}>
                <label className="lbl">{f.label}</label>
                {f.kind === 'select' ? (
                  <select className="inp" value={params.dimensions?.[f.key] || ''} onChange={e => setDim(f.key, e.target.value)}>
                    <option value="">Select…</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input className="inp" value={params.dimensions?.[f.key] || ''}
                    onChange={e => setDim(f.key, e.target.value)} placeholder={f.placeholder} />
                )}
              </div>
            ))}
          </div>
        )}
      </Step>

      {/* STEP 7 — Motif / theme */}
      <Step n="7" title="Motif / theme" hint="pick any" open={open[7]} onToggle={() => toggle(7)}>
        <div className={styles.chips}>
          {MOTIFS.map(m => (
            <button key={m} type="button"
              className={`${styles.chip} ${motifs.includes(m) ? styles.chipActive : ''}`}
              onClick={() => toggleMotif(m)}>
              {m}
            </button>
          ))}
        </div>
        {motifs.includes('Custom') && (
          <input className="inp" style={{ marginTop: 12 }} value={params.motif_custom || ''}
            onChange={e => set('motif_custom', e.target.value)} placeholder="Describe your custom motif…" />
        )}
      </Step>

      {/* STEP 8 — Context */}
      <Step n="8" title="Context" open={open[8]} onToggle={() => toggle(8)}>
        <div className="fg fg2">
          <div className="fld">
            <label className="lbl">Occasion</label>
            <select className="inp" value={params.occasion || ''} onChange={e => set('occasion', e.target.value)}>
              <option value="">Select…</option>
              {OCCASIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="fld">
            <label className="lbl">Target wearer</label>
            <select className="inp" value={params.target_wearer || ''} onChange={e => set('target_wearer', e.target.value)}>
              <option value="">Select…</option>
              {TARGET_WEARERS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        </div>
      </Step>

      {/* Generate */}
      <div className={styles.generateBar}>
        {usageText && <span className={styles.usage}><Layers size={12} /> {usageText}</span>}
        <button className="btn-gold" onClick={onGenerate} disabled={generateDisabled}>
          {generating ? <><div className="spinner spinner-sm" /> Generating…</> : <><Wand2 size={15} /> Generate design</>}
        </button>
      </div>
    </div>
  );
}
