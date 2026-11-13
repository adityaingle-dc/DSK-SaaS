// Valuation calculation engine – a tested, side-effect-free port of the formulas in
// 'CB Format 2026.xlsm' (Input sheet + PV/BV/FV/WD/Fee report sheets).
// Known workbook defects are fixed here; each fix is tagged "FIX:" and listed in docs/INPUT_SHEET_ANALYSIS.md.

import { catalog } from './catalog.generated.js';
import {
  DEFAULTS, ROUNDING, FEE_SLABS, SETBACK_TABLE, ROAD_WIDTH_BANDS_FT, SETBACK_M_TO_FT,
  SQYD_TO_SQM, SQYD_TO_SQFT, M_TO_FT, STAGE_STATUS, REPORT_TEMPLATES,
} from './constants.js';
import { amountInWords } from './words.js';

// ---------- helpers ----------
const isBlank = (v) => v === undefined || v === null || v === '';
const num = (v) => {
  if (isBlank(v)) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOr = (v, fallback) => (isBlank(v) || !Number.isFinite(Number(v)) ? fallback : Number(v));
const pct = (v, fallbackFraction) => (isBlank(v) ? fallbackFraction : num(v) / 100); // UI stores percentages (90 = 90%)
const round2 = (v) => Math.round(v * 100) / 100;

export function roundTo(value, { mode, to }) {
  const x = value / to;
  const r = mode === 'roundup' ? Math.ceil(x - 1e-9) : mode === 'rounddown' ? Math.floor(x + 1e-9) : Math.round(x);
  return r * to;
}

function yearOf(date) {
  if (isBlank(date)) return new Date().getFullYear();
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
}

// ---------- context: which parts of the input sheet apply ----------
export const LAND_TYPES = ['Vacant Land - Residential', 'Agri Land'];
export const FLAT_TYPES = ['Residential Flat'];
export const PROGRESS_CATEGORIES = ['Under Construction', 'Semi Finished'];
export const ESTIMATE_CATEGORIES = ['Under Construction', 'Semi Finished', 'Improvement Works'];

export function getContext(data = {}) {
  const g = data.general || {};
  const kind = FLAT_TYPES.includes(g.propertyType) ? 'flat' : LAND_TYPES.includes(g.propertyType) ? 'land' : g.propertyType ? 'building' : 'land';
  const isPurchase = g.loanCategory === 'Purchase of Property';
  const needsProgress = PROGRESS_CATEGORIES.includes(g.loanCategory);
  const needsEstimate = isBlank(g.includeEstimate) ? ESTIMATE_CATEGORIES.includes(g.loanCategory) : Boolean(g.includeEstimate);

  let code = { land: 'P', building: 'B', flat: 'F' }[kind] + (isPurchase ? 'P' : 'V');
  if (needsEstimate && ['PV', 'PP', 'BP'].includes(code)) code += '_E';
  return { kind, isPurchase, needsProgress, needsEstimate, reportTemplate: code, report: REPORT_TEMPLATES[code] };
}

// ---------- land (Input!E3:G22, PV_DSK Part III) ----------
export function computeLand(land = {}, warnings = []) {
  const doc = land.siteAreaDocument;
  const act = land.siteAreaActual;
  const provided = [doc, act].filter((v) => !isBlank(v)).map(Number);
  const siteArea = provided.length ? Math.min(...provided) : 0; // Input!F11 =MIN(F4:F5) – least of document/actual

  if (provided.length === 2 && Math.abs(num(doc) - num(act)) / Math.max(num(doc), num(act)) > 0.05) {
    warnings.push({ field: 'land.siteAreaActual', message: 'Site area as per document and actual differ by more than 5%.' });
  }

  const glrValue = siteArea * num(land.glr);
  const pmrValue = siteArea * num(land.marketRate);
  const extras = num(land.compoundWall) + num(land.gate) + num(land.powerSupply);
  const plus = (land.plusFactors || []).reduce((s, f) => s + num(f.amount), 0);
  const minus = (land.minusFactors || []).reduce((s, f) => s + num(f.amount), 0);

  // PV_DSK: I139 = ROUND(PMR + extras, -3);  H148 = I139 + add - less
  const fairMarketValue = roundTo(pmrValue + extras, ROUNDING.land) + plus - minus;
  const bookValue = roundTo(glrValue, ROUNDING.land); // PV_DSK!G139

  return {
    siteArea,
    siteAreaSqft: siteArea * SQYD_TO_SQFT,
    siteAreaSqm: round2(siteArea * SQYD_TO_SQM),
    glrValue,
    pmrValue,
    marketRateRange: num(land.marketRate) ? [num(land.marketRate), num(land.marketRate) + DEFAULTS.marketRateBand] : null,
    extras,
    plus,
    minus,
    fairMarketValue,
    bookValue,
  };
}

// ---------- depreciation (Input!E42 / BV_DSK!G217) ----------
export function depreciation({ yearOfConstruction, lifeYears, valuationDate }, warnings = [], fieldPrefix = 'building') {
  const life = numOr(lifeYears, DEFAULTS.buildingLifeYears);
  if (isBlank(yearOfConstruction)) {
    warnings.push({ field: `${fieldPrefix}.yearOfConstruction`, message: 'Year of construction is required to compute depreciation.' });
    return { age: null, life, factor: 0 };
  }
  // FIX: age uses the valuation date, not TODAY() (Input!D40), so a saved report never changes value later.
  const age = yearOf(valuationDate) - num(yearOfConstruction);
  if (age < 0) warnings.push({ field: `${fieldPrefix}.yearOfConstruction`, message: 'Year of construction is after the valuation date.' });
  if (age > life) warnings.push({ field: `${fieldPrefix}.lifeYears`, message: `Building age (${age}) exceeds its estimated life (${life}); depreciation capped at ${(1 - DEFAULTS.salvagePct) * 100}%.` });
  // FIX: clamp age to [0, life]; the workbook let depreciation exceed 90% and go negative-valued.
  const effectiveAge = Math.min(Math.max(age, 0), life);
  const factor = life > 0 ? ((1 - DEFAULTS.salvagePct) * effectiveAge) / life : 0;
  return { age, life, factor };
}

const tierRate = (item, tier) => (tier >= 1 && tier <= 4 ? num(item.rates[tier - 1]) : 0);
function sumTiered(items, selected = {}) {
  let total = 0;
  const lines = [];
  for (const item of items) {
    const sel = selected[item.key];
    const tier = num(sel?.tier);
    if (!tier) continue;
    const rate = tierRate(item, tier);
    // FIX: per-unit rates (Rs/sq.ft, Rs/rft) are multiplied by quantity instead of being added as lump sums.
    const qty = item.unit ? num(sel.qty) : 1;
    const amount = rate * qty;
    total += amount;
    lines.push({ key: item.key, label: item.label, tier, rate, qty: item.unit ? qty : null, unit: item.unit, amount });
  }
  return { total, lines };
}

// ---------- building (Input!A39:F51, BV_DSK Parts C–F) ----------
export function computeBuilding(building = {}, valuationDate, warnings = []) {
  const dep = depreciation({ ...building, valuationDate }, warnings, 'building');
  const rows = (building.floors || []).filter((f) => !isBlank(f.mainArea) || !isBlank(f.cantileverArea));
  if (!rows.length) warnings.push({ field: 'building.floors', message: 'Add at least one floor with its plinth area.' });

  const floors = rows.map((f) => {
    // BV_DSK!K188: plinth = main portion + 50% of cantilevered portion
    // FIX: replacement cost uses this plinth area (the workbook multiplied the rate by the main area only).
    const plinthArea = num(f.mainArea) + DEFAULTS.cantileverFactor * num(f.cantileverArea);
    const replacementCost = plinthArea * num(f.rate);
    const depreciationAmount = replacementCost * dep.factor;
    return { floor: f.floor, plinthArea, rate: num(f.rate), replacementCost, depreciation: depreciationAmount, netValue: replacementCost - depreciationAmount };
  });

  const sum = (k) => floors.reduce((s, f) => s + f[k], 0);
  const plinthTotal = sum('plinthArea');
  const netTotal = sum('netValue');
  const amenities = sumTiered(catalog.amenities, building.amenities);
  const water = sumTiered(catalog.waterServices, building.water);
  const electricalLumpsum = pct(building.electricalLumpsumPct, DEFAULTS.electricalLumpsumPct) * netTotal;
  const plumbingLumpsum = pct(building.plumbingLumpsumPct, DEFAULTS.plumbingLumpsumPct) * netTotal;

  return {
    age: dep.age,
    life: dep.life,
    depreciationPct: round2(dep.factor * 100),
    floors,
    plinthTotal,
    replacementTotal: sum('replacementCost'),
    depreciationTotal: sum('depreciation'),
    netTotal,
    bookValue: plinthTotal * numOr(building.rccGlrRate, DEFAULTS.rccGlrRate), // BV_DSK!G308
    amenities,
    services: { water, electricalLumpsum, plumbingLumpsum, total: water.total + electricalLumpsum + plumbingLumpsum },
  };
}

// ---------- flat (FV_DSK – composite rate method) ----------
export function computeFlat(flat = {}, valuationDate, warnings = []) {
  const plinth = num(flat.plinthArea);
  const uds = num(flat.uds);
  const landCost = uds * num(flat.landRate);
  const extras = (flat.extras || []).reduce((s, e) => s + num(e.amount), 0);
  if (!plinth) warnings.push({ field: 'flat.plinthArea', message: 'Plinth area of the flat is required.' });
  const bookValue = uds * num(flat.glrRate) + plinth * numOr(flat.rccGlrRate, DEFAULTS.rccGlrRate);

  if (flat.underConstruction) {
    // FV_DSK Part B – value on completion and stage value
    const completion = pct(flat.completionPct, 0);
    const buildingOnCompletion = plinth * num(flat.buildingRate);
    const completionValue = landCost + buildingOnCompletion;
    const stageValue = landCost + buildingOnCompletion * completion;
    return {
      underConstruction: true,
      landCost,
      completionValue,
      compositeRate: plinth ? completionValue / plinth : 0,
      stageValue,
      extras,
      fairMarketValue: roundTo(stageValue + extras, ROUNDING.flat),
      bookValue: roundTo(bookValue, ROUNDING.flat),
    };
  }

  // FV_DSK Part C – depreciated building rate + land share, divided by plinth area
  const dep = depreciation({ ...flat, valuationDate }, warnings, 'flat');
  const depreciatedRate = num(flat.buildingRate) * (1 - dep.factor);
  const buildingCost = depreciatedRate * plinth;
  const total = buildingCost + landCost;
  return {
    underConstruction: false,
    age: dep.age,
    life: dep.life,
    depreciationPct: round2(dep.factor * 100),
    depreciatedRate,
    buildingCost,
    landCost,
    compositeRate: plinth ? total / plinth : 0,
    extras,
    fairMarketValue: roundTo(total + extras, ROUNDING.flat),
    bookValue: roundTo(bookValue, ROUNDING.flat),
  };
}

// ---------- stage-wise progress (WD_DG) ----------
export function computeProgress(progress = {}) {
  const stages = catalog.constructionStages.map((s) => {
    const status = progress.stages?.[s.key] || 'Not Started';
    const done = num(s.weight) * (STAGE_STATUS[status] ?? 0);
    return { key: s.key, label: s.label, weight: num(s.weight), status, completed: done };
  });
  const completion = stages.reduce((s, x) => s + x.completed, 0);
  return { stages, completionPct: round2(completion * 100), workDoneValue: Math.round(completion * num(progress.estimatedCost)) };
}

// ---------- proposed building: GO 168 setbacks & buildable area (Input!A60:G69, L46:X69) ----------
const mToFt = (m) => SETBACK_M_TO_FT[m] ?? Math.round(m * M_TO_FT * 4) / 4;

export function computeProposed(proposed = {}, siteAreaSqyd, warnings = []) {
  const floors = Math.max(1, numOr(proposed.floors, 1));
  const siteSqm = siteAreaSqyd * SQYD_TO_SQM;
  const band = SETBACK_TABLE.find((b) => siteSqm >= b.minSqm && siteSqm < b.maxSqm);
  if (!band) {
    warnings.push({ field: 'proposed.floors', message: `Setback table covers sites up to 1500 sq.m; this site is ${round2(siteSqm)} sq.m.` });
  }
  let rule = band?.rules.find((r) => floors <= r.maxFloors);
  if (band && !rule) {
    rule = band.rules[band.rules.length - 1];
    warnings.push({ field: 'proposed.floors', message: `${floors} floors exceeds the ${rule.maxFloors} permitted for this site size.` });
  }
  if (isBlank(proposed.roadWidthFt)) warnings.push({ field: 'proposed.roadWidthFt', message: 'Abutting road width not given; assuming up to 40 ft.' });
  const roadIdx = ROAD_WIDTH_BANDS_FT.findIndex((w) => num(proposed.roadWidthFt) <= w);

  const frontM = rule ? rule.front[roadIdx] : 0;
  const sideM = rule ? rule.side : 0;
  const frontFt = mToFt(frontM);
  const sideFt = mToFt(sideM);

  // Input!D63/D64 – rear setback taken equal to the side setback, as in the workbook
  const buildableLength = num(proposed.plotLengthFt) - frontFt - sideFt;
  const buildableBreadth = num(proposed.plotBreadthFt) - 2 * sideFt;
  if (num(proposed.plotLengthFt) && (buildableLength <= 0 || buildableBreadth <= 0)) {
    warnings.push({ field: 'proposed.plotLengthFt', message: 'Plot is too small for the required setbacks.' });
  }
  const builtupPerFloor = Math.max(buildableLength, 0) * Math.max(buildableBreadth, 0);
  const slabLength = buildableLength + num(proposed.extNorth) + num(proposed.extSouth);
  const slabWidth = buildableBreadth + num(proposed.extEast) + num(proposed.extWest);
  const slabArea = Math.max(slabLength, 0) * Math.max(slabWidth, 0);
  const slabExceedsSite = slabArea > siteAreaSqyd * SQYD_TO_SQFT; // Input!A68 "ERROR" check
  if (slabExceedsSite) warnings.push({ field: 'proposed.extNorth', message: 'Slab area is greater than the site area.' });

  const rooms = (proposed.rooms || []).map((r) => ({ name: r.name, area: num(r.length) * num(r.width) }));
  return {
    siteAreaSqm: round2(siteSqm),
    maxFloors: rule?.maxFloors ?? null,
    setbacks: { frontM, sideM, frontFt, sideFt },
    buildableLength,
    buildableBreadth,
    builtupPerFloor,
    totalBuiltup: builtupPerFloor * floors,
    slabLength,
    slabWidth,
    slabArea,
    slabExceedsSite,
    rooms,
    roomsTotal: rooms.reduce((s, r) => s + r.area, 0),
  };
}

// ---------- professional fee (Fee Reciept sheet) ----------
export function computeFee(value, { travel = 0, discount = 0 } = {}) {
  const slabs = FEE_SLABS.map((s) => {
    const taxable = Math.max(0, Math.min(value, s.upto) - s.from);
    return { ...s, amount: taxable * s.rate };
  });
  const gross = slabs.reduce((s, x) => s + x.amount, 0);
  const fee = roundTo(gross, ROUNDING.fee);
  return { slabs, gross, fee, travel: num(travel), discount: num(discount), payable: Math.max(0, fee + num(travel) - num(discount)) };
}

// ---------- full sheet ----------
export function computeValuation(data = {}) {
  const warnings = [];
  const g = data.general || {};
  const ctx = getContext(data);

  if (g.inspectionDate && g.valuationDate && new Date(g.inspectionDate) > new Date(g.valuationDate)) {
    warnings.push({ field: 'general.inspectionDate', message: 'Inspection date is after the valuation date.' });
  }

  const result = { context: ctx };
  if (ctx.kind !== 'flat') result.land = computeLand(data.land, warnings);

  let fairMarketValue = 0;
  let bookValue = 0;

  if (ctx.kind === 'land') {
    fairMarketValue = result.land.fairMarketValue;
    bookValue = result.land.bookValue;
  } else if (ctx.kind === 'building') {
    const b = computeBuilding(data.building, g.valuationDate, warnings);
    result.building = b;
    // BV_DSK Part F abstract
    fairMarketValue = roundTo(result.land.fairMarketValue + b.netTotal + b.amenities.total + b.services.total, ROUNDING.abstract);
    bookValue = roundTo(result.land.bookValue + b.bookValue, ROUNDING.abstract);
  } else {
    result.flat = computeFlat(data.flat, g.valuationDate, warnings);
    fairMarketValue = result.flat.fairMarketValue;
    bookValue = result.flat.bookValue;
  }

  if (ctx.needsProgress) result.progress = computeProgress(data.progress);
  if (ctx.needsEstimate && ctx.kind !== 'flat') result.proposed = computeProposed(data.proposed, result.land.siteArea, warnings);

  const realizablePct = pct(g.realizablePct, DEFAULTS.realizablePct);
  const distressPct = pct(g.distressPct, DEFAULTS.distressPct);
  const realizableValue = Math.round(fairMarketValue * realizablePct);
  const distressValue = Math.round(fairMarketValue * distressPct);

  result.summary = {
    kind: ctx.kind,
    reportTemplate: ctx.reportTemplate,
    fairMarketValue,
    bookValue,
    realizablePct,
    distressPct,
    realizableValue,
    distressValue,
    words: {
      fairMarketValue: amountInWords(fairMarketValue),
      bookValue: amountInWords(bookValue),
      realizableValue: amountInWords(realizableValue),
      distressValue: amountInWords(distressValue),
    },
  };
  result.fee = computeFee(fairMarketValue, { travel: g.feeTravel, discount: g.feeDiscount });
  result.warnings = warnings;
  return result;
}
