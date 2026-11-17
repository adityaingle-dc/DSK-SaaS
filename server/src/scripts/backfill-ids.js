// One-time migration to the DSK ID formats.
//
//   npm run ids:backfill                 → give every staff member (DSK-EMP-001) and customer (DSK-CIN-0001) without an ID one,
//                                          oldest first. Input sheets and reports keep their existing numbers.
//   npm run ids:backfill -- --renumber   → ALSO renumber existing input sheets (DSK-INP-0001) and reports (DSK-RPT-0001),
//                                          oldest first, updating the sheet number stored inside each report.
//                                          Only do this if no report has been sent to a bank with its old number.
//   add --dry-run to either to see what would change without writing anything.
//
// Safe to run more than once: records that already have a new-format ID are skipped. Passwords and logins are not touched.
import mongoose from 'mongoose';
import User from '../models/User.js';
import Customer from '../models/Customer.js';
import Valuation from '../models/Valuation.js';
import Report from '../models/Report.js';
import { formatId, isFormatted, nextId } from '../services/ids.js';

const args = process.argv.slice(2);
const renumber = args.includes('--renumber');
const dryRun = args.includes('--dry-run');

async function assign(kind, Model, field, label) {
  const docs = await Model.find({}).sort({ createdAt: 1, _id: 1 }).select(`${field} createdAt`).lean();
  const todo = docs.filter((d) => !isFormatted(kind, d[field]));
  let preview = docs.filter((d) => isFormatted(kind, d[field])).length;
  for (const d of todo) {
    const id = dryRun ? formatId(kind, ++preview) : await nextId(kind);
    if (!dryRun) await Model.updateOne({ _id: d._id }, { $set: { [field]: id } });
    console.log(`  ${label} ${d[field] || '(none)'} → ${id}`);
  }
  console.log(`${label}: ${todo.length} updated, ${docs.length - todo.length} already had an ID`);
  return todo;
}

await mongoose.connect(process.env.MONGO_URI);
console.log(`${dryRun ? '[dry run] ' : ''}Assigning DSK IDs${renumber ? ' (with renumbering of sheets and reports)' : ''}`);

await assign('emp', User, 'code', 'Staff');
await assign('cin', Customer, 'code', 'Customer');

if (renumber) {
  // input sheets first, then point each stored report at its sheet's new number
  const before = new Map((await Valuation.find({}).select('referenceNo').lean()).map((v) => [String(v._id), v.referenceNo]));
  await assign('inp', Valuation, 'referenceNo', 'Input sheet');
  if (!dryRun) {
    const after = await Valuation.find({}).select('referenceNo').lean();
    for (const v of after) {
      if (before.get(String(v._id)) !== v.referenceNo) {
        await Report.updateMany({ valuation: v._id }, { $set: { 'snapshot.referenceNo': v.referenceNo } });
      }
    }
  }
  await assign('rpt', Report, 'reportNo', 'Report');
} else {
  console.log('Input sheets and reports keep their current numbers (new ones use DSK-INP-/DSK-RPT-). Use --renumber to convert them too.');
}

await mongoose.disconnect();
console.log('Done.');
