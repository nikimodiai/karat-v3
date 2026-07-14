import React, { useEffect, useState } from 'react';
import { X, Images } from 'lucide-react';
import { db } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import styles from './StudioLibraryPicker.module.css';

// Section order + labels for app_gallery.kind — mirrors the tabs on the
// Studio Suite Library page so this picker reads the same way.
const KIND_SECTIONS = [
  { id: 'design', label: 'Designs' },
  { id: 'ai_model', label: 'AI Models' },
  { id: 'studio_photo', label: 'Studio Photos' },
  { id: 'metal_swap', label: 'Metal Swaps' },
];
const KIND_LABELS = Object.fromEntries(KIND_SECTIONS.map((s) => [s.id, s.label]));

/**
 * Modal that lets a jeweller pick a previously generated Studio Suite image as
 * the source for another feature (e.g. feed a Studio Photo result into Reels).
 * Reads app_gallery (RLS-scoped to the owner via user_id === owner_id) and, when
 * `includeReels`, also completed reels' poster frames.
 *
 * `onPick(url)` returns the chosen image URL. `multi` (for Reels) returns an
 * array via `onPickMany(urls)` instead.
 */
export default function StudioLibraryPicker({ onClose, onPick, onPickMany, multi = false, includeReels = false }) {
  const { store } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]); // urls, for multi

  useEffect(() => {
    let active = true;
    (async () => {
      if (!store?.owner_id) return;
      setLoading(true);
      try {
        const { data } = await db
          .from('app_gallery')
          .select('id, image_url, title, kind, created_at')
          .eq('user_id', store.owner_id)
          .order('created_at', { ascending: false });
        if (active) setItems(data || []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [store]);

  const toggle = (url) => {
    if (!multi) { onPick?.(url); return; }
    setSelected((prev) => prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]);
  };

  // Group items by kind, in the same order as the Library page's tabs, so a
  // jeweller sees "Designs", "AI Models", etc. as separate sections instead of
  // one flat stack of every generated image.
  const sections = KIND_SECTIONS
    .map((s) => ({ ...s, items: items.filter((im) => im.kind === s.id) }))
    .filter((s) => s.items.length > 0);
  const otherItems = items.filter((im) => !KIND_LABELS[im.kind]);
  if (otherItems.length) sections.push({ id: 'other', label: 'Other', items: otherItems });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div className={styles.headTitle}><Images size={16} /> Choose from your Library</div>
          <button className={styles.close} onClick={onClose}><X size={18} /></button>
        </div>

        {loading ? (
          <div className={styles.center}><div className="spinner" /></div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>
            <Images size={26} strokeWidth={1.4} />
            <p>No generated images yet. Create something in Studio Suite first.</p>
          </div>
        ) : (
          <div className={styles.sections}>
            {sections.map((section) => (
              <div key={section.id} className={styles.section}>
                <div className={styles.sectionHead}>{section.label}</div>
                <div className={styles.grid}>
                  {section.items.map((im) => {
                    const isSel = selected.includes(im.image_url);
                    return (
                      <button
                        key={im.id}
                        className={`${styles.cell} ${isSel ? styles.cellSel : ''}`}
                        onClick={() => toggle(im.image_url)}
                      >
                        <img src={im.image_url} alt={im.title || 'image'} />
                        {isSel && <span className={styles.check}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {multi && (
          <div className={styles.footer}>
            <span className={styles.count}>{selected.length} selected</span>
            <button
              className={styles.useBtn}
              disabled={selected.length === 0}
              onClick={() => { onPickMany?.(selected); }}
            >
              Add {selected.length || ''} to reel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
