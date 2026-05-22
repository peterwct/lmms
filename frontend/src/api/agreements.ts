import { api } from './client';
import type { Agreement, Nominee, AgreementStatus, PaginatedResponse } from '../types';

export const agreementsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Agreement>>('/agreements', { params }),

  get: (id: string) => api.get<{ data: Agreement }>(`/agreements/${id}`),

  update: (id: string, data: Record<string, unknown>) =>
    api.put<{ data: Agreement }>(`/agreements/${id}`, data),

  changeStatus: (id: string, acctClassify: AgreementStatus) =>
    api.patch(`/agreements/${id}/status`, { acctClassify }),

  updateNominees: (id: string, nominees: Partial<Nominee>[]) =>
    api.put(`/agreements/${id}/nominees`, { nominees }),

  getAmcSchedule: (id: string) =>
    api.get(`/agreements/${id}/amc`),
};
