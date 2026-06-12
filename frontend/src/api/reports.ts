import { api } from './client';
import type { ReportKey, UserReportAccessEntry } from '../types';

export interface MemberPreviewRow {
  no: number;
  membershipNo: string;
  fullName: string;
  memberType: string;
  icNew: string;
  icOld: string;
  telMobile: string;
  email: string;
  mailAddr: string;
  coCode: string;
  agmtNos: string;
  agmtStatus: string;
}

export interface MemberPreviewResponse {
  data: MemberPreviewRow[];
  meta: { total: number; shown: number };
}

export interface AgreementIndPreviewRow {
  no: number;
  agmtNo: string;
  agmtDate: string;
  fullName: string;
  icOld: string;
  icNew: string;
  dob: string;
  gender: string;
  race: string;
  nationality: string;
  mailAddr: string;
  telHome: string;
  telMobile: string;
  email: string;
}

export interface AgreementCorpPreviewRow {
  no: number;
  agmtNo: string;
  agmtDate: string;
  fullName: string;
  registrationNo: string;
  mailAddr: string;
}

export interface ExpiryRow {
  year: number;
  lhcNa: number; lhcNonNa: number; lhcTotal: number;
  cpNa: number;  cpNonNa: number;  cpTotal: number;
  combinedNa: number; combinedNonNa: number; combinedTotal: number;
  cumNa: number; cumNonNa: number; cumTotal: number;
}

export interface AgreementDetailPreviewResponse<T> {
  data: T[];
  meta: { total: number; shown: number };
}

export interface RemainingValuePreviewRow {
  no: number;
  membershipNo: string;
  fullName: string;
  agreementNo: string;
  agreementDate: string;
  expiryDate: string;
  purchasePrice: number;
  remainingYear: number;
  valuePerYear: number;
  remainingValue: number;
}

export interface RemainingValuePreviewResponse {
  data: RemainingValuePreviewRow[];
  meta: { total: number; shown: number; startYear: number; endYear: number };
}

export interface ExpiringMemberPreviewRow {
  no: number;
  coCode: string;
  fullName: string;
  membershipNo: string;
  agreementNo: string;
  agreementDate: string;
  expiryDate: string;
  amcBilled: number;
  totalAmc: number;
  acctClassify: string;
}

export interface ExpiringMemberPreviewResponse {
  data: ExpiringMemberPreviewRow[];
  meta: { total: number; shown: number };
}

export const reportsApi = {
  membersReport: (params: { coCode?: string; acctClassify?: string; format: 'pdf' | 'excel' }) =>
    api.get('/reports/members', { params, responseType: 'blob' }),

  membersPreview: (params: { coCode?: string; acctClassify?: string }) =>
    api.get<MemberPreviewResponse>('/reports/members/preview', { params }),

  agreementsReport: (params: { coCode?: string; memberType?: string; format: 'pdf' | 'excel' }) =>
    api.get('/reports/agreements', { params, responseType: 'blob' }),

  agreementsIndPreview: (params: { coCode?: string }) =>
    api.get<AgreementDetailPreviewResponse<AgreementIndPreviewRow>>('/reports/agreements/preview', {
      params: { ...params, memberType: 'INDIVIDUAL' },
    }),

  agreementsCorpPreview: (params: { coCode?: string }) =>
    api.get<AgreementDetailPreviewResponse<AgreementCorpPreviewRow>>('/reports/agreements/preview', {
      params: { ...params, memberType: 'CORPORATE' },
    }),

  expiryPreview: () =>
    api.get<{ data: ExpiryRow[]; meta: { totalAgreements: number } }>('/reports/expiry/preview'),

  expiryReport: (format: 'pdf' | 'excel') =>
    api.get('/reports/expiry', { params: { format }, responseType: 'blob' }),

  expiringMembersPreview: (params: { month: number; year: number }) =>
    api.get<ExpiringMemberPreviewResponse>('/reports/expiring-members/preview', { params }),

  expiringMembersReport: (params: { month: number; year: number; format: 'pdf' | 'excel' }) =>
    api.get('/reports/expiring-members', { params, responseType: 'blob' }),

  remainingValuePreview: (params: { coCode: 'LHC' | 'CP' }) =>
    api.get<RemainingValuePreviewResponse>('/reports/remaining-value/preview', { params }),

  remainingValueReport: (params: { coCode: 'LHC' | 'CP' }) =>
    api.get('/reports/remaining-value', { params, responseType: 'blob' }),

  getReportAccess: (userId: number) =>
    api.get<{ data: UserReportAccessEntry[] }>(`/reports/access/${userId}`),

  grantReportAccess: (userId: number, reportKey: ReportKey) =>
    api.post(`/reports/access/${userId}/${reportKey}`),

  revokeReportAccess: (userId: number, reportKey: ReportKey) =>
    api.delete(`/reports/access/${userId}/${reportKey}`),
};
