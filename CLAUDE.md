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
│   ├── seed-su-reasons.ts   # 28 suspension reason codes from migrate/su_mast.txt
│   ├── migrate-informix.ts  # Full Informix → PostgreSQL migration (run once)
│   ├── migrate-maa-mem.ts   # PBS (Zurich Payback Scheme) migration from maa_mem.txt
│   ├── migrate-maa-claim.ts # PBS Claims migration from maa_claim.txt
│   ├── migrate-amc-schedules.ts  # AMC schedules from amc_mem.txt + ps_amc_mem.txt
│   ├── migrate-amc-price.ts      # LHC AMC price master from amc_price.txt
│   ├── migrate-amc-price-points.ts  # CP points tiers from ps_ctrltab.txt
│   ├── migrate-rci-enrol.ts # RCI enrollment data from rci_enrol.txt (updates Agreement.rciRefNo/rciNominee/rciEnrolDate/rciExpiryDate)
│   ├── migrate-salesperson.ts  # Salesperson master from csp_mast.txt
│   ├── migrate-su-pt-reasons.ts  # SU/PT reason backfill from su_trans.txt + pt_trans.txt
│   ├── migrate-booking-entitlement.ts  # Booking entitlement nights used from booking_ent1.txt (LHC 03/15)
│   └── migrations/          # Applied migration history
├── refresh-test-db.ps1      # Clears + re-imports all Informix data; use for UAT refreshes and live cutover
├── migrate-table.ps1        # Migrate a single table without full refresh (Member, PbsScheme, PbsClaim, AmcSchedule, RciEnrol, SuPtReason)
├── migrate/                 # Informix UNLOAD export files (not committed)
│   ├── si_ind_mast.txt
│   ├── si_cor_mast.txt
│   ├── si_entitlement.txt
│   ├── maa_mem.txt
│   ├── maa_claim.txt
│   ├── amc_mem.txt
│   ├── ps_amc_mem.txt
│   ├── amc_price.txt
│   ├── ps_ctrltab.txt
│   ├── rci_enrol.txt
│   ├── csp_mast.txt
│   ├── agmt_can_cate.txt
│   ├── su_mast.txt
│   ├── su_trans.txt
│   ├── pt_trans.txt
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
        ├── pages/           # admin/, members/, agreements/, amc/, pbs/
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

**Root `.env` loading:** [backend/src/index.ts](backend/src/index.ts) loads the project-root `.env` explicitly via `dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true })` — **not** `import 'dotenv/config'`. This is deliberate: the backend starts with its cwd in `backend/` (`npm run backend:dev` → `npm --prefix backend run dev`, and the `cd backend && npx ts-node src/index.ts` alt), and plain `dotenv/config` only looks in the cwd — so the root `.env` was silently never read, and the backend instead used whatever stale `DATABASE_URL` sat in the launching terminal (e.g. a `$env:DATABASE_URL` set for a migrate/refresh script). `override: true` makes the file authoritative so a stale shell var can't hijack the backend. Editing the root `.env` and restarting the backend is now the single source of truth for which DB it hits.
- Doesn't affect `refresh-test-db.ps1` / `migrate-table.ps1` — those run as separate `ts-node` processes and intentionally use `$env:DATABASE_URL`.
- Doesn't affect the test server — PM2 gets env from `ecosystem.config.js` `env_production` and no root `.env` is deployed there, so `dotenv.config` silently no-ops (missing file = nothing loaded/overridden).

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

Use `deploy-test.ps1` (project root). It uses **PowerShell Remoting (WinRM)** — Windows-native, no SSH required. Prompts for the Administrator password via a Windows credential dialog each run, and (with `-MigrateDb`) also prompts for the `postgres` superuser password via `Read-Host` for the lhb_app GRANT step. Both prompts are interactive — run this directly in the user's own PowerShell window, not through a non-interactive/automated shell (e.g. Claude Code's Bash/PowerShell tools), which will hang on `Read-Host`/`Get-Credential`.

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

> **Forgetting `-SchemaChanged` after adding a Prisma field → runtime 500 on the server.** If you add a
> field to `schema.prisma` (e.g. `BookingEntitlement.actualNights`) and deploy **without** `-SchemaChanged`,
> the server keeps its old Prisma client while the new backend code `select`s the new field. Every request
> hitting that query returns **500** with `PrismaClientValidationError: Unknown field '<name>'` — even
> though the DB column exists. Confirmed on the Entitlement Balance card work (2026-07-09): the fix is to
> redeploy with `-SchemaChanged` (runs `prisma generate` on the server after `pm2 stop`). `-MigrateDb` is
> only needed additionally when a new migration file must be applied to the server DB. Check
> `pm2 logs lhb-mms-backend --err --lines 30 --nostream` on the server to spot the `Unknown field` error.

**What the script does:**
1. Prompts for Administrator password (Windows credential dialog), and (if `-MigrateDb`) the `postgres` superuser password (`Read-Host`)
2. Opens a WinRM session to the test server
3. Builds backend TypeScript locally (`npm run build` in `backend/`), copies `backend/dist/` to the test server
4. Copies `prisma/schema.prisma` to the test server
5. (If `-MigrateDb`) copies `prisma/migrations/` to the test server
6. (If `-InstallPackages`) copies `backend/package.json` and runs `npm install --omit=dev` on the server
7. (If not `-SkipFrontend`) builds frontend locally (`npm run build` in `frontend/`), copies `frontend/dist/` to the test server
8. Remote: `pm2 stop` → `npm install` (if `-InstallPackages`) → `prisma migrate deploy` (if `-MigrateDb`) → `prisma generate` (if `-SchemaChanged`) → `pm2 delete` + `pm2 start backend\ecosystem.config.js --env production`

