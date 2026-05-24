import React from 'react';
import { AlertTriangle } from 'lucide-react';
import styles from './ConfirmDialog.module.css';

export default function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = 'Delete', confirmColor }) {
  return (
    <div className="overlay-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={styles.box} style={{ animation: 'slideUp .18s ease' }}>
        <div className={styles.icon}>
          <AlertTriangle size={28} strokeWidth={1.5} color="#C0392B" />
        </div>
        <p className={styles.msg}>{message}</p>
        <div className={styles.actions}>
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="btn-danger"
            style={confirmColor ? { background: confirmColor } : {}}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
