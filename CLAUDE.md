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
│   ├── seed-holidays.ts         # 12 business-supplied 2026 public holidays + 4 school holiday ranges (Holidays Setup; one table, no Informix file, idempotent upsert)
│   ├── migrate-cp-seasons.ts    # CP season calendar from ps_seasondate.txt (CP's Seasons Setup; one row per day, G/S/D)
│   ├── migrate-informix.ts  # Full Informix → PostgreSQL migration (run once)
│   ├── migrate-maa-mem.ts   # PBS (Zurich Payback Scheme) migration from maa_mem.txt
│   ├── migrate-maa-claim.ts # PBS Claims migration from maa_claim.txt
│   ├── migrate-amc-schedules.ts  # AMC schedules from amc_mem.txt + ps_amc_mem.txt
│   ├── migrate-amc-price.ts      # LHC AMC price master from amc_price.txt
│   ├── migrate-amc-price-points.ts  # CP points tiers from ps_ctrltab.txt
│   ├── migrate-rci-enrolment.ts # RCI Enrolment register from rci_enrol.txt (RCI fn 1; 25 of 43 cols) — NOT the same script as the line above
│   ├── migrate-rci-week.ts  # RCI week-number calendar from rci_week.txt (RCI fn 2; 6 of 8 cols, years >= 2026 only)
│   ├── migrate-rci-bulk-bank.ts # RCI Bulk Bank from bulk_bank.txt (RCI fn 3; 7 of 10 cols, check-in years >= 2026 only; applies NO grid deltas — see RciBulkBank)
│   ├── migrate-salesperson.ts  # Salesperson master from csp_mast.txt
│   ├── migrate-su-pt-reasons.ts  # SU/PT reason backfill from su_trans.txt + pt_trans.txt
│   ├── migrate-booking-entitlement.ts  # Booking entitlement nights used from booking_ent1.txt (LHC 03/15)
│   ├── migrate-amc-invoice-counter.ts  # Per-coCode AMC invoice running number from ctrl_billtab.txt (seeds AmcInvoiceCounter)
│   ├── migrate-products.ts  # Product / operating-company master from ps_company.txt (Products Setup; first 9 of 17 cols)
│   ├── migrate-lvc-codes.ts # LVC exchange-programme master from lvc_master.txt (fn 11 LVC Code; first 7 of 14 cols)
│   ├── migrate-resorts.ts   # Resort master from resort_mast.txt (Resorts Setup module) + business-supplied ApartmentType seed rows
│   ├── migrate-resort-info.ts  # Resort info lines from ps_resort_info.txt (normalized into ResortInfoLine)
│   ├── migrate-apt-category.ts # Apartment sleep types from apt_category.txt (Apartment Types Setup; 4 of 11 cols)
│   ├── migrate-resort-units.ts # Resort units from apt_mast.txt (Apartments/Units Setup; 5-col partial export)
│   ├── migrate-res-avail.ts # Per-day availability grid from res_avail_mast.txt (Units Availability by Dates; cols 0-4, chunked)
│   ├── migrate-apt-block.ts # Availability input blocks from apt_block.txt (Units Availability by Dates; cols 0-4, apartmentType derived from ResortUnit)
│   ├── migrate-maintenance.ts # Maintenance register from resmt.txt (Resorts Maintenance; cols 0-5, NO grid deltas — see ResortMaintenance)
│   ├── migrate-cp-season-points.ts # Season points chart, HOME half, from ps_seasonapt.txt (fn 9; first 12 of 24 cols, Sunday=index 0)
│   ├── migrate-lvc-season-points.ts # Season points chart, AWAY half, from ps_lvcapt.txt (fn 9; first 14 of 20 cols, Sunday=index 0)
│   ├── archive/             # One-off exports of data deliberately dropped from the schema (see its README)
│   └── migrations/          # Applied migration history
├── refresh-test-db.ps1      # Clears + re-imports all Informix data; use for UAT refreshes and live cutover
├── migrate-table.ps1        # Migrate a single table without full refresh (Member, PbsScheme, PbsClaim, AmcSchedule, RciEnrol, SuPtReason, AmcInvoiceCounter)
├── migrate/                 # Informix UNLOAD export files (not committed)
│   ├── *_unload.sql         # COMMITTED. The UNLOAD scripts for the Resort family — run these
│   │                        # with dbaccess instead of hand-writing the SELECTs:
│   │                        #   apt_mast_unload.sql        -> apt_mast.txt   (active resorts + unit whitelist)
│   │                        #   apt_block_unload.sql       -> apt_block.txt  (same two filters — keep in sync)
│   │                        #   resmt_unload.sql           -> resmt.txt      (whitelist only, full table)
│   │                        #   res_avail_mast_unload.sql  -> res_avail_mast.txt (active resorts; NO unit whitelist,
│   │                        #                                 the table has no unit column. Import ADDITIVELY)
│   │                        #   apt_mast_active_unload.sql -> apt_mast_active.txt (optional sweep, now redundant)
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
│   ├── rci_week.txt
│   ├── bulk_bank.txt
│   ├── csp_mast.txt
│   ├── agmt_can_cate.txt
│   ├── su_mast.txt
│   ├── su_trans.txt
│   ├── pt_trans.txt
│   ├── ctrl_billtab.txt
│   ├── ps_company.txt
│   ├── lvc_master.txt
│   ├── resort_mast.txt
│   ├── ps_resort_info.txt
│   ├── apt_category.txt
│   ├── apt_mast.txt
│   ├── apt_mast_active.txt  # optional — loaded by migrate-resort-units.ts when present
│   ├── res_avail_mast.txt
│   ├── apt_block.txt
│   ├── resmt.txt
│   ├── ps_seasondate.txt
│   ├── ps_seasonapt.txt
│   ├── ps_lvcapt.txt
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
NODE_TLS_REJECT_UNAUTHORIZED=0   # TLS interception — required for Prisma binary downloads
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

## TLS interception quirks (dev machine)

Outbound HTTPS on the dev machine is **intercepted and re-signed**, so anything that validates a
certificate chain against its own trust store fails until it is told about the interceptor's root CA.
Two separate interceptors have caused this — a corporate proxy and, since around Sept 2026, **Avast
antivirus' Web/Mail Shield** — so treat "unable to get local issuer certificate" as an environment
problem, not a broken remote.

- `NODE_TLS_REJECT_UNAUTHORIZED=0` must be set before running `prisma migrate dev` or `prisma generate`
- `bcryptjs` is used instead of `bcrypt` (native build blocked by proxy SSL)
- `@prisma/client` is in root `package.json`, not `backend/package.json` — backend resolves it from root `node_modules/`
- **Node already trusts Avast** via `NODE_EXTRA_CA_CERTS=C:\ProgramData\Avast Software\Avast\wscert.pem`
  (a machine env var, not set by this project) — which is why npm/Prisma kept working while **git did not**.

### git push/fetch: `SSL certificate problem: unable to get local issuer certificate`

**Git does not read `NODE_EXTRA_CA_CERTS`.** Git for Windows uses the OpenSSL backend with its own
bundle (`C:/Program Files/Git/mingw64/ssl/certs/ca-bundle.crt`, 127 CAs), which has no reason to
contain Avast's self-signed root — so every `push`/`fetch`/`ls-remote` to GitHub fails once Avast's
HTTPS scanning is on. It surfaced on 2026-09-09; the previous push (2026-09-03) had worked, so
scanning was enabled or the cert regenerated in between.

**Fixed by giving git a combined bundle**, applied globally on 2026-09-09:

```bash
mkdir -p ~/.gitcerts
cat "/c/Program Files/Git/mingw64/ssl/certs/ca-bundle.crt" \
    "/c/ProgramData/Avast Software/Avast/wscert.pem" > ~/.gitcerts/ca-bundle-avast.crt
git config --global http.sslCAInfo "C:/Users/peter/.gitcerts/ca-bundle-avast.crt"   # 128 certs
```

- **Do NOT use `http.sslVerify=false`.** It pushes blind over a connection that is genuinely being
  intercepted. The combined bundle keeps verification on and is barely more work.
- Use a **Windows-style path** (`C:/Users/...`) in the config value — Git for Windows does not
  reliably resolve an MSYS `/c/Users/...` path there.
- Set at **`--global`** scope, so it covers every repo on the machine (Avast intercepts everything),
  and it overrides the system-level `http.sslcainfo` in `C:/Program Files/Git/etc/gitconfig`, which
  is left untouched.
- **Avast regenerates `wscert.pem` on some updates.** If pushes start failing again with the same
  message, re-run the `cat` line only — the config path stays valid.
- One-shot equivalent, if you would rather not change global config:
  `git -c http.sslCAInfo=<bundle> push origin <branch>`.

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

**WinRM connection failures** (`New-PSSession ... WinRMOperationTimeout / PSSessionOpenFailed`):
Diagnose before touching firewall rules — the transport is usually fine. Run, in order:

```powershell
Test-NetConnection 199.1.1.32 -Port 5985   # TcpTestSucceeded True  => port open
Test-WSMan -ComputerName 199.1.1.32        # returns wsmid/ProtocolVersion => service healthy
```

If both pass, the problem is **authentication**, not networking, and it shows up as a *timeout* rather
than "Access is denied". Two causes, both fixed in `deploy-test.ps1` on 2026-07-27:
- **Bare username.** Dev machine and test server are both workgroup (not domain) members and the script
  connects by IP, so a bare `Administrator` gives the client no account context to negotiate against —
  it stalls until timeout. The script now qualifies it as `199.1.1.32\Administrator`, forcing local-account
  NTLM (which is what TrustedHosts enables). Pass `-RemoteUser` containing `\` or `@` to override.
- **Leaked remote shells.** `Remove-PSSession` used to run only on the success path, so any mid-script
  failure (`$ErrorActionPreference = 'Stop'`) leaked a shell on the server. Enough of them exhaust
  `MaxShellsPerUser` and every later `New-PSSession` times out. A `trap` now tears the session down on
  any terminating error. To clear existing leaks, RDP to the server and either restart the service
  (`Restart-Service WinRM`, simplest — drops all shells) or enumerate and remove them:
  ```powershell
  Get-WSManInstance -ResourceURI shell -Enumerate |
    ForEach-Object { Remove-WSManInstance -ResourceURI shell -SelectorSet @{ShellId=$_.ShellId} }
  ```

**PowerShell 5.1 script quirks** (already fixed in `deploy-test.ps1`, keep in mind for future edits):
- Non-ASCII characters (`—`, `→`, etc.) in string literals cause parse errors — PowerShell 5.1 reads scripts as Windows-1252 by default; UTF-8 multi-byte sequences for those chars include `0x94` which maps to a smart-quote (`"`) and prematurely closes the string. Use only ASCII in string literals; non-ASCII is safe in comments.
- Do not name a function parameter `$args` — it shadows PowerShell's built-in automatic variable and silently receives `$null` instead of the passed value.
- Do not use `exit` inside a `Invoke-Command` scriptblock — it closes the remote PS session, making all subsequent `Invoke-Command` calls fail with "session state is not Open".
- `Set-Location` in a remote scriptblock changes the PS path but not the native process working directory. Pass absolute paths to native executables (e.g. `pm2 start "$p\backend\ecosystem.config.js"`) instead of relying on `Set-Location`.
- **A plain `param()` block silently ignores a mistyped switch** — it lands in `$args` and the script runs on regardless. `.\deploy-test.ps1 -SkipFrontend -SchemaChanged -Migrade**D**b` (2026-08-13) therefore deployed new code against an **un-migrated database**, and every write 500'd on a `NOT NULL` violation until the real `-MigrateDb` run. `deploy-test.ps1` now **aborts before building or copying anything** if `$args` is non-empty, naming the bad token and suggesting the nearest valid parameter. Legitimate prefixes still bind (`-Migrate` → `-MigrateDb`). It deliberately does **not** use `[CmdletBinding()]`, which would also reject the typo but with PowerShell's opaque "positional parameter cannot be found" message instead of a suggestion. **Copy this guard into any new script that takes switches.**

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

The script: truncates RciBulkBank + RciWeek + RciEnrolment + BookingEntitlement + CpBookingEntitlement + PbsClaim + PbsScheme + Salesperson + SeasonPoint + ResortMaintenance + AptBlock + ResAvailMast + Resort + Product + LvcCode + CpSeasonDate + Member CASCADE (the Member CASCADE also clears AmcInvoice) → migrates members/agreements/nominees → migrates AMC schedules + PBS schemes + PBS claims + the `RciEnrolment` register + the `RciWeek` calendar (years >= 2026) → salespersons + products (`ps_company.txt`) + LVC codes (`lvc_master.txt`) + resorts (master + info + `apt_category.txt` apartment types + units from `apt_mast.txt` **and the optional `apt_mast_active.txt`** + `res_avail_mast.txt` availability grid + `apt_block.txt` blocks + `resmt.txt` maintenance + `bulk_bank.txt` RCI bulk bank (RCI fn 3 - needs ResortUnit **and** RciWeek, so it runs here rather than with the other RCI scripts) + `ps_seasonapt.txt` HOME season points + `ps_lvcapt.txt` AWAY season points) → public/school holiday seeds + `ps_seasondate.txt` CP season calendar → booking entitlements (LHC `booking_ent1.txt` + CP `ps_bookent1.txt`) → AMC invoice counter (`ctrl_billtab.txt`, resets `AmcInvoiceCounter` to the Informix baseline) → re-grants lhb_app permissions → prints final row counts.

> **Produce `apt_mast.txt`, `apt_block.txt` and `resmt.txt` with the committed `migrate/*_unload.sql` scripts, not the SELECTs in this file's history** — they carry the active-resort filter and the four-resort live-unit whitelist, and the three whitelists must stay identical. See `### ResortUnit`.

> ### After ANY refresh: verify row counts, don't assume the load succeeded
>
> A new Informix UNLOAD can change a file's **column layout** or introduce a **value the importer
> doesn't know**, and both failure modes are **silent** — the scripts `WARN` per row and carry on,
> so the run still ends with "migration complete" and a zero/short table. The 2026-08-27 refresh hit
> both at once:
>
> | Table | Loaded | Expected | Cause |
> |---|---|---|---|
> | `CpSeasonDate` | **0** | 424 | `ps_seasondate.txt` gained a leading `ps_cocode` column; the date parse failed on every row |
> | `LvcCode` | **11** | 22 | `lvc_master.txt` now uses status `C` (Cancelled), which was not in the A/U set |
>
> Both importers are fixed (offset detection / `C` → `U`), but the lesson generalises. **Run a count
> check after every refresh** and compare against the `### <Model>` sections, treating any table that
> comes back 0 or sharply short as a layout change until proven otherwise:
>
> ```bash
> PGPASSWORD=... psql -h <host> -U postgres -d lhb_mms -t -A -c "
>   SELECT 'CpSeasonDate', count(*) FROM \"CpSeasonDate\"
>   UNION ALL SELECT 'LvcCode', count(*) FROM \"LvcCode\"
>   UNION ALL SELECT 'Resort', count(*) FROM \"Resort\"
>   -- ... one line per migrated table
>   ;"
> ```
>
> Counts quoted in the `### <Model>` sections are **as-of a stated refresh** and drift with every
> re-export — re-check them rather than quoting a figure from prose (the same rule the
> `Resort.status` note already states).

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
.\migrate-table.ps1 -Table RciEnrolment                # RCI Enrolment register (rci_enrol.txt, 25 of 43 cols; truncates + reimports — post-go-live clobbers CRUD edits)
.\migrate-table.ps1 -Table RciWeek                     # RCI week calendar (rci_week.txt, 6 of 8 cols, years >= 2026; truncates + reimports — post-go-live wipes app-generated years)
.\migrate-table.ps1 -Table RciBulkBank                 # RCI Bulk Bank (bulk_bank.txt, 7 of 10 cols, check-in years >= 2026; needs Resort + ResortUnit + RciWeek; truncates + reimports — post-go-live clobbers CRUD edits)
.\migrate-table.ps1 -Table SuPtReason                  # SU/PT reason backfill (suCode + canCode overwrite)
.\migrate-table.ps1 -Table Salesperson                 # Salesperson master
.\migrate-table.ps1 -Table BookingEntitlement          # Booking entitlement nights used (LHC 03/15; truncates + reimports)
.\migrate-table.ps1 -Table CpBookingEntitlement        # CP point balances per year (CP 02; truncates + reimports)
.\migrate-table.ps1 -Table AmcInvoiceCounter           # Per-coCode AMC invoice running number (ctrl_billtab.txt; upsert, resets to Informix baseline)
.\migrate-table.ps1 -Table Product                     # Product / company master (ps_company.txt, first 9 of 17 cols; truncates + reimports — post-go-live clobbers CRUD edits)
.\migrate-table.ps1 -Table LvcCode                     # LVC exchange codes (lvc_master.txt, first 7 of 14 cols; truncates + reimports — post-go-live clobbers CRUD edits)
.\migrate-table.ps1 -Table Resort                      # Resort master + info + units + availability grid + blocks + maintenance + season points + RCI bulk bank (truncates + reimports — post-go-live clobbers CRUD edits). MUST include "RciBulkBank" in the TRUNCATE: it has a Cascade FK to Resort, and a plain TRUNCATE of a referenced table fails outright unless every referencing table is named in the same statement
.\migrate-table.ps1 -Table ApartmentType               # Apartment sleep types only (apt_category.txt; truncates + reimports — post-go-live clobbers CRUD edits)
.\migrate-table.ps1 -Table ResortUnit                  # Resort units only (apt_mast.txt + OPTIONAL apt_mast_active.txt; truncates + reimports — post-go-live clobbers CRUD edits)
.\migrate-table.ps1 -Table ResAvailMast                # Per-day availability grid only (res_avail_mast.txt; truncates + reimports — post-go-live clobbers CRUD edits)
.\migrate-table.ps1 -Table AptBlock                    # Availability blocks only (apt_block.txt; needs ResortUnit present for apartmentType lookup; truncates + reimports — clobbers CRUD edits)
.\migrate-table.ps1 -Table ResortMaintenance           # Maintenance register only (resmt.txt; needs ResortUnit for apartmentType lookup; applies NO ResAvailMast deltas; truncates + reimports — clobbers CRUD edits)
.\migrate-table.ps1 -Table CpSeasonDate                # CP season calendar (ps_seasondate.txt; one row per day, G/S/D; truncates + reimports — clobbers CRUD edits)
.\migrate-table.ps1 -Table CpSeasonPoint               # Season points, HOME half (ps_seasonapt.txt, first 12 of 24 cols; needs Resort for the FK; clears pointsType HOME + reimports — clobbers CRUD edits)
.\migrate-table.ps1 -Table LvcSeasonPoint              # Season points, AWAY half (ps_lvcapt.txt, first 14 of 20 cols; needs Resort for the FK; clears pointsType AWAY + reimports — clobbers CRUD edits)
.\migrate-table.ps1 -Table PbsClaim -DryRun            # Preview without writing
```

**Note:** After `-Table Agreement`, you must re-import dependent tables: `AmcSchedule`, `PbsScheme`, `PbsClaim`, `RciEnrol`, `BookingEntitlement`. `RciEnrolment` has no FK to Agreement so it survives, but its rows will only resolve a member name once the agreements are back.

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
- **`required` on `Input`/`Select` renders a red `*` beside the label (since 2026-09-08).** It
  used to be spread onto the DOM element and render **nothing** — and validate nothing either,
  since no form on these screens submits natively (Save is a plain `onClick`), so the prop was
  inert in both directions. It is now the marker for a mandatory field: pass it only where the
  field really is required, and keep the actual gate in the page's `canSave` with the zod
  schema as the authority.
- **URL search params** (`useSearchParams`) used for list pages so Back button restores results
- All text inputs in MemberForm use `setU()` handler (auto-uppercase)
- `buildPayload()` in MemberForm: empty string → null, dates → ISO, booleans → bool

#### One query key, one shape — and never narrow inside `queryFn`

A React Query key names a **cache entry**, not a request. Every `useQuery` with the same
key shares one stored value, and the last fetch to resolve wins. So two rules, both of
which have already been broken here:

1. **Every consumer of a key must unwrap the response identically.** Caching two shapes
   under one key makes the page that reads it second crash or misread, depending on which
   fetched last — and only sometimes, which is what makes it nasty to diagnose.
2. **Never filter, slice or otherwise narrow inside `queryFn`.** Cache the full response
   and narrow afterwards in a `useMemo`. A narrowing fetcher poisons the entry for every
   other consumer, and there is no local symptom in the file that did it.

> **The bug this cost us (2026-08-28).** RCI fn 2 (`RciWeeklyInterval.tsx`) and fn 3
> (`RciBulkBank.tsx`) both read `['rci-weeks', year]`, but fn 2 stored the whole
> `{ data, year, weeks }` envelope (`r.data`) while fn 3 stored the row array
> (`r.data.data`). Visiting fn 2 to generate a year and then opening fn 3's form for that
> same year served fn 3 the envelope, `weeks.map` threw, and the page went **blank** — no
> error boundary, just a white screen. Fixed by unwrapping to the array in both.
>
> It had been latent for as long as both pages existed; what made it reachable was
> advising staff to generate the year in fn 2 first. **Latent means unfired, not absent.**

**When two consumers genuinely need different data, give them different keys** — that is
the fix, not clever unwrapping. Keys of different lengths are already distinct:
`['resorts', '']` and `['resorts', q, status]` do **not** collide.

> **Note the shared-key comments in `useActiveResorts.ts` / `useActiveProducts.ts` are now
> stale on this point.** Each says it must cache the unfiltered response because
> `ResortMaster` / `Products` reads "the same key with `q=''`". Those list pages have since
> gained a `status` filter and their keys became three-element
> (`['resorts', q, status]`), so they no longer share the hooks' two-element
> `['resorts', '']` at all. **Rule 2 still stands and the hooks should not change** —
> filtering in `queryFn` would be wrong the moment anyone realigns the keys — but do not
> trust the stated collision as a live fact.

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
| `salespersonCode` | Salesperson code from `e_cse_code` — looked up in `Salesperson.code` |
| `canCode` | FK → `CancellationReason.code` (46 codes) — used for PT and TM; SU uses `suCode` instead |
| `suCode` | FK → `SuReason.code` (28 codes) — only meaningful when `acctClassify='SU'` |

**Net Purchase Price formula:** `purchasePrice − subFees − sinkFund − govtTax`

> ### There are NO RCI columns on Agreement (dropped 2026-09-02)
> `rciRefNo`, `rciNominee`, `rciEnrolDate`, `rciExpiryDate` and `rciFeePaid` were removed by
> migration `20260902090000_drop_agreement_rci_columns`. **`RciEnrolment` is the single source
> of truth for RCI data** — see `### RciEnrolment`.
>
> They were a denormalized cache of **one arbitrarily-chosen enrolment**. An agreement can hold
> several (90 keys held 2–4, typically a lapsed `1704-*` plus a newer `PENDING`), and the
> backfill `migrate-rci-enrol.ts` picked one by **file order, last non-empty value wins**,
> never writing null — so the cached row was arbitrary and stale values could never be cleared.
> Worse, Agreement Detail could edit the cache without the register ever seeing it: agreement
> `03 / 07889-KL-A-0789/M/I / 33767` held `1704-07539-XYZ` / `PETER WONG` against the
> register's `1704-07539` / `AHMAD RADZI BIN OTHMAN`.
>
> `getAgreement()` now calls **`currentEnrolment()`** (exported from
> `rci-enrolment.controller.ts`) and returns `rciEnrolment` + `rciEnrolmentCount`. That helper
> picks the **ACTIVE row, falling back to the highest `serialNo`** — only 2 agreement keys have
> more than one active row — matched on the full natural key, never the FK.
> **The RCI card on Agreement Detail is read-only** and the five fields are gone from
> `agreementUpdateSchema`, so `PUT /api/agreements/:id` can no longer write them.
>
> **19,853 rows carried a value and are archived at
> `prisma/archive/agreement_rci_archive_20260902.csv`.** All but **1,879** also exist in
> `RciEnrolment`; those 1,879 are every one `coCode 03` / `acctClassify TM`, because Informix's
> `rci_enrol` does not retain terminated agreements. Those agreements now read
> "No RCI enrolment on record" — accepted (business decision), which is why the archive exists.

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

### Product
Product / operating-company master for the **Products Setup** function (`/resorts/products`, Resorts
Setup fn 1). **29 records** from `ps_company.txt` (Informix `ps_company`), coCodes `01`-`29`. Fields:
`coCode` (**unique**, 2 chars), `coName`, `entType` (`W`=Week / `P`=Points), `status`
(`A`=Active / `U`=Inactive), `add1-3`, `telNo`, `faxNo`, `contactPerson`.

Our own products are `02` CONNECTIONPOINTS SYSTEM (P — CP), `03` MALAYSIA WEEK SYSTEM (W — LHC-A)
and `15` 8K-BASED WEEK SYSTEM (W — LHC-B); **only these three carry agreements**. The rest are
exchange partners / affiliated companies (`01` SINGAPORE POINT SYSTEM, `05` TANCO RESORT BHD,
`21` MADE AVAILABLE EXCHANGE RESORTS, `24` CLC, `26` SGI, `29` GREENHILL RESORT, …) and are what
**`LvcCode.coCode` points at** — see `### LvcCode`.

> **The first export was filtered.** The `ps_company.txt` handed over on 2026-07-29 initially held
> only 7 rows (02/03/15/20/24/25/26) and was re-extracted the same day to the full 29. Anything
> concluded from the 7-row version about which coCodes "don't exist" is wrong — notably the LVC
> relationship. `SELECT * FROM ps_company` unfiltered is the correct UNLOAD.

**Only the first 9 of the 17 source columns are imported** (business decision) — the accounting codes
`psc_coincode`/`psc_invt`/`psc_arco` and the legacy audit + lock columns are dropped, as everywhere
else in this codebase.

