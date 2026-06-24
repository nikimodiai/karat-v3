// ── Design Studio taxonomy ──────────────────────────────────────────
// Every option a jewellery designer picks, in the order they actually
// think: piece → style → metal → centre stone → accents → size →
// motif → context. The form (DesignForm.jsx) reads these lists; the
// prompt composer (designPrompt.js) and the publish step read the same
// values, so there is one source of truth for the vocabulary.
// ────────────────────────────────────────────────────────────────────

// STEP 1 — Piece type. Drives which size fields and which catalog
// category a published design maps to.
export const PIECE_TYPES = [
  'Necklace',
  'Necklace Set',
  'Choker',
  'Rani Haar / Long Haar',
  'Mangalsutra',
  'Pendant',
  'Chain',
  'Earrings',
  'Ring',
  'Bangles',
  'Bracelet',
  'Maang Tikka',
  'Vanki',
  'Vaddanam',
  'Nath',
];

// Shown only when piece type is Earrings.
export const EARRING_SUBTYPES = ['Jhumka', 'Chandbali', 'Stud', 'Drop', 'Hoop'];

// STEP 2 — Style / tradition.
export const STYLES = [
  'Contemporary / Minimalist',
  'Temple',
  'Antique / Oxidised',
  'Kundan',
  'Polki (Uncut Diamond)',
  'Jadau',
  'Meenakari (Enamel)',
  'Nakshi',
  'Victorian',
  'Fusion',
];

// STEP 3 — Metal.
export const METAL_TYPES = [
  'Yellow Gold',
  'White Gold',
  'Rose Gold',
  'Two-tone',
  'Platinum',
  'Silver',
];

export const PURITIES = ['24K', '22K', '18K', '14K', '9K'];

export const FINISHES = ['High polish', 'Matte', 'Antique / Oxidised', 'Sandblast'];

// STEP 4 — Centre / main stone.
export const STONE_TYPES = [
  'None',
  'Natural Diamond',
  'Lab-grown Diamond',
  'Polki (Uncut)',
  'Ruby',
  'Emerald',
  'Sapphire',
  'Pearl',
  'Cubic Zirconia / American Diamond',
  'Navratna (Nine-gem)',
];

export const STONE_SHAPES = [
  'Round Brilliant',
  'Oval',
  'Princess',
  'Cushion',
  'Pear',
  'Marquise',
  'Emerald Cut',
  'Heart',
  'Baguette',
  'Uncut / Rose-cut',
];

// D–Z colour scale, shown for diamonds only.
export const DIAMOND_COLORS = Array.from({ length: 23 }, (_, i) =>
  String.fromCharCode('D'.charCodeAt(0) + i)
); // D, E, F, … Z

// GIA clarity scale, shown for diamonds only.
export const DIAMOND_CLARITIES = [
  'FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3',
];

// STEP 5 — Accent stone setting styles.
export const SETTING_STYLES = [
  'Prong', 'Bezel', 'Pavé', 'Channel', 'Jadau / Kundan-set', 'Cluster',
];

// STEP 7 — Motif / theme (multi-select; "Custom" pairs with a free-text field).
export const MOTIFS = [
  'Floral',
  'Paisley / Mango (Keri)',
  'Peacock',
  'Lakshmi / Temple Deity',
  'Geometric',
  'Abstract',
  'Vine / Leaf',
  'Custom',
];

// STEP 8 — Context.
export const OCCASIONS = ['Bridal / Wedding', 'Festive', 'Daily / Office', 'Party'];
export const TARGET_WEARERS = ['Women', 'Men', 'Kids', 'Unisex'];

// Common Indian bangle inner-diameter sizes (inches.eighths notation).
export const BANGLE_SIZES = ['2.2', '2.4', '2.6', '2.8', '2.10', '2.12'];

// ── Conditional helpers ─────────────────────────────────────────────

// Diamond colour + clarity only make sense for actual diamonds.
export function isDiamondStone(stoneType) {
  return stoneType === 'Natural Diamond' || stoneType === 'Lab-grown Diamond';
}

// Sensible purity default: diamond-heavy pieces lean 18K, traditional 22K.
export function defaultPurityFor(stoneType) {
  return isDiamondStone(stoneType) ? '18K' : '22K';
}

