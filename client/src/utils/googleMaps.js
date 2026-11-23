// Google Maps in the browser. The key comes from VITE_GOOGLE_MAPS_KEY in client/.env (a browser key restricted to the
// app's web addresses in Google Cloud). Without a key, or when Google refuses it (wrong key, address not allowed,
// billing off), the maps fall back to the free OpenStreetMap / Esri maps automatically.
import { useEffect, useState } from 'react';

export const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY || '').trim();

let loading = null;
let failed = !GOOGLE_KEY;
const listeners = new Set();
const fail = () => { failed = true; listeners.forEach((fn) => fn(null)); };

// → Promise<google.maps | null>
export function loadGoogleMaps() {
  if (failed) return Promise.resolve(null);
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (!loading) {
    loading = new Promise((resolve) => {
      const cb = '__dskGoogleMapsReady';
      window[cb] = () => resolve(window.google.maps);
      // Google calls this when the key is refused (shown as "This page can't load Google Maps correctly")
      window.gm_authFailure = () => { console.warn('[maps] Google Maps refused the key: using the free maps'); fail(); };
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_KEY)}&v=weekly&loading=async&callback=${cb}`;
      s.async = true;
      s.onerror = () => { fail(); resolve(null); };
      document.head.appendChild(s);
      setTimeout(() => { if (!window.google?.maps?.Map) { fail(); resolve(null); } }, 15000);
    });
  }
  return loading;
}

// undefined while loading · google.maps when ready · null = use the free maps
export function useGoogleMaps() {
  const [g, setG] = useState(() => (failed ? null : window.google?.maps?.Map ? window.google.maps : undefined));
  useEffect(() => {
    let live = true;
    const on = (v) => live && setG(v);
    listeners.add(on);
    if (g === undefined) loadGoogleMaps().then((v) => live && setG(failed ? null : v));
    return () => { live = false; listeners.delete(on); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return g;
}

// Static map image (report): centre + zoom, size up to 640 × 640 (shown at twice the resolution)
export function staticMapUrl({ lat, lon, zoom, width, height, maptype = 'roadmap' }) {
  const q = new URLSearchParams({ center: `${lat},${lon}`, zoom: String(zoom), size: `${width}x${height}`, scale: '2', maptype, key: GOOGLE_KEY });
  return `https://maps.googleapis.com/maps/api/staticmap?${q}`;
}
