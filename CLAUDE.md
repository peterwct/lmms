# LHB Member Management System (LHB MMS)

Internal staff web application for Leisure Holidays Bhd — replacing a legacy Informix system.
Manages ~32,387 members, ~33,841 timeshare agreements, and AMC billing.

## Architecture

```
lmms/
├── prisma/                  # Prisma schema, migrations, seed, migration scripts
│   ├── schema.prisma
│   ├── seed.ts              # Departments, permissions, admin user, reference data
│   ├── seed-states.ts       # 39 Malaysian state codes from migrate/state.txt
│   ├── seed-cancellation-reasons.ts  # 46 cancellation codes from migrate/agmt_can_cate.txt
│   ├── migrate-informix.ts  # Full Informix → PostgreSQL migration (run once)
│   ├── migrate-maa-mem.ts   # PBS (Zurich Payback Scheme) migration from maa_mem.txt
│   ├── migrate-amc-schedules.ts  # AMC schedules from amc_mem.txt + ps_amc_mem.txt
│   ├── migrate-amc-price.ts      # LHC AMC price master from amc_price.txt
│   ├── migrate-amc-price-points.ts  # CP points tiers from ps_ctrltab.txt
│   ├── patch-*.ts           # Incremental data patch scripts (run once each)
│   └── migrations/          # Applied migration history
├── refresh-test-db.ps1      # Clears + re-imports all Informix data; use for UAT refreshes and live cutover
├── migrate/                 # Informix UNLOAD export files (not committed)
│   ├── si_ind_mast.txt
│   ├── si_cor_mast.txt
│   ├── si_entitlement.txt
│   ├── maa_mem.txt
│   ├── amc_mem.txt
│   ├── ps_amc_mem.txt
│   ├── amc_price.txt
│   ├── ps_ctrltab.txt
│   ├── agmt_can_cate.txt
│   └── state.txt
├── backend/                 # Node.js + Express + TypeScript API
│   └── src/
│       ├── controllers/     # Business logic (members, agreements, amc/, auth, etc.)
│       ├── routes/          # Express routers
│       ├── middleware/       # auth.ts, permissions.ts
│       └── utils/           # prisma.ts (shared client), audit.ts, jwt.ts
└── frontend/                # React + TypeScript + Tailwind (Vite)
    └── src/
        ├── api/             # Axios API clients (members.ts, agreements.ts, amc.ts, states.ts, etc.)
        ├── components/      # Shared UI (ui/, AgreementStatusBadge, ProductBadge, etc.)
        ├── contexts/        # AuthContext.tsx
        ├── pages/           # admin/, members/, agreements/, amc/
        └── types/           # index.ts — all TypeScript interfaces
```

## Running the project

```powershell
# Backend (port 3001)
npm run backend:dev          # from lmms/ root
# or: cd backend && npx ts-node src/index.ts

# Frontend (port 3000)
npm run frontend:dev         # from lmms/ root
# or: cd frontend && npm run dev

# Prisma
npm run prisma:migrate       # apply schema changes
npm run prisma:seed          # seed reference data
npm run prisma:studio        # browse database
```

## Environment

**Required env vars** (`.env` at project root):
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lhb_mms
NODE_TLS_REJECT_UNAUTHORIZED=0   # corporate proxy — required for Prisma binary downloads
JWT_SECRET=lhb-mms-jwt-secret-key-change-this-in-production-2026
JWT_EXPIRES_IN=8h                # session duration (cookie maxAge auto-matches)
PORT=3001
NODE_ENV=development
BCRYPT_ROUNDS=12
```

**Backend** also reads `FRONTEND_URL` (default: `http://localhost:3000`).

## Corporate proxy quirks

- `NODE_TLS_REJECT_UNAUTHORIZED=0` must be set before running `prisma migrate dev` or `prisma generate`
- `bcryptjs` is used instead of `bcrypt` (native build blocked by proxy SSL)
- `@prisma/client` is in root `package.json`, not `backend/package.json` — backend resolves it from root `node_modules/`

## Prisma 5.22.0 quirks

