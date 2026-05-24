import React from 'react';
import { Crown, ArrowRight, X, Lock } from 'lucide-react';
import styles from './UpgradeNotice.module.css';

// Inline banner version (in flow, dismissible)
export function UpgradeBanner({ title, message, ctaLabel = 'Upgrade Plan', onCta, onDismiss }) {
  const cta = onCta || (() => window.location.href = 'mailto:nikimodi81@gmail.com?subject=KARAT Plan Upgrade');
  return (
    <div className={styles.banner}>
      <div className={styles.bannerIcon}><Crown size={16} /></div>
      <div className={styles.bannerBody}>
        <div className={styles.bannerTitle}>{title}</div>
        {message && <div className={styles.bannerMsg}>{message}</div>}
      </div>
      <button className={styles.bannerCta} onClick={cta}>
        {ctaLabel} <ArrowRight size={12}/>
      </button>
      {onDismiss && (
        <button className={styles.bannerDismiss} onClick={onDismiss} aria-label="Dismiss">
          <X size={13}/>
        </button>
      )}
    </div>
  );
}

// Modal/overlay version (blocking, used when user tries to use a locked feature)
export function UpgradeDialog({ feature, currentPlan, recommendedPlan, message, onClose }) {
  const subject = encodeURIComponent(`KARAT Plan Upgrade — ${recommendedPlan || feature}`);
  return (
    <div className="overlay-backdrop" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className={styles.dialog} style={{ animation: 'slideUp .2s ease' }}>
        <button className={styles.dialogClose} onClick={onClose}><X size={16}/></button>
        <div className={styles.dialogIcon}><Lock size={26}/></div>
        <h3 className={styles.dialogTitle}>
          {feature} {recommendedPlan ? `requires ${recommendedPlan}` : 'requires an upgrade'}
        </h3>
        {message && <p className={styles.dialogMsg}>{message}</p>}
        <p className={styles.dialogMeta}>
          You're on the <strong>{currentPlan}</strong> plan today.
        </p>
        <div className={styles.dialogActions}>
          <button className="btn-ghost" onClick={onClose}>Maybe Later</button>
          <a
            href={`mailto:nikimodi81@gmail.com?subject=${subject}`}
            className="btn-gold"
            style={{ textDecoration: 'none' }}
          >
            <Crown size={13}/> Contact to Upgrade
          </a>
        </div>
      </div>
    </div>
  );
}

// Big locked card (used as a full-page block for locked tabs)
export function LockedCard({ icon: Icon, title, message, currentPlan, ctaLabel = 'Upgrade Plan' }) {
  return (
    <div className={styles.lockedCard}>
      {Icon && <Icon size={48} strokeWidth={1} color="rgba(13,27,42,.22)" />}
      <h2 className={styles.lockedTitle}>{title}</h2>
      <p className={styles.lockedMsg}>{message}</p>
      <p className={styles.lockedMeta}>Current plan: <strong>{currentPlan}</strong></p>
      <a
        href="mailto:nikimodi81@gmail.com?subject=KARAT Plan Upgrade"
        className="btn-gold"
        style={{ textDecoration: 'none', marginTop: 16 }}
      >
        <Crown size={13}/> {ctaLabel}
      </a>
    </div>
  );
}
