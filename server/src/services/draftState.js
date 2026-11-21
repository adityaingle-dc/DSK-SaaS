// Whether each sheet is complete (every required field filled: needed to generate the report). Worked out once at
// startup for sheets checked under older rules (only these flags are written; the sheet itself is not touched).
import { validate } from '@dsk/shared';
import Valuation from '../models/Valuation.js';

export async function backfillDraftState() {
  const list = await Valuation.find({ checkVersion: { $ne: 2 } }).select('data').lean();
  if (!list.length) return 0;
  const ops = list.map((v) => {
    const missing = validate(v.data || {}, { mode: 'submit' }).length;
    return { updateOne: { filter: { _id: v._id }, update: { $set: { draftReady: missing === 0, draftMissing: missing, checkVersion: 2 } }, timestamps: false } };
  });
  await Valuation.bulkWrite(ops, { ordered: false });
  return ops.length;
}
