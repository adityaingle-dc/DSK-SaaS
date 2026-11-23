// Map point → address (fill the sheet's Property location from the map) and address → map point (Add customer's map).
// With GOOGLE_MAPS_KEY in server/.env: Google's Geocoding API (a server key, restricted to this server's IP address).
// Without it, or when Google refuses the request: OpenStreetMap's Nominatim (free, no key). Its usage policy asks for at most one request
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

async function nominatimReverse(lat, lon) {
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
async function nominatimSearch(query) {
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

// ---------- Google Geocoding API ----------
const GOOGLE_KEY = (process.env.GOOGLE_MAPS_KEY || '').trim();
const GOOGLE_URL = process.env.GOOGLE_GEOCODE_URL || 'https://maps.googleapis.com/maps/api/geocode/json';
const gCache = new Map();
let googleOff = false; // set when Google refuses the key (logged once); the free service takes over

async function google(params) {
  const q = new URLSearchParams({ ...params, key: GOOGLE_KEY, language: 'en', region: 'in' });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${GOOGLE_URL}?${q}`, { signal: ctrl.signal });
    const j = await r.json();
    if (j.status === 'OK') return j.results;
    if (j.status === 'ZERO_RESULTS') return [];
    if (['REQUEST_DENIED', 'OVER_DAILY_LIMIT'].includes(j.status)) {
      if (!googleOff) console.warn(`[geocode] Google refused the key (${j.status}: ${j.error_message || ''}); using OpenStreetMap`);
      googleOff = true;
    }
    throw new Error(`Google geocoding: ${j.status}`);
  } finally {
    clearTimeout(t);
  }
}

// Google's address parts → the sheet's fields (India: locality = town / city, sublocality = area / colony,
// administrative_area_level_3 or _2 = district / taluka)
export function googleToSheetFields(result = {}) {
  const part = (type) => result.address_components?.find((c) => c.types.includes(type))?.long_name || '';
  const town = part('locality');
  const area = part('sublocality_level_1') || part('sublocality') || part('neighborhood');
  const district = dropSuffix((part('administrative_area_level_3') || part('administrative_area_level_2')).replace(/\s+division$/i, ''));
  const street = uniq([part('route'), part('premise'), part('sublocality_level_3'), part('sublocality_level_2')]).slice(0, 3).join(', ');
  const pin = part('postal_code').replace(/\s/g, '');
  const poi = result.types?.some((x) => ['point_of_interest', 'establishment'].includes(x)) ? clean(result.address_components?.[0]?.long_name) : '';
  const out = {
    number: clean(part('street_number')),
    street,
    village: clean(area || town),
    localBodyType: town ? 'Municipality' : '',
    localBodyName: clean(town),
    district,
    pincode: /^[1-9][0-9]{5}$/.test(pin) ? pin : '',
    landmark: poi ? `Near ${poi}` : '',
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}

const useGoogle = () => GOOGLE_KEY && !googleOff;

export async function reverseGeocode(lat, lon) {
  if (useGoogle()) {
    const key = `r:${lat.toFixed(5)},${lon.toFixed(5)}`;
    if (gCache.has(key)) return gCache.get(key);
    try {
      const results = await google({ latlng: `${lat},${lon}` });
      const best = results.find((x) => !x.types?.includes('plus_code')) || results[0];
      const result = best ? { fields: googleToSheetFields(best), place: clean(best.formatted_address), found: true, source: 'google' } : { fields: {}, place: '', found: false, source: 'google' };
      gCache.set(key, result);
      if (gCache.size > CACHE_MAX) gCache.delete(gCache.keys().next().value);
      return result;
    } catch (e) {
      if (!googleOff) throw e;
    }
  }
  return nominatimReverse(lat, lon);
}

export async function forwardGeocode(query) {
  const q = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!q) return null;
  if (useGoogle()) {
    const key = `f:${q.toLowerCase()}`;
    if (gCache.has(key)) return gCache.get(key);
    try {
      const [hit] = await google({ address: q, components: 'country:IN' });
      const result = hit ? {
        lat: +hit.geometry.location.lat.toFixed(7), lon: +hit.geometry.location.lng.toFixed(7), place: clean(hit.formatted_address),
        kind: hit.types?.[0] || '', exact: ['ROOFTOP', 'RANGE_INTERPOLATED'].includes(hit.geometry.location_type), source: 'google',
      } : null;
      gCache.set(key, result);
      if (gCache.size > CACHE_MAX) gCache.delete(gCache.keys().next().value);
      return result;
    } catch (e) {
      if (!googleOff) throw e;
    }
  }
  return nominatimSearch(q);
}