> **`prisma migrate deploy` runs as the `postgres` superuser, not `lhb_app`.** Step 6a sets `$env:DATABASE_URL` to a `postgresql://postgres:...@localhost:5432/lhb_mms` URL (password from the same `Read-Host` prompt used for the GRANT step) before calling `migrate deploy`. This is required because `lhb_app` has only DML grants (no `CREATE`, and isn't the table owner), so any migration doing `CREATE TABLE` / adding a FK to a postgres-owned table / `ALTER`ing an existing table fails with `permission denied for schema public` (SQLSTATE 42501). If a migrate deploy ever fails mid-way it is recorded as failed and blocks future deploys (P3009) — clear it with `prisma migrate resolve --rolled-back <migration_name>` (run as postgres) before retrying.

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

The script: truncates BookingEntitlement + CpBookingEntitlement + PbsClaim + PbsScheme + Salesperson + Member CASCADE → migrates members/agreements/nominees → migrates AMC schedules + PBS schemes + PBS claims + RCI enrollment → salespersons → booking entitlements (LHC `booking_ent1.txt` + CP `ps_bookent1.txt`) → re-grants lhb_app permissions → prints final row counts.

### Migrating a single table

Use `migrate-table.ps1` to re-import a single table without a full refresh:

```powershell
.\migrate-table.ps1 -Table Member                     # Full member+agreement reimport (truncates all)
.\migrate-table.ps1 -Table IndividualMember            # si_ind_mast.txt only (inserts new, keeps existing)
.\migrate-table.ps1 -Table CorporateMember             # si_cor_mast.txt only (inserts new, keeps existing)
.\migrate-table.ps1 -Table Agreement                   # si_entitlement.txt only (truncates agreements+nominees+AMC+PBS)
.\migrate-table.ps1 -Table AmcSchedule                 # AMC schedules
.\migrate-table.ps1 -Table PbsScheme                   # PBS schemes (also truncates PbsClaim)
.\migrate-table.ps1 -Table PbsClaim                    # Just PBS claims
.\migrate-table.ps1 -Table RciEnrol                    # RCI enrollment (updates rciRefNo/rciNominee/dates on Agreement)
.\migrate-table.ps1 -Table SuPtReason                  # SU/PT reason backfill (suCode + canCode overwrite)
.\migrate-table.ps1 -Table Salesperson                 # Salesperson master
.\migrate-table.ps1 -Table BookingEntitlement          # Booking entitlement nights used (LHC 03/15; truncates + reimports)
.\migrate-table.ps1 -Table CpBookingEntitlement        # CP point balances per year (CP 02; truncates + reimports)
.\migrate-table.ps1 -Table PbsClaim -DryRun            # Preview without writing
```

**Note:** After `-Table Agreement`, you must re-import dependent tables: `AmcSchedule`, `PbsScheme`, `PbsClaim`, `RciEnrol`, `BookingEntitlement`.

## Authentication

- JWT stored in httpOnly cookie (`token`), expiry = `JWT_EXPIRES_IN` (default 8h)
- Cookie `maxAge` auto-derived from `JWT_EXPIRES_IN` — no mismatch
- Default admin: `admin` / `LHB@Admin2026!`
- `mustChangePwd: true` forces password change on first login
- `req.user` is augmented via `backend/src/types/express.d.ts`
- Login response includes full department permissions so sidebar renders correctly on first login
- Login response also includes `reportAccess: ReportKey[]` — list of report keys the user has been explicitly granted
- **Single-session enforcement:** `sessionToken String?` on User model. A UUID is generated on each login, stored in DB and embedded in the JWT. Auth middleware compares the two on every request — mismatch returns 401 "Session ended." Login returns `409 SESSION_ACTIVE` if `user.sessionToken` is non-null and `force` is not true in the request body. Frontend shows a confirmation modal; user clicks "Yes" to re-POST with `force: true`. Logout requires `authenticate` middleware and clears `sessionToken` to null in DB.

## Key conventions

### Backend
- Controllers in `backend/src/controllers/` — one file per resource
- Routes in `backend/src/routes/` — thin, just auth middleware + controller wiring
- All routes require `authenticate` + `requirePasswordChanged` + `requirePermission(module, action)`
- **Report routes** use `requireReportAccess(reportKey)` instead of `requirePermission` — see `backend/src/middleware/permissions.ts`
- **Department-name guards** (also in `permissions.ts`) enforce fine-grained rules the 4-boolean matrix can't express: `requireITorFinance`, `requireITorCredit`, `requireITorMemberServices`. These match on `req.user.department.name` (with the usual `isLocked` IT bypass) and are used where a specific department — not just "any editor" — is required. See "Department-specific action rules" under Navigation / permissions.
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
| `rciRefNo` | RCI ID — populated from `rci_enrol.txt` (not si_entitlement) |
| `rciNominee` | Salutation + name from `rci_enrol.txt` (joined with si_entitlement) |
| `rciEnrolDate` | RCI joint/activation date — populated from `rci_enrol.txt` `re_act_date` |
| `rciExpiryDate` | RCI expiry date — populated from `rci_enrol.txt` `re_expiry_date` |
| `salespersonCode` | Salesperson code from `e_cse_code` — looked up in `Salesperson.code` |
| `canCode` | FK → `CancellationReason.code` (46 codes) — used for PT and TM; SU uses `suCode` instead |
| `suCode` | FK → `SuReason.code` (28 codes) — only meaningful when `acctClassify='SU'` |

**Net Purchase Price formula:** `purchasePrice − subFees − sinkFund − govtTax`

**acctClassify mapping from Informix:**
- `NA` → NA, `RA` → NA, `CC` → TM, others unchanged

### CancellationReason
46 codes from `agmt_can_cate.txt`. Relation: `Agreement.canCode → CancellationReason.code`.
Category: `CC`=Cancellation, `TM`=Termination. Status: `A`=Active, `U`=Inactive, `N`=Not displayed.
Used for `PT` and `TM` agreements (`canCode` backfilled for PT from `pt_trans.txt` — see "Informix migration" below).
Only `status='A'` codes (15 of 46) are offered in the "Change Status" reason picker — the active set is authoritative in `prisma/seed-cancellation-reasons.ts` (`ACTIVE_CODES`), not the status column of `agmt_can_cate.txt`. See "Change Agreement Status" below.

### SuReason
28 codes from `su_mast.txt`. Relation: `Agreement.suCode → SuReason.code`. Distinct code space from
`CancellationReason` (2-letter codes e.g. `SA`, `SB` vs. numeric `01`-`46`) — used only for `SU`
(Suspended) agreements. `pt_mast.txt` (a similarly-shaped file) was investigated but found unused:
its codes don't match what `pt_trans.txt` actually references (see "Informix migration" below).

### PbsScheme (Zurich Payback Scheme)
5,009 records from `maa_mem.txt`. 1-to-1 with Agreement (LHC coCode 03/15 only).
Fields: `certNo`, `schemeType` (19K/21K), `paybackDate`, `topUp`, `pbsIndc`, `claimIndc`, `remark`.

### PbsClaim (PBS Claims)
Claims linked to PbsScheme (1-to-many). Source: `maa_claim.txt`.
Fields: `refNo` (sequential int), `claimant`, `claimantIc`, `accNo`, `bankCode`, `relationCode`, `remark`, `lossDate`, `claimAmt` (Decimal 12,2), `payMode`, `docNo`, `docDate`, `claimType`, `claimRemark`, `trustPaidDate`.

**Claim type codes:** `AD`=Accidental Death, `TPD`=Total Permanent Disability, `ND`=Natural Death, `PBS`=Group Payback Scheme Rider.
**Relation codes:** `00`=Self, `01`=Spouse, `02`=Children, `03`=Siblings, `99`=Others.
**Pay modes:** `CSH`=Cash, `CHQ`=Cheque, `CC`=Credit Card, `ONLINE`=Online Transfer.

**Business rules:**
- Add claim button shows only when `pbsIndc=Y` AND `claimIndc=N`
- Creating a claim with type AD/TPD/PBS sets `PbsScheme.claimIndc=Y`; ND does not
- Deleting a claim with type AD/TPD/PBS resets `PbsScheme.claimIndc=N`
- Claim amount for AD/TPD/PBS is fixed by scheme type: 19K=19,000, 21K=21,000 (read-only); ND defaults to 500 (editable)
- `claimRemark` is auto-populated from claim type description (read-only)

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

### Salesperson
Reference table from `csp_mast.txt`. Fields: `code` (unique), `name`, `branch`, `status`.

### BookingEntitlement
Normalized redesign of the wide Informix `booking_ent1` table (which had one column per agreement
year). 177,164 rows from `booking_ent1.txt` — one row per (agreement, `yearSeq`) where usage is
non-zero. Fields: `agreementId` (FK), `coCode`, `agreementNo`, `membershipNo`, `yearSeq` (1 = agreement's
first year = `agreementDate` year), `nightsUsed` (`be_yearN`), `actualNights` (`be_act_nightN`),
`weekendUsed` (`be_wkN`).
Unique: `[coCode, agreementNo, membershipNo, yearSeq]`. **LHC 03/15 only** (02/12 rows in the source are skipped).
Each agreement year is entitled to **7 nights** (of which ≤1 may be a weekend night — weekend is
*included in*, not added to, the 7). `nightsUsed` is the entitlement drawn from that year's own 7-night
bucket; `actualNights` (`be_act_night`, migrated since the full-`cal_ent` card work) is every night
physically taken in that year window and may exceed 7 by borrowing accrued/advance nights — it feeds the
**Usable Nights** and **Used** columns. Balances (computed in `getAgreement`, natural-key matched, clamped ≥0):
`nights = 7 − nightsUsed`, `weekend = 1 − weekendUsed`. See the Entitlement Balance card in Agreement Detail.

### CpBookingEntitlement
CP (coCode `02`) point-based entitlement, one row per (agreement, membership year). 279,062 rows
from `ps_bookent1.txt`. **Stores the balance points directly** (`balPts` = `psb_balpts`) per
anniversary-dated year — unlike `BookingEntitlement` which stores nights *used*, so the CP card is
a lookup, not a subtraction. Fields: `coCode` (always `02`), `membershipNo` (e.g. `M00020/I`),
`agreementNo` (e.g. `P00020`), `useYear` (**DateTime** — the anniversary date of the membership year),
`totalPts`, `curUsePts`, `advUsePts`, `acrusePts`, `balPts`. Unique: `[coCode, membershipNo, agreementNo, useYear]`.
`agreementId` is nullable and **left null** — the read path matches by natural key
(`coCode + membershipNo + agreementNo`), not the FK. **CP 02 only.**

Balance logic (`getAgreement`, ported from the Informix SP `get_entitlement_balance_CP`): `ref` = the
row with the greatest `useYear ≤ today` (the current membership year); **Curr** = `ref.balPts`, **Accrued** =
prior year's `balPts` **capped** so `prior.acrusePts + accrued ≤ floor(ref.totalPts / 2)` (max accrue =
half the annual entitlement; unused points forfeited after the next anniversary), **Adv1..5** = `balPts`
of `refYear + 1..5` (**null → blank** when no source row exists, e.g. past expiry). Header years:
Acc = `refYear − 1`, Curr = `refYear`, Ad1..Ad5 = `refYear + 1..5`. Returned as
`cpEntitlementBalance: { label, year, bal: number|null }[]`. Card hidden for CP `TM` and when no `ref`
row exists. See the CP Entitlement Balance card in Agreement Detail.

