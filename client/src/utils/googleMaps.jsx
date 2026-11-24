// Google Maps in the browser: every map in the app uses it. The key comes from VITE_GOOGLE_MAPS_KEY in client/.env
// (a browser key restricted to the app's web addresses in Google Cloud). When there is no key or Google refuses it
// (Maps JavaScript API not allowed for the key, website not allowed, billing off), the map shows a message saying so.
import { useEffect, useState } from 'react';

export const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY || '').trim();

let loading = null;
let problem = GOOGLE_KEY ? '' : 'no-key'; // '' · 'no-key' · 'refused' · 'offline'
const listeners = new Set();
const fail = (why) => { problem = why; listeners.forEach((fn) => fn(null)); };

// → Promise<google.maps | null>
export function loadGoogleMaps() {
  if (problem) return Promise.resolve(null);
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (!loading) {
    loading = new Promise((resolve) => {
      const cb = '__dskGoogleMapsReady';
      window[cb] = () => resolve(window.google.maps);
      // Google calls this when it refuses the key ("This page can't load Google Maps correctly")
      window.gm_authFailure = () => { console.warn('[maps] Google Maps refused the key'); fail('refused'); };
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_KEY)}&v=weekly&loading=async&callback=${cb}`;
      s.async = true;
      s.onerror = () => { fail('offline'); resolve(null); };
      document.head.appendChild(s);
      setTimeout(() => { if (!window.google?.maps?.Map) { fail('offline'); resolve(null); } }, 15000);
    });
  }
  return loading;
}

// undefined while loading · google.maps when ready · null = Google Maps could not load (see MapUnavailable)
export function useGoogleMaps() {
  const [g, setG] = useState(() => (problem ? null : window.google?.maps?.Map ? window.google.maps : undefined));
  useEffect(() => {
    let live = true;
    const on = (v) => live && setG(v);
    listeners.add(on);
    if (g === undefined) loadGoogleMaps().then((v) => live && setG(problem ? null : v));
    return () => { live = false; listeners.delete(on); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return g;
}

const WHY = {
  'no-key': 'No Google Maps key is set. Add VITE_GOOGLE_MAPS_KEY to client/.env and restart the app.',
  refused: 'Google refused the key. In Google Cloud, allow the Maps JavaScript API (and Maps Static API) for the key, and allow this website address.',
  offline: 'Google Maps could not be reached. Check the internet connection and reload the page.',
};
// shown where a map would be when Google Maps can't load
export function MapUnavailable({ className = '' }) {
  return (
    <div className={`map-unavailable ${className}`.trim()} role="status">
      <strong>The map could not load</strong>
      <span>{WHY[problem] || WHY.offline}</span>
    </div>
  );
}

// Static map image (report): centre + zoom, size up to 640 × 640 (shown at twice the resolution)
export function staticMapUrl({ lat, lon, zoom, width, height, maptype = 'roadmap' }) {
  const q = new URLSearchParams({ center: `${lat},${lon}`, zoom: String(zoom), size: `${width}x${height}`, scale: '2', maptype, key: GOOGLE_KEY });
  return `https://maps.googleapis.com/maps/api/staticmap?${q}`;
}
