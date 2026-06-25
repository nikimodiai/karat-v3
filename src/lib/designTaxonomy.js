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

// ── Visual option lists for the form (OptionGrid) ───────────────────
// Each entry pairs the value with a plain-English explanation and, where it
// helps, a colour swatch / shape diagram / emoji — so an owner who isn't
// comfortable with English jargon can still choose confidently.

export const METAL_OPTIONS = [
  { value: 'Yellow Gold', label: 'Yellow Gold', color: '#E6B422', desc: 'Classic warm gold colour.' },
  { value: 'White Gold',  label: 'White Gold',  color: '#E5E4E2', desc: 'Silver-white coloured gold.' },
  { value: 'Rose Gold',   label: 'Rose Gold',   color: '#E0A899', desc: 'Soft pink-tone gold.' },
  { value: 'Two-tone',    label: 'Two-tone',    color: 'twotone', desc: 'Two gold colours in one piece.' },
  { value: 'Platinum',    label: 'Platinum',    color: '#D9D9D6', desc: 'Naturally white, strong, premium metal.' },
  { value: 'Silver',      label: 'Silver',      color: '#C0C0C0', desc: 'Bright white, low-cost metal.' },
];

export const PURITY_OPTIONS = [
  { value: '24K', label: '24K', desc: 'Pure gold (99.9%). Very soft, bends easily.' },
  { value: '22K', label: '22K', desc: '91.6% gold. Most common for traditional jewellery.' },
  { value: '18K', label: '18K', desc: '75% gold. Stronger — best for diamond pieces.' },
  { value: '14K', label: '14K', desc: '58.5% gold. Hard and lower cost.' },
  { value: '9K',  label: '9K',  desc: '37.5% gold. Most affordable and very strong.' },
];

export const FINISH_OPTIONS = [
  { value: 'High polish',         label: 'High polish',         desc: 'Bright, mirror-like shine.' },
  { value: 'Matte',               label: 'Matte',               desc: 'Soft surface with no shine.' },
  { value: 'Antique / Oxidised',  label: 'Antique / Oxidised',  desc: 'Dark, old temple-gold look.' },
  { value: 'Sandblast',           label: 'Sandblast',           desc: 'Frosted, slightly rough surface.' },
];

export const STYLE_OPTIONS = [
  { value: 'Contemporary / Minimalist', label: 'Contemporary / Minimalist', desc: 'Modern, clean and simple designs.' },
  { value: 'Temple',                    label: 'Temple',                    desc: 'South Indian temple style with deity and gold motifs.' },
  { value: 'Antique / Oxidised',        label: 'Antique / Oxidised',        desc: 'Old, dull-gold vintage look.' },
  { value: 'Kundan',                    label: 'Kundan',                    desc: 'Stones set in gold foil — Rajasthani bridal style.' },
  { value: 'Polki (Uncut Diamond)',     label: 'Polki (Uncut Diamond)',     desc: 'Uncut natural diamonds in gold — royal look.' },
  { value: 'Jadau',                     label: 'Jadau',                     desc: 'Stones embedded into gold by hand — Mughal style.' },
  { value: 'Meenakari (Enamel)',        label: 'Meenakari (Enamel)',        desc: 'Colourful enamel paint work on gold.' },
  { value: 'Nakshi',                    label: 'Nakshi',                    desc: 'Detailed hand-carved gold work.' },
  { value: 'Victorian',                 label: 'Victorian',                 desc: 'European vintage style, dull gold with diamonds.' },
  { value: 'Fusion',                    label: 'Fusion',                    desc: 'A mix of traditional and modern.' },
];

export const EARRING_OPTIONS = [
  { value: 'Jhumka',    label: 'Jhumka',    desc: 'Bell / dome shaped hanging earring.' },
  { value: 'Chandbali', label: 'Chandbali', desc: 'Crescent (half-moon) shaped earring.' },
  { value: 'Stud',      label: 'Stud',      desc: 'Small earring that sits on the ear.' },
  { value: 'Drop',      label: 'Drop',      desc: 'Hangs a little below the ear.' },
  { value: 'Hoop',      label: 'Hoop',      desc: 'Round, ring-shaped earring.' },
];

export const STONE_OPTIONS = [
  { value: 'None',                              label: 'None',          color: null,       desc: 'No centre stone — only metal.' },
  { value: 'Natural Diamond',                   label: 'Diamond',       color: '#EAF4FB',  desc: 'Real mined diamond. Most valuable.' },
  { value: 'Lab-grown Diamond',                 label: 'Lab Diamond',   color: '#EAF4FB',  desc: 'Diamond grown in a lab. Looks the same, costs less.' },
  { value: 'Polki (Uncut)',                     label: 'Polki',         color: '#F0E9D8',  desc: 'Uncut natural diamond, flat and shiny.' },
  { value: 'Ruby',                              label: 'Ruby',          color: '#9B111E',  desc: 'Red precious stone.' },
  { value: 'Emerald',                           label: 'Emerald',       color: '#0F7B4E',  desc: 'Green precious stone.' },
  { value: 'Sapphire',                          label: 'Sapphire',      color: '#0F52BA',  desc: 'Blue precious stone.' },
  { value: 'Pearl',                             label: 'Pearl',         color: '#F4F0E6',  desc: 'White round stone from the sea.' },
  { value: 'Cubic Zirconia / American Diamond', label: 'CZ / American', color: '#EAF4FB',  desc: 'Low-cost diamond look-alike.' },
  { value: 'Navratna (Nine-gem)',               label: 'Navratna',      color: 'multi',    desc: 'Nine different lucky stones together.' },
];

