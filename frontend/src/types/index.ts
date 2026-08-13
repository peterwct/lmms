export type AppModule = 'ADMIN' | 'MEMBERS' | 'AGREEMENTS' | 'AMC_BILLING' | 'RESORT_BOOKING' | 'ENTITLEMENTS' | 'PBS_SCHEME' | 'RESORTS_SETUP';
export type ReportKey = 'MEMBER_REPORT' | 'AGREEMENT_REPORT' | 'EXPIRY_REPORT' | 'EXPIRING_MEMBER_REPORT' | 'REMAINING_VALUE_REPORT' | 'EXPIRY_SUMMARY_REPORT' | 'PBS_PAY_BY_MONTH_REPORT' | 'PBS_CLAIM_REPORT' | 'PBS_NOT_IN_PBS_REPORT' | 'PBS_VARIANCE_REPORT' | 'PBS_AUTO_TRANSFER';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';
export type MemberStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | 'DECEASED' | 'TRANSFERRED';
export type MemberType = 'INDIVIDUAL' | 'CORPORATE';
export type AgreementStatus = 'NA' | 'SU' | 'PT' | 'TM';
export type EntitlementType = 'W' | 'P';
export type BillingStatus = 'N' | 'C';
export type InvComponent = 'MAIN_AMC' | 'SINKING_FUND' | 'SERVICE_TAX' | 'ROUNDING';
export type BillType = 'N' | 'A' | 'H' | 'F';
export type AuditActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'SUSPEND';

