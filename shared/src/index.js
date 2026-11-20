export { catalog } from './catalog.generated.js';
export * from './constants.js';
export * from './calc.js';
export * from './formSchema.js';
export * from './validate.js';
export * from './banks.js';
export * from './geo.js';
export * from './person.js';
export * from './plot.js';
export * from './documents.js';
export { amountInWords } from './words.js';

// All attachment ids referenced anywhere in a sheet: site photos, boundary photos + documents produced
export const attachmentIds = (data = {}) => [
  ...(data.property?.photos || []).map((f) => f.id),
  ...(data.boundaries?.photos || []).map((f) => f.id),
  ...(data.documents?.items || []).flatMap((row) => [...(row.firstPage || []), ...(row.files || [])].map((f) => f.id)),
];

// Display helpers shared by web + mobile
export const personName = (p = {}) => [p.salutation, p.name].filter(Boolean).join(' ');
export const personRelation = (p = {}) => [p.relation, p.relativeName].filter(Boolean).join(' ');
export const phones = (p = {}) => [p.phone1, p.phone2].filter(Boolean).join(', ');

// ---- properties (Customers module) ----
// A customer can bring several properties over time. Sheets for the same property are recognised by the
// location fields of the "Property location" section, ignoring spaces, case and punctuation.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const propertyKey = (p = {}) => {
  const parts = [p.number, p.surveyNo, p.street, p.village, p.pincode].map(norm);
  return parts.some(Boolean) ? parts.join('|') : '';
};
// one-line address, e.g. "Plot No. 12, Sy.No. 45, Shivaji Nagar, Wakad, Pune 411057"
export const propertyAddress = (p = {}) => {
  const num = p.number ? `${String(p.numberType || 'No.').split(' / ')[0]} ${p.number}` : ''; // "Plot No. / H.No." -> "Plot No."
  const sy = p.surveyNo ? `Sy.No. ${p.surveyNo}` : '';
  const place = [p.district, p.pincode].filter(Boolean).join(' ');
  return [num, sy, p.street, p.village, p.localBodyName && p.localBodyName !== p.village ? p.localBodyName : '', place].filter(Boolean).join(', ');
};