### State
39 records from `state.txt`. Fields: `code` (PK, 2-digit), `name`. Served via `GET /api/states`.

## Informix migration

Source tables and their column counts (verified from actual export files):

| File | Table | Tokens/row | Key fields |
|---|---|---|---|
| `si_ind_mast.txt` | Individual members | 67 | [61] compCityState, [62] compPostcode, [63] compStateCode, [64] telOffice2, [65] faxOffice |
| `si_cor_mast.txt` | Corporate members | 29 | faxNo at [22] |
| `si_entitlement.txt` | Agreements + nominees | 76 (fresh export) | nom1: c[25..38] (14 fields, incl icOld/icNew); nom2: c[39..53] (15 fields, base=39); nom3: c[70..73] (4 fields: name/salut/desig/nameCard); e_cse_code=c[74] (salesperson); rciRefNo=c[54]; canCode=c[61]; legacyCreatedAt=c[62]; legacyModifiedAt=c[63] |
| `maa_mem.txt` | PBS schemes | pipe-delimited | coCode[0], agmt_no[1], certNo[3], schemeType[4], paybackDate[5] (dd-mm-yyyy), topUp[6], pbsIndc[11], claimIndc[12], remark[13] |
| `maa_claim.txt` | PBS claims | pipe-delimited | agmt_no[0], cert_no[1], ref_no[2], claimant[3], claimant_ic[4], acc_no[5], bank_code[6], relation_code[7], remark[8], loss_date[9], claim_amt[10], pay_mode[11], doc_no[12], doc_date[13], claim_type[14], claim_remark[15], trust_paid_date[16] |
| `amc_mem.txt` | LHC AMC schedules | 11 cols pipe-delimited | mem_no[0], agmt_no[1], cocode[2], first_due[3], next_due[4], last_invdate[5], no_of_inv[6], ttl_inv[7], price_code[8] |
| `ps_amc_mem.txt` | CP AMC schedules | 10 cols pipe-delimited | same pattern, no price_code |
| `amc_price.txt` | LHC AMC price master | pipe-delimited | coCode[0], effectiveDate[1], priceCode[2], currencyCode[3], amcAmount[4], sinkFund[5], serviceTax[6], totalAmount[7], amountInWords[9], rate[10] |
| `ps_ctrltab.txt` | CP points tiers | pipe-delimited | coCode[0], effectiveDate[1], minPoints[2], maxPoints[3], unitPrice[6], amcRatePerPoint[7], sinkingFundPct[8], gstPct[9], rciPoints[12] |
| `rci_enrol.txt` | RCI enrollment | 30 cols pipe-delimited | re_cocode[0], re_membership_no[1], re_agreement_no[2], re_rci_no[3], re_act_date[4], re_expiry_date[5], e_rci_salutation[27], e_rci_name[28]. Joined with si_entitlement for salutation/name. Updates existing Agreement records (no separate table). |
| `csp_mast.txt` | Salesperson master | 4 cols pipe-delimited | csp_code[0], csp_name[1], csp_branch[2], csp_status[3] |
| `su_mast.txt` | SuReason master | 3 cols pipe-delimited | code[0], description[1] |
| `su_trans.txt` / `pt_trans.txt` | SU/PT reason backfill | 4 cols pipe-delimited | membershipNo[0], agreementNo[1], code[2]. `su_trans.txt` → `Agreement.suCode` (only if current `acctClassify=SU`); `pt_trans.txt` → `Agreement.canCode` (only if current `acctClassify=PT`, **overwrites** any existing value — pt_trans.txt is authoritative). Match key: `membershipNo + agreementNo` (NOT `agreementNo` alone — see "FK vs natural key" below, agreementNo is duplicated across TT/TF transfer pairs). Updates existing Agreement records (no separate trans table), same pattern as `rci_enrol.txt`. `pt_mast.txt` is **not used** — every code in `pt_trans.txt` (numeric, 08-45) already exists in `CancellationReason`, while `pt_mast.txt`'s own numbering (00-17) is a stale/superseded lookup the live data doesn't reference. |