export interface Permission {
  module: AppModule;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface Department {
  id: number;
  name: string;
  description?: string;
  isLocked: boolean;
  createdAt: string;
  _count?: { users: number };
  permissions?: Permission[];
}

export interface UserReportAccessEntry {
  reportKey: ReportKey;
  label: string;
  granted: boolean;
  grantedAt: string | null;
  grantedBy: { id: number; fullName: string } | null;
  itOverride: boolean;
}

export interface User {
  id: number;
  fullName: string;
  username: string;
  email: string;
  phone?: string;
  status: UserStatus;
  mustChangePwd: boolean;
  lastLoginAt?: string;
  lockedAt?: string;
  failedAttempts: number;
  createdAt: string;
  updatedAt: string;
  department: { id: number; name: string; isLocked: boolean; permissions?: Permission[] };
  reportAccess?: ReportKey[];
}

export interface Member {
  id: string;
  membershipNo: string;
  memberType: MemberType;
  fullName: string;
  salutation?: string;
  nameCard?: string;
  branchCode?: string;
  accpacRef?: string;
  icOld?: string;
  icNew?: string;
  nationality?: string;
  dateOfBirth?: string;
  gender?: string;
  race?: string;
  maritalStatus?: string;
  email?: string;
  telHome?: string;
  telMobile?: string;
  faxNo?: string;
  resAdd1?: string; resAdd2?: string; resAdd3?: string;
  resCityState?: string; resPostcode?: string; resStateCode?: string;
  mailAdd1?: string; mailAdd2?: string; mailAdd3?: string;
  mailCityState?: string; mailPostcode?: string; mailStateCode?: string;
  companyName?: string; workNature?: string; designation?: string;
  compAdd1?: string; compAdd2?: string; compAdd3?: string;
  compCityState?: string; compPostcode?: string; compStateCode?: string;
  telOffice?: string; telOffice2?: string; faxOffice?: string;
  spouseName?: string; spouseIc?: string;
  jaName?: string; jaIc?: string; jaIcNew?: string;
  jaSalutation?: string; jaDesignation?: string; jaNameCard?: string;
  jaAdd1?: string; jaAdd2?: string; jaAdd3?: string;
  jaCity?: string; jaPostcode?: string; jaState?: string;
  jaTelHome?: string; jaTelOffice?: string; jaMobile?: string; jaEmail?: string;
  registrationNo?: string; incorporationDate?: string; businessNature?: string;
  tinNumber?: string;
  enrolRci: boolean;
  activeHcm: boolean;
  remarks?: string;
  status: MemberStatus;
  createdAt: string;
  updatedAt: string;
  agreements?: Agreement[];
}

export interface CancellationReason {
  code: string;
  description: string;
  category: string; // CC | TM
  status: string;   // A | U | N
}

export interface SuReason {
  code: string;
  description: string;
}

export interface State {
  code: string;
  name: string;
}

// Product / operating-company master (Informix ps_company). W=Week, P=Points.
export type EntType = 'W' | 'P';

export interface Product {
  id: string;
  coCode: string;
  coName: string;
  entType: EntType;
  add1: string | null;
  add2: string | null;
  add3: string | null;
  telNo: string | null;
  faxNo: string | null;
  contactPerson: string | null;
  createdAt: string;
  updatedAt: string;
}

// Leisure Vacation Club exchange-programme master (Informix lvc_master).
// An LVC code names an exchange arrangement — LVC-CP (coCode 03/15 <-> 02, our own
// members) or LVC-SGI / LVC-CLC (into a partner's MAR — Make Available Resorts).
export interface LvcCode {
  id: string;
  lvcCode: string;
  coCode: string | null;   // references Product.coCode (ps_company.psc_cocode)
  lvcName: string;
  status: string;          // 'A' | 'U'
  incoming: number;        // running counters — imported, never shown, never editable
  outgoing: number;
  faxBatch: number;
  createdAt: string;
  updatedAt: string;
}

export interface Resort {
  id: string;
  resortCode: string;
  coCode: string;
  shortName: string | null;
  resortName: string;
  rciCode: string | null;
  rciAffiliate: string | null;
  lockOnOff: string | null;
  resortMgmt: string | null;
  contactPerson: string | null;
  add1: string | null;
  add2: string | null;
  add3: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  telNo: string | null;
  faxNo: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: string;
  paymt: string | null;
  lockStatus: string | null;
  legacyCreateUser: string | null;
  legacyCreateDate: string | null;
  legacyModUser: string | null;
  legacyModDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ResortInfoCategory = 'GETTING_THERE' | 'RESORT_FACILITY' | 'PLACE_OF_INTEREST' | 'UNIT_AMENITY';

export interface ResortDetail extends Resort {
  info: Record<ResortInfoCategory, string[]>;
}

export type LockType = 'LM' | 'LS' | 'LN';

export interface ApartmentType {
  id: string;
  resortId: string;
  resortCode: string;
  apartmentType: string;
  description: string | null;
  lockType: LockType;
  createdAt: string;
  updatedAt: string;
  resort: {
    shortName: string | null;
    resortName: string;
    lockOnOff: string | null;
    coCode: string;
  };
}

export interface ResortUnit {
  id: string;
  resortId: string;
  resortCode: string;
  unitNo: string;
  apartmentType: string;
  occupancy: number | null;
  rciReserved: string;
  createdAt: string;
  updatedAt: string;
  resort: {
    shortName: string | null;
    resortName: string;
    coCode: string;
  };
}

export interface ResortUnitList {
  data: ResortUnit[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AptBlock {
  id: string;
  resortId: string;
  resortCode: string;
  unitNo: string;
  apartmentType: string | null;
  startDate: string;
  endDate: string;
  blockNo: number | null;
  createdAt: string;
  updatedAt: string;
  resort: {
    shortName: string | null;
    resortName: string;
    coCode: string;
  };
}

export interface AptBlockList {
  data: AptBlock[];
  total: number;
  page: number;
  pageSize: number;
}

// One unit's availability records (fn 5 AptBlock), newest first. Resorts Maintenance
// makes the user pick one before keying date ranges inside it; a unit missing from the
// list has no availability at all and cannot go under maintenance.
export interface UnitAvailability {
  unitNo: string;
  blocks: { id: string; startDate: string; endDate: string }[];
}

export interface ResortMaintenance {
  id: string;
  resortId: string;
  resortCode: string;
  unitNo: string;
  apartmentType: string | null;
  startDate: string;
  endDate: string;
  remarks: string | null;
  serialNo: number | null;
  createdAt: string;
  updatedAt: string;
  resort: {
    shortName: string | null;
    resortName: string;
    coCode: string;
  };
}

export interface ResortMaintenanceList {
  data: ResortMaintenance[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ResAvailDay {
  date: string;
  actNight: number;
  balNight: number;
}

export interface AptBlockAvailability {
  resortCode: string;
  unitNo: string;
  apartmentType: string | null;
  startDate: string;
  endDate: string;
  data: ResAvailDay[];
}

// Same shape as AptBlockAvailability — the per-day grid for a maintenance record's range
export type ResortMaintenanceAvailability = AptBlockAvailability;

// Holidays (Resorts Setup fn 7) — one global calendar, no resort/state scope, covering
// both public holidays (single dates) and school breaks (date ranges).
export type HolidayType = 'PUBLIC' | 'SCHOOL';

export interface Holiday {
  id: string;
  holidayType: HolidayType;
  startDate: string;       // ISO string, UTC midnight. PUBLIC: the holiday date.
  endDate: string | null;  // null for PUBLIC (single day)
  year: number;            // PUBLIC: derived server-side. SCHOOL: the academic year, editable.
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface HolidayCloneResult {
  sourceYear: number;
  targetYear: number;
  created: number;
}

// CP Season calendar (Resorts Setup fn 8) — one row per calendar day, graded G/S/D.
// Read by CP booking only; the Holiday calendar (public + school) is LHC-only.
export type CpSeason = 'G' | 'S' | 'D';

export interface CpSeasonDate {
  id: string;
  date: string;        // ISO string, UTC midnight
  season: CpSeason;
  year: number;        // derived server-side from date
  createdAt: string;
  updatedAt: string;
}

// One month's graded days. Ungraded days are simply absent — the page scaffolds the
// full month and defaults the gaps to Silver.
export interface CpSeasonMonth {
  year: number;
  month: number;
  data: CpSeasonDate[];
}

export interface CpSeasonMonthSaveResult {
  year: number;
  month: number;
  days: number;
  created: number;
  updated: number;
}

export interface CpSeasonMonthDeleteResult {
  year: number;
  month: number;
  deleted: number;
}

// Same shape as the holiday clone result
export type CpSeasonCloneResult = HolidayCloneResult;

// Season Points (Resorts Setup fn 9) — ONE chart for the points deducted per night by
// resort x apartment type x season x day of week, discriminated by pointsType:
//   HOME — the member's own product's resort (coCode '02'). CpSeasonDate grades the day;
//          this turns the grade into a number.
//   AWAY — every other resort, reached through an LVC exchange programme.
// The weekly total is derived, never stored.
export type PointsType = 'HOME' | 'AWAY';

export interface SeasonPoint {
  id: string;
  pointsType: PointsType;
  resortId: string;
  resortCode: string;
  coCode: string;             // the resort's own product
  lvcCoCode: string | null;   // AWAY only — the product whose members are charged
  apartmentType: string;
  effectiveDate: string;      // ISO string, UTC midnight — the VERSION this row belongs to
  season: CpSeason;
  ptsSun: number;
  ptsMon: number;
  ptsTue: number;
  ptsWed: number;
  ptsThu: number;
  ptsFri: number;
  ptsSat: number;
  createdAt: string;
  updatedAt: string;
}

// One chart VERSION — all rows sharing (resortCode, effectiveDate), in force until a later
// version supersedes it. Combos with no row yet are absent: the page scaffolds the full
// apartment type x season grid from `apartmentTypes` and leaves the gaps blank.
// `apartmentTypes` is the union of the resort's registered types (Apartment Types Setup)
// and the types already stored here — partner resorts have none registered, so
// scaffolding from fn 3 alone would render an empty grid.
export interface SeasonPointVersion {
  resortCode: string;
  effectiveDate: string | null;   // null when the resort has no version yet
  pointsType: PointsType;
  resort: { resortCode: string; resortName: string; shortName: string | null; coCode: string };
  lvcCoCode: string | null;       // null on the HOME tab
  apartmentTypes: { apartmentType: string; description: string | null; registered: boolean }[];
  data: SeasonPoint[];
}

// A row of the version list. `isCurrent` is the version in force today; anything dated
// later is Scheduled, anything earlier than the current one is Superseded.
export interface SeasonPointVersionSummary {
  effectiveDate: string;
  rows: number;
  apartmentTypes: number;
  seasons: number;
  lvcCoCode: string | null;
  isCurrent: boolean;
}

export interface SeasonPointSaveResult {
  resortCode: string;
  effectiveDate: string;
  rows: number;
  replaced: number;   // rows the save replaced; 0 means this was a new version
}

export interface SeasonPointDeleteResult {
  resortCode: string;
  effectiveDate: string;
  deleted: number;
}

export interface AvailabilityChartCol {
  date: string;
  dow: string;
  dom: number;
  weekend: boolean;
}

export interface AvailabilityChartRow {
  resortCode: string;
  shortName: string | null;
  apartmentType: string;
  coCode: string;
  label: string;
  cells: number[];
}

export interface AvailabilityChart {
  product: 'LHC' | 'CP';
  startDate: string;
  days: number;
  dates: AvailabilityChartCol[];
  rows: AvailabilityChartRow[];
}

export interface PbsScheme {
  id: string;
  agreementId: string;
  coCode: string;
  agreementNo: string;
  certNo?: string;
  schemeType?: string;
  paybackDate?: string;
  topUp: boolean;
  pbsIndc: boolean;
  claimIndc: boolean;
  remark?: string;
  createdAt: string;
  updatedAt: string;
  agreement?: Partial<Agreement> & { member?: Partial<Member> };
  claims?: PbsClaim[];
}

export interface PbsClaim {
  id: string;
  pbsSchemeId: string;
  agreementNo: string;
  certNo?: string;
  refNo: number;
  claimant?: string;
  claimantIc?: string;
  accNo?: string;
  bankCode?: string;
  relationCode?: string;
  remark?: string;
  lossDate?: string;
  claimAmt: string;
  payMode?: string;
  docNo?: string;
  docDate?: string;
  claimType?: string;
  claimRemark?: string;
  trustPaidDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Nominee {
  id: string;
  nomineeSeq: number;
  fullName?: string;
  icOld?: string;
  icNew?: string;
  salutation?: string;
  designation?: string;
  nameCard?: string;
  telHome?: string;
  telMobile?: string;
  add1?: string; add2?: string; add3?: string;
  cityState?: string; postcode?: string;
  email?: string;
}

export interface AmcSchedule {
  id: string;
  agreementId: string;
  membershipNo: string;
  agreementNo: string;
  coCode: string;
  firstDueDate?: string;
  nextDueDate?: string;
  lastInvoiceDate?: string;
  invoicesIssued: number;
  totalInvoices: number;
  priceCode?: string;
  billingStatus: BillingStatus;
  agreement?: Partial<Agreement> & { member?: Partial<Member> };
  invoices?: AmcInvoice[];
}

export interface AmcInvoice {
  id: string;
  scheduleId: string;
  agreementId: string;
  membershipNo: string;
  agreementNo: string;
  docNo?: string;
  invNo: string;
  invComponent: InvComponent;
  invDate: string;
  amcDate?: string;
  dueDate?: string;
  invoiceYearSeq?: number;
  invAmount: string;
  totalPoints?: number;
  rate?: string;
  billType: BillType;
  coCode: string;
  isProcessed: boolean;
  processedAt?: string;
  printDate?: string;
  printCount: number;
  agreement?: Partial<Agreement> & { member?: Partial<Member> };
}

export interface CancellableInvoice {
  id: string;            // MAIN_AMC row id — used to cancel the whole set
  invNo: string;
  invNos: string[];
  agreementNo: string;
  membershipNo: string;
  memberName: string;
  coCode: string;
  invDate: string;
  invoiceYearSeq?: number;
  totalAmount: string;
}

export interface Agreement {
  id: string;
  agreementNo: string;
  legacyAgreementNo?: string;
  memberId: string;
  membershipNo: string;
  agreementDate: string;
  endDate?: string;
  termYears: number;
  coCode: string;
  entitlementType: EntitlementType;
  agreementType?: string;
  memberType?: string;
  totalPoints?: number;
  acctClassify: AgreementStatus;
  purchasePrice?: string;
  downPayment?: string;
  subFees?: string;
  sinkFund?: string;
  govtTax?: string;
  loanAmount?: string;
  loanType?: string;
  salesBranch?: string;
  salespersonCode?: string;
  salespersonName?: string;
  certificateNo?: string;
  rciRefNo?: string;
  rciNominee?: string;
  rciEnrolDate?: string;
  rciExpiryDate?: string;
  outstdDoc: boolean;
  docDescription?: string;
  canCode?: string;
  suCode?: string;
  transferFlag?: string;
  transferToMembership?: string;
  transferFromMembership?: string;
  transferToMemberId?: string;
  transferFromMemberId?: string;
  transferToMemberName?: string;
  transferFromMemberName?: string;
  transferDate?: string;
  transferToDate?: string;
  transferUser?: string;
  transferToUser?: string;
  cancellationReason?: CancellationReason;
  suReason?: SuReason;
  statusChangeDate?: string;
  statusChangeUser?: string;
  createdAt: string;
  updatedAt: string;
  member?: Partial<Member>;
  nominees?: Nominee[];
  amcSchedule?: AmcSchedule;
  amcInvoices?: AmcInvoice[];
  pbsScheme?: PbsScheme;
  entitlementBalance?: EntitlementBalance | null;
  cpEntitlementBalance?: CpEntitlementBalance | null;
}

export interface EntitlementBalanceColumn {
  label: string;   // Acc | Curr | Ad1..Ad5
  year: number;
  nights: number;  // 7 - nights used (clamped at 0)
  weekend: number; // 1 - weekend used (clamped at 0)
}

export interface EntitlementBalance {
  columns: EntitlementBalanceColumn[]; // Acc | Curr | Ad1..Ad5 (7 columns)
  forfeitedNights: number;             // unused balance from years older than Accrue
  usableNights: number;                // min(14 - actual[curr], acc+curr+adv1 balances)
  usedNights: number;                  // actual nights taken in the current membership year
  usedYear: number;                    // calendar year of the current membership year
}

export interface CpEntitlementBalanceColumn {
  label: string;      // Acc | Curr | Ad1..Ad5
  year: number;
  bal: number | null; // point balance; null => blank cell (no source row / past expiry)
}

export interface CpEntitlementBalance {
  columns: CpEntitlementBalanceColumn[]; // Acc | Curr | Ad1..Ad5 (7 columns)
  forfeitedPts: number;                  // points from years older than / capped out of Accrue
}

export interface AmcPrice {
  id: string;
  coCode: string;
  effectiveDate: string;
  priceCode: string;
  currencyCode?: string;
  amcAmount: string;
  sinkingFund: string;
  serviceTax: string;
  totalAmount: string;
  amountInWords?: string;
  rate: string;
  isActive: boolean;
}

export interface AmcPricePoints {
  id: string;
  coCode: string;
  effectiveDate: string;
  minPoints: number;
  maxPoints: number;
  amcRatePerPoint: string;
  sinkingFundPct: string;
  gstPct: string;
  unitPrice?: string;
  rciPoints?: number;
  isActive: boolean;
}

export interface AuditLog {
  id: number;
  userId: number;
  action: string;
  actionType: AuditActionType;
  targetType?: string;
  targetId?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  user: { id: number; username: string; fullName: string };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; pages: number };
}
