# CB Format 2026.xlsm — technical analysis

**Source:** `CB Format 2026.xlsm` (1.27 MB, macro-enabled) · **Analysed:** 2026-11-13
**What it is:** the working tool of an approved valuer (D S Krishna Valuers, Armoor / Nizamabad) for **bank property-valuation reports**, mainly Canara Bank home loans, mortgage loans and collateral security. A field evaluator fills one **Input** sheet per case. About 20 report sheets then pull from it through named ranges and turn into the bank's annexure formats, which are exported to PDF by a macro.

This document is the spec behind `shared/` (data catalog, form schema, calculation engine) and the Valuation module of the app.

---

## 1. Workbook structure

| Sheet | Visible | Purpose | Notes |
|---|---|---|---|
| **Input** | ✔ | The input sheet: about 150 input cells, standard lists, the GO 168 setback table | A1:X225, 12 data-validation lists, 6 merged ranges |
| Calc Engine | hidden | "Purpose of valuation" master list (26 purposes in 5 groups) | Only a lookup list; no calculations |
| **PV_DSK** | ✔ | Plot valuation certificate + **Annexure 12** (vacant site) + declaration (Annexure 22) + code of conduct (Annexure 23) + map + photo pages | 527 rows, print area A1:K529 |
| PV_E_DSK | hidden | Same as PV, plus a building estimate | |
| PP_DSK / PP_E_DSK | hidden | Purchase of vacant land (± estimate) | |
| **BV_DSK** | ✔ | Land & building valuation, **Annexure 8**, Parts A–G | 705 rows; holds most of the per-report choice inputs |
| BP_DSK / BP_E_DSK | hidden | Purchase of land & building (± estimate) | |
| **FV_DSK** | ✔ | Flat valuation by **composite rate method**, Annexure 10 | Part C broken (`#REF!`) |
| FP_DSK | hidden | Purchase of flat | |
| Rent and Captialization | hidden | Annexure 9, commercial building by rent capitalization | **Every input reference is `#REF!`**, so the sheet is unusable |
| Fee Reciept | hidden | Professional fee by progressive slabs | |
| GF Est 2026, FF Est 2026, GF FF Est 2026, Semi Finished GF Est 2026, Semi GF FF Est | hidden | Abstract estimate / BOQ for a proposed building (earthwork, PCC, RCC, masonry…) driven by the Input "Proposed building" block; rate multiplier I46 (1, 1.25, 1.5) | FF Est has `#VALUE!` errors |
| WD_DG | hidden | Work-done certificate (stage-wise progress) | |
| CC_DG | hidden | Final completion certificate | |
| 031126 | hidden | Scratch electrical point schedule (switches/sockets per room) | Not linked to anything |

**VBA project:** 8 modules, 1 user form (empty), about 4,000 lines (see §5).

**Named ranges:** 50 workbook names point into Input (`DateVal`, `BankName`, `appName`, `sitearea`, `glr`, `mv`, `PV`, `lat`, `lon`, `Address1..4`, the boundary names `NorthBD/BA/DA/DD`, …). Some sheets also have duplicate local names. The report sheets read the Input sheet only through these names or through direct `Input!` references (over 700 report rows contain one).

## 2. Input sheet — cell map

| Block | Cells | Fields | App section |
|---|---|---|---|
| Dates | B4, B5, H4:H5 | Valuation date (`=TODAY()`), inspection date | `general` |
| Bank | D4:D8 | IFSC, bank name, branch, email, contact person | `general` |
| Classification | B6, B7, B8, Calc Engine | Type of property (7), type of loan (4), loan category / condition of site (6), purpose (26) | `general` |
| Applicant | A11:B15, D11:D15 | Salutation, name, relation + relative name, occupation, 2 phones, 5-line address | `applicant` |
| Intending vendor | A18:B22, D18:D22 | Same layout as applicant | `vendor` (shown only for a purchase) |
| Property | B24:B32, A25, A29 | Description, number type and number, Sy./LP no., street, village, Mandal/Municipality, district, pin, landmark | `property` |
| GPS | H14 → I14/J14 → F21/F22 | "lat,lon" pasted from Google Maps, then split by a macro | `property.location` |
| Site area & rates | F4:F6, F11:F20 | Area (document) and area (actual), shape, GLR, PMR, realizable %, distress % | `land`, `general` |
| Boundaries | C26:G29 | N/S/E/W × boundary (document/actual) × dimension (document/actual); C26 rotates the orientation | `boundaries.sides` |
| Documents | A35:G38 | Up to 4 rows: type, 3 details, number, date | `documents.items` (no row limit) |
| Building | B40, F40, A42:C47, D49 | Year built, life (60), floor-wise built-up area × rate (G…5th floor), RCC GLR rate | `building` |
| Flat | B54:E57 | Flat area, UDS, total site area, market rate, construction rate | `flat` |
| Proposed building | C61, B63:B64, B66:E66, D68:G69, A71:D83, A90:D96 | Floors, plot L × B, slab extensions N/S/E/W, columns, beams, doors / windows / ventilators, rooms | `proposed` |
| Standard lists | I3:P10, L35:P35, K20:M20 | Dropdown sources | `shared/src/catalog.generated.js` |
| GO 168 setbacks | L46:X69 | Site-area bands × max floors × road-width category → front / side setback (m), m→ft table | `shared/src/constants.js` |

