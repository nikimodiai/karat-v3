import React, { useState, useEffect, useRef } from 'react';
import { Pencil, Trash2, PackageCheck, PackageX, Image, Gem, Check } from 'lucide-react';
import { VARIANT_COLORS } from './VariantEditor';
import styles from './ProductCard.module.css';

const VISIBILITY_BADGE = {
  vvip:     { label: 'VVIP Only',     className: 'visVvip' },
  vvip_vip: { label: 'VVIP & VIP',    className: 'visVvipVip' },
  all:      { label: 'All Customers', className: 'visAll' },
};

function VisibilityBadge({ visibility, className }) {
  const cfg = VISIBILITY_BADGE[visibility] || VISIBILITY_BADGE.all;
  return (
    <span className={`${className} ${styles[cfg.className]}`}>{cfg.label}</span>
  );
}

function colorHex(colorName) {
  const hit = VARIANT_COLORS.find(c => c.value === colorName);
  return hit?.hex ?? null;
}

function ColorSwatches({ variants }) {
  if (!variants?.length) return null;
  // Deduplicate by color
  const seen = new Set();
  const unique = variants.filter(v => {
    if (seen.has(v.color)) return false;
    seen.add(v.color); return true;
  });
  return (
    <div className={styles.swatchRow}>
      {unique.slice(0, 6).map((v, i) => {
        const hex = colorHex(v.color);
        return hex
          ? <span key={i} className={styles.swatchDot} style={{ background: hex }} title={v.color}/>
          : <span key={i} className={styles.swatchDotTwoTone} title={v.color}/>;
      })}
      {variants.length > 1 && (
        <span className={styles.variantCount}>{variants.length} variants</span>
      )}
    </div>
  );
}

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

export default function ProductCard({
  product: p, variants = [], viewMode,
  onEdit, onDelete, onToggleStock,
  selectable = false, selected = false, onSelect,
}) {
  // DB uses in_stock (boolean); support both for safety
  const isIn = p.in_stock === true;
  const imgs = Array.isArray(p.images) ? p.images : [];
  const priceNum = p.price ? Number(p.price) : null;
  const priceStr = priceNum ? '₹' + priceNum.toLocaleString('en-IN') : null;
  const weightStr = p.weight ? p.weight + 'g' : '';

  if (viewMode === 'list') {
    return (
      <div
        className={`${styles.listCard} ${selectable ? styles.listCardSelectable : ''} ${selected ? styles.listCardSelected : ''}`}
        onClick={selectable ? onSelect : undefined}
      >
        {selectable && (
          <div className={`${styles.listCheck} ${selected ? styles.listCheckChecked : ''}`}>
            {selected && <Check size={11} strokeWidth={3} />}
          </div>
        )}
        <div className={styles.listImgPlaceholder}>
          {imgs[0]
            ? <img src={imgs[0]} alt="" className={styles.listImg} loading="lazy"/>
            : <Gem size={18} strokeWidth={1} color="rgba(201,168,76,.35)"/>
          }
        </div>
        <div className={styles.listInfo}>
          <div className={styles.listName}>{p.name}</div>
          <div className={styles.listMeta}>
            {p.sku} · {p.category}{p.sub_category ? ` · ${p.sub_category}` : ''} {weightStr ? `· ${weightStr}` : ''}
          </div>
          <VisibilityBadge visibility={p.visibility} className={styles.listVisBadge} />
        </div>
        {!selectable && (
          <div className={styles.listRight}>
            {priceStr && (
              <div className={styles.listPrice}>
                {priceStr}<span className={styles.gstTag}> +GST</span>
              </div>
            )}
            <span className={`${styles.statusBadge} ${isIn ? styles.inStock : styles.soldOut}`}>
              {isIn ? 'In Stock' : 'Sold Out'}
            </span>
            <div className={styles.listActions}>
              <button className={styles.listIconBtn} onClick={e => { e.stopPropagation(); onToggleStock?.(); }} title={isIn?'Mark Sold Out':'Mark In Stock'}>
                {isIn ? <PackageX size={13}/> : <PackageCheck size={13}/>}
              </button>
              <button className={styles.listIconBtn} onClick={e => { e.stopPropagation(); onEdit?.(); }} title="Edit">
                <Pencil size={13}/>
              </button>
              <button className={`${styles.listIconBtn} ${styles.listIconBtnDanger}`} onClick={e => { e.stopPropagation(); onDelete?.(); }} title="Delete">
                <Trash2 size={13}/>
              </button>
            </div>
          </div>
        )}
        {selectable && priceStr && (
          <div className={styles.listRight}>
            <div className={styles.listPrice}>{priceStr}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`${styles.card} ${selectable ? styles.cardSelectable : ''} ${selected ? styles.cardSelected : ''}`}
      onClick={selectable ? onSelect : undefined}
    >
      {selectable && (
        <div className={`${styles.selectOverlay} ${selected ? styles.selectOverlayActive : ''}`}>
          <div className={`${styles.checkBox} ${selected ? styles.checkBoxChecked : ''}`}>
            {selected && <Check size={11} strokeWidth={3} />}
          </div>
        </div>
      )}
      <div className={`${styles.stripe} ${isIn ? '' : styles.stripeOut}`}/>
      <div className={styles.imgWrap}>
        <Slideshow urls={imgs}/>
        <span className={`${styles.statusBadge} ${isIn ? styles.inStock : styles.soldOut}`}>
          {isIn ? 'In Stock' : 'Sold Out'}
        </span>
        <div className={styles.skuBadge}>{p.sku}</div>
        <VisibilityBadge visibility={p.visibility} className={styles.visBadge} />
      </div>
      <div className={styles.body}>
        <div className={styles.name}>{p.name}</div>
        <div className={styles.meta}>{p.category}{p.sub_category ? ` · ${p.sub_category}` : ''}{weightStr ? ` · ${weightStr}` : ''}</div>
        {p.gold_carat && (
          <div className={styles.caratBadge}>
            <Gem size={9}/>{p.gold_carat}
          </div>
        )}
        <ColorSwatches variants={variants}/>
        {priceStr && (
          <div className={styles.price}>
            {priceStr}<span className={styles.gstTag}> +GST</span>
          </div>
        )}
      </div>
      {!selectable && (
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={e => { e.stopPropagation(); onEdit?.(); }}>
            <Pencil size={12}/> Edit
          </button>
          <button
            className={`${styles.actionBtn} ${styles.actionBtnStock}`}
            style={{ color: isIn ? '#be123c' : '#15803d', borderColor: isIn ? 'rgba(190,18,60,.2)' : 'rgba(21,128,61,.2)', background: isIn ? 'rgba(190,18,60,.05)' : 'rgba(21,128,61,.05)' }}
            onClick={e => { e.stopPropagation(); onToggleStock?.(); }}
          >
            {isIn ? <PackageX size={12}/> : <PackageCheck size={12}/>}
            {isIn ? 'Sold Out' : 'Restore'}
          </button>
          <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={e => { e.stopPropagation(); onDelete?.(); }} title="Delete">
            <Trash2 size={12}/>
          </button>
        </div>
      )}
    </div>
  );
}
