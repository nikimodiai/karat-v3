import React from 'react';
import { MessageCircle, Shield, Diamond } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import styles from './Footer.module.css';

export default function Footer() {
  const { store } = useAuth();
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <img src={store?.logo_url || '/swarnix-logo.png'} alt="" className={styles.brandLogo} />
          <img src={store?.name_style_url || '/swarnix-wordmark.png'} alt="Swarnix" className={styles.brandWordmark} />
          <span className={styles.sep}>·</span>
          <span className={styles.copy}>© {year} Jewellery Inventory Intelligence</span>
        </div>
        <div className={styles.links}>
          <span className={styles.pill}><Shield size={10}/> Secure</span>
          <span className={styles.pill}><Diamond size={10}/> Premium</span>
          <span className={styles.pill}><MessageCircle size={10}/> WhatsApp AI</span>
        </div>
        <div className={styles.contact}>
          <a href="mailto:support@nelishkaai.in" className={styles.email}>support@nelishkaai.in</a>
        </div>
      </div>
    </footer>
  );
}
