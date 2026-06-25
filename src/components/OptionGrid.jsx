import React from 'react';
import InfoTip from './InfoTip';
import ShapeIcon from '../lib/shapeIcons';
import styles from './OptionGrid.module.css';

// Single-select picker shown as tappable cards instead of a dropdown, so an
// owner sees a colour swatch / shape diagram / emoji for each choice and can
// tap a "?" for a plain-English explanation. options:
//   [{ value, label, desc?, color?, emoji?, shape? }]
function swatchStyle(color) {
  if (color === 'twotone') return { background: 'linear-gradient(135deg,#E6B422 0 50%,#E5E4E2 50% 100%)' };
  if (color === 'multi')   return { background: 'conic-gradient(#9B111E,#0F7B4E,#0F52BA,#E6B422,#F4F0E6,#9B111E)' };
  return { background: color };
}

export default function OptionGrid({ options, value, onChange, ariaLabel }) {
  return (
    <div className={styles.grid} role="radiogroup" aria-label={ariaLabel}>
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <div key={opt.value} className={`${styles.chip} ${active ? styles.active : ''}`}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              className={styles.chipMain}
              onClick={() => onChange(opt.value)}
            >
              {opt.shape && <span className={styles.shape}><ShapeIcon shape={opt.shape} size={24} /></span>}
              {opt.color && <span className={styles.dot} style={swatchStyle(opt.color)} />}
              {opt.emoji && <span className={styles.emoji}>{opt.emoji}</span>}
              <span className={styles.label}>{opt.label}</span>
            </button>
            {opt.desc && <span className={styles.tip}><InfoTip text={opt.desc} label={opt.label} /></span>}
          </div>
        );
      })}
    </div>
  );
}
