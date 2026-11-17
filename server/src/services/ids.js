import mongoose from 'mongoose';
import Counter from '../models/Counter.js';

// Human-readable IDs:
//   staff (employee / evaluator)  DSK-EMP-001
//   input sheet (valuation)       DSK-INP-0001
//   customer                      DSK-CIN-0001
//   report                        DSK-RPT-0001
// Numbers keep growing past the padding (DSK-EMP-1000, DSK-INP-10000).
export const ID_FORMATS = {
  emp: { prefix: 'DSK-EMP-', digits: 3, model: 'User', field: 'code' },
  inp: { prefix: 'DSK-INP-', digits: 4, model: 'Valuation', field: 'referenceNo' },
  cin: { prefix: 'DSK-CIN-', digits: 4, model: 'Customer', field: 'code' },
  rpt: { prefix: 'DSK-RPT-', digits: 4, model: 'Report', field: 'reportNo' },
};

export const formatId = (kind, n) => `${ID_FORMATS[kind].prefix}${String(n).padStart(ID_FORMATS[kind].digits, '0')}`;
export const isFormatted = (kind, value) => new RegExp(`^${ID_FORMATS[kind].prefix}\\d{${ID_FORMATS[kind].digits},}$`).test(String(value || ''));

// highest number already used in the new format (so a fresh counter never re-issues an existing ID)
async function highestUsed(kind) {
  const { prefix, model, field } = ID_FORMATS[kind];
  const Model = mongoose.models[model];
  if (!Model) return 0;
  const rows = await Model.find({ [field]: new RegExp(`^${prefix}\\d+$`) }).select(field).lean();
  return rows.reduce((max, r) => Math.max(max, Number(String(r[field]).slice(prefix.length)) || 0), 0);
}

const initialised = new Set();
async function ensureCounter(kind) {
  if (initialised.has(kind)) return;
  const existing = await Counter.findById(kind).lean();
  if (!existing) {
    const start = await highestUsed(kind);
    // upsert without overwriting a counter another process created meanwhile
    await Counter.updateOne({ _id: kind }, { $setOnInsert: { seq: start } }, { upsert: true });
  }
  initialised.add(kind);
}

// next ID of a kind, e.g. nextId('cin') → "DSK-CIN-0007"
export async function nextId(kind) {
  if (!ID_FORMATS[kind]) throw new Error(`Unknown ID kind: ${kind}`);
  await ensureCounter(kind);
  const c = await Counter.findOneAndUpdate({ _id: kind }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return formatId(kind, c.seq);
}

// tests: forget cached counter state between in-memory databases
export const resetIdCache = () => initialised.clear();