| `booking_ent1.txt` | Booking entitlement (nights used) | 207 fields pipe-delimited | coCode[0], **membershipNo[1]** (long string e.g. `00002-KL-Y-0001/M/I`), **agreementNo[2]** (short e.g. `00457`) — note the natural-key columns are ordered membershipNo-then-agreementNo, the reverse of intuition. be_year1..50 = c[3..52] (nights used → `nightsUsed`), be_act_night1..50 = c[53..102] (actual nights taken → `actualNights`), be_wk1..50 = c[153..202] (weekend used → `weekendUsed`). Block 3 (c[103..152]) and trailer (c[203..205]) are other categories, ignored. Only coCode 03/15 imported → `BookingEntitlement` (one row per year where any of nights/actual/weekend is non-zero). See `prisma/migrate-booking-entitlement.ts`. |

| `ps_bookent1.txt` | CP booking entitlement (point balances) | 9 cols + trailer, pipe-delimited | psb_cocode[0] (always `02`), psb_memno[1] (e.g. `M00020/I`), psb_agmtno[2] (e.g. `P00020`), psb_useyear[3] (`dd-mm-yyyy` anniversary date), psb_totalpts[4], psb_curusepts[5], psb_advusepts[6], psb_acrusepts[7], **psb_balpts[8]** (balance points — the value the CP card displays). **All rows** imported (a fully-unused future year `balPts` and terminal 0-balance rows are both meaningful) → `CpBookingEntitlement`. `agreementId` left null (natural-key read path). Schema verified in `ps_bookent1.sql`. See `prisma/migrate-cp-booking-entitlement.ts`. |

Informix date format is `dd-mm-yyyy` — the `d()` helper in migration scripts handles this.

### FK vs natural key — transferred agreement pitfall

