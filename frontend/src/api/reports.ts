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

export interface AgreementDetailPreviewResponse<T> {
  data: T[];
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

  getReportAccess: (userId: number) =>
    api.get<{ data: UserReportAccessEntry[] }>(`/reports/access/${userId}`),

  grantReportAccess: (userId: number, reportKey: ReportKey) =>
    api.post(`/reports/access/${userId}/${reportKey}`),

  revokeReportAccess: (userId: number, reportKey: ReportKey) =>
    api.delete(`/reports/access/${userId}/${reportKey}`),
};
