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

// Public Holidays (Resorts Setup fn 6) — global calendar, no resort/state scope
export interface PublicHoliday {
  id: string;
  holidayDate: string;   // ISO string, UTC midnight
  year: number;          // derived server-side from holidayDate
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicHolidayCloneResult {
  sourceYear: number;
  targetYear: number;
  created: number;
}

// School Holidays (Resorts Setup fn 7) — global calendar of date ranges, filed under
// an academic year (editable, not derived — a session can cross the calendar boundary)
export interface SchoolHoliday {
  id: string;
  academicYear: number;
  startDate: string;   // ISO string, UTC midnight
  endDate: string;     // ISO string, UTC midnight
  description: string;
  createdAt: string;
  updatedAt: string;
}

// Same shape as the public-holiday clone result
export type SchoolHolidayCloneResult = PublicHolidayCloneResult;

// CP Season calendar (Resorts Setup fn 8) — one row per calendar day, graded G/S/D.
// Read by CP booking only; the Public/School holiday calendars are LHC-only.
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

// Same shape as the public-holiday clone result
export type CpSeasonCloneResult = PublicHolidayCloneResult;

// CP Season Points (Resorts Setup fn 9) — points deducted per night by resort x
// apartment type x season x day of week. CpSeasonDate grades the day; this turns
// the grade into a number. The weekly total is derived, never stored.
export interface CpSeasonPoint {
  id: string;
  resortId: string;
  resortCode: string;
  apartmentType: string;
  year: number;
  effectiveDate: string; // ISO string, UTC midnight
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

// One resort-year. Combos with no row yet are absent — the page scaffolds the full
// apartment type x season grid from `apartmentTypes` and leaves the gaps blank.
export interface CpSeasonPointYear {
  resortCode: string;
  year: number;
  resort: { resortCode: string; resortName: string; shortName: string | null; coCode: string };
  apartmentTypes: { apartmentType: string; description: string | null }[];
  data: CpSeasonPoint[];
}

export interface CpSeasonPointSaveResult {
  resortCode: string;
  year: number;
  rows: number;
  created: number;
  updated: number;
}

export interface CpSeasonPointDeleteResult {
  resortCode: string;
  year: number;
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
