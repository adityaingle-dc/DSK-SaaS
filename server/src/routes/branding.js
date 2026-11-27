import { Router } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { protect, requireSuperadmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { logActivity } from '../services/activity.js';
import { UPLOAD_DIR, sniffType } from '../services/attachments.js';

// The valuer's (superadmin's) signature and seal, printed on approved reports.
// - Read: any signed-in user (reports show them); never served from the public website files.
// - Replace: the superadmin only (Signature & seal page). Kept with the uploads (persistent); until replaced, the
//   images shipped with the app (assets/branding) are used.
const DEFAULT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/branding');
const DIR = path.join(UPLOAD_DIR, 'branding');
fs.mkdirSync(DIR, { recursive: true });
const NAMES = { signature: 'Signature', stamp: 'Seal' };
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const custom = (name) => path.join(DIR, name);
const metaFile = (name) => path.join(DIR, `${name}.json`);
const readMeta = async (name) => { try { return JSON.parse(await fsp.readFile(metaFile(name), 'utf8')); } catch { return null; } };

const upload = multer({
  storage: multer.diskStorage({ destination: DIR, filename: (req, _file, cb) => cb(null, `${req.params.name}.upload`) }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const router = Router();
router.use(protect);

const known = (req, _res, next) => (NAMES[req.params.name] ? next() : next(new HttpError(404, 'Not found')));

// which images are in use (the shipped ones, or replaced: when and by whom)
router.get('/', asyncHandler(async (_req, res) => {
  const out = {};
  for (const name of Object.keys(NAMES)) {
    const meta = await readMeta(name);
    out[name] = meta && fs.existsSync(custom(name)) ? { custom: true, updatedAt: meta.updatedAt, updatedBy: meta.updatedBy } : { custom: false };
  }
  res.json(out);
}));

router.get('/:name', known, asyncHandler(async (req, res) => {
  const name = req.params.name;
  const meta = await readMeta(name);
  res.set('Cache-Control', 'private, no-cache');
  if (meta && fs.existsSync(custom(name))) {
    res.type(meta.type || 'image/png');
    return res.sendFile(custom(name));
  }
  res.sendFile(path.join(DEFAULT_DIR, `${name}.png`));
}));

router.put('/:name', requireSuperadmin, known,
  (req, res, next) => upload.single('file')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'The image is larger than 5 MB'));
    next(err);
  }),
  asyncHandler(async (req, res) => {
    const name = req.params.name;
    if (!req.file) throw new HttpError(400, 'No image uploaded');
    const type = await sniffType(req.file.path);
    if (!IMAGE_TYPES.includes(type)) {
      await fsp.rm(req.file.path, { force: true });
      throw new HttpError(415, 'Upload a PNG or JPG image (a PNG with a transparent background prints best)');
    }
    await fsp.rename(req.file.path, custom(name));
    const meta = { type, updatedAt: new Date().toISOString(), updatedBy: req.user.name };
    await fsp.writeFile(metaFile(name), JSON.stringify(meta));
    await logActivity(req, 'branding.updated', { entityType: 'branding', summary: `Replaced the ${NAMES[name].toLowerCase()} printed on approved reports` });
    res.json({ custom: true, updatedAt: meta.updatedAt, updatedBy: meta.updatedBy });
  }));

// back to the images shipped with the app
router.delete('/:name', requireSuperadmin, known, asyncHandler(async (req, res) => {
  const name = req.params.name;
  await fsp.rm(custom(name), { force: true });
  await fsp.rm(metaFile(name), { force: true });
  await logActivity(req, 'branding.reset', { entityType: 'branding', summary: `Restored the original ${NAMES[name].toLowerCase()}` });
  res.json({ custom: false });
}));

export default router;
