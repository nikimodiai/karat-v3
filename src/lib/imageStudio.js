// Image Studio helpers — background swap + set compositing.
//
// All visual operations here are Cloudinary URL transforms, which carry NO
// per-use AI cost (they count only as ordinary transformations/bandwidth on
// the existing Cloudinary plan). The ONLY paid/compute step is background
// removal, which is delegated to a self-hosted rembg service via the n8n
// webhook N8N_BG_REMOVE (₹0 — runs on the Hostinger VPS).
//
// Flow:
//   File ──removeBackground()──▶ transparent PNG on Cloudinary { secure_url, public_id }
//        ──bgFillUrl()──────────▶ same cut-out on white / blue / brand / etc.
//        ──composeSetUrl()──────▶ necklace centred, earrings flanking it
//
import { CLOUDINARY_CLOUD, CLOUDINARY_PRESET, N8N_BG_REMOVE } from './config';

// ── Background swatches shown in the picker ─────────────────────────
// `bg` is the Cloudinary background token; `transparent` means "deliver the
// cut-out PNG as-is with no fill". `css` drives the swatch preview chip.
export const BG_SWATCHES = [
  { value: 'transparent', label: 'Transparent', bg: null,            css: 'transparent' },
  { value: 'white',       label: 'White',       bg: 'white',         css: '#ffffff' },
  { value: 'blue',        label: 'Studio Blue', bg: 'rgb:dceafb',    css: '#dceafb' },
  { value: 'navy',        label: 'Brand Navy',  bg: 'rgb:0d1b2a',    css: '#0d1b2a' },
  { value: 'cream',       label: 'Cream',       bg: 'rgb:fdfaf5',    css: '#fdfaf5' },
  { value: 'black',       label: 'Black',       bg: 'rgb:0a0a0a',    css: '#0a0a0a' },
];

// Convert a free-form colour (#RRGGBB or css name) into a Cloudinary bg token.
export function colorToBgToken(color) {
  if (!color) return null;
  const c = color.trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(c)) return 'rgb:' + c.replace('#', '').toLowerCase();
  if (/^#?[0-9a-fA-F]{3}$/.test(c)) {
    const h = c.replace('#', '');
    return 'rgb:' + h.split('').map(x => x + x).join('').toLowerCase();
  }
  return c.toLowerCase(); // assume a Cloudinary-recognised colour name
}

// Pull the public_id (incl. folder) out of a plain Cloudinary secure_url.
// Returns null for URLs that already carry transformations — in that case the
// caller should re-run removeBackground() to get a clean public_id instead.
export function publicIdFromUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
  if (!m) return null;
  const id = m[1];
  // A bare upload has no transformation segment; transforms contain commas.
  if (id.includes(',')) return null;
  return id;
}

// public_id → overlay token (folder separators become colons).
function overlayToken(publicId) {
  return 'l_' + publicId.replace(/\//g, ':');
}

const BASE = (cloud = CLOUDINARY_CLOUD) =>
  `https://res.cloudinary.com/${cloud}/image/upload`;

// Build a delivery URL that places a transparent cut-out on the chosen
// background, padded to a square so the jewellery is never cropped.
export function bgFillUrl(publicId, { cloud = CLOUDINARY_CLOUD, bg = null, size = 1000 } = {}) {
  if (!publicId) return null;
  if (!bg) {
    // Transparent → deliver the PNG as-is (alpha preserved).
    return `${BASE(cloud)}/c_pad,w_${size},h_${size}/${publicId}.png`;
  }
  return `${BASE(cloud)}/b_${bg},c_pad,w_${size},h_${size}/${publicId}.jpg`;
}

// Compose a "set" image: centre piece (e.g. necklace) as the canvas base,
// with side pieces (e.g. earrings) overlaid in the top corners. When only one
// side piece is supplied, it is mirrored for the opposite corner.
//
//   center / left / right  → Cloudinary public_ids of transparent cut-outs
//   bg                     → background token (null = transparent PNG)
//   layout                 → 'corners' (earrings top corners) | 'sides' (mid)
export function composeSetUrl({
  cloud = CLOUDINARY_CLOUD,
  center,
  left = null,
  right = null,
  bg = null,
  layout = 'corners',
  size = 1200,
} = {}) {
  if (!center) return null;

  const ext = bg ? 'jpg' : 'png';
  const bgPart = bg ? `b_${bg},` : '';
  // Centre piece becomes the padded canvas base.
  const canvas = `${bgPart}c_pad,w_${size},h_${size}`;

  const sideW = Math.round(size * 0.24);
  const offX  = Math.round(size * 0.06);
  const offY  = layout === 'sides' ? Math.round(size * 0.30) : Math.round(size * 0.05);
  const gL    = layout === 'sides' ? 'west' : 'north_west';
  const gR    = layout === 'sides' ? 'east' : 'north_east';

  // Resolve the two side slots; mirror a lone earring onto the empty side.
  const leftId  = left  || right || null;
  const rightId = right || left  || null;
  const mirrorRight = !right && !!left;   // reuse left, flipped
  const mirrorLeft  = !left  && !!right;  // reuse right, flipped

  const parts = [canvas];
  if (leftId) {
    const flip = mirrorLeft ? ',a_hflip' : '';
    parts.push(`${overlayToken(leftId)},c_fit,w_${sideW}${flip}/fl_layer_apply,g_${gL},x_${offX},y_${offY}`);
  }
  if (rightId) {
    const flip = mirrorRight ? ',a_hflip' : '';
    parts.push(`${overlayToken(rightId)},c_fit,w_${sideW}${flip}/fl_layer_apply,g_${gR},x_${offX},y_${offY}`);
  }

  return `${BASE(cloud)}/${parts.join('/')}/${center}.${ext}`;
}

// Remove an image's background via the self-hosted rembg service (n8n webhook).
// Accepts a File (preferred) or an existing image URL. Returns the transparent
// PNG hosted on Cloudinary: { secure_url, public_id }.
export async function removeBackground(source) {
  const fd = new FormData();
  if (source instanceof File || source instanceof Blob) {
    fd.append('image', source, 'jewellery.png');
  } else if (typeof source === 'string') {
    fd.append('image_url', source);
  } else {
    throw new Error('removeBackground: need a File/Blob or image URL');
  }

  const res = await fetch(N8N_BG_REMOVE, {
    method: 'POST',
    body: fd,
    credentials: 'omit',
    mode: 'cors',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Background removal failed (${res.status})${text ? ': ' + text.slice(0, 120) : ''}`);
  }
  const data = await res.json();
  const secure_url = data.secure_url || data.result_url || data?.[0]?.secure_url;
  const public_id  = data.public_id || data?.[0]?.public_id || publicIdFromUrl(secure_url);
  if (!secure_url || !public_id) {
    throw new Error('Background removal returned no image. Check the rembg workflow output.');
  }
  return { secure_url, public_id };
}

// Upload a raw File to Cloudinary unsigned, returning { secure_url, public_id }.
// (Unlike Inventory's helper this skips JPEG re-compression so alpha survives,
// and exposes public_id for compositing.)
export async function uploadRaw(file, folder = 'swarnix-pieces') {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) throw new Error('Cloudinary upload failed');
  const json = await res.json();
  return { secure_url: json.secure_url, public_id: json.public_id };
}