**Choice inputs on the report sheets:** BV, PV and FV also hold inputs that are *not* on the Input sheet. In column L the user types an option number (1–5), and an `HLOOKUP` picks the text from the option table in M:Q. There are 21 site characteristics, 6 building characteristics, 5 approval questions, 6 specifications, 20 amenities (graded Basic, Standard, Deluxe or Premium), 10 water / sanitation items, 6 electrical items, 17 flat details and 13 construction stages. Typing a bare number into a report page is fragile and invisible to the bank, so the app brings all of these into the input sheet as labelled dropdowns.

## 3. Calculation logic (as found)

### Land (Input E3:G22, PV_DSK Part III)
- `sitearea = MIN(area per document, area per actual)`
- GLR value = sitearea × GLR; PMR value = sitearea × MV
- PV_DSK: `FMV = ROUND(PMR + extras, -3) + plus factors − minus factors`; `book value = ROUND(GLR value, -3)`
- Realizable = FMV × 90 %; distress = FMV × 80 %
- Sample case: 133.33 sq.yd × ₹15,700 = ₹20,93,281 → **₹20,93,000** FMV, ₹2,80,000 book value, ₹18,83,700 realizable, ₹16,74,400 distress

### Building (Input A39:F51, BV_DSK Parts C–F)
- Age = `YEAR(TODAY()) − year built`; life 60 years
- Per floor: replacement cost = built-up × rate; depreciation = RC × 0.9 × age / life (10 % salvage); net = RC − depreciation
- Plinth shown in the report = main + 50 % × cantilevered portion (BV K188)
- Amenities (Part D): grade → fixed amount (`HLOOKUP(…, TRUE)`)
- Services (Part E): water items by grade, plus electrical and plumbing lump sums of 5 % / 7.5 % of the net civil works
- Abstract (Part F): PMR column = land + building + amenities + services; GLR column = land GLR + total built-up × RCC GLR (₹900/sq.ft); `ROUND(-3)`

### Flat (FV_DSK, composite rate method)
- Depreciated building rate = rate × (1 − 0.9 × age / life)
- Composite rate = (depreciated rate × plinth + land rate × UDS) / plinth; value = composite × plinth + extras, `ROUNDUP(-3)`
- Under construction: value on completion = UDS × land rate + plinth × building rate; stage value applies the % of work completed to the building part

### Proposed building (Input L46:X69 + A60:G69)
- Site area converted to sq.m → GO 168 band → front setback (by abutting road width) and side setback (by number of floors) → feet using the workbook's own conversion table (1 m → 3.25 ft, 1.5 m → 5 ft, …)
- Buildable L = plot L − front − side (the rear is taken equal to the side); buildable B = plot B − 2 × side; built-up = L × B
- Slab = (L + ext N + ext S) × (B + ext E + ext W); error if slab > site area in sq.ft

### Progress (WD_DG)
- Stage weights (13 stages, sum 100 %); Not started 0, In progress 50 %, Completed 100 %; value of work done = completion % × estimated cost

### Fee (Fee Reciept)
- Progressive slabs on FMV: 0.25 % up to ₹5 L · 0.2 % ₹5–15 L · 0.1 % ₹15–50 L · 0.05 % ₹50 L–1 Cr · 0.025 % above; `ROUNDDOWN(-3)`, + travel − discount

