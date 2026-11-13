export { catalog } from './catalog.generated.js';
export * from './constants.js';
export * from './calc.js';
export * from './formSchema.js';
export * from './validate.js';
export { amountInWords } from './words.js';

// All attachment ids referenced anywhere in a sheet (currently: documents produced)
export const attachmentIds = (data = {}) =>
  (data.documents?.items || []).flatMap((row) => (row.files || []).map((f) => f.id));

// Display helpers shared by web + mobile
export const personName = (p = {}) => [p.salutation, p.name].filter(Boolean).join(' ');
export const personRelation = (p = {}) => [p.relation, p.relativeName].filter(Boolean).join(' ');
export const phones = (p = {}) => [p.phone1, p.phone2].filter(Boolean).join(', ');
