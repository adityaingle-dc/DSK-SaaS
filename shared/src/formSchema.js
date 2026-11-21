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
import { LIST_LABELS, PURPOSE_GROUP_SHORT, PURPOSE_SHORT, SHORT_OPTIONS, SHORT_QUESTIONS } from './choiceShort.js';
import { isFirm, linkPerson, relationOptions, relativeLabel } from './person.js';
import { linkBoundaries } from './plot.js';

const L = catalog.lists;
const purposeOptions = catalog.valuationPurposes.flatMap((g) => g.items.map((i) => i.label));
export const FLOORS = ['Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth'];
const PHONE = { pattern: '^[6-9][0-9]{9}$', patternMessage: 'Enter a 10-digit mobile number' };
const PIN = { pattern: '^[1-9][0-9]{5}$', patternMessage: 'Enter a 6-digit pincode' };

// Report questions with fixed answers. The form shows a short question and short answer names (one tap each);
// the full sentence of the answer is still what is stored and printed in the report.
const shortNames = (options) => Object.fromEntries(options.filter((o) => SHORT_OPTIONS[o]).map((o) => [o, SHORT_OPTIONS[o]]));
const choiceFields = (items, { freeTextIfNoOptions = true } = {}) =>
  items.map((c) => {
    const label = SHORT_QUESTIONS[c.key] || c.label;
    return c.options.length || !freeTextIfNoOptions
      ? { key: c.key, label, question: c.label, type: 'choice', options: c.options, optionLabels: shortNames(c.options), wide: true }
      : { key: c.key, label, question: c.label, type: 'text', wide: true };
  });