Transferred agreements share the same `agreementNo + coCode` across two members (the original TT record and the new TF record). The Prisma FK (`agreementId`) on AmcSchedule/PbsScheme can point to the **wrong** Agreement — typically the old terminated one instead of the current active holder. This affects ~68 records.

**Query direction rules:**
- **Agreement -> Member** (`memberId` FK) — always safe, each agreement has one member
- **AmcSchedule/PbsScheme -> Agreement** (`agreementId` FK) — **unsafe**, use natural key instead

**How to query safely from AmcSchedule:**
- Match by `coCode + agreementNo + membershipNo` (all 3 fields exist on AmcSchedule)
- Example: `prisma.amcSchedule.findFirst({ where: { coCode, agreementNo, membershipNo } })`

**How to query safely from PbsScheme:**
- PbsScheme has no `membershipNo` — match by `coCode + agreementNo` and filter `transferFlag IS DISTINCT FROM 'TT'` on the Agreement side
- Raw SQL: `JOIN "Agreement" a ON a."agreementNo" = p."agreementNo" AND a."coCode" = p."coCode" AND a."transferFlag" IS DISTINCT FROM 'TT'`

**When migrating new Informix tables:**
1. Always store `membershipNo`, `agreementNo`, and `coCode` directly on the new table if the source has them — `membershipNo` is the disambiguator for transfers
2. Set the `agreementId` FK by matching all 3 fields (`membershipNo + agreementNo + coCode`), not just `agreementNo + coCode`
3. If the source lacks `membershipNo`, document that FK is unreliable and use `coCode + agreementNo + NOT TT` in queries

**When writing new features or reports:**
- Any code starting from AmcSchedule or PbsScheme that needs Agreement/Member data must use natural key, not FK `include`
- The FK `include` is fine for Prisma convenience (e.g. cascade delete) but not for data accuracy on transferred records

## API reference

Full endpoint listing at `http://localhost:3001` (rendered HTML page).
Health check: `GET /api/health`

Key endpoints:
```
POST /api/auth/login                        Login → JWT cookie
GET  /api/states                            List all state codes
GET  /api/cancellation-reasons              Active (status='A') CancellationReason codes — for PT/TM reason picker
GET  /api/su-reasons                        All SuReason codes — for SU reason picker
GET  /api/members?search=&memberType=&...   Search members
GET  /api/members/enquiry?...               Member Enquiry search (same params as /api/agreements; uses MEMBERS permission)
GET  /api/members/:id                       Member + agreements + nominees
PUT  /api/members/:id                       Update member
GET  /api/agreements?q=&coCode=&...         List/search agreements
GET  /api/agreements/:id                    Agreement detail + AMC + PBS + invoices
PATCH /api/agreements/:id/status            Change acctClassify + reason code (suCode/canCode); see "Change Agreement Status" below
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
GET  /api/reports/members/preview                   Member report preview (requireReportAccess)
GET  /api/reports/members                           Generate member report PDF/Excel (requireReportAccess)
GET  /api/reports/agreements/preview                Agreement report preview (requireReportAccess)
GET  /api/reports/agreements                        Generate agreement report PDF/Excel (requireReportAccess)
GET  /api/reports/expiry/preview                    Expiry analysis preview (requireReportAccess)
GET  /api/reports/expiry                            Generate expiry analysis PDF/Excel (requireReportAccess)
GET  /api/reports/expiring-members/preview          List of expiring members preview (requireReportAccess)
GET  /api/reports/expiring-members                  Generate expiring members PDF/Excel (requireReportAccess)
GET  /api/reports/remaining-value/preview           Remaining value preview (requireReportAccess)
GET  /api/reports/remaining-value                   Generate remaining value Excel (requireReportAccess)
GET  /api/reports/expiry-summary/preview            Expiry summary by years preview (requireReportAccess)
GET  /api/reports/expiry-summary                    Generate expiry summary PDF/Excel (requireReportAccess)
GET  /api/reports/access/:userId                    Get user's report access list (IT only)
POST /api/reports/access/:userId/:reportKey         Grant report access (IT only)
DELETE /api/reports/access/:userId/:reportKey       Revoke report access (IT only)
GET  /api/pbs?q=&coCode=&acctClassify=&schemeType=&claimIndc=  PBS scheme list (search+filters)
GET  /api/pbs/:id                                  PBS scheme detail + claims
PUT  /api/pbs/:id                                  Update PBS scheme (certNo, schemeType, remark)
POST /api/pbs/:id/claims                           Create claim (auto-sets claimIndc for AD/TPD/PBS)
PUT  /api/pbs/:id/claims/:claimId                  Update claim
DELETE /api/pbs/:id/claims/:claimId                Delete claim (resets claimIndc for AD/TPD/PBS)
GET  /api/pbs/reports/pay-by-month/preview         PBS Pay By Month/Year preview (requireReportAccess)
GET  /api/pbs/reports/pay-by-month                 Generate PBS Pay By Month/Year Excel (requireReportAccess)
GET  /api/pbs/reports/claim/preview                PBS Claim Report preview (requireReportAccess)
GET  /api/pbs/reports/claim                        Generate PBS Claim Report Excel (requireReportAccess)
GET  /api/pbs/reports/not-in-pbs/preview           Not In PBS Report preview (requireReportAccess)
GET  /api/pbs/reports/not-in-pbs                   Generate Not In PBS Report text file (requireReportAccess)
GET  /api/pbs/reports/variance/preview             PBS Variance Report preview (requireReportAccess)
GET  /api/pbs/reports/variance                     Generate PBS Variance Report Excel (requireReportAccess)
```

## Modules

