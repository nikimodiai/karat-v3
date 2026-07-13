import React, { useCallback, useEffect, useState } from 'react';
import { Images, Trash2, X, Play } from 'lucide-react';
import { db } from '../../lib/config';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { reelPosterUrl } from '../../lib/reels';
import { SuiteFeatureHeader } from '../StudioSuite';
import hub from '../StudioSuite.module.css';
import styles from './StudioLibrary.module.css';

// Filter tabs. 'reel' is special (reads reel_jobs); the rest map to app_gallery.kind.
const TABS = [
  { id: 'all', label: 'All' },
  { id: 'design', label: 'Designs' },
  { id: 'ai_model', label: 'AI Models' },
  { id: 'studio_photo', label: 'Studio Photos' },
  { id: 'metal_swap', label: 'Metal Swaps' },
  { id: 'reel', label: 'Reels' },
];

export default function StudioLibrary({ onBack }) {
  const { store } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState('all');
  const [images, setImages] = useState([]);  // app_gallery rows
  const [reels, setReels] = useState([]);     // completed reel_jobs
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null); // { type:'image'|'reel', url, poster? }

  const load = useCallback(async () => {
    if (!store?.owner_id) return;
    setLoading(true);
    try {
      const [imgRes, reelRes] = await Promise.allSettled([
        db.from('app_gallery')
          .select('id, image_url, title, kind, created_at')
          .eq('user_id', store.owner_id)
          .order('created_at', { ascending: false }),
        db.from('reel_jobs')
          .select('id, output_url, length_seconds, created_at')
          .eq('user_id', store.owner_id)
          .eq('status', 'completed')
          .not('output_url', 'is', null)
          .order('created_at', { ascending: false }),
      ]);
      setImages(imgRes.status === 'fulfilled' ? (imgRes.value.data || []) : []);
      setReels(reelRes.status === 'fulfilled' ? (reelRes.value.data || []) : []);
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => { load(); }, [load]);

  const deleteImage = async (id) => {
    try {
      await db.from('app_gallery').delete().eq('id', id).eq('user_id', store.owner_id);
      setImages((prev) => prev.filter((r) => r.id !== id));
      showToast('Removed from library.', '#be123c');
    } catch (e) {
      showToast('Could not delete: ' + (e.message || 'unknown'), '#be123c');
    }
  };

  const showImages = tab === 'all' || tab !== 'reel';
  const showReels = tab === 'all' || tab === 'reel';
  const filteredImages = tab === 'all' || tab === 'reel' ? images : images.filter((r) => r.kind === tab);

  const isEmpty = !loading
    && (!showImages || filteredImages.length === 0)
    && (!showReels || reels.length === 0);

  return (
    <div className={hub.page}>
      <SuiteFeatureHeader
        onBack={onBack} icon={Images} title="Library"
        sub="Every photo and video you’ve generated with Studio Suite."
      />

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.center}><div className="spinner" /></div>
      ) : isEmpty ? (
        <div className={hub.lock}>
          <Images size={28} strokeWidth={1.4} />
          <h2>Nothing here yet</h2>
          <p>Generate a photo or reel from Studio Suite and it’ll show up here.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {/* Reels first when relevant */}
          {showReels && reels.map((r) => {
            const poster = reelPosterUrl(r.output_url);
            return (
              <button key={`reel-${r.id}`} className={styles.cell} onClick={() => setLightbox({ type: 'reel', url: r.output_url, poster })}>
                {poster ? <img src={poster} alt="reel" className={styles.cellImg} /> : <div className={styles.cellImg} />}
                <span className={styles.playBadge}><Play size={14} fill="#fff" /></span>
                <span className={styles.kindTag}>{r.length_seconds ? `${r.length_seconds}s reel` : 'Reel'}</span>
              </button>
            );
          })}
          {showImages && filteredImages.map((im) => (
            <div key={im.id} className={styles.cell}>
              <img src={im.image_url} alt={im.title || 'image'} className={styles.cellImg}
                onClick={() => setLightbox({ type: 'image', url: im.image_url })} />
              {im.kind && <span className={styles.kindTag}>{TABS.find((t) => t.id === im.kind)?.label || im.kind}</span>}
              <button className={styles.delBtn} onClick={() => deleteImage(im.id)} title="Delete"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div className={styles.lbOverlay} onClick={() => setLightbox(null)}>
          <div className={styles.lbContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.lbClose} onClick={() => setLightbox(null)}><X size={18} /></button>
            {lightbox.type === 'reel'
              ? <video className={styles.lbMedia} src={lightbox.url} poster={lightbox.poster || undefined} controls autoPlay playsInline />
              : <img className={styles.lbMedia} src={lightbox.url} alt="full" />}
          </div>
        </div>
      )}
    </div>
  );
}