- **All `create` and `upsert.create` operations require explicit `id` and `updatedAt`** — none of the models use `@default(uuid())` or `@updatedAt`, so Prisma will error with "Argument `updatedAt` is missing" on every create. Always add `id: randomUUID()` (for String `@id` models) and `updatedAt: new Date()` to every create/upsert payload. Also add `updatedAt: new Date()` to every `update` payload so the timestamp stays current. Import `randomUUID` from `'crypto'`.
- Always run migration scripts with `npx ts-node --transpile-only` (not plain `ts-node`) to bypass strict type errors from the generated Prisma client.
- **Relation fields must use camelCase** in `schema.prisma` — e.g. `member Member`, `nominees Nominee[]`, `amcSchedule AmcSchedule?`. PascalCase relation field names (e.g. `Member Member`) cause "Unknown argument" errors at runtime because Prisma enforces exact field-name matching in `include`/`select`/`where` clauses. Relation fields are virtual (no DB column), so fixing the name only requires `npx prisma generate` — no migration needed.

## PowerShell quirks

- PowerShell 5.1 `Out-File -Encoding utf8` writes a UTF-8 BOM, which causes PostgreSQL to reject the file with `syntax error at or near '﻿SELECT'`. Use `[System.IO.File]::WriteAllText($path, $content)` for BOM-free SQL temp files (as done in `refresh-test-db.ps1`).

## Database

- **PostgreSQL** — database `lhb_mms` on `localhost:5432` (user: postgres / pass: postgres)
- **Prisma** schema at `prisma/schema.prisma`
- After every `prisma migrate dev`, restart the backend — Windows locks the Prisma query engine DLL while the server is running, causing an EPERM error on regeneration. The migration still applies; only the DLL replacement fails.
- **Table names are PascalCase** — always use double quotes in raw SQL: `SELECT * FROM "Member"`, `SELECT * FROM "Agreement"`, etc.
- **`lhb_app` permissions must be re-granted after any migration that creates new tables** — PostgreSQL does not automatically grant permissions on newly created tables to existing roles. Two scenarios require this:
  - After `prisma migrate reset` (all tables are dropped and recreated)
  - After `prisma migrate deploy` when the migration adds a new table (e.g. new model in schema)
  ```sql
  GRANT USAGE ON SCHEMA public TO lhb_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lhb_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lhb_app;
  ```
  `refresh-test-db.ps1` and `deploy-test.ps1 -MigrateDb` both run this automatically. If you ever apply a migration manually, run the block above afterwards.

## Test server

- Live at `http://199.1.1.32` (Windows, `E:\Apps\lhb-mms`) — in UAT
- PostgreSQL 18 at `E:\PostgreSQL18`, database `lhb_mms`, user `lhb_app`
- PM2 manages backend (`ecosystem.config.js`), nginx serves frontend + proxies `/api`
- `COOKIE_SECURE=false` required in `ecosystem.config.js` `env_production` — HTTP-only server; without it every login immediately redirects back to login
- Always stop PM2 before any Prisma operations on the test server (Windows DLL lock): `pm2 stop lhb-mms-backend`
- PM2 ecosystem config is at `backend/ecosystem.config.js` (not project root)
- **PM2 runs compiled JavaScript** (`backend/dist/index.js`) — never TypeScript source. Always deploy via `deploy-test.ps1`, which builds locally first. Copying `backend/src` manually to the server has no effect.
- To restart after changes manually on the server: `pm2 delete lhb-mms-backend; pm2 start backend\ecosystem.config.js --env production`

### Deploying to test server

Use `deploy-test.ps1` (project root). It uses **PowerShell Remoting (WinRM)** — Windows-native, no SSH required. Prompts for the Administrator password via a Windows credential dialog each run.

**One-time setup on the TEST SERVER** (via RDP, PowerShell as Administrator):
```powershell
Enable-PSRemoting -Force
New-NetFirewallRule -Name "WinRM-HTTP" -DisplayName "WinRM HTTP" -Enabled True -Direction Inbound -Protocol TCP -LocalPort 5985 -Action Allow
```

**One-time setup on the DEV MACHINE** (PowerShell as Administrator — both lines required):
```powershell
winrm quickconfig -quiet                                                  # starts + configures WinRM service
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "199.1.1.32" -Force  # trusts the test server
```
> `winrm quickconfig` must run first — `Set-Item WSMan:\...` fails with a connection error if the WinRM service is not yet running.

