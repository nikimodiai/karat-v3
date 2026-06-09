// Share an image URL as an actual file via Web Share API (files).
// WhatsApp and other apps receive the image directly instead of a link.
// Falls back to sharing the URL as text if file-sharing is unsupported.
export async function shareImageFile(imageUrl, { title = 'Jewellery', text = 'Check out this jewellery! 💎' } = {}) {
  if (!navigator.share) return false;
  try {
    // Try sharing as a file first (works on Android Chrome / iOS Safari 15.1+)
    if (navigator.canShare) {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      const file = new File([blob], `jewellery.${ext}`, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title, text });
        return true;
      }
    }
    // Fallback: share URL
    await navigator.share({ title, text, url: imageUrl });
    return true;
  } catch {
    return false;
  }
}

// Compress an image File or Blob before uploading to Cloudinary.
// Target: ≤1200px on longest side, JPEG quality 0.82 — looks great on WhatsApp,
// typically reduces a 3-5 MB phone photo to 150-350 KB.
export async function compressImage(source, { maxPx = 1200, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const url = source instanceof File ? URL.createObjectURL(source) : source;
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, maxPx / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => {
          if (source instanceof File) URL.revokeObjectURL(url);
          blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'));
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}
