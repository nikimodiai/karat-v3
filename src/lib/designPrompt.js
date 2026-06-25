// ── Design Studio prompt composer ───────────────────────────────────
// Turns the structured design form into a rich, photorealistic image
// prompt. This is intentionally ONE function so the wording can be tuned
// in a single place as we learn what the model responds to best.
//
// It builds an English description of the physical piece (metal, finish,
// stones, setting, motif, size) and wraps it in studio-photography framing
// (neutral background, soft lighting, true-to-scale, no model). For
// reference-guided generation (Mode B) the same description is framed as
// "reinterpret the reference under these specs" — the reference image
// itself is sent alongside the prompt by the caller, not embedded here.
// ────────────────────────────────────────────────────────────────────

import { isDiamondStone } from './designTaxonomy';

// Human phrase for the metal, e.g. "22K yellow gold", "sterling silver".
function metalPhrase(metalType, purity) {
  if (metalType === 'Platinum') return 'platinum';
  if (metalType === 'Silver') return 'sterling silver';
  const tone = {
    'Yellow Gold': 'yellow gold',
    'White Gold': 'white gold',
    'Rose Gold': 'rose gold',
    'Two-tone': 'two-tone gold',
  }[metalType] || 'gold';
  return purity ? `${purity} ${tone}` : tone;
}

// Describe the centre stone, or empty string if there is none.
function centreStonePhrase(c = {}) {
  if (!c.stone_type || c.stone_type === 'None') return '';
  const bits = [];
  if (c.count && Number(c.count) > 1) bits.push(`${c.count}`);
  if (c.carat) bits.push(`${c.carat} ct`);
  if (c.shape) bits.push(c.shape.toLowerCase());
  bits.push(c.stone_type.toLowerCase());
  let phrase = `a centre setting of ${bits.join(' ')}`;
  if (isDiamondStone(c.stone_type)) {
    const grade = [];
    if (c.color) grade.push(`colour ${c.color}`);
    if (c.clarity) grade.push(`clarity ${c.clarity}`);
    if (grade.length) phrase += ` (${grade.join(', ')})`;
  }
  return phrase;
}

// Describe accent stones as a single clause, or empty string.
function accentPhrase(accents = []) {
  const parts = accents
    .filter(a => a && a.stone_type && a.stone_type !== 'None')
    .map(a => {
      const seg = [];
      if (a.setting) seg.push(`${a.setting.toLowerCase()}-set`);
      if (a.count) seg.push(`${a.count}`);
      if (a.shape) seg.push(a.shape.toLowerCase());
      seg.push(a.stone_type.toLowerCase());
      return seg.join(' ');
    });
  if (!parts.length) return '';
  return `accented with ${parts.join(' and ')}`;
}

// Describe the motifs, including any custom free text.
function motifPhrase(motifs = [], custom = '') {
  const named = motifs.filter(m => m && m !== 'Custom');
  const all = [...named];
  if (motifs.includes('Custom') && custom.trim()) all.push(custom.trim());
  if (!all.length) return '';
  return `decorated with ${all.join(', ').toLowerCase()} motifs`;
}

// Describe the size in plain words for whatever dimension fields exist.
function sizePhrase(pieceType, dims = {}) {
  if (dims.length_inches) return `approximately ${dims.length_inches} inches in length`;
  if (dims.ring_size) return `ring size ${dims.ring_size}`;
  if (dims.bangle_size) return `bangle inner diameter ${dims.bangle_size}`;
  if (dims.earring_drop) return `about ${dims.earring_drop} mm drop length`;
  if (dims.pendant_height || dims.pendant_width) {
    return `about ${dims.pendant_height || '?'} mm by ${dims.pendant_width || '?'} mm`;
  }
  if (dims.size_note) return dims.size_note;
  return '';
}

/**
 * Compose the generation prompt from the design parameters.
 *
 * @param {object} params  The full design form (see DesignForm).
 * @param {object} [opts]
 * @param {'scratch'|'reference'} [opts.mode='scratch']
 * @returns {string} the prompt to send to the image model
 */
export function composeDesignPrompt(params = {}, { mode = 'scratch' } = {}) {
  const {
    piece_type, earring_subtype, style,
    metal_type, purity, finish, hallmark,
    center = {}, accents = [],
    dimensions = {}, motifs = [], motif_custom = '',
    occasion, target_wearer, extra_details = '',
  } = params;

  // The piece itself: "a temple-style Jhumka earring pair in 22K yellow gold".
  const pieceLabel = piece_type === 'Earrings' && earring_subtype
    ? `${earring_subtype} ${piece_type.toLowerCase()}`
    : (piece_type || 'jewellery piece');

  const lead = [];
  lead.push(`A single ${pieceLabel}`);
  if (style) lead.push(`in a ${style.toLowerCase()} style`);
  lead.push(`crafted in ${metalPhrase(metal_type, purity)}`);
  if (finish) lead.push(`with a ${finish.toLowerCase()} finish`);

  // Stone, accent, motif, size clauses — each omitted when empty.
  const clauses = [
    centreStonePhrase(center),
    accentPhrase(accents),
    motifPhrase(motifs, motif_custom),
    sizePhrase(piece_type, dimensions),
  ].filter(Boolean);

  let description = lead.join(', ');
  if (clauses.length) description += `, ${clauses.join(', ')}`;
  if (occasion) description += `, suited for ${occasion.toLowerCase()} wear`;
  if (target_wearer && target_wearer !== 'Women') description += ` for ${target_wearer.toLowerCase()}`;
  description += '.';

  // Studio-photography framing shared by both modes.
  const framing =
    'Professional product photograph. The piece is centred on a clean, ' +
    'neutral light-grey studio background with soft, diffused lighting and ' +
    'gentle, realistic reflections on the metal and stones. True-to-scale ' +
    'proportions, accurate stone placement and setting detail, sharp focus, ' +
    'fine craftsmanship visible. No model, no hands, no text or watermark. ' +
    'Catalogue-quality, photorealistic.';

  const hallmarkNote = hallmark
    ? ' The piece is BIS-hallmarked (do not render visible hallmark stamps in the photo).'
    : '';

  // The owner's own words (Step 9) — appended verbatim so anything the form
  // didn't cover (e.g. "keep small diamonds hanging at the bottom") is honoured.
  const extra = String(extra_details || '').trim();
  const extraNote = extra ? ` Additional instructions from the jeweller: ${extra}.` : '';

  if (mode === 'reference') {
    return (
      'Using the supplied reference image as inspiration for the overall ' +
      'silhouette and feel, recreate it as the following piece. Keep the ' +
      'spirit of the reference but apply these specifications exactly: ' +
      description + extraNote + ' ' + framing + hallmarkNote
    );
  }

  return description + extraNote + ' ' + framing + hallmarkNote;
}
