# Claude Code Prompt — LHB Member Management System: Phase 1

## Company Context

**Leisure Holidays Bhd (LHB)** is a Malaysian timeshare and vacation club company operating 7 resorts across Malaysia and Australia. This is an **internal staff web application** to replace a legacy Informix-based system.

LHB sells two product types:
- **LHC** (Leisure Holidays Club) — week-based, cocode `03` or `15`. Two variants with different pricing/tenures.
- **CP** (ConnectionPoints) — points-based, cocode `02`. Members hold points (min 60, free-form integers up to 1,000+).

---

## Tech Stack

- **Frontend:** React + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL
- **Auth:** JWT stored in HTTP-only cookies
- **ORM:** Prisma
- **Package manager:** npm
- **PDF generation:** pdfkit or puppeteer (for invoice download)
- **File export:** csv-writer or json2csv (for day-end files)

---

## Project Structure

```
/lhb-mms
  /frontend                  ← React + TypeScript + Tailwind
    /src
      /components
      /pages
      /hooks
      /utils
  /backend                   ← Node.js + Express + TypeScript
    /src
      /routes
      /controllers
      /middleware
      /services
      /utils
  /prisma                    ← Prisma schema + seed
    schema.prisma
    seed.ts
  .env.example
  README.md
```

---

## Phase 1 Modules

Build these 3 modules in full:

1. **Admin Module** — User management, departments, roles, permissions, audit log
2. **Member Management Module** — Individual + corporate members, agreements, nominees
3. **AMC Billing Module** — Billing schedules, invoice generation, day-end file export

Modules 4 (Resort Booking) and 5 (Entitlements) are future phases — include them in sidebar navigation as "Coming Soon" but do not build them.

---

## Database Schema (Prisma)

### Enums

```prisma
enum MemberType {
  INDIVIDUAL
  CORPORATE
}

enum MemberStatus {
  ACTIVE
  SUSPENDED
  CLOSED
  DECEASED
  TRANSFERRED
}

enum AgreementStatus {
  NA  // Active
  SU  // Suspended
  PT  // Pending Termination
  TM  // Terminated
}

enum EntitlementType {
  W   // Week-based (LHC)
  P   // Points-based (CP)
}

enum BillingStatus {
  N   // Normal (active billing)
  C   // Closed
}

enum InvComponent {
  MAIN_AMC      // A prefix
  SINKING_FUND  // K prefix
  SERVICE_TAX   // S prefix
  ROUNDING      // Y prefix — CP only
}

enum BillType {
  N   // Normal annual
  A   // Advance year
  H   // Ad-hoc (reactivated agreement)
  F   // Final year
}

enum AccessLevel {
  FULL_ACCESS
  READ_WRITE
  READ_ONLY
}

enum UserStatus {
  ACTIVE
  SUSPENDED
}

enum AppModule {
  ADMIN
  MEMBERS
  AGREEMENTS
  AMC_BILLING
  RESORT_BOOKING
  ENTITLEMENTS
}

enum AuditActionType {
  CREATE
  UPDATE
  DELETE
  LOGIN
  SUSPEND
}
```

### Models

#### Admin Module

```prisma
model Department {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  description String?
  isLocked    Boolean  @default(false)  // true = IT dept, cannot edit permissions
  createdAt   DateTime @default(now())
  users       User[]
  permissions DeptModulePermission[]
}

model User {
  id             Int          @id @default(autoincrement())
  fullName       String
  username       String       @unique
  email          String       @unique
  phone          String?
  passwordHash   String
  mustChangePwd  Boolean      @default(true)
  accessLevel    AccessLevel
  status         UserStatus   @default(ACTIVE)
  departmentId   Int
  department     Department   @relation(fields: [departmentId], references: [id])
  lastLoginAt    DateTime?
  failedAttempts Int          @default(0)
  lockedAt       DateTime?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  auditLogs      AuditLog[]
}

model DeptModulePermission {
  id           Int       @id @default(autoincrement())
  departmentId Int
  department   Department @relation(fields: [departmentId], references: [id])
  module       AppModule
  canView      Boolean   @default(false)
  canCreate    Boolean   @default(false)
  canEdit      Boolean   @default(false)
  canDelete    Boolean   @default(false)
  @@unique([departmentId, module])
}

model AuditLog {
  id         Int             @id @default(autoincrement())
  userId     Int
  user       User            @relation(fields: [userId], references: [id])
  action     String
  actionType AuditActionType
  targetType String?
  targetId   Int?
  metadata   Json?
  createdAt  DateTime        @default(now())
}
```

