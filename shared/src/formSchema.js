// Declarative input-sheet schema. One definition drives:
//   - the web form renderer (client/src/components/SchemaForm.jsx)
//   - the future React Native form
//   - server-side sanitising + validation (validate.js)
//
// Section: { key, title, path?, when?(ctx, data), fields[] }  — `path` = where values live in `data` (defaults to key)
// Field types: text | textarea | number | date | email | tel | select | choice | checkbox | multiselect
//              | latlon | grid | table | tiers | stages
// `required: true` is enforced only when a valuation is submitted, so drafts can be saved half-filled.

import { catalog } from './catalog.generated.js';
import { DEFAULTS } from './constants.js';

const L = catalog.lists;
const purposeOptions = catalog.valuationPurposes.flatMap((g) => g.items.map((i) => i.label));
const FLOORS = ['Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth'];
const PHONE = { pattern: '^[6-9][0-9]{9}$', patternMessage: 'Enter a 10-digit mobile number' };
const PIN = { pattern: '^[1-9][0-9]{5}$', patternMessage: 'Enter a 6-digit pincode' };

const choiceFields = (items, { freeTextIfNoOptions = true } = {}) =>
  items.map((c) =>
    c.options.length || !freeTextIfNoOptions
      ? { key: c.key, label: c.label, type: 'choice', options: c.options, wide: true }
      : { key: c.key, label: c.label, type: 'text', wide: true }
  );

const personFields = (required) => [
  { key: 'salutation', label: 'Salutation', type: 'select', options: L.salutation, default: 'Sri.' },
  { key: 'name', label: 'Full name', type: 'text', required, hint: 'Without salutation, e.g. "Karthan Vijay Kumar"' },
  { key: 'relation', label: 'Relation', type: 'select', options: L.relation, default: 'S/o.' },
  { key: 'relativeName', label: 'Father / husband / representative name', type: 'text' },
  { key: 'occupation', label: 'Occupation', type: 'text' },
  { key: 'phone1', label: 'Phone 1', type: 'tel', required, ...PHONE },
  { key: 'phone2', label: 'Phone 2', type: 'tel', ...PHONE },
  { key: 'houseNo', label: 'Plot No. / H.No.', type: 'text', hint: 'Stored as text – no date auto-conversion' },
  { key: 'street', label: 'Road / Street / Colony', type: 'text' },
  { key: 'locality', label: 'Village / Mandal / Municipality', type: 'text' },
  { key: 'district', label: 'District', type: 'text' },
  { key: 'pincode', label: 'Pincode', type: 'text', ...PIN },
];

const openingColumns = (withCounts) => [
  { key: 'code', label: 'Code', type: 'text' },
  { key: 'length', label: 'L (ft)', type: 'number', min: 0 },
  { key: 'height', label: 'H (ft)', type: 'number', min: 0 },
  ...(withCounts === 'door'
    ? [
        { key: 'external', label: 'External nos', type: 'number', min: 0 },
        { key: 'internal', label: 'Internal nos', type: 'number', min: 0 },
      ]
    : [{ key: 'nos', label: "No's", type: 'number', min: 0 }]),
];

