import React, { useState, useEffect, useRef } from 'react';
import { Pencil, Trash2, PackageCheck, PackageX, Image, Gem, Video } from 'lucide-react';
import styles from './ProductCard.module.css';

function Slideshow({ urls }) {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!urls || urls.length <= 1) return;
    timerRef.current = setInterval(() => setIdx(i => (i + 1) % urls.length), 2600);
    return () => clearInterval(timerRef.current);
  }, [urls]);

  if (!urls || urls.length === 0) {
    return (
      <div className={styles.imgPlaceholder}>
        <Gem size={26} strokeWidth={1} color="rgba(201,168,76,.35)" />
      </div>
    );
  }

  return (
    <div style={{ position:'relative', width:'100%', height:'100%' }}>
      {urls.map((url, i) => (
        <img key={i} src={url} alt=""
          style={{
            position:'absolute', inset:0, width:'100%', height:'100%',
            objectFit:'cover', transition:'opacity .5s ease',
            opacity: i === idx ? 1 : 0,
          }}
          loading="lazy"
        />
      ))}
      {urls.length > 1 && (
        <div style={{
          position:'absolute', bottom:6, right:6,
          background:'rgba(11,24,41,.65)', backdropFilter:'blur(4px)',
          color:'rgba(248,245,236,.85)', borderRadius:99, padding:'2px 7px', fontSize:9, fontWeight:600
        }}>
          {idx+1}/{urls.length}
        </div>
      )}
    </div>
  );
}

export default function ProductCard({ product: p, viewMode, onEdit, onDelete, onToggleStock }) {
  // DB uses in_stock (boolean); support both for safety
  const isIn = p.in_stock === true;
  const imgs = Array.isArray(p.images) ? p.images : [];
  const priceStr = p.price ? '₹' + Number(p.price).toLocaleString('en-IN') : null;
  const weightStr = p.weight ? p.weight + 'g' : '';

  if (viewMode === 'list') {
    return (
      <div className={styles.listCard}>
        <div className={styles.listImgPlaceholder}>
          {imgs[0]
            ? <img src={imgs[0]} alt="" className={styles.listImg} loading="lazy"/>
            : <Gem size={18} strokeWidth={1} color="rgba(201,168,76,.35)"/>
          }
        </div>
        <div className={styles.listInfo}>
          <div className={styles.listName}>
            {p.name}
            {p.video_url && <span className={styles.videoBadge} title="Video available"><Video size={9}/></span>}
          </div>
          <div className={styles.listMeta}>
            {p.sku} · {p.category}{p.sub_category ? ` · ${p.sub_category}` : ''} {weightStr ? `· ${weightStr}` : ''}
          </div>
        </div>
        <div className={styles.listRight}>
          {priceStr && <div className={styles.listPrice}>{priceStr}</div>}
          <span className={`${styles.statusBadge} ${isIn ? styles.inStock : styles.soldOut}`}>
            {isIn ? 'In Stock' : 'Sold Out'}
          </span>
          <div className={styles.listActions}>
            <button className={styles.listIconBtn} onClick={onToggleStock} title={isIn?'Mark Sold Out':'Mark In Stock'}>
              {isIn ? <PackageX size={13}/> : <PackageCheck size={13}/>}
            </button>
            <button className={styles.listIconBtn} onClick={onEdit} title="Edit">
              <Pencil size={13}/>
            </button>
            <button className={`${styles.listIconBtn} ${styles.listIconBtnDanger}`} onClick={onDelete} title="Delete">
              <Trash2 size={13}/>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={`${styles.stripe} ${isIn ? '' : styles.stripeOut}`}/>
      <div className={styles.imgWrap}>
        <Slideshow urls={imgs}/>
        <span className={`${styles.statusBadge} ${isIn ? styles.inStock : styles.soldOut}`}>
          {isIn ? 'In Stock' : 'Sold Out'}
        </span>
        <div className={styles.skuBadge}>{p.sku}</div>
      </div>
      <div className={styles.body}>
        <div className={styles.name}>
          {p.name}
          {p.video_url && <span className={styles.videoBadge} title="Video available"><Video size={9}/></span>}
        </div>
        <div className={styles.meta}>{p.category}{p.sub_category ? ` · ${p.sub_category}` : ''}{weightStr ? ` · ${weightStr}` : ''}</div>
        {p.gold_carat && (
          <div className={styles.caratBadge}>
            <Gem size={9}/>{p.gold_carat}
          </div>
        )}
        {priceStr && <div className={styles.price}>{priceStr}</div>}
      </div>
      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={onEdit}>
          <Pencil size={12}/> Edit
        </button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnStock}`}
          style={{ color: isIn ? '#be123c' : '#15803d', borderColor: isIn ? 'rgba(190,18,60,.2)' : 'rgba(21,128,61,.2)', background: isIn ? 'rgba(190,18,60,.05)' : 'rgba(21,128,61,.05)' }}
          onClick={onToggleStock}
        >
          {isIn ? <PackageX size={12}/> : <PackageCheck size={12}/>}
          {isIn ? 'Sold Out' : 'Restore'}
        </button>
        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={onDelete} title="Delete">
          <Trash2 size={12}/>
        </button>
      </div>
    </div>
  );
}