| Module | Status | Pages / Notes |
|---|---|---|
| Admin — Users | ✅ Done | Users, UserDetail, UserForm. No accessLevel field (removed). |
| Admin — Departments | ✅ Done | Departments, permissions matrix |
| Admin — Audit Log | ✅ Done | AuditLog (IT only) |
| Members | ✅ Done | Member Enquiry (search+sort, URL state), MemberDetail, MemberForm. Agreement links with `transferFlag='TT'` are disabled (strikethrough) on both the list and MemberDetail accordion. Change Status removed from MemberDetail — agreements only. Enquiry uses `GET /api/members/enquiry` (MEMBERS permission) not `/api/agreements`. Agreement number links check `canView('AGREEMENTS')` — plain text when disabled. |
| Agreements | ✅ Done | Agreements list (search+sort, URL state, defaults LHC-03/Active, default sort agreementDate asc), AgreementDetail. Columns: Agreement No, Membership No/Name, Agreement Date, Expiry Date, Term, AMC, Status. AMC and PBS cards fetched by `coCode + agreementNo` (not FK) to handle duplicate agreementNo across members. |
| AMC Billing — Schedules | ✅ Done | Schedules (search+sort, URL state, defaults LHC-03/Active). Filters: product, acctClassify (by membershipNo+agreementNo pairs), AMC Next Due Date (exact date, current/future only). Default sort: acctClassify asc (NA first), then nextDueDate asc. |
| AMC Billing — Invoices | ✅ Done | Invoices, InvoiceDetail |
| AMC Billing — Rates | ✅ Done | LHC + CP rates with Add/Edit/Deactivate/Delete; auto-calc total + amount-in-words |
| AMC Billing — Day-End | ✅ Done | DayEnd file generation |
| Reports | ✅ Done | Per-user access control; IT grants via UserDetail; sidebar shows single "Reports" link → card grid at `/reports`. 6 reports: Member, SSM Agreement, Expiry Analysis, Expiring Members, Remaining Value, Expiry Summary by Years. |
| Zurich PBS | 🔨 In progress | PBS landing page (`/pbs`) with 9 function cards. PBS Enquiry & Maintenance (`/pbs/enquiry`) done. PBS Pay By Month/Year (`/pbs/pay-by-month`) done: Excel with 2 worksheets (monthly + yearly summary), tabbed preview. PBS Claim Report (`/pbs/claim-report`) done: Excel with 2 worksheets (non-ND claims + ND claims), tabbed preview. Not In PBS Report (`/pbs/not-in-pbs`) done: text file output matching Informix format, preview table. PBS Variance Report (`/pbs/variance`) done: Excel comparing rightful vs Zurich scheme type, preview with variance highlighting. All PBS reports use per-user `requireReportAccess` (not department permission); menu items hidden when not granted. Remaining: Proforma, Certificate Tracking, Auto Transfer, 1 report (PBS Report). |

## Navigation / permissions

- Sidebar shows only modules where the department's **View** permission is ticked
- IT department (`isLocked=true`) bypasses all permission checks
- Access control is entirely department-based (`DeptModulePermission` table)
- Login response includes full department permissions (sidebar renders correctly immediately on login)

### Department-specific action rules (beyond the module matrix)

Some actions need finer control than the `AGREEMENTS + edit` / `MEMBERS + edit` booleans allow — different
departments get different rights on the *same* module, and some rules depend on data values (not just the
action). These are enforced by **department-name checks** (matching `user.department.name`), with the usual
IT (`isLocked`) bypass. No schema/matrix change backs these — they live in middleware + controller + frontend.

| Action | Allowed departments (+ IT) | Where enforced |
|---|---|---|
| **Change agreement status** (`PATCH /agreements/:id/status`) | **Finance** (any status, any direction); **Credit** (NA/SU/PT and reverse to NA, but **never TM** and **cannot touch a TM record**). Member Services and all others: **none**. | `statusChangeAllowed()` in `agreements.controller.ts` (value-level rule → in-controller, route has no `requirePermission`). Frontend mirror: `allowedNewStatuses()` in `frontend/src/lib/agreementAuth.ts` gates the button + filters the status `<Select>`. |
| **Edit nominees** (`PUT /agreements/:id/nominees`) and **RCI / agreement update** (`PUT /agreements/:id`) | **Member Services** only | `requireITorMemberServices` guard. Frontend mirror: `canEditNomineesRci()` in `agreementAuth.ts` gates both card buttons. |
| **Edit member** (`PUT /members/:id`) | **Member Services** only | Already the case via the matrix (`MEMBERS + edit` = Member Services + IT). Frontend: `RequireEdit` wrapper (`frontend/src/components/RequirePermission.tsx`) also guards the `/members/:id/edit` route to close direct-URL access. |

> When changing these rules, **update both the backend guard/controller and the `agreementAuth.ts` mirror** so
> the UI and API never disagree. `changeAgreementStatus` still checks the reason code / clears the opposite
> field / flips billing / writes audit exactly as before — the department rule runs *after* the agreement is
> loaded (it needs the current `acctClassify`) and returns `403 { error: 'Not authorized to set this status' }`.

### Report access (per-user)

Reports use a separate per-user access model — independent of department permissions.

- **`UserReportAccess`** table: `userId`, `reportKey` (enum), `grantedById`, `grantedAt`. Unique on `[userId, reportKey]`.
- **`ReportKey` enum**: `MEMBER_REPORT`, `AGREEMENT_REPORT`, `EXPIRY_REPORT`, `EXPIRING_MEMBER_REPORT`, `REMAINING_VALUE_REPORT`, `EXPIRY_SUMMARY_REPORT`, `PBS_PAY_BY_MONTH_REPORT`, `PBS_CLAIM_REPORT`, `PBS_NOT_IN_PBS_REPORT`, `PBS_VARIANCE_REPORT`, `PBS_AUTO_TRANSFER` — add new values here when adding reports. `PBS_AUTO_TRANSFER` gates the **Auto Transfer to Claim** process (not a report — a maintenance function) via the same per-user grant model: its routes (`/api/pbs/transfer*`) use `requireReportAccess('PBS_AUTO_TRANSFER')` instead of `requirePermission('PBS_SCHEME', …)`, and the menu item in `Pbs.tsx` is gated by `hasReport('PBS_AUTO_TRANSFER')`.
- IT department bypasses all report access checks (same as module permissions).
- IT grants/revokes access via the "Report Access" card on the User Detail page (`/admin/users/:id`).
- Sidebar shows a single **Reports** link only when `hasReport()` returns true for at least one key. Clicking it goes to `/reports`, which renders a card grid of accessible reports.
- Clone user copies report access records to the new user automatically.
- `hasReport(key)` helper in `AuthContext` — `isIT || user.reportAccess.includes(key)`.

