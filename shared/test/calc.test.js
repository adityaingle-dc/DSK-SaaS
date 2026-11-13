// Parity tests: expected values are the ones the workbook itself produces for its saved sample
// (Input sheet as delivered: 133.33 sq.yd, GLR 2100, PMR 15700, Canara Bank Armoor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeValuation, computeLand, computeBuilding, computeFlat, computeProgress, computeProposed, computeFee,
  amountInWords, emptyValuation, sanitize, validate, parseLatLon, getContext, attachmentIds,
} from '../src/index.js';

const landSample = { siteAreaDocument: 133.33, siteAreaActual: 133.33, glr: 2100, marketRate: 15700 };

test('land: matches PV_DSK values', () => {
  const r = computeLand(landSample);
  assert.equal(r.siteArea, 133.33);
  assert.equal(Math.round(r.pmrValue), 2093281); // PV_DSK!G126
  assert.equal(Math.round(r.glrValue), 279993); // PV_DSK!G122
  assert.equal(r.fairMarketValue, 2093000); // PV_DSK!J160
  assert.equal(r.bookValue, 280000); // PV_DSK!J163
});

test('land: least of document/actual area is used', () => {
  assert.equal(computeLand({ ...landSample, siteAreaActual: 120 }).siteArea, 120);
  assert.equal(computeLand({ siteAreaActual: 150 }).siteArea, 150);
});

test('summary for vacant land: realizable 90% / distress 80%', () => {
  const data = { general: { propertyType: 'Vacant Land - Residential', loanCategory: 'Open Plot', valuationDate: '2026-11-12' }, land: landSample };
  const r = computeValuation(data);
  assert.equal(r.summary.reportTemplate, 'PV');
  assert.equal(r.summary.fairMarketValue, 2093000);
  assert.equal(r.summary.realizableValue, 1883700); // PV_DSK!J166
  assert.equal(r.summary.distressValue, 1674400); // PV_DSK!J169
  assert.equal(r.summary.words.fairMarketValue, 'Rupees Twenty Lakh Ninety Three Thousand Only');
});

test('building: depreciation uses valuation date and is capped', () => {
  const b = computeBuilding({ yearOfConstruction: 2020, floors: [{ floor: 'Ground', mainArea: 744.39, rate: 2000 }] }, '2026-11-12');
  assert.equal(b.age, 6);
  assert.equal(b.depreciationPct, 9); // 6 * 0.9 / 60
  assert.equal(Math.round(b.floors[0].replacementCost), 1488780); // Input!D42
  assert.equal(Math.round(b.netTotal), 1354790);

  const warnings = [];
  const old = computeBuilding({ yearOfConstruction: 1900, floors: [{ mainArea: 100, rate: 1000 }] }, '2026-01-01', warnings);
  assert.equal(old.depreciationPct, 90); // never more than 90% (10% salvage)
  assert.ok(old.netTotal > 0);
  assert.ok(warnings.some((w) => w.field === 'building.lifeYears'));
});

test('building: missing year of construction warns instead of producing a negative value', () => {
  const warnings = [];
  const b = computeBuilding({ floors: [{ mainArea: 744.39, rate: 2000 }] }, '2026-11-12', warnings);
  assert.equal(b.netTotal, 1488780);
  assert.ok(warnings.some((w) => w.field === 'building.yearOfConstruction'));
});

test('building: cantilever counted at 50%, per-unit amenity uses quantity', () => {
  const b = computeBuilding(
    {
      yearOfConstruction: 2026,
      floors: [{ mainArea: 1000, cantileverArea: 100, rate: 2000 }],
      amenities: { portico: { tier: 1 }, falseCeiling: { tier: 2, qty: 200 } },
    },
    '2026-11-12'
  );
  assert.equal(b.plinthTotal, 1050);
  assert.equal(b.amenities.total, 20000 + 100 * 200);
});

test('flat: composite rate method', () => {
  const f = computeFlat({ plinthArea: 1000, uds: 40, landRate: 15000, buildingRate: 2000, yearOfConstruction: 2016 }, '2026-11-12');
  assert.equal(f.depreciationPct, 15);
  assert.equal(f.compositeRate, 2300);
  assert.equal(f.fairMarketValue, 2300000);
  const uc = computeFlat({ plinthArea: 1000, uds: 40, landRate: 15000, buildingRate: 2000, underConstruction: true, completionPct: 50 }, '2026-11-12');
  assert.equal(uc.completionValue, 2600000);
  assert.equal(uc.stageValue, 1600000);
});

