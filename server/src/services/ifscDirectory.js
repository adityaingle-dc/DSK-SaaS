// Branch directory for "bank name + branch → IFSC".
// Source: Razorpay's public IFSC dataset (RBI data), one JSON file per bank, published as by-bank.tar.gz on
// https://github.com/razorpay/ifsc/releases. It is downloaded the first time someone searches (≈12 MB), turned into
// small per-bank files under server/data/ifsc/, and refreshed in the background when older than REFRESH_DAYS.
// Nothing is stored in the database.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.IFSC_DATA_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/ifsc');
const SOURCE = process.env.IFSC_SOURCE_URL || 'https://github.com/razorpay/ifsc/releases/latest/download/by-bank.tar.gz';
const REFRESH_DAYS = 60;
const INDEX = () => path.join(DATA_DIR, 'banks.json');
const MAX_BANKS_IN_MEMORY = 8;

const titleCase = (s) => String(s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\s+/g, ' ').trim();
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

// minimal tar reader: yields { name, data } for regular files
function* untar(buf) {
  let off = 0;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const str = (a, b) => header.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
    const prefix = str(345, 500);
    const name = (prefix ? `${prefix}/` : '') + str(0, 100);
    const size = parseInt(str(124, 136).trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 48);
    off += 512;
    if (type === '0' || type === '\0') yield { name, data: buf.subarray(off, off + size) };
    off += Math.ceil(size / 512) * 512;
  }
}

let building = null; // one download at a time
async function build() {
  const res = await fetch(SOURCE, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`IFSC data download failed (${res.status})`);
  const tar = zlib.gunzipSync(Buffer.from(await res.arrayBuffer()));
  const tmp = `${DATA_DIR}.tmp-${process.pid}`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const banks = {};
  for (const { name, data } of untar(tar)) {
    const m = /([A-Z]{4})\.json$/.exec(name);
    if (!m) continue;
    const records = Object.values(JSON.parse(data.toString('utf8')));
    if (!records.length) continue;
    // compact rows: ifsc, branch, city, district, state, address, micr
    const rows = records.map((r) => [r.IFSC, titleCase(r.BRANCH), titleCase(r.CENTRE || r.CITY), titleCase(r.DISTRICT), titleCase(r.STATE), String(r.ADDRESS || '').replace(/\s+/g, ' ').trim(), r.MICR || '']);
    fs.writeFileSync(path.join(tmp, `${m[1]}.json`), JSON.stringify(rows));
    banks[m[1]] = { name: records[0].BANK || m[1], count: rows.length };
  }
  if (!Object.keys(banks).length) throw new Error('IFSC data download had no banks');
  fs.writeFileSync(path.join(tmp, 'banks.json'), JSON.stringify({ updatedAt: new Date().toISOString(), banks }));
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  fs.renameSync(tmp, DATA_DIR);
  cache.clear();
  index = null;
}

let index = null;
const cache = new Map(); // bank code → rows (most recently used last)

function readIndex() {
  if (index) return index;
  try { index = JSON.parse(fs.readFileSync(INDEX(), 'utf8')); } catch { index = null; }
  return index;
}

// make sure the data is on disk; refresh old data in the background
async function ensureData() {
  const idx = readIndex();
  if (idx) {
    const ageDays = (Date.now() - new Date(idx.updatedAt).getTime()) / 864e5;
    if (ageDays > REFRESH_DAYS && !building) {
      building = build().catch((e) => console.warn('[ifsc] refresh failed:', e.message)).finally(() => { building = null; });
    }
    return idx;
  }
  if (!building) building = build().finally(() => { building = null; });
  await building;
  return readIndex();
}

function rowsFor(code) {
  if (cache.has(code)) {
    const rows = cache.get(code);
    cache.delete(code);
    cache.set(code, rows);
    return rows;
  }
  let rows = [];
  try { rows = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${code}.json`), 'utf8')); } catch { rows = []; }
  cache.set(code, rows);
  while (cache.size > MAX_BANKS_IN_MEMORY) cache.delete(cache.keys().next().value);
  return rows;
}

// bank name (as typed or picked) → bank code; knownCode comes from the app's own bank list
export function resolveBank(idx, name, knownCode) {
  if (knownCode && idx.banks[knownCode]) return knownCode;
  const q = norm(name).replace(/\b(ltd|limited|the)\b/g, '').trim();
  if (!q) return null;
  const entries = Object.entries(idx.banks).map(([code, b]) => [code, norm(b.name).replace(/\b(ltd|limited|the)\b/g, '').trim()]);
  return entries.find(([, n]) => n === q)?.[0]
    || entries.find(([, n]) => n.startsWith(q))?.[0]
    || entries.filter(([, n]) => n.includes(q)).sort((a, b) => a[1].length - b[1].length)[0]?.[0]
    || null;
}

// branches of one bank matching the typed branch / area, best matches first
export async function searchBranches({ bank, knownCode, q, limit = 30 }) {
  const idx = await ensureData();
  const code = resolveBank(idx, bank, knownCode);
  if (!code) return { bankCode: null, bank: null, total: 0, items: [] };
  const words = norm(q).split(' ').filter(Boolean);
  const phrase = words.join(' ');
  const scored = [];
  for (const r of rowsFor(code)) {
    const branch = norm(r[1]);
    const place = norm(`${r[2]} ${r[3]} ${r[4]}`);
    const all = `${branch} ${place} ${norm(r[5])} ${r[0].toLowerCase()}`;
    if (!words.every((w) => all.includes(w))) continue;
    let score = 50;
    if (phrase && branch === phrase) score = 0;
    else if (phrase && branch.startsWith(phrase)) score = 1;
    else if (words.every((w) => branch.split(' ').some((x) => x.startsWith(w)))) score = 2;
    else if (words.every((w) => place.split(' ').some((x) => x.startsWith(w)))) score = 3;
    else if (words.every((w) => `${branch} ${place}`.includes(w))) score = 4;
    else score = 5; // only the address mentions it
    scored.push([score, r]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1][1].localeCompare(b[1][1]));
  return {
    bankCode: code,
    bank: idx.banks[code].name,
    total: scored.length,
    updatedAt: idx.updatedAt,
    items: scored.slice(0, limit).map(([, r]) => ({ ifsc: r[0], branch: r[1], city: r[2], district: r[3], state: r[4], address: r[5], micr: r[6] })),
  };
}