**Deploy commands** (regular PowerShell, not elevated):
```powershell
# Backend controllers/utils changed only (most common)
.\deploy-test.ps1 -SkipFrontend

# prisma/schema.prisma changed (relation renames, field additions — no DB migration)
.\deploy-test.ps1 -SkipFrontend -SchemaChanged

# New Prisma migration added (new files under prisma/migrations/)
.\deploy-test.ps1 -SkipFrontend -SchemaChanged -MigrateDb

# New npm package added to backend/package.json
.\deploy-test.ps1 -SkipFrontend -InstallPackages

# Frontend changed (React/Tailwind — builds locally then copies dist/)
.\deploy-test.ps1

# Preview all steps without executing
.\deploy-test.ps1 -SkipFrontend -SchemaChanged -DryRun
```

**What the script does:**
1. Prompts for Administrator password (Windows credential dialog)
2. Opens a WinRM session to the test server
3. Builds backend TypeScript locally (`npm run build` in `backend/`), copies `backend/dist/` to the test server
4. Copies `prisma/schema.prisma` to the test server
5. (If `-MigrateDb`) copies `prisma/migrations/` to the test server
6. (If `-InstallPackages`) copies `backend/package.json` and runs `npm install --omit=dev` on the server
7. (If not `-SkipFrontend`) builds frontend locally (`npm run build` in `frontend/`), copies `frontend/dist/` to the test server
8. Remote: `pm2 stop` → `npm install` (if `-InstallPackages`) → `prisma migrate deploy` (if `-MigrateDb`) → `prisma generate` (if `-SchemaChanged`) → `pm2 delete` + `pm2 start backend\ecosystem.config.js --env production`

**PowerShell 5.1 script quirks** (already fixed in `deploy-test.ps1`, keep in mind for future edits):
- Non-ASCII characters (`—`, `→`, etc.) in string literals cause parse errors — PowerShell 5.1 reads scripts as Windows-1252 by default; UTF-8 multi-byte sequences for those chars include `0x94` which maps to a smart-quote (`"`) and prematurely closes the string. Use only ASCII in string literals; non-ASCII is safe in comments.
- Do not name a function parameter `$args` — it shadows PowerShell's built-in automatic variable and silently receives `$null` instead of the passed value.
- Do not use `exit` inside a `Invoke-Command` scriptblock — it closes the remote PS session, making all subsequent `Invoke-Command` calls fail with "session state is not Open".
- `Set-Location` in a remote scriptblock changes the PS path but not the native process working directory. Pass absolute paths to native executables (e.g. `pm2 start "$p\backend\ecosystem.config.js"`) instead of relying on `Set-Location`.

### Refreshing test server data

Use `refresh-test-db.ps1` to wipe and reload all Informix data without touching Users, Departments, States, or AMC Rates:

```powershell
# 1. Re-export from Informix (see UNLOAD queries in the script .NOTES header)
#    Copy output files to: E:\Websites\lmms\migrate\

# 2. Set remote DB URL and run
$env:DATABASE_URL = "postgresql://postgres:PASSWORD@199.1.1.32:5432/lhb_mms"
.\refresh-test-db.ps1

# Dry run (parses files, no DB writes)
.\refresh-test-db.ps1 -DryRun
```

The script: truncates Member CASCADE → migrates members/agreements/nominees → runs 4 patches → migrates AMC schedules + PBS schemes → re-grants lhb_app permissions → prints final row counts.

## Authentication

- JWT stored in httpOnly cookie (`token`), expiry = `JWT_EXPIRES_IN` (default 8h)
- Cookie `maxAge` auto-derived from `JWT_EXPIRES_IN` — no mismatch
- Default admin: `admin` / `LHB@Admin2026!`
- `mustChangePwd: true` forces password change on first login
- `req.user` is augmented via `backend/src/types/express.d.ts`
- Login response includes full department permissions so sidebar renders correctly on first login
- Login response also includes `reportAccess: ReportKey[]` — list of report keys the user has been explicitly granted

## Key conventions

### Backend
- Controllers in `backend/src/controllers/` — one file per resource
- Routes in `backend/src/routes/` — thin, just auth middleware + controller wiring
- All routes require `authenticate` + `requirePasswordChanged` + `requirePermission(module, action)`
- **Report routes** use `requireReportAccess(reportKey)` instead of `requirePermission` — see `backend/src/middleware/permissions.ts`
- Zod used for all request body validation; all optional string fields use `.nullish()` to accept null (field clearing)
- `writeAudit()` called on every mutating operation
- Prisma client is a singleton at `backend/src/utils/prisma.ts`
- `accessLevel` field removed — access control is entirely department-permission-based
- **`express-async-errors` is imported in `index.ts`** — patches Express 4 so unhandled errors in `async` route handlers are forwarded to the global error handler instead of hanging the request. Without it, any uncaught async error causes a 504 timeout (nginx never gets a response). Do not remove this import.