// who: whose address it is (shown as "Address of applicant" / "Address of vendor")
const personFields = (required, who) => [
  // row: fields shown side by side (salutation + name, relation + relative); heading: a small title above a field
  { key: 'salutation', label: 'Salutation', type: 'select', options: L.salutation, optionLabels: LIST_LABELS.salutation, default: 'Sri.', row: 'who' },
  { key: 'name', label: 'Full name', labelFrom: (v) => (isFirm(v.salutation) ? 'Firm name' : 'Full name'), type: 'text', required, row: 'who', hint: 'Without the salutation. Typing "Smt. " or "Mr " first picks it for you.' },
  { key: 'relation', label: 'Relation', type: 'select', options: L.relation, optionsFrom: (v) => relationOptions(v.salutation, v.relation), optionLabels: LIST_LABELS.relation, default: 'S/o.', row: 'rel' },
  { key: 'relativeName', label: 'Father / husband / representative name', labelFrom: (v) => relativeLabel(v.relation, v.salutation), type: 'text', row: 'rel' },
  { key: 'occupation', label: 'Occupation', labelFrom: (v) => (isFirm(v.salutation) ? 'Nature of business' : 'Occupation'), type: 'text', heading: 'Contact' },
  { key: 'phone1', label: 'Phone 1', type: 'tel', required, ...PHONE },
  { key: 'phone2', label: 'Phone 2', type: 'tel', ...PHONE },
  { key: 'houseNo', label: 'Plot No. / H.No.', type: 'text', heading: `Address of ${who}` },
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
    intro: 'Pick the bank, then type the branch or area to fill the IFSC.',
    fields: [
      { key: 'valuationDate', label: 'Date of valuation', type: 'date', required: true, default: 'today' },
      { key: 'inspectionDate', label: 'Date of inspection', type: 'date', required: true },
      { key: 'ifsc', label: 'IFSC code', type: 'text', widget: 'ifsc', pattern: '^[A-Z]{4}0[A-Z0-9]{6}$', patternMessage: 'IFSC format: ABCD0123456', uppercase: true, hint: 'Enter the IFSC to fill the bank and branch, or choose the bank and type the branch to find it' },
      { key: 'bankName', label: 'Bank name', type: 'text', widget: 'bank', required: true },
      { key: 'branch', label: 'Branch', type: 'text', widget: 'branch', required: true, hint: 'Type the branch or area to pick it with its IFSC' },
      { key: 'bankEmail', label: 'Bank email', type: 'email' },
      { key: 'contactPerson', label: 'Bank contact person', type: 'text' },
      { key: 'propertyType', label: 'Type of property', type: 'select', options: L.propertyType, optionLabels: LIST_LABELS.propertyType, required: true },
      { key: 'loanType', label: 'Type of loan', type: 'select', options: L.loanType, required: true },
      { key: 'loanCategory', label: 'Loan category / condition of site', type: 'select', options: L.loanCategory, required: true },
      {
        key: 'purpose', label: 'Purpose of valuation', type: 'select', options: purposeOptions, default: purposeOptions[0], wide: true,
        optionLabels: PURPOSE_SHORT,
        // buttons grouped by kind; the first group shows, the others open with "More purposes"
        optionGroups: catalog.valuationPurposes.map((g) => ({ label: PURPOSE_GROUP_SHORT[g.group] || g.group, options: g.items.map((i) => i.label) })),
      },
      { key: 'includeEstimate', label: 'Include proposed building estimate', type: 'checkbox', hint: 'Defaults on for Under Construction / Semi Finished / Improvement Works', defaultFrom: (ctx) => ctx.needsEstimate },
      { key: 'realizablePct', label: 'Realizable value', type: 'number', unit: '%', min: 0, max: 100, default: DEFAULTS.realizablePct * 100 },
      { key: 'distressPct', label: 'Distress value', type: 'number', unit: '%', min: 0, max: 100, default: DEFAULTS.distressPct * 100 },
      { key: 'place', label: 'Place (for signature)', type: 'text' },
      { key: 'feeTravel', label: 'Fee – travel charges', type: 'number', unit: '₹', min: 0 },
      { key: 'feeDiscount', label: 'Fee – discount', type: 'number', unit: '₹', min: 0 },
    ],
  },
  { key: 'applicant', title: 'Applicant / owner', intro: 'The salutation sets the relation (Smt. → W/o, M/s. → Rep. by) and only matching relations are shown.', link: linkPerson, fields: personFields(true, 'applicant') },
  { key: 'vendor', title: 'Intending vendor', when: (ctx) => ctx.isPurchase, link: linkPerson, fields: personFields(false, 'vendor') },
  {
    key: 'property',
    title: 'Property location',
    intro: 'Start with the map: mark the plot (or use your location) and the village, mandal, district and pincode fill in. Check them and add the plot number.',
    fields: [
      { key: 'location', label: 'Plot on the map', type: 'latlon', wide: true, fillAddress: true, hint: 'Tap the corners of the plot for its boundary (as many as needed); its centre is the GPS location.' },
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
      { key: 'siteShape', label: 'Site shape', type: 'select', options: L.siteShape },
      { key: 'photos', label: 'Site photos', type: 'files', accept: 'image/*', imagesOnly: true, maxFiles: 24, wide: true, hint: 'Front view, road, surroundings, boundaries, inside. Take them with the camera or pick from the gallery. They go into the report.' },
    ],
  },
  {
    key: 'boundaries',
    title: 'Boundaries & dimensions',
    intro: 'Pick the facing and the road side: the rear, sides and road boundary fill in. Enter the four sides and the site area works itself out.',
    link: linkBoundaries,
    fields: [
      { key: 'facing', label: 'Plot facing', type: 'select', options: L.direction, wide: true, hint: 'The front of the plot. The opposite side is the rear, the other two are the sides.' },
      { key: 'roadSides', label: 'Road on', type: 'multiselect', options: L.direction, hint: 'Starts on the facing side. Tap a second side for a corner plot.' },
      { key: 'roadWidthFt', label: 'Road width', type: 'number', unit: 'ft', min: 0 },
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
        // shown as two tables: boundary columns on top, dimension columns below
        splitColumns: 2,
        wide: true,
        sideRoles: true,
        sidePhotos: 'photos', // a Photos column on each side's row (stored in the `photos` field below, tagged with the side)
        hint: 'Dimensions in feet: 40, 40.5 or 40\' 6" (metres: 12.2 m). Add photos of each side in its row; "GPS camera" (on a phone) stamps the location, date and time on the photo.',
      },
      // photos of each side, tagged north / south / east / west; shown in the rows of the table above
      { key: 'photos', label: 'Boundary photos', type: 'files', accept: 'image/*', imagesOnly: true, maxFiles: 24, gpsCamera: true, inGrid: true },
      {
        key: 'diagonal', label: 'Diagonal – North-East corner to South-West corner', type: 'text', unit: 'ft',
        hint: 'For a plot that is not a rectangle: one corner-to-corner measurement makes the area exact.',
        when: (ctx, d) => !['Rectangular', 'Square'].includes(d.property?.siteShape),
      },
      { key: 'areaCalc', label: 'Site area from the measurements', type: 'areaCalc', wide: true },
    ],
  },
  {
    key: 'documents',
    title: 'Documents produced',
    intro: 'Add each document the owner showed. The detail boxes change with the document type, and scans go with each document.',
    fields: [
      {
        key: 'items',
        label: 'Documents',
        type: 'table',
        widget: 'documents', // one card per document; the detail labels follow the document type
        wide: true,
        defaultRows: [{ type: 'Sale Deed', copy: 'Copy' }],
        columns: [
          { key: 'type', label: 'Document', type: 'select', options: L.documentType, allowOther: true },
          { key: 'copy', label: 'Original / copy', type: 'select', options: L.documentCopy },
          { key: 'number', label: 'Document no.', type: 'text' },
          { key: 'date', label: 'Dated', type: 'date' },
          { key: 'detail1', label: 'Detail 1', type: 'text' },
          { key: 'detail2', label: 'Detail 2', type: 'text' },
          { key: 'detail3', label: 'Detail 3', type: 'text' },
          // the first page prints as a full page in the report; the full document (e.g. an 8-page PDF) is kept on file
          { key: 'firstPage', label: 'First page', type: 'files', accept: 'image/*', imagesOnly: true, maxFiles: 1 },
          { key: 'files', label: 'Document', type: 'files', accept: 'image/*,application/pdf' },
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
      // extra items: the quantity and the rate (rates differ from site to site); the amount is worked out
      { key: 'compoundWallLength', label: 'Compound wall / fencing – length', type: 'number', unit: 'rft', min: 0, row: 'x-cw', heading: 'Extra items (quantity × rate)', hint: 'Fills in from the four sides (Boundaries & dimensions). Change it if the wall does not run all round.' },
      { key: 'compoundWallHeight', label: 'Height', type: 'text', unit: 'ft', row: 'x-cw' },
      { key: 'compoundWallRate', label: 'Rate', type: 'number', unit: '₹ per rft', min: 0, row: 'x-cw' },
      { key: 'gateArea', label: 'Gate – size', type: 'number', unit: 'sq.ft', min: 0, row: 'x-gate' },
      { key: 'gateRate', label: 'Rate', type: 'number', unit: '₹ per sq.ft', min: 0, row: 'x-gate' },
      { key: 'powerConnections', label: 'Electricity – connections', type: 'number', unit: 'nos', min: 0, row: 'x-power' },
      { key: 'powerRate', label: 'Rate', type: 'number', unit: '₹ per connection', min: 0, row: 'x-power' },
      { key: 'extrasCalc', label: 'Extra items – amounts', type: 'landExtras', wide: true },
      // older sheets: amounts typed in directly (used until a quantity is entered; not shown any more)
      { key: 'compoundWall', label: 'Compound wall amount (old)', type: 'number', unit: '₹', min: 0, hidden: true },
      { key: 'gate', label: 'Gate amount (old)', type: 'number', unit: '₹', min: 0, hidden: true },
      { key: 'powerSupply', label: 'Power supply amount (old)', type: 'number', unit: '₹', min: 0, hidden: true },
      { key: 'plusFactors', label: 'Factors favouring additional value', type: 'table', wide: true, columns: [{ key: 'description', label: 'Description', type: 'text' }, { key: 'amount', label: 'Amount (₹)', type: 'number', min: 0 }] },
      { key: 'minusFactors', label: 'Factors favouring less value', type: 'table', wide: true, columns: [{ key: 'description', label: 'Description', type: 'text' }, { key: 'amount', label: 'Amount (₹)', type: 'number', min: 0 }] },
      { key: 'marketReference', label: 'Market value reference / comparable sale instances', type: 'textarea', wide: true },
      { key: 'saleability', label: 'Saleability', type: 'text', wide: true },
      { key: 'rentalValue', label: 'Likely rental value', type: 'text', wide: true },
    ],
  },
  {
    key: 'site',
    title: 'Site characteristics', intro: 'Tap to choose, tap again to clear. The full sentence prints in the report.',
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
          { key: 'floor', label: 'Floor', type: 'select', options: FLOORS, unique: true, allowOther: true }, // each floor once; Other… for a typed name
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
    title: 'Building characteristics & specifications', intro: 'Tap to choose, tap again to clear. The full sentence prints in the report.',
    when: (ctx) => ctx.kind === 'building',
    fields: [...choiceFields(catalog.buildingCharacteristics), ...choiceFields(catalog.buildingApproval), ...choiceFields(catalog.buildingSpecs)],
  },
  {
    key: 'amenities',
    path: 'building',
    title: 'Amenities, extra items & services', intro: 'For items that are present, pick the amount range; the amount fills in (you can change it). Leave the rest.',
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
    title: 'Apartment & flat details', intro: 'Tap to choose, tap again to clear.',
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
