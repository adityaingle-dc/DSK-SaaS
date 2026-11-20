// Sheets saved before the site inspection / draft sheet split have no draft state yet. Work it out once at
// startup (only that flag and the count of missing fields are written; the sheet itself is not touched).
import { validate } from '@dsk/shared';
import Valuation from '../models/Valuation.js';

export async function backfillDraftState() {
  const list = await Valuation.find({ draftMissing: { $exists: false } }).select('data').lean();
  if (!list.length) return 0;
  const ops = list.map((v) => {
    const missing = validate(v.data || {}, { mode: 'submit', part: 'draft' }).length;
    return { updateOne: { filter: { _id: v._id }, update: { $set: { draftReady: missing === 0, draftMissing: missing } }, timestamps: false } };
  });
  await Valuation.bulkWrite(ops, { ordered: false });
  return ops.length;
}