### Frontend
- All API calls go through `frontend/src/api/` — never call `fetch`/`axios` directly in components
- All shared TypeScript types in `frontend/src/types/index.ts` — add new fields there when the schema changes
- React Query (`@tanstack/react-query`) for all data fetching and mutations
- Tailwind CSS for all styling — no CSS modules or styled-components
- UI primitives in `frontend/src/components/ui/` (Button, Card, Input, Select, Modal, Badge, Pagination, Spinner)
- **URL search params** (`useSearchParams`) used for list pages so Back button restores results
- All text inputs in MemberForm use `setU()` handler (auto-uppercase)
- `buildPayload()` in MemberForm: empty string → null, dates → ISO, booleans → bool

## Data model summary

### Member
Individual and corporate members share one table, discriminated by `memberType` (INDIVIDUAL | CORPORATE).
Key fields by section:

| Section | Notable fields |
|---|---|
| Identity | `membershipNo` (unique), `branchCode`, `accpacRef` |
| Personal | `icOld`, `icNew`, `dateOfBirth`, `gender`, `race`, `maritalStatus` |
| Contact | `email`, `telHome`, `telMobile`, `faxNo` (corporate) |
| Residential | `resAdd1/2/3`, `resCityState`, `resPostcode`, `resStateCode` |
| Mailing | `mailAdd1/2/3`, `mailCityState`, `mailPostcode`, `mailStateCode` |
| Employment (IND) | `companyName`, `compAdd1/2/3`, `compCityState`, `compPostcode`, `compStateCode`, `telOffice`, `telOffice2`, `faxOffice`, `designation`, `workNature` |
| Spouse (IND) | `spouseName`, `spouseIc` |
| Joint Applicant (IND) | `jaName`, `jaIc`, `jaIcNew`, address, `jaTelHome/Office/Mobile`, `jaEmail`, `jaState` |
| Corporate | `registrationNo`, `incorporationDate`, `businessNature` |
| System | `tinNumber` (LHDN format), `enrolRci`, `activeHcm`, `status`, `remarks` |

> `compStateCode` stored but NOT displayed in address (redundant with `compCityState`).
> `jaState` stores the full state name (not the code).
> MemberForm state dropdowns auto-fill the city/state field with the state description on selection.
> `fullName` and `memberType` are read-only in edit mode.

### Agreement
Sourced from Informix `si_entitlement`. Key fields:

| Field | Notes |
|---|---|
| `agreementNo` | Trimmed from Informix (was padded to 8 chars) |
| `coCode` | `03`=LHC-A, `15`=LHC-B, `02`=CP |
| `entitlementType` | `W`=Week, `P`=Points |
| `acctClassify` | `NA`=Active, `SU`=Suspended, `PT`=Pending Termination, `TM`=Terminated |
| `totalPoints` | Free-form int 50–1000, CP only |
| `termYears` | 30, 33, or 50 |
| `purchasePrice` | Gross selling price from Informix |
| `subFees`, `sinkFund`, `govtTax` | Deducted from `purchasePrice` to get net purchase price |
| `loanType` | `I`=In-House, `L`=Loan, `C`=Contra, `F`=Full Settlement |
| `canCode` | FK → `CancellationReason.code` (46 codes) |

**Net Purchase Price formula:** `purchasePrice − subFees − sinkFund − govtTax`

**acctClassify mapping from Informix:**
- `NA` → NA, `RA` → NA, `CC` → TM, others unchanged

### CancellationReason
46 codes from `agmt_can_cate.txt`. Relation: `Agreement.canCode → CancellationReason.code`.
Category: `CC`=Cancellation, `TM`=Termination. Status: `A`=Active, `U`=Inactive, `N`=Not displayed.

### PbsScheme (Zurich Payback Scheme)
5,009 records from `maa_mem.txt`. 1-to-1 with Agreement (LHC coCode 03/15 only).
Fields: `certNo`, `schemeType` (19K/21K), `paybackDate`, `topUp`, `pbsIndc`, `claimIndc`.