#### Member Management Module

```prisma
model Member {
  id              String       @id @default(uuid())
  membershipNo    String       @unique   // e.g. 02099-KL-A-0222/M/I
  memberType      MemberType              // INDIVIDUAL | CORPORATE
  branchCode      String?                 // e.g. KL, PG, JB
  accpacRef       String?                 // Legacy accounting reference
  subsCategory    String?                 // e.g. NORMAL

  // Individual fields
  fullName        String                  // Also used for company name (corporate)
  salutation      String?
  nameCard        String?                 // Display name on name card
  icOld           String?                 // Old format IC (pre-MyKad)
  icNew           String?                 // New MyKad 12-digit IC
  nationality     String?
  dateOfBirth     DateTime?
  gender          String?                 // M | F
  race            String?                 // M=Malay, C=Chinese, I=Indian, O=Other
  maritalStatus   String?                 // M=Married, S=Single, D=Divorced, W=Widowed
  email           String?
  telHome         String?
  telMobile       String?

  // Residential address
  resAdd1         String?
  resAdd2         String?
  resAdd3         String?
  resCityState    String?
  resPostcode     String?
  resStateCode    String?

  // Mailing address (may differ from residential)
  mailAdd1        String?
  mailAdd2        String?
  mailAdd3        String?
  mailCityState   String?
  mailPostcode    String?
  mailStateCode   String?

  // Employment (individual only)
  workNature      String?
  companyName     String?
  compAdd1        String?
  compAdd2        String?
  compAdd3        String?
  compCityState   String?
  compPostcode    String?
  compStateCode   String?
  telOffice       String?
  designation     String?

  // Spouse (individual only)
  spouseName      String?
  spouseIc        String?

  // Joint Applicant (individual only — stored within member record)
  jaName          String?
  jaIc            String?
  jaIcNew         String?
  jaSalutation    String?
  jaDesignation   String?
  jaNameCard      String?
  jaAdd1          String?
  jaAdd2          String?
  jaAdd3          String?
  jaCity          String?
  jaPostcode      String?
  jaState         String?
  jaTelHome       String?
  jaTelOffice     String?
  jaMobile        String?
  jaEmail         String?

  // Corporate fields
  registrationNo  String?
  incorporationDate DateTime?
  businessNature  String?

  // e-Invoice
  tinNumber       String?     @db.VarChar(15)  // LHDN TIN — validated format

  // System
  enrolRci        Boolean     @default(false)
  activeHcm       Boolean     @default(false)
  remarks         String?
  status          MemberStatus @default(ACTIVE)

  // Legacy audit fields
  legacyCreatedAt DateTime?
  legacyModifiedAt DateTime?

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  agreements      Agreement[]
}

model Agreement {
  id                  String          @id @default(uuid())
  agreementNo         String                        // e.g. "00253" (trimmed)
  legacyAgreementNo   String?                       // Original padded value
  memberId            String
  member              Member          @relation(fields: [memberId], references: [id])
  membershipNo        String                        // Preserved from source
  agreementDate       DateTime
  endDate             DateTime?
  termYears           Int                           // 30 | 33 | 50
  coCode              String                        // 03 | 15 | 02
  entitlementType     EntitlementType               // W=Week | P=Points
  agreementType       String?                       // O=Original
  memberType          String?                       // I=Individual | C=Corporate
  totalPoints         Int?                          // CP: free-form 50–1000. NULL for LHC.
  acctClassify        AgreementStatus @default(NA)  // NA | SU | PT | TM
  acctStatus          String?                       // Legacy field — not used in UI
  purchasePrice       Decimal?        @db.Decimal(12,2)
  downPayment         Decimal?        @db.Decimal(12,2)
  subFees             Decimal?        @db.Decimal(12,2)
  loanAmount          Decimal?        @db.Decimal(12,2)
  loanType            String?
  salesBranch         String?
  salesMonth          String?
  salesSource         String?
  certificateNo       String?
  transferFlag        String?
  transferToMembership String?
  transferFromMembership String?
  canCode             String?                       // Refs cancellation_reasons.code
  rciRefNo            String?
  rciEnrolDate        DateTime?
  rciExpiryDate       DateTime?
  rciFeePaid          Decimal?        @db.Decimal(12,2)
  outstdDoc           Boolean         @default(false)
  docDescription      String?
  legacyCreatedAt     DateTime?
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  nominees            Nominee[]
  amcSchedule         AmcSchedule?
  amcInvoices         AmcInvoice[]
}

model Nominee {
  id          String    @id @default(uuid())
  agreementId String
  agreement   Agreement @relation(fields: [agreementId], references: [id])
  nomineeSeq  Int                     // 1 or 2
  fullName    String?
  icOld       String?
  icNew       String?
  salutation  String?
  designation String?
  nameCard    String?
  telHome     String?
  telMobile   String?
  add1        String?
  add2        String?
  add3        String?
  cityState   String?
  postcode    String?
  email       String?
  @@unique([agreementId, nomineeSeq])
}

model CancellationReason {
  code        String   @id          // e.g. "01"
  description String               // e.g. "10 Days Cooling Off Period"
  category    String               // CC=Cancellation | TM=Termination
  type        String?              // D
  status      String   @default("A")
  createdAt   DateTime @default(now())
}
```