## 4. How the reports consume the input
- Header block: firm name, qualifications, registration (A-29665), address. Hard-coded on every sheet, and **two different firm addresses** appear (Armoor in the valuation reports, Hyderabad in the estimates).
- Body text is built with `CONCAT` / `CONCATENATE` from the named ranges. Amounts in words come from the VBA `SpellNumber_Indian`. Page count comes from `GetTotalPages()`.
- Each report has fixed anchor cells for the maps (A330) and the photo grids (A382, A435…), so each report needs its own copy of every map and photo macro.

## 5. VBA macros and their web/mobile replacements

| Macro (module) | What it does | Replacement |
|---|---|---|
| `SpellNumber_Indian` (Module1) | Amount in words (Lakh/Crore) | `shared/src/words.js` ✔ |
| `ExportToPDF_NoPrinter_Safe` (Module1) | Exports the active sheet to a PDF next to the workbook | Server-side PDF per report template — *phase 2* |
| `Clear_Input` (Module8) | Clears input ranges for the next case | "New valuation"; each case is a separate record ✔ |
| `LatlonSplit` (Module6) | Text-to-columns on H14 | `parseLatLon()` + "Use my location" (device GPS) ✔ |
| `InsertMaps*` ×7 (Module7) | Downloads 4 Google Static Maps per report sheet and embeds them | Server-side static map with a restricted key — *phase 2* |
| `InsertLocationQRCode_FixedI16` (Module2) | QR code of the Maps link via api.qrserver.com | Generate the QR locally — *phase 2* |
| `InsertPhoto*` ×23 (Modules 3, 5) | File picker → fit up to 4 photos into fixed boxes per page | Photo upload / mobile camera capture — *phase 2* |
| `GetTotalPages`, `Workbook_BeforePrint` | Page count, full recalc before print | Handled by the PDF renderer |

## 6. Defects found in the workbook

Each item is fixed in `shared/src/calc.js` (marked `FIX:`) or by the app's data model, unless noted otherwise.