### AmcSchedule
32,583 records from `amc_mem.txt` (LHC) + `ps_amc_mem.txt` (CP).
Key fields: `invoicesIssued`, `totalInvoices`, `nextDueDate`, `lastInvoiceDate`, `billingStatus` (N/C), `priceCode`.

### AmcPrice (LHC Rate Master)
Fields: `coCode`, `effectiveDate`, `priceCode`, `currencyCode`, `amcAmount`, `sinkingFund`, `serviceTax`, `totalAmount`, `amountInWords`, `rate`, `isActive`.
Unique: `[coCode, priceCode, effectiveDate]`.

### AmcPricePoints (CP Points Tiers)
Fields: `coCode` (always "02"), `effectiveDate`, `minPoints`, `maxPoints`, `amcRatePerPoint`, `sinkingFundPct`, `gstPct`, `unitPrice`, `rciPoints`, `isActive`.
Unique: `[coCode, minPoints, maxPoints, effectiveDate]`.

### UserReportAccess
Per-user report grants. Fields: `userId` (FK → User), `reportKey` (ReportKey enum), `grantedById` (FK → User), `grantedAt`, `updatedAt`.
Unique on `[userId, reportKey]`. IT users bypass this table entirely — checked via `requireReportAccess` middleware.

### State
39 records from `state.txt`. Fields: `code` (PK, 2-digit), `name`. Served via `GET /api/states`.

## Informix migration

Source tables and their column counts (verified from actual export files):

| File | Table | Tokens/row | Key fields |
|---|---|---|---|
| `si_ind_mast.txt` | Individual members | 67 | [61] compCityState, [62] compPostcode, [63] compStateCode, [64] telOffice2, [65] faxOffice |
| `si_cor_mast.txt` | Corporate members | 29 | faxNo at [22] |
| `si_entitlement.txt` | Agreements + nominees | 63 (fresh export) | nom1: c[25..36] (12 fields, no icOld/icNew); nom2: c[37..51] (15 fields, base=37); rciRefNo=c[52]; canCode=c[59]; legacyCreatedAt=c[60]; legacyModifiedAt=c[61] |
| `maa_mem.txt` | PBS schemes | pipe-delimited | coCode[0], agmt_no[1], certNo[3], schemeType[4], paybackDate[5] (dd-mm-yyyy), topUp[6], pbsIndc[11], claimIndc[12] |
| `amc_mem.txt` | LHC AMC schedules | 11 cols pipe-delimited | mem_no[0], agmt_no[1], cocode[2], first_due[3], next_due[4], last_invdate[5], no_of_inv[6], ttl_inv[7], price_code[8] |
| `ps_amc_mem.txt` | CP AMC schedules | 10 cols pipe-delimited | same pattern, no price_code |
| `amc_price.txt` | LHC AMC price master | pipe-delimited | coCode[0], effectiveDate[1], priceCode[2], currencyCode[3], amcAmount[4], sinkFund[5], serviceTax[6], totalAmount[7], amountInWords[9], rate[10] |
| `ps_ctrltab.txt` | CP points tiers | pipe-delimited | coCode[0], effectiveDate[1], minPoints[2], maxPoints[3], unitPrice[6], amcRatePerPoint[7], sinkingFundPct[8], gstPct[9], rciPoints[12] |

Informix date format is `dd-mm-yyyy` — the `d()` helper in migration scripts handles this.

## API reference

Full endpoint listing at `http://localhost:3001` (rendered HTML page).
Health check: `GET /api/health`

