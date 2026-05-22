import { api } from './client';
import type { AmcSchedule, AmcInvoice, AmcPrice, AmcPricePoints, AuditLog, PaginatedResponse } from '../types';

export const amcApi = {
  // Schedules
  listSchedules: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<AmcSchedule>>('/amc/schedules', { params }),

  getSchedule: (id: string) =>
    api.get<{ data: AmcSchedule }>(`/amc/schedules/${id}`),

  // Invoices
  listInvoices: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<AmcInvoice>>('/amc/invoices', { params }),

  getInvoice: (id: string) =>
    api.get<{ data: AmcInvoice }>(`/amc/invoices/${id}`),

  generateInvoices: (data: { invDate?: string; coCode?: string }) =>
    api.post<{ message: string; generated: number }>('/amc/invoices/generate', data),

  downloadInvoice: (id: string) =>
    api.get(`/amc/invoices/${id}/download`, { responseType: 'blob' }),

  // Rates
  listLhcRates:    () => api.get<{ data: AmcPrice[] }>('/amc/rates/lhc'),
  createLhcRate:   (data: Record<string, unknown>) => api.post<{ data: AmcPrice }>('/amc/rates/lhc', data),
  updateLhcRate:   (id: string, data: Record<string, unknown>) => api.put<{ data: AmcPrice }>(`/amc/rates/lhc/${id}`, data),
  toggleLhcRate:   (id: string) => api.patch<{ data: AmcPrice }>(`/amc/rates/lhc/${id}/toggle`, {}),
  deleteLhcRate:   (id: string) => api.delete(`/amc/rates/lhc/${id}`),
  listCpRates:     () => api.get<{ data: AmcPricePoints[] }>('/amc/rates/cp'),
  createCpRate:    (data: Record<string, unknown>) => api.post<{ data: AmcPricePoints }>('/amc/rates/cp', data),
  updateCpRate:    (id: string, data: Record<string, unknown>) => api.put<{ data: AmcPricePoints }>(`/amc/rates/cp/${id}`, data),
  toggleCpRate:    (id: string) => api.patch<{ data: AmcPricePoints }>(`/amc/rates/cp/${id}/toggle`, {}),
  deleteCpRate:    (id: string) => api.delete(`/amc/rates/cp/${id}`),

  // Day-end
  generateDayEnd: (data: { date?: string }) =>
    api.post<{ message: string; files: { name: string; url: string }[]; summary: Record<string, { count: number; amount: number }> }>('/amc/dayend/generate', data),

  listDayEndHistory: () =>
    api.get<{ data: { name: string; size: number; createdAt: string; url: string }[] }>('/amc/dayend/history'),

  downloadDayEndFile: (filename: string) =>
    api.get(`/amc/dayend/download/${filename}`, { responseType: 'blob' }),
};

export const auditApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<AuditLog>>('/audit', { params }),
};
