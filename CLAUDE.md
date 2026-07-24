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
│   ├── migrate-amc-invoice-counter.ts  # Per-coCode AMC invoice running number from ctrl_billtab.txt (seeds AmcInvoiceCounter)
│   ├── migrate-resorts.ts   # Resort master from resort_mast.txt (Resorts Setup module) + business-supplied ApartmentType seed rows
│   ├── migrate-resort-info.ts  # Resort info lines from ps_resort_info.txt (normalized into ResortInfoLine)
│   ├── migrate-resort-units.ts # Resort units from apt_mast.txt (Apartments/Units Setup; 5-col partial export)
│   ├── migrate-res-avail.ts # Per-day availability grid from res_avail_mast.txt (Units Availability by Dates; cols 0-4, chunked)
│   ├── migrate-apt-block.ts # Availability input blocks from apt_block.txt (Units Availability by Dates; cols 0-4, apartmentType derived from ResortUnit)
│   └── migrations/          # Applied migration history
├── refresh-test-db.ps1      # Clears + re-imports all Informix data; use for UAT refreshes and live cutover
├── migrate-table.ps1        # Migrate a single table without full refresh (Member, PbsScheme, PbsClaim, AmcSchedule, RciEnrol, SuPtReason, AmcInvoiceCounter)
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
│   ├── ctrl_billtab.txt
│   ├── resort_mast.txt
│   ├── ps_resort_info.txt
│   ├── apt_mast.txt
│   ├── res_avail_mast.txt
│   ├── apt_block.txt
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
- **Timestamp column convention (since migration `20260723110000`):** audit/instant fields (`createdAt`, `updatedAt`, `lastLoginAt`, `lockedAt`, `grantedAt`, `processedAt`, `printDate`, `statusChangeDate`) are `TIMESTAMPTZ(3)` (`@db.Timestamptz(3)` in schema) so psql/pgAdmin display them in Malaysia time (server TZ = `Asia/Kuala_Lumpur`, e.g. `17:20:57+08`). App code is unchanged — keep writing `new Date()`; Prisma stores the correct instant and the API still returns UTC ISO strings which the browser renders in local time. **Business date fields (`agreementDate`, `nextDueDate`, `invDate`, `dateOfBirth`, `useYear`, legacy dates, etc.) remain plain `TIMESTAMP` at UTC midnight — do NOT convert them** (the UTC-midnight convention and `Date.UTC` filter math depend on it). When adding a new model, annotate its `createdAt`/`updatedAt` (and any other true-instant field) with `@db.Timestamptz(3)`; a bare `ALTER ... TYPE timestamptz` without `USING "col" AT TIME ZONE 'UTC'` would shift existing instants by −8h.
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

