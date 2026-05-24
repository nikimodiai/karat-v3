import React from 'react';
import { Clock, Mail, Shield } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import styles from './Pending.module.css';

export default function Pending() {
  const { user, logout } = useAuth();
  const email = user?.email || '';

  return (
    <div className={styles.screen}>
      <div className={styles.box}>
        <div className={styles.iconWrap}>
          <Clock size={40} strokeWidth={1.5} color="#C9A84C" />
        </div>
        <h2 className={styles.title}>Access Pending Approval</h2>
        <p className={styles.sub}>
          Your account has been registered. An administrator will review your request
          and activate your store shortly. You'll receive a WhatsApp notification once approved.
        </p>

        <div className={styles.infoCard}>
          <div className={styles.infoRow}>
            <Mail size={15} color="#C9A84C" />
            <span>Registered as: <strong>{email}</strong></span>
          </div>
          <div className={styles.infoRow}>
            <Shield size={15} color="#C9A84C" />
            <span>Access by invitation & admin approval only</span>
          </div>
        </div>

        <p className={styles.contact}>
          Questions? Contact{' '}
          <a href="mailto:nikimodi81@gmail.com">nikimodi81@gmail.com</a>
        </p>

        <button className={styles.btnLogout} onClick={logout}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
