// Address lookup with Google's Geocoding API (GOOGLE_MAPS_KEY in server/.env: a server key, restricted to this
// server's IP address and allowed to use the Geocoding API).
//  - reverseGeocode: map point → address fields (fill the sheet's Property location from the map)
//  - forwardGeocode: address → map point (Add customer's site map)
// Results are cached in memory; nothing is stored in the database. Errors carry a message for the user (userMessage).

const GOOGLE_KEY = (process.env.GOOGLE_MAPS_KEY || '').trim();
const GOOGLE_URL = process.env.GOOGLE_GEOCODE_URL || 'https://maps.googleapis.com/maps/api/geocode/json';
const CACHE_MAX = 500;
const TIMEOUT_MS = 8000;
const cache = new Map();

// all-capital names ("PERKIT") read better as "Perkit"; mixed-case names are kept as they are
const clean = (s) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > 3 && t === t.toUpperCase() && /[A-Z]/.test(t) ? t.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()) : t;
};
const dropSuffix = (s) => clean(s).replace(/\s+(district|sub-?district|taluka|taluk|tehsil|mandal|tahsil)$/i, '');
const uniq = (parts) => parts.map(clean).filter((x, i, a) => x && a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);

const problem = (userMessage, detail) => Object.assign(new Error(detail || userMessage), { userMessage });

async function google(params) {
  if (!GOOGLE_KEY) throw problem('Address lookup needs the Google Maps key (GOOGLE_MAPS_KEY in server/.env).');
  const q = new URLSearchParams({ ...params, key: GOOGLE_KEY, language: 'en', region: 'in' });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let j;
  try {
    j = await (await fetch(`${GOOGLE_URL}?${q}`, { signal: ctrl.signal })).json();
  } catch (e) {
    throw problem('Google address lookup could not be reached right now. Try again in a moment.', e.message);
  } finally {
    clearTimeout(t);
  }
  if (j.status === 'OK') return j.results;
  if (j.status === 'ZERO_RESULTS') return [];
  if (['REQUEST_DENIED', 'OVER_DAILY_LIMIT'].includes(j.status)) {
    console.warn(`[geocode] Google refused the key (${j.status}: ${j.error_message || ''})`);
    throw problem('Google refused the address lookup: allow the Geocoding API for the server key (GOOGLE_MAPS_KEY) in Google Cloud.', j.status);
  }
  throw problem('Google address lookup is unavailable right now. Try again in a moment.', `Google geocoding: ${j.status}`);
}

const cached = async (key, run) => {
  if (cache.has(key)) return cache.get(key);
  const result = await run();
  cache.set(key, result);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return result;
};

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

// map point → { fields, place, found }
export function reverseGeocode(lat, lon) {
  return cached(`r:${lat.toFixed(5)},${lon.toFixed(5)}`, async () => {
    const results = await google({ latlng: `${lat},${lon}` });
    const best = results.find((x) => !x.types?.includes('plus_code')) || results[0];
    return best ? { fields: googleToSheetFields(best), place: clean(best.formatted_address), found: true } : { fields: {}, place: '', found: false };
  });
}

// address → { lat, lon, place, kind, exact } or null when nothing matches (India only)
export function forwardGeocode(query) {
  const q = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!q) return Promise.resolve(null);
  return cached(`f:${q.toLowerCase()}`, async () => {
    const [hit] = await google({ address: q, components: 'country:IN' });
    return hit ? {
      lat: +hit.geometry.location.lat.toFixed(7), lon: +hit.geometry.location.lng.toFixed(7), place: clean(hit.formatted_address),
      kind: hit.types?.[0] || '', exact: ['ROOFTOP', 'RANGE_INTERPOLATED'].includes(hit.geometry.location_type),
    } : null;
  });
}
