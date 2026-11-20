// Salutation ↔ relation ↔ name, kept in step automatically:
//  - picking Smt. sets the relation to W/o, Miss. → D/o., Sri. → S/o., M/s. → Rep. By
//  - picking a relation (S/o. / W/o / D/o.) sets the matching salutation
//  - typing "Smt. ", "Mr ", "Kum. "… at the start of the name picks the salutation and drops it from the name
//  - a firm's name (… Traders, … Pvt Ltd) picks M/s.
// An automatic change is only made while the other value is still the automatic one, so a deliberate
// combination (e.g. Sri. … Rep. By) is never overwritten.

export const SALUTATION_RELATION = { 'Sri.': 'S/o.', 'Smt.': 'W/o', 'Miss.': 'D/o.', 'M/s.': 'Rep. By' };
// relations that make sense with each salutation (a firm is only "represented by")
export const RELATIONS_FOR = { 'Sri.': ['S/o.', 'Rep. By'], 'Smt.': ['W/o', 'D/o.', 'Rep. By'], 'Miss.': ['D/o.', 'Rep. By'], 'M/s.': ['Rep. By'] };
const ALL_RELATIONS = ['S/o.', 'W/o', 'D/o.', 'Rep. By'];
// options offered for the relation (an older sheet's value outside the list stays visible)
export const relationOptions = (salutation, current) => {
  const list = RELATIONS_FOR[salutation] || ALL_RELATIONS;
  return current && !list.includes(current) ? [...list, current] : list;
};
export const isFirm = (salutation) => salutation === 'M/s.';
const RELATION_SALUTATION = { 'S/o.': 'Sri.', 'W/o': 'Smt.', 'D/o.': 'Miss.' };

// "Sri Lakshmi" / "Shree Ram" are names, so sri / shri / shree / kumari only count with a dot ("Sri. ");
// mr / mrs / smt / ms / miss / m/s are never the start of a name, so a space is enough
const P = (dotted, plain) => new RegExp(String.raw`^(?:(?:${dotted})\.\s*|(?:${plain})(?:\.\s*|\s+))`, 'i');
const NAME_PREFIXES = [
  [P('sri|shri|shree|sree|mr', 'mr'), 'Sri.'],
  [P('smt|shrimati|srimathi|mrs', 'smt|mrs'), 'Smt.'],
  [P('miss|kumari|kum|ms', 'miss|ms'), 'Miss.'],
  [P('m/s|messrs', 'm/s|messrs'), 'M/s.'],
];
const FIRM = /\b(?:pvt|private|ltd|limited|llp|enterprises?|industries|traders|associates|builders|developers|constructions?|corporation|company|& ?co)\b\.?/i;

export const relativeLabel = (relation, salutation) =>
  relation === 'Rep. By' && isFirm(salutation) ? 'Represented by (person\u2019s name)'
    : ({ 'S/o.': "Father's name", 'D/o.': "Father's name", 'W/o': "Husband's name", 'Rep. By': 'Represented by' }[relation] || 'Father / husband / representative name');

// values = the person's current values; returns the changes to make when `key` is set to `value`
export function linkPerson(values = {}, key, value) {
  const patch = { [key]: value };
  const salutationTo = (s) => {
    if (!s || s === values.salutation) return;
    patch.salutation = s;
    // the relation follows while it is empty or still the one that went with the old salutation
    if (!values.relation || values.relation === SALUTATION_RELATION[values.salutation] || !(RELATIONS_FOR[s] || ALL_RELATIONS).includes(values.relation)) patch.relation = SALUTATION_RELATION[s];
  };
  if (key === 'salutation') {
    const fits = (RELATIONS_FOR[value] || ALL_RELATIONS).includes(values.relation);
    if (value && (!values.relation || values.relation === SALUTATION_RELATION[values.salutation] || !fits)) patch.relation = SALUTATION_RELATION[value];
  } else if (key === 'relation') {
    const s = RELATION_SALUTATION[value];
    if (s && (!values.salutation || values.salutation === RELATION_SALUTATION[values.relation] || values.salutation === 'Sri.')) {
      if (s !== values.salutation) patch.salutation = s;
    }
  } else if (key === 'name' && typeof value === 'string') {
    for (const [re, s] of NAME_PREFIXES) {
      const m = value.match(re);
      if (m) { patch.name = value.slice(m[0].length); salutationTo(s); return patch; }
    }
    const firm = FIRM.test(value);
    if (firm && values.salutation === 'Sri.') salutationTo('M/s.');
    else if (!firm && values.salutation === 'M/s.' && FIRM.test(values.name || '')) salutationTo('Sri.');
  }
  return patch;
}
