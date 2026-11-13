# DSK Valuations — bank property valuation platform

A MERN app that replaces the **`CB Format 2026.xlsm`** valuation workbook. Field evaluators fill the valuation **input sheet** (bank, applicant, property, boundaries, documents, land, building, flat, progress, proposed building). The valuation is calculated live while they type. The approved valuer then reviews and approves it. The web app ships first; the mobile app will reuse the same `shared/` package and REST API.

**Read [docs/INPUT_SHEET_ANALYSIS.md](docs/INPUT_SHEET_ANALYSIS.md) first.** It is the full technical analysis of the workbook: sheet map, formulas, macros, the 18 defects found, security findings, and the open questions for the valuer.

## Structure
```
shared/   @dsk/shared – used by server, web and (later) mobile
  src/catalog.generated.js  master data extracted from the workbook (option texts, amenity rates, stages…)
  src/constants.js          engineering constants: depreciation, GO 168 setbacks, fee slabs, rounding
  src/formSchema.js         declarative input sheet: 15 sections, 190 fields, conditional visibility
  src/calc.js               calculation engine (land, building, flat, progress, setbacks, fee)
  src/validate.js           sanitize + validate (draft vs submit)
  test/                     parity tests against the workbook's own numbers
server/   Express + Mongoose + JWT
client/   React 18 + Vite – schema-driven form renderer
scripts/gen_catalog.py      regenerates the catalog from the workbook
```

## Getting started
```bash
cp server/.env.example server/.env   # set MONGO_URI and JWT_SECRET
npm run install:all
npm run seed      # first admin: admin@bank.local / Admin@123
npm run dev       # API on :5000, web on http://localhost:5173
npm test          # calculation-engine parity tests
```
MongoDB is already installed on this machine as a Windows service, so the default `MONGO_URI` works.

## How the input sheet works
- **Property type × loan category** decide which sections appear and which report template applies: PV, PV_E, PP, PP_E, BV, BP, BP_E, FV or FP (the workbook's report sheets).
- Drafts can be saved half-filled. **Submit** enforces the required fields.
- The server sanitizes every save, validates it, and **recomputes the results with the same engine**. Results sent by a client are ignored.
- To support a new workbook version, update `scripts/gen_catalog.py` / `constants.js`, bump `schemaVersion`, and add parity tests.

## Roles
| Role | Can do |
|---|---|
| evaluator | Request an account (stays **pending** until a superadmin approves it); create and edit own valuations while `draft` or `rejected`; submit; delete own drafts |
| admin (valuer / reviewer) | Everything an evaluator can do, plus see and edit all valuations and approve or reject submitted ones |
| **superadmin** | Everything an admin can do, plus **Team** (add members with a one-time temporary password, approve signups, disable/re-enable, reset passwords, change roles) and **Activity** (live audit feed, team performance report, CSV export) |

`npm run seed` creates the first superadmin (or promotes the existing seed account). Accounts created or reset by a superadmin must set a new password at first sign-in. Disabling an account takes effect immediately, including on tokens that are already signed in.

**Activity log:** sign-ins (including failed ones), registrations, password changes, valuation create/save/submit/approve/reject/delete, file upload/delete and every team change are recorded in `ActivityLog`, with the user, a summary, the valuation reference/applicant/value, IP and device. Superadmin endpoints: `GET /api/activity` (filters `actor`, `action` or an action group such as `valuation`, `from`, `to`, `q`), `GET /api/activity/report`, `GET /api/activity/export.csv`, `GET|POST|PATCH /api/users`, `POST /api/users/:id/reset-password`.

## API
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | Return `{ token, user }` |
| GET | `/api/auth/me` | |
| GET | `/api/valuations/catalog` | Master data (public) |
| POST | `/api/valuations/calculate` | Stateless: `{ data }` → `{ results, errors }` |
| GET | `/api/valuations?q=&status=&template=&page=` | Paginated list |
| GET | `/api/valuations/stats` | Dashboard |
| POST | `/api/valuations` | `{ data, status?: "submitted" }`; 422 returns `errors: [{ field, message }]` |
| GET / PUT / DELETE | `/api/valuations/:id` | |
| PATCH | `/api/valuations/:id/review` | Admin: `{ decision: "approved" \| "rejected", note }` |
| POST | `/api/files` | multipart field `file`: JPG/PNG/WEBP/HEIC/PDF, max 10 MB, content-sniffed → `{ id, name, type, size }` |
| GET | `/api/files/:id` | Owner, admin, or the evaluator of the linked valuation (`?download=1` to save) |
| DELETE | `/api/files/:id` | Only files not yet attached to a saved valuation |

**Document attachments:** each row of *Documents produced* can hold up to 10 scans or photos. The browser downscales large photos before upload, and on phones a Camera button opens the rear camera. Files are stored under `UPLOAD_DIR` (default `server/uploads/`, kept out of git) with random names. When a valuation is saved, the files are linked to it; files removed from the sheet are unlinked; deleting a valuation deletes its files.

## Phase 2
PDF reports per template (with Annexures 22/23, fee receipt, work-done and completion certificates), BOQ estimates, photos/maps/QR, rent capitalization, admin-editable rate masters and firm profile, and the mobile app (Expo) with camera, GPS and offline drafts.
