import React from 'react';

// Simple schematic outlines of each diamond/stone shape, so an owner can
// recognise the shape by sight instead of reading the English name.
// Drawn on a 24×24 grid, stroked in the current text colour.
const SHAPES = {
  'Round Brilliant':  <circle cx="12" cy="12" r="8.5" />,
  'Oval':             <ellipse cx="12" cy="12" rx="6.5" ry="9" />,
  'Princess':         <rect x="5" y="5" width="14" height="14" />,
  'Cushion':          <rect x="5" y="5" width="14" height="14" rx="4.5" />,
  'Pear':             <path d="M12 3.5C9 7 6 9.5 6 13.5a6 6 0 0 0 12 0C18 9.5 15 7 12 3.5Z" />,
  'Marquise':         <path d="M3 12C7.5 6.5 16.5 6.5 21 12C16.5 17.5 7.5 17.5 3 12Z" />,
  'Emerald Cut':      <path d="M8 4h8l4 4v8l-4 4H8l-4-4V8Z" />,
  'Heart':            <path d="M12 20S4 14.6 4 8.9C4 6.3 6 4.6 8.2 4.6c1.6 0 2.9.9 3.8 2 .9-1.1 2.2-2 3.8-2C20 4.6 22 6.3 22 8.9 22 14.6 12 20 12 20Z" />,
  'Baguette':         <rect x="8.5" y="3" width="7" height="18" />,
  'Uncut / Rose-cut': <path d="M12 3.5 19 8.5 16.5 19.5 7.5 19.5 5 8.5Z" />,
};

export default function ShapeIcon({ shape, size = 22 }) {
  const el = SHAPES[shape];
  if (!el) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      {el}
    </svg>
  );
}