1. **The age of building uses `TODAY()`** (Input D40). The sample has **no year of construction**, so the age is 2026 years and the depreciation is ₹4.52 crore against a ₹14.9 lakh replacement cost. Net building value comes out at **−₹4.38 crore** and the "Total valuation" at −₹4.17 crore. → The app uses the valuation date and makes the year of construction a required field.
2. **Depreciation has no cap.** An age above the building's life gives depreciation over 90 % and a negative value. → Age is clamped to [0, life].
3. **The valuation date is `=TODAY()`** (H4 → B4), and WD_DG/CC_DG print `TODAY()` with the inspection date set to "today − 1". Re-opening an old file silently re-dates it. → Dates are stored per case.
4. **Wrong references in BV_DSK:** the depreciation for the 2nd and 3rd floors (I233, I235) points to `Input!D45`, which is a *replacement cost* cell, not E44/E45. The actual dimensions J129:J131 are shifted by one row (they read G28:G30 instead of G27:G29).
5. **Area basis is inconsistent:** the replacement cost uses the main built-up area only (Input B42×C42), but the report prints a plinth area that includes 50 % of the cantilever. That cantilever is computed from the *proposed* building's slab area (Slabarea − main area), which gives −690.8 sq.ft in the sample. → The app uses main + 50 % cantilever as entered.
6. **Two roundings, two answers:** Input F15 uses `ROUNDUP(-4)` (₹21,00,000, realizable ₹18,90,000) while PV_DSK uses `ROUND(-3)` (₹20,93,000, realizable ₹18,83,700). BV_DSK takes the Input one for its land value. → One convention is used (the report's `ROUND(-3)`). *Needs confirmation (§9).*
7. **The distress % is read from the wrong cell:** PV_DSK M169 reads `Input!H19` (the fixed standard value), not F19 (the user's input), so editing the distress % has no effect on the plot report.
8. **Text building:** the salutation dropdown is concatenated with a name that already starts with "Sri.", giving "Sri. Sri. Karthan Vijay Kumar". Phones become "7731996455,, ". → The app keeps salutation, name and phones as separate fields.
9. **Excel auto-conversion:** the vendor's "Plot No. / H.No." (D18) holds the date 04-05-1995, almost certainly a house number like 4-5-95. → House and plot numbers are stored as text.
10. **GPS is 0,0 until a macro is run:** `lat` and `lon` read I14/J14, which only the LatlonSplit macro fills. In the delivered file they are 0, so the map and QR macros would plot the property at 0°, 0°.
11. **Broken references:** the Input validation C27:C29 is `#REF!`; the whole **Rent and Captialization** sheet is `#REF!`; **FV_DSK/FP_DSK Part C** (age, life, land rate, GLR) is `#REF!`, so the flat composite-rate valuation does not compute; FF Est 2026 shows `#VALUE!`.
12. **Per-unit rates are added as lump sums:** false ceiling (₹70/sq.ft), aluminium works (₹/sq.ft) and handrails (₹/rft) are added as ₹70, ₹350… Marble flooring has rate ranges but no numeric row. → The app asks for a quantity on per-unit items.
13. **Data typo:** the Sit-out "Standard" grade is ₹1,50,000 (BV N244), but its own range says ₹15,000–25,000. → Corrected to ₹15,000. *Confirm.*
14. **Setback formulas are partial:** Input Q47/S47 handle only sites under 300 sq.m and ignore road width, even though the table beside them covers up to 1,500 sq.m by road-width category. → The full table is implemented.
15. **Zero stage weights:** foundations/plinth and superstructure-up-to-lintel weigh **0 %** in WD_DG, so a borrower who has completed the foundations shows 0 % progress. → Kept as in the workbook. *Needs confirmation.*
16. **Misaligned labels in PV_DSK:** "S.F./T.S./R.S. No." shows the street, "Village / Block" shows a blank (printed as "0"), and "Mandal / District" shows the pincode. → The address fields are now discrete, so the report mapping will be explicit.
17. **Stale data leaks into the next case:** `Clear_Input` never clears the **North boundary row (D26:G26)**, document row 4, or the choice indices on the report sheets. The previous customer's data can appear in the next report.
18. **One case per file:** there is no history, search, review trail or concurrency. Cases are kept as copies of the workbook.

## 7. Security & privacy findings
- **A Google Maps API key is hard-coded in plain text** in Module7 (in all 7 `InsertMaps*` macros). Anyone with a copy of the workbook can use it and run up billing. **Action: rotate the key in Google Cloud Console and restrict it (Static Maps API only, with a quota).** The app will keep keys on the server only.
- Customer property coordinates are sent to a third party (api.qrserver.com) to make QR codes. Map and QR images are written as loose files next to the workbook.
- The workbook holds customer PII (names, phones, addresses, document numbers) with no access control. The app adds authentication, role-scoped access (evaluators see only their own cases) and server-side validation.

## 8. What the app implements now

| Area | Status |
|---|---|
| Every Input block + every report-sheet choice input, as 15 conditional sections (`shared/src/formSchema.js`) | ✔ |
| Master data extracted verbatim from the workbook (`scripts/gen_catalog.py` → `shared/src/catalog.generated.js`) | ✔ |
| Calculation engine: land, building, amenities, services, flat (composite and under construction), progress, GO 168 setbacks, fee, amount in words | ✔ 14 parity tests (`npm test --prefix shared`) |
| Sections and report template chosen from property type × loan category (PV, PV_E, PP, PP_E, BV, BP, BP_E, FV, FP) | ✔ |
| Server re-validates and **re-computes** every save; client-sent results are ignored | ✔ |
| Draft → submitted → approved/rejected workflow, search, dashboard | ✔ |
| PDF reports per template, Annexures 22/23, fee receipt, WD/CC certificates | Phase 2 |
| BOQ abstract estimates (GF / FF / semi-finished) from the doors, windows, rooms and walls inputs | Phase 2 (inputs captured already) |
| Photos, static maps, QR code | Phase 2 (mobile camera + GPS) |
| Rent capitalization (Annexure 9) | Phase 2: the sheet must be rebuilt, since all its inputs are `#REF!` |
| Admin-editable rate masters (amenity rates, stage weights, fee slabs, firm profile) | Phase 2: they are constants in `shared/src/constants.js` today |

## 9. Questions for the valuer
1. **Land rounding:** report-style `ROUND` to ₹1,000 (used now), or the Input sheet's `ROUNDUP` to ₹10,000?
2. **Replacement cost basis:** main area only, or main + 50 % cantilever (used now)?
3. **Stage weights:** should foundations and lintel really be 0 %?
4. **Sit-out Standard grade:** ₹15,000 (used now) or ₹1,50,000?
5. **Flat Part C** is `#REF!`: is the composite-rate formula in §3 the intended one? What is the source of the GLR used for a flat's book value?
6. **Road-width categories** for GO 168 assumed to be ≤40′, 40–60′, 60–80′, 80–100′, >100′. Correct?
7. Do other banks (SBI, Union…) need different annexure formats or fee slabs?
