export type AppModule = 'ADMIN' | 'MEMBERS' | 'AGREEMENTS' | 'AMC_BILLING' | 'RESORT_BOOKING' | 'ENTITLEMENTS' | 'PBS_SCHEME';
export type ReportKey = 'MEMBER_REPORT' | 'AGREEMENT_REPORT' | 'EXPIRY_REPORT' | 'EXPIRING_MEMBER_REPORT' | 'REMAINING_VALUE_REPORT' | 'EXPIRY_SUMMARY_REPORT';
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

export interface State {
  code: string;
  name: string;
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
  statusChangeDate?: string;
  statusChangeUser?: string;
  createdAt: string;
  updatedAt: string;
  member?: Partial<Member>;
  nominees?: Nominee[];
  amcSchedule?: AmcSchedule;
  amcInvoices?: AmcInvoice[];
  pbsScheme?: PbsScheme;
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