The script: truncates BookingEntitlement + CpBookingEntitlement + PbsClaim + PbsScheme + Salesperson + AptBlock + ResAvailMast + Resort + Member CASCADE (the Member CASCADE also clears AmcInvoice) → migrates members/agreements/nominees → migrates AMC schedules + PBS schemes + PBS claims + RCI enrollment → salespersons + resorts (master + info + units + `res_avail_mast.txt` availability grid + `apt_block.txt` blocks) → booking entitlements (LHC `booking_ent1.txt` + CP `ps_bookent1.txt`) → AMC invoice counter (`ctrl_billtab.txt`, resets `AmcInvoiceCounter` to the Informix baseline) → re-grants lhb_app permissions → prints final row counts.

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
.\migrate-table.ps1 -Table AmcInvoiceCounter           # Per-coCode AMC invoice running number (ctrl_billtab.txt; upsert, resets to Informix baseline)
.\migrate-table.ps1 -Table Resort                      # Resort master + info + units + availability grid + blocks (resort_mast.txt + ps_resort_info.txt + apt_mast.txt + res_avail_mast.txt + apt_block.txt; truncates + reimports — post-go-live clobbers CRUD edits)
.\migrate-table.ps1 -Table ResortUnit                  # Resort units only (apt_mast.txt; truncates + reimports — post-go-live clobbers CRUD edits)
.\migrate-table.ps1 -Table ResAvailMast                # Per-day availability grid only (res_avail_mast.txt; truncates + reimports — post-go-live clobbers CRUD edits)
.\migrate-table.ps1 -Table AptBlock                    # Availability blocks only (apt_block.txt; needs ResortUnit present for apartmentType lookup; truncates + reimports — clobbers CRUD edits)
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
Active tiers cover **60–999 points only**; ~15 agreements below 60 pts (e.g. P05679=51) are intentionally
**unbillable** (business decision — leave excluded, don't widen tiers). Generate surfaces these as skips.

### AmcInvoice
An invoice = a **set** of rows sharing `scheduleId` + `invoiceYearSeq`, one per `invComponent`
(`MAIN_AMC`/`SINKING_FUND`/`SERVICE_TAX`/`ROUNDING`), all sharing a 7-digit number with a letter prefix
(`A`/`K`/`S`/`Y` + seq, e.g. `A0236678`). The seq comes from `AmcInvoiceCounter` (per coCode; see below),
zero-padded to 7. `isProcessed` flips true when a day-end file consumes it.
`prevNextDueDate` / `prevLastInvoiceDate` snapshot the schedule's pre-billing state at generation time so
**Invoice Cancellation** can restore it exactly (see below). `invNo` is **not** globally unique — numbers
are unique **per coCode** (coCodes 15 & 02 seed from the same Informix baseline 233610, so identical `invNo`
strings can exist across coCodes; the `coCode` column disambiguates — no code assumes global uniqueness).

### AmcInvoiceCounter
Persistent per-coCode AMC invoice running number, seeded from Informix `ctrl_billtab.last_amcinv`
(`03`=236677, `15`=233610, `02`=233610 as of go-live) so the new system continues numbering where Informix
left off. Fields: `coCode` (PK — "02"/"03"/"15"), `lastInvNo` (Int, last used number). **Generation**
advances it once per invoice set (`allocateInvSeq(tx, coCode)` locks the row `FOR UPDATE`, so concurrent
runs can't mint duplicates; if a coCode has no row it self-initialises from the max existing `invNo` for
that coCode, else 0). **Cancellation** reverses it *only* when the cancelled set holds the current last
number for its coCode (reclaim); cancelling an older invoice leaves a voided gap. Seeded/refreshed via
`prisma/migrate-amc-invoice-counter.ts` (`-Table AmcInvoiceCounter`, or `refresh-test-db.ps1`) from
`migrate/ctrl_billtab.txt` — **re-running RESETS `lastInvNo` to the Informix value**, correct for UAT
refreshes (which also truncate `AmcInvoice`) but **must not run after go-live** once live numbers are issued.

### AMC Invoice Generation
`POST /api/amc/invoices/generate` (`generateInvoices`, gated by **`requirePermission('AMC_BILLING','edit')`** —
i.e. any department with the AMC Billing Edit flag; IT bypasses. Note: this is the standard matrix Edit
permission, NOT the old Credit/IT department rule. Credit has canEdit=false by default, so grant it in
Admin → Departments if Credit should generate). Body `{ productType: 'CP'|'LHC',
period: 'YYYY-MM', agreementNo? }`. `CP → coCode 02`, `LHC → coCode 03+15`. **CP billed monthly; LHC only
Jan & July.** invDate = **1st of the period month** (UTC midnight); selects schedules with
`nextDueDate < 1st-of-next-month` (due on/before month-end, sweeps overdue) + `billingStatus='N'` +
`acctClassify='NA'`, optionally scoped to `agreementNo`. All date math uses `Date.UTC` (stored dates are
UTC midnight; `addOneYear`/`nextLhcDueDate` are UTC to avoid the prev-day-16:00 drift). Per-schedule
failures (e.g. no rate tier) are collected and returned as `skipped[]` (shown in the modal), not swallowed.
**Never bills beyond the term:** a schedule with `invoicesIssued >= totalInvoices` is skipped
("Already fully billed") — some migrated schedules arrived fully billed yet still `billingStatus='N'`
with a stale `nextDueDate`, which previously caused a one-year over-bill (agreements 30420/30669/34047).
`migrate-amc-schedules.ts` now imports `nextDueDate = null` when `invoicesIssued >= totalInvoices` (a null
due date alone excludes them from selection), so a refresh won't reintroduce the bad state.
**CP amount formula:** `amcRatePerPoint` is the **all-in** rate; SF is carved OUT of it, not added on top —
`MAIN_AMC = pts·(rate − sfFrac·rate)`, `SF = pts·sfFrac·rate`, `TAX = gstFrac·roundedMAIN`, plus a
`ROUNDING` line flooring the total to a whole ringgit.
**Invoice number:** the 7-digit running number comes from `AmcInvoiceCounter` per coCode (not a runtime
`MAX(invNo)`), advanced once per invoice set via `allocateInvSeq(tx, schedule.coCode)` which locks the
counter row `FOR UPDATE`. Seeded from Informix `ctrl_billtab` (03=236677, 15/02=233610), so the first
post-cutover 03 invoice is `A0236678` (K/S/Y for the other components). Still zero-padded to 7. See
**AmcInvoiceCounter** above.

### AMC Invoice Cancellation
`/amc/invoice-cancellation` page + `GET /api/amc/invoices/cancellable?q=` and
`POST /api/amc/invoices/:id/cancel` (both `requirePermission('AMC_BILLING','edit')`; nav item + Cancel
button gated by `canEdit('AMC_BILLING')`). Cancels a whole
**unprocessed** invoice (all components), searchable by membershipNo/agreementNo/invoiceNo. **Processed
invoices cannot be cancelled** — filtered out of the list and re-checked in the endpoint (400). Cancel runs
in a transaction: **hard-deletes** the component set and **rolls the schedule back** to its pre-billing
state — `invoicesIssued = invoiceYearSeq−1`, `billingStatus='N'`, `nextDueDate`/`lastInvoiceDate` restored
from the invoice's `prevNextDueDate`/`prevLastInvoiceDate` snapshot — so the agreement is billable again.
Writes a `DELETE` AuditLog (invNos + reason in metadata). Fallback for legacy invoices lacking the snapshot:
CP → `nextDueDate−1yr`, LHC → previous Jan/Jul; a final-year invoice with no snapshot is refused. This
automates the manual SQL rollback pattern (delete rows + reverse schedule counters).
**Reverses the running number** too: the set's number (`invNo` minus its A/K/S/Y prefix) is reclaimed by
decrementing `AmcInvoiceCounter.lastInvNo` **only** when it equals the current last number for that coCode
(row locked `FOR UPDATE`); otherwise the counter is left unchanged and that number stays a voided gap
(avoids reissuing a number still in use). Audit metadata records `invNum` + `reclaimed` (bool).

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

### Resort
Resort master for the **Resorts Setup** module. 7 records from `resort_mast.txt` (Informix `resort_mast`,
filtered `re_resort_status='A'` + `re_cocode IN ('03','15','02')` at export). Fields: `resortCode` (unique,
e.g. `L-10016`, `CP-PBR`), `coCode`, `shortName`, `resortName`, `rciAffiliate` (from `re_rci_aff` — RCI
affiliation indicator; `Y` pairs with a populated `rciCode`), `rciCode` (RCI resort no.), `lockOnOff`
(from `re_lock_onoff` — resort's rooms have the lock-on/lock-off feature: one apartment splits/combines
as Sleep2/Sleep4/Sleep6; used by reservation/booking later), `paymt` (Y/N chars stored as-is),
`resortMgmt`, `contactPerson`, `add1-3`, `city`, `state`,
`country`, `telNo`, `faxNo`, `checkInTime`/`checkOutTime` (free-text e.g. `2PM - 10PM` / `12PM` —
**not from Informix**, business-supplied; baked into `CHECK_TIMES` in `migrate-resorts.ts` so re-imports
keep them), `status` (`A`=Active/`U`=Inactive), `lockStatus`, `legacyCreateUser/Date`,
`legacyModUser/Date`. **`re_exc_reg` and `re_rci_release` intentionally NOT migrated** (business decision;
note the applied migration `20260722090000` renamed the column `rciRelease`→`rciAffiliate` and contains a
now-obsolete GC/LDBR UPDATE — left untouched because editing applied migrations breaks Prisma checksums;
the re-import supersedes it).
Full CRUD at `/resorts/setup` under `RESORTS_SETUP` matrix permission (view/create/edit/delete +
status toggle; `resortCode` immutable after create; delete is hard delete — no FKs reference Resort yet).
Post-go-live resorts are maintained in MMS — re-running `migrate-table.ps1 -Table Resort` truncates and
clobbers app edits.

### ResortInfoLine
Normalized resort information lines from Informix `ps_resort_info` (wide 38-col table → one row per
line). 199 lines from `ps_resort_info.txt` across all 7 resorts. Fields: `resortId` (FK → Resort.id, **onDelete: Cascade** — safe FK, resortCode is genuinely
unique), `category` (`ResortInfoCategory` enum: `GETTING_THERE`(10 slots) / `RESORT_FACILITY`(10) /
`PLACE_OF_INTEREST`(6) / `UNIT_AMENITY`(6) — slot counts are import provenance only), `seq` (original
Informix slot number on import — blank print-separator slots are skipped but gaps preserve ordering;
CRUD saves renumber 1..n), `text`. Unique: `[resortId, category, seq]`. **Editing is free-form**
(remark-style): the legacy per-line 35-char width and slot caps are NOT enforced — instead a
**400-character total cap per category** (`INFO_MAX_CHARS` in `resorts.controller.ts`, mirrored in the
tab editor with `maxLength` + live counter). Legacy audit
cols `psri_usercreate/datecreate/usermodify/datemodify` + `psri_lockstatus` not migrated (all empty).
Edited via the 4 tabs on Resort Detail (`/resorts/setup/:id`), replace-all-per-category transaction.

### ApartmentType
Apartment types per resort for the **Apartment Types Setup** function (`/resorts/apartment-types`).
Fields: `resortId` (FK → Resort.id, **onDelete: Cascade** — safe FK, resortCode genuinely unique),
`resortCode` (denormalized natural key), `apartmentType` (e.g. `SLEEP6`, `2BR`), `description`,
`lockType` (`LM`=Master Unit, `LS`=Split Unit, `LN`=Normal Unit, default `LN`).
Unique: `[resortCode, apartmentType]`. **`lockType` may only be LM/LS when the resort has
`lockOnOff='Y'`** (currently CP-PBR only) — enforced server-side (400) in
`apartment-types.controller.ts` and mirrored in the form (Select disabled + forced LN).
`resortCode` immutable after create (move = delete + re-add). 9 seed rows are business-supplied
(no Informix UNLOAD file) — baked into `APARTMENT_TYPES` in `prisma/migrate-resorts.ts` (like
`CHECK_TIMES`), so `refresh-test-db.ps1` / `migrate-table.ps1 -Table Resort` re-create them
(both truncate `"ApartmentType"` explicitly; post-go-live re-import clobbers CRUD edits).
CRUD at `/api/apartment-types` under `RESORTS_SETUP` matrix permission.

### ResortUnit
Unit-number register per resort for the **Apartments/Units Setup** function (`/resorts/units`).
481 rows from `apt_mast.txt` — a deliberately **partial** export of Informix `apt_mast` (5 of 15 cols;
dates/audit/lock_status skipped per business decision). Fields: `resortId` (FK → Resort.id, Cascade —
safe FK), `resortCode` (denormalized natural key), `unitNo` (`apt_code` — includes lock-off compound
codes like `3227/3228` and dotted codes like `1.12A`, stored as plain strings), `apartmentType`
(`apt_unit_type` — **no hard FK to ApartmentType**; validated on create/update that the
`(resortCode, apartmentType)` pair exists, 400 otherwise, since apartment types are renamable via
their own CRUD), `occupancy` (Int?), `rciReserved` (Y/N, default N). Unique: `[resortCode, unitNo]`
(`apt_code` is NOT globally unique — codes 1-21 repeat across L-10024/L-10025/L-101).
`resortCode` immutable after create. List endpoint is **paginated** (`page`/`pageSize`, default 50,
returns `{ data, total, page, pageSize }`) with `q` search + `resortCode` filter.
Seeded via `prisma/migrate-resort-units.ts` (`migrate-table.ps1 -Table ResortUnit`, also bundled into
`-Table Resort` and `refresh-test-db.ps1` — post-go-live re-import clobbers CRUD edits).
CRUD at `/api/resort-units` under `RESORTS_SETUP` matrix permission.

### AptBlock (Units Availability input record)
The input record for the **Units Availability Setup by Dates** function (`/resorts/availability`).
One row per (resort, unit, date-range) block — this is what staff CRUD. 3,539 rows from `apt_block.txt`
(cols `[0..4]` migrated: resortCode, unitNo, startDate, endDate, blockNo — create-user/col5 + audit
cols NOT migrated). Fields: `resortId` (FK → Resort.id, Cascade), `resortCode`, `unitNo` (incl. compound
lock-off codes like `3005/3006`), `apartmentType` (derived from ResortUnit at CRUD time; **null** for
migrated rows whose unit isn't in the partial `apt_mast` export — 59 such rows), `startDate`/`endDate`
(plain TIMESTAMP UTC-midnight business dates), `blockNo` (Int?, per-unit running block number).
Unique: `[resortCode, unitNo, startDate, endDate]`. **`resortCode`/`unitNo`/`apartmentType` immutable
after create** (move = delete + re-add; edit changes only the dates). Seeded via
`prisma/migrate-apt-block.ts` (`migrate-table.ps1 -Table AptBlock`, bundled into `-Table Resort` +
`refresh-test-db.ps1` — runs after `migrate-resort-units.ts` since it needs ResortUnit for the type
lookup). CRUD at `/api/apt-blocks` under `RESORTS_SETUP` matrix. **Each save maintains the ResAvailMast
grid** (see below).

### ResAvailMast (Units Availability generated per-day grid)
The **generated** per-day availability grid consumed by (future) booking — NOT edited directly; it is
maintained automatically when AptBlock rows are created/edited/deleted. Keyed by (resort, apartment type,
date). 94,876 rows from `res_avail_mast.txt` (cols `[0..4]` migrated: resortCode, apartmentType, date,
actNight, balNight — relNight/col5 + lockStatus NOT migrated). Fields: `resortId` (FK → Resort.id,
Cascade), `resortCode`, `apartmentType`, `date` (plain TIMESTAMP UTC-midnight), `actNight` (**count of
units of that apartment type available that day** — aggregate across all units of the type), `balNight`
(act minus bookings). Unique: `[resortCode, apartmentType, date]` (matches Informix `ram_idx1`). Verified:
L-101/1BR/2027-01-01 → act=3 = the 3 blocks for units 4/6/18. Seeded via `prisma/migrate-res-avail.ts`
(chunked `createMany`, 5k). Direct load on import — NOT regenerated from AptBlock at migration time.

**Grid sync on AptBlock CRUD** (`applyDelta` in `apt-blocks.controller.ts`, all in one transaction,
interactive-txn timeout bumped to 120s for multi-year blocks, `MAX_RANGE_DAYS=3660` guard):
- **Create** → for each day in `[start,end]`, upsert `(resort, apartmentType, date)` with `actNight+1,
  balNight+1` (creates `1/1` if absent).
- **Delete** → each day `actNight-1, balNight-1` (row deleted when act reaches 0; balNight clamped ≥0 so a
  booked day can't go negative).
- **Edit** (dates only) → reverse the old range (`-1`) then apply the new range (`+1`); days in both are
  net-zero, so only added/dropped days change.
- **Overlap guard:** a new/edited block whose range overlaps an existing block for the same
  `(resortCode, unitNo)` is rejected (409).

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

| `resort_mast.txt` | Resort master | 26 cols pipe-delimited | re_resort_code[0], re_cocode[1], re_short_name[2], re_resort_name[3], **re_exc_reg[4] + re_rci_release[7] skipped**, re_rci_aff[5] (→ `rciAffiliate`), re_rci_code[6], re_lock_onoff[8] (lock-on/lock-off: apartment splits as Sleep2/4/6), re_resort_mgmt[9], re_contact_person[10], re_add1-3[11-13], re_city[14], re_state[15], re_country[16], re_telno[17], re_faxno[18], re_resort_status[19], re_paymt[20], re_create_user/date[21-22], re_mod_user/date[23-24], re_lock_status[25]. `UNLOAD TO 'resort_mast.txt' SELECT * FROM resort_mast WHERE re_resort_status = 'A' AND re_cocode IN ('03','15','02');` → `Resort`. See `prisma/migrate-resorts.ts`. |

| `apt_mast.txt` | Resort units (Apartments/Units register) | 5 cols pipe-delimited (deliberately partial export of the 15-col `apt_mast` — dates/audit/lock_status skipped) | apt_code[0] (→ `unitNo`; compound lock-off codes `3227/3228`, dotted `1.12A`), apt_resort_code[1], apt_rci_reserved[2] (Y/N), apt_unit_type[3] (matches `ApartmentType.apartmentType`), apt_occupancy[4]. `UNLOAD TO 'apt_mast.txt' DELIMITER '\|' SELECT apt_code, apt_resort_code, apt_rci_reserved, apt_unit_type, apt_occupancy FROM apt_mast;` → `ResortUnit` (unique `[resortCode, unitNo]` — apt_code NOT globally unique). See `prisma/migrate-resort-units.ts`. |

| `ps_resort_info.txt` | Resort info (4 blocks of print lines) | 38 cols pipe-delimited | psri_resort_code[0], psri_get_there1-10[1-10], psri_res_fac1-10[11-20], psri_pl_int1-6[21-26], psri_unit_amen1-6[27-32], legacy audit[33-36] + lockstatus[37] skipped (all empty). `UNLOAD TO 'ps_resort_info.txt' SELECT * FROM ps_resort_info;` → `ResortInfoLine` (one row per non-empty slot; slot no. = `seq`). See `prisma/migrate-resort-info.ts`. |

| `res_avail_mast.txt` | Resort availability (per-day grid) | 7 cols pipe-delimited; only [0..4] migrated | ram_resort_code[0] (→ `resortCode`), ram_apt_type[1] (→ `apartmentType`), ram_date[2] (`dd-mm-yyyy` → UTC midnight), ram_act_night[3] (→ `actNight`), ram_bal_night[4] (→ `balNight`). **ram_rel_night[5] + ram_lock_status[6] NOT migrated.** `UNLOAD TO 'res_avail_mast.txt' DELIMITER '\|' SELECT * FROM res_avail_mast;` → `ResAvailMast` (unique `[resortCode, apartmentType, date]`; 94,876 rows, chunked). See `prisma/migrate-res-avail.ts`. |

| `apt_block.txt` | Availability input blocks | 10 cols pipe-delimited; only [0..4] migrated | resort_code[0], apt_code[1] (→ `unitNo`, incl. `3005/3006`), start_date[2], end_date[3] (`dd-mm-yyyy` → UTC midnight), block_no[4] (→ `blockNo`). **create-user[5], create-date[6], 'new'[7], blank[8], lock_status[9] NOT migrated.** `apartmentType` derived by ResortUnit lookup (null when unit absent from `apt_mast` export). `UNLOAD TO 'apt_block.txt' DELIMITER '\|' SELECT * FROM apt_block;` → `AptBlock` (unique `[resortCode, unitNo, startDate, endDate]`; 3,539 rows). See `prisma/migrate-apt-block.ts`. |

| `ctrl_billtab.txt` | AMC invoice running number per coCode | 2 cols pipe-delimited | cocode[0], last_amcinv[1]. `UNLOAD TO 'ctrl_billtab.txt' SELECT cocode, last_amcinv FROM ctrl_billtab WHERE cocode IN ('03','15','02');`. Upsert-by-coCode → `AmcInvoiceCounter` (`coCode` PK, `lastInvNo`). Seeds the per-coCode AMC invoice running number so the new system continues where Informix left off. **Re-running RESETS `lastInvNo`** to the Informix value — OK for UAT refresh, must NOT run after go-live. See `prisma/migrate-amc-invoice-counter.ts`. |

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
GET  /api/members/enquiry?...               Member Enquiry search (same params as /api/agreements; uses MEMBERS permission). Supports `phone=` — searches all 9 Member phone/fax fields, digit-stripped (see Members module note)
GET  /api/members/:id                       Member + agreements + nominees
PUT  /api/members/:id                       Update member
GET  /api/agreements?q=&coCode=&...         List/search agreements
GET  /api/agreements/:id                    Agreement detail + AMC + PBS + invoices
PATCH /api/agreements/:id/status            Change acctClassify + reason code (suCode/canCode); see "Change Agreement Status" below
GET  /api/amc/schedules?q=&coCode=&...      AMC billing schedules (search supported)
GET  /api/amc/invoices?q=&coCode=&...        List/search invoices (q = membershipNo/agreementNo/member name; sorted invDate desc, agreementNo, invNo)
POST /api/amc/invoices/generate             Generate AMC invoices (body: productType 'CP'|'LHC', period 'YYYY-MM', agreementNo?; requirePermission AMC_BILLING edit). Returns { generated, skipped[] }
GET  /api/amc/invoices/cancellable?q=        Unprocessed invoice sets, searchable by membershipNo/agreementNo/invNo (requirePermission AMC_BILLING edit)
POST /api/amc/invoices/:id/cancel           Cancel a whole unprocessed invoice + roll back its schedule (requirePermission AMC_BILLING edit; 400 if processed)
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
GET  /api/resorts?q=                        Resort master list (q = code/name/short name; RESORTS_SETUP view)
GET  /api/resorts/:id                       Resort detail + info grouped by category (RESORTS_SETUP view)
POST /api/resorts                           Create resort (RESORTS_SETUP create)
PUT  /api/resorts/:id/info                  Replace one info category's lines (body: category, lines[]; RESORTS_SETUP edit)
PUT  /api/resorts/:id                       Update resort (resortCode immutable; RESORTS_SETUP edit)
PATCH /api/resorts/:id/toggle               Toggle resort status A/U (RESORTS_SETUP edit)
DELETE /api/resorts/:id                     Delete resort (RESORTS_SETUP delete)
GET  /api/apartment-types?q=                Apartment type list (q = resortCode/type/description/resort name/short name; RESORTS_SETUP view)
POST /api/apartment-types                   Create apartment type (RESORTS_SETUP create; lockType LM/LS needs resort lockOnOff=Y)
PUT  /api/apartment-types/:id               Update apartment type (resortCode immutable; RESORTS_SETUP edit)
DELETE /api/apartment-types/:id             Delete apartment type (RESORTS_SETUP delete)
GET  /api/resort-units?q=&resortCode=&page=&pageSize=  Unit list, paginated (RESORTS_SETUP view)
POST /api/resort-units                      Create unit (RESORTS_SETUP create; apartmentType must exist for the resort)
PUT  /api/resort-units/:id                  Update unit (resortCode immutable; RESORTS_SETUP edit)
DELETE /api/resort-units/:id                Delete unit (RESORTS_SETUP delete)
GET  /api/apt-blocks?q=&resortCode=&page=&pageSize=  Availability block list, paginated, sorted startDate desc (RESORTS_SETUP view)
GET  /api/apt-blocks/availability-chart?product=LHC|CP&date=&days=  Resort Availability chart: ResAvailMast pivoted resort×date, cell=balNight (LHC=coCode 03 only; CP=02; RESORTS_SETUP view)
GET  /api/apt-blocks/:id/availability       Per-day grid (date/act/bal) for a block's resort+type over its date range (RESORTS_SETUP view)
POST /api/apt-blocks                        Create block + generate ResAvailMast day rows (RESORTS_SETUP create; 409 on overlap, 400 if unit/type mismatch)
PUT  /api/apt-blocks/:id                    Edit block dates + re-sync grid (resortCode/unitNo/type immutable; RESORTS_SETUP edit; 409 on overlap)
DELETE /api/apt-blocks/:id                  Delete block + reverse its grid contribution (RESORTS_SETUP delete)
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
| Members | ✅ Done | Member Enquiry (search+sort, URL state), MemberDetail, MemberForm. Agreement links with `transferFlag='TT'` are disabled (strikethrough) on both the list and MemberDetail accordion. Change Status removed from MemberDetail — agreements only. Enquiry uses `GET /api/members/enquiry` (MEMBERS permission) not `/api/agreements`. Agreement number links check `canView('AGREEMENTS')` — plain text when disabled. **Phone/Fax search** (`phone=` param): searches all 9 Member phone/fax fields (`telHome`, `telMobile`, `telOffice`, `telOffice2`, `jaTelHome`, `jaTelOffice`, `jaMobile`, `faxNo`, `faxOffice`) via raw SQL that digit-strips both sides (`regexp_replace(...,'[^0-9]','','g')`) — numbers are stored in mixed formats (`017-6822868` vs `0194714131`), so bare-digit input still matches dashed values. Resolves to member ids → `{ memberId: { in } }` (match set is tiny, no bind-var risk). In `listAgreements` in [agreements.controller.ts](backend/src/controllers/agreements.controller.ts). |
| Agreements | ✅ Done | Agreements list (search+sort, URL state, defaults LHC-03/Active, default sort agreementDate asc), AgreementDetail. Columns: Agreement No, Membership No/Name, Agreement Date, Expiry Date, Term, AMC, Status. AMC and PBS cards fetched by `coCode + agreementNo` (not FK) to handle duplicate agreementNo across members. |
| AMC Billing — Schedules | ✅ Done | Schedules (search+sort, URL state, defaults LHC-03/Active). Filters: product, acctClassify (by membershipNo+agreementNo pairs), AMC Next Due Date (exact date, current/future only). Default sort: acctClassify asc (NA first), then nextDueDate asc. |
| AMC Billing — Invoices | ✅ Done | Invoices (search by membershipNo/agreementNo/name, Clear button, sort invDate desc→agreementNo→invNo), InvoiceDetail. **Generate Invoices** modal: Product Type (CP default / LHC), Period (MM/YYYY, default current), Agreement No (blank=all, shows member name to verify; respects due rule). Selects `nextDueDate <= period month-end`, invDate = 1st of period month. Skipped agreements (e.g. no rate tier) surfaced in the result. See "Generate Invoices" + "AMC Invoice Cancellation" below. |
| AMC Billing — Invoice Cancellation | ✅ Done | `/amc/invoice-cancellation` (AMC_BILLING Edit permission). Search unprocessed invoices by membershipNo/agreementNo/invoiceNo → Cancel a whole invoice (all A/K/S/Y components) → hard-deletes rows + rolls schedule back to pre-billing state. See "AMC Invoice Cancellation" below. |
| AMC Billing — Rates | ✅ Done | LHC + CP rates with Add/Edit/Deactivate/Delete; auto-calc total + amount-in-words |
| AMC Billing — Day-End | ✅ Done | DayEnd file generation |
| Reports | ✅ Done | Per-user access control; IT grants via UserDetail; sidebar shows single "Reports" link → card grid at `/reports`. 6 reports: Member, SSM Agreement, Expiry Analysis, Expiring Members, Remaining Value, Expiry Summary by Years. |
| Resorts Setup | 🔨 In progress | New `RESORTS_SETUP` AppModule (seed defaults: IT+Resort Ops FULL, Member Services VIEW, Finance/Credit NONE). Landing page `/resorts` (PBS-style menu, sidebar group "Resorts"). Function 1 done: **Resorts Setup** (`/resorts/setup`) — Resort master CRUD (list+search, add/edit modal shared via `ResortFormModal.tsx`, status toggle A/U, delete; buttons gated by canCreate/canEdit/canDelete; Eye icon on every row → detail). **Resort Detail** (`/resorts/setup/:id`) — details card + Edit + 4 info tabs (Getting There / Resort Facilities / Places of Interest / Unit Amenities) from `ResortInfoLine`; per-tab single-textarea editor, remark-style free text (400 chars total per category, validated client+server, no auto-uppercase — legacy print lines are mixed-case). Function 2 done: **Apartment Types Setup** (`/resorts/apartment-types`) — `ApartmentType` CRUD (list+search, add/edit modal, delete; resort picker from Resort master, lockType Select disabled/forced-LN unless resort `lockOnOff='Y'`; 9 business-supplied seed rows via `migrate-resorts.ts`). Function 3 done: **Apartments/Units Setup** (`/resorts/units`) — `ResortUnit` CRUD (paginated list with resort filter + search, add/edit modal with apartment-type dropdown restricted to the selected resort's types, RCI Reserved checkbox; 481 rows from `apt_mast.txt`). Function 4 done: **Units Availability Setup by Dates** (`/resorts/availability`) — block-centric CRUD over `AptBlock` (paginated list sorted startDate desc, cascade add form Resort→ApartmentType→Unit→start/end dates, styled delete-confirm modal). Each save auto-maintains the generated `ResAvailMast` per-day grid (`act/bal +1` per day on create, `-1` on delete, reverse-then-apply on edit; overlap-guarded 409). Per-row Eye icon → modal of the block's day grid. Header **Resorts Availability** button opens a **draggable, non-modal** popup (`DraggableWindow.tsx`) = ResAvailMast pivoted resort×date, cell=balNight (red ≤2, weekends highlighted), Product Type LHC (coCode 03 only)/CP, date + `<<`/`>>` 15-day paging. Remaining 2 functions are disabled placeholders: Public & School Holidays, CP Seasons & Points. |
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