export const SECTIONS = [
  {
    key: 'general',
    title: 'Valuation & bank details',
    fields: [
      { key: 'valuationDate', label: 'Date of valuation', type: 'date', required: true, default: 'today' },
      { key: 'inspectionDate', label: 'Date of inspection', type: 'date', required: true },
      { key: 'bankName', label: 'Bank name', type: 'text', required: true, suggestions: ['Canara Bank', 'State Bank of India', 'Union Bank of India', 'Bank of Baroda', 'Indian Bank'] },
      { key: 'branch', label: 'Branch', type: 'text', required: true },
      { key: 'ifsc', label: 'IFSC code', type: 'text', pattern: '^[A-Z]{4}0[A-Z0-9]{6}$', patternMessage: 'IFSC format: ABCD0123456', uppercase: true },
      { key: 'bankEmail', label: 'Bank email', type: 'email' },
      { key: 'contactPerson', label: 'Bank contact person', type: 'text' },
      { key: 'propertyType', label: 'Type of property', type: 'select', options: L.propertyType, required: true },
      { key: 'loanType', label: 'Type of loan', type: 'select', options: L.loanType, required: true },
      { key: 'loanCategory', label: 'Loan category / condition of site', type: 'select', options: L.loanCategory, required: true },
      { key: 'purpose', label: 'Purpose of valuation', type: 'select', options: purposeOptions, default: purposeOptions[0], wide: true },
      { key: 'includeEstimate', label: 'Include proposed building estimate', type: 'checkbox', hint: 'Defaults on for Under Construction / Semi Finished / Improvement Works', defaultFrom: (ctx) => ctx.needsEstimate },
      { key: 'realizablePct', label: 'Realizable value', type: 'number', unit: '%', min: 0, max: 100, default: DEFAULTS.realizablePct * 100 },
      { key: 'distressPct', label: 'Distress value', type: 'number', unit: '%', min: 0, max: 100, default: DEFAULTS.distressPct * 100 },
      { key: 'place', label: 'Place (for signature)', type: 'text' },
      { key: 'feeTravel', label: 'Fee – travel charges', type: 'number', unit: '₹', min: 0 },
      { key: 'feeDiscount', label: 'Fee – discount', type: 'number', unit: '₹', min: 0 },
    ],
  },
  { key: 'applicant', title: 'Applicant / owner', fields: personFields(true) },
  { key: 'vendor', title: 'Intending vendor', when: (ctx) => ctx.isPurchase, fields: personFields(false) },
  {
    key: 'property',
    title: 'Property location',
    fields: [
      { key: 'description', label: 'Property description', type: 'text', required: true, wide: true, hint: 'e.g. "Under Construction Ground Floor Building"' },
      { key: 'numberType', label: 'Number type', type: 'select', options: L.propertyNumberType, default: 'Plot No. / H.No.' },
      { key: 'number', label: 'Plot / H.No. / Flat No.', type: 'text' },
      { key: 'surveyNo', label: 'Sy.No. / LP No.', type: 'text' },
      { key: 'street', label: 'Road / Street / Colony', type: 'text' },
      { key: 'village', label: 'Village', type: 'text' },
      { key: 'localBodyType', label: 'Local body', type: 'select', options: L.localBodyType, default: 'Municipality' },
      { key: 'localBodyName', label: 'Mandal / Municipality name', type: 'text' },
      { key: 'district', label: 'District', type: 'text' },
      { key: 'pincode', label: 'Pincode', type: 'text', ...PIN },
      { key: 'landmark', label: 'Landmark', type: 'text', wide: true },
      { key: 'location', label: 'GPS location', type: 'latlon', wide: true, hint: 'Paste "lat, lon" from Google Maps or use device location' },
      { key: 'siteShape', label: 'Site shape', type: 'select', options: L.siteShape },
    ],
  },
  {
    key: 'boundaries',
    title: 'Boundaries & dimensions',
    fields: [
      {
        key: 'sides',
        label: 'Site boundaries',
        type: 'grid',
        rows: L.direction,
        columns: [
          { key: 'deed', label: 'Boundary (document)' },
          { key: 'actual', label: 'Boundary (actual)' },
          { key: 'dimDeed', label: 'Dimension (document)' },
          { key: 'dimActual', label: 'Dimension (actual)' },
        ],
        wide: true,
      },
    ],
  },
  {
    key: 'documents',
    title: 'Documents produced',
    fields: [
      {
        key: 'items',
        label: 'Documents',
        type: 'table',
        wide: true,
        defaultRows: [{ type: 'Sale Deed', copy: 'Copy' }],
        columns: [
          { key: 'type', label: 'Document type', type: 'select', options: L.documentType },
          { key: 'detail1', label: 'Detail 1', type: 'text' },
          { key: 'detail2', label: 'Detail 2', type: 'text' },
          { key: 'detail3', label: 'Detail 3', type: 'text' },
          { key: 'number', label: 'Document no.', type: 'text' },
          { key: 'date', label: 'Dated', type: 'date' },
          { key: 'copy', label: 'Original / copy', type: 'select', options: L.documentCopy },
          { key: 'files', label: 'Scans / photos', type: 'files', accept: 'image/*,application/pdf' },
        ],
      },
    ],
  },
  {
    key: 'land',
    title: 'Land valuation',
    when: (ctx) => ctx.kind !== 'flat',
    fields: [
      { key: 'siteAreaDocument', label: 'Site area as per document', type: 'number', unit: 'sq.yd', min: 0, required: true },
      { key: 'siteAreaActual', label: 'Site area as per actual', type: 'number', unit: 'sq.yd', min: 0 },
      { key: 'glr', label: 'Guideline rate (GLR)', type: 'number', unit: '₹/sq.yd', min: 0, required: true },
      { key: 'marketRate', label: 'Prevailing market rate (PMR)', type: 'number', unit: '₹/sq.yd', min: 0, required: true },
      { key: 'compoundWall', label: 'Extra: compound wall / fencing', type: 'number', unit: '₹', min: 0 },
      { key: 'gate', label: 'Extra: gate', type: 'number', unit: '₹', min: 0 },
      { key: 'powerSupply', label: 'Extra: power supply', type: 'number', unit: '₹', min: 0 },
      { key: 'plusFactors', label: 'Factors favouring additional value', type: 'table', wide: true, columns: [{ key: 'description', label: 'Description', type: 'text' }, { key: 'amount', label: 'Amount (₹)', type: 'number', min: 0 }] },
      { key: 'minusFactors', label: 'Factors favouring less value', type: 'table', wide: true, columns: [{ key: 'description', label: 'Description', type: 'text' }, { key: 'amount', label: 'Amount (₹)', type: 'number', min: 0 }] },
      { key: 'marketReference', label: 'Market value reference / comparable sale instances', type: 'textarea', wide: true },
      { key: 'saleability', label: 'Saleability', type: 'text', wide: true },
      { key: 'rentalValue', label: 'Likely rental value', type: 'text', wide: true },
    ],
  },
  {
    key: 'site',
    title: 'Site characteristics',
    when: (ctx) => ctx.kind !== 'flat',
    fields: [
      ...choiceFields(catalog.siteCharacteristics),
      { key: 'advantages', label: 'Advantages of the site', type: 'multiselect', options: catalog.siteAdvantageOptions.filter((o) => o !== 'Nil'), wide: true },
      { key: 'disadvantages', label: 'Disadvantages of the site', type: 'textarea', wide: true, default: 'Nil' },
      { key: 'specialRemarks', label: 'Special remarks (threat of acquisition, road widening, etc.)', type: 'textarea', wide: true },
    ],
  },
  {
    key: 'building',
    title: 'Building valuation',
    when: (ctx) => ctx.kind === 'building',
    fields: [
      { key: 'yearOfConstruction', label: 'Year of construction', type: 'number', min: 1900, max: 2100, required: true },
      { key: 'lifeYears', label: 'Total life of building', type: 'number', unit: 'years', min: 1, default: DEFAULTS.buildingLifeYears },
      { key: 'rccGlrRate', label: 'RCC GLR rate (for book value)', type: 'number', unit: '₹/sq.ft', min: 0, default: DEFAULTS.rccGlrRate },
      {
        key: 'floors',
        label: 'Floor-wise plinth area & replacement rate',
        type: 'table',
        wide: true,
        required: true,
        defaultRows: [{ floor: 'Ground' }],
        columns: [
          { key: 'floor', label: 'Floor', type: 'select', options: FLOORS },
          { key: 'mainArea', label: 'Main portion (sq.ft)', type: 'number', min: 0 },
          { key: 'cantileverArea', label: 'Cantilevered (sq.ft)', type: 'number', min: 0 },
          { key: 'rate', label: 'Replacement rate (₹/sq.ft)', type: 'number', min: 0 },
        ],
      },
    ],
  },
  {
    key: 'buildingDetails',
    path: 'building',
    title: 'Building characteristics & specifications',
    when: (ctx) => ctx.kind === 'building',
    fields: [...choiceFields(catalog.buildingCharacteristics), ...choiceFields(catalog.buildingApproval), ...choiceFields(catalog.buildingSpecs)],
  },
  {
    key: 'amenities',
    path: 'building',
    title: 'Amenities, extra items & services',
    when: (ctx) => ctx.kind === 'building',
    fields: [
      { key: 'amenities', label: 'Amenities & extra items (value after depreciation)', type: 'tiers', items: catalog.amenities, tiers: catalog.amenityTiers, wide: true },
      { key: 'water', label: 'Water supply & sanitation', type: 'tiers', items: catalog.waterServices, tiers: catalog.amenityTiers, wide: true },
      ...choiceFields(catalog.electrical),
      { key: 'electricalLumpsumPct', label: 'Electrical lumpsum', type: 'select', options: ['5', '7.5'], unit: '% of civil works', default: '5' },
      { key: 'closetType', label: 'Water closets – type', type: 'select', options: ['Indian Closet', 'Western Closet', 'Both'] },
      { key: 'closets', label: 'No. of water closets', type: 'number', min: 0 },
      { key: 'washBasins', label: 'No. of wash basins', type: 'number', min: 0 },
      { key: 'otherFixtures', label: 'Other plumbing fixtures', type: 'text' },
      { key: 'plumbingLumpsumPct', label: 'Plumbing lumpsum', type: 'select', options: ['5', '7.5'], unit: '% of civil works', default: '5' },
    ],
  },
  {
    key: 'flat',
    title: 'Flat valuation (composite rate)',
    when: (ctx) => ctx.kind === 'flat',
    fields: [
      { key: 'apartmentName', label: 'Name of the apartment', type: 'text', wide: true },
      { key: 'flatNo', label: 'Flat no.', type: 'text' },
      { key: 'floorOfFlat', label: 'Floor of the flat', type: 'text' },
      { key: 'totalFloors', label: 'No. of floors in building', type: 'number', min: 0 },
      { key: 'dwellingUnits', label: 'No. of dwelling units', type: 'number', min: 0 },
      { key: 'structureType', label: 'Type of structure', type: 'text', default: 'RCC Framed Structure' },
      { key: 'yearOfConstruction', label: 'Year of construction', type: 'number', min: 1900, max: 2100 },
      { key: 'lifeYears', label: 'Total life of building', type: 'number', unit: 'years', default: DEFAULTS.buildingLifeYears },
      { key: 'plinthArea', label: 'Plinth area of flat', type: 'number', unit: 'sq.ft', min: 0, required: true },
      { key: 'carpetArea', label: 'Carpet area', type: 'number', unit: 'sq.ft', min: 0 },
      { key: 'uds', label: 'Undivided share of land (UDS)', type: 'number', unit: 'sq.yd', min: 0, required: true },
      { key: 'apartmentSiteArea', label: 'Total site area of apartment', type: 'number', unit: 'sq.yd', min: 0 },
      { key: 'buildingRate', label: 'Building + services rate (new)', type: 'number', unit: '₹/sq.ft', min: 0, required: true },
      { key: 'landRate', label: 'Land rate for UDS', type: 'number', unit: '₹/sq.yd', min: 0, required: true },
      { key: 'glrRate', label: 'Guideline rate (land)', type: 'number', unit: '₹/sq.yd', min: 0 },
      { key: 'rccGlrRate', label: 'RCC GLR rate (for book value)', type: 'number', unit: '₹/sq.ft', default: DEFAULTS.rccGlrRate },
      { key: 'underConstruction', label: 'Flat is under construction', type: 'checkbox' },
      { key: 'completionPct', label: 'Works completed', type: 'number', unit: '%', min: 0, max: 100, when: (ctx, d) => d.flat?.underConstruction },
      { key: 'extras', label: 'Extra items (wardrobes, showcases, interiors, deposits…)', type: 'table', wide: true, columns: [{ key: 'description', label: 'Item', type: 'text' }, { key: 'amount', label: 'Amount (₹)', type: 'number', min: 0 }] },
    ],
  },
  {
    key: 'flatDetails',
    path: 'flat',
    title: 'Apartment & flat details',
    when: (ctx) => ctx.kind === 'flat',
    fields: [
      ...choiceFields(catalog.flatChoices),
      { key: 'houseTaxAssessmentNo', label: 'House tax assessment no.', type: 'text' },
      { key: 'taxPaidBy', label: 'Tax paid in the name of', type: 'text' },
      { key: 'taxAmount', label: 'Tax amount', type: 'number', unit: '₹', min: 0 },
      { key: 'electricityServiceNo', label: 'Electricity service connection no.', type: 'text' },
      { key: 'meterCardName', label: 'Meter card in the name of', type: 'text' },
      { key: 'saleDeedName', label: 'Sale deed executed in the name of', type: 'text' },
      { key: 'usage', label: 'Used for', type: 'select', options: ['Residential', 'Commercial'] },
      { key: 'monthlyRent', label: 'Monthly rent (if let out)', type: 'number', unit: '₹', min: 0 },
      { key: 'marketability', label: 'Marketability', type: 'textarea', wide: true },
    ],
  },
  {
    key: 'progress',
    title: 'Construction stage progress',
    when: (ctx) => ctx.needsProgress,
    fields: [
      { key: 'estimatedCost', label: 'Total estimated cost of construction', type: 'number', unit: '₹', min: 0, required: true },
      { key: 'stages', label: 'Stage-wise status', type: 'stages', items: catalog.constructionStages, options: ['Not Started', 'In Progress', 'Completed'], wide: true },
    ],
  },
  {
    key: 'proposed',
    title: 'Proposed building (estimate inputs)',
    when: (ctx) => ctx.needsEstimate && ctx.kind !== 'flat',
    fields: [
      { key: 'floors', label: 'No. of floors', type: 'number', min: 1, max: 10, default: 1 },
      { key: 'roadWidthFt', label: 'Abutting road width', type: 'number', unit: 'ft', min: 0 },
      { key: 'plotLengthFt', label: 'Plot length', type: 'number', unit: 'ft', min: 0, required: true },
      { key: 'plotBreadthFt', label: 'Plot breadth', type: 'number', unit: 'ft', min: 0, required: true },
      { key: 'extNorth', label: 'Slab extension – North', type: 'number', unit: 'ft', min: 0 },
      { key: 'extSouth', label: 'Slab extension – South', type: 'number', unit: 'ft', min: 0 },
      { key: 'extEast', label: 'Slab extension – East', type: 'number', unit: 'ft', min: 0 },
      { key: 'extWest', label: 'Slab extension – West', type: 'number', unit: 'ft', min: 0 },
      { key: 'columns', label: 'No. of columns', type: 'number', min: 0 },
      { key: 'internalColumns', label: 'Internal columns', type: 'number', min: 0 },
      { key: 'columnSize', label: 'Column size (in)', type: 'text', default: '9 x 14' },
      { key: 'beams', label: 'No. of beams', type: 'number', min: 0 },
      { key: 'roofBeams', label: 'Roof beams', type: 'number', min: 0 },
      {
        key: 'doors', label: 'Doors', type: 'table', wide: true, columns: openingColumns('door'),
        defaultRows: [{ code: 'MD', length: 3.5, height: 8.25 }, { code: 'D1', length: 3.25, height: 6.75 }, { code: 'D2', length: 3, height: 6.75 }, { code: 'D3', length: 2.5, height: 6.5 }],
      },
      {
        key: 'windows', label: 'Windows', type: 'table', wide: true, columns: openingColumns('window'),
        defaultRows: [{ code: 'W1', length: 5, height: 4 }, { code: 'W2', length: 4, height: 4 }, { code: 'W3', length: 4, height: 5.5 }, { code: 'W4', length: 3, height: 5.5 }],
      },
      {
        key: 'ventilators', label: 'Ventilators', type: 'table', wide: true, columns: openingColumns('window'),
        defaultRows: [{ code: 'V1', length: 3, height: 2 }, { code: 'V2', length: 3, height: 1.5 }],
      },
      {
        key: 'rooms', label: 'Rooms', type: 'table', wide: true,
        columns: [{ key: 'name', label: 'Room', type: 'text' }, { key: 'length', label: 'Length (ft)', type: 'number', min: 0 }, { key: 'width', label: 'Width (ft)', type: 'number', min: 0 }],
        defaultRows: [
          { name: 'Living Room', length: 12, width: 15 }, { name: 'Bedroom 1', length: 10, width: 12 }, { name: 'Bedroom 2', length: 14, width: 12 },
          { name: 'Kitchen', length: 8, width: 6 }, { name: 'Toilet 1', length: 4, width: 6 }, { name: 'Toilet 2', length: 5, width: 6 },
        ],
      },
    ],
  },
];

export const sectionPath = (section) => section.path || section.key;

export function visibleSections(ctx, data = {}) {
  return SECTIONS.filter((s) => !s.when || s.when(ctx, data));
}

const today = () => new Date().toISOString().slice(0, 10);

// Build an empty sheet pre-filled with defaults
export function emptyValuation() {
  const data = {};
  for (const s of SECTIONS) {
    const target = (data[sectionPath(s)] ||= {});
    for (const f of s.fields) {
      if (f.default !== undefined) target[f.key] = f.default === 'today' ? today() : f.default;
      else if (f.type === 'table') target[f.key] = structuredClone(f.defaultRows || []);
      else if (f.type === 'grid') target[f.key] = Object.fromEntries(f.rows.map((r) => [r.toLowerCase(), {}]));
      else if (['tiers', 'stages'].includes(f.type)) target[f.key] = {};
      else if (f.type === 'multiselect') target[f.key] = [];
    }
  }
  return data;
}
