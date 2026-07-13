// Studio Photo (retouch) + Metal Swap (variant) — web integration.
//
// Both features hit ONE n8n workflow (/webhook/retouch) that branches on `mode`:
//   • retouch — raw counter photo → clean studio product image (Studio Photo).
//   • variant — change only the metal, keeping design/stones/enamel (Metal Swap).
//
// Ported from swarnix-studio/src/lib/retouch.ts. Difference: on the web we
// already hold a Cloudinary unsigned preset, so we upload the device photo
// directly (compressImage + Cloudinary) instead of routing through the reel
// image-upload webhook. The workflow does no quota logic — the app charges the
// shared Studio Suite meter after a successful generation.

import { N8N_RETOUCH, CLOUDINARY_CLOUD, CLOUDINARY_PRESET } from './config';
import { compressImage } from './imageUtils';

// Option sets — keys must match the workflow's styleBlocks / metalBlocks maps.
// Ported verbatim from the mobile studio's retouchOptions.ts.
export const RETOUCH_STYLES = [
  { v: 'ai', label: '✨ Let AI decide', tip: 'AI picks the most flattering studio scene for your piece.' },
  { v: 'white', label: 'Marketplace white', tip: 'Pure white background — ready for Amazon / Flipkart listings.' },
  { v: 'studio', label: 'Studio grey', tip: 'Soft light-grey studio gradient with a gentle vignette.' },
  { v: 'black', label: 'Black reflective', tip: 'Glossy black acrylic with a soft reflection — the classic gold & diamond hero shot.' },
  { v: 'luxury', label: 'Luxury silk', tip: 'Deep charcoal background on dark draped silk, soft dramatic spotlight.' },
  { v: 'royal', label: 'Royal velvet', tip: 'Emerald-green velvet with warm heritage-catalogue lighting.' },
  { v: 'marble', label: 'Marble flat-lay', tip: 'White marble slab, soft daylight, styled Instagram flat-lay look.' },
  { v: 'festive', label: 'Festive bokeh', tip: 'Warm blurred golden diya/bokeh lights over rich maroon silk.' },
  { v: 'daylight', label: 'Soft daylight', tip: 'Bright neutral window daylight on a clean neutral surface — natural and airy.' },
];
export const DEFAULT_STYLE = 'ai';

export const TARGET_METALS = [
  { v: 'yellow_gold', label: 'Yellow Gold', tip: 'Rich warm 22k yellow gold — the classic Indian bridal tone.', dot: '#E6B422' },
  { v: 'rose_gold', label: 'Rose Gold', tip: 'Warm pink-copper 18k rose gold.', dot: '#E0A899' },
  { v: 'white_gold', label: 'White Gold', tip: 'Bright cool silvery-white, rhodium-plated look.', dot: '#E8E8EC' },
  { v: 'silver', label: 'Silver', tip: 'Bright neutral sterling silver — cooler and lighter than white gold.', dot: '#C0C0C8' },
  { v: 'antique_gold', label: 'Antique Gold', tip: 'Matte oxidised temple / heritage gold finish.', dot: '#B08D57' },
];
export const DEFAULT_TARGET_METAL = 'rose_gold';

export const METAL_SWAP_DEFAULT_STYLE = 'keep';
export const METAL_SWAP_STYLES = [
  { v: 'keep', label: 'Keep original', tip: 'Leave the photo’s existing background and lighting as-is — only change the metal.' },
  ...RETOUCH_STYLES.filter((s) => s.v !== 'ai'),
];

// Upload a device photo to Cloudinary and return its secure_url.
export async function uploadRetouchImage(fileOrBlob, filename = 'source.jpg') {
  const compressed = await compressImage(fileOrBlob);
  const fd = new FormData();
  fd.append('file', compressed, filename);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', 'swarnix-studio-photo');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Cloudinary upload failed');
  return (await res.json()).secure_url;
}

function pickUrl(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.retouched_url === 'string') return data.retouched_url;
  if (typeof data.result_url === 'string') return data.result_url;
  if (typeof data.secure_url === 'string') return data.secure_url;
  return null;
}

// Run one retouch/variant generation. Returns the result image URL; throws with
// a user-facing message on any failure (so the caller shows the error and does
// NOT charge the meter).
export async function runRetouch({ ownerId, imageUrl, mode, style, targetMetal }) {
  const body = { owner_id: ownerId, image_url: imageUrl, mode, style };
  if (mode === 'variant' && targetMetal) body.target_metal = targetMetal;

  let res;
  try {
    res = await fetch(N8N_RETOUCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      mode: 'cors',
    });
  } catch {
    throw new Error('Network error — check your connection and try again.');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || (data && typeof data === 'object' && data.success === false)) {
    const msg = data && typeof data === 'object' && (data.message || data.reason || data.error);
    throw new Error(typeof msg === 'string' && msg ? msg : `Generation failed${res.status ? ` (${res.status})` : ''}. Please try again.`);
  }
  const url = pickUrl(data);
  if (!url) throw new Error('No image was returned. Please try again.');
  return url;
}
