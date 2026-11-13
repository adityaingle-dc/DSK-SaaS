// Sanitise and validate a valuation sheet against the form schema.
// sanitize(): keeps only known fields, trims strings, coerces numbers/booleans (safe for any client input)
// validate(): returns [{ field: 'section.key', message }] – `mode: 'submit'` also enforces required fields

import { SECTIONS, sectionPath, visibleSections } from './formSchema.js';
import { getContext } from './calc.js';
import { STAGE_STATUS } from './constants.js';

// Upload rules shared by client (pre-check) and server (enforcement)
export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function cleanScalar(field, v) {
  if (isBlank(v)) return undefined;
  switch (field.type) {
    case 'number': {
      const n = Number(v);
      return Number.isFinite(n) ? n : String(v); // keep invalid input so validate() can report it
    }
    case 'checkbox':
      return v === true || v === 'true' || v === 1 || v === '1';
    case 'date':
      return String(v).slice(0, 10);
    default: {
      const s = String(v).trim().slice(0, 2000);
      return field.uppercase ? s.toUpperCase() : s;
    }
  }
}

function cleanField(field, v) {
  switch (field.type) {
    case 'table':
      if (!Array.isArray(v)) return [];
      return v.slice(0, 100).map((row) =>
        Object.fromEntries(
          field.columns
            .map((c) => [c.key, cleanField(c, row?.[c.key])])
            .filter(([, x]) => x !== undefined && !(Array.isArray(x) && !x.length))
        )
      ).filter((row) => Object.keys(row).length);
    case 'files':
      // References to uploaded attachments; the server re-checks ownership and overwrites metadata from the DB
      if (!Array.isArray(v)) return undefined;
      return v
        .filter((f) => f && /^[a-f0-9]{24}$/i.test(String(f.id)))
        .slice(0, field.maxFiles || MAX_FILES)
        .map((f) => ({ id: String(f.id), name: String(f.name || '').slice(0, 200), type: String(f.type || ''), size: Number(f.size) || 0 }));
    case 'grid': {
      const out = {};
      for (const r of field.rows) {
        const k = r.toLowerCase();
        out[k] = Object.fromEntries(field.columns.map((c) => [c.key, cleanScalar({ type: 'text' }, v?.[k]?.[c.key])]).filter(([, x]) => x !== undefined));
      }
      return out;
    }
    case 'tiers': {
      const out = {};
      for (const item of field.items) {
        const sel = v?.[item.key];
        const tier = Math.trunc(Number(sel?.tier));
        if (tier >= 1 && tier <= 4) out[item.key] = { tier, ...(item.unit && !isBlank(sel.qty) ? { qty: Math.max(0, Number(sel.qty) || 0) } : {}) };
      }
      return out;
    }
    case 'stages': {
      const out = {};
      for (const item of field.items) if (v?.[item.key] in STAGE_STATUS) out[item.key] = v[item.key];
      return out;
    }
    case 'multiselect':
      return Array.isArray(v) ? v.filter((x) => field.options.includes(x)) : [];
    case 'latlon': {
      if (!v || typeof v !== 'object') return undefined;
      const lat = Number(v.lat);
      const lon = Number(v.lon);
      return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : undefined;
    }
    default:
      return cleanScalar(field, v);
  }
}

export function sanitize(data = {}) {
  const out = {};
  for (const s of SECTIONS) {
    const path = sectionPath(s);
    const src = data?.[path] || {};
    const target = (out[path] ||= {});
    for (const f of s.fields) {
      const v = cleanField(f, src[f.key]);
      if (v !== undefined) target[f.key] = v;
    }
  }
  return out;
}

function checkScalar(field, v, name, errors) {
  if (isBlank(v)) return;
  if (field.type === 'number') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return errors.push({ field: name, message: `${field.label}: must be a number` });
    if (field.min !== undefined && v < field.min) errors.push({ field: name, message: `${field.label}: must be at least ${field.min}` });
    if (field.max !== undefined && v > field.max) errors.push({ field: name, message: `${field.label}: must be at most ${field.max}` });
  }
  if (field.type === 'date' && Number.isNaN(new Date(v).getTime())) errors.push({ field: name, message: `${field.label}: invalid date` });
  if (field.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors.push({ field: name, message: `${field.label}: invalid email` });
  if ((field.type === 'select' || field.type === 'choice') && field.options && !field.options.includes(String(v))) {
    errors.push({ field: name, message: `${field.label}: "${v}" is not an allowed option` });
  }
  if (field.pattern && !new RegExp(field.pattern).test(String(v))) errors.push({ field: name, message: field.patternMessage || `${field.label}: invalid format` });
}

export function validate(data = {}, { mode = 'draft' } = {}) {
  const errors = [];
  const ctx = getContext(data);
  for (const s of visibleSections(ctx, data)) {
    const path = sectionPath(s);
    const values = data[path] || {};
    for (const f of s.fields) {
      if (f.when && !f.when(ctx, data)) continue;
      const name = `${path}.${f.key}`;
      const v = values[f.key];
      if (mode === 'submit' && f.required) {
        const empty = f.type === 'table' ? !(Array.isArray(v) && v.length) : isBlank(v);
        if (empty) errors.push({ field: name, message: `${f.label} is required` });
      }
      if (f.type === 'table' && Array.isArray(v)) {
        v.forEach((row, i) => f.columns.forEach((c) => checkScalar(c, row[c.key], `${name}.${i}.${c.key}`, errors)));
      } else if (!['grid', 'tiers', 'stages', 'multiselect', 'latlon', 'checkbox'].includes(f.type)) {
        checkScalar(f, v, name, errors);
      }
      if (f.type === 'latlon' && v && (Math.abs(v.lat) > 90 || Math.abs(v.lon) > 180)) errors.push({ field: name, message: 'GPS coordinates out of range' });
    }
  }
  return errors;
}

// "18.7944150271428,78.29840297923899" or "18.79, 78.29" -> { lat, lon }  (replaces the LatlonSplit macro)
export function parseLatLon(text) {
  const m = String(text || '').match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}
