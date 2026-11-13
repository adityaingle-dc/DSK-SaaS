// Engineering / business constants taken from 'CB Format 2026.xlsm'.
// Every value here was hard-coded somewhere in the workbook; they are centralised so they can be
// reviewed (and later made admin-configurable) instead of being buried inside cell formulas.

export const DEFAULTS = {
  buildingLifeYears: 60, // Input!F40
  salvagePct: 0.1, // depreciation formulas use "*0.9" => 10% salvage value
  realizablePct: 0.9, // Input!F17 / H17
  distressPct: 0.8, // Input!F19 / H19
  rccGlrRate: 900, // Input!D49 – GLR rate for RCC construction (Rs/sq.ft), used for "book value" of building
  cantileverFactor: 0.5, // BV_DSK!K188 – plinth area = main + 50% of cantilevered portion
  electricalLumpsumPct: 0.05, // BV_DSK!L291 (options 5% / 7.5%)
  plumbingLumpsumPct: 0.05, // BV_DSK!L299 (options 5% / 7.5%)
  roofHeightFt: 11, // BV_DSK!G185 text "Roof Height = 11' each floor"
  marketRateBand: 2000, // PV_DSK!G124 – PMR shown as "Rs. mv to Rs. mv+2000"
};

// Unit conversion (Excel CONVERT(x,"yd^2","m^2"))
export const SQYD_TO_SQM = 0.83612736;
export const SQYD_TO_SQFT = 9;
export const M_TO_FT = 3.280839895;

// Rounding rules found in the workbook. They were inconsistent (see docs/INPUT_SHEET_ANALYSIS.md §6);
// the report-sheet convention is used as the single source of truth.
export const ROUNDING = {
  land: { mode: 'round', to: 1000 }, // PV_DSK!I139 ROUND(x,-3)
  abstract: { mode: 'round', to: 1000 }, // BV_DSK!J312 ROUND(x,-3)
  flat: { mode: 'roundup', to: 1000 }, // FV_DSK!I238 ROUNDUP(x,-3)
  fee: { mode: 'rounddown', to: 1000 }, // Fee Reciept!I34 ROUNDDOWN(x,-3)
};

// Fee Reciept!D26:G30 – progressive (slab-wise) professional fee on fair market value
export const FEE_SLABS = [
  { from: 0, upto: 500000, rate: 0.0025 },
  { from: 500000, upto: 1500000, rate: 0.002 },
  { from: 1500000, upto: 5000000, rate: 0.001 },
  { from: 5000000, upto: 10000000, rate: 0.0005 },
  { from: 10000000, upto: Infinity, rate: 0.00025 },
];

// Input!L50:T69 – "GO 168 setbacks Table" (Telangana building rules).
// Each band = site area range in sq.m; each rule = max floors, front setback (m) by abutting road
// width category, and side/rear setback (m). Road width categories (ft): <=40, 40-60, 60-80, 80-100, >100.
export const ROAD_WIDTH_BANDS_FT = [40, 60, 80, 100, Infinity];
export const SETBACK_TABLE = [
  { minSqm: 0, maxSqm: 50, rules: [{ maxFloors: 2, front: [1.5, 1.5, 3, 3, 3], side: 0 }] },
  {
    minSqm: 50,
    maxSqm: 100,
    rules: [
      { maxFloors: 2, front: [1.5, 1.5, 3, 3, 3], side: 0 },
      { maxFloors: 3, front: [1.5, 1.5, 3, 3, 3], side: 0.5 },
    ],
  },
  { minSqm: 100, maxSqm: 200, rules: [{ maxFloors: 3, front: [1.5, 1.5, 3, 3, 3], side: 1 }] },
  {
    minSqm: 200,
    maxSqm: 300,
    rules: [
      { maxFloors: 2, front: [2, 3, 3, 4, 5], side: 1 },
      { maxFloors: 3, front: [2, 3, 3, 5, 6], side: 1.5 },
    ],
  },
  {
    minSqm: 300,
    maxSqm: 400,
    rules: [
      { maxFloors: 2, front: [3, 4, 5, 6, 7.5], side: 1.5 },
      { maxFloors: 4, front: [3, 4, 5, 6, 7.5], side: 2 },
    ],
  },
  {
    minSqm: 400,
    maxSqm: 500,
    rules: [
      { maxFloors: 2, front: [3, 4, 5, 6, 7.5], side: 2 },
      { maxFloors: 4, front: [3, 4, 5, 6, 7.5], side: 2.5 },
    ],
  },
  {
    minSqm: 500,
    maxSqm: 750,
    rules: [
      { maxFloors: 2, front: [3, 4, 5, 6, 7.5], side: 2.5 },
      { maxFloors: 4, front: [3, 4, 5, 6, 7.5], side: 3 },
      { maxFloors: 5, front: [3, 4, 5, 6, 7.5], side: 3.5 },
    ],
  },
  {
    minSqm: 750,
    maxSqm: 1000,
    rules: [
      { maxFloors: 2, front: [3, 4, 5, 6, 7.5], side: 3 },
      { maxFloors: 4, front: [3, 4, 5, 6, 7.5], side: 3.5 },
      { maxFloors: 5, front: [3, 4, 5, 6, 7.5], side: 4 },
    ],
  },
  {
    minSqm: 1000,
    maxSqm: 1500,
    rules: [
      { maxFloors: 2, front: [3, 4, 5, 6, 7.5], side: 3.5 },
      { maxFloors: 4, front: [3, 4, 5, 6, 7.5], side: 4 },
      { maxFloors: 5, front: [3, 4, 5, 6, 7.5], side: 5 },
    ],
  },
];

// Input!V51:X63 – the workbook's practical metre -> feet conversion for setbacks
export const SETBACK_M_TO_FT = {
  0: 0, 0.5: 1.5, 1: 3.25, 1.5: 5, 2: 6.5, 2.5: 8.25, 3: 10, 3.5: 11.5, 4: 13.25, 4.5: 14.75, 5: 16.5, 6: 19.75, 7.5: 24.5,
};

// Stage status -> completion factor (WD_DG!J22: Not started = 0, In progress = 50%, Completed = 100%)
export const STAGE_STATUS = { 'Not Started': 0, 'In Progress': 0.5, Completed: 1 };

// Report templates in the workbook (sheet name -> title). Used to tell the valuer which report applies.
export const REPORT_TEMPLATES = {
  PV: { sheet: 'PV_DSK', title: 'Plot Valuation', annexure: 'Annexure 12' },
  PV_E: { sheet: 'PV_E_DSK', title: 'Plot Valuation + Building Estimate', annexure: 'Annexure 12' },
  PP: { sheet: 'PP_DSK', title: 'Purchase of Property – Vacant Land', annexure: 'Annexure 12' },
  PP_E: { sheet: 'PP_E_DSK', title: 'Purchase of Plot + Building Estimate', annexure: 'Annexure 12' },
  BV: { sheet: 'BV_DSK', title: 'Land and Building Valuation', annexure: 'Annexure 8' },
  BP: { sheet: 'BP_DSK', title: 'Purchase of Property – Land and Building', annexure: 'Annexure 8' },
  BP_E: { sheet: 'BP_E_DSK', title: 'Purchase of Land & Building + Estimate', annexure: 'Annexure 8' },
  FV: { sheet: 'FV_DSK', title: 'Flat Valuation (Composite Rate Method)', annexure: 'Annexure 10' },
  FP: { sheet: 'FP_DSK', title: 'Purchase of Flat (Composite Rate Method)', annexure: 'Annexure 10' },
};