**`entType` is a plain `String`** validated by a `z.enum(['W','P'])` in the controller, **not** the
`EntitlementType` Prisma enum — adding a value later must not require a migration (same reasoning as
`CpSeasonDate.season`). **`status` is the same** — `z.enum(['A','U'])`, A/U to match `LvcCode.status`
and `Resort.status`, not the boolean `isActive` used by the AMC rate tables.

**`status` was added 2026-08-17** (migration `20260817090000_add_product_status`), because a product
can almost never be *deleted* — `deleteProduct` refuses 409 while any Agreement / AmcSchedule /
Resort / LvcCode carries the `coCode`, which is true of nearly every row — so retiring a company that
is no longer an active exchange partner needs a status instead.

> ### The active set is a WHITELIST IN THE IMPORTER, not staff toggles (2026-08-27)
> `ps_company` has no usable status column (`psc_lockstatus[16]` stays unmigrated), so every row
> would land at the DB `DEFAULT 'A'`. **`ACTIVE_CODES` in `prisma/migrate-products.ts` is the
> authoritative active set** — `02`, `03`, `15` (our own products) plus `24` CLC, `25` ABSOLUTE
> WORLD TRAVEL and `26` SGI (the exchange partners currently traded with). **6 active / 23
> inactive.**
>
> The script is deliberately **reconciling, not insert-only**: it stamps `status` on fresh inserts
> *and* sweeps the whole table afterwards (`updateMany` in both directions), so the whitelist holds
> whether the caller truncated first (`migrate-table.ps1 -Table Product`, `refresh-test-db.ps1`) or
> the script is re-run additively. Both call sites route through it, so **no PowerShell change was
> needed** and every future refresh reapplies the same set.
>
> **A status toggled through Products Setup (fn 1) does NOT survive a refresh** — that is the
> intent, not the old "re-import clobbers edits" caveat being tolerated. **To change the active set,
> edit `ACTIVE_CODES` and re-run.** Same pattern as `ACTIVE_CODES` in
> `prisma/seed-cancellation-reasons.ts` (a business-defined active set overriding the source column)
> and `CHECK_TIMES` in `migrate-resorts.ts` (business-supplied values baked into the importer).
>
> **`01` and `20` are deactivated even though they still own an ACTIVE resort** — `V-SGH` (01) and
> `V-LDBR` (20, the largest partner resort at 78 units / 2,139 availability records). Confirmed by
> the business: both products are no longer active. The consequence is that neither resort can be
> charted in the **Resorts Availability** popup, which lists active products only; everything else
> about them keeps working, since product status is checked in dropdowns only and never server-side.

**Deactivating hides a product from every product dropdown, and nothing else** — the LVC Code form's
product picker (fn 10) and the CP Points Deduction **Charged To** picker (fn 9), both via the shared
**`frontend/src/hooks/useActiveProducts.ts`** hook. Use that hook for any new product dropdown. It
mirrors `useActiveResorts` exactly, including the cache rule: it caches the **unfiltered** response
under `['products', '']` and filters in a `useMemo` — **never inside `queryFn`** (see *One query key,
one shape* under Key conventions / Frontend). fn 1 must still show inactive rows, since that page is
where they are managed. It also returns `allProducts` (unfiltered) because both consumer pages use
the same array to resolve a stored `coCode` to a display **name**, which must keep working for a
retired product; its exported `productOptions(products, allProducts, selected)` helper appends the
currently-selected product to the option list when it has since been deactivated, so opening such a
record can't silently blank the control and rewrite the stored code on save.

**Server-side status checks were deliberately NOT added** — `productMissing()` in
`lvc-codes.controller.ts` and `season-points.controller.ts` still accept an inactive `coCode`, so
existing records referencing a retired product stay editable and saveable. Same decision as inactive
resorts. The fn 1 list is ordered **Active first, then Inactive**, each by code
(`orderBy: [{ status: 'asc' }, { coCode: 'asc' }]`, mirroring `listLvcCodes`).

