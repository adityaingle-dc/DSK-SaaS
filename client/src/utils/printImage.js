// Print-sized copies of images for the report. A report embeds every image in its PDF, so full-size camera photos
// (up to 2400 px) make the PDF very large and slow to save — Windows then reports "can't open" until it is written.
// The report shows a copy no bigger than it prints (≥300 dpi at the printed size); the original is untouched.
const cache = new Map();

// url: a blob / object URL of the original · maxPx: longest side · keepAlpha: PNG (signature, seal) instead of JPEG
export function printSized(url, maxPx, keepAlpha = false) {
  const key = `${url}|${maxPx}|${keepAlpha ? 'png' : 'jpg'}`;
  if (!cache.has(key)) {
    cache.set(key, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
        // already small enough (and not a PNG to turn into a JPEG): use it as it is
        if (scale === 1 && (keepAlpha || /jpe?g/i.test(img.currentSrc || ''))) return resolve(url);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const g = canvas.getContext('2d');
        if (!keepAlpha) { g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height); }
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : url), keepAlpha ? 'image/png' : 'image/jpeg', 0.85);
      };
      img.onerror = () => resolve(url); // can't read it: show the original
      img.src = url;
    }));
  }
  return cache.get(key);
}

// print sizes: longest side in pixels
export const PRINT_PX = { photo: 1400, page: 2000, signature: 700, seal: 360 };
