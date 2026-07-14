// Sharing helpers for Library media (images + reels).
//
// Strategy: prefer the device's native share sheet (navigator.share) which, on
// mobile, can attach the ACTUAL image/video file so WhatsApp/Instagram receive
// media, not a link. Where that isn't available (most desktops) we fall back to
// a WhatsApp link, copy-link, and download.

// Turn a media URL into a File so it can ride the native share sheet.
async function urlToFile(url, fallbackName) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('fetch failed');
  const blob = await res.blob();
  const ext = blob.type.includes('video') ? 'mp4'
    : blob.type.includes('png') ? 'png'
    : 'jpg';
  const name = fallbackName || `swarnix-${Date.now()}.${ext}`;
  return new File([blob], name, { type: blob.type || 'application/octet-stream' });
}

// True if the browser can share these files natively (mobile Chrome/Safari).
export function canShareFiles(files) {
  return !!(navigator.canShare && navigator.share && navigator.canShare({ files }));
}

// Share one or more media items with the native sheet if possible.
// items: [{ url, name? }]. Returns 'shared' | 'unsupported' | 'cancelled'.
export async function nativeShareMedia(items, { title = 'Swarnix', text = '' } = {}) {
  if (!navigator.share) return 'unsupported';
  try {
    const files = [];
    for (const it of items) {
      try { files.push(await urlToFile(it.url, it.name)); } catch { /* skip unfetchable */ }
    }
    if (files.length && canShareFiles(files)) {
      await navigator.share({ files, title, text });
      return 'shared';
    }
    // No file support but share exists → share the link(s) as text.
    if (navigator.share) {
      await navigator.share({ title, text: `${text ? text + '\n' : ''}${items.map((i) => i.url).join('\n')}` });
      return 'shared';
    }
    return 'unsupported';
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}

// Open WhatsApp with the given text + media links (link-based, works anywhere).
export function shareToWhatsApp(urls, message = '') {
  const list = Array.isArray(urls) ? urls : [urls];
  const body = `${message ? message + '\n\n' : ''}${list.join('\n')}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(body)}`, '_blank', 'noopener');
}

// Copy a link (or newline-joined links) to the clipboard.
export async function copyLink(urls) {
  const text = (Array.isArray(urls) ? urls : [urls]).join('\n');
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// Trigger a browser download of one media file.
export async function downloadMedia(url, name) {
  try {
    const file = await urlToFile(url, name);
    const objectUrl = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    return true;
  } catch {
    // Last resort: open in a new tab so the user can save manually.
    window.open(url, '_blank', 'noopener');
    return false;
  }
}