**Adding a new report — checklist:**
1. Add the new key to `ReportKey` enum in `prisma/schema.prisma` → `npx prisma migrate dev`
2. Add to `ALL_REPORT_KEYS` + `REPORT_LABELS` in `backend/src/controllers/reports/access.controller.ts`
3. Add route with `requireReportAccess('NEW_KEY')` — in `backend/src/routes/reports.ts` for general reports, or in the module's own route file for module-specific reports (e.g. PBS reports in `backend/src/routes/pbs.ts`)
4. For general reports: add entry to `REPORT_LIST` in `frontend/src/pages/reports/Reports.tsx` + add `hasReport('NEW_KEY')` to sidebar's `reportItems` condition
5. For PBS reports: gate the menu item in `frontend/src/pages/pbs/Pbs.tsx` with `hasReport('NEW_KEY')` (hidden when not granted)
6. Add the new key to the `ReportKey` type union in `frontend/src/types/index.ts`

## Agreement Detail card order
1. Agreement Details (net purchase price, loan type/amount, termination/suspension reason —
   branches on `acctClassify`: `SU` shows `suCode`+`SuReason` under "Suspension Reason", `PT` shows
   `canCode`+`CancellationReason` under "Pending Termination Reason", `TM` shows the same fields under
   "Termination / Cancellation reason", `NA` hides the row entirely)
2. Entitlement Balance (**LHC 03/15 only**, read-only) — remaining un-utilized nights per membership
   year, **ported from the Informix SP `get_entitlement_balance`**. Which `be_year`/`be_wk`
   (`BookingEntitlement.yearSeq`) column feeds each display column is chosen by **membership year
   (anniversary-adjusted)**: `accrueIdx = todayYear − agreementYear` if this year's anniversary (expiry
   month/day) has passed, else `− 1`; `Curr = accrueIdx+1 … Ad5 = accrueIdx+6`. The **header year** for a
   column is the calendar year that membership period *begins* = `agreementYear + seq − 1` (so it equals
   the current-year window only when the anniversary has already passed this year; for a not-yet-reached
   anniversary it is one lower — e.g. `75018` start 07-Dec-2004: Acc = 2024/`be_year21`, Curr = 2025/`be_year22`).
   Two rows (Year / Bal): `nights` = `7 − nightsUsed`,
   Weekends = `1 − weekendUsed`, both clamped ≥0. **Expiry (faithful to SP):** `Curr`/`Ad1..Ad5` (offset
   0..5) zero once `expiry ≤ today + offset years`; **`Acc` is never zeroed** — unused nights carry
   forward 1 year (accrued) and are forfeited only after the next anniversary, so an expiring agreement
   still shows last year's Accrue balance (e.g. `31201` → Acc 2025 = 7, Curr+Adv = 0). Weekend follows
   nights (0 ⇒ 0) for Acc + Curr only. Three extra columns port the rest of the `cal_ent` screen:
   **Forf** = `Σ (7 − nightsUsed[k])` for membership years `k = 1 … accrueIdx−1` (unused balance from
   years older than Accrue — no longer claimable; upper bound clamped at `termYears`; 0 when `accrueIdx ≤ 1`);
   **Used** = `actualNights` of the current year (seq `accrueIdx+1`), headed by the Curr column's year;
   **Usable Nights** = `max(0, min(14 − actualNights[curr], accBal + currBal + adv1Bal))` (14 = 2-year cap).
   `entitlementBalance` is now an **object** `{ columns, forfeitedNights, usableNights, usedNights, usedYear }`
   (was a bare array), computed server-side in `getAgreement()` from `BookingEntitlement` (natural-key matched).
   Card hidden for CP (02), for **terminated (`acctClassify='TM'`)** agreements, and when it is null
   (`getAgreement` returns `entitlementBalance: null` in those cases).
2b. CP Entitlement Balance (**CP 02 only**, read-only) — point balances per membership year, **ported from
   the Informix SP `get_entitlement_balance_CP`**. Unlike LHC, CP stores the balance points directly
   (`CpBookingEntitlement.balPts`) per anniversary-dated `useYear`, so this is a lookup not a subtraction.
   `ref` = the row with the greatest `useYear ≤ today` (current membership year); **Curr** = `ref.balPts`,
   **Acc** = prior year `balPts` capped so `prior.acrusePts + acc ≤ floor(ref.totalPts / 2)` (max accrue =
   half the annual entitlement), **Ad1..5** = `balPts` of `refYear+1..5` (**blank** when the source row is
   missing — e.g. past expiry, like `P00020` Ad5 2031). Header years: Acc = `refYear−1`, Curr = `refYear`,
   Ad1..Ad5 = `refYear+1..5`. Two rows (Year / Bal). `cpEntitlementBalance` computed server-side in
   `getAgreement()` (natural-key matched: `coCode+membershipNo+agreementNo`). Card hidden for LHC (03/15),
   for **terminated (`acctClassify='TM'`)** agreements, and when no `ref` row exists (`cpEntitlementBalance: null`).
