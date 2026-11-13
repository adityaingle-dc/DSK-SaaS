import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachmentIds } from '@dsk/shared';
import Attachment from '../models/Attachment.js';
import { isReviewer } from '../models/User.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(here, '../../uploads'));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const filePath = (storageKey) => path.join(UPLOAD_DIR, path.basename(storageKey));

// Check the real file signature, not just the browser-supplied MIME type
export async function sniffType(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const { buffer } = await fh.read(Buffer.alloc(12), 0, 12, 0);
    const hex = buffer.toString('hex');
    const ascii = buffer.toString('latin1');
    if (hex.startsWith('ffd8ff')) return 'image/jpeg';
    if (hex.startsWith('89504e47')) return 'image/png';
    if (ascii.startsWith('%PDF')) return 'application/pdf';
    if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
    if (ascii.slice(4, 8) === 'ftyp' && /heic|heix|mif1|msf1|heif/.test(ascii.slice(8, 12))) return 'image/heic';
    return null;
  } finally {
    await fh.close();
  }
}

export async function canAccess(user, attachment) {
  if (isReviewer(user) || String(attachment.owner) === String(user._id)) return true;
  if (!attachment.valuation) return false;
  const Valuation = (await import('../models/Valuation.js')).default;
  return Boolean(await Valuation.exists({ _id: attachment.valuation, evaluator: user._id }));
}

// Keep only attachments the user may reference, refresh their metadata from the DB,
// link them to this valuation and unlink ones that were removed from the sheet.
export async function syncAttachments(valuation, user) {
  const ids = [...new Set(attachmentIds(valuation.data))];
  const found = ids.length ? await Attachment.find({ _id: { $in: ids } }) : [];
  const allowed = new Map();
  for (const a of found) {
    const linkedHere = a.valuation && String(a.valuation) === String(valuation._id);
    const free = !a.valuation && (isReviewer(user) || String(a.owner) === String(user._id));
    if (linkedHere || free) allowed.set(String(a._id), a);
  }

  for (const row of valuation.data.documents?.items || []) {
    if (!row.files) continue;
    row.files = row.files.filter((f) => allowed.has(f.id)).map((f) => allowed.get(f.id).toRef());
    if (!row.files.length) delete row.files;
  }

  const keep = [...allowed.keys()];
  await Attachment.updateMany({ _id: { $in: keep } }, { $set: { valuation: valuation._id } });
  await Attachment.updateMany({ valuation: valuation._id, _id: { $nin: keep } }, { $set: { valuation: null } });
}

export async function removeAttachment(a) {
  await fsp.rm(filePath(a.storageKey), { force: true });
  await a.deleteOne();
}

export async function removeForValuation(valuationId) {
  const list = await Attachment.find({ valuation: valuationId });
  await Promise.all(list.map(removeAttachment));
}
