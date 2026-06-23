import { api } from './client';
import type { PbsScheme, PbsClaim, PaginatedResponse } from '../types';

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
};
