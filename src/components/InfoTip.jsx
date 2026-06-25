import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import styles from './InfoTip.module.css';

// A small "?" that explains a field or option in plain words. Works on both
// desktop (hover) and phones (tap to open, tap outside to close) — owners are
// phone-first, so tap matters.
export default function InfoTip({ text, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  if (!text) return null;

  return (
    <span className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.btn}
        aria-label={label ? `What is ${label}?` : 'More information'}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(o => !o); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <HelpCircle size={13} strokeWidth={2} />
      </button>
      {open && <span className={styles.pop} role="tooltip">{text}</span>}
    </span>
  );
}
