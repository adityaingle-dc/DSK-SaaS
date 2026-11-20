// The input sheet is filled in two parts:
//  - site: the site inspection, done by the evaluator at the property (location, GPS photos, measurements,
//    what is seen on site)
//  - draft: the draft sheet, done by the superadmin in the office (bank & loan, owner, documents, rates and
//    valuation figures); the report is generated from it
// Every field belongs to one part (or both). A table can mix them per column (floors: areas on site, rates in
// the office). The same rules drive the form, the server's checks and the merge of saved data.
import { SECTIONS, sectionPath, visibleSections } from './formSchema.js';

export const PART_NAMES = { site: 'Site inspection', draft: 'Draft sheet' };

// whole sections done on site (anything not listed is drafting)
const SECTION_PART = { property: 'site', boundaries: 'site', site: 'site', buildingDetails: 'site', amenities: 'site', flatDetails: 'site' };

// single fields that differ from their section ('both' = shown and editable in both parts)
const FIELD_PART = {
  'general.inspectionDate': 'site',
  'general.propertyType': 'both',
  // land: what is measured on site; the rates and amounts are drafting
  'land.siteAreaActual': 'site',
  'land.compoundWallLength': 'site',
  'land.compoundWallHeight': 'site',
  'land.gateArea': 'site',
  'land.powerConnections': 'site',
  'land.extrasCalc': 'both',
  // building: year and floor areas on site
  'building.yearOfConstruction': 'site',
  'building.floors': 'site',
  // amenities: the lump-sum percentages are drafting
  'amenities.electricalLumpsumPct': 'draft',
  'amenities.plumbingLumpsumPct': 'draft',
  // flat: what is seen and measured on site
  'flat.apartmentName': 'site',
  'flat.flatNo': 'site',
  'flat.floorOfFlat': 'site',
  'flat.totalFloors': 'site',
  'flat.dwellingUnits': 'site',
  'flat.structureType': 'site',
  'flat.yearOfConstruction': 'site',
  'flat.plinthArea': 'site',
  'flat.carpetArea': 'site',
  'flat.underConstruction': 'site',
  'flat.completionPct': 'site',
  // flat details: tax / meter / deed papers are drafting
  'flatDetails.houseTaxAssessmentNo': 'draft',
  'flatDetails.taxPaidBy': 'draft',
  'flatDetails.taxAmount': 'draft',
  'flatDetails.electricityServiceNo': 'draft',
  'flatDetails.meterCardName': 'draft',
  'flatDetails.saleDeedName': 'draft',
  'flatDetails.monthlyRent': 'draft',
  'flatDetails.marketability': 'draft',
  // construction progress: stage status seen on site, the estimate is drafting
  'progress.stages': 'site',
};

// table columns that differ from their table
const COLUMN_PART = { 'building.floors.rate': 'draft' };

export const fieldPart = (section, field) => FIELD_PART[`${section.key}.${field.key}`] || SECTION_PART[section.key] || 'draft';
export const columnPart = (section, field, col) => COLUMN_PART[`${section.key}.${field.key}.${col.key}`] || fieldPart(section, field);
const matches = (p, part) => !part || part === 'full' || p === part || p === 'both';

// is this field shown in this part of the sheet? (a table shows when any of its columns belongs to the part)
export function inPart(section, field, part) {
  if (matches(fieldPart(section, field), part)) return true;
  return field.type === 'table' && (field.columns || []).some((c) => matches(columnPart(section, field, c), part));
}
export const columnInPart = (section, field, col, part) => matches(columnPart(section, field, col), part);

// the steps of one part, in order (only sections with something to fill in that part)
export function sectionsFor(part, ctx, data = {}) {
  return visibleSections(ctx, data).filter((s) => s.fields.some((f) => !f.hidden && (!f.when || f.when(ctx, data)) && inPart(s, f, part)));
}

// Saving one part: take that part's fields from `incoming`, keep everything else from `existing`
// (so a draft saved in the office never overwrites what the evaluator changed on site, and the other way round).
export function mergePart(existing = {}, incoming = {}, part) {
  if (!part || part === 'full') return incoming;
  const out = JSON.parse(JSON.stringify(existing || {}));
  for (const s of SECTIONS) {
    const path = sectionPath(s);
    const inc = incoming[path] || {};
    const cur = (out[path] = out[path] || {});
    for (const f of s.fields) {
      const own = matches(fieldPart(s, f), part);
      if (f.type === 'table' && (f.columns || []).some((c) => columnPart(s, f, c) !== fieldPart(s, f))) {
        // mixed table: the rows come from the part that owns the table; each column's values come from the part
        // being saved when the column is its own, otherwise they stay as saved (matched by row position)
        const base = own ? inc[f.key] : cur[f.key];
        if (!Array.isArray(base)) { if (own) delete cur[f.key]; continue; }
        cur[f.key] = base.map((_, i) => {
          const row = {};
          for (const c of f.columns) {
            const value = matches(columnPart(s, f, c), part) ? inc[f.key]?.[i]?.[c.key] : (existing?.[path]?.[f.key]?.[i]?.[c.key]);
            if (value !== undefined && value !== null && value !== '') row[c.key] = value;
          }
          return row;
        });
        continue;
      }
      if (!own) continue;
      if (f.key in inc) cur[f.key] = inc[f.key];
      else delete cur[f.key];
    }
  }
  return out;
}
