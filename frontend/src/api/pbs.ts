import { api } from './client';
import type { PbsScheme, PbsClaim, PaginatedResponse } from '../types';

export interface PbsTransferPreviewRow {
  pbsId: string;
  coCode: string;
  membershipNo: string;
  fullName: string;
  agreementNo: string;
  certNo: string | null;
  schemeType: string | null;
  paybackDate: string | null;
  acctClassify: string;
  claimAmt: number;
}

export const pbsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<PbsScheme>>('/pbs', { params }),

  get: (id: string) =>
    api.get<{ data: PbsScheme }>(`/pbs/${id}`),

  update: (id: string, data: Record<string, unknown>) =>
    api.put<{ data: PbsScheme }>(`/pbs/${id}`, data),

  createClaim: (pbsId: string, data: Record<string, unknown>) =>
    api.post<{ data: PbsClaim }>(`/pbs/${pbsId}/claims`, data),

  updateClaim: (pbsId: string, claimId: string, data: Record<string, unknown>) =>
    api.put<{ data: PbsClaim }>(`/pbs/${pbsId}/claims/${claimId}`, data),

  deleteClaim: (pbsId: string, claimId: string) =>
    api.delete(`/pbs/${pbsId}/claims/${claimId}`),

  previewPayByMonth: () =>
    api.get('/pbs/reports/pay-by-month/preview'),

  downloadPayByMonth: () =>
    api.get('/pbs/reports/pay-by-month', { responseType: 'blob' }),

  previewClaimReport: () =>
    api.get('/pbs/reports/claim/preview'),

  downloadClaimReport: () =>
    api.get('/pbs/reports/claim', { responseType: 'blob' }),

  previewNotInPbs: () =>
    api.get('/pbs/reports/not-in-pbs/preview'),

  downloadNotInPbs: () =>
    api.get('/pbs/reports/not-in-pbs', { responseType: 'blob' }),

  previewVariance: () =>
    api.get('/pbs/reports/variance/preview'),

  downloadVariance: () =>
    api.get('/pbs/reports/variance', { responseType: 'blob' }),

  previewTransfer: (params: { month: number; year: number }) =>
    api.get<{ data: PbsTransferPreviewRow[]; meta: { total: number } }>('/pbs/transfer/preview', { params }),

  runTransfer: (data: { month: number; year: number }) =>
    api.post<{ data: { count: number; month: number; year: number; claimIds: string[] } }>('/pbs/transfer', data),

  exportTransfer: (data: { month: number; year: number; claimIds: string[] }) =>
    api.post('/pbs/transfer/export', data, { responseType: 'blob' }),
};
