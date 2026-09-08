import { api } from './client';
import type {
  RciAgreementSearchList, RciBulkBankUnit, RciBulkBankYear, RciBulkBankYearSave, RciBulkBankYearSaveResult, RciBulkBankYearDeleteResult,
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
  // Agreement picker for the add form - search by membership no, member name or agreement
  // no. Lives under /rci-enrolments (RESORTS_SETUP view), NOT /api/agreements: a page in one
  // module must not depend on another module's permission. Already-enrolled agreements come
  // back FLAGGED, not filtered out, so the form can disable them and say why.
  searchAgreements: (params: { q: string; coCode?: string; limit?: number }) =>
    api.get<RciAgreementSearchList>('/rci-enrolments/agreement-search', { params }),
};

// RCI fn 2 - Weekly Interval. A year is generated as a whole (52 or 53 weeks, all
// derived from the year) and deleted as a whole; there is no edit endpoint.
export const rciWeeksApi = {
  list:       (params: { year: number }) => api.get<RciWeekList>('/rci-weeks', { params }),
  years:      () => api.get<{ data: number[] }>('/rci-weeks/years'),
  createYear: (data: { year: number }) => api.post<{ data: RciWeekYearResult }>('/rci-weeks/year', data),
  deleteYear: (params: { year: number }) => api.delete<{ data: RciWeekDeleteResult }>('/rci-weeks/year', { params }),
};

// RCI fn 3 - Bulk Bank. The screen is a whole-year grid, so there are no per-record
// calls: read one (resort, unit, year) and save it back whole. The server diffs the
// payload against what is stored and works out the creates / updates / deletes itself.
export const rciBulkBankApi = {
  // One unit's banked weeks for a year, unpaginated (52/53 rows at most)
  year: (params: { resortCode: string; unitNo: string; weekYear: number }) =>
    api.get<RciBulkBankYear>('/rci-bulk-bank', { params }),
  // Units the grid may show at this resort, WITH their fn 5 availability, in one call.
  // splitTypes: the resort's lock-off half types, which are NOT bankable (null when the
  // resort has no lock-on/lock-off feature). The units[] are already filtered; this is only
  // so the form can say why they are missing.
  units: (resortCode: string) =>
    api.get<{ data: RciBulkBankUnit[]; splitTypes: string[] | null }>(
      '/rci-bulk-bank/units', { params: { resortCode } }),
  saveYear: (data: RciBulkBankYearSave) =>
    api.post<{ data: RciBulkBankYearSaveResult }>('/rci-bulk-bank/year', data),
  // Clears a unit's whole year unconditionally, for re-entry - not a diff, so it also
  // removes weeks the save's guards would refuse to recreate
  deleteYear: (params: { resortCode: string; unitNo: string; weekYear: number }) =>
    api.delete<{ data: RciBulkBankYearDeleteResult }>('/rci-bulk-bank/year', { params }),
};