test('progress: matches WD_DG (roofing completed => 18%)', () => {
  const p = computeProgress({ estimatedCost: 3355000, stages: { roofing: 'Completed' } });
  assert.equal(p.completionPct, 18);
  assert.equal(p.workDoneValue, 603900); // WD_DG!E38
});

test('proposed: GO 168 setbacks match Input!Q46/S46', () => {
  const p = computeProposed({ floors: 1, roadWidthFt: 30, plotLengthFt: 40, plotBreadthFt: 30 }, 133.33);
  assert.equal(p.setbacks.frontFt, 5);
  assert.equal(p.setbacks.sideFt, 3.25);
  assert.equal(p.buildableLength, 31.75);
  assert.equal(p.buildableBreadth, 23.5);
  assert.equal(p.builtupPerFloor, 31.75 * 23.5);
});

test('fee: progressive slabs, rounded down to thousand', () => {
  const f = computeFee(2093000);
  assert.equal(Math.round(f.gross), 3843);
  assert.equal(f.fee, 3000);
});

test('amount in words (Indian system)', () => {
  assert.equal(amountInWords(1883700), 'Rupees Eighteen Lakh Eighty Three Thousand Seven Hundred Only');
  assert.equal(amountInWords(125000000), 'Rupees Twelve Crore Fifty Lakh Only');
  assert.equal(amountInWords(0), 'Rupees Zero Only');
});

test('context picks the right report template', () => {
  const ctx = (propertyType, loanCategory) => getContext({ general: { propertyType, loanCategory } }).reportTemplate;
  assert.equal(ctx('Vacant Land - Residential', 'Purchase of Property'), 'PP');
  assert.equal(ctx('Vacant Land - Residential', 'Under Construction'), 'PV_E');
  assert.equal(ctx('Existing Building - Residential ', 'Open Plot'), 'BV');
  assert.equal(ctx('Existing Building - Residential ', 'Purchase of Property'), 'BP');
  assert.equal(ctx('Residential Flat', 'Purchase of Property'), 'FP');
});

test('sanitize drops unknown keys and coerces types; validate enforces required on submit', () => {
  const clean = sanitize({
    general: { valuationDate: '2026-11-12T10:00:00Z', hacker: 'x', ifsc: 'cnrb0001234' },
    land: { siteAreaDocument: '133.33' },
    building: { amenities: { portico: { tier: '9' }, gardening: { tier: '2' } } },
    $where: 'evil',
  });
  assert.equal(clean.general.valuationDate, '2026-11-12');
  assert.equal(clean.general.hacker, undefined);
  assert.equal(clean.general.ifsc, 'CNRB0001234');
  assert.equal(clean.land.siteAreaDocument, 133.33);
  assert.deepEqual(clean.building.amenities, { gardening: { tier: 2 } });
  assert.equal(clean.$where, undefined);

  const errs = validate(sanitize(emptyValuation()), { mode: 'submit' });
  const fields = errs.map((e) => e.field);
  assert.ok(fields.includes('general.propertyType'));
  assert.ok(fields.includes('applicant.name'));
  assert.equal(validate(sanitize(emptyValuation()), { mode: 'draft' }).length, 0);

  const bad = validate(sanitize({ general: { propertyType: 'Castle' }, applicant: { phone1: '12345' } }));
  assert.ok(bad.some((e) => e.field === 'general.propertyType'));
  assert.ok(bad.some((e) => e.field === 'applicant.phone1'));
});

test('parseLatLon accepts Google Maps paste', () => {
  assert.deepEqual(parseLatLon('18.7944150271428,78.29840297923899'), { lat: 18.7944150271428, lon: 78.29840297923899 });
  assert.deepEqual(parseLatLon('18.79, 78.29'), { lat: 18.79, lon: 78.29 });
  assert.equal(parseLatLon('hello'), null);
});

test('document files: sanitized as attachment refs, invalid ids dropped', () => {
  const clean = sanitize({
    documents: { items: [{ type: 'Sale Deed', files: [{ id: '0123456789abcdef01234567', name: 'deed.jpg', type: 'image/jpeg', size: 1000 }, { id: '../../etc/passwd' }, 'junk'] }, { files: [] }] },
  });
  assert.deepEqual(clean.documents.items, [{ type: 'Sale Deed', files: [{ id: '0123456789abcdef01234567', name: 'deed.jpg', type: 'image/jpeg', size: 1000 }] }]);
  assert.deepEqual(attachmentIds(clean), ['0123456789abcdef01234567']);
});