#### AMC Billing Module

```prisma
model AmcSchedule {
  id               String        @id @default(uuid())
  agreementId      String        @unique
  agreement        Agreement     @relation(fields: [agreementId], references: [id])
  membershipNo     String
  agreementNo      String
  coCode           String                          // 03 | 15 | 02
  firstDueDate     DateTime?
  nextDueDate      DateTime?
  lastInvoiceDate  DateTime?
  invoicesIssued   Int           @default(0)       // Count of invoices generated so far
  totalInvoices    Int                             // 33 or 50 (LHC) | 30 (CP)
  priceCode        String?                         // LHC: M | S | I. NULL for CP.
  billingStatus    BillingStatus @default(N)
  legacyCreatedAt  DateTime?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
  invoices         AmcInvoice[]
}

model AmcInvoice {
  id               String        @id @default(uuid())
  scheduleId       String
  schedule         AmcSchedule   @relation(fields: [scheduleId], references: [id])
  agreementId      String
  agreement        Agreement     @relation(fields: [agreementId], references: [id])
  membershipNo     String
  agreementNo      String
  docNo            String?                         // LHC: same as agmt_no. CP: agmt_no + "-1"/"-2"
  invNo            String                          // e.g. A0236276, K0236276, S0236276
  invComponent     InvComponent                    // Derived from inv_no prefix
  invDate          DateTime
  amcDate          DateTime?
  dueDate          DateTime?
  invoiceYearSeq   Int?                            // Which year in the billing sequence
  invAmount        Decimal        @db.Decimal(12,2)
  totalPoints      Int?                            // CP only
  rate             Decimal?       @db.Decimal(8,4) // Currency rate (1 for RM, 3.3 for S$)
  amountInWords    String?                         // Legacy — recalculated in new system
  billType         BillType
  coCode           String
  isProcessed      Boolean        @default(false)  // Updated by SQL Account day-end feed
  processedAt      DateTime?
  printDate        DateTime?
  printUser        String?
  printCount       Int            @default(0)
  newFlag          String?                         // O=legacy migrated
  legacyCreatedAt  DateTime?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
}

model AmcPrice {
  id             String    @id @default(uuid())
  coCode         String                    // 03 | 15
  effectiveDate  DateTime
  priceCode      String                    // M=RM | S=S$ | I=other (trimmed)
  currencyCode   String?                   // RM | $S | S$
  amcAmount      Decimal   @db.Decimal(12,2)
  sinkingFund    Decimal   @db.Decimal(12,2)
  serviceTax     Decimal   @db.Decimal(12,2)
  totalAmount    Decimal   @db.Decimal(12,2)
  amountInWords  String?
  rate           Decimal   @db.Decimal(8,4) @default(1)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  @@unique([coCode, priceCode, effectiveDate])
}

model AmcPricePoints {
  id                String    @id @default(uuid())
  coCode            String    @default("02")
  effectiveDate     DateTime
  minPoints         Int                           // e.g. 60
  maxPoints         Int                           // e.g. 124
  amcRatePerPoint   Decimal   @db.Decimal(8,4)   // psr_amcuprice e.g. 2.56
  sinkingFundPct    Decimal   @db.Decimal(6,2)   // psr_amcsf e.g. 10
  gstPct            Decimal   @db.Decimal(6,2)   // psr_gstpc e.g. 8
  unitPrice         Decimal?  @db.Decimal(12,2)  // psr_uprice
  rciPoints         Int?                          // psr_rcipts
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  @@unique([coCode, minPoints, maxPoints, effectiveDate])
}
```

