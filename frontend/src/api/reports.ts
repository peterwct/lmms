import { api } from './client';

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

export const reportsApi = {
  membersReport: (params: { coCode?: string; acctClassify?: string; format: 'pdf' | 'excel' }) =>
    api.get('/reports/members', { params, responseType: 'blob' }),

  membersPreview: (params: { coCode?: string; acctClassify?: string }) =>
    api.get<MemberPreviewResponse>('/reports/members/preview', { params }),
};