const SHAPE_DESC = {
  'Round Brilliant':  'Classic round shape — most popular.',
  'Oval':             'Long, rounded shape.',
  'Princess':         'Square shape with sharp corners.',
  'Cushion':          'Square with soft, rounded corners.',
  'Pear':             'Teardrop shape.',
  'Marquise':         'Long pointed oval (boat shape).',
  'Emerald Cut':      'Rectangle with cut corners and steps.',
  'Heart':            'Heart shape.',
  'Baguette':         'Long, thin rectangle.',
  'Uncut / Rose-cut': 'Flat, uncut traditional shape.',
};

export const SHAPE_OPTIONS = STONE_SHAPES.map(s => ({
  value: s, label: s, shape: s, desc: SHAPE_DESC[s],
}));

export const CLARITY_OPTIONS = [
  { value: 'FL',   label: 'FL',   desc: 'Flawless — no marks at all (rarest).' },
  { value: 'IF',   label: 'IF',   desc: 'Surface marks only, none inside.' },
  { value: 'VVS1', label: 'VVS1', desc: 'Very, very tiny marks — not visible to the eye.' },
  { value: 'VVS2', label: 'VVS2', desc: 'Very, very tiny marks — not visible to the eye.' },
  { value: 'VS1',  label: 'VS1',  desc: 'Very small marks, hard to see.' },
  { value: 'VS2',  label: 'VS2',  desc: 'Very small marks, hard to see.' },
  { value: 'SI1',  label: 'SI1',  desc: 'Small marks, seen with a lens.' },
  { value: 'SI2',  label: 'SI2',  desc: 'Small marks, seen with a lens.' },
  { value: 'I1',   label: 'I1',   desc: 'Marks visible to the naked eye.' },
  { value: 'I2',   label: 'I2',   desc: 'More visible marks (lower grade).' },
  { value: 'I3',   label: 'I3',   desc: 'Most visible marks (lowest grade).' },
];

export const SETTING_OPTIONS = [
  { value: 'Prong',              label: 'Prong',          desc: 'Small metal claws hold the stone up.' },
  { value: 'Bezel',              label: 'Bezel',          desc: 'A metal rim wraps around the stone edge.' },
  { value: 'Pavé',               label: 'Pavé',           desc: 'Many tiny stones set close together.' },
  { value: 'Channel',            label: 'Channel',        desc: 'Stones sit in a row inside a metal groove.' },
  { value: 'Jadau / Kundan-set', label: 'Jadau / Kundan', desc: 'Stones pushed into gold by hand — traditional.' },
  { value: 'Cluster',            label: 'Cluster',        desc: 'A group of stones set together as one.' },
];

export const OCCASION_OPTIONS = [
  { value: 'Bridal / Wedding', label: 'Bridal / Wedding', emoji: '👰', desc: 'Heavy, special pieces for the wedding.' },
  { value: 'Festive',          label: 'Festive',          emoji: '🎉', desc: 'For festivals and celebrations.' },
  { value: 'Daily / Office',   label: 'Daily / Office',   emoji: '💼', desc: 'Light pieces for everyday wear.' },
  { value: 'Party',            label: 'Party',            emoji: '✨', desc: 'Stylish pieces for parties.' },
];

export const WEARER_OPTIONS = [
  { value: 'Women',  label: 'Women',  emoji: '👩', desc: 'Designed for women.' },
  { value: 'Men',    label: 'Men',    emoji: '👨', desc: 'Designed for men.' },
  { value: 'Kids',   label: 'Kids',   emoji: '🧒', desc: 'Designed for children.' },
  { value: 'Unisex', label: 'Unisex', emoji: '🧑', desc: 'Suitable for anyone.' },
];

// Motif is multi-select, so the form renders its own chips; this just
// supplies the emoji + explanation for each one.
export const MOTIF_INFO = {
  'Floral':                 { emoji: '🌸', desc: 'Flower patterns.' },
  'Paisley / Mango (Keri)': { emoji: '🥭', desc: 'Mango / kairi shaped pattern.' },
  'Peacock':                { emoji: '🦚', desc: 'Peacock design.' },
  'Lakshmi / Temple Deity': { emoji: '🛕', desc: 'Goddess / temple figures.' },
  'Geometric':              { emoji: '🔷', desc: 'Shapes and straight lines.' },
  'Abstract':               { emoji: '🎨', desc: 'Free, modern pattern.' },
  'Vine / Leaf':            { emoji: '🍃', desc: 'Leaves and creepers.' },
  'Custom':                 { emoji: '✏️', desc: 'Type your own idea.' },
};
