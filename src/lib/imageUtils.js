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
