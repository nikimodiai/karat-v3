import React, { useEffect, useMemo, useState } from 'react';
import { X, Images } from 'lucide-react';
import { db } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import styles from './StudioLibraryPicker.module.css';

// Tab order + labels for app_gallery.kind — mirrors the tabs on the Studio Suite
// Library page so this picker reads the same way.
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
  const [activeTab, setActiveTab] = useState('all');

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

  // Build the tab row: "All" plus only the kinds that actually have items, in
  // the same order as the Library page. "Other" catches any unmapped kinds.
  const otherItems = items.filter((im) => !KIND_LABELS[im.kind]);
  const tabs = useMemo(() => {
    const t = [{ id: 'all', label: 'All' }];
    for (const s of KIND_SECTIONS) {
      if (items.some((im) => im.kind === s.id)) t.push(s);
    }
    if (otherItems.length) t.push({ id: 'other', label: 'Other' });
    return t;
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // If the active tab no longer exists (e.g. after load), fall back to "All".
  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTab)) setActiveTab('all');
  }, [tabs, activeTab]);

  const visibleItems = useMemo(() => {
    if (activeTab === 'all') return items;
    if (activeTab === 'other') return otherItems;
    return items.filter((im) => im.kind === activeTab);
  }, [items, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <>
            {/* Category tabs — pick one at a time instead of scrolling through
                every kind stacked one after another. */}
            <div className={styles.tabs}>
              {tabs.map((t) => (
                <button
                  key={t.id}
                  className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className={styles.grid}>
              {visibleItems.map((im) => {
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
          </>
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
