import React from 'react';
import { MessageCircle, Shield, Diamond } from 'lucide-react';
import styles from './Footer.module.css';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
            <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" fill="none" stroke="#C9A84C" strokeWidth="1.5"/>
            <circle cx="12" cy="12" r="3" fill="#C9A84C"/>
          </svg>
          <span className={styles.brandText}>KARAT</span>
          <span className={styles.sep}>·</span>
          <span className={styles.copy}>© {year} Jewellery Inventory Intelligence</span>
        </div>
        <div className={styles.links}>
          <span className={styles.pill}><Shield size={10}/> Secure</span>
          <span className={styles.pill}><Diamond size={10}/> Premium</span>
          <span className={styles.pill}><MessageCircle size={10}/> WhatsApp AI</span>
        </div>
        <div className={styles.contact}>
          <a href="mailto:nikimodi81@gmail.com" className={styles.email}>nikimodi81@gmail.com</a>
        </div>
      </div>
    </footer>
  );
}