**No relations, and no other module reads this table yet.** `Agreement`, `AmcSchedule`, `Resort`,
`AmcPrice` etc. keep `coCode` as a plain string with no FK, and `ProductBadge.tsx` still hardcodes
the LHC/CP names. Wiring those to this table is a deliberate later change. Because there is no
DB-level FK, **`deleteProduct` is the only thing protecting referential integrity**: it counts
`Agreement`/`AmcSchedule`/`Resort`/**`LvcCode`** rows carrying the `coCode` and returns **409** with
those counts if any exist. In practice 02/03/15 can never be deleted (agreements), and most partner
codes are held by an `LvcCode` row.

**`coCode` is immutable after create** (the whole system keys off it) — same rule as `resortCode`.
Retiring a product is normally the **A/U status toggle** (`PATCH /:id/toggle`, same shape as the
Resort and LvcCode toggles); hard delete still exists behind the 409 usage guard above.
Imported via `prisma/migrate-products.ts` (`migrate-table.ps1 -Table Product`, also in
`refresh-test-db.ps1`). It has a real Informix source, so it **truncates and reimports** —
post-go-live re-import **clobbers CRUD edits**. **That includes `status`, but by design since
2026-08-27**: the importer applies the `ACTIVE_CODES` whitelist above rather than leaving every row
at the `DEFAULT 'A'`, so a refresh restores the intended 6 active / 23 inactive split instead of
undoing it. `LvcCode.status` still carries the older, unmanaged version of this caveat.

### LvcCode
Leisure Vacation Club exchange-programme master for the **Leisure Vacation Club (LVC) Code
Maintenance and Setup** function (`/resorts/lvc-codes`, Resorts Setup fn 10). **22 records** from `lvc_master.txt` (Informix
`lvc_master`) — **11 active / 11 inactive** as of the 2026-08-27 refresh, straight from the source
(`lvc_status` is 11 `A` / 11 `C`, and `C` maps to `U`). The earlier export was 23 rows all `A`, which
the app then showed as 5 active / 18 inactive after staff retired 18 through the CRUD screen; those
retirements were clobbered by the refresh, as a re-import always does.

**What an LVC code is:** the exchange arrangement under which a member books *outside their own
product*.
- `LVC-CP` — coCode 03/15 books a coCode 02 resort and vice-versa; both sides are our own members.
- `LVC-SGI` / `LVC-CLC` / … — coCode 03/15/02 books an external partner's resorts. Partner resorts
  opened to our members are called **MAR (Make Available Resorts)** — `LVC-MAE` "MADE AVAILABLE
  EXCHANGE" is the generic bucket for that arrangement.

Fields: `lvcCode` (**unique**, e.g. `LVC-CP`), `coCode`, `lvcName`, `status` (`A`/`U`),
`incoming`, `outgoing`, `faxBatch`.

**`coCode` references `Product.coCode`** (Informix `lvc_cocode` → `ps_company.psc_cocode`). All 23
rows resolve against the full 29-row `ps_company` export — verified with a LEFT JOIN, 0 unmatched.
Enforced as a **lookup, not a DB FK** (`productMissing()` in `lvc-codes.controller.ts`, **400** when
the code names no product), matching how `ResortUnit.apartmentType` is validated and how every other
`coCode` column in this codebase is stored. Nullable, so "None" is allowed. The form offers a
**product dropdown**, and the list resolves the product name client-side from `productsApi.list()`
(no Prisma relation exists). `deleteProduct` counts `LvcCode` in its 409 usage guard.

> **Historical note — do not re-derive the old conclusion.** The first `ps_company.txt` handed over
> (2026-07-29) was a **filtered 7-row export**, against which only 5 of the 23 `lvc_cocode` values
> matched. That led to a wrong "separate legacy code sequence, no FK possible" finding, since
> corrected: the full export has 29 rows (coCodes 01-29) and every LVC row matches. If a future
> export looks partial, check its row count before concluding the relationship is broken.

**The three counters are imported but never shown and never written.** `incoming` / `outgoing` /
`faxBatch` are running counters owned by the legacy exchange process. They are migrated so no data
is lost, but they render nowhere on the screen and are **deliberately absent from the create/update
zod schema** in `lvc-codes.controller.ts` — so a crafted payload cannot alter them either (verified:
`PUT` with `incoming: 9999` leaves `LVC-SG` at 519). New rows start at 0 via the DB default. Wire
them up when the booking/exchange module gives them meaning.

**Only the first 7 of the 14 source columns are imported** (business decision) — `user_create`,
`date_create`, `user_modify`, `date_modify`, `user_cancel`, `date_cancel` and `lock_status` are
dropped, as everywhere else in this codebase.

**`lvcCode` is immutable after create** (rename = delete + re-add), same rule as `Product.coCode` /
`resortCode`. Retiring a code is normally the **A/U status toggle** (`PATCH /:id/toggle`, same shape
as the Resort toggle); **hard delete** also exists and has **no usage guard** — nothing references
`LvcCode` yet, so add one here when the exchange module starts storing `lvcCode` on its records.
**The list is ordered Active first, then Inactive, each alphabetical by `lvcCode`**
(`orderBy: [{ status: 'asc' }, { lvcCode: 'asc' }]` in `listLvcCodes`, mirroring `listResorts`) —
with 18 of the 23 codes now retired, this keeps the five live ones at the top.

Imported via `prisma/migrate-lvc-codes.ts` (`migrate-table.ps1 -Table LvcCode`, also in
`refresh-test-db.ps1`). Real Informix source, so it **truncates and reimports** — post-go-live
re-import **clobbers CRUD edits**. **That includes `status`: every row comes back `A`**, so the 18
retirements would be undone — unlike `Resort`, whose importer is additive and never pushes Informix
statuses back over app edits.

### Resort
Resort master for the **Resorts Setup** module. **324 records** from `resort_mast.txt` (Informix
`resort_mast`, **unfiltered** since 2026-07-30). Fields: `resortCode` (unique,
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
> **The export was unfiltered on 2026-07-30 (7 → 324 rows).** It had been
> `WHERE re_resort_status='A' AND re_cocode IN ('03','15','02')`. The wider set is needed so the
> **LVC exchange resorts** — the `V-*` codes (`V-SGI1` SGI Damai Laut, `V-MAE1..20`, `V-CLC1/2`,
> `V-AWT1/3`, …) — exist for **CP Points Deduction**'s Non-Home tab (fn 9) to reference. Every
> `Resort.coCode` resolves against `Product.coCode` (0 unmatched).
>
> **The active/inactive split is 12 / 312, not the 49 / 275 of the original import** (checked
> 2026-08-11). Staff retired resorts through the Resorts Setup screen afterwards, and
> `migrate-resorts.ts` is **additive** (`skipDuplicates`, no update), so re-importing
> `resort_mast` never pushes Informix's statuses back over app edits. The 12 active are
> CP-PBR, L-10016, L-10024, L-10025, L-10026, L-101, V-CLC1, V-CLC2, V-LDBR, V-SGH, V-SGI1,
> V-SGI5 — and they are exactly the resorts that carry units. Anything keyed off "active"
> (the `useActiveResorts` dropdowns, the Apartment Types list, the availability chart, and
> the `apt_mast`/`apt_block` UNLOADs) moves with this number, so **re-check it rather than
> quoting a figure from prose.**
>
> **`status`: Informix uses `A`/`I`; the importer maps `I` → `U`** to keep this codebase's
> A=Active / U=Inactive convention, which the A/U toggle and the Active/Inactive badge both
> depend on. Only `A` stays `A`.
>
> **Re-import is ADDITIVE, and must stay that way.** `migrate-resorts.ts` uses
> `createMany({ skipDuplicates: true })` on the unique `resortCode` and does **not** truncate, so
> running it alone inserts only new codes and leaves existing rows (plus their business-supplied
> `CHECK_TIMES` and any CRUD edits) alone. **`migrate-table.ps1 -Table Resort` and
> `refresh-test-db.ps1` DO truncate `Resort`, which cascade-deletes `ResortInfoLine`,
> `ApartmentType`, `ResortUnit`, `AptBlock`, `ResAvailMast` (~95k rows), `ResortMaintenance`
> (~7.3k) and `SeasonPoint`** — they re-import all of those, but it is slow and is where the
> `CachedPlan` OOM bites. To add resorts only, run the script directly:
> `npx ts-node --transpile-only prisma/migrate-resorts.ts`.
>
> **Every resort dropdown lists ACTIVE resorts only** (business rule, 2026-07-30) — pickers *and*
> resort filters, across Apartment Types, Apartments/Units, Units Availability, Resorts Maintenance
> and CP Season Points. Centralised in **`frontend/src/hooks/useActiveResorts.ts`**; use that hook
> for any new resort dropdown rather than calling `resortsApi.list()` again.
> **RCI Enrolment (RCI fn 1) has a THIRD sibling**, `frontend/src/hooks/useRciResorts.ts`,
> narrowing the same cache to `status === 'A' && rciAffiliate === 'Y'`. Its `resortOptions()`
> must append a synthetic option for a stored code that matches no resort at all -- that
> column is free text -- where `productOptions()` can safely fall back to the base list.
> **Products follow the same rule since 2026-08-17** via the sibling hook
> **`frontend/src/hooks/useActiveProducts.ts`** — same cache discipline, plus an `allProducts`
> escape hatch and a `productOptions()` helper for name resolution and retired selections.
> See `### Product`.
> - The hook caches the **unfiltered** response under `['resorts', '']` and filters in a
>   `useMemo`. **Never filter inside `queryFn`** — see *One query key, one shape* under
>   Key conventions / Frontend. (That rule stands, but the `ResortMaster` collision this
>   comment used to cite is no longer live: its key gained a `status` element and became
>   `['resorts', q, status]`, which is a different cache entry.)
> - `ResortMaster` is the only screen that still calls `resortsApi.list()` directly, by design.
> - **Server-side status checks were deliberately NOT added.** Existing records belonging to a
>   resort that later goes inactive stay reachable and editable (e.g. a CP season-points URL naming
>   an inactive resort still loads); the dropdowns just stop offering it for new setup.
>
> **Dependent data is scoped by resort STATUS, not by a hardcoded resort list** (since
> 2026-08-11). `apt_mast.txt` and `apt_block.txt` join `resort_mast` and take
> `re_resort_status = 'A'`, so units and blocks exist for the 12 active resorts only;
> `resmt.txt` is still a full-table export (see `### ResortMaintenance`); `ps_seasonapt.txt` is
> `CP-PBR` only. **`res_avail_mast.txt` was re-exported unfiltered on 2026-08-26** (616,538
> rows over 317 resorts, up from 94,876 over 7), which **closed the long-standing gap where the
> six active `V-*` resorts had units and blocks but no availability grid at all** — all six now
> have one. `migrate-res-avail.ts` filters it back to the 12 active resorts on load
> (**133,988 rows**); see the loader-backstop note under `### ResortUnit`. They still don't
> surface in the Resorts Availability chart unless their product is picked, since it charts one
> coCode at a time and they are 20/24/26/01.
> **`apt_category.txt` is no longer an exception** — since 2026-08-10 it is unfiltered and gives
> **320** of the 324 resorts their apartment types (487 rows), which is what closed the fn 9
> grandfathering gap below from 407 pairs to 4.
> **The other exception is `ps_lvcapt.txt`** (fn 9's Non-Home tab, `SeasonPoint` AWAY rows), which is unfiltered and references
> **264** of the 324 resorts — that widened export is exactly what it was for. Because those resorts
> have no `ApartmentType` rows, fn 9 grandfathers apartment types already stored in its own table
> rather than requiring them in fn 3; see `### SeasonPoint`.

Full CRUD at `/resorts/setup` under `RESORTS_SETUP` matrix permission (view/create/edit/delete +
status toggle; `resortCode` immutable after create; delete is hard delete — no FKs reference Resort yet).

> **`coCode` is validated against `Product`, not a fixed list** (fixed 2026-08-17). Both the form
> dropdown and the server schema used to hardcode `03`/`15`/`02`, which **could not express the data
> they guarded**: resorts span 24 coCodes — `13` INTERCHANGE VACATION CLUB alone holds 111, `07` DIAL
> AN EXCHANGE 68, against `03`'s 48 — because the partner/LVC `V-*` exchange resorts belong to the
> exchange partners. Adding a resort on any other product returned "Validation failed", and editing an
> existing one risked silently rewriting its product. The schema is now `z.string().max(2)` plus a
> `productMissing()` lookup (**400** `Unknown product code XX`), the same lookup-not-FK pattern as
> `lvc-codes.controller.ts` and `season-points.controller.ts`; the form offers active products via
> `useActiveProducts`. **Product status is deliberately not checked server-side** — a resort on a
> since-retired product must stay saveable.
Post-go-live resorts are maintained in MMS — re-running `migrate-table.ps1 -Table Resort` truncates and
clobbers app edits.

### ResortInfoLine
Normalized resort information lines from Informix `ps_resort_info` (wide 38-col table → one row per
line). **1,326 lines** from `ps_resort_info.txt` across **50 resorts** (was 199 across 7, before the
export was widened). Fields: `resortId` (FK → Resort.id, **onDelete: Cascade** — safe FK, resortCode is genuinely
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
`resortCode` immutable after create (move = delete + re-add).

**Delete is refused 409** while any `ResortUnit`, `AptBlock`, `ResAvailMast` or `SeasonPoint` row at
that resort still names the type — every one of them references it by string with no FK (deliberate:
types are renamable through this same CRUD), so the controller count is the only guard. `ResAvailMast`
is counted in its own right because the grid was imported straight from `res_avail_mast.txt` and holds
rows for types whose blocks were never exported; `ResortMaintenance` is deliberately left out, since it
derives its type from `ResortUnit`, which is already counted.

**487 rows from `apt_category.txt`** across **320 resorts** (Informix `apt_category`, a partial
4-of-11-col export). Imported via `prisma/migrate-apt-category.ts`
(`migrate-table.ps1 -Table ApartmentType`, also bundled into `-Table Resort` and
`refresh-test-db.ps1`, all of which truncate `"ApartmentType"` explicitly). Real Informix source,
so it **truncates and reimports** — post-go-live re-import **clobbers CRUD edits**.

> **This replaced a 9-row hand-transcribed seed on 2026-08-10.** Until then there was no UNLOAD
> file and the 9 rows lived in `APARTMENT_TYPES` in `prisma/migrate-resorts.ts` (like `CHECK_TIMES`).
> The real export reproduces all 9 **verbatim**, so nothing was lost; the const and its insert block
> were deleted from `migrate-resorts.ts`, which now only notes where the data comes from. Prose
> elsewhere may still say "9 business-supplied seed rows" — this section wins.
>
> **The lock-type rule is enforced on CRUD but NOT on import.** 3 rows (`V-SS` SLEEP2/4/6) carry
> LM/LS even though `V-SS` has `lockOnOff='N'` — a legacy inconsistency (`V-SS` duplicates `L-105`,
> which *does* have `lockOnOff='Y'`; both are Inactive). They import **verbatim** and are reported
> as a WARN rather than coerced to LN, so a re-import cannot disagree with Informix — the same
> reasoning as the `LvcCode` source typos. The screen still refuses to *set* LM/LS on such a resort,
> so editing one of those rows silently normalises it to LN.

**The list shows types on ACTIVE resorts only** (business rule, 2026-08-10) — `where: { resort:
{ status: 'A' } }` in `listApartmentTypes`, which narrows 487 rows to **17 across 12 resorts**
(was 19/13 before the active set shrank to 12 — the number moves with `Resort.status`).
Unlike the resort *dropdowns* (client-side via `useActiveResorts`, which must not filter in
`queryFn` because `ResortMaster` shares that cache), this filter is **server-side**: it is the
screen's own endpoint, has no shared cache, and the search terms are ANDed with it so an inactive
resort can't be surfaced by searching for it. Rows on an inactive resort are **hidden, not
deleted** — they still satisfy the fn 9 season-points grandfathering check (which queries the
table directly, not this endpoint) and reappear if the resort is reactivated.

CRUD at `/api/apartment-types` under `RESORTS_SETUP` matrix permission.

### ResortUnit
Unit-number register per resort for the **Apartments/Units Setup** function (`/resorts/units`).
**358 rows** from `apt_mast.txt` — a deliberately **partial** export of Informix `apt_mast` (5 of 15 cols;
dates/audit/lock_status skipped per business decision). Fields: `resortId` (FK → Resort.id, Cascade —
safe FK), `resortCode` (denormalized natural key), `unitNo` (`apt_code` — includes lock-off compound
codes like `3227/3228` and dotted codes like `1.12A`, stored as plain strings), `apartmentType`
(`apt_unit_type` — **no hard FK to ApartmentType**; validated on create/update that the
`(resortCode, apartmentType)` pair exists, 400 otherwise, since apartment types are renamable via
their own CRUD), `occupancy` (Int?), `rciReserved` (Y/N, default N). Unique: `[resortCode, unitNo]`
(`apt_code` is NOT globally unique — codes 1-21 repeat across L-10024/L-10025/L-101).

> ### `rciReserved` is a WHITELIST IN THE IMPORTER at four resorts (2026-08-27)
> `apt_rci_reserved` in the source is stale — it exported `Y` for **every** unit at L-10016 (30),
> L-10025 (22), L-10026 (14), L-101 (10) and CP-PBR (48), and for 12 of L-10024's 34.
> **`RCI_RESERVED` in `prisma/migrate-resort-units.ts` overrides it** for the resorts it names: a
> unit there is `Y` only if listed, everything else is forced `N`.
>
> | Resort | | RCI-reserved | Was |
> |---|---|---|---|
> | L-10016 | KEMANG INDAH | **none** | 30 |
> | L-10025 | GOLDEN CITY | **none** | 22 |
> | L-101 | SANTANA | **none** | 10 |
> | L-10024 | GREENHILL | `A6`, `A7` | 12 |
> | L-10026 | LEISURE COVE | `504`, `506` | 14 |
> | CP-PBR | PERDANA | `3201/3202`, `3203/3204` | 48 |
>
> **Total RCI-qualified units: 6**, down from 136. The map now covers **all six resorts on our own
> products** (`02`/`03`), so the only resorts still taking the source value are the `V-*` partner
> ones — and every one of those already exports `N` throughout. **Resorts ABSENT from the map keep
> whatever the source says**, so a newly activated partner resort is not silently forced to `N`.
>
> Same reconciling shape as `ACTIVE_CODES` in `migrate-products.ts` — the flag is stamped on fresh
> inserts *and* swept over the table afterwards (`updateMany` in both directions), so it holds on a
> truncate-and-load *and* an additive re-run, and it warns if the map names a unit that isn't in the
> register. All three callers route through the script (`refresh-test-db.ps1`,
> `migrate-table.ps1 -Table ResortUnit`, `-Table Resort`), so no PowerShell change was needed.
> **A box ticked in fn 4 does NOT survive a refresh at those four resorts** — edit `RCI_RESERVED`
> and re-run instead.
>
> **Existing `RciBulkBank` history is unaffected.** `rciReserved='Y'` is a **save-time** rule, so
> `migrate-rci-bulk-bank.ts` imports a banked week on an un-flagged unit verbatim with a WARN
> (`imported anyway`). Un-flagging only stops **new** weeks being banked. Three units that hold
> banked weeks are now `N` — CP-PBR `3205/3206` (51 weeks), CP-PBR `3227/3228` (103) and L-10024
> `A8` (51) — so those 205 records stay readable, editable and deletable in RCI fn 3, and their
> units simply stop appearing in its Add picker.
**Delete is refused 409** while the unit still has any `AptBlock` (fn 5), `ResortMaintenance` (fn 6)
or `RciBulkBank` (RCI fn 3) record, of any date — all three carry the unit as a denormalized
`resortCode` + `unitNo` pair and cascade off **`Resort`**, not `ResortUnit`, so without the count a
delete would silently orphan them (still listed in fns 5/6 and RCI fn 3, still contributing to the
`ResAvailMast` grid, unreachable from any picker). The message names all three counts and surfaces
inside the confirm modal. Clear the availability, maintenance and banked weeks first, then delete
the unit.
`resortCode` immutable after create. List endpoint is **paginated** (`page`/`pageSize`, default 50,
returns `{ data, total, page, pageSize }`) with `q` search + `resortCode` filter.
Seeded via `prisma/migrate-resort-units.ts` (`migrate-table.ps1 -Table ResortUnit`, also bundled into
`-Table Resort` and `refresh-test-db.ps1` — post-go-live re-import clobbers CRUD edits).
CRUD at `/api/resort-units` under `RESORTS_SETUP` matrix permission.

> **Two filters shape this table — see `migrate/apt_mast_unload.sql`, which is now the
> authoritative UNLOAD (do not hand-write it).**
> 1. **ACTIVE resorts only** (`resort_mast.re_resort_status = 'A'`). Added 2026-08-11 after a
>    full re-migrate without it loaded **12,007** rows — 11,659 of them on 304 **retired**
>    resorts — which buried the Units screen (it does *not* filter by resort status, unlike
>    the Apartment Types list). Driven off `resort_mast`, so retiring/reactivating a resort in
>    Informix changes the next export by itself.
> 2. **A live-unit whitelist for four resorts** whose registers still carried decades of retired
>    unit numbers. The business supplied the authoritative lists on 2026-08-11:
>
>    | Resort | | Kept | Was |
>    |---|---|---|---|
>    | L-10024 | GREENHILL — `A1`..`A34` | 34 | 61 |
>    | L-10025 | GOLDEN CITY — `B1`..`B22` | 22 | 42 |
>    | L-10026 | LEISURE COVE — floors 4 and 5 | 14 | 49 |
>    | CP-PBR | PERDANA — the whole `32xx` family | 48 | 283 |
>
>    **L-10016 KEMANG INDAH (30) and L-101 SANTANA (10) are deliberately NOT whitelisted** —
>    they already *are* the live register, so a list would add no protection and only risk a
>    typo dropping a good unit. Note Kemang Indah's sheet writes the letter as a prefix
>    (`A1.12`) where Informix stores it as a suffix (`1.12A`) — same 30 units, don't "fix" it.
>
>    **CP-PBR is lock-on/lock-off, so its 16 apartments are 48 rows**: `3201` (SLEEP4) +
>    `3202` (SLEEP2) + `3201/3202` (SLEEP6). All three are live — the grid carries
>    `actNight = 16` for each sleep type. Keeping only the 16 combined codes would delete every
>    SLEEP2 and SLEEP4 unit at the resort.
>
> **The same whitelist is repeated in `apt_block_unload.sql` and `resmt_unload.sql` and the
> three MUST stay in sync** — blocks and maintenance reference units by string with no FK, so a
> mismatch imports records for units that no longer exist.

> ### Loader backstop: the active-resort filter is enforced on IMPORT too (2026-08-26)
> The active-resort join lives in `apt_mast_unload.sql` / `apt_block_unload.sql`, but it is easy
> to lose when the UNLOAD is hand-run — and it **was** lost. The `apt_mast.txt` of 2026-08-11
> carried the four-resort unit whitelist but **not** the `resort_mast` join: 12,047 rows over
> 316 resorts, 11,689 of them on retired resorts, which is what buried the fn 4 Units screen
> (it does not filter by resort status, unlike the fn 3 Apartment Types list). `apt_block.txt`
> had the same defect (25,266 rows, 20,104 retired).
>
> **`migrate-resort-units.ts`, `migrate-apt-block.ts` and `migrate-res-avail.ts` now filter to
> `Resort.status = 'A'` themselves**, and print the skipped count plus a pointer to the UNLOAD
> script. It costs nothing when the export is already filtered, and a bad export can no longer
> reach the screens. The three MUST stay in step — blocks and grid rows must never outlive the
> unit register.
>
> This is a **backstop, not a replacement**: the whitelist is business data that only the UNLOAD
> can apply, and it is working (L-10024 is exactly `A1`..`A34`, L-10026 exactly floors 4 and 5,
> CP-PBR the 48-row `32xx` family). Keep exporting through the committed `*_unload.sql` scripts.
>
> **`migrate-maintenance.ts` is deliberately NOT filtered** — `resmt.txt` stays a full-table
> export, so 6,069 of its 10,904 rows sit on retired resorts and import with a null
> `apartmentType`. Verified harmless: **none of them is current-or-future**.

**A second, optional source file.** `migrate-resort-units.ts` reads `apt_mast.txt` (required) **and
`apt_mast_active.txt`** (optional — skipped with a note when absent, so no run depends on it), from
`migrate/apt_mast_active_unload.sql`. It sweeps in every active resort *other* than the four
whitelisted, as a guarantee that no active resort lands without units. Since `apt_mast_unload.sql`
gained the active-resort join it is **redundant by default** and kept only as a top-up / cross-check.
The two overlap by design: rows are de-duplicated in memory on `(resortCode, unitNo)`, **first file
wins**, and the count is reported as `duplicate` in the run summary. `migrate-table.ps1` shows it
under `Extra` as `[found - will be loaded]` / `[not present - skipped]` via a new `OptionalFiles`
key on the `ResortUnit` and `Resort` configs.

> **`apt_code` is CHAR and trailing/leading blanks are significant in the source.** V-CLC2 exports
> **40** rows but loads **30**: ten of its codes are the same code re-entered right-aligned
> (`"     1-6"` vs `"1-6"`) with a mismatched SLEEP4 type. The loader trims, so they collapse —
> correct behaviour, and now visible as `duplicate` in the summary rather than silent.

### AptBlock (Units Availability input record)
The input record for the **Units Availability Setup by Dates** function (`/resorts/availability`).
One row per (resort, unit, date-range) block — this is what staff CRUD. **5,162 rows** from
`apt_block.txt`
(cols `[0..4]` migrated: resortCode, unitNo, startDate, endDate, blockNo — create-user/col5 + audit
cols NOT migrated). Fields: `resortId` (FK → Resort.id, Cascade), `resortCode`, `unitNo` (incl. compound
lock-off codes like `3005/3006`), `apartmentType` (derived from ResortUnit at CRUD time; **null** when
the unit isn't in the `apt_mast` export — **0 such rows** since the 2026-08-11 re-export aligned the two
filters, was 59), `startDate`/`endDate`
(plain TIMESTAMP UTC-midnight business dates), `blockNo` (Int?, per-unit running block number).
Unique: `[resortCode, unitNo, startDate, endDate]`. **The function is ADD-ONLY (2026-08-14, business
decision): a record is created, viewed or deleted, never edited.** `PUT /api/apt-blocks/:id`,
`updateAptBlock` and the page's edit button are gone; correcting a record means deleting it and adding
it again. This also retires the shrink guard that briefly existed — with no update path, the delete
guard below is the only way a record can leave, so maintenance can no longer be stranded. Seeded via
`prisma/migrate-apt-block.ts` (`migrate-table.ps1 -Table AptBlock`, bundled into `-Table Resort` +
`refresh-test-db.ps1` — runs after `migrate-resort-units.ts` since it needs ResortUnit for the type
lookup). CRUD at `/api/apt-blocks` under `RESORTS_SETUP` matrix. **Each save maintains the ResAvailMast
grid** (see below).

> **Exported by `migrate/apt_block_unload.sql`, which carries the SAME two filters as
> `apt_mast_unload.sql`** — active resorts only, plus the four-resort unit whitelist. Blocks must
> not outlive the unit register: without the active filter the export is 25,266 rows, 20,104 of
> them on retired resorts, each importing with a null `apartmentType`. A side benefit of the status
> filter is that the source's only duplicate key (V-AVR2 unit `1A`, the same March-2002 range five
> times) sits on an Inactive resort and drops out, so all 5,162 rows insert.

**Two Add paths, split by `coCode` (2026-08-14).** Our own products (`03`/`15`/`02`) have real,
individually-numbered apartments (`A1`, `3227/3228`, `1.12A`), so they are set up one unit at a time
through **Add availability** (`POST /api/apt-blocks`), whose resort dropdown now lists only those
resorts. Everything else is **MAR (Make Available Resorts)** — the partner/exchange resorts reached
through an LVC exchange programme — which allocates *N interchangeable units of a sleep type for a
period* rather than naming apartments, and goes through **Add MAR availability**
(`POST /api/apt-blocks/batch`, `createAptBlockBatch`). **The page's resort *filter* still lists every
active resort**, so MAR records stay viewable and deletable exactly as before, and delete is one path
for both. The split is enforced server-side (**400** when a batch names an `03`/`15`/`02` resort),
mirroring `requireResortOfType()` in fn 9 — the dropdown only reflects it.

**The MAR batch keys a unit COUNT, not units**, and creates the `ResortUnit` rows *and* their
`AptBlock` records together. Body: `resortCode`, `apartmentType` (must be registered in fn 3),
`unitCount` (1..`MAR_MAX_UNITS` = 200), `occupancy` (1..20), `startDate`, `endDate`.
- Unit numbers are generated **`1-{occupancy}` … `{unitCount}-{occupancy}`**, matching what the legacy
  Informix data already does at every MAR resort (`V-CLC1` SLEEP4 = `1-4`..`15-4`, SLEEP6 = `1-6`..`15-6`,
  one block per unit per calendar year). `occupancy` is stored on `ResortUnit.occupancy` too;
  `rciReserved` starts `N`.
- **Numbering restarts at 1 every run.** A generated unit that already exists with the **same**
  apartment type is **REUSED** — its `ResortUnit` row is left untouched and only the availability record
  is added. That is the normal path for the second and later runs (setting up next year's dates for the
  units already registered); only the shortfall is created. A clash with a **different** apartment type
  is **409** naming it, since `ResortUnit` is unique on `[resortCode, unitNo]`.
- **All-or-nothing** in one transaction (`maxWait: 15_000, timeout: 120_000`), the same shape as
  `createMaintenance`. Both guards run as **one query for the whole batch** before it opens: the
  existing-unit lookup and an overlap query over all generated unit numbers (**409** naming the
  clashing units). Per-unit `hasOverlap()` is not used — it takes no `TransactionClient`.
- Responds **201** with a **summary object**, not a row array:
  `{ resortCode, apartmentType, occupancy, unitNos, unitsCreated, unitsReused, blocksCreated,
  startDate, endDate, days }` — the created/reused split is what the result dialog reports.
- **The grid delta is ONE pass over the days at `+N`**, not N passes at `+1` — see `applyDelta` below.

> **The Resorts Availability chart charts one product at a time, chosen from the Product master**
> (widened 2026-08-17 — it was a fixed LHC/CP pair hardwired to coCode `03`/`02`), so MAR grid rows
> now appear once their product is picked. Note also that `V-*` resorts
> had **zero** `ResAvailMast` rows before this feature (the `res_avail_mast.txt` export covers only 7
> resorts), so a MAR batch takes the upsert-create path, not the increment path.

### ResAvailMast (Units Availability generated per-day grid)
The **generated** per-day availability grid consumed by (future) booking — NOT edited directly; it is
maintained automatically when AptBlock rows are created/edited/deleted. Keyed by (resort, apartment type,
date). **133,988 rows** from `res_avail_mast.txt` (cols `[0..4]` migrated: resortCode, apartmentType,
date, actNight, balNight — relNight/col5 + lockStatus NOT migrated). The 2026-08-26 unfiltered
re-export is 616,538 rows over 317 resorts; `migrate-res-avail.ts` keeps only the 12 **active**
resorts (see the loader-backstop note under `### ResortUnit`), which is what closed the old
`V-*` no-grid gap without carrying 482,550 unreachable rows. Fields: `resortId` (FK → Resort.id,
Cascade), `resortCode`, `apartmentType`, `date` (plain TIMESTAMP UTC-midnight), `actNight` (**count of
units of that apartment type registered that day** — aggregate across all units of the type), `balNight`
(**act minus maintenance minus bookings** — verified against the raw exports: L-10016/2BR/2026-07-27 has
act=20 from 20 `apt_block` units, 4 `resmt` maintenance units, bal=16; across all 10,063 future-dated grid
rows `act − maintenance == bal` holds for 8,079, the residual gap being genuine Informix reservations).
Unique: `[resortCode, apartmentType, date]` (matches Informix `ram_idx1`). Verified:
L-101/1BR/2027-01-01 → act=3 = the 3 blocks for units 4/6/18. Seeded via `prisma/migrate-res-avail.ts`
(chunked `createMany`, 5k). Direct load on import — NOT regenerated from AptBlock at migration time.

> **The committed export is STALE, and the script is ADDITIVE — use that.** `res_avail_mast.txt`
> dates from 2026-07-24 and holds **7 resorts** (CP-PBR, L-10016, L-10024, L-10025, L-10026,
> L-101, L-103A), the active estate of that day. Five resorts activated since have units and
> `AptBlock` records but **zero grid rows** — `V-LDBR` (coCode 20, 2,139 blocks), `V-SGH` (01),
> `V-CLC2` (24), `V-SGI1` and `V-SGI5` (26) — so each draws a **full row of zeros** in the
> Resorts Availability chart, which zero-fills missing days. Reported for LOTUS DESARU BEACH
> RESORT on 2026-08-26. Since `migrate-apt-block.ts` applies no grid deltas, a fresh export is
> the only thing that can give them a grid; **re-importing the committed file changes nothing**
> (its 7 resorts already match the DB row-for-row). Export it with the new
> **`migrate/res_avail_mast_unload.sql`** — active resorts only, and deliberately **no unit
> whitelist**, because the table has no unit column and `ram_act_night` already reflects the live
> register (verified 2026-08-26 on 2026-06-15: grid `act` equals the whitelisted unit count
> exactly at all six resorts).
>
> **Load it by running the script directly** — `npx ts-node --transpile-only
> prisma/migrate-res-avail.ts` — which does not truncate and uses `skipDuplicates`, so it inserts
> the missing resorts and leaves everything else alone. **`migrate-table.ps1 -Table ResAvailMast`
> runs `TRUNCATE "ResAvailMast"` first** and would destroy the grid rows generated by the app's
> own fn 5 CRUD, which are in no export and can only be rebuilt by re-keying the records (680
> rows as of 2026-08-26: V-CLC1 365 from a MAR batch, plus the L-00000 / V-ABC1 test resorts).
> Same additive-vs-truncating distinction as `migrate-resorts.ts`.

**Grid sync on AptBlock CRUD** (`applyDelta` in `apt-blocks.controller.ts`, all in one transaction,
interactive-txn timeout bumped to 120s for multi-year blocks, `MAX_RANGE_DAYS=3660` guard):
- **Create** → for each day in `[start,end]`, upsert `(resort, apartmentType, date)` with `actNight+qty,
  balNight+qty` (creates `qty/qty` if absent).
- **Delete** → each day `actNight-qty, balNight-qty` (row deleted when act reaches 0; balNight clamped ≥0
  so a booked day can't go negative).
- **`qty` defaults to 1** — one unit's record, so every pre-existing call site is unchanged. **The MAR
  batch passes the unit count instead of calling `applyDelta` once per unit**: all units in a batch share
  the resort, apartment type and date range, so the grid effect is exactly `+N` per day. N separate passes
  would be `N × days` round-trips — 78 units × 366 days ≈ 28,500 queries, well past the 120s transaction
  timeout — where one pass is `days`. **Keep new callers on this form** rather than looping.
- **Overlap guard:** a new record whose range overlaps an existing one for the same
  `(resortCode, unitNo)` is rejected (409).
- **Maintenance guard (2026-08-14):** a record cannot be **deleted** while the unit has any
  `ResortMaintenance` record overlapping its dates — **409** naming the count and pointing at fn 6.
  Without this the fn 6 rule — every maintenance range sits inside one availability
  record — is undone from the other side, and the grid goes wrong concretely: `applyMaintDelta` has
  already deducted those days from `balNight`, so `applyDelta`'s `-1` clamps at 0 and the deduction is
  never given back. `maintenanceWithin()` in `apt-blocks.controller.ts` is where the **booking** count
  goes too, once that module exists.
- **RCI bulk bank guard (2026-08-26):** the identical rule for RCI fn 3 — a record cannot be
  **deleted** while the unit has any `RciBulkBank` week overlapping its dates, **409** naming the
  count and pointing at fn 3 (`bulkBankWithin()`, the sibling of `maintenanceWithin()`). Same
  failure mode: `applyBankDelta` has already deducted those days from `balNight`, so `applyDelta`'s
  `-1` clamps at 0 and the deduction is never given back.

### ResortMaintenance
The input record for the **Resorts Maintenance** function (`/resorts/maintenance`) — one row per
(resort, unit, date-range) withdrawing that unit from the booking pool for housekeeping / buffer /
upgrading / repairs. **10,904 rows** from `resmt.txt` (cols `[0..5]` migrated; `rm_user_name`,
`rm_sys_date`, `rm_lock_status` NOT migrated — lock_status is `U` on all 13,396 source rows).
Fields: `resortId` (FK → Resort.id, Cascade), `resortCode`, `unitNo` (incl. compound lock-off codes
like `3231/3232` and dotted codes like `3.9B`), `apartmentType` (derived from ResortUnit at CRUD time;
**null** for 27 migrated rows whose unit isn't in the `apt_mast` export — all L-10027, 1997-98,
none current/future; was 291), `startDate`/`endDate` (plain TIMESTAMP UTC-midnight business dates), `remarks`
(the reason — BUFFER 1699 / UPGRADING 1453 / BLOCKED 900 / HOUSEKEEPING 892 / MAINTENANCE 885 / …),
`serialNo` (`rm_serial_no`, migrated only). Unique: `[resortCode, unitNo, startDate]` (matches Informix
`rm_idx1`). **`resortCode`/`unitNo`/`apartmentType` immutable after create** (move = delete + re-add;
edit changes only dates + remarks).

**`remarks` is MANDATORY on create and edit** (2026-08-13) — a unit withdrawn from the booking pool must
say why. Enforced by `remarksField` (`z.string().trim().min(1).max(40)`) on both the create and update
schema, and mirrored in the form's `canSave`. **The DB column stays nullable**: migrated Informix rows
carry no remark and keep it until someone edits them, at which point one must be supplied.

**The form cascade is Resort → Unit → Availability → date ranges** (2026-08-13). After the unit, the
user picks **one of that unit's fn 5 `AptBlock` records**, and **every** date range keyed must fall
inside that record's period. Without it `applyMaintDelta` skips every day (no grid row to reduce), so
the record would be written and change **nothing** while staff believe the unit is blocked out.
- **`aptBlockId` is REQUIRED on both create and update** and is a **validation input only — nothing
  about the choice is stored** on `ResortMaintenance` (no schema change). `checkAvailability()` loads
  the record, 400s if its `resortCode`/`unitNo` don't match, then 400s naming the offending range and
  the record's period.
- **The dropdown lists each fn 5 record separately, not merged.** Availability is keyed as a chain of
  yearly / 2-year / 3-year blocks, so a maintenance range crossing two consecutive records must be
  split into two ranges — and, since a save is bound to one record, into two saves. Accepted trade-off.
- **Lapsed availability is hidden** — the dropdown offers only records with `endDate >= today`
  (client-side, local calendar date). The currently selected record is always kept in the list, so
  editing an old row bound to expired availability shows what it is bound to instead of going blank.
  The server does **not** filter by date: a stale form must fail on the range check, not silently.
- **Edit gets the same dropdown**, pre-selected to the record covering the row's current dates; blank
  when none does (legacy rows), which blocks Save until one is picked.
- **Dates are keyed in an inline calendar, not `<input type="date">`** — the native control only honours
  `min`/`max` and cannot grey out individual days. `components/ui/DateRangeCalendar.tsx` (in-house, no
  new dependency; all-`YYYY-MM-DD` string compares, so no timezone conversion) renders a month grid
  where a day is crossed out and unclickable when it is outside the selected availability, **already
  under maintenance for that unit**, or **claimed by another range in the same form**. Click start then
  end; completing a range that would span a blocked day restarts the selection instead. Each row is a
  button that expands its calendar inline (a popover would be clipped by the modal's `overflow-y-auto`),
  with an `X` to clear it. `rowError()` keeps the equivalent text checks as a backstop.
- The taken days come from `GET /api/resort-maintenance?resortCode=&unitNo=&from=&to=` — **`unitNo`
  (exact) and `from`/`to` (an arbitrary overlap window, unlike `periodFilter`'s whole years/months) were
  added to `listMaintenance` for this**. The record being edited is excluded client-side so its own days
  stay pickable.
- Fed by `GET /api/apt-blocks/units?resortCode=` (`listUnitsWithAvailability`), whose React Query key
  is `['apt-blocks', 'units', resortCode]` so fn 5's own invalidate refreshes it. Units absent from
  that response have no availability at all and stay **disabled** in the unit picker, suffixed
  `(no availability set up)` — ~10 of the 358 registered units.
- **Existing data is untouched** — the rule applies to saves only. 565 of the 10,911 migrated rows
  would fail it, but only 5 are current-or-future and all 5 sit on the throwaway `L-00000` test resort.
- **Availability is a planning ceiling**: it currently runs out at 2027-12-31 (V-LDBR, V-SGI1/5),
  2029-12-31 (L-10016/24/25/26, L-101) and 2032-12-31 (CP-PBR), and 1,011 units have a hole (e.g.
  `CP-PBR / 3201` is covered to 2026-12-31 then not again until 2030-01-01). Maintenance in an
  uncovered window cannot be keyed until fn 5 is extended.

**One Add keys up to 3 date ranges for the same unit** (2026-08-13, `MAX_RANGES = 3`), all sharing a
single reason — a unit is often taken out for several separate stints. Each range becomes **its own
record**, so the list, edit and delete paths are unchanged (a record is still exactly one range, and
**edit stays single-range**). The whole batch is written in **one transaction and is all-or-nothing**:
a range clashing with an existing record throws `HttpError(409)` naming it (`Range 2 overlaps an
existing maintenance record for this unit`), rolling back the records and grid deltas already applied
for the earlier ranges. Submitted ranges are also checked against **each other** (400, `rangesOverlap`,
inclusive — touching counts, since the shared day would be deducted twice) before the transaction opens,
and `MAX_RANGE_DAYS` is applied as an **aggregate** cap over the batch so the worst-case transaction
stays what a single record's used to be. `POST` therefore returns **an array**; `PUT` still returns one
object, and the frontend mutation normalises both to an array. Seeded via `prisma/migrate-maintenance.ts`
(`migrate-table.ps1 -Table ResortMaintenance`, bundled into `-Table Resort` + `refresh-test-db.ps1` —
runs after `migrate-resort-units.ts` since it needs ResortUnit for the type lookup). CRUD at
`/api/resort-maintenance` under `RESORTS_SETUP` matrix.

> **Exported by `migrate/resmt_unload.sql`.** It carries the four-resort unit whitelist (kept in
> sync with `apt_mast_unload.sql` / `apt_block_unload.sql`) but is **deliberately NOT filtered by
> resort status** — unlike the other two — so it is still a full-table export. Consequence:
> **6,069 of its rows sit on retired resorts** and, now that units exist only for active resorts,
> import with a null `apartmentType`. Adding the same `resort_mast` join would bring it to 4,835;
> left as a conscious open item (2026-08-11), not an oversight.

**Grid sync on ResortMaintenance CRUD** (`applyMaintDelta` in `resort-maintenance.controller.ts`, one
transaction, same 120s timeout + `MAX_RANGE_DAYS=3660` guard as AptBlock). Differs from `applyDelta` in
three ways: **`actNight` is never touched** (the unit still exists, it just isn't bookable), grid rows are
**never created or deleted**, and a day with no grid row is skipped (the unit isn't in the pool then, so
there's nothing to reduce).
- **Create** → each day in `[start,end]`: `balNight-1`, floored at 0.
- **Delete** → each day `balNight+1`, ceilinged at `actNight`.
- **Edit** (dates + remarks) → reverse the old range (`+1`) then apply the new range (`-1`); days in both
  net to zero.
- **Overlap guard:** a new/edited record overlapping an existing one for the same `(resortCode, unitNo)`
  is rejected (409).
- **RCI bulk bank guard (2026-08-26):** a new/edited record covering a week the unit has banked to
  RCI (fn 3) is rejected **409** naming the count and pointing at fn 3 (`bulkBankOverlap()`). This is
  a **correctness fix, not symmetry**: maintenance and bulk bank both deduct `balNight -= 1` for the
  same physical unit-night, so an overlapping pair either double-deducts (the grid ends two lower
  than reality) or clamps at 0 and loses one deduction permanently.
- **The availability chart needs no maintenance-specific code** — it reads `balNight`, which grid-sync
  keeps correct.

**Month/Year period filter** (`periodFilter()` in `resort-maintenance.controller.ts`): matches records
whose range **overlaps** the period (`startDate <= periodEnd AND endDate >= periodStart`), not just those
starting in it — a block running Jun–Dec is correctly "under maintenance in August". `year` alone means
the whole year; `month` (1-12) narrows it; **`month` without `year` is ignored** (and the UI disables the
Month select until a Year is picked). Period end is computed as `Date.UTC(year, month, 1) − 1 day`, so
month-end and leap years are exact — verified against raw SQL incl. Feb 2028.

> **The migration deliberately applies NO grid deltas.** `res_avail_mast.txt` was exported from Informix
> with maintenance already deducted from `ram_bal_night`, so re-applying the per-day deltas at import
> would double-count. Deltas happen only on app CRUD. Verified end-to-end: create → edit → delete of a
> record on `L-10016/1.1B` restored `ResAvailMast` to values identical to the raw export for every day,
> including 2026-08-07/08 which carry a pre-existing Informix booking (`act=20, bal=15`).

> ### Per-product calendars — do not cross the streams
> The date calendars belong to **different products** and are **never joined or derived from
> one another**:
> - **`Holiday` (public + school, one table) → LHC booking only.**
> - **`CpSeasonDate` → CP booking only.** It is the *only* peak/holiday calendar CP reads.
>   `SeasonPoint` is the downstream half of the same CP-only pair: `CpSeasonDate` **grades** a day
>   G/S/D, `SeasonPoint` turns that grade into a **points figure**. Neither ever reads the LHC
>   holiday table.
>
> The 2026 CP season grading happens to sit close to the holiday dates (Diamond clusters on public
> holidays, Gold on school breaks) — that is how the business grades peak demand, **not a dependency**.
> Never generate one calendar from another, and never have a CP code path read `Holiday` (or an LHC
> path read `CpSeasonDate`).
>
> Merging **public** and **school** holidays into one `Holiday` table (2026-07-31) is not a
> counter-example: both were already LHC-only, so the merge stayed inside one product's stream.

### Holiday
**One** calendar table for the **Public & School Holidays Setup** function (`/resorts/holidays`,
Resorts Setup fn 7), covering both national public holidays (single dates) and school breaks (date
ranges), discriminated by `holidayType`. **Consumed by LHC booking only** (see the per-product note
above). **No Informix source** — the 12 public + 4 school rows for 2026 are business-supplied and
baked into `prisma/seed-holidays.ts` (like `CHECK_TIMES` in `migrate-resorts.ts`).

> **Merged from two tables on 2026-07-31.** `PublicHoliday` and `SchoolHoliday` were separate models,
> controllers, routers, API clients and pages that shared ~90% of their code. Migration
> `20260731090000_merge_holiday_tables` creates `Holiday`, copies both tables into it (preserving row
> `id`s) and DROPs them. **Historical `AuditLog` rows still carry `targetType='PublicHoliday'` /
> `'SchoolHoliday'`** — new rows write `'Holiday'`. The old route `/resorts/school-holidays` redirects
> to `/resorts/holidays?tab=school` so bookmarks keep working; `/api/public-holidays` and
> `/api/school-holidays` are **gone**.

Fields: `holidayType` (`'PUBLIC'` | `'SCHOOL'`), `startDate` (plain TIMESTAMP UTC-midnight business
date — for PUBLIC this *is* the holiday date), `endDate` (**nullable** — null for PUBLIC, required for
SCHOOL), `year` (Int), `description`. Unique: `[holidayType, startDate, description]`. Indexed on
`[holidayType, year]`.

**`holidayType` is a plain `String`** validated by a `z.enum(['PUBLIC','SCHOOL'])` in the controller,
**not** a Prisma enum — adding a kind later must not require a migration (same reasoning as
`CpSeasonDate.season` and `Product.entType`, and it avoids the enum-variant deploy footgun that broke
login on 2026-07-23).

**`year` means different things per kind, deliberately:**
- **PUBLIC** — the calendar year, **always derived server-side** from `startDate`, never accepted from
  the client, so it cannot drift.
- **SCHOOL** — the **academic year**, **editable**: a Malaysian session can run past the calendar
  boundary, so a January break can legitimately belong to the previous academic year. The form
  pre-fills it from the start date's year *only while the field is still blank* (a default, not an
  override).

**Global scope — no resort or state column.** Holidays are nationwide; Malaysian state-specific public
holidays and state-group (Kumpulan A/B) school variants are deliberately out of scope.

**Dates are stored exactly as supplied.** Several public seed rows are the *eve* of the gazetted date
(Labour Day 30/04, National Day 30/08, Christmas 24/12) — intentional, not a typo, so don't "correct"
them on re-seed.

**SCHOOL-only guards** (public holidays legitimately share dates and repeat names):
- **Overlap:** a range overlapping another in the **same academic year** is rejected **409**
  (`hasOverlap()` in `holidays.controller.ts`, same shape as the AptBlock / ResortMaintenance guards
  but keyed on `year` instead of `(resortCode, unitNo)`). `endDate < startDate` returns **400**.
- **Duplicate name:** one "TERM 1 SCHOOL HOLIDAYS" per academic year, **409** via `descriptionTaken()`.
  This was the old `SchoolHoliday` `[academicYear, description]` unique; the merged table keys on the
  start date instead, because a year-scoped unique would wrongly block a multi-day public holiday that
  repeats a name on another date — so the rule is re-enforced in the controller, not the DB.
- Update merges the payload over the stored row *before* re-running both checks, passing its own id as
  `excludeId`. **`holidayType` is immutable** — taken from the stored row, never the payload.

**Clone by year** (`POST /api/holidays/clone`, body `{ holidayType, sourceYear }`): copies every row of
`sourceYear` into **`sourceYear + 1`**, shifting `startDate` and (when present) `endDate` by one year on
the same month/day (`getUTCFullYear() + 1` per date, so a school range crossing 31 Dec stays intact),
then staff correct each row — lunar/Islamic holidays and school terms both shift annually. Refuses
**409** if the target year already holds rows of that kind (a second click must not duplicate rows or
silently discard dates already corrected); **404** if the source year is empty. A 29-Feb source date
rolls to 1 Mar in a non-leap target year (acceptable — every cloned date is reviewed anyway).

The seed **upserts** on the compound unique, so re-running only tops up missing rows. `Holiday` is
**not** truncated by `refresh-test-db.ps1` (no FK to Resort) — the refresh calls the seed to top it up
and leaves corrected dates alone. Note the start date is part of the upsert key: if staff move a seeded
holiday, a re-seed re-creates its original row rather than updating the corrected one (unchanged
behaviour from the two seeds this replaces). CRUD at `/api/holidays` under `RESORTS_SETUP` matrix
permission (clone requires `create`).

### CpSeasonDate
CP season calendar for the **CP's Seasons Setup** function (`/resorts/seasons`) — **one row per
calendar day**, graded `G`=Gold / `S`=Silver / `D`=Diamond. The grade is resolved into an actual
points-per-night figure by **`SeasonPoint`** (fn 9) — see below. 424 rows from `ps_seasondate.txt`. Fields: `date` (plain
TIMESTAMP UTC-midnight business date, **`@unique`** — one season per day), `season` (String validated
against a `SEASONS` const + `z.enum`, not a Prisma enum, so adding a grade needs no migration), `year`
(Int — **derived server-side** from `date`, never accepted from the client; needs its own
`@@index([year])` since the unique index is on `date`).

**Consumed by CP booking only** — this is the *only* peak/holiday calendar CP reads, and
the `Holiday` table (public + school) is LHC-only. See the per-product note above `### Holiday`.

**Global** — the source has no resort or coCode column (the `ps_` prefix already marks it CP, like
`ps_amc_mem` / `ps_ctrltab` / `ps_bookent1`).

**Per-day storage, month-at-a-time editing.** The source is a full daily calendar (verified: 2026-01-01
→ 2027-02-28, contiguous, zero gaps, zero duplicate dates; D 40 / G 56 / S 328) whose days form only 33
contiguous runs. Storing days rather than ranges keeps the booking lookup a single equality match and
avoids range-splitting when a few mid-range days change.

**The screen is month-scoped — there are no per-day endpoints.** It renders one month as a 3-across
grid of `[dd-mm-yyyy] [S]` pairs filled left-to-right (mirroring the legacy Informix screen), with the
season cell an inline `<select>`. Year is a free-text input (required — a new year must be typeable);
Month is a dropdown defaulting to January; **Prev/Next** step a month at a time and cross year
boundaries. Reads use `GET /api/cp-seasons?year&month`, which returns only *graded* days — the page
scaffolds the full month and defaults every ungraded day to **`S` (Silver)**, the dominant grade
(328/424), so a new month only needs its Gold/Diamond days adjusted.

- **Add and edit are the same action.** Navigating to a month with no data *is* the add form (banner
  says so); `POST /api/cp-seasons/month` bulk-upserts **every date shown**, including days left at the
  default. `saveCpSeasonMonth` rejects (400) any submitted date outside the target month or repeated,
  so a stale form can't write into a neighbouring month.
- **Delete is month-scoped** (`DELETE /api/cp-seasons/month?year&month`) — there is no single-day delete.
- A range-assign action (grade an arbitrary date span in one call) was built and then **removed on
  2026-07-28** as not useful — the month grid covers the same ground. Don't reintroduce it without asking.

**Clone by year** (`POST /api/cp-seasons/clone`, body `{ sourceYear }`): copies every graded day into
`sourceYear + 1` on the same month/day. 409 if the target year already holds rows, 404 if the source is
empty — same policy as the two holiday clones. **Leap-year caveat:** cloning *into* a leap year leaves
29 Feb ungraded (no source day), and cloning *out of* one rolls 29 Feb onto 1 Mar where
`skipDuplicates` drops it — either way run a gap check on the target year afterwards (the result dialog
says so).

Imported via `prisma/migrate-cp-seasons.ts` (`migrate-table.ps1 -Table CpSeasonDate`, also in
`refresh-test-db.ps1`). Unlike the two holiday **seeds** (business-supplied, upsert/top-up), this has a
real Informix source so it **truncates and reimports** — post-go-live re-import **clobbers CRUD edits**.

### SeasonPoint
**One** points chart for the **CP Points Deduction** function (`/resorts/season-points`, Resorts
Setup fn 9) — how many points a CP member is charged **per night**, by resort × apartment type ×
season × day of week — covering both halves, discriminated by `pointsType`:

- **`HOME`** — the member's own product's resort (`coCode '02'`, CP-PBR today). `CpSeasonDate` (fn 8)
  grades the day G/S/D; this table turns that grade into a number. Originally from `ps_seasonapt.txt`.
- **`AWAY`** — every other resort: our own LHC resorts (`L-101`, coCode 03) and the partner/exchange
  `V-*` resorts, reached through an LVC exchange programme. This is why `pssa_lvcpts0..6` are zero on
  every `ps_seasonapt` row — the away points lived in their own Informix table, `ps_lvcapt.txt`.

> ### VERSIONS, NOT YEARS (redesigned 2026-08-13) — the central fact about this table
> A chart is an effective-dated **version**: all rows sharing `(resortCode, effectiveDate)`. It
> **stays in force until a later version supersedes it**, so a new version is created **only when a
> rate changes or a room type is introduced** — never annually. There is exactly **ONE effective
> date per resort per version**, set once in the editor header.
>
> **Resolution rule for booking:** the chart in force for a stay date `D` is the version with the
> greatest `effectiveDate <= D` for that resort. There is no end date and no `year` column.
>
> **What this replaced.** The table used to key charts by calendar `year` with a **per-row**
> `effectiveDate` (one per apartment-type × season cell), so staff re-keyed a full grid every year.
> The evidence that the year dimension was near-pure duplication:
> - 4,766 rows / **1,062 resort-years** across 265 resorts held only **303** chronologically
>   distinct charts.
> - Five active resorts (`L-10016`, `L-10024`, `L-10025`, `L-10026`, `L-101`) had re-keyed an
>   **identical chart 24 years running**; CP-PBR's 28 years held **2** distinct charts.
> - `effectiveDate` was already a **per-apartment-type** "rate set on" stamp, not a per-year date —
>   constant across every year in **226 of 265** resorts. `V-LDBR`'s SLEEP4 read `2002-02-15` in all
>   17 of its years and its SLEEP6 `2012-07-26`. Only CP-PBR used it as a real per-year approval
>   date (32 distinct dates).
>
> **Migration `20260813090000_season_point_versions`** kept **one current chart per resort** —
> each resort's latest year, stamped with the latest `effectiveDate` among those rows — dropping
> superseded history (business decision: fn 9 is the only consumer and there is no booking module
> yet). **4,766 rows → 1,209 across 265 resorts.** History accumulates from here on. Verified
> before writing it: the 1,209 surviving rows hold 1,209 distinct `(resortCode, apartmentType,
> season)`, so the new unique index builds with zero collisions, and `lvcCoCode` was already
> uniform within every kept set.
>
> **Two things were deleted with the year model** (both built the day before, 2026-08-12): the
> previous-year **prefill** of an empty year, and the **"years cannot skip ahead"** rule (the
> Next-button disable plus its backend guard). Neither has meaning without per-year charts.
>
> **The UI calls a version a "RATE"** ("New Rate", "Save rate", "Delete rate"); the code, API and
> schema call it a version. Same thing — don't rename one half without the other.
>
> **"New Rate" opens PRE-FILLED from the rate in force** (2026-08-13). The editor already loads the
> in-force version for the resort header and apartment types, so its rows seed the grid with
> `id: null` — the user amends a copy instead of keying a whole chart to change one figure. Copying
> forward was declined when the redesign was planned and asked for immediately after; the earlier
> decision is superseded.
>
> **A new rate must take effect AFTER the resort's latest one** (2026-08-13) — rates supersede in
> date order, so backdating one behind the current rate would make it dead on arrival.
> `saveSeasonPointVersion` returns **400** when a create (no `replaces`) carries an `effectiveDate`
> `<=` the resort's `max(effectiveDate)`; the editor mirrors it and disables Save. **Editing an
> existing rate is exempt** — an older superseded rate must stay correctable, and the 409 clash
> guard already stops two rates sharing a date. A resort with no rates yet is unconstrained.

Fields: `pointsType` (`'HOME'` | `'AWAY'`), `resortId` (FK → Resort.id, Cascade), `resortCode`,
`coCode` (the resort's **own** product, denormalized from `Resort`, never taken from the payload),
`lvcCoCode` (**nullable** — the product whose members are **charged**; `'02'` on every imported away
row, **null** on home), `apartmentType`, `effectiveDate` (plain TIMESTAMP UTC-midnight business date
— **the version this row belongs to**; do NOT convert it to `Timestamptz`), `season` (validated
against a `SEASONS` const + `z.enum`, not a Prisma enum), and seven Int columns `ptsSun`..`ptsSat`.
Unique: `[resortCode, effectiveDate, apartmentType, season]` (named `SeasonPoint_natkey_key` via
`map:` because the generated name would exceed PostgreSQL's 63-char limit). Indexed on
`[resortCode, effectiveDate]`.

**`pointsType` is a plain `String`** validated by a `z.enum(['HOME','AWAY'])` in the controller, **not**
a Prisma enum (same reasoning as `Holiday.holidayType` and `CpSeasonDate.season`), and is **derived
server-side** from the resort's `coCode` on every save — never taken from the payload, so it cannot
drift. It is deliberately **not** in the natural key: a resort is either home or away, so `resortCode`
already determines it.

**Sunday is index 0.** Source cols `0..6` map to Sun→Sat, *not* Mon→Sun. Verified against the legacy
screens on **both** halves: home `CP-PBR/SLEEP6/S` and away `V-KI/SLEEP6/S` are each
`29,29,29,29,29,51,51` and the screen shows "Total Points Per Week: 247" (= 29×5 + 51×2).
**The weekly total is derived, never stored.**

**Source columns:** home imported the first 12 of 24 (`pssa_lvcpts0..6` are zero on all 253 rows, the
rest are legacy audit/lock); away the first 14 of 20 (cols 15-20 are the usual audit/lock trailer).
Both scripts read the source's `year` column but **do not store it** — it is only the key for
collapsing to the latest version.

**Resort scope is enforced both ways.** Every endpoint calls `requireResortOfType(resortCode, expected)`,
which loads the resort, computes its kind from `coCode` and returns **400** on a mismatch — naming the
other tab. The pickers are `useActiveResorts()` filtered to `coCode === '02'` (home, CP-PBR alone) and
`!== '02'` (away, **48** resorts). **The server deliberately does NOT check status**, which matters most
on the away side: most resorts with data are Inactive, and their points stay readable and editable by
URL (`?type=away&resort=V-KI`) even though the dropdown won't offer them for new setup.

> **Apartment types are validated against `ApartmentType` (fn 3), but existing pairs are
> grandfathered.** A submitted row is accepted when the `(resortCode, apartmentType)` pair is
> registered in Apartment Types Setup **or** a `SeasonPoint` row already exists for it
> (`allowedApartmentTypes()` in the controller). Genuinely new types still have to go through fn 3.
>
> This split was necessary on the away side because only **5 of the 412** `(resort, apartmentType)`
> pairs in `ps_lvcapt` existed in `ApartmentType` — back when that table was a 9-row
> business-supplied seed covering our own resorts. Partner nomenclature — `SLEEPA`..`SLEEPE`,
> `HOTEL UNIT` — had never been registered here. The real `apt_category.txt` load (2026-08-10)
> closed almost all of that gap: 408 of the 412 pairs are now registered, and only 4 still rely on
> grandfathering, all on **Inactive** resorts. Keep the rule: dropping it would make those 4
> unsaveable, and it is what lets a resort's points stay editable after its types change.
>
> **The rule is applied to HOME too**, so there is one rule instead of two — CP-PBR's
> SLEEP2/SLEEP4/SLEEP6 are all registered in fn 3, so home behaves exactly as before. The
> version endpoint returns `apartmentTypes` as the **union** of registered types and types already
> stored, each flagged `registered: boolean`; unregistered types show a `(legacy)` hint. **Neither
> importer validates apartment types** — both check only the resort FK.

**`lvcCoCode` is editable, and away-only** — a product dropdown validated against `Product.coCode`
(400 on an unknown code), reusing the lookup-not-FK pattern from `lvc-codes.controller.ts`. It is a
**version-level** attribute applied to every row on save (it is not in the natural key). Every
imported away row is `'02'`; the field exists so a future non-CP exchange direction can be set up.
**On the home tab the control is not rendered and the server stores null whatever the client sends.**

**The screen is a version list + editor**, presented as a **tabbed page** (Home Resorts / Non-Home
Resorts) whose tab lives in the URL (`?type=home|away`) alongside `resort` and `eff`:

- **No `eff` param → the version list**: resort picker + a table of that resort's versions, newest
  first (Effective From, Status, Room Types, Seasons, Rows, and Charged To on away), plus **New
  Rate**. Status is **Current** (the greatest `effectiveDate <= today`), **Scheduled** (dated
  ahead of today) or **Superseded**.
- **`eff=YYYY-MM-DD` → the editor** for that version; **`eff=new` → a blank one**. The grid is
  scaffolded as apartment types × `SEASON_ORDER = ['S','G','D']` with seven day cells and a live
  **Total/Wk** column, above a single **Effective from** date field in the header.

`GET /api/season-points?type&resortCode[&effectiveDate]` returns one version plus the resort header,
its `apartmentTypes` and (away only) the version's `lvcCoCode`; **omitting `effectiveDate` returns
the version in force today**, which is what a new editor opens on. `POST /version` is
**replace-all within the version** (the same shape as `PUT /api/resorts/:id/info`): rows dropped from
the payload are **deleted**, so clearing a retired room type is just blanking its cells. Rows left
entirely blank are never submitted, so opening an untouched grid and saving cannot create zero-point
rows. **There is no per-row delete** — that endpoint existed only to drop a superseded revision
*within* a year, which versions make meaningless.

**A version's effective date can be corrected in place**: the editor sends `replaces` (the version's
stored date) alongside the new `effectiveDate`, and the save rewrites the rows in one transaction.
Landing on a date the resort already has returns **409** — that would silently merge two charts.

**There is no clone action** (deliberate — unlike fns 7 and 8, which copy a year server-side).

Imported via `prisma/migrate-cp-season-points.ts` (HOME) and `prisma/migrate-lvc-season-points.ts`
(AWAY) — **kept as two scripts on purpose**: they read different Informix files with different column
layouts (`ps_seasonapt.txt` 24 cols, points at `[5-11]`; `ps_lvcapt.txt` 20 cols, points at `[7-13]`),
which is genuine difference, not duplicated logic. Each carries its own copy of
`collapseToLatestVersion()`. Both run after `migrate-resorts.ts` since they need `Resort` for the FK,
and both `createMany` **chunked at 100** (`MIGRATE_BATCH`).

> **The collapse MUST happen in memory before `createMany`.** Both scripts use
> `skipDuplicates: true`, so under the narrower key an uncollapsed load would **silently drop** the
> surplus years rather than error. This is also why `migrate-lvc-season-points.ts` no longer flushes
> incrementally as it parses — the collapse needs the whole file in hand first.

Via `migrate-table.ps1 -Table CpSeasonPoint` / `-Table LvcSeasonPoint`, each of which clears **only
its own `pointsType`** (a `DELETE ... WHERE`, not a `TRUNCATE`, since the halves share a table);
`-Table Resort` and `refresh-test-db.ps1` truncate the whole table. Neither PowerShell script needed
changing for the redesign — both are column-agnostic. Real Informix source, so both **reimport** —
post-go-live re-import **clobbers CRUD edits**.

### RciEnrolment
RCI (**Resort Condominiums International**) enrolment register for the **RCI Enrolment**
function (`/rci/enrolment`, RCI fn 1). **17,915 records** from `rci_enrol.txt` (Informix
`rci_enrol`, a full-table 43-column unload since 2026-08-20).

**One row per ENROLMENT, not per agreement.** An agreement can hold several rows — typically
a lapsed `1704-*` enrolment plus a newer `PENDING` one — so `coCode + membershipNo +
agreementNo` is **deliberately not unique** (91 such groups; 27 remain duplicated even with
`rciNo`). **`serialNo` (Informix `re_serial_no`, a `serial`) is the only unique key**, which is
what makes a re-import idempotent; app-created rows allocate `max(serialNo)+1` inside the create
transaction (unique index as the backstop), so numbering continues the Informix sequence —
the first new record was 24517.

Fields: `serialNo` (**unique**), `coCode`, `membershipNo`, `agreementNo`, `rciNo` (RCI member
no., or the literal `PENDING`), `renewalDate` (`re_act_date`), `expiryDate`, `rciFees`
(Decimal 8,2), `resortCode`, `firstName1`/`lastName1`/`name1`, `firstName2`/`lastName2`,
`mailAdd1-3`, `mailCityState`, `mailPostcode`, `malaysia` (Y/N), `telNo1`, `telNo2`,
`coOwner`, `rciStatus`, `totInterval`.

> **`renewalDate` and `expiryDate` are INFORMATION ONLY** (business rule) — members renew
> directly with RCI, so nothing in this system acts on, validates or alerts off them. Don't
> build expiry logic on these columns.

**Only 25 of the 43 source columns are migrated** (business decision) — `re_batch_no`,
`re_name1_no`, `re_agmt_no`, **`re_name2`** (first/last name 2 are kept, the concatenated form
is not), `re_name2_no`, the print/reprint block, the audit/lock trailer and `re_old_rci_no` are
all dropped, as everywhere else in this codebase.

**No FK to Agreement** — same choice as `CpBookingEntitlement`. The natural key is stored and
resolved on read (`findAgreement()` matches all three of `coCode + membershipNo + agreementNo`,
the safe direction for transferred agreements). **Create validates that the agreement exists**
(400 otherwise) and the detail endpoint returns `memberName` + `acctClassify` from that lookup.
17,909 of the 17,915 migrated rows resolve to an agreement; the 6 that don't are legacy
(one coCode `12`, one membership `00000-KL-M-0000/M/I`) and are readable/editable but could not
be re-created through the CRUD.

**The agreement key is immutable after create** — `coCode`/`membershipNo`/`agreementNo` are
omitted from the update schema (move = delete + re-add, the same rule as `ResortUnit.resortCode`).
Delete is a hard delete with **no usage guard** — nothing references `RciEnrolment` yet; add one
when RCI Interval (fn 2) starts pointing at an enrolment.

**`rciStatus` is a plain `String`** validated by a `z.enum(['A','C','M','T'])` in the controller,
**not** a Prisma enum — adding a status later must not require a migration (same reasoning as
`CpSeasonDate.season` and `Product.entType`). Distribution: C 11,685 / A 5,961 / T 155 / M 114.

**Source anomalies are imported verbatim**, as with the `LvcCode` typos: 8 rows carry a
`renewalDate` and 6 an `expiryDate` before 1970 (legacy keying errors, e.g. year 0190), and
`resortCode` is free text in the source (`L-10013` 12,961 and `L-10026` 2,848 dominate, but
`1704`, `L.COVE`, `LCS` also appear) — so it is **still not FK'd**, though since 2026-09-08 it
**is dropdown-bound** on the form (see below). Staff correct these through the CRUD; rewriting
them at import would make a re-import disagree with Informix.

> ### The Add form is SEARCH-DRIVEN, and one agreement may hold only one NEW enrolment (2026-09-08)
>
> Staff used to hand-key product + membership no + agreement no, with a live lookup that only
> echoed the member name back. The add form is now **two steps inside the one modal** — step 1
> searches agreements by **membership no, member name or agreement no** and step 2 is the form,
> with the picked agreement shown in the same read-only grey strip edit mode uses, plus a
> **Change** link back. It is not a stacked second `<Modal>`: both render at `z-50`, and
> `Modal`'s `useEffect` cleanup resets `document.body.style.overflow` on unmount, so closing an
> inner modal would restore background scrolling under the outer one.
>
> **Picking fills `name1`** with the **member's `fullName`**, or **nominee 1's `fullName` when
> the member is CORPORATE** — a company name is not a person RCI can enrol. Resolved
> **server-side** as `suggestedName1` so the rule lives next to the data (1,935 of 1,945
> corporate agreements have a nominee 1; the other 10 fill blank and are keyed by hand).
> `firstName1`/`lastName1` are additionally **prefilled by splitting that name at the first
> space** — both are mandatory, and the legacy data is shaped that way
> (`name1 = firstName1 + ' ' + lastName1` on 15,630 of 17,897 rows: `YEE` | `MIEW LING`,
> `KRISHNABAL` | `A/P NARAYANASAMY`). A starting point, not a rule — both stay editable, and a
> first token over the 10-char column is truncated for correction.
>
> **A second enrolment on an agreement that already has one is refused 409** at the full natural
> key, naming the existing RCI no and serial. This is a **controller lookup, not a constraint,
> and it cannot become one**: the key is deliberately non-unique (90 migrated groups hold 2-4
> rows) and a unique index would make the Informix data unloadable. It applies to **creates
> only** — the agreement key is immutable, so an edit can never introduce a duplicate, and the
> 90 legacy groups stay editable. The search list shows enrolled agreements **disabled** rather
> than hiding them, so an already-enrolled member explains itself instead of returning nothing.
>
> **Eight fields are mandatory on ADD only**: `rciNo`, `rciStatus`, `resortCode`,
> `renewalDate`, `expiryDate`, `firstName1`, `lastName1`, `name1`. Enforced by
> `rciEnrolmentCreateSchema` (a `.extend()` of the permissive base schema, which **update**
> still uses) and mirrored by the form's `canSave`, which names the outstanding fields rather
> than just disabling Save. **Edit stays permissive on purpose** — the migrated rows have real
> gaps (no `rciFees` on 58%, no renewal/expiry on ~19%, no `telNo1` on 15%) and a small
> correction must not be blocked behind back-filling a value nobody has. **`rciFees` is optional
> on add too** (business decision) — it is the least-populated column and is not always known at
> enrolment time; so are first/last name 2, co-owner, the whole mailing-address block and both
> phone numbers.
>
> **`resortCode` is now a dropdown** of **ACTIVE + `rciAffiliate='Y'`** resorts — 5 of the 16
> affiliated ones as of 2026-09-08 — via `frontend/src/hooks/useRciResorts.ts`, the RCI sibling
> of `useActiveResorts`/`useActiveProducts` (same shared `['resorts','']` cache, narrowed in a
> `useMemo`). Its `resortOptions()` differs from `productOptions()` in one **load-bearing** way:
> because this column is free text with no FK, a stored value may match **no** resort, so a
> synthetic option is appended rather than falling back to the base list. Without it, editing any
> of the **12,961 rows on `L-10013`** (affiliated but Inactive) — or a `L.COVE`-class value —
> would open a blank control and silently rewrite the stored code on save. No server-side status
> check, as everywhere else in Resorts Setup.
>
> **`totInterval` is no longer writable through CRUD.** It is off the form and absent from both
> zod schemas, so a crafted payload cannot set it either; the column keeps its `@default(1)` and
> the read-only detail modal still shows it for the migrated rows. Same treatment as the
> `LvcCode` counters and `RciBulkBank.bankStatus`.

Imported via `prisma/migrate-rci-enrolment.ts` (`migrate-table.ps1 -Table RciEnrolment`, also in
`refresh-test-db.ps1`). Real Informix source, so it **truncates and reimports** — post-go-live
re-import **clobbers CRUD edits**.

> ### GO-LIVE BLOCKER: this importer must be retired before cutover
> Now that `RciEnrolment` is the **only** store of RCI data, a truncate-and-reimport destroys
> every staff edit with no second copy anywhere — the `Agreement.rci*` columns that used to
> shadow it are gone. **Remove `migrate-rci-enrolment.ts` from `refresh-test-db.ps1` and the
> `RciEnrolment` entry from `migrate-table.ps1` before go-live.** Same class of hazard as the
> `migrate-rci-week.ts` and `migrate-rci-bulk-bank.ts` caveats, but with no fallback.
>
> **ORDER MATTERS: refresh, verify, THEN retire.** Data defects in `rci_enrol` are being
> corrected in **Informix**, not in MMS — six were rectified on 2026-09-03 (see the
> `/api/rci-enrolments` entry in the API reference) — precisely because an MMS-side fix would
> be clobbered by the next re-import, and because re-keying here burns a new `serialNo` (the
> agreement key is immutable, so a correction is delete-and-re-add). Those corrections only
> reach this database **through a refresh**. Retire the importer before that refresh runs and
> they never arrive, leaving them to be re-done by hand under exactly the constraints the
> source fix was avoiding. Confirm the fixes have landed first:
>
> ```sql
> -- expect 0 rows; check RciEnrolment is still ~17,908 at the same time, since a silently
> -- failed import also returns 0 here (see "After ANY refresh: verify row counts")
> SELECT e."serialNo", e."coCode", e."membershipNo", e."agreementNo"
> FROM "RciEnrolment" e
> WHERE NOT EXISTS (SELECT 1 FROM "Agreement" a WHERE a."coCode"=e."coCode"
>                     AND a."membershipNo"=e."membershipNo" AND a."agreementNo"=e."agreementNo")
>    OR NOT EXISTS (SELECT 1 FROM "Member" m WHERE m."membershipNo"=e."membershipNo");
> ```

> **This is the ONLY store of RCI data, and the only script that reads `rci_enrol.txt`.**
> A sibling, `migrate-rci-enrol.ts` (no "ment", `-Table RciEnrol`), used to read the same file
> to backfill four RCI columns on `Agreement`; those columns were dropped on 2026-09-02 and the
> script, its `-Table` entry and its `refresh-test-db.ps1` step are all gone. See the RCI note
> under `### Agreement`.
>
> **Agreement Detail renders the current enrolment read-only** via `currentEnrolment()` in
> `rci-enrolment.controller.ts` (ACTIVE row, else highest `serialNo`; matched on the natural
> key). RCI fn 1 is the only place RCI data is edited, under the `RESORTS_SETUP` matrix
> permission — so IT, Member Services and Resort Operations can all edit it there, and nobody
> can edit it from the Agreement page.

### RciWeek
RCI week-number calendar for the **RCI Weekly Interval** function (`/rci/weekly-interval`,
RCI fn 2). **105 records** from `rci_week.txt` (Informix `rci_week`) — **2026:52, 2027:53**
as of the 2026-08-27 refresh. The earlier export also carried 2028:52 and 2029:52 (209 rows); the
current source stops at 2027, so **fn 3 Bulk Bank can only bank 2026/2027 weeks** until staff
re-generate the later years through fn 2's **Add year** (which derives them from the year alone).

**A week runs Friday → the FOLLOWING Friday**, so consecutive weeks **share a boundary
date** (`week[n].friEnd == week[n+1].friStart`) and the last week of a year **crosses into
the next** (2026 wk52 = 25-12-2026 → 01-01-2027; 2027 wk53 = 31-12-2027 → 07-01-2028).
Fields: `year`, `weekNo`, `friStart`, `friEnd`, `satStart`, `satEnd`. Unique:
`[year, weekNo]` (= Informix `rw_idx1`) — `year` is its leftmost column, so it also serves
the year-filtered read and the whole-year delete; **no separate `@@index([year])`**.
All four date columns are plain `TIMESTAMP` at UTC midnight — do NOT convert them.

> **Every row is derivable from the year alone**, verified programmatically against all 209
> migrated rows byte-for-byte:
> - `friStart` of week 1 = **first Friday on or after 1 Jan**
> - `friEnd` = `friStart + 7`; `satStart` = `friStart + 1`; `satEnd` = `friEnd + 1`
> - week count = `(firstFriday(Y+1) − firstFriday(Y)) / 7` → **52 or 53**
>
> That is why **Add keys a year and nothing else** — `generateWeeks(year)` in
> `rci-week.controller.ts` produces the whole calendar. A hand-keyed start date could
> silently shift a year; deriving cannot disagree with Informix. Note `getUTCDay()` puts
> **Friday at 5** (Sunday = 0) — the one easy off-by-one here.

**Whole years only, and no edit path at all.** A year is created as a whole
(`POST /year`, **409** if it already exists) and deleted as a whole (`DELETE /year?year=`,
**404** if empty). There is no per-week create, update or delete, and the routes never use
the `'edit'` permission. Correcting a year = delete it and re-add.

> **A year holding banked weeks cannot be deleted** (2026-08-28) — **409** naming the count
> and the units, pointing at RCI fn 3. `RciBulkBank` has **no FK to `RciWeek`** (it stores
> the derived dates plus a denormalized `weekYear`/`weekNo`), so nothing at the DB level
> stops it: the banked records would simply survive with no calendar behind them,
> **unreachable from fn 3's grid**, which draws one row per `RciWeek` — while their
> `ResAvailMast` deductions stayed applied with no way to give them back. The count is
> matched on `checkIn` against the year's Friday starts, the same way fn 3 matches, so a
> legacy row whose `weekYear` never resolved is still counted. As of 2026-08-28 all three
> set-up years are protected (2026: 459 banked, 2027: 313, 2028: 1).

**`MIN_YEAR = 2026`** (business decision) — declared in both the controller and
`migrate-rci-week.ts`, and mirrored in the page. Older Informix years were **not
migrated**: 1,846 of the 2,055 source rows are pre-2026, and they are also where every
anomaly lives — 24 rows with null dates, 213 whose Saturday pair drifted off `friStart+1`
(1994/2000/2005/2011), 2 with a `friEnd` that is not `+7`, and a gap at 2021 wk52→53.
**Nothing at or after 2026 deviates**, so the importer loads 209 clean rows. It still
re-derives every row and reports a mismatch as a **WARN while importing verbatim** — that
surfaces a bad future export without letting the app disagree with Informix.

**`satStart`/`satEnd` are stored and returned by the API but NOT shown on screen**
(business decision) — the table renders only the Friday pair. They are on the
`RciWeek` TypeScript interface so a later screen needs no round trip.

**`rw_user_create` / `rw_date_create` are NOT migrated**, as everywhere else in this
codebase. Imported via `prisma/migrate-rci-week.ts` (`migrate-table.ps1 -Table RciWeek`,
also in `refresh-test-db.ps1`). Truncates + reimports — **post-go-live re-import wipes any
year generated through the app** (and reinstates only 2026-2029).

### RciBulkBank
LHB resort inventory **deposited into the RCI exchange network**, for the **RCI Bulk Bank**
function (`/rci/bulk-bank`, RCI fn 3). **774 records** from `bulk_bank.txt` (Informix
`bulk_bank`, a full-table 10-column unload of 35,931 rows, re-exported 2026-08-26).

**One row = ONE RCI WEEK of ONE qualifying unit.** Three things define a record:
- **the unit** - must be RCI-qualified, i.e. `ResortUnit.rciReserved = 'Y'`;
- **the week** - `checkIn` is a **Friday** and `checkOut = checkIn + 6`;
- **the season** - `R`=Red / `B`=Blue / `W`=White, **graded by RCI** and supplied to LHB.

Fields: `serialNo` (**unique**, `bb_serial_no`), `resortId` (FK -> Resort.id, **Cascade**),
`resortCode`, `unitNo` (incl. compound lock-off codes like `3201/3202`), `apartmentType`
(derived from `ResortUnit` at CRUD time - the grid key), `checkIn`/`checkOut` (plain
TIMESTAMP UTC-midnight business dates), `weekYear`/`weekNo` (**nullable**, denormalized
from the `RciWeek` match), `season`, `bankStatus`. Unique:
`[resortCode, unitNo, checkIn, checkOut]` (= Informix `bb_idx1`).

> ### The week IS an RCI week - staff never key a date
> All 774 migrated check-in dates match an **`RciWeek.friStart` exactly** (0 misses), so
> fn 3 is keyed off fn 2's calendar: the Add form is Resort -> Unit -> **Year -> Week No** ->
> Season, and the server derives `checkIn = friStart`, `checkOut = friStart + 6`. There is
> **no date input anywhere on the form**, which makes the Friday rule unbreakable rather
> than merely validated. A year not yet generated in fn 2 returns **400** naming fn 2.
>
> **Note `checkOut = checkIn + 6` while `RciWeek.friEnd = friStart + 7`.** `bulk_bank`
> stores the **last night**, not the RCI check-out day, so the stored range is **7
> inclusive days** - the same convention `resmt` uses for `rm_checkin`/`rm_checkout`.
> Confirmed against the imported grid, not assumed: at `L-10024` the `ResAvailMast`
> deduction drops by exactly the banked-week count on the day **after** a week's
> `checkOut` (2026-12-25), and returns when banking resumes (2027-01-01).

**`season` is a plain `String`** validated by a `z.enum(['R','B','W'])` in the controller,
**not** a Prisma enum - adding a grade later must not require a migration (same reasoning
as `CpSeasonDate.season` and `Product.entType`). Its value space is **R/B/W, deliberately
NOT the G/S/D of `CpSeasonDate`/`SeasonPoint`** - those are the CP calendar, this is RCI's.
Source `bb_time_colour` maps **`1->B` Blue, `2->W` White, `3->R` Red** (business mapping,
corrected 2026-08-26 - it was briefly loaded as 1->R/2->B/3->W). 2026+ split: B 84 / W 195 / R 495.

**`bankStatus` (`bb_status`) is migrated for provenance and appears nowhere.** It is
rendered on no screen and is **deliberately absent from both the create and update zod
schemas**, so a crafted payload cannot alter it either (verified: a `PUT` carrying
`bankStatus: 'X'` returns 200 and leaves the column at `B`). Same treatment as the
`LvcCode` counters. New rows default to `'B'` via the DB default. Source split: B 712 /
S 59; its meaning is unknown - wire it up if the booking/exchange module gives it one.

**`serialNo` continues the Informix sequence** - max at cutover is **39261**, so the first
app-created record is **39262**. Allocated as `max + 1` **inside** the create transaction,
with the unique index as the backstop (the `RciEnrolment` pattern). Editing a record's week
does **not** burn a new serial.

**Only check-in years >= 2026 are migrated** (business decision, mirroring
`migrate-rci-week.ts`): **774 of 35,931 rows** - 2026:459, 2027:315, spanning 2026-01-02 to
2027-12-24 over **12 units at 3 resorts** (CP-PBR `3201/3202`, `3203/3204`, `3205/3206`,
`3227/3228`; L-10024 `A6`/`A7`/`A8`; L-10026 `504`/`506` plus `401`/`507`/`508`, the three
added in the 2026-08-26 re-export), **all of which already carry `rciReserved='Y'`**.
Verified across all 774: check-in is a Friday on every row,
`checkOut - checkIn = 6` on every row, and there are zero duplicates on the `bb_idx1` key.

**Six save-time guards**, each returning a message that names the function to fix it in.
They run over the year save's **creates** only (see the whole-year grid note below), and
their failures are collected rather than thrown one at a time:

| Guard | Status |
|---|---|
| Unit not registered for the resort | **400** |
| Unit `rciReserved != 'Y'` | **400**, naming fn 4 |
| The week's 7 days are not covered by the unit's fn 5 `AptBlock` availability | **400**, naming the uncovered days and fn 5 |
| The unit is under `ResortMaintenance` during the week | **409**, naming fn 6 |
| The unit is already banked for that week, or an overlapping range | **409**, naming the clashing serial |
| Any day of the week has `balNight = 0` for that apartment type | **409**, naming the full days (`fullDays()`) |
| At a `lockOnOff='Y'` resort, the unit's apartment type is a **lock-off half** (`lockType='LS'`) | **400**, naming the split types (`splitUnitTypes()`) |

> ### Lock-on/lock-off resorts: whole units only (business rule, 2026-08-26)
> A resort with `Resort.lockOnOff='Y'` (**CP-PBR** alone today) sells one physical apartment
> three ways, as three `ResortUnit` rows with three apartment types: `3201/3202` **SLEEP6**
> (`lockType` **LM**, the whole unit) plus `3201` **SLEEP4** and `3202` **SLEEP2**
> (`lockType` **LS**, the two halves). That is 48 unit rows for 16 apartments, and **all 48
> carry `rciReserved='Y'`**, so without this rule the picker offered every half.
>
> **The LS (split) types are excluded** — from `listBulkBankUnits` (the picker) and from
> `createRciBulkBank` (**400**, authoritative). Banking a half as well as the whole would
> promise RCI the same room twice, and `ResAvailMast` could not even express the clash: the
> halves and the whole are **separate apartment types**, so deducting one leaves the others
> untouched and the double-commitment is invisible to the grid and to `fullDays()`.
>
> **It excludes LS rather than allowing only LM**, because the hazard is the master/half
> relationship. An `LN` (normal, non-splitting) apartment at a lock-off resort has no half to
> clash with and stays bankable. CP-PBR has no LN type, so today both readings give the
> identical result: SLEEP6 only, 16 units instead of 48.
>
> Resorts with `lockOnOff='N'` are untouched — their types are all LN. **All 774 migrated
> rows already comply** (every CP-PBR row is SLEEP6), so this codifies the legacy behaviour
> rather than changing it. `GET /units` also returns `splitTypes` so the form can say why the
> halves are missing instead of the picker just looking short.

> ### A full day REFUSES the save, it does not clamp (business decision, 2026-08-26)
> `balNight = 0` for an apartment type means every unit of that type is already committed
> that day. Banking one anyway would promise RCI a unit the estate cannot deliver, and
> `applyBankDelta`'s floor at 0 would swallow the deduction silently - the record would
> claim seven nights while the grid gave up five. Worse, **delete is then asymmetric**: it
> adds 1 back for every day, including the clamped ones, inventing availability that never
> existed (0 -> 1 on a day that is genuinely full), so tidying up one overbooking
> manufactures a second.
>
> `fullDays()` therefore runs **before the transaction opens** and returns **409** naming
> the offending dates. Worked example - L-10026 / 2BR / week 2026 wk35 (Fri 28 Aug -> Thu 3
> Sep 2026) carries `act 14 / bal 0` on Sat 29 and Sun 30 Aug, so banking any 2BR unit for
> that week is refused naming both days.
>
> **This deliberately differs from fn 6 maintenance, which still clamps.** Maintenance is an
> internal call and forcing it through is sometimes legitimate (a broken unit must be fixed
> whether or not it is booked); banking is an **external commercial promise** to RCI, and the
> system must not let staff make one the estate cannot honour. The cost is negligible:
> measured 2026-08-26, only **12 of 16,648** currently-bankable weeks are refused, because
> just **2 of 13,768** future grid days on the active estate sit at `balNight = 0`.
>
> `clamped` is still returned by `applyBankDelta` and recorded in the audit metadata - on the
> create path it is now unreachable, but delete and the edit reversal can still hit the
> `actNight` ceiling.

> **The availability rule is UNION coverage, and there is no `aptBlockId` in the payload** -
> deliberately unlike fn 6. fn 6 needs the user to pick a record because ranges are keyed
> freehand; here the range is a fixed 7-day week, so a dropdown would make no decision and
> could only be got wrong. Every day must be covered by the **union** of the unit's blocks,
> because fn 5 keys availability as a chain of yearly blocks and a week can legitimately
> straddle two consecutive ones (2027 wk53 runs 31-12-2027 -> 06-01-2028) - a case fn 6
> solves by splitting into two saves, which is impossible for an indivisible week. The
> union is also what actually matters for the grid.

**A record's identity is fixed once written** - `resortCode` / `unitNo` / `apartmentType` /
`serialNo` / `bankStatus` / the week itself. **The only editable field is `season`.** The
grid has no move: correcting a mis-keyed week is blanking it and setting the right one,
which the year save turns into a delete plus a create in the same transaction (the old
`PUT` that re-pointed a record at another week is gone with the modal). Deletes are hard
deletes with **no usage guard** - nothing references `RciBulkBank` yet; add one when the
Resorts Reservation module books against a banked week.

**Why `weekYear`/`weekNo` are denormalized** (and nullable): they are what the user actually
keys - the dates are derived; `RciWeek.friStart` has no index so a reverse lookup would be a
seq scan; and fn 2's `DELETE /year` would blank a derived value on every historical record
whenever staff regenerate a year. Nullable follows `ResortMaintenance.apartmentType` - a
legacy row that fails to resolve imports with a WARN rather than being dropped. All 771
resolve today, and CRUD always writes both.

### The screen is a WHOLE-YEAR GRID, and the year save is the only write path (2026-08-28)

fn 3 was a paginated searchable list of individual weeks with an Add/Edit modal. It is now
a fn 8-style grid: pick **resort + unit + year** and every RCI week of that year is a row
with an editable season beside it. The shape follows the data - each (resort, unit, year)
is banked for **essentially the whole year** (51 of 52 weeks in 2026, 52 of 53 in 2027, the
gap always being the year's **last** week) - where the modal cost **52 trips and ~1,000
queries** to key one year.

**A blank season means NOT BANKED**, so one dropdown does all three operations:
blank -> colour **creates**, colour -> colour **updates**, colour -> blank **deletes**.
`POST /year` is **replace-all within the year**: the client sends every week the grid
showed and the server diffs it, so the page never has to know which of the three an edit
became.

**An empty year is the add form, prefilled Red** (2026-08-28, `DEFAULT_SEASON` in
`RciBulkBank.tsx`). When a unit/year holds nothing, every **bankable** week starts at Red
— the dominant grade, 495 of the 774 migrated records — and one Save banks the year, the
same way fn 8 prefills an ungraded month with Silver. A year that already holds weeks is
**never** prefilled: there, blank has to keep meaning "not banked". Weeks the grid can see
are unbankable are **excluded from the prefill** — the save is all-or-nothing, so
defaulting one to Red would make an untouched new year refuse to save. `canSave` follows
fn 8 in being true for a new year with no edits, but only when something was actually
prefilled, so a clear-only unit's all-blank grid doesn't offer a no-op save.

**Delete year clears the whole thing, for re-entry** (`DELETE /year`, 2026-08-28). The
bottom-up bin makes correcting a badly keyed year deliberately slow — up to 53 clicks — so
a header **Delete year** button removes every week that unit has banked in that year and
gives each night back to the grid. Unlike the save it is **not a diff and is
unconditional**, so it also removes weeks the save's guards would refuse to recreate (a
week on a since-un-flagged unit, or one whose fn 5 availability has lapsed) — that is the
point: it exists to get a unit back to a clean slate, and it is the only bulk path that can
empty a clear-only unit. It takes only the `delete` permission (it never writes), and after
it runs the grid is an empty year again, so it immediately re-offers the Red-prefilled add
state to re-key into.

> **A booking guard is still missing here, deliberately.** Once Resorts Reservation exists,
> a banked week a guest has already exchanged into **must not** be withdrawn — deleting it
> would give back a unit-night that is physically occupied, and the grid would over-report
> availability for the rest of the year. The insertion point is marked with a `TODO` in
> `deleteRciBulkBankYear`, before the transaction, and it must be added to the **year
> save's `deletes` branch at the same time** — today a booked week could equally be cleared
> one cell at a time through the bin. The sibling placeholder is `maintenanceWithin()` in
> `apt-blocks.controller.ts`, which carries the same note for fn 5's delete.

**The season cell is the colour, not the name** (2026-08-28) — Red / Blue / White fill the
select's background with the **text left black throughout**, so a year's grading is
readable at a glance down the column. `SEASON_BG` in `RciBulkBank.tsx`; White carries a
border so it reads as a filled cell against the white card rather than an empty one, and
the blank (not banked) cell is transparent. Because black text is now fixed, the **unsaved
marker is an amber ring**, not amber text as in fn 8. The single letter stays in the cell:
`<option>` tinting is only honoured by Chromium, so elsewhere the open dropdown degrades to
plain text.

**Weeks are cleared from the END backwards** (business rule 2026-08-28): only the
**highest-numbered banked week** carries a bin button, and clearing it moves the button up
to the week before, so a year unwinds 53, 52, 51... The bin only blanks the cell — nothing
is written until Save year, so it participates in the same all-or-nothing save and
`Cancel changes` undoes it. It is computed from what is **displayed**, not what is stored,
which is what lets the button walk up within a single unsaved edit. The season dropdown
**keeps its blank option**, so an out-of-order clear is still possible when genuinely
needed; the bin is the guided path, not a cage.

**Guards run over the CREATES only.** That is what makes a unit fn 4 has un-flagged
**clear-only for free**: blanking its weeks produces no creates, so the `rciReserved` guard
never fires, while banking a new one is refused 400 naming fn 4. No separate rule was
needed. The picker returns such a unit only when `bankedCount > 0`, so the **205 records**
on CP-PBR `3205/3206` + `3227/3228` and L-10024 `A8` stay reachable.

**All-or-nothing, and failures are collected.** Every guard is one query for the whole
batch before the transaction opens; a year save is **~12-15 queries** whatever changed. One
failing week means nothing is written, and the message names the offenders (first 10)
rather than surfacing them one round trip at a time. The grid also greys weeks it can see
are unbankable (advisory - the server is authoritative), so this rarely fires.

**These were removed with the list**: `POST /`, `PUT /:id`, `DELETE /:id`,
`GET /:id/availability` (and the per-week Eye modal), `GET /years`, and `listRciBulkBank`'s
`q` / `season` / pagination. The Year picker now reads **fn 2's calendar**
(`GET /rci-weeks/years`), not years that have been banked - the grid draws one row per RCI
week, so a year with no calendar has nothing to draw. **A year must exist in fn 2 before it
can be banked into.**

**Grid sync** (`applyBankDelta` in `rci-bulk-bank.controller.ts`, one transaction,
`maxWait: 15_000, timeout: 120_000`). Same semantics as fn 6's `applyMaintDelta` -
**`actNight` is never touched** (the unit still exists, it just isn't ours to book), grid
rows are **never created or deleted**, and a day with no grid row is skipped. Banking ->
`balNight-1` per day, floored at 0; clearing -> `balNight+1`, ceilinged at `actNight`; a
**regrade does no grid work at all**. `clamped` is recorded in the `AuditLog` metadata.

> ### Do NOT rewrite `applyBankDelta` as `$executeRaw`
> It is **two** queries for the whole save - read the affected rows, decide in memory which
> may move, then one `updateMany` with an atomic `increment`/`decrement`. The per-day
> read+write form it replaced cost 14 round-trips per week (~730 for a year).
>
> The obvious raw-SQL version - `"date" IN (...)` with the `Date` objects bound directly -
> **silently matches nothing**. `date` is a plain `TIMESTAMP` holding UTC midnight, a bound
> JS `Date` arrives as `timestamptz`, and comparing the two makes Postgres convert using the
> server zone (`Asia/Kuala_Lumpur`), shifting every value 8 hours off. Measured 2026-08-28
> against the test DB: **0 rows updated where 7 should have been**, on both the increment and
> the decrement. Prisma's own `date: { in: days }` binding gets this right, which is why the
> read stays in Prisma. This is the same UTC-midnight trap the date-filter convention warns
> about, in a place it is easy to reintroduce while optimising.

`applyMaintDelta` (fn 6) is still the older per-day form - extract to
`utils/availabilityGrid.ts` when Resorts Reservation becomes the third caller.

> **The migration deliberately applies NO grid deltas.** `res_avail_mast.txt` was exported
> from Informix with the bulk-bank weeks **already deducted** from `ram_bal_night`, exactly
> like maintenance, so re-applying the per-day deltas at import would double-count. Deltas
> happen only on app CRUD. Verified end-to-end: importing all rows left the
> `ResAvailMast` rows for the three resorts **byte-for-byte identical** (56,769 rows), and
> **5,397 of 5,397** banked day-rows already show `balNight < actNight`. Also verified that
> across every banked day the grid deduction is **never less** than the banked-week count.

**Three cross-cutting guards live in OTHER controllers** - `RciBulkBank` carries the unit as
a denormalized `resortCode + unitNo` pair and cascades off **`Resort`**, not `ResortUnit`, so
these counts are the only referential protection:
- **`deleteResortUnit`** (fn 4) counts bulk bank rows in its 409 alongside availability and
  maintenance.
- **`deleteAptBlock`** (fn 5) refuses **409** while a banked week sits inside the record's
  dates - `applyBankDelta` already deducted those days, so `applyDelta`'s `-1` would clamp
  at 0 and never give the deduction back (`bulkBankWithin()`).
- **`createMaintenance` / `updateMaintenance`** (fn 6) refuse **409** over a banked week
  (`bulkBankOverlap()`). This is a **correctness fix, not symmetry**: both functions deduct
  `balNight -= 1` for the same physical unit-night, so an overlapping pair either
  double-deducts or clamps and loses a deduction permanently.

`deleteApartmentType`'s 409 count is **not** changed - `RciBulkBank` derives its type from
`ResortUnit`, which is already counted (the same reason `ResortMaintenance` is left out).

Imported via `prisma/migrate-rci-bulk-bank.ts` (`migrate-table.ps1 -Table RciBulkBank`, also
in `refresh-test-db.ps1`, where it runs in **step 4 after `migrate-maintenance.ts`** because
it needs `Resort` + `ResortUnit` **and** `RciWeek`). Real Informix source, so it **truncates
and reimports** - post-go-live re-import **clobbers CRUD edits**.

> **A row whose unit is not registered in `ResortUnit` is SKIPPED, not imported with a null
> type** - deliberately unlike `migrate-maintenance.ts`. `apartmentType` is the grid key and
> `resortCode`/`unitNo` are immutable in the CRUD, so such a row could never be corrected in
> the app and would be permanently inert. A unit that *is* registered but is not
> `rciReserved='Y'` **is imported with a WARN**: the RCI-qualified rule is a **save-time**
> rule, like fn 6's availability rule, so re-flagging a unit in fn 4 must not drop history.
> Both counters are 0 on the current export.

### State
39 records from `state.txt`. Fields: `code` (PK, 2-digit), `name`. Served via `GET /api/states`.

## Informix migration

Source tables and their column counts (verified from actual export files):

| File | Table | Tokens/row | Key fields |
|---|---|---|---|
| `si_ind_mast.txt` | Individual members | 67 | [61] compCityState, [62] compPostcode, [63] compStateCode, [64] telOffice2, [65] faxOffice |
| `si_cor_mast.txt` | Corporate members | 29 | faxNo at [22] |
| `si_entitlement.txt` | Agreements + nominees | 76 (fresh export) | nom1: c[25..38] (14 fields, incl icOld/icNew); nom2: c[39..53] (15 fields, base=39); nom3: c[70..73] (4 fields: name/salut/desig/nameCard); e_cse_code=c[74] (salesperson); canCode=c[61]; legacyCreatedAt=c[62]; legacyModifiedAt=c[63]. **`e_rci_refno`/`e_rci_enrol_date`/`e_rci_expiry_date`/`e_rci_fee_paid` (c[54..57]) are exported but NOT imported** — RCI lives in `RciEnrolment` alone. |
| `maa_mem.txt` | PBS schemes | pipe-delimited | coCode[0], agmt_no[1], certNo[3], schemeType[4], paybackDate[5] (dd-mm-yyyy), topUp[6], pbsIndc[11], claimIndc[12], remark[13] |
| `maa_claim.txt` | PBS claims | pipe-delimited | agmt_no[0], cert_no[1], ref_no[2], claimant[3], claimant_ic[4], acc_no[5], bank_code[6], relation_code[7], remark[8], loss_date[9], claim_amt[10], pay_mode[11], doc_no[12], doc_date[13], claim_type[14], claim_remark[15], trust_paid_date[16] |
| `amc_mem.txt` | LHC AMC schedules | 11 cols pipe-delimited | mem_no[0], agmt_no[1], cocode[2], first_due[3], next_due[4], last_invdate[5], no_of_inv[6], ttl_inv[7], price_code[8] |
| `ps_amc_mem.txt` | CP AMC schedules | 10 cols pipe-delimited | same pattern, no price_code |
| `amc_price.txt` | LHC AMC price master | pipe-delimited | coCode[0], effectiveDate[1], priceCode[2], currencyCode[3], amcAmount[4], sinkFund[5], serviceTax[6], totalAmount[7], amountInWords[9], rate[10] |
| `ps_ctrltab.txt` | CP points tiers | pipe-delimited | coCode[0], effectiveDate[1], minPoints[2], maxPoints[3], unitPrice[6], amcRatePerPoint[7], sinkingFundPct[8], gstPct[9], rciPoints[12] |
| `rci_enrol.txt` | RCI enrolment | **44 fields = 43 cols + trailing empty** (full table since 2026-08-20; was a 30-col export joined with si_entitlement) | re_cocode[0], re_serial_no[1], re_batch_no[2], re_membership_no[3], re_agreement_no[4], re_rci_no[5], re_act_date[6] (**renewal date**), re_expiry_date[7], re_rci_fees[8], re_resort_code[9], re_first_name1[10], re_last_name1[11], re_name1[12], re_first_name2[15], re_last_name2[16], re_mail_add1-3[19-21], re_mail_city_state[22], re_mail_postcode[23], re_malaysia[24], re_telno1[25], re_telno2[26], re_co_owner[27], re_rci_status[28], re_tot_interval[29]. **re_name1_no[13], re_agmt_no[14], re_name2[17], re_name2_no[18] and the print/audit/lock trailer + re_old_rci_no[30-42] NOT migrated** (business decision). `UNLOAD TO 'rci_enrol.txt' DELIMITER '\|' SELECT * FROM rci_enrol;` → `RciEnrolment` (**17,915 rows**, unique on `serialNo`) via `prisma/migrate-rci-enrolment.ts`, **the only reader of this file**. (A sibling `migrate-rci-enrol.ts` used to backfill four `Agreement` RCI columns from it; those columns were dropped on 2026-09-02 and the script is gone.) |
| `rci_week.txt` | RCI week-number calendar | **9 fields = 8 cols + trailing empty** | rw_year[0], rw_week[1], rw_fri_start[2], rw_fri_end[3], rw_sat_start[4], rw_sat_end[5]. **rw_user_create[6] and rw_date_create[7] NOT migrated** (business decision). `UNLOAD TO 'rci_week.txt' DELIMITER '\|' SELECT * FROM rci_week;` → `RciWeek` (unique on `[year, weekNo]` = `rw_idx1`). **Only years >= 2026 are imported** (business decision): **209 of 2,055 rows** — 2026:52, 2027:53, 2028:52, 2029:52. The 1,846 pre-2026 rows are skipped and are also where every anomaly sits (24 null dates, 213 drifted Saturday pairs, 2 bad `friEnd`, a 2021 gap); nothing at or after 2026 deviates. A week runs **Friday → the following Friday**, so weeks share a boundary date and the last week crosses into the next year. See `prisma/migrate-rci-week.ts`. |
| `bulk_bank.txt` | RCI Bulk Bank register | **11 fields = 10 cols + trailing empty** | bb_serial_no[0] (→ `serialNo`, Informix `serial`, unique index `ix510_1`), bb_resort_code[1], bb_apt_code[2] (→ `unitNo`, incl. compound lock-off codes `3201/3202`), bb_checkin[3] (→ `checkIn`, `dd-mm-yyyy` → UTC midnight; **always a Friday**), bb_checkout[4] (→ `checkOut`; **= checkIn + 6**, i.e. the LAST NIGHT, so the range is 7 inclusive days), bb_time_colour[5] (→ `season`; **1→`B` Blue, 2→`W` White, 3→`R` Red**, any other value skipped with a WARN), bb_status[6] (→ `bankStatus`; provenance only — rendered nowhere and absent from the CRUD zod schema). **bb_user_name[7], bb_sys_date[8] and bb_lock_status[9] NOT migrated** (business decision; lock_status is `U` on all 35,928 rows). `UNLOAD TO 'bulk_bank.txt' DELIMITER '\|' SELECT * FROM bulk_bank;` → `RciBulkBank` (unique `[resortCode, unitNo, checkIn, checkOut]` = `bb_idx1`). **Only check-in years >= 2026 are imported** (business decision, mirroring `migrate-rci-week.ts`): **774 of 35,931 rows** — 2026:459, 2027:315, over 12 units at CP-PBR / L-10024 / L-10026, all already `rciReserved='Y'`. `weekYear`/`weekNo` are denormalized from the `RciWeek` match (`friStart == checkIn`; all 774 match), so this runs **after** `migrate-rci-week.ts`, `migrate-resorts.ts` (FK) and `migrate-resort-units.ts` (apartmentType + rciReserved lookup). Rows whose unit isn't registered are **skipped**; a registered unit that isn't `rciReserved='Y'` is imported with a WARN. **Applies NO `ResAvailMast` deltas** — the grid export already has bulk bank deducted (verified: the import leaves all 56,769 grid rows byte-for-byte identical). See `prisma/migrate-rci-bulk-bank.ts`. |
| `csp_mast.txt` | Salesperson master | 4 cols pipe-delimited | csp_code[0], csp_name[1], csp_branch[2], csp_status[3] |
| `su_mast.txt` | SuReason master | 3 cols pipe-delimited | code[0], description[1] |
| `su_trans.txt` / `pt_trans.txt` | SU/PT reason backfill | 4 cols pipe-delimited | membershipNo[0], agreementNo[1], code[2]. `su_trans.txt` → `Agreement.suCode` (only if current `acctClassify=SU`); `pt_trans.txt` → `Agreement.canCode` (only if current `acctClassify=PT`, **overwrites** any existing value — pt_trans.txt is authoritative). Match key: `membershipNo + agreementNo` (NOT `agreementNo` alone — see "FK vs natural key" below, agreementNo is duplicated across TT/TF transfer pairs). Updates existing Agreement records (no separate trans table), same pattern as `rci_enrol.txt`. `pt_mast.txt` is **not used** — every code in `pt_trans.txt` (numeric, 08-45) already exists in `CancellationReason`, while `pt_mast.txt`'s own numbering (00-17) is a stale/superseded lookup the live data doesn't reference. |

| `booking_ent1.txt` | Booking entitlement (nights used) | 207 fields pipe-delimited | coCode[0], **membershipNo[1]** (long string e.g. `00002-KL-Y-0001/M/I`), **agreementNo[2]** (short e.g. `00457`) — note the natural-key columns are ordered membershipNo-then-agreementNo, the reverse of intuition. be_year1..50 = c[3..52] (nights used → `nightsUsed`), be_act_night1..50 = c[53..102] (actual nights taken → `actualNights`), be_wk1..50 = c[153..202] (weekend used → `weekendUsed`). Block 3 (c[103..152]) and trailer (c[203..205]) are other categories, ignored. Only coCode 03/15 imported → `BookingEntitlement` (one row per year where any of nights/actual/weekend is non-zero). See `prisma/migrate-booking-entitlement.ts`. |

| `ps_bookent1.txt` | CP booking entitlement (point balances) | 9 cols + trailer, pipe-delimited | psb_cocode[0] (always `02`), psb_memno[1] (e.g. `M00020/I`), psb_agmtno[2] (e.g. `P00020`), psb_useyear[3] (`dd-mm-yyyy` anniversary date), psb_totalpts[4], psb_curusepts[5], psb_advusepts[6], psb_acrusepts[7], **psb_balpts[8]** (balance points — the value the CP card displays). **All rows** imported (a fully-unused future year `balPts` and terminal 0-balance rows are both meaningful) → `CpBookingEntitlement`. `agreementId` left null (natural-key read path). Schema verified in `ps_bookent1.sql`. See `prisma/migrate-cp-booking-entitlement.ts`. |

| `ps_company.txt` | Product / operating-company master | 17 cols pipe-delimited (+ trailing empty field, so `NF=18`); **only [0..8] migrated** | psc_cocode[0] (→ `coCode`), psc_coname[1] (→ `coName`), psc_enttype[2] (→ `entType`; `W`=Week / `P`=Points, any other value skipped with a WARN), psc_coaddr1-3[3-5] (→ `add1`/`add2`/`add3`), psc_cotel[6] (→ `telNo`), psc_cofax[7] (→ `faxNo`), psc_contact[8] (→ `contactPerson`). **psc_coincode[9], psc_invt[10], psc_arco[11] (accounting/invoicing codes), psc_usercreate/datecreate/usermodify/datemodify[12-15] and psc_lockstatus[16] NOT migrated.** `UNLOAD TO 'ps_company.txt' DELIMITER '\|' SELECT * FROM ps_company;` (**unfiltered** — the first export handed over was filtered to 7 rows and had to be re-extracted) → `Product` (unique on `coCode`). **29 rows, coCodes 01-29:** 02 (P, CP), 03/15 (W, LHC) are our own products and the only ones carrying agreements; the other 26 are exchange partners / affiliated companies and are what `LvcCode.coCode` references. 02/03/15 carry no address/tel/fax/contact; most partners do. **`status` is NOT from the source** — `prisma/migrate-products.ts` applies its own `ACTIVE_CODES` whitelist (`02`, `03`, `15`, `24`, `25`, `26`) and deactivates every other coCode on each run, sweeping the whole table so it holds on both a truncate-and-load and an additive re-run. See `### Product` and `prisma/migrate-products.ts`. |

| `lvc_master.txt` | LVC exchange-programme master | 14 cols pipe-delimited (+ trailing empty field, so `NF=15`); **only [0..6] migrated** | lvc_code[0] (→ `lvcCode`, e.g. `LVC-CP`), lvc_cocode[1] (→ `coCode` — **references `ps_company.psc_cocode` → `Product.coCode`**; all 23 rows resolve against the full 29-row export; validated on CRUD, no hard FK), lvc_name[2] (→ `lvcName`), lvc_status[3] (→ `status`; `A`=Active, `U`=Inactive, defaults `A` when blank. **Informix also uses `C` (Cancelled), which is MAPPED TO `U`** — the same way `re_resort_status` `I` → `U` is mapped in `migrate-resorts.ts`. Any *other* value is still skipped with a WARN), lvc_incoming[4], lvc_outgoing[5], lvc_fax_batch[6] (→ `incoming`/`outgoing`/`faxBatch`). **user_create[7], date_create[8], user_modify[9], date_modify[10], user_cancel[11], date_cancel[12], lock_status[13] NOT migrated.** `UNLOAD TO 'lvc_master.txt' DELIMITER '\|' SELECT * FROM lvc_master;` → `LvcCode` (unique on `lvcCode`). **The three counters are `decimal(5,0)` but export as FLOAT strings (`"519.0"`) — parse with `Math.round(parseFloat(…))`, the same trap `pssa_year` (`"2000.0"`) has in `migrate-cp-season-points.ts`.** Names are imported **verbatim including source typos** (`LVC-RR` = `ROYAL RESORTS GROU[P`, `LVC-AWT` = `ABSOLUTE WORL TRAVEL LTD`) — staff correct them via the CRUD screen; rewriting them here would make a re-import disagree with Informix. **22 rows as of the 2026-08-27 export — 11 `A` / 11 `C`, loading as 11 Active / 11 Inactive.** The earlier export was 23 rows all `A`. **Before the `C` → `U` mapping existed, all 11 `C` rows were silently dropped** as unknown statuses, so the 2026-08-27 refresh loaded only **11** codes. A re-import still overwrites any staff retirement of an `A` row back to `A`. See `prisma/migrate-lvc-codes.ts`. |

| `resort_mast.txt` | Resort master | 26 cols pipe-delimited | re_resort_code[0], re_cocode[1], re_short_name[2], re_resort_name[3], **re_exc_reg[4] + re_rci_release[7] skipped**, re_rci_aff[5] (→ `rciAffiliate`), re_rci_code[6], re_lock_onoff[8] (lock-on/lock-off: apartment splits as Sleep2/4/6), re_resort_mgmt[9], re_contact_person[10], re_add1-3[11-13], re_city[14], re_state[15], re_country[16], re_telno[17], re_faxno[18], re_resort_status[19] (Informix `A`/`I` — **`I` is mapped to `U`** for this codebase's A/U convention), re_paymt[20], re_create_user/date[21-22], re_mod_user/date[23-24], re_lock_status[25]. `UNLOAD TO 'resort_mast.txt' DELIMITER '\|' SELECT * FROM resort_mast;` (**unfiltered since 2026-07-30**; was `WHERE re_resort_status='A' AND re_cocode IN ('03','15','02')` = 7 rows) → `Resort`. **324 rows** — **12 active / 312 inactive** (was 49/275 at import; staff retired resorts in the app afterwards and the additive re-import never pushes Informix statuses back), all coCodes, including the `V-*` LVC exchange resorts needed by fn 9's Non-Home tab. The script does NOT truncate and uses `skipDuplicates`, so running it alone is **additive**. See `prisma/migrate-resorts.ts`. |

| `apt_category.txt` | Apartment sleep types | 4 cols pipe-delimited (+ trailing empty field, so `NF=5`; deliberately partial export of the 11-col `apt_category`) | aptc_resort_code[0] (→ `resortCode`; 320 distinct, **all resolve against `Resort`** — 0 unmatched), aptc_type[1] (→ `apartmentType`; SLEEP2/4/6, 1BR/2BR/3BR, `HOTEL UNIT`, SLEEPA-E, `D'LUX ROOM`, …), aptc_remark[2] (→ `description`; never blank, max 30 chars), aptc_lock_type[3] (→ `lockType`; LN 471 / LS 10 / LM 6, any other value stored as LN with a WARN). **aptc_timein / aptc_timeout (per-type check-in/out times — the resort-level `checkInTime`/`checkOutTime` cover this today) and the aptc_user_name / aptc_sys_date / aptc_mod_user / aptc_mod_date / aptc_lock_status trailer NOT migrated.** `UNLOAD TO 'apt_category.txt' DELIMITER '\|' SELECT aptc_resort_code, aptc_type, aptc_remark, aptc_lock_type FROM apt_category;` → `ApartmentType` (unique `[resortCode, apartmentType]` = Informix `aptc_idx1`). **487 rows, 320 resorts, 0 duplicate pairs**; verified to round-trip byte-for-byte against the source. **Supersedes the 9 hand-transcribed rows formerly hardcoded as `APARTMENT_TYPES` in `migrate-resorts.ts`** (all 9 reproduced verbatim). The file is **CRLF-terminated** — `readline` with `crlfDelay: Infinity` strips the `
`, but a raw `diff` against DB output needs `tr -d '
'` first. See `prisma/migrate-apt-category.ts`. |
| `apt_mast.txt` | Resort units (Apartments/Units register) | 5 cols pipe-delimited (deliberately partial export of the 15-col `apt_mast` — dates/audit/lock_status skipped) | apt_code[0] (→ `unitNo`; compound lock-off codes `3227/3228`, dotted `1.12A`), apt_resort_code[1], apt_rci_reserved[2] (Y/N — **STALE in the source and overridden** at four resorts by the `RCI_RESERVED` map in `migrate-resort-units.ts`; see `### ResortUnit`), apt_unit_type[3] (matches `ApartmentType.apartmentType`), apt_occupancy[4]. **Do NOT hand-write this UNLOAD — run `migrate/apt_mast_unload.sql`**, which joins `resort_mast` for `re_resort_status = 'A'` and applies the four-resort live-unit whitelist (L-10024 A1-A34, L-10025 B1-B22, L-10026 floors 4-5, CP-PBR the 32xx family). → `ResortUnit` (unique `[resortCode, unitNo]` — apt_code NOT globally unique). **358 rows over 12 active resorts**; an unfiltered export is 12,047 over 316. An optional second file `apt_mast_active.txt` (`migrate/apt_mast_active_unload.sql`) is read by the same loader and de-duplicated. See `prisma/migrate-resort-units.ts`. |

| `ps_resort_info.txt` | Resort info (4 blocks of print lines) | 38 cols pipe-delimited | psri_resort_code[0], psri_get_there1-10[1-10], psri_res_fac1-10[11-20], psri_pl_int1-6[21-26], psri_unit_amen1-6[27-32], legacy audit[33-36] + lockstatus[37] skipped (all empty). `UNLOAD TO 'ps_resort_info.txt' SELECT * FROM ps_resort_info;` → `ResortInfoLine` (one row per non-empty slot; slot no. = `seq`). See `prisma/migrate-resort-info.ts`. |

| `res_avail_mast.txt` | Resort availability (per-day grid) | 7 cols pipe-delimited; only [0..4] migrated | ram_resort_code[0] (→ `resortCode`), ram_apt_type[1] (→ `apartmentType`), ram_date[2] (`dd-mm-yyyy` → UTC midnight), ram_act_night[3] (→ `actNight`), ram_bal_night[4] (→ `balNight`). **ram_rel_night[5] + ram_lock_status[6] NOT migrated.** `UNLOAD TO 'res_avail_mast.txt' DELIMITER '\|' SELECT * FROM res_avail_mast;` → `ResAvailMast` (unique `[resortCode, apartmentType, date]`; 94,876 rows, chunked). See `prisma/migrate-res-avail.ts`. |

| `apt_block.txt` | Availability input blocks | 10 cols pipe-delimited; only [0..4] migrated | resort_code[0], apt_code[1] (→ `unitNo`, incl. `3005/3006`), start_date[2], end_date[3] (`dd-mm-yyyy` → UTC midnight), block_no[4] (→ `blockNo`). **create-user[5], create-date[6], 'new'[7], blank[8], lock_status[9] NOT migrated.** `apartmentType` derived by ResortUnit lookup (null when unit absent from `apt_mast` export). **Run `migrate/apt_block_unload.sql`** — same two filters as `apt_mast_unload.sql` (active resorts + the four-resort whitelist), which they must always match. → `AptBlock` (unique `[resortCode, unitNo, startDate, endDate]`; **5,162 rows**, vs 25,266 unfiltered). See `prisma/migrate-apt-block.ts`. |

| `resmt.txt` | Resorts Maintenance register | 9 cols pipe-delimited (+ trailing empty field, so `NF=10`); only [0..5] migrated | rm_serial_no[0] (→ `serialNo`), rm_resort_code[1], rm_apt_code[2] (→ `unitNo`, incl. `3231/3232` and `3.9B`), rm_checkin[3] (→ `startDate`), rm_checkout[4] (→ `endDate`) (`dd-mm-yyyy` → UTC midnight), rm_remarks[5] (→ `remarks`, the reason). **rm_user_name[6], rm_sys_date[7], rm_lock_status[8] NOT migrated** (lock_status is `U` on all 13,396 rows). `apartmentType` derived by ResortUnit lookup (null when the unit isn't registered — 291 rows, all historic). **Run `migrate/resmt_unload.sql`** — carries the four-resort unit whitelist but is **NOT** status-filtered, so it stays a full-table export → **10,904 rows** (6,069 of them on retired resorts, which import with a null apartmentType). → `ResortMaintenance` (unique `[resortCode, unitNo, startDate]` = Informix `rm_idx1`). An unfiltered export yields 13,396; the extra 6,069 reference retired resort codes (L-10020 3122, L-10027 1626, L-10013 426, L-103 378, …) absent from `Resort`, so the FK can't be satisfied — the script skips them with a summary WARN rather than failing, so either export works. **Applies NO `ResAvailMast` deltas** — the grid export already has maintenance deducted. See `prisma/migrate-maintenance.ts`. |

| `ps_seasondate.txt` | CP season calendar (per-day G/S/D grading) | **TWO LAYOUTS — the offset is DETECTED, not assumed.** Full table (since the 2026-08-27 export): 8 cols (+ trailing empty, `NF=9`) with a **leading `ps_cocode`** (always `02`, not stored) — date at `[1]`, season at `[2]`, audit/lock trailer `[3..7]` not migrated. Old export: 2 cols (`NF=3`) — date at `[0]`, season at `[1]`. | ps_date (`dd-mm-yyyy` → UTC midnight), ps_season (`G`=Gold / `S`=Silver / `D`=Diamond; any other value is skipped with a WARN). `year` derived from the date. `UNLOAD TO 'ps_seasondate.txt' DELIMITER '\|' SELECT * FROM ps_seasondate;` → `CpSeasonDate` (unique on `date` — one season per day). **424 rows, 2026-01-01 → 2027-02-28, fully contiguous (no gaps, no duplicate dates); D 40 / G 56 / S 328 forming 33 contiguous runs.** CP-only — see the per-product calendar note under `### Holiday`. **`migrate-cp-seasons.ts` picks the offset by VALUE** — whichever of `[0]`/`[1]` parses as `dd-mm-yyyy` is the date column — and throws if neither does. Before that detection existed, the full-table export **silently skipped every row** (cocode `02` fails the date parse, so each line hit the `WARN unparseable date` path), which is exactly what the 2026-08-27 refresh did: **`CpSeasonDate` came back empty**, taking fn 8 and the whole CP season grading with it. See `prisma/migrate-cp-seasons.ts`. |

| `ps_seasonapt.txt` | Season points chart, HOME half (points per night) | 24 cols pipe-delimited (+ trailing empty field, so `NF=25`); **only [0..11] migrated** | pssa_resort_code[0] (`CP-PBR` on every row), pssa_apt_type[1] (→ `apartmentType`; SLEEP2/SLEEP4/SLEEP6), pssa_year[2] (**collapse key only, NOT stored** — see below; exported as a float string `"2000.0"`, so use `parseFloat`, not the `d()` date helper), pssa_effdate[3] (→ `effectiveDate`, `dd-mm-yyyy` → UTC midnight), pssa_season[4] (`G`/`S`/`D`; any other value skipped with a WARN), pssa_norpts0..6[5-11] (→ `ptsSun`..`ptsSat`, **0 = Sunday … 6 = Saturday**). **pssa_lvcpts0..6[12-18] NOT migrated (zero on all 253 rows), plus audit/lock cols [19-23].** `UNLOAD TO 'ps_seasonapt.txt' DELIMITER '\|' SELECT * FROM ps_seasonapt;` → `SeasonPoint` as `pointsType='HOME'` (unique `[resortCode, effectiveDate, apartmentType, season]`). **The source is 253 rows over 28 years (2000-2027) × 3 types × 3 seasons, but SeasonPoint stores effective-dated VERSIONS, not per-year charts** — `collapseToLatestVersion()` keeps only CP-PBR's latest year (the chart in force) and stamps it with the latest `effectiveDate` among those rows, so **9 rows are imported**. The collapse MUST run before `createMany`: `skipDuplicates` would otherwise silently drop the surplus years. CP-only — see the per-product calendar note under `### Holiday`. See `prisma/migrate-cp-season-points.ts`. |

| `ps_lvcapt.txt` | Season points chart, AWAY half (points per night away from home) | 20 cols pipe-delimited; **only [0..13] migrated** | resort_code[0] (→ `resortCode`; 264 distinct, **all resolve against `Resort`** — 0 unmatched), resort cocode[1] (→ `coCode`, the resort's OWN product; 24 distinct, never `02`, **constant per resortCode**), apt_type[2] (→ `apartmentType`; SLEEP2/4/6, 1BR/2BR/3BR, HOTEL UNIT, SLEEPA-E), lvc cocode[3] (→ `lvcCoCode`, the product **charged** — `02` on all 4,513 rows), year[4] (**collapse key only, NOT stored** — see below; exported as a float string `"2000.0"`, so use `Math.round(parseFloat(…))`, the same trap as `pssa_year`), effdate[5] (→ `effectiveDate`, `dd-mm-yyyy` → UTC midnight), season[6] (`G`/`S`/`D`; any other value skipped with a WARN), points0..6[7-13] (→ `ptsSun`..`ptsSat`, **0 = Sunday … 6 = Saturday**). **Cols [14..19] — the legacy user/date/blank/lock trailer (`teh\|17-04-2000\| \|\|U\|`) — NOT migrated.** `UNLOAD TO 'ps_lvcapt.txt' DELIMITER '\|' SELECT * FROM ps_lvcapt;` (**unfiltered**) → `SeasonPoint` as `pointsType='AWAY'` (unique `[resortCode, effectiveDate, apartmentType, season]`). **The source is 4,513 rows over 264 resorts and years 2000-2028, but SeasonPoint stores effective-dated VERSIONS** — `collapseToLatestVersion()` keeps only each resort's latest year and stamps it with the latest `effectiveDate` among those rows, importing **~1,200**. Its `effectiveDate` is really a per-apartment-type "rate set on" stamp: `V-LDBR`'s SLEEP4 reads `2002-02-15` in all 17 of its years. The collapse MUST run over the WHOLE file before any insert, which is why this script no longer flushes as it parses. Apartment type is **not** validated at import (**408 of the 412** pairs now exist in `ApartmentType` since the `apt_category.txt` load of 2026-08-10 — it was 5 of 412 under the old 9-row seed); the CRUD validates new types and grandfathers the remaining 4. `createMany` **chunked at 100** (`MIGRATE_BATCH`). See `prisma/migrate-lvc-season-points.ts`. |

| `ctrl_billtab.txt` | AMC invoice running number per coCode | 2 cols pipe-delimited | cocode[0], last_amcinv[1]. `UNLOAD TO 'ctrl_billtab.txt' SELECT cocode, last_amcinv FROM ctrl_billtab WHERE cocode IN ('03','15','02');`. Upsert-by-coCode → `AmcInvoiceCounter` (`coCode` PK, `lastInvNo`). Seeds the per-coCode AMC invoice running number so the new system continues where Informix left off. **Re-running RESETS `lastInvNo`** to the Informix value — OK for UAT refresh, must NOT run after go-live. See `prisma/migrate-amc-invoice-counter.ts`. |

Informix date format is `dd-mm-yyyy` — the `d()` helper in migration scripts handles this.

### createMany batch size — PostgreSQL "CachedPlan" out-of-memory

Migration scripts must keep `createMany` batches **small**. A large batch becomes one INSERT with
`rows × columns` bind parameters, and the server caches its plan; past a certain point the PostgreSQL
backend process dies with:

```
PostgresError { code: "53200", message: "out of memory",
                detail: "Failed on request of size 40 in memory context \"CachedPlan\"" }
```

It typically fails **partway through** (not on the first batch) — with `plan_cache_mode=auto` the server
attempts a *generic* plan after ~5 executions of the same statement, and memory accumulates across
executions within the session. The failure point drifts run to run with available RAM, so a batch size
that worked yesterday can fail today.

Hit on 2026-07-27 during a full `refresh-test-db.ps1` against the test server (PG18, **stock config —
`shared_buffers` 128MB, `work_mem` 4MB**). Four scripts had to be lowered; all now read
`Number(process.env.MIGRATE_BATCH) || <default>` so a run can be tuned without editing code:

| Script | Was | Now | Note |
|---|---|---|---|
| `migrate-informix.ts` | 500 | **100** | `Member` is 68 cols → 500 rows = 34,000 params. Failed at 7-11k rows. |
| `migrate-amc-schedules.ts` | 500 | **100** | Failed ~5.5k CP rows. |
| `migrate-res-avail.ts` | 5000 | **100** | Failed at 85,000/94,876 even at 1000. |
| `migrate-cp-booking-entitlement.ts` | 1000 | **100** | Largest table (279k rows); failed at 60k @1000 and 200k @500. |

`migrate-booking-entitlement.ts` (500, narrow table, 201k rows) and the 200-batch PBS scripts were
unaffected — leave them. **All these `createMany` calls use `skipDuplicates: true`, so a failed run can
simply be re-run and it resumes** rather than duplicating.

> If this keeps recurring, the durable fix is server-side: give the test server more RAM or tune
> `postgresql.conf` (it is currently untouched defaults). Lowering batch sizes is a workaround.

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
GET  /api/agreements/:id                    Agreement detail + AMC + PBS + invoices + rciEnrolment (the CURRENT RciEnrolment row) + rciEnrolmentCount
PUT  /api/agreements/:id                    Update agreement (requireITorMemberServices). Does NOT accept RCI fields — RciEnrolment is the source of truth and RCI fn 1 the only editor. Currently unreferenced by the frontend
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
GET  /api/products?q=                       Product / company master list (q = code/name/contact; RESORTS_SETUP view)
POST /api/products                          Create product (RESORTS_SETUP create; 409 on duplicate coCode)
PUT  /api/products/:id                      Update product (coCode immutable; RESORTS_SETUP edit)
PATCH /api/products/:id/toggle              Toggle product status A/U (RESORTS_SETUP edit)
DELETE /api/products/:id                    Delete product (RESORTS_SETUP delete; 409 if any Agreement/AmcSchedule/Resort still carries the coCode)
GET  /api/lvc-codes?q=                      LVC exchange code list (q = LVC code/name/co code; RESORTS_SETUP view)
POST /api/lvc-codes                         Create LVC code (RESORTS_SETUP create; 409 on duplicate lvcCode)
PUT  /api/lvc-codes/:id                     Update LVC code (lvcCode immutable; counters not accepted; RESORTS_SETUP edit)
PATCH /api/lvc-codes/:id/toggle             Toggle LVC code status A/U (RESORTS_SETUP edit)
DELETE /api/lvc-codes/:id                   Delete LVC code (RESORTS_SETUP delete; no usage guard — nothing references it yet)
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
DELETE /api/apartment-types/:id             Delete apartment type (RESORTS_SETUP delete; 409 if any ResortUnit/AptBlock/ResAvailMast/SeasonPoint at that resort still names the type)
GET  /api/resort-units?q=&resortCode=&page=&pageSize=  Unit list, paginated (RESORTS_SETUP view)
POST /api/resort-units                      Create unit (RESORTS_SETUP create; apartmentType must exist for the resort)
PUT  /api/resort-units/:id                  Update unit (resortCode immutable; RESORTS_SETUP edit)
DELETE /api/resort-units/:id                Delete unit (RESORTS_SETUP delete; 409 if the unit still has any AptBlock or ResortMaintenance record)
GET  /api/apt-blocks?q=&resortCode=&page=&pageSize=  Availability record list, paginated, sorted startDate desc (RESORTS_SETUP view). There is NO update endpoint - fn 5 is add-only
GET  /api/apt-blocks/availability-chart?coCode=&date=&days=  Resort Availability chart: ResAvailMast pivoted resort×date, cell=balNight (any product; ACTIVE resorts of that coCode only; 400 without coCode; RESORTS_SETUP view)
GET  /api/apt-blocks/units?resortCode=      Availability records per unit at that resort: [{ unitNo, blocks:[{id,startDate,endDate}] }], blocks newest first (400 without resortCode) - feeds the fn 6 unit picker AND its Availability dropdown; units absent from the result have no availability and are greyed out there (RESORTS_SETUP view)
GET  /api/apt-blocks/:id/availability       Per-day grid (date/act/bal) for a block's resort+type over its date range (RESORTS_SETUP view)
POST /api/apt-blocks                        Create block + generate ResAvailMast day rows (RESORTS_SETUP create; 409 on overlap, 400 if unit/type mismatch). Our own products only in the UI - the MAR resorts go through /batch
POST /api/apt-blocks/batch                  MAR batch: create/reuse N units at a partner resort and give each one availability record over one shared date range (body: resortCode, apartmentType, unitCount 1-200, occupancy 1-20, startDate, endDate). Unit numbers are generated "1-occupancy".."N-occupancy"; units already registered with the SAME apartment type are REUSED (only the record is added), a clash with a different type is 409. All-or-nothing in one transaction; grid gets ONE pass at +N per day. Returns a summary object { unitNos, unitsCreated, unitsReused, blocksCreated, days, ... }. RESORTS_SETUP create; 400 if the resort's coCode is 03/15/02 (use POST /api/apt-blocks) / apartment type not set up for the resort / range > 3660 days, 409 naming the units that clash or already have overlapping availability
DELETE /api/apt-blocks/:id                  Delete block + reverse its grid contribution (RESORTS_SETUP delete; 409 if the unit has any ResortMaintenance record overlapping the block's dates)
GET  /api/resort-maintenance?q=&resortCode=&unitNo=&from=&to=&year=&month=&page=&pageSize=  Maintenance list, paginated, sorted startDate desc (RESORTS_SETUP view). year (+ optional month 1-12) filters to records whose range OVERLAPS that period; month without year is ignored. unitNo is an EXACT match and from/to (YYYY-MM-DD) an arbitrary overlap window - together they feed the fn 6 form's calendar, which greys out days the unit is already withdrawn on
GET  /api/resort-maintenance/years          Distinct years spanned by the register, newest first — feeds the Year dropdown (RESORTS_SETUP view)
GET  /api/resort-maintenance/:id/availability  Per-day grid (date/act/bal) for a record's resort+type over its date range (RESORTS_SETUP view)
POST /api/resort-maintenance                Create 1-3 records for one unit + decrement ResAvailMast.balNight per day (body: resortCode, unitNo, **aptBlockId** [REQUIRED - the fn 5 availability record every range must sit inside], remarks [REQUIRED, shared by all ranges], ranges[{startDate,endDate}] 1..3). All-or-nothing in one transaction; returns `{ data: [] }` (an ARRAY). RESORTS_SETUP create; 409 naming the range that overlaps an existing record, 400 if two submitted ranges overlap each other / unit not registered / **aptBlockId names a record belonging to another unit** / **a range falls outside that record's period** / total days > 3660
PUT  /api/resort-maintenance/:id            Edit dates + remarks (body: aptBlockId + startDate + endDate + remarks, all REQUIRED), re-sync grid; returns a single object (resortCode/unitNo/type immutable; RESORTS_SETUP edit; 400 if the range falls outside the named availability record or it belongs to another unit; 409 on overlap)
DELETE /api/resort-maintenance/:id          Delete record + restore its balNight contribution (RESORTS_SETUP delete)
GET  /api/holidays?type=&q=&year=           Holiday list for one kind, sorted startDate asc; `type` (PUBLIC|SCHOOL) is REQUIRED (400 otherwise); q searches the name; year = calendar year (PUBLIC) or academic year (SCHOOL) (RESORTS_SETUP view)
GET  /api/holidays/years?type=              Distinct years present for that kind, newest first — feeds the Year dropdown (RESORTS_SETUP view)
POST /api/holidays/clone                    Clone a year to sourceYear+1, same month/day on both ends (body: holidayType, sourceYear; RESORTS_SETUP create; 409 if target year non-empty, 404 if source empty)
POST /api/holidays                          Create holiday (body: holidayType, startDate, description + endDate/year for SCHOOL; PUBLIC derives year and stores endDate null; RESORTS_SETUP create; 400 if end<start or SCHOOL missing endDate/year, 409 on duplicate date+name, SCHOOL overlap, or duplicate SCHOOL name in the academic year)
PUT  /api/holidays/:id                      Update dates / name / academic year; holidayType is immutable (taken from the stored row); PUBLIC re-derives year; SCHOOL re-checks order + overlap + duplicate name (RESORTS_SETUP edit)
DELETE /api/holidays/:id                    Delete holiday (RESORTS_SETUP delete)
GET  /api/cp-seasons?year=&month=           One month's graded days, unpaginated, sorted date asc; BOTH year and month required (400 otherwise). Ungraded days are absent — the page scaffolds them (RESORTS_SETUP view)
GET  /api/cp-seasons/years                  Distinct years in the calendar, newest first — feeds the clone picker (RESORTS_SETUP view)
POST /api/cp-seasons/month                  Bulk upsert a whole month (body: year, month, days[{date,season}]) — the add AND edit path; 400 if any date falls outside the month or repeats (RESORTS_SETUP create)
DELETE /api/cp-seasons/month?year=&month=   Delete every graded day in the month (RESORTS_SETUP delete; 404 if the month is empty)
POST /api/cp-seasons/clone                  Clone a year's grading to sourceYear+1, same month/day (body: sourceYear; RESORTS_SETUP create; 409 if target year non-empty, 404 if source empty)
GET  /api/season-points?type=&resortCode=&effectiveDate=  One VERSION's points rows for one kind, unpaginated, sorted apartmentType/season; also returns the resort header, its apartmentTypes (registered + grandfathered, each flagged) and (AWAY only) the version's lvcCoCode. type + resortCode required (400); effectiveDate OPTIONAL - omitted returns the version in force TODAY (greatest effectiveDate <= today), else the earliest. type is HOME|AWAY and must match the resort's kind (coCode '02' = HOME), else 400; 404 if the resort is unknown (RESORTS_SETUP view)
GET  /api/season-points/versions?resortCode=  Every version set up for that resort, newest first: { effectiveDate, rows, apartmentTypes, seasons, lvcCoCode, isCurrent } - feeds the version list (RESORTS_SETUP view)
POST /api/season-points/version             Save a whole version (body: pointsType, resortCode, effectiveDate, replaces? [the version's stored date when editing], lvcCoCode? [AWAY only], rows[{apartmentType,season,ptsSun..ptsSat}]) - the add AND edit path, REPLACE-ALL within the version so rows dropped from the payload are deleted. pointsType and coCode are derived from the resort, never the payload. 400 on a kind mismatch, an unknown lvcCoCode product, an apartment type neither registered in fn 3 nor already stored, or a repeated (type,season); 409 if the resort already has a version on the target date; 400 if a CREATE (no `replaces`) is dated on or before the resort's latest existing version - a new rate must supersede, not backdate (RESORTS_SETUP create)
DELETE /api/season-points/version?type=&resortCode=&effectiveDate=  Delete a whole version (RESORTS_SETUP delete; 400 on a kind mismatch, 404 if empty). There is no per-row delete - blank a row and re-save instead
GET  /api/rci-enrolments?q=&coCode=&rciStatus=&page=&pageSize=  RCI enrolment list, paginated (q = membership/agreement/RCI no/name/co-owner/resort code; RESORTS_SETUP view). Each row also carries memberId + agreementId, resolved per page by natural key and NOT stored, so the list can link back to Member/Agreement detail. Either may be null when the row's natural key resolves to nothing, which on the 2026-08-27 data was 4 rows (no member) and 6 (no agreement) - all six Informix source defects (a branch-code typo, a coCode typo, a `00000-` placeholder duplicate, a wrong membership, a junk `ABC`/`123` row and a legacy coCode 12), **rectified at source on 2026-09-03, so a refresh after that date should make this zero**
GET  /api/rci-enrolments/agreement-search?q=&coCode=&limit=  Agreement picker for the add form: search by membership no, member name or agreement no (the same three columns listAgreements searches). Top-N, NOT paginated - limit default 20 / cap 50, with `total` returned so the form can say "refine your search"; a `q` under 2 chars is an EMPTY 200, not a 400, since the form fetches as the user types. Each row carries memberName, memberType, nominee1Name, `suggestedName1` (the member's fullName for an INDIVIDUAL, nominee 1's for a CORPORATE - resolved server-side and pre-truncated to name1's 40 chars) and `enrolled`/`enrolmentSerialNo`, computed for the whole page in ONE batched groupBy on the full natural key. Already-enrolled agreements are returned FLAGGED, never filtered out - hiding them would read as "no such agreement". Lives here rather than on /api/agreements because that route needs the AGREEMENTS permission (RESORTS_SETUP view). **Replaced `GET /lookup`, which is gone** (RESORTS_SETUP view)
GET  /api/rci-enrolments/:id                Enrolment + memberName/acctClassify resolved by natural key (RESORTS_SETUP view)
POST /api/rci-enrolments                    Create enrolment; serialNo allocated as max+1 (RESORTS_SETUP create; 400 if the agreement key names no agreement)
PUT  /api/rci-enrolments/:id                Update enrolment; coCode/membershipNo/agreementNo are immutable (RESORTS_SETUP edit)
DELETE /api/rci-enrolments/:id              Delete enrolment (RESORTS_SETUP delete; no usage guard)
GET  /api/rci-weeks?year=                    One year's RCI weeks, unpaginated, ordered weekNo asc; year REQUIRED (400 otherwise). Returns { data, year, weeks } (RESORTS_SETUP view)
GET  /api/rci-weeks/years                   Distinct years set up, newest first — feeds the year dropdown (RESORTS_SETUP view)
POST /api/rci-weeks/year                    Generate a whole year's 52/53 weeks from the year alone (body: year; RESORTS_SETUP create; 400 below MIN_YEAR 2026, 409 if the year already has weeks). Returns { year, weeks, firstFriday, lastWeekEnd }
DELETE /api/rci-weeks/year?year=            Delete a whole year's weeks (RESORTS_SETUP delete; 404 if the year is empty; **409 if any RCI fn 3 bulk bank week is banked against that calendar**, naming the count and the first 5 units - RciBulkBank has no FK to RciWeek, so this count is the only thing stopping the banked rows being stranded with no calendar behind them). There is NO per-week delete and no update endpoint at all
GET  /api/rci-bulk-bank?resortCode=&unitNo=&weekYear=  One unit's banked weeks for one year, UNPAGINATED (52/53 rows at most), ordered checkIn asc. All three params REQUIRED (400 otherwise). Rows are matched on checkIn against the year's RciWeek Friday starts, NOT on the weekYear column, so a legacy row whose weekYear never resolved still appears in the year it falls in - saveRciBulkBankYear matches identically, so the grid displays exactly what the save diffs against. Returns { data, resortCode, unitNo, weekYear } (RESORTS_SETUP view)
GET  /api/rci-bulk-bank/units?resortCode=   Units the fn 3 grid may show at that resort, each with its fn 5 availability ranges: [{ unitNo, apartmentType, occupancy, rciReserved, bankable, bankedCount, blocks[] }]. `bankable` (rciReserved='Y' AND not a lock-off half) means new weeks can be banked; a NON-bankable unit is returned only when bankedCount > 0, so the 205 records on units fn 4 has since un-flagged (CP-PBR 3205/3206 + 3227/3228, L-10024 A8) stay visible and clearable. A unit with an empty blocks[] has no availability and is listed disabled. At a lockOnOff='Y' resort the response also carries splitTypes: string[]|null naming the excluded halves so the form can explain the omission. 400 without resortCode, 404 unknown resort (RESORTS_SETUP view)
DELETE /api/rci-bulk-bank/year?resortCode=&unitNo=&weekYear=  Clear a unit's WHOLE year unconditionally + restore each day's balNight - for re-entry, since the bottom-up bin makes clearing a year cell by cell deliberately slow. NOT a diff: it also removes weeks the save would refuse to recreate (un-flagged unit, lapsed availability), and is the only bulk path that can empty a clear-only unit. All three params REQUIRED (400); 404 if the year has no calendar or the unit has nothing banked in it. **No booking guard yet** - see the TODO in deleteRciBulkBankYear (RESORTS_SETUP delete)
POST /api/rci-bulk-bank/year                Save one unit's whole year - the ONLY write path (body: resortCode, unitNo, weekYear, weeks[{ weekNo, season R|B|W or null }]). REPLACE-ALL within the year: every week the grid shows is sent, season null = not banked, and the server diffs it against what is stored into creates (blank -> season), updates (season -> season) and deletes (season -> blank). checkIn/checkOut are DERIVED from RciWeek - there is no date input anywhere. serialNos are allocated max+1..max+N inside the transaction. Requires RESORTS_SETUP create AND edit AND delete (the diff can do all three). Guards run over the CREATES only, which is what makes a non-RCI-qualified unit clear-only for free. 404 unknown resort; 400 if the unit isn't registered / a weekNo isn't in the year's fn 2 calendar / a weekNo repeats; 400 naming fn 4 if creates exist and the unit isn't rciReserved='Y'; 400 if it is a lock-off half at a lockOnOff='Y' resort. Per-week failures are COLLECTED, not thrown on the first: a week not covered by the unit's fn 5 availability (400), under maintenance (409 -> fn 6), already banked/overlapping (409), or containing a day with balNight=0 (409 - banking is refused, never clamped). ALL-OR-NOTHING - one failing week means nothing is written, and the message names the offending weeks (first 10). Returns { created, updated, deleted, clamped } (RESORTS_SETUP create+edit+delete)
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

## Resorts Setup — function list

The menu labels below are authoritative (renamed 2026-07-30, when **functions 11 and 12 were swapped**
so the two CP points-deduction charts sit together; then on **2026-07-31 two merges landed** - the
separate Public (7) and School (8) holiday functions became one tabbed page at 7, and the Home (9) /
Non-Home (10) points charts became one tabbed page at 9, leaving 10 functions).
**The menu number is display-only** — routes, table names and permissions are what everything else keys
off, and no route changed in either renumbering. `SETUP_ITEMS` in
`frontend/src/pages/resorts/ResortsSetup.tsx` is the single source of truth; each page's `<h1>` mirrors
its label **prefixed with the menu number** (`5. Resorts Unit Availability/Inventory Setup`), so a
renumbering means editing both. **Prose elsewhere may still cite pre-merge numbers; this table wins.**

| # | Menu label | Route | Table |
|---|---|---|---|
| 1 | Company Master - New Company/Product Code | `/resorts/products` | `Product` |
| 2 | Resorts Master Maintenance and Setup | `/resorts/setup` | `Resort` + `ResortInfoLine` |
| 3 | Apartment Sleep Types Maintenance and Setup | `/resorts/apartment-types` | `ApartmentType` |
| 4 | Apartment's Unit No. Maintenance and Setup | `/resorts/units` | `ResortUnit` |
| 5 | Resorts Unit Availability/Inventory Setup | `/resorts/availability` | `AptBlock` → `ResAvailMast` |
| 6 | Resorts Unit Under Maintenance | `/resorts/maintenance` | `ResortMaintenance` |
| 7 | Public & School Holidays Maintenance and Setup | `/resorts/holidays` | `Holiday` (tabbed: Public / School) |
| 8 | CP's Seasons Maintenance and Setup | `/resorts/seasons` | `CpSeasonDate` |
| 9 | CP Points Deduction - Maintenance and Setup | `/resorts/season-points` | `SeasonPoint` (tabbed: Home / Non-Home) |
| 10 | Leisure Vacation Club (LVC) Code Maintenance and Setup | `/resorts/lvc-codes` | `LvcCode` |

> **Home vs non-home** is the whole distinction between the two tabs of fn 9: home = a `coCode '02'` resort
> (CP-PBR today); non-home = every other resort — our own LHC resorts and the partner/exchange
> `V-*` codes — reached through an LVC exchange programme. Older prose and code comments may still
> say "CP Resorts Season Points Setup" (10) and "LVC Resorts Season Point Setup" (11), and some
> comments still carry pre-swap numbers; **this table wins.**

## Modules

| Module | Status | Pages / Notes |
|---|---|---|
| Admin — Users | ✅ Done | Users, UserDetail, UserForm. No accessLevel field (removed). |
| Admin — Departments | ✅ Done | Departments, permissions matrix |
| Admin — Audit Log | ✅ Done | AuditLog (IT only) |
| Members | ✅ Done | Member Enquiry (search+sort, URL state), MemberDetail, MemberForm. Agreement links with `transferFlag='TT'` are disabled (strikethrough) on both the list and MemberDetail accordion. Change Status removed from MemberDetail — agreements only. Enquiry uses `GET /api/members/enquiry` (MEMBERS permission) not `/api/agreements`. Agreement number links check `canView('AGREEMENTS')` — plain text when disabled. **Phone/Fax search** (`phone=` param): searches all 9 Member phone/fax fields (`telHome`, `telMobile`, `telOffice`, `telOffice2`, `jaTelHome`, `jaTelOffice`, `jaMobile`, `faxNo`, `faxOffice`) via raw SQL that digit-strips both sides (`regexp_replace(...,'[^0-9]','','g')`) — numbers are stored in mixed formats (`017-6822868` vs `0194714131`), so bare-digit input still matches dashed values. Resolves to member ids → `{ memberId: { in } }` (match set is tiny, no bind-var risk). In `listAgreements` in [agreements.controller.ts](backend/src/controllers/agreements.controller.ts). |
| Agreements | ✅ Done | Agreements list (search+sort, URL state, defaults LHC-03/Active, default sort agreementDate asc), AgreementDetail. Columns: Agreement No, Membership No/Name, Agreement Date, Expiry Date, Term, AMC, Status. AMC and PBS cards fetched by `coCode + agreementNo` (not FK) to handle duplicate agreementNo across members. **The RCI card is READ-ONLY** (2026-09-02): the five `Agreement.rci*` columns were dropped and it now renders the current `RciEnrolment` row, with a link out to RCI fn 1 instead of an edit button. See the RCI note under `### Agreement`. |
| AMC Billing — Schedules | ✅ Done | Schedules (search+sort, URL state, defaults LHC-03/Active). Filters: product, acctClassify (by membershipNo+agreementNo pairs), AMC Next Due Date (exact date, current/future only). Default sort: acctClassify asc (NA first), then nextDueDate asc. |
| AMC Billing — Invoices | ✅ Done | Invoices (search by membershipNo/agreementNo/name, Clear button, sort invDate desc→agreementNo→invNo), InvoiceDetail. **Generate Invoices** modal: Product Type (CP default / LHC), Period (MM/YYYY, default current), Agreement No (blank=all, shows member name to verify; respects due rule). Selects `nextDueDate <= period month-end`, invDate = 1st of period month. Skipped agreements (e.g. no rate tier) surfaced in the result. See "Generate Invoices" + "AMC Invoice Cancellation" below. |
| AMC Billing — Invoice Cancellation | ✅ Done | `/amc/invoice-cancellation` (AMC_BILLING Edit permission). Search unprocessed invoices by membershipNo/agreementNo/invoiceNo → Cancel a whole invoice (all A/K/S/Y components) → hard-deletes rows + rolls schedule back to pre-billing state. See "AMC Invoice Cancellation" below. |
| AMC Billing — Rates | ✅ Done | LHC + CP rates with Add/Edit/Deactivate/Delete; auto-calc total + amount-in-words |
| AMC Billing — Day-End | ✅ Done | DayEnd file generation |
| Reports | ✅ Done | Per-user access control; IT grants via UserDetail; sidebar shows single "Reports" link → card grid at `/reports`. 6 reports: Member, SSM Agreement, Expiry Analysis, Expiring Members, Remaining Value, Expiry Summary by Years. |
| Resorts Setup | ✅ Done | New `RESORTS_SETUP` AppModule (seed defaults: IT+Resort Ops FULL, Member Services VIEW, Finance/Credit NONE). Landing page `/resorts` (PBS-style menu, sidebar group "Resorts"). Function 1 done: **Products Setup** (`/resorts/products`) — `Product` CRUD over the operating-company / product master (list+search on code/name/contact, add/edit modal with the product code read-only in edit mode, `ConfirmDeleteModal`). **Delete is refused 409** when any Agreement/AmcSchedule/Resort/LvcCode still carries the `coCode` — there is no DB-level FK, so this controller count is the only guard; the message names the counts and surfaces inside the confirm modal. Because that guard makes deletion impossible for nearly every row, an **A/U status toggle** was added 2026-08-17 (`ToggleRight`/`ToggleLeft` icon first in the row's action group, green Active / grey Inactive badge column, inactive rows dimmed, list ordered Active first then by code; status is also editable in the add/edit form). Same shape as the Resort and LvcCode toggles, including the deliberate **no-success-dialog** exception — the badge flips in place, but a failed toggle still surfaces through a `variant="error"` `ResultDialog`. Deactivating removes the product from the fn 10 LVC Code and fn 9 **Charged To** dropdowns (via the shared `useActiveProducts` hook) and changes nothing else — no server-side status check was added, so records already naming a retired product stay editable. 29 rows from `ps_company.txt` (first 9 of 17 cols; the initial 7-row export was filtered and was re-extracted in full), all backfilled to Active. Nothing else reads this table yet — `ProductBadge` still hardcodes the LHC/CP names. Function 2 done: **Resorts Setup** (`/resorts/setup`) — Resort master CRUD (list+search, add/edit modal shared via `ResortFormModal.tsx`, status toggle A/U, delete; buttons gated by canCreate/canEdit/canDelete; Eye icon on every row → detail). **Resort Detail** (`/resorts/setup/:id`) — details card + Edit + 4 info tabs (Getting There / Resort Facilities / Places of Interest / Unit Amenities) from `ResortInfoLine`; per-tab single-textarea editor, remark-style free text (400 chars total per category, validated client+server, no auto-uppercase — legacy print lines are mixed-case). Function 3 done: **Apartment Types Setup** (`/resorts/apartment-types`) — `ApartmentType` CRUD (list+search, add/edit modal, delete; resort picker from Resort master, lockType Select disabled/forced-LN unless resort `lockOnOff='Y'`; **delete refused 409** while any unit / availability / grid / season-points row still names the type, the message naming the counts inside the confirm modal). **The list is scoped to ACTIVE resorts server-side** (2026-08-10) — 17 of the 487 rows, across 12 resorts. 487 rows from `apt_category.txt` (4 of 11 cols), which on 2026-08-10 replaced the 9 hand-transcribed rows formerly hardcoded in `migrate-resorts.ts`. Function 4 done: **Apartments/Units Setup** (`/resorts/units`) — `ResortUnit` CRUD (paginated list with resort filter + search, add/edit modal with apartment-type dropdown restricted to the selected resort's types, RCI Reserved checkbox; **delete refused 409** while the unit still has availability, maintenance or RCI bulk bank records, the message naming all three counts inside the confirm modal; **358 rows** from `apt_mast.txt`, which since 2026-08-11 is exported ACTIVE-resorts-only with a live-unit whitelist for 4 resorts — see `### ResortUnit`). Function 5 done: **Resorts Unit Availability/Inventory Setup** (`/resorts/availability`) — **add / view / delete only, no edit** (2026-08-14): the list is add-only, so correcting a record means deleting and re-adding it. **Two Add buttons, split by `coCode` (2026-08-14)**: **+ Add availability** for our own products (`03`/`15`/`02`, whose resorts have real numbered apartments) is the cascade add form Resort→ApartmentType→Unit→start/end dates, and its resort dropdown now lists only those resorts; **Add MAR availability** for every other resort (the partner/exchange **MAR** resorts, which allocate N interchangeable units of a sleep type for a period) is a **batch** form keying Resort→ApartmentType→number of units→occupancy→start/end dates, which generates unit numbers `1-{occupancy}`..`{N}-{occupancy}` (the format the legacy data already uses — `V-CLC1` SLEEP4 = `1-4`..`15-4`), **creates the `ResortUnit` rows and their availability records together**, all-or-nothing, and **reuses** any unit already registered with that apartment type so a second run just adds next year's dates. It shows a live preview of the numbers it will generate, and the result dialog reports the created/reused split. The split is enforced server-side (400), not just in the dropdowns; the page's resort **filter** still lists every active resort so MAR records stay viewable, and Delete is one path for both. Per-row Eye + Delete, styled delete-confirm modal. **The page lands EMPTY** — nothing is fetched until a resort is picked from the filter (5,162 records over 12 resorts is not a useful first screen, and staff work one resort at a time); the placeholder reads "Select a resort to view its availability records." Each save auto-maintains the generated `ResAvailMast` per-day grid (`act/bal +1` per day on create, `-1` on delete; a MAR batch does **one** pass at `+N`; overlap-guarded 409). **Delete is refused 409** while the unit has maintenance inside the record's dates. Per-row Eye icon → modal of the block's day grid. Header **Resorts Availability** button opens a **draggable, non-modal** popup (`DraggableWindow.tsx`) = ResAvailMast pivoted resort×date, cell=balNight (red ≤2, weekends highlighted), **Product Type read from the Product master — every ACTIVE product, not the old fixed LHC/CP pair** (2026-08-17; defaults to `03` so the opening view is unchanged), date + `<<`/`>>` 15-day paging; the chart lives in the shared `components/ResortAvailabilityChart.tsx` so both Function 5 and Function 6 render it. **The chart lists ACTIVE resorts only** (2026-08-11) — it scaffolds a row per resort x apartment type and zero-fills, so retired resorts were drawing full rows of zeros (LHC 56 rows of which 5 were live, CP 10 of 3). **Most products chart empty, and that is the data, not a bug**: only 7 coCodes have any active resort at all (01, 02, 03, 20, 24, 26 + the test row AA), and of those only `03` (6 resorts) and `02` (1) have `ResAvailMast` rows — `res_avail_mast.txt` has not been re-exported since 2026-07-24 and still covers 7 resorts, so the active `V-*` partner resorts on 01/20/24/26 have units and blocks but no grid. Picking any other product shows "No resorts for this product". Function 6 done: **Resorts Unit Under Maintenance** (`/resorts/maintenance`) — `ResortMaintenance` CRUD. **The page lands EMPTY**, like fn 5 — nothing is fetched until a resort is picked (10,904 records is not a useful first screen); the placeholder reads "Select a resort to view its maintenance records." Paginated list sorted startDate desc with resort filter + **Month/Year period filter** + search incl. reason, 3-level add cascade Resort→Unit→**Availability** (the fn 5 record every range must sit inside; **units lacking availability listed but disabled**) with the apartment type shown in the unit option label and derived server-side, **mandatory** remarks/reason field, **up to 3 date ranges per add** (each saved as its own record, all sharing the one reason; all-or-nothing, with client-side row errors mirroring the server's overlap rules), styled delete-confirm modal, per-row Eye icon → day grid, same **Resorts Availability** popup button). Each save maintains `ResAvailMast.balNight` only (`-1` per day on create, `+1` on delete, reverse-then-apply on edit; `actNight` never touched, rows never created/deleted; overlap-guarded 409) — so the availability chart needed no change. **10,904 rows** from `resmt.txt`. Function 7 done: **Public & School Holidays Setup** (`/resorts/holidays`) — `Holiday` CRUD over **one** table holding both kinds, presented as a **tabbed page** (Public Holidays / School Holidays) whose tab lives in the URL (`?tab=school`) alongside the year filter and search, so Back restores the whole view. Each tab keeps its own columns (Public: Date/Day/Year/Holiday; School: Academic Year/Start/End/Days/Holiday), its own year-filter label and its own **Clone to next year** sub-function copying a year to year+1 on the same month/day (both ends for a school range) for staff to correct. One shared add/edit modal branches on the tab: a public holiday is a single date whose `year` is **derived server-side**, a school holiday is a range with an **editable** `academicYear` (pre-filled from the start date only while blank) since a session can cross the calendar boundary. School-only guards: overlapping ranges and a repeated name within one academic year are both rejected 409. Global calendar — no resort/state scope, so no availability-grid interaction. 12 public + 4 school business-supplied 2026 rows via `prisma/seed-holidays.ts`. **Merged 2026-07-31 from the former fns 7/8** (`PublicHoliday` + `SchoolHoliday`), which were ~90% duplicated code; `/resorts/school-holidays` now redirects to the School tab, and fns 9-12 renumbered down to 8-11. Function 8 done: **CP's Seasons Setup** (`/resorts/seasons`, renamed from "CP's Seasons & Points Setup" — the points chart is function 9, `CpSeasonPoint`) — `CpSeasonDate` CRUD over a **per-day** G/S/D calendar, presented **one month at a time** in the legacy Informix 3-across `[dd-mm-yyyy] [S]` grid (Year input + Month dropdown + **Prev/Next** month buttons; season cells are inline selects; **Save month** bulk-upserts every date shown; **Delete month** removes the whole month). An empty month doubles as the add form, pre-filled Silver. Plus **Clone to next year**. 424 rows from `ps_seasondate.txt`. **CP-only** — see the per-product calendar note above `### Holiday`. Function 9 done: **CP Points Deduction** (`/resorts/season-points`) — `SeasonPoint` CRUD over **one** table holding both points charts, presented as a **tabbed page** (Home Resorts / Non-Home Resorts) whose tab lives in the URL (`?type=away`) alongside the resort and version, so Back restores the whole view. **Charts are effective-dated VERSIONS, not per-year grids** (redesigned 2026-08-13): a chart stays in force until a later version supersedes it, so a new one is created only when a rate changes or a room type is introduced. **Home** = a `coCode '02'` resort (CP-PBR today) — the points fn 8's G/S/D grade resolves into. **Non-home** = every other resort (our own LHC resorts and the partner/exchange `V-*` codes) reached through an LVC exchange programme; this is the reason `pssa_lvcpts0..6` are zero in `ps_seasonapt`. Both tabs share the whole shape: a **version list** (resort picker + that resort's versions newest first — Effective From, Status Current/Scheduled/Superseded, Room Types, Seasons, Rows — plus **New version**), and a **version editor** reached at `?eff=YYYY-MM-DD` or `?eff=new`: a legacy-style read-only header block, **one Effective from date for the whole chart**, and a grid scaffolded from the resort's apartment types × `['S','G','D']` with seven day cells (`Sun(0)`…`Sat(6)`) and a live **Total/Wk** column (derived, never stored). Save is **replace-all within the version**, so a blanked row is deleted and there is no per-row delete; rows left blank are never submitted, so an untouched grid can't be saved as zeros. A version's date can be corrected in place (the client sends `replaces`), and landing on a date the resort already uses returns 409. The resort pickers are exact inverses (`coCode === '02'` vs `!== '02'`, 48 resorts) and the server rejects a kind mismatch with 400 via `requireResortOfType()`. The Non-Home tab adds an editable **Charged To** product dropdown (`lvcCoCode`, validated against `Product.coCode`); the Home tab stores null. **Apartment types are validated against fn 3 but pairs already stored are grandfathered**, which mattered most before the `apt_category.txt` load — only 5 of the 412 non-home source pairs were registered then, vs **408** now; the remaining 4 (all on Inactive resorts) show a `(legacy)` hint. **No clone action** (deliberate, unlike fns 7 and 8) — instead **New Rate opens pre-filled from the rate in force**, so staff amend a copy rather than key a whole chart, and a new rate must take effect **after** the resort's latest one (400 server-side, mirrored in the editor; editing an existing rate is exempt). **The UI says "rate" where the code says "version"** — same thing. The 2026-08-13 redesign collapsed 4,766 rows / 1,062 resort-years (only **303** distinct charts; five active resorts had re-keyed an identical chart 24 years running) down to **1,209 rows — one current version per resort across 265** — and deleted the previous-year prefill and the "years cannot skip ahead" rule built the day before, both of which only meant anything under per-year charts. **Merged 2026-07-31 from the former fns 9/10** (`CpSeasonPoint` + `LvcSeasonPoint`), which shared ~78% of controller and ~86% of page code; `/resorts/lvc-season-points` now redirects to the Non-Home tab, fn 11 renumbered to 10, and the merge closed a gap where the old CP delete-year skipped its resort scope check. Function 10 done: **Leisure Vacation Club (LVC) Code Maintenance and Setup** (`/resorts/lvc-codes`) — `LvcCode` CRUD over the exchange-programme master: the arrangement under which a member books outside their own product, either between our own products (`LVC-CP`, 03/15 ↔ 02) or into an external partner's **MAR (Make Available Resorts)** (`LVC-SGI`, `LVC-CLC`, …). List+search on code/name/product code, add/edit modal with `lvcCode` read-only in edit mode and a product dropdown, **A/U status toggle** (same shape as the Resort toggle, and the same deliberate no-success-dialog exception), `ConfirmDeleteModal` on a hard delete with **no usage guard** (nothing references `LvcCode` yet). **The `incoming`/`outgoing`/`faxBatch` counters are imported but appear nowhere on the screen and are absent from the zod schema, so CRUD can never write them.** `coCode` is a **product dropdown** validated server-side against `Product.coCode` (400 on an unknown code), with the product name resolved client-side in the list. The list is sorted **Active first, then Inactive**, each alphabetical by code. 23 rows from `lvc_master.txt` (**5 active / 18 inactive** as of 2026-08-12). **Functions 1-10 are complete — the Resorts Setup module is done.** See the **Resorts Setup — function list** table above for the authoritative menu labels and numbering. |
| RCI | ✅ Done | New sidebar item **RCI** (Resort Condominiums International) in the existing **Resorts** group, gated by `canView('RESORTS_SETUP')` — **no new AppModule enum value** was added (a new variant needs a migration and is what broke login on 2026-07-23). Landing page `/rci` lists 3 functions, all now implemented. **1. RCI Enrolment** (`/rci/enrolment`) — **done**: full `RciEnrolment` CRUD over the 17,915-row register, and since 2026-09-02 the **single source of truth for all RCI data** — the five `Agreement.rci*` columns were dropped and Agreement Detail's RCI card became a read-only view of the current enrolment (see the RCI note under `### Agreement`). This is the ONLY place RCI data is edited, under the `RESORTS_SETUP` matrix permission, so IT, Member Services and Resort Operations can all do it here and nobody can from the Agreement page. Paginated list (50/page, ordered membershipNo → agreementNo → serialNo) with product + RCI-status filters and search over membership/agreement/RCI no/name/co-owner/resort code, all in the URL so Back restores the view. Per-row Eye (detail modal, resolves the member name by natural key) / Pencil / Trash. **Membership No and Agreement link back to their detail pages** - `listRciEnrolments` resolves `memberId`/`agreementId` per page (two batched queries, <=200 rows) since `RciEnrolment` carries only the natural key and no FK; the agreement is matched on all three key parts, so TT/TF transfer pairs stay unambiguous (verified: 0 ambiguous matches on either side). Each link is gated by `canView('MEMBERS')` / `canView('AGREEMENTS')` and falls back to plain text when the permission or the id is missing, per the convention in `Members.tsx`. **The add form is a two-step search picker (2026-09-08)**: step 1 searches agreements by membership no / member name / agreement no, step 2 is the form with the picked agreement in the same read-only grey strip edit mode uses (plus a Change link). Picking fills `name1` from the member's name, or **nominee 1's** when the member is CORPORATE, and splits it into first/last name 1. An agreement that already has an enrolment is shown **disabled** in the results and refused **409** on create. **Eight fields are mandatory on ADD only** (RCI no, status, resort, renewal + expiry date, first/last/full name 1) - edit stays permissive because the migrated rows have real gaps; `rciFees` is optional throughout. **Resort code is a dropdown** of active RCI-affiliated resorts, with a stored code outside that set appended so it round-trips. **Total intervals was removed from the form** and from the zod schemas. `GET /lookup` was deleted with the old hand-keyed key. On edit the agreement key is shown read-only (immutable). Follows the CRUD feedback convention (`ResultDialog`, `ConfirmDeleteModal`, `onError` on every mutation). Renewal/expiry dates carry an on-form note that they are information only. **2. RCI Weekly Interval** (`/rci/weekly-interval`, renamed from "RCI Interval") — **done**: Create / Read / Delete over `RciWeek`, **whole years only**. Year-scoped screen (year in the URL, dropdown fed by `/years`) showing that year's 52/53 weeks unpaginated — **Week / Start (Friday) / End (Friday)**, with a `carries into YYYY` hint on the last week; the stored Saturday pair is fetched but deliberately not rendered. **Add year** keys a year and nothing else, with a live client-side preview of the week count and first/last Friday before generating; **Delete year** removes the whole year via `ConfirmDeleteModal`. There is no edit path anywhere — correcting a year means deleting and re-adding it. Empty state prompts to add a year when none exist. 209 rows from `rci_week.txt` (2026-2029). `RciPlaceholder.tsx` was deleted once both functions were implemented. **3. RCI Bulk Bank** (`/rci/bulk-bank`) — **done, rebuilt as a whole-year grid 2026-08-28**: the 774-row register of LHB inventory deposited into the RCI exchange network. One record = **one RCI week of one RCI-qualified unit** (`ResortUnit.rciReserved='Y'`), graded **Red / Blue / White** by RCI. **The page is a fn 8-style grid, not a list**: pick **resort + unit + year** and every RCI week of that year is a row with an editable season beside it, in the same monospace `[dd-mm-yyyy] [S]` layout as CP's Seasons. **The page lands blank** until all three are chosen ("Select a resort, unit and year to view its RCI weeks."). **A blank season means NOT BANKED**, so the one dropdown banks (blank -> colour), regrades (colour -> colour) and clears (colour -> blank) a week; an **empty year is the add form, prefilled Red** on every bankable week (fn 8's Silver prefill, applied to the dominant grade), and only the **highest banked week** carries a bin so a year unwinds 53, 52, 51... (the bin blanks the cell, it does not write). A header **Delete year** button clears the whole year unconditionally for re-entry, leaving the grid back in its Red-prefilled add state - **a booking guard for it is noted as a TODO, not built, since the booking module does not exist yet**. **Save year** posts every week shown and the server diffs it, reporting the created / regraded / cleared split in a `ResultDialog`. **There is no date input anywhere** — weeks come from fn 2's calendar and the server derives `checkIn = friStart`, `checkOut = friStart + 6`, so the "check-in is a Friday" rule is unbreakable rather than merely validated. The Year picker lists **fn 2's years**, so a year must be generated there before it can be banked into. The unit picker offers RCI-qualified units, disables those with no fn 5 availability (`(no availability set up)`), hides the lock-off halves at CP-PBR with a note saying why, and additionally lists **clear-only** units that fn 4 has un-flagged but which still hold weeks (`(not RCI-qualified)`) so their 205 records stay visible and removable. Weeks the grid can tell are unbankable are greyed with the reason (advisory — the server is authoritative). **Each save deducts/restores one unit-night per day in `ResAvailMast.balNight`** (`actNight` never touched, rows never created or deleted); a regrade does no grid work. **Six save-time guards**, each naming the function to fix it in, run over the **creates** only — which is what makes a clear-only unit work with no extra rule — and their failures are **collected**: unit not registered (400), not RCI-qualified (400 -> fn 4), a lock-off half (400), week not covered by fn 5 availability (400, by the **union** of the unit's blocks), under maintenance (409 -> fn 6), already banked/overlapping (409), and any day already fully committed (`balNight=0`, 409 — refused rather than clamped, because banking is an external promise to RCI). **All-or-nothing**: one failing week means nothing is written and the message names the offenders. A year save is **~12-15 queries** whatever changed, against ~1,000 for the 52 modal round trips it replaced. **Three mirror guards live in other controllers** — fn 4's unit delete counts banked weeks, fn 5 refuses to delete availability under a banked week, and fn 6 refuses maintenance over one. `serialNo` continues the Informix sequence (max 39261 -> first app row 39262), allocated max+1..max+N inside the transaction. `bb_status` is migrated as `bankStatus` for provenance but is rendered nowhere and absent from the zod schema. Removed with the old list: the Add/Edit modal, search, pagination, the per-week Eye availability modal, and the `POST /`, `PUT /:id`, `DELETE /:id`, `GET /:id/availability` and `GET /years` endpoints. **Functions 1-3 are complete — the RCI module is done.** |
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
| **Edit nominees** (`PUT /agreements/:id/nominees`) and **agreement update** (`PUT /agreements/:id`) | **Member Services** only | `requireITorMemberServices` guard. Frontend mirror: `canEditNominees()` in `agreementAuth.ts` gates the nominees card button. **RCI is no longer covered by this rule** — it lives in `RciEnrolment`, is edited only through RCI fn 1 under the `RESORTS_SETUP` matrix permission, and the Agreement card is read-only. |
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
3. Nominees (up to 3 — salutation, full name, name card, designation, IC old/new, home tel, mobile, email, address; card button reads "Add nominees" when none exist yet, "Edit nominees" once at least one is on record; edit modal has 3 columns, one per nominee, with the same field set for all three even though nominee 3 historically only carries 4 fields from `si_entitlement.txt`'s `e_loc_*` columns). **Add/Edit button shown to Member Services + IT only** (`canEditNominees()`).
4. RCI Information (**READ-ONLY**, always rendered) — the **current** `RciEnrolment` row for the
   agreement, resolved server-side by `currentEnrolment()` and returned as `rciEnrolment` +
   `rciEnrolmentCount`. Shows RCI ID (`rciNo`), RCI Nominee (`name1`, falling back to
   `firstName1`+`lastName1`), Status, RCI Fees, Renewal Date (`renewalDate` — **relabelled from
   "Joint Date"** to match RCI fn 1; it is `re_act_date` on both sides) and Expiry Date, with a
   note that renewal/expiry are information only. When the agreement holds more than one
   enrolment the card says so and shows the current one; when it holds none it reads
   "No RCI enrolment on record" (true of 1,879 terminated agreements — see the RCI note under
   `### Agreement`). **There is no edit button for anyone, IT included** — only a
   "Manage in RCI Enrolment" link to `/rci/enrolment?q=<agreementNo>`, gated by
   `canView('RESORTS_SETUP')` so Finance and Credit (who have that module off but keep
   `AGREEMENTS` view) see the card without a dead link. `canEditNomineesRci()` was renamed
   **`canEditNominees()`** — it now gates nominees only.
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

## CRUD feedback convention (Resorts Setup — apply to new modules)

Standardized 2026-07-27 across all five Resorts Setup functions. Two shared components in
`frontend/src/components/ui/`; **use both in any new CRUD page** rather than re-rolling per page.

| Outcome | Component | Behaviour |
|---|---|---|
| Add / edit / delete **succeeded** | `ResultDialog` | Modal with green check + **OK button — must be acknowledged** (deliberately not an auto-dismissing toast). Message names the record that changed. |
| Delete **requested** | `ConfirmDeleteModal` | Modal with a grey summary box of the record (`rows`) + red confirm button. **Replaces `window.confirm`.** |
| Add / edit **failed** | inline red `<p>` inside the form modal | Modal stays open so input isn't lost — `apiError(err)` into local `error` state. |
| Delete **failed** | inline red inside `ConfirmDeleteModal` (`error` prop) | The confirm modal stays open. |

**Wiring pattern.** Form modals take an `onSaved: (saved, mode: 'add' | 'edit') => void` callback and
call it in `onSuccess` before `onClose()`; the page holds `const [result, setResult] = useState<string | null>(null)`
and renders `<ResultDialog message={result} onClose={() => setResult(null)} />`. Delete uses
`deleteTarget` + `delErr` state; its `onSuccess` looks the record up in the current list **before**
invalidating so the message can name it.

Message style — state the action, then identify the record, then any side effect:
```
Maintenance record added — L-10024 unit A1 (3BR), 2027-01-04 to 2027-01-05.
Availability for this apartment type drops by one per day over that range.
```

> **Every mutation needs an `onError`.** The `window.confirm` pages (Resorts Setup, Apartment Types,
> Apartments/Units) originally had `deleteMut`/`toggleMut` with **only** `onSuccess`, so a failed delete
> or status toggle did nothing visible at all — the user saw the row unchanged and re-clicked. Fixed
> 2026-07-27; don't reintroduce it.
>
> **Exception — `ResortMaster` status toggle** deliberately shows *no* success dialog: the A/U badge
> flips in place, which is feedback enough, and a dialog per click would be tedious. It still reports
> failures, via a second `ResultDialog` with `variant="error"`.

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
