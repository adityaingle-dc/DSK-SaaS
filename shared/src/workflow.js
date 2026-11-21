// The job workflow, shared by the server and the app.
//
//   customer added (with the valuation request) → the site inspection sheet is created for the evaluator
//   draft      the evaluator is filling the site inspection (nothing is compulsory)
//   submitted  handed in: waiting in the drafters' queue (locked for the evaluator)
//   received   a drafter took it (opened it first) and is completing the sheet and the report
//   rejected   the drafter sent it back to the evaluator with a note (the evaluator can edit again)
//   pending    the drafter generated a report: waiting for the superadmin's approval
//   returned   the superadmin sent the report back to the drafter with a note (a new version follows)
//   approved   the superadmin approved the report: final, the sheet and that report are locked
export const VALUATION_STATUSES = ['draft', 'rejected', 'submitted', 'received', 'pending', 'returned', 'approved'];

export const STATUS_LABELS = {
  draft: 'Site visit',
  rejected: 'Back to evaluator',
  submitted: 'In queue',
  received: 'Drafting',
  pending: 'Awaiting approval',
  returned: 'Back to drafter',
  approved: 'Approved',
};

// what each status means, in a sentence (tooltips, banners)
export const STATUS_HELP = {
  draft: 'The field evaluator is filling the site inspection.',
  rejected: 'The drafter sent the site inspection back to the evaluator with a note.',
  submitted: 'Submitted by the evaluator: waiting for a drafter to take it.',
  received: 'A drafter is completing the sheet and preparing the report.',
  pending: 'Report generated: waiting for the superadmin to approve it.',
  returned: 'The superadmin sent the report back to the drafter with a note.',
  approved: 'The superadmin approved the report. It is final.',
};

// A customer's stage = the earliest stage among their jobs (one stage per customer, so the counts add up):
// new (no job yet) · site (a site visit to do, or sent back to the evaluator) · drafting (in the queue, being drafted
// or sent back to the drafter) · approval (a report waiting for approval) · done (every job approved)
export const CUSTOMER_STAGES = ['new', 'site', 'drafting', 'approval', 'done'];
export function customerStageOf(statuses = []) {
  if (!statuses.length) return 'new';
  if (statuses.some((s) => s === 'draft' || s === 'rejected')) return 'site';
  if (statuses.some((s) => s === 'submitted' || s === 'received' || s === 'returned')) return 'drafting';
  if (statuses.includes('pending')) return 'approval';
  return 'done';
}

// what the customer asks for (Add customer → Service requested)
export const SERVICES = ['Site Visit', 'Building Permission', 'Valuation'];

// bank details entered with the customer: filled into the sheet and locked there (changed through the customer)
export const CUSTOMER_BANK_FIELDS = [['general.bankName', 'bankName'], ['general.branch', 'branch'], ['general.ifsc', 'ifsc']];

// the evaluator can change the sheet only while it is with them
export const EVALUATOR_EDITABLE = ['draft', 'rejected'];
// with the drafters (the sheet and the report can be worked on)
export const DRAFTING_STATUSES = ['submitted', 'received', 'returned'];
// handed in by the evaluator (everything after the site inspection)
export const HANDED_IN = ['submitted', 'received', 'pending', 'returned', 'approved'];
// still open (not approved yet)
export const OPEN_STATUSES = ['draft', 'rejected', 'submitted', 'received', 'pending', 'returned'];

// stored reports: review = waiting for the superadmin · returned = sent back (a new version replaces it) · approved = final
export const REPORT_STATUS_LABELS = { review: 'Awaiting approval', returned: 'Sent back', approved: 'Approved' };