Key endpoints:
```
POST /api/auth/login                        Login → JWT cookie
GET  /api/states                            List all state codes
GET  /api/members?search=&memberType=&...   Search members
GET  /api/members/:id                       Member + agreements + nominees
PUT  /api/members/:id                       Update member
GET  /api/agreements?q=&coCode=&...         List/search agreements
GET  /api/agreements/:id                    Agreement detail + AMC + PBS + invoices
GET  /api/amc/schedules?q=&coCode=&...      AMC billing schedules (search supported)
POST /api/amc/invoices/generate             Generate AMC invoices
POST /api/amc/dayend/generate               Generate SQL Account day-end file
GET  /api/amc/rates/lhc                     LHC rate master
POST /api/amc/rates/lhc                     Add LHC rate
PUT  /api/amc/rates/lhc/:id                 Edit LHC rate
PATCH /api/amc/rates/lhc/:id/toggle         Activate/deactivate LHC rate
DELETE /api/amc/rates/lhc/:id              Delete LHC rate
GET  /api/amc/rates/cp                      CP points tiers
POST /api/amc/rates/cp                      Add CP tier
PUT  /api/amc/rates/cp/:id                  Edit CP tier
PATCH /api/amc/rates/cp/:id/toggle          Activate/deactivate CP tier
DELETE /api/amc/rates/cp/:id               Delete CP tier
GET  /api/reports/members/preview           Member report preview (requireReportAccess)
GET  /api/reports/members                   Generate member report PDF/Excel (requireReportAccess)
GET  /api/reports/agreements/preview        Agreement report preview (requireReportAccess)
GET  /api/reports/agreements                Generate agreement report PDF/Excel (requireReportAccess)
GET  /api/reports/access/:userId            Get user's report access list (IT only)
POST /api/reports/access/:userId/:reportKey Grant report access (IT only)
DELETE /api/reports/access/:userId/:reportKey Revoke report access (IT only)
```

## Modules

| Module | Status | Pages / Notes |
|---|---|---|
| Admin — Users | ✅ Done | Users, UserDetail, UserForm. No accessLevel field (removed). |
| Admin — Departments | ✅ Done | Departments, permissions matrix |
| Admin — Audit Log | ✅ Done | AuditLog (IT only) |
| Members | ✅ Done | Member Enquiry (search+sort, URL state), MemberDetail, MemberForm |
| Agreements | ✅ Done | Agreements list (search+sort, URL state, defaults LHC-03/Active), AgreementDetail |
| AMC Billing — Schedules | ✅ Done | Schedules (search+sort, URL state, defaults LHC-03/Active) |
| AMC Billing — Invoices | ✅ Done | Invoices, InvoiceDetail |
| AMC Billing — Rates | ✅ Done | LHC + CP rates with Add/Edit/Deactivate/Delete; auto-calc total + amount-in-words |
| AMC Billing — Day-End | ✅ Done | DayEnd file generation |
| Reports | ✅ Done | Per-user access control; IT grants via UserDetail; sidebar shows single "Reports" link → card grid at `/reports` |

## Navigation / permissions

- Sidebar shows only modules where the department's **View** permission is ticked
- IT department (`isLocked=true`) bypasses all permission checks
- Access control is entirely department-based (`DeptModulePermission` table)
- Login response includes full department permissions (sidebar renders correctly immediately on login)

### Report access (per-user)

Reports use a separate per-user access model — independent of department permissions.

- **`UserReportAccess`** table: `userId`, `reportKey` (enum), `grantedById`, `grantedAt`. Unique on `[userId, reportKey]`.
- **`ReportKey` enum**: `MEMBER_REPORT`, `AGREEMENT_REPORT` — add new values here when adding reports.
- IT department bypasses all report access checks (same as module permissions).
- IT grants/revokes access via the "Report Access" card on the User Detail page (`/admin/users/:id`).
- Sidebar shows a single **Reports** link only when `hasReport()` returns true for at least one key. Clicking it goes to `/reports`, which renders a card grid of accessible reports.
- Clone user copies report access records to the new user automatically.
- `hasReport(key)` helper in `AuthContext` — `isIT || user.reportAccess.includes(key)`.

**Adding a new report — checklist:**
1. Add the new key to `ReportKey` enum in `prisma/schema.prisma` → `npx prisma migrate dev`
2. Add to `ALL_REPORT_KEYS` + `REPORT_LABELS` in `backend/src/controllers/reports/access.controller.ts`
3. Add route in `backend/src/routes/reports.ts` with `requireReportAccess('NEW_KEY')`
4. Add a `ReportCard` entry to `REPORT_CARDS` in `frontend/src/pages/reports/Reports.tsx`
5. Add `hasReport('NEW_KEY')` to the OR condition in the `reportItems` block in `frontend/src/components/Sidebar.tsx`

## Agreement Detail card order
1. Agreement Details (net purchase price, loan type/amount, termination reason)
2. Nominees (with designation)
3. Annual Maintenance Charges (AMC Billed, Total AMC, AMC Next Due)
4. Zurich Payback Scheme (if exists — cert no, scheme type, payback date, claimed badge)
5. Invoice History
