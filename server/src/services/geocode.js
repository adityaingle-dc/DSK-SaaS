// Map point → address, for filling the input sheet's Property location from the map.
// Uses OpenStreetMap's Nominatim reverse geocoder (free, no key). Its usage policy asks for at most one request
// per second and an identifying User-Agent, so requests are queued one at a time, results are cached in memory,
// and GEOCODE_USER_AGENT should name the deployment (e.g. "valuation-desk/1.0 (admin@your-domain)").
// Nothing is stored in the database.

const URL_BASE = process.env.GEOCODE_URL || 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = process.env.GEOCODE_USER_AGENT || 'valuation-desk/1.0';
const MIN_GAP_MS = 1100;
const CACHE_MAX = 500;
const TIMEOUT_MS = 8000;

const cache = new Map(); // "lat,lon" (≈1 m) → result
let queue = Promise.resolve();
let last = 0;

// all-capital names ("PERKIT") read better as "Perkit"; mixed-case names are kept as they are
const clean = (s) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > 3 && t === t.toUpperCase() && /[A-Z]/.test(t) ? t.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()) : t;
};
const dropSuffix = (s) => clean(s).replace(/\s+(district|sub-?district|taluka|taluk|tehsil|mandal|tahsil)$/i, '');
const uniq = (parts) => parts.map(clean).filter((x, i, a) => x && a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);

// Nominatim's address parts → the sheet's fields (India: county ≈ mandal / taluka, state_district ≈ district)
export function toSheetFields(a = {}, name = '') {
  const town = a.city || a.town || a.municipality;
  const village = a.village || a.hamlet || a.suburb || a.town || a.city || a.neighbourhood || '';
  const district = dropSuffix(a.state_district || a.district || a.county || '');
  const localBody = town ? clean(town) : dropSuffix(a.county || a.city_district || a.subdistrict || '');
  const street = uniq([a.road, a.residential, a.neighbourhood, a.quarter, a.suburb !== village ? a.suburb : '']).slice(0, 3).join(', ');
  const pin = String(a.postcode || '').replace(/\s/g, '');
  const place = clean(name) && !/^\d/.test(name) && clean(name) !== clean(a.road) ? clean(name) : '';
  const out = {
    number: clean(a.house_number),
    street,
    village: clean(village),
    localBodyType: town ? 'Municipality' : (a.county || a.subdistrict ? 'Mandal' : ''),
    localBodyName: localBody,
    district,
    pincode: /^[1-9][0-9]{5}$/.test(pin) ? pin : '',
    landmark: place ? `Near ${place}` : '',
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function reverseGeocode(lat, lon) {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (cache.has(key)) return cache.get(key);
  const run = async () => {
    const gap = last + MIN_GAP_MS - Date.now();
    if (gap > 0) await wait(gap);
    last = Date.now();
    const url = `${URL_BASE}?format=jsonv2&addressdetails=1&zoom=18&accept-language=en&lat=${lat}&lon=${lon}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: ctrl.signal });
      if (!r.ok) throw new Error(`geocoder answered ${r.status}`);
      const j = await r.json();
      const result = { fields: toSheetFields(j.address || {}, j.name), place: clean(j.display_name), found: !!j.address };
      cache.set(key, result);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return result;
    } finally {
      clearTimeout(t);
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

// Address → map point (the site address typed in Add customer, shown on a map). Same service, queue and politeness as
// above; India only. → { lat, lon, place } or null when nothing matches.
const SEARCH_URL = process.env.GEOCODE_SEARCH_URL || 'https://nominatim.openstreetmap.org/search';
const searchCache = new Map();
export async function forwardGeocode(query) {
  const q = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!q) return null;
  const key = q.toLowerCase();
  if (searchCache.has(key)) return searchCache.get(key);
  const run = async () => {
    const gap = last + MIN_GAP_MS - Date.now();
    if (gap > 0) await wait(gap);
    last = Date.now();
    const url = `${SEARCH_URL}?format=jsonv2&limit=1&countrycodes=in&accept-language=en&q=${encodeURIComponent(q)}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: ctrl.signal });
      if (!r.ok) throw new Error(`geocoder answered ${r.status}`);
      const [hit] = await r.json();
      const result = hit ? { lat: +Number(hit.lat).toFixed(7), lon: +Number(hit.lon).toFixed(7), place: clean(hit.display_name), kind: hit.addresstype || hit.type || '' } : null;
      searchCache.set(key, result);
      if (searchCache.size > CACHE_MAX) searchCache.delete(searchCache.keys().next().value);
      return result;
    } finally {
      clearTimeout(t);
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}