3. Nominees (up to 3 — salutation, full name, name card, designation, IC old/new, home tel, mobile, email, address; card button reads "Add nominees" when none exist yet, "Edit nominees" once at least one is on record; edit modal has 3 columns, one per nominee, with the same field set for all three even though nominee 3 historically only carries 4 fields from `si_entitlement.txt`'s `e_loc_*` columns). **Add/Edit button shown to Member Services + IT only** (`canEditNomineesRci()`).
4. RCI Information (always rendered, even when empty, so it can be added — RCI ID, RCI Nominee, Joint Date, Expiry Date; data originally from `rci_enrol.txt` not si_entitlement, but editable via `PUT /api/agreements/:id`; card button reads "Add RCI info" when all 4 fields are empty, "Edit RCI info" otherwise). **Add/Edit button shown to Member Services + IT only** (`canEditNomineesRci()`).
5. Annual Maintenance Charges (AMC Billed, Total AMC, AMC Next Due)
6. Zurich Payback Scheme (if exists — cert no, scheme type, payback date, claimed badge)
7. Invoice History

> AMC and PBS are fetched by `coCode + agreementNo` in `getAgreement()` — NOT via the Prisma FK (`agreementId`). This is intentional: the Informix source data can have multiple agreements sharing the same `agreementNo + coCode` (different members), so matching by natural key ensures both agreements resolve to the same PBS/AMC record rather than relying on whichever UUID the migration happened to link.

## Change Agreement Status

`PATCH /api/agreements/:id/status` (`changeAgreementStatus` in `backend/src/controllers/agreements.controller.ts`) sets `acctClassify` and, since this session, also requires and saves a reason code:

- **Authorization is department-specific**, not `requirePermission('AGREEMENTS','edit')` (that guard was removed from this route). Finance (+ IT) may set any status in any direction; Credit may set NA/SU/PT and reverse to NA but **never TM** and **cannot change a record whose current status is already TM**; Member Services and everyone else get `403`. Enforced by `statusChangeAllowed(dept, currentStatus, newStatus)` after the agreement is loaded. See "Department-specific action rules" under Navigation / permissions for the full table and the frontend mirror.
- **`reasonCode` is required** in the request body whenever the new status is `SU`, `PT`, or `TM` (400 if missing). Not required/used for `NA`.
- The reason is written to **exactly one** of `suCode` (status `SU`) or `canCode` (status `PT`/`TM`) — **the other field is always cleared to `null`** on every status change, including when reverting to `NA` (which clears both). This guarantees a status's reason field never shows a leftover value from a previous, unrelated status change (this was a real bug pattern found and fixed in this session — see git history / PT backfill work for the historical-data version of the same issue).
- Invalid reason codes (not present in `SuReason`/`CancellationReason`) are caught as a Prisma FK violation (`P2003`) and returned as `400 { error: 'Invalid reason code' }` rather than crashing.
- Still also flips `AmcSchedule.billingStatus` (`C` for SU/PT/TM, `N` for NA) and writes an `AuditLog` row, unchanged from before.
- Frontend: the "Change Status" modal (`AgreementDetail.tsx`) shows a reason `<Select>` whenever the picked status isn't `NA`, sourced from `GET /api/su-reasons` (status=SU) or `GET /api/cancellation-reasons` (status=PT/TM). Save is blocked client-side until a reason is chosen.
- **`GET /api/cancellation-reasons` filters to `status='A'` only** (15 of the 46 codes) — the active set is defined by the business and is authoritative in `ACTIVE_CODES` in `prisma/seed-cancellation-reasons.ts` (it deliberately overrides the status column of `agmt_can_cate.txt`, whose values do not match current rules). Active codes as of 2026-07-10: `08, 10, 13, 15, 21, 22, 24, 25, 34, 37, 38, 39, 43, 45, 46`. All other codes are kept as `'U'` so historical records still display correctly but are not offered for new status changes. To change the active set, edit `ACTIVE_CODES` and re-run the seed. `GET /api/su-reasons` returns all 28 `SuReason` codes unfiltered (no status field on that table).

## MemberDetail conventions
- **Spouse name** shown inside Personal Information card (no separate Spouse card); spouse IC not displayed.
- **Change Status** is only on AgreementDetail, not MemberDetail. On AgreementDetail the "Change status" header button is hidden unless the user has at least one allowed transition (`allowedNewStatuses(user, acctClassify).length > 0`) — Finance/Credit/IT only.
- **Edit** button (header) shows for `canEdit('MEMBERS')` (Member Services + IT). The `/members/:id/edit` route is additionally wrapped in `RequireEdit` (`components/RequirePermission.tsx`) so a non-editor hitting the URL directly is redirected back to the detail page.
- **Agreements accordion**: agreement number is the hyperlink (no separate View button, no date shown). Agreements with `transferFlag='TT'` show the number as strikethrough grey — link disabled.
- All text dropdowns (salutation, gender, race, marital status, nature of work) use uppercase option labels in MemberForm. Email fields do not auto-uppercase. Remarks field does not auto-uppercase.

## Report preview page theme

All PBS report preview tables (and future report previews) must use this consistent theme:

| Element | Tailwind classes |
|---|---|
| Table | `min-w-full text-xs` |
| Header row (single) | `bg-blue-600 text-white` |
| Header row (multi — section) | `bg-blue-600 text-white` |
| Header row (multi — columns) | `bg-slate-800 text-white` |
| Header cells | `px-1.5 py-1.5 font-medium whitespace-nowrap` |
| Data cells | `px-1.5 py-1` |
| Alternating rows | `bg-white` / `bg-blue-50/40` |
| Amount cells | `text-right font-mono` with `fmtRM()` |
| Totals footer | `<tfoot>` with `bg-gray-100 font-bold border-t-2 border-gray-300` |

Reference implementations: `PbsPayByMonthReport.tsx`, `PbsClaimReport.tsx`.
