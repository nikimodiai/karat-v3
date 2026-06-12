import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Loader, CheckCircle, XCircle, Trash2, Tag, CalendarDays, Plus, Video, Image as ImageIcon, Pencil, X } from 'lucide-react';
import { db, CLOUDINARY_CLOUD, CLOUDINARY_PRESET } from '../lib/config';
import { compressImage } from '../lib/imageUtils';
import { useToast } from '../hooks/useToast';
import styles from './OffersSection.module.css';

const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;  // 5 MB

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function isExpired(validTo) {
  if (!validTo) return false;
  return new Date(validTo) < new Date(new Date().toDateString());
}

// ── Offer card ────────────────────────────────────────────────────────────────
function OfferCard({ offer, onDelete, onUpdate }) {
  const { showToast } = useToast();
  const [deleting, setDeleting]   = useState(false);
  const [editing, setEditing]     = useState(false);
  const [saving, setSaving]       = useState(false);
  // edit form state
  const [title, setTitle]         = useState(offer.title);
  const [desc, setDesc]           = useState(offer.description || '');
  const [validTo, setValidTo]     = useState(offer.valid_to || '');
  const [mediaFile, setMedia]     = useState(null);
  const [preview, setPreview]     = useState(null);
  const [mediaType, setMType]     = useState(null);
  const [dragOver, setDrag]       = useState(false);
  const fileRef                   = useRef();
  const expired = isExpired(offer.valid_to);

  function openEdit() {
    setTitle(offer.title);
    setDesc(offer.description || '');
    setValidTo(offer.valid_to || '');
    setMedia(null); setPreview(null); setMType(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setMedia(null); setPreview(null); setMType(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function resetMedia() {
    setMedia(null); setPreview(null); setMType(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const handleFile = useCallback((file) => {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) { showToast('Only image or video files are allowed.', 'error'); return; }
    if (isVideo && file.size > MAX_VIDEO_BYTES) { showToast('Video must be under 50 MB.', 'error'); return; }
    if (isImage && file.size > MAX_IMAGE_BYTES) { showToast('Image must be under 5 MB.', 'error'); return; }
    setMedia(file);
    setMType(isVideo ? 'video' : 'image');
    setPreview(URL.createObjectURL(file));
  }, [showToast]);

  function onDrop(e) {
    e.preventDefault(); setDrag(false);
    handleFile(e.dataTransfer.files[0]);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!title.trim()) { showToast('Please enter an offer title.', 'error'); return; }
    setSaving(true);
    try {
      let mediaUrl  = offer.media_url;
      let mediaTypeVal = offer.media_type;
      if (mediaFile) {
        const resourceType = mediaType === 'video' ? 'video' : 'image';
        let uploadable = mediaFile;
        if (mediaType === 'image') uploadable = await compressImage(mediaFile);
        const fd = new FormData();
        fd.append('file', uploadable, mediaFile.name);
        fd.append('upload_preset', CLOUDINARY_PRESET);
        fd.append('folder', 'offers');
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${resourceType}/upload`,
          { method: 'POST', body: fd }
        );
        if (!res.ok) throw new Error('Upload failed');
        mediaUrl = (await res.json()).secure_url;
        mediaTypeVal = mediaType;
      }
      const updates = {
        title:       title.trim(),
        description: desc.trim() || null,
        valid_to:    validTo || null,
        media_url:   mediaUrl,
        media_type:  mediaTypeVal,
      };
      const { data, error } = await db.from('offers').update(updates).eq('id', offer.id).select().single();
      if (error) throw error;
      showToast('Offer updated!', 'success');
      onUpdate(data);
      setEditing(false);
    } catch {
      showToast('Failed to update offer. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this offer?')) return;
    setDeleting(true);
    try {
      const { error } = await db.from('offers').delete().eq('id', offer.id);
      if (error) throw error;
      onDelete(offer.id);
    } catch {
      setDeleting(false);
    }
  }

  const today = new Date().toISOString().split('T')[0];
  // current media to show in edit zone (new preview OR existing)
  const editPreview  = preview || offer.media_url;
  const editMType    = preview ? mediaType : offer.media_type;

  if (editing) {
    return (
      <form className={`${styles.card} ${styles.cardEditing}`} onSubmit={handleSave}>
        <div className={styles.editHeader}>
          <span className={styles.editLabel}><Pencil size={13} /> Edit Offer</span>
          <button type="button" className={styles.cancelBtn} onClick={cancelEdit}><X size={14} /> Cancel</button>
        </div>

        {/* Media zone */}
        <div
          className={`${styles.editDropZone} ${dragOver ? styles.dropZoneActive : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => !editPreview && fileRef.current?.click()}
          style={{ cursor: editPreview ? 'default' : 'pointer' }}
        >
          {editPreview ? (
            <div className={styles.previewWrap}>
              {editMType === 'video'
                ? <video src={editPreview} className={styles.previewVideo} controls />
                : <img src={editPreview} alt="preview" className={styles.previewImg} />}
              <button type="button" className={styles.removeMedia}
                onClick={e => { e.stopPropagation(); preview ? resetMedia() : fileRef.current?.click(); }}>
                {preview ? <XCircle size={20} /> : <Pencil size={16} />}
              </button>
            </div>
          ) : (
            <div className={styles.dropHint}>
              <div className={styles.dropIcons}><ImageIcon size={20} /><Video size={20} /></div>
              <span className={styles.dropText}>Replace media (optional)</span>
              <span className={styles.dropSub}>Drag & drop or click to browse</span>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])} />
        </div>

        <div className={styles.editFields}>
          <div className={styles.field}>
            <label className={styles.label}><Tag size={13} /> Offer title <span className={styles.req}>*</span></label>
            <input className={styles.input} type="text" value={title}
              onChange={e => setTitle(e.target.value)} maxLength={120} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Details (optional)</label>
            <textarea className={styles.textarea} value={desc}
              onChange={e => setDesc(e.target.value)} rows={3} maxLength={600} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}><CalendarDays size={13} /> Valid till (optional)</label>
            <input className={styles.input} type="date" value={validTo} min={today}
              onChange={e => setValidTo(e.target.value)} />
          </div>
          <div className={styles.editActions}>
            <button className={styles.submitBtn} type="submit" disabled={saving}>
              {saving ? <><Loader size={14} className={styles.spin} /> Saving…</> : <><CheckCircle size={14} /> Save Changes</>}
            </button>
            <button type="button" className={styles.cancelBtnAlt} onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className={`${styles.card} ${expired ? styles.cardExpired : ''}`}>
      {offer.media_url && (
        <div className={styles.cardMedia}>
          {offer.media_type === 'video' ? (
            <video src={offer.media_url} controls className={styles.cardVideo} />
          ) : (
            <img src={offer.media_url} alt={offer.title} className={styles.cardImg} />
          )}
        </div>
      )}
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <h3 className={styles.cardTitle}>{offer.title}</h3>
          {expired && <span className={styles.expiredPill}>Expired</span>}
        </div>
        {offer.description && <p className={styles.cardDesc}>{offer.description}</p>}
        <div className={styles.cardMeta}>
          {offer.valid_to && (
            <span className={styles.cardDate}>
              <CalendarDays size={13} /> Valid till {fmtDate(offer.valid_to)}
            </span>
          )}
        </div>
      </div>
      <div className={styles.cardActions}>
        <button className={styles.editBtn} onClick={openEdit} title="Edit offer">
          <Pencil size={14} />
        </button>
        <button className={styles.deleteBtn} onClick={handleDelete} disabled={deleting} title="Delete offer">
          {deleting ? <Loader size={14} className={styles.spin} /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  );
}

// ── Add-offer form ─────────────────────────────────────────────────────────────
function AddOfferForm({ ownerId, onAdded }) {
  const { showToast } = useToast();
  const [title, setTitle]       = useState('');
  const [desc, setDesc]         = useState('');
  const [validTo, setValidTo]   = useState('');
  const [mediaFile, setMedia]   = useState(null);
  const [preview, setPreview]   = useState(null);
  const [mediaType, setMType]   = useState(null);
  const [saving, setSaving]     = useState(false);
  const [dragOver, setDrag]     = useState(false);
  const fileRef                 = useRef();

  function resetMedia() {
    setMedia(null);
    setPreview(null);
    setMType(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const handleFile = useCallback((file) => {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      showToast('Only image or video files are allowed.', 'error');
      return;
    }
    if (isVideo && file.size > MAX_VIDEO_BYTES) {
      showToast('Video must be under 50 MB.', 'error');
      return;
    }
    if (isImage && file.size > MAX_IMAGE_BYTES) {
      showToast('Image must be under 5 MB.', 'error');
      return;
    }
    setMedia(file);
    setMType(isVideo ? 'video' : 'image');
    setPreview(URL.createObjectURL(file));
  }, [showToast]);

  function onDrop(e) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }

  async function uploadToCloudinary(file, type) {
    const fd = new FormData();
    const resourceType = type === 'video' ? 'video' : 'image';
    let uploadable = file;
    if (type === 'image') {
      uploadable = await compressImage(file);
    }
    fd.append('file', uploadable, file.name);
    fd.append('upload_preset', CLOUDINARY_PRESET);
    fd.append('folder', 'offers');
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${resourceType}/upload`,
      { method: 'POST', body: fd }
    );
    if (!res.ok) throw new Error('Media upload failed');
    const json = await res.json();
    return json.secure_url;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { showToast('Please enter an offer title.', 'error'); return; }
    setSaving(true);
    try {
      let mediaUrl = null;
      if (mediaFile) {
        mediaUrl = await uploadToCloudinary(mediaFile, mediaType);
      }
      const { data, error } = await db.from('offers').insert({
        owner_id:   ownerId,
        title:      title.trim(),
        description: desc.trim() || null,
        media_url:  mediaUrl,
        media_type: mediaFile ? mediaType : null,
        valid_to:   validTo || null,
      }).select().single();
      if (error) throw error;
      showToast('Offer added!', 'success');
      onAdded(data);
      setTitle(''); setDesc(''); setValidTo('');
      resetMedia();
    } catch (err) {
      showToast('Failed to save offer. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2 className={styles.formTitle}><Plus size={16} /> New Offer</h2>

      {/* Media drop zone */}
      <div
        className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''} ${preview ? styles.dropZoneHasFile : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => !preview && fileRef.current?.click()}
      >
        {preview ? (
          <div className={styles.previewWrap}>
            {mediaType === 'video'
              ? <video src={preview} className={styles.previewVideo} controls />
              : <img src={preview} alt="offer preview" className={styles.previewImg} />}
            <button type="button" className={styles.removeMedia} onClick={e => { e.stopPropagation(); resetMedia(); }}>
              <XCircle size={20} />
            </button>
          </div>
        ) : (
          <div className={styles.dropHint}>
            <div className={styles.dropIcons}>
              <ImageIcon size={22} />
              <Video size={22} />
            </div>
            <span className={styles.dropText}>Drag & drop image or video here</span>
            <span className={styles.dropSub}>or click to browse · Image ≤ 5 MB · Video ≤ 50 MB</span>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])}
        />
      </div>

      {/* Title */}
      <div className={styles.field}>
        <label className={styles.label}>
          <Tag size={13} /> Offer title <span className={styles.req}>*</span>
        </label>
        <input
          className={styles.input}
          type="text"
          placeholder="e.g. 40% off on making charges across all jewellery"
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={120}
          required
        />
      </div>

      {/* Description */}
      <div className={styles.field}>
        <label className={styles.label}>Details (optional)</label>
        <textarea
          className={styles.textarea}
          placeholder="Share more details about this offer — eligible items, conditions, etc."
          value={desc}
          onChange={e => setDesc(e.target.value)}
          rows={3}
          maxLength={600}
        />
      </div>

      {/* Valid to */}
      <div className={styles.field}>
        <label className={styles.label}>
          <CalendarDays size={13} /> Valid till (optional)
        </label>
        <input
          className={styles.input}
          type="date"
          value={validTo}
          min={today}
          onChange={e => setValidTo(e.target.value)}
        />
      </div>

      <button className={styles.submitBtn} type="submit" disabled={saving}>
        {saving ? <><Loader size={15} className={styles.spin} /> Saving…</> : <><CheckCircle size={15} /> Add Offer</>}
      </button>
    </form>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function OffersSection({ store, user }) {
  const ownerId = store?.owner_id || user?.id;
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      const { data } = await db
        .from('offers')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });
      setOffers(data || []);
      setLoading(false);
    })();
  }, [ownerId]);

  function handleAdded(offer) {
    setOffers(prev => [offer, ...prev]);
  }

  function handleDeleted(id) {
    setOffers(prev => prev.filter(o => o.id !== id));
  }

  function handleUpdated(updated) {
    setOffers(prev => prev.map(o => o.id === updated.id ? updated : o));
  }

  return (
    <div className={styles.root}>
      <AddOfferForm ownerId={ownerId} onAdded={handleAdded} />

      <div className={styles.listSection}>
        <h2 className={styles.listTitle}>Your Offers</h2>
        {loading && <div className={styles.emptyState}><Loader size={18} className={styles.spin} /> Loading…</div>}
        {!loading && offers.length === 0 && (
          <div className={styles.emptyState}>No offers yet. Add your first offer above.</div>
        )}
        {offers.map(o => (
          <OfferCard key={o.id} offer={o} onDelete={handleDeleted} onUpdate={handleUpdated} />
        ))}
      </div>
    </div>
  );
}