---

## Seed Data

```typescript
// Departments
const departments = [
  { name: 'IT', description: 'Full system access', isLocked: true },
  { name: 'Finance', description: 'Manages AMC billing and payment records', isLocked: false },
  { name: 'Credit', description: 'Handles agreements and AMC billing', isLocked: false },
  { name: 'Member Services', description: 'Manages members, agreements and bookings', isLocked: false },
  { name: 'Resort Operations', description: 'Manages resort bookings and entitlements', isLocked: false },
];

// Default permissions matrix
const permissions = {
  IT:                { ADMIN: full, MEMBERS: full, AGREEMENTS: full, AMC_BILLING: full, RESORT_BOOKING: full, ENTITLEMENTS: full },
  Finance:           { ADMIN: none, MEMBERS: view, AGREEMENTS: view, AMC_BILLING: full, RESORT_BOOKING: none, ENTITLEMENTS: view },
  Credit:            { ADMIN: none, MEMBERS: view, AGREEMENTS: viewEdit, AMC_BILLING: full, RESORT_BOOKING: none, ENTITLEMENTS: view },
  'Member Services': { ADMIN: none, MEMBERS: full, AGREEMENTS: full, AMC_BILLING: view, RESORT_BOOKING: full, ENTITLEMENTS: full },
  'Resort Operations':{ ADMIN: none, MEMBERS: view, AGREEMENTS: view, AMC_BILLING: none, RESORT_BOOKING: full, ENTITLEMENTS: viewEdit },
};

// Default admin user
// username: admin | password: LHB@Admin2026! | department: IT
```

---

## Backend API Endpoints

### Auth
```
POST   /api/auth/login              Username + password → JWT cookie
POST   /api/auth/logout             Clear JWT cookie
POST   /api/auth/change-password    Force change on first login
GET    /api/auth/me                 Current user profile
```

### Admin — Users
```
GET    /api/users                   List all users (dept, status, lastLogin)
POST   /api/users                   Create user
GET    /api/users/:id               Get user
PUT    /api/users/:id               Update user
PATCH  /api/users/:id/suspend       Suspend or reactivate
PATCH  /api/users/:id/reset-password Admin reset password
POST   /api/users/:id/clone         Clone user (copy dept + access level)
```

### Admin — Departments
```
GET    /api/departments              List departments with user counts
POST   /api/departments              Create department
PUT    /api/departments/:id          Update department
DELETE /api/departments/:id          Delete (only if no users assigned)
GET    /api/departments/:id/permissions  Get permissions
PUT    /api/departments/:id/permissions  Update permissions (not IT)
```

### Admin — Audit
```
GET    /api/audit                    List audit logs paginated (IT only)
```