// STEP 6 — which size/dimension fields to show for the chosen piece type.
// Returns an array of { key, label, kind: 'text'|'select', options?, placeholder? }.
export function dimensionFieldsFor(pieceType) {
  switch (pieceType) {
    case 'Ring':
      return [{ key: 'ring_size', label: 'Ring size', kind: 'text', placeholder: 'e.g. 12 (Indian)' }];
    case 'Bangles':
      return [{ key: 'bangle_size', label: 'Bangle diameter', kind: 'select', options: BANGLE_SIZES }];
    case 'Earrings':
      return [{ key: 'earring_drop', label: 'Earring drop length (mm)', kind: 'text', placeholder: 'e.g. 35' }];
    case 'Pendant':
      return [
        { key: 'pendant_height', label: 'Pendant height (mm)', kind: 'text', placeholder: 'e.g. 28' },
        { key: 'pendant_width', label: 'Pendant width (mm)', kind: 'text', placeholder: 'e.g. 18' },
      ];
    case 'Necklace':
    case 'Necklace Set':
    case 'Choker':
    case 'Rani Haar / Long Haar':
    case 'Mangalsutra':
    case 'Chain':
    case 'Vaddanam':
      return [{ key: 'length_inches', label: 'Length (inches)', kind: 'text', placeholder: 'e.g. 18' }];
    case 'Bracelet':
      return [{ key: 'length_inches', label: 'Length (inches)', kind: 'text', placeholder: 'e.g. 7.5' }];
    case 'Maang Tikka':
    case 'Vanki':
    case 'Nath':
      return [{ key: 'size_note', label: 'Size / dimensions', kind: 'text', placeholder: 'e.g. medium, 6 cm' }];
    default:
      return [{ key: 'size_note', label: 'Size / dimensions', kind: 'text', placeholder: 'optional' }];
  }
}

// ── Publish mapping ─────────────────────────────────────────────────
// Maps a Design Studio piece type to an existing catalog category +
// sub-category (values from CATEGORIES / SUBCATEGORY_MAP in config.js) so
// a published design lands in the right inventory bucket. Earrings use the
// chosen earring sub-type.
const EARRING_SUBCAT = {
  Jhumka: 'Jhumkas',
  Chandbali: 'Chandeliers',
  Stud: 'Studs',
  Drop: 'Drop & Dangle',
  Hoop: 'Hoops',
};

export function pieceTypeToCategory(pieceType, earringSubtype) {
  switch (pieceType) {
    case 'Necklace':                return { category: 'Necklace', sub_category: '' };
    case 'Necklace Set':            return { category: 'Set', sub_category: 'Necklace + Earring Set' };
    case 'Choker':                  return { category: 'Necklace', sub_category: 'Chokers' };
    case 'Rani Haar / Long Haar':   return { category: 'Necklace', sub_category: 'Rani Haar' };
    case 'Mangalsutra':             return { category: 'Mangalsutra', sub_category: '' };
    case 'Pendant':                 return { category: 'Pendant', sub_category: '' };
    case 'Chain':                   return { category: 'Chain', sub_category: '' };
    case 'Earrings':                return { category: 'Earring', sub_category: EARRING_SUBCAT[earringSubtype] || '' };
    case 'Ring':                    return { category: 'Ring', sub_category: '' };
    case 'Bangles':                 return { category: 'Bangle', sub_category: '' };
    case 'Bracelet':                return { category: 'Bracelet', sub_category: '' };
    case 'Maang Tikka':             return { category: 'Maang Tikka', sub_category: '' };
    case 'Vanki':                   return { category: 'Bajuband', sub_category: '' };   // Vanki = armlet
    case 'Vaddanam':                return { category: 'Kamarband', sub_category: '' };   // Vaddanam = waist belt
    case 'Nath':                    return { category: 'Nosepin', sub_category: 'Nath (Bridal Nose Ring)' };
    default:                        return { category: 'Other', sub_category: '' };
  }
}

// Map a Design Studio metal type + purity to a config.js `gold_carat`
// label (the value the catalog/pricing code expects, e.g. "22K Gold",
// "925 Silver (Sterling)", "Platinum").
export function toGoldCaratLabel(metalType, purity) {
  if (metalType === 'Platinum') return 'Platinum';
  if (metalType === 'Silver')   return '925 Silver (Sterling)';
  // Gold variants (yellow / white / rose / two-tone) all use the karat label.
  return purity ? `${purity} Gold` : '';
}
