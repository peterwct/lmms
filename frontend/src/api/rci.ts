import { api } from './client';
import type {
  RciAgreementLookup, RciBulkBank, RciBulkBankAvailability, RciBulkBankList, RciBulkBankUnit,
  RciEnrolment, RciEnrolmentList, RciWeekDeleteResult, RciWeekList, RciWeekYearResult,
} from '../types';

// RCI (Resort Condominiums International) - fn 1 Enrolment.
// Records are keyed by serialNo, which continues the Informix re_serial_no sequence;
// the agreement (coCode + membershipNo + agreementNo) is fixed once created.
export const rciEnrolmentsApi = {
  list: (params: { q?: string; coCode?: string; rciStatus?: string; page?: number; pageSize?: number }) =>
    api.get<RciEnrolmentList>('/rci-enrolments', { params }),
  get:    (id: string) => api.get<{ data: RciEnrolment }>(`/rci-enrolments/${id}`),
  create: (data: Record<string, unknown>) => api.post<{ data: RciEnrolment }>('/rci-enrolments', data),
  update: (id: string, data: Record<string, unknown>) => api.put<{ data: RciEnrolment }>(`/rci-enrolments/${id}`, data),
  remove: (id: string) => api.delete(`/rci-enrolments/${id}`),
  // Confirms the agreement key on the add form and returns the member name to verify against
  lookup: (params: { coCode: string; membershipNo: string; agreementNo: string }) =>
    api.get<{ data: RciAgreementLookup }>('/rci-enrolments/lookup', { params }),
};

// RCI fn 2 - Weekly Interval. A year is generated as a whole (52 or 53 weeks, all
// derived from the year) and deleted as a whole; there is no edit endpoint.
export const rciWeeksApi = {
  list:       (params: { year: number }) => api.get<RciWeekList>('/rci-weeks', { params }),
  years:      () => api.get<{ data: number[] }>('/rci-weeks/years'),
  createYear: (data: { year: number }) => api.post<{ data: RciWeekYearResult }>('/rci-weeks/year', data),
  deleteYear: (params: { year: number }) => api.delete<{ data: RciWeekDeleteResult }>('/rci-weeks/year', { params }),
};

// RCI fn 3 - Bulk Bank. A record is one RCI WEEK: the client sends weekYear + weekNo
// (picked from fn 2's calendar) and the server derives checkIn/checkOut, so a non-Friday
// range cannot be keyed. Each save maintains the ResAvailMast grid.
export const rciBulkBankApi = {
  list: (params: { q?: string; resortCode?: string; unitNo?: string; weekYear?: number; season?: string; page?: number; pageSize?: number }) =>
    api.get<RciBulkBankList>('/rci-bulk-bank', { params }),
  years: () => api.get<{ data: number[] }>('/rci-bulk-bank/years'),
  // RCI-qualified units at this resort WITH their fn 5 availability, in one call
  // splitTypes: the resort's lock-off half types, which are NOT bankable (null when the
  // resort has no lock-on/lock-off feature). The units[] are already filtered; this is only
  // so the form can say why they are missing.
  units: (resortCode: string) =>
    api.get<{ data: RciBulkBankUnit[]; splitTypes: string[] | null }>(
      '/rci-bulk-bank/units', { params: { resortCode } }),
  create: (data: Record<string, unknown>) => api.post<{ data: RciBulkBank }>('/rci-bulk-bank', data),
  update: (id: string, data: Record<string, unknown>) => api.put<{ data: RciBulkBank }>(`/rci-bulk-bank/${id}`, data),
  remove: (id: string) => api.delete(`/rci-bulk-bank/${id}`),
  availability: (id: string) => api.get<RciBulkBankAvailability>(`/rci-bulk-bank/${id}/availability`),
};