### Members
```
GET    /api/members                  List + search (name, membership_no, IC, phone, email)
                                     Filter: type, status, cocode, branch
POST   /api/members                  Create member (admin use — no new sales)
GET    /api/members/:id              Get member with agreements + nominees
PUT    /api/members/:id              Update member
PATCH  /api/members/:id/status       Change member status
```

### Agreements
```
GET    /api/agreements               List agreements
GET    /api/agreements/:id           Get agreement detail with nominees
PUT    /api/agreements/:id           Update agreement
PATCH  /api/agreements/:id/status    Change agreement status (NA/SU/PT/TM)
GET    /api/members/:id/agreements   All agreements for a member
```

### Nominees
```
PUT    /api/agreements/:id/nominees  Update nominees (1 or 2) for an agreement
```

### AMC Schedules
```
GET    /api/amc/schedules            List schedules (filter: cocode, branch, status)
GET    /api/amc/schedules/:id        Get schedule with invoice history
GET    /api/agreements/:id/amc       Get AMC schedule for an agreement
```

### AMC Invoices
```
GET    /api/amc/invoices             List invoices (filter: cocode, date range, bill_type)
GET    /api/amc/invoices/:id         Get invoice detail
POST   /api/amc/invoices/generate    Generate invoices for due agreements (Credit/IT only)
GET    /api/amc/invoices/:id/download  Download PDF invoice
```

### AMC Rate Masters
```
GET    /api/amc/rates/lhc            List amc_price records (Finance/IT view)
POST   /api/amc/rates/lhc            Add new LHC rate (Finance/IT only)
GET    /api/amc/rates/cp             List amc_price_points records (Finance/IT view)
POST   /api/amc/rates/cp             Add new CP rate tier (Finance/IT only)
```

### AMC Day-End Files
```
POST   /api/amc/dayend/generate      Generate day-end files for today (Credit/IT only)
                                     Returns: SL_IV CSV + email blast CSV (per cocode) + hash files
GET    /api/amc/dayend/history       List past day-end file runs
```

---

## Business Logic

### Authentication
- JWT in HTTP-only cookie, 30-min session timeout
- Lock account after 5 consecutive failed logins
- Force password change on first login (`mustChangePwd = true`)
- Password: min 8 chars, 1 number, 1 special character
- Account unlock by admin only

### TIN Number Validation
- Format: prefix (`C` | `SG` | `OG` | `D`) + numeric digits only, max 15 chars total
- Regex: `^(C|SG|OG|D)\d+$` and length ≤ 15
- Nullable — only validate if a value is provided

### Agreement Status
- `acct_classify` drives status: NA=Active, SU=Suspended, PT=Pending Termination, TM=Terminated
- When SU or PT: AMC billing is stopped (billing_status = C or skip in generation)
- On reactivation (NA): ad-hoc billing (H) catches up from where billing stopped

### AMC Invoice Generation
- **LHC**: annual on Jan 1 or Jul 1. Generate 3 rows: A (Main AMC), K (Sinking Fund), S (Service Tax).
  Rate from `amc_price` — latest record by effectiveDate for the agreement's coCode + priceCode.
- **CP**: annual on anniversary of first_due_date. Generate 4 rows: A, K, S, Y (rounding).
  Phase 1: bill Base Allocation only (doc_no suffix "-1") using `agreements.totalPoints`.
  Rate from `amc_price_points` — latest record where minPoints ≤ totalPoints ≤ maxPoints.
  CP formula: `amc_amt = totalPoints × amcRatePerPoint`; `sf_amt = amc_amt × sinkingFundPct/100`;
  `tax_amt = amc_amt × gstPct/100`; total = floor(sum); `y_amt = floor(total) − calculated_total`.
- After generation: increment `invoicesIssued`, update `nextDueDate` (add 1 year), set `lastInvoiceDate`.
- `billType` logic: N=normal annual; A=advance (future year); H=ad-hoc catch-up; F=final year (last invoice).

### Day-End File Generation (Credit/IT only)
Generate 3 file types for invoices with `invDate = today`:

**1. SL_IV[YYYYMMDD].csv** — SQL Account import:
- Columns: `UDF_COMPANY_CODE|AREA|DOCDATE|POSTDATE|DOCNO|CURRENCY CODE|CURRENCY RATE|CODE|INVOICE DESCRIPTION|TERMS|DOCAMT|ITEM DESCRIPTION|QTY|UNIT PRICE|AMOUNT|TAX|TAXRATE|TAX AMOUNT|ACCOUNT`
- DOCNO = all invoice nos for the agreement joined: `A/K/S` (LHC) or `A/K/S/Y` (CP)
- CODE = agreementNo (trimmed)
- Per agreement: Row 1 = AMC line (TAX=SV, TAXRATE=8%, TAX AMOUNT=service tax); Row 2 = Sinking Fund (no tax); Row 3 = Rounding (CP only, ACCOUNT=1199-30504)
- ACCOUNT: AMC=[cocode_prefix]99-42000; SF=[cocode_prefix]99-42010
- cocode prefix mapping: 03→01, 15→15, 02→11
- INVOICE DESCRIPTION: "Pursuant to the Timeshare Agreement dated [agmt_date] the Annual Maintenance Charge for the [amc_yr] is due"

**2. amcemail[cocode][YYYYMMDD].csv** — Mailgun email blast (members with email only):
- Columns: `cocode|agmt_no|agmt_date|mem_no|name|email|addr1|addr2|addr3|addr4|postcode|state|inv_date|amc_yr|amc_qty|amc_rate|sfund_rate|amc_no|sfund_no|gst_no|rd_no|amc_amt|sfund_amt|gst_amt|rd_amt|currency|exp_date`
- Generate separate files: amcemail03[date].csv, amcemail15[date].csv, amcemail02[date].csv
- `amc_yr` format: "27/2027" (invoice_year_seq/calendar_year)
- `rd_no` = Y-prefix invoice no. (CP only)

**3. amc_hash_ttl[cocode][YYYYMMDD].txt** — Reconciliation hash:
- Format: `ttl_cnt|ttl_amt|`
- One per cocode, matching the email blast file

### Invoice PDF Layout (matches INV_A0236276.pdf)
- Company header: LEISURE HOLIDAYS BHD, address, tel, fax, website
- ST No: B16-1808-31013940
- Member address block (top left)
- Invoice details (top right): Invoice No (A/K/S), Membership No, Agreement No, Invoice Date
- Table: PARTICULARS | QTY | UNIT PRICE | TOTAL (RM)
  - Row 1: "Annual Maintenance Charges" | 1 | amc_amount | amc_amount
  - Row 2: "10% Sinking Fund" | 1 | sf_amount | sf_amount
  - Sub-total line
  - "Service Tax 8%": tax_amount
  - "Total": total_amount
  - "Rounding Adjustment": rounding (if CP)
  - Amount in words | "Amount Due" | total_amount
- Footer: payment instructions (CIMB + Maybank bank details, fax, email, WhatsApp, credit card)
- "This is the computer generated Invoice and no signature is required."

---

## Department Access Control (Middleware)

Every route must check:
1. Valid JWT
2. User status = ACTIVE
3. Department has required permission for the module

```typescript
// Permission matrix summary
// ADMIN module:       IT=full; all others=none
// MEMBERS:           IT=full; Finance=view; Credit=view; MemberServices=full; ResortOps=view
// AGREEMENTS:        IT=full; Finance=view; Credit=view+edit; MemberServices=full; ResortOps=view
// AMC_BILLING:       IT=full; Finance=full; Credit=full; MemberServices=view; ResortOps=none
// RESORT_BOOKING:    IT=full; Finance=none; Credit=none; MemberServices=full; ResortOps=full
// ENTITLEMENTS:      IT=full; Finance=view; Credit=view; MemberServices=full; ResortOps=view+edit

// Special rules:
// - Day-end file generation: Credit + IT only
// - Rate master add/edit: Finance + IT only
// - Audit log view: IT only
// - Account lock/unlock: IT only
```

---

## Frontend Pages

