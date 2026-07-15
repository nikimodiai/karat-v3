import React, { useRef, useState } from 'react';
import {
  ChevronDown, ChevronUp, Plus, Trash2, Upload, Camera, X,
  Wand2, Image as ImageIcon, Layers, MessageSquarePlus,
} from 'lucide-react';
import {
  PIECE_TYPES, EARRING_OPTIONS, STYLE_OPTIONS, METAL_OPTIONS, PURITY_OPTIONS,
  FINISH_OPTIONS, STONE_OPTIONS, SHAPE_OPTIONS, CLARITY_OPTIONS, SETTING_OPTIONS,
  OCCASION_OPTIONS, WEARER_OPTIONS, MOTIFS, MOTIF_INFO,
  dimensionFieldsFor, isDiamondStone, defaultPurityFor,
} from '../lib/designTaxonomy';
import OptionGrid from './OptionGrid';
import InfoTip from './InfoTip';
import styles from './DesignForm.module.css';

const ACCENT_STONE_OPTIONS = STONE_OPTIONS.filter(o => o.value !== 'None');

// Label + optional plain-English "?" + optional required mark.
function FieldLabel({ children, tip, req }) {
  return (
    <div className={styles.fieldLabel}>
      <span className="lbl" style={{ marginBottom: 0 }}>
        {children}{req && <span className="req"> *</span>}
      </span>
      {tip && <InfoTip text={tip} label={typeof children === 'string' ? children : undefined} />}
    </div>
  );
}

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
  referencePreview, onPickReference, onClearReference, onPickReferenceFromLibrary,
  onGenerate, generating, generateDisabled, usageText,
}) {
  // Steps 1–3 open by default so the essentials are visible; the rest stay
  // collapsed but every field is one tap away.
  const [open, setOpen] = useState({ 1: true, 2: true, 3: true, 4: false, 5: false, 6: false, 7: false, 8: false, 9: false });
  const toggle = (n) => setOpen(o => ({ ...o, [n]: !o[n] }));

  const fileRef = useRef(null);
  const camRef = useRef(null);

  const set = (key, val) => setParams(f => ({ ...f, [key]: val }));
  const setCenter = (key, val) => setParams(f => ({ ...f, center: { ...(f.center || {}), [key]: val } }));
  const setDim = (key, val) => setParams(f => ({ ...f, dimensions: { ...(f.dimensions || {}), [key]: val } }));

  // Changing the centre stone nudges the purity default (18K for diamonds,
  // 22K otherwise) unless the owner has already picked a purity.
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
          <small>Design from the choices below</small>
        </button>
        <button
          type="button"
          className={`${styles.modeBtn} ${mode === 'reference' ? styles.modeBtnActive : ''}`}
          onClick={() => setMode('reference')}
        >
          <ImageIcon size={14} /> From a photo
          <small>Upload a sketch / photo, then set details</small>
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
                <span>Upload a reference photo</span>
                <small>A sketch, an inspiration photo, or an old piece · up to 5 MB</small>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className={styles.refCam} onClick={() => camRef.current?.click()}>
                  <Camera size={14} /> Camera
                </button>
                {onPickReferenceFromLibrary && (
                  <button type="button" className={styles.refCam} onClick={onPickReferenceFromLibrary}>
                    <ImageIcon size={14} /> Library
                  </button>
                )}
              </div>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*"
            style={{ display: 'none' }} onChange={e => onPickReference(e.target.files?.[0])} />
          <input ref={camRef} type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }} onChange={e => onPickReference(e.target.files?.[0])} />
        </div>
      )}

      {/* STEP 1 — Piece type */}
      <Step n="1" title="Piece" hint="what you are making" open={open[1]} onToggle={() => toggle(1)}>
        <FieldLabel tip="Choose the type of jewellery you want to design." req>Piece type</FieldLabel>
        <select className="inp" value={params.piece_type || ''} onChange={e => set('piece_type', e.target.value)}>
          <option value="">Select…</option>
          {PIECE_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {params.piece_type === 'Earrings' && (
          <div style={{ marginTop: 14 }}>
            <FieldLabel tip="The earring style decides the overall shape.">Earring style</FieldLabel>
            <OptionGrid options={EARRING_OPTIONS} value={params.earring_subtype || ''}
              onChange={v => set('earring_subtype', v)} ariaLabel="Earring style" />
          </div>
        )}
      </Step>

      {/* STEP 2 — Style */}
      <Step n="2" title="Style" hint="tradition / look" open={open[2]} onToggle={() => toggle(2)}>
        <FieldLabel tip="The design tradition or overall look of the piece.">Style</FieldLabel>
        <OptionGrid options={STYLE_OPTIONS} value={params.style || ''} onChange={v => set('style', v)} ariaLabel="Style" />
      </Step>

      {/* STEP 3 — Metal */}
      <Step n="3" title="Metal" open={open[3]} onToggle={() => toggle(3)}>
        <FieldLabel tip="The metal colour of the piece.">Metal type</FieldLabel>
        <OptionGrid options={METAL_OPTIONS} value={params.metal_type || ''} onChange={v => set('metal_type', v)} ariaLabel="Metal type" />

        <div style={{ marginTop: 16 }}>
          <FieldLabel tip="Higher karat = more gold and softer. 22K is most common; 18K is better for diamonds.">Purity</FieldLabel>
          <OptionGrid options={PURITY_OPTIONS} value={params.purity || ''}
            onChange={v => setParams(f => ({ ...f, purity: v, _purityTouched: true }))} ariaLabel="Purity" />
        </div>

        <div className="fg fg2" style={{ marginTop: 16 }}>
          <div className="fld">
            <FieldLabel tip="Rough weight of the metal in grams. Used to estimate the price.">Metal weight (grams)</FieldLabel>
            <input className="inp" type="number" min="0" step="0.01" inputMode="decimal"
              value={params.metal_weight_g || ''} onChange={e => set('metal_weight_g', e.target.value)}
              placeholder="e.g. 12.5" />
          </div>
          <div className="fld">
            <FieldLabel tip="The surface look of the metal.">Finish</FieldLabel>
            <OptionGrid options={FINISH_OPTIONS} value={params.finish || ''} onChange={v => set('finish', v)} ariaLabel="Finish" />
          </div>
        </div>

        <label className={styles.toggle}>
          <input type="checkbox" checked={!!params.hallmark} onChange={e => set('hallmark', e.target.checked)} />
          BIS hallmark
          <InfoTip text="The government purity certification stamp for gold." label="BIS hallmark" />
        </label>
      </Step>

      {/* STEP 4 — Centre stone */}
      <Step n="4" title="Centre stone" hint="main stone" open={open[4]} onToggle={() => toggle(4)}>
        <FieldLabel tip="The main stone in the middle of the piece. Pick None for a plain gold design.">Stone type</FieldLabel>
        <OptionGrid options={STONE_OPTIONS} value={center.stone_type || 'None'} onChange={handleStoneType} ariaLabel="Centre stone type" />

        {center.stone_type && center.stone_type !== 'None' && (
          <>
            <div style={{ marginTop: 16 }}>
              <FieldLabel tip="The cut shape of the stone. The picture shows each shape.">Shape / cut</FieldLabel>
              <OptionGrid options={SHAPE_OPTIONS} value={center.shape || ''} onChange={v => setCenter('shape', v)} ariaLabel="Stone shape" />
            </div>

            <div className="fg fg2" style={{ marginTop: 16 }}>
              <div className="fld">
                <FieldLabel tip="Weight of the stone in carats (1 carat = 0.2 grams).">Carat weight</FieldLabel>
                <input className="inp" type="number" min="0" step="0.01" inputMode="decimal"
                  value={center.carat || ''} onChange={e => setCenter('carat', e.target.value)} placeholder="e.g. 1.0" />
              </div>
              <div className="fld">
                <FieldLabel tip="How many of this stone are in the centre.">Stone count</FieldLabel>
                <input className="inp" type="number" min="0" step="1" inputMode="numeric"
                  value={center.count || ''} onChange={e => setCenter('count', e.target.value)} placeholder="e.g. 1" />
              </div>
            </div>

            {isDiamondStone(center.stone_type) && (
              <>
                <div className="fld" style={{ marginTop: 16 }}>
                  <FieldLabel tip="How white the diamond is. D is the whitest (best); it goes down to Z (more yellow). You can type a range like G-H or a code like CD.">Diamond colour</FieldLabel>
                  <input className="inp" value={center.color || ''} onChange={e => setCenter('color', e.target.value)}
                    placeholder="e.g. G-H, or CD" />
                </div>
                <div style={{ marginTop: 16 }}>
                  <FieldLabel tip="How clean the diamond is inside. FL is flawless (best); I3 has the most marks.">Diamond clarity</FieldLabel>
                  <OptionGrid options={CLARITY_OPTIONS} value={center.clarity || ''} onChange={v => setCenter('clarity', v)} ariaLabel="Diamond clarity" />
                </div>
              </>
            )}
          </>
        )}
      </Step>

      {/* STEP 5 — Accent stones */}
      <Step n="5" title="Accent stones" hint="optional, extra stones" open={open[5]} onToggle={() => toggle(5)}>
        {accents.length === 0 && <p className={styles.emptyHint}>No extra stones. Add one if the piece has smaller stones around the main design.</p>}
        {accents.map((a, i) => (
          <div key={i} className={styles.accentCard}>
            <div className={styles.accentHead}>
              <span>Accent stone {i + 1}</span>
              <button type="button" className={styles.accentRemove} onClick={() => removeAccent(i)} title="Remove">
                <Trash2 size={14} />
              </button>
            </div>
            <FieldLabel tip="The kind of small stones used around the design.">Type</FieldLabel>
            <OptionGrid options={ACCENT_STONE_OPTIONS} value={a.stone_type || ''} onChange={v => setAccent(i, 'stone_type', v)} ariaLabel="Accent stone type" />
            <div style={{ marginTop: 14 }}>
              <FieldLabel tip="The cut shape of the accent stones.">Shape</FieldLabel>
              <OptionGrid options={SHAPE_OPTIONS} value={a.shape || ''} onChange={v => setAccent(i, 'shape', v)} ariaLabel="Accent stone shape" />
            </div>
            <div className="fg fg2" style={{ marginTop: 14 }}>
              <div className="fld">
                <FieldLabel tip="Roughly how many small stones.">Count</FieldLabel>
                <input className="inp" type="number" min="0" step="1" inputMode="numeric"
                  value={a.count || ''} onChange={e => setAccent(i, 'count', e.target.value)} placeholder="e.g. 24" />
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <FieldLabel tip="How the stones are held in the metal.">Setting</FieldLabel>
              <OptionGrid options={SETTING_OPTIONS} value={a.setting || ''} onChange={v => setAccent(i, 'setting', v)} ariaLabel="Setting style" />
            </div>
          </div>
        ))}
        <button type="button" className={styles.addBtn} onClick={addAccent}>
          <Plus size={14} /> Add accent stone
        </button>
      </Step>

      {/* STEP 6 — Size & dimensions */}
      <Step n="6" title="Size & dimensions" open={open[6]} onToggle={() => toggle(6)}>
        {!params.piece_type ? (
          <p className={styles.emptyHint}>Pick a piece type first to see the right size fields.</p>
        ) : (
          <div className="fg fg2">
            {dimFields.map(f => (
              <div className="fld" key={f.key}>
                <FieldLabel tip="The size / measurement for this piece.">{f.label}</FieldLabel>
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

      {/* STEP 7 — Pattern / theme */}
      <Step n="7" title="Pattern / theme" hint="pick any" open={open[7]} onToggle={() => toggle(7)}>
        <FieldLabel tip="The pattern or design theme. Tap any that apply.">Patterns</FieldLabel>
        <div className={styles.chips}>
          {MOTIFS.map(m => {
            const info = MOTIF_INFO[m] || {};
            const on = motifs.includes(m);
            return (
              <div key={m} className={`${styles.motifChip} ${on ? styles.motifChipActive : ''}`}>
                <button type="button" className={styles.motifBtn} onClick={() => toggleMotif(m)} aria-pressed={on}>
                  {info.emoji && <span className={styles.motifEmoji}>{info.emoji}</span>}
                  {m}
                </button>
                {info.desc && <span className={styles.motifTip}><InfoTip text={info.desc} label={m} /></span>}
              </div>
            );
          })}
        </div>
        {motifs.includes('Custom') && (
          <input className="inp" style={{ marginTop: 12 }} value={params.motif_custom || ''}
            onChange={e => set('motif_custom', e.target.value)} placeholder="Describe your custom pattern…" />
        )}
      </Step>

      {/* STEP 8 — Context */}
      <Step n="8" title="Context" open={open[8]} onToggle={() => toggle(8)}>
        <FieldLabel tip="When the piece will be worn.">Occasion</FieldLabel>
        <OptionGrid options={OCCASION_OPTIONS} value={params.occasion || ''} onChange={v => set('occasion', v)} ariaLabel="Occasion" />
        <div style={{ marginTop: 16 }}>
          <FieldLabel tip="Who will wear the piece.">Target wearer</FieldLabel>
          <OptionGrid options={WEARER_OPTIONS} value={params.target_wearer || ''} onChange={v => set('target_wearer', v)} ariaLabel="Target wearer" />
        </div>
      </Step>

      {/* STEP 9 — Anything else (free text) */}
      <Step n="9" title="Anything else?" hint="in your own words" open={open[9]} onToggle={() => toggle(9)}>
        <FieldLabel tip="Type any extra detail that wasn't covered above, in any words you like. The AI will follow it.">Extra details</FieldLabel>
        <textarea
          className="inp"
          rows={3}
          value={params.extra_details || ''}
          onChange={e => set('extra_details', e.target.value)}
          placeholder="e.g. keep small diamonds hanging at the bottom; add a chain at the back; make the centre flower bigger"
        />
        <p className={styles.emptyHint} style={{ marginTop: 8 }}>
          <MessageSquarePlus size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          Anything you write here is added to the design instructions.
        </p>
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
