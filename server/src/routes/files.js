import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import multer from 'multer';
import { ALLOWED_FILE_TYPES, MAX_FILE_BYTES } from '@dsk/shared';
import Attachment from '../models/Attachment.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { logActivity } from '../services/activity.js';
import { UPLOAD_DIR, canAccess, filePath, removeAttachment, sniffType } from '../services/attachments.js';

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, _file, cb) => cb(null, crypto.randomBytes(16).toString('hex')),
  }),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED_FILE_TYPES.includes(file.mimetype) ? cb(null, true) : cb(new HttpError(415, 'Only JPG, PNG, WEBP, HEIC images or PDF files are allowed')),
});

const router = Router();
router.use(protect);

async function load(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid id');
  const a = await Attachment.findById(req.params.id);
  if (!a || !(await canAccess(req.user, a))) throw new HttpError(404, 'File not found');
  return a;
}

router.post(
  '/',
  (req, res, next) =>
    upload.single('file')(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, `File is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`));
      next(err);
    }),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file uploaded (field name must be "file")');
    const realType = await sniffType(req.file.path);
    if (!realType) {
      await fsp.rm(req.file.path, { force: true });
      throw new HttpError(415, 'File content is not a supported image or PDF');
    }
    const a = await Attachment.create({
      owner: req.user._id,
      originalName: path.basename(req.file.originalname).slice(0, 200),
      mimeType: realType,
      size: req.file.size,
      storageKey: req.file.filename,
    });
    await logActivity(req, 'file.uploaded', { entityType: 'file', entityId: a._id, summary: `Uploaded ${a.originalName}`, meta: { name: a.originalName, type: a.mimeType, size: a.size } });
    res.status(201).json(a.toRef());
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const a = await load(req);
    const file = filePath(a.storageKey);
    if (!fs.existsSync(file)) throw new HttpError(404, 'File missing from storage');
    res.set({
      'Content-Type': a.mimeType,
      'Content-Length': a.size,
      'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(a.originalName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    });
    fs.createReadStream(file).pipe(res);
  })
);

// Only files not yet attached to a saved valuation can be deleted directly;
// attached files are released by removing them from the sheet and saving.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const a = await load(req);
    if (a.valuation) throw new HttpError(409, 'File is attached to a saved valuation; remove it from the sheet instead');
    await removeAttachment(a);
    await logActivity(req, 'file.deleted', { entityType: 'file', entityId: a._id, summary: `Deleted ${a.originalName}` });
    res.status(204).end();
  })
);

export default router;