### Layout
- Sidebar navigation (fixed left)
- Sidebar items: Admin (users, departments, audit), Members, Agreements, AMC Billing, Resort Booking (Coming Soon), Entitlements (Coming Soon)
- Show only modules the user's department has access to
- Top bar: current user name, department badge, logout

### Admin Pages
- `/admin/users` — User list with search, department filter, status filter
- `/admin/users/new` — Create user form
- `/admin/users/:id` — View/edit user + clone button
- `/admin/departments` — Department cards with permission editor
- `/admin/audit` — Audit log table (IT only)

### Member Pages
- `/members` — Member list with search (name, membership no., IC, phone, email) + filters (type, status, product, branch)
- `/members/:id` — Member detail: personal info tabs + agreements list + nominees per agreement
- `/members/:id/edit` — Edit member

### Agreement Pages
- `/agreements` — Agreement list with filters
- `/agreements/:id` — Agreement detail: agreement info, nominees (2 max), AMC schedule summary, invoice list

### AMC Billing Pages
- `/amc/schedules` — Billing schedule list (filter by cocode, branch, due date range)
- `/amc/invoices` — Invoice list (filter by date, cocode, bill_type)
- `/amc/invoices/:id` — Invoice detail with PDF download button
- `/amc/rates` — Rate master view (Finance/IT only): amc_price + amc_price_points tables with add new rate form
- `/amc/dayend` — Day-end file generation page (Credit/IT only): date picker, generate button, download links for all 3 file types, hash total display

---

## Key UI Components

- `<MemberSearchBar />` — searches membership_no, name, IC, phone, email
- `<AgreementStatusBadge />` — colour-coded: NA=green, SU=amber, PT=orange, TM=red
- `<ProductBadge />` — LHC01 (indigo), LHC15 (blue), CP (amber)
- `<InvoiceTable />` — groups A/K/S/Y rows by billing year, shows subtotals
- `<InvoicePdfDownload />` — button that generates and downloads PDF
- `<DayEndGenerator />` — Credit/IT only; shows today's pending invoices, generates all 3 file types
- `<RateMasterTable />` — Shows amc_price / amc_price_points with effective dates; Finance/IT can add new row

---

## Migration Notes (for developer awareness — NOT to implement)

The new system will receive migrated data from Informix. The following fields exist in the schema to accommodate migrated legacy data:
- `legacyCreatedAt`, `legacyModifiedAt`, `legacyAgreementNo` — original Informix audit timestamps
- `newFlag = "O"` in amc_invoices — marks migrated records
- `acctStatus` in agreements — legacy field, not used in UI
- All Informix `lock_status` fields have been dropped — not applicable in web architecture

---

## Security Requirements

- bcrypt password hashing (salt rounds: 12)
- Zod input validation on all endpoints
- No sensitive fields (passwordHash) in API responses
- CORS for localhost in development
- All non-auth routes require valid JWT
- Audit log every create/update/delete/login/suspend action

---

## Environment Variables (.env.example)

```
DATABASE_URL=postgresql://user:password@localhost:5432/lhb_mms
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRES_IN=30m
PORT=3001
NODE_ENV=development
BCRYPT_ROUNDS=12
```

---

## Setup Instructions (README)

1. `cd backend && npm install`
2. `cd frontend && npm install`
3. Copy `.env.example` to `.env` and fill in values
4. `cd backend && npx prisma migrate dev --name init`
5. `cd backend && npx prisma db seed`
6. `cd backend && npm run dev` (port 3001)
7. `cd frontend && npm run dev` (port 3000)

Vite proxy: forward `/api` → `http://localhost:3001`

Default login: username `admin` / password `LHB@Admin2026!`

---

## Extensibility Notes

The architecture must support adding these modules later without restructuring:
- Resort Booking (Module 4)
- Entitlements / Points (Module 5) — will use `ps_memptshis` (CP points purchase history: BA/AO/TM events)

Keep `AppModule` enum and `DeptModulePermission` as the central permission engine. All future module routes must use the shared permission middleware.
```
