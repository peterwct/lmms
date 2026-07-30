import { api } from './client';
import type { ApartmentType, AptBlock, AptBlockAvailability, AptBlockList, AvailabilityChart, CpSeasonCloneResult, CpSeasonMonth, CpSeasonMonthDeleteResult, CpSeasonMonthSaveResult, CpSeasonPointDeleteResult, CpSeasonPointSaveResult, CpSeasonPointYear, LvcCode, LvcSeasonPointDeleteResult, LvcSeasonPointSaveResult, LvcSeasonPointYear, Product, PublicHoliday, PublicHolidayCloneResult, Resort, ResortDetail, ResortInfoCategory, ResortMaintenance, ResortMaintenanceAvailability, ResortMaintenanceList, ResortUnit, ResortUnitList, SchoolHoliday, SchoolHolidayCloneResult } from '../types';

export const productsApi = {
  list:   (q?: string) => api.get<{ data: Product[] }>('/products', { params: q ? { q } : undefined }),
  create: (data: Record<string, unknown>) => api.post<{ data: Product }>('/products', data),
  update: (id: string, data: Record<string, unknown>) => api.put<{ data: Product }>(`/products/${id}`, data),
  remove: (id: string) => api.delete(`/products/${id}`),
};

export const lvcCodesApi = {
  list:   (q?: string) => api.get<{ data: LvcCode[] }>('/lvc-codes', { params: q ? { q } : undefined }),
  create: (data: Record<string, unknown>) => api.post<{ data: LvcCode }>('/lvc-codes', data),
  update: (id: string, data: Record<string, unknown>) => api.put<{ data: LvcCode }>(`/lvc-codes/${id}`, data),
  toggle: (id: string) => api.patch<{ data: LvcCode }>(`/lvc-codes/${id}/toggle`, {}),
  remove: (id: string) => api.delete(`/lvc-codes/${id}`),
};

export const resortsApi = {
  list:   (q?: string) => api.get<{ data: Resort[] }>('/resorts', { params: q ? { q } : undefined }),
  get:    (id: string) => api.get<{ data: ResortDetail }>(`/resorts/${id}`),
  create: (data: Record<string, unknown>) => api.post<{ data: Resort }>('/resorts', data),
  update: (id: string, data: Record<string, unknown>) => api.put<{ data: Resort }>(`/resorts/${id}`, data),
  toggle: (id: string) => api.patch<{ data: Resort }>(`/resorts/${id}/toggle`, {}),
  remove: (id: string) => api.delete(`/resorts/${id}`),
  saveInfo: (id: string, data: { category: ResortInfoCategory; lines: string[] }) =>
    api.put<{ data: { category: ResortInfoCategory; lines: string[] } }>(`/resorts/${id}/info`, data),
};

export const resortUnitsApi = {
  list: (params: { q?: string; resortCode?: string; page?: number; pageSize?: number }) =>
    api.get<ResortUnitList>('/resort-units', { params }),
  create: (data: Record<string, unknown>) => api.post<{ data: ResortUnit }>('/resort-units', data),
  update: (id: string, data: Record<string, unknown>) => api.put<{ data: ResortUnit }>(`/resort-units/${id}`, data),
  remove: (id: string) => api.delete(`/resort-units/${id}`),
};

export const aptBlocksApi = {
  list: (params: { q?: string; resortCode?: string; page?: number; pageSize?: number }) =>
    api.get<AptBlockList>('/apt-blocks', { params }),
  create: (data: Record<string, unknown>) => api.post<{ data: AptBlock }>('/apt-blocks', data),
  update: (id: string, data: Record<string, unknown>) => api.put<{ data: AptBlock }>(`/apt-blocks/${id}`, data),
  remove: (id: string) => api.delete(`/apt-blocks/${id}`),
  availability: (id: string) => api.get<AptBlockAvailability>(`/apt-blocks/${id}/availability`),
  chart: (params: { product: 'LHC' | 'CP'; date: string; days?: number }) =>
    api.get<AvailabilityChart>('/apt-blocks/availability-chart', { params }),
};

export const resortMaintenanceApi = {
  list: (params: { q?: string; resortCode?: string; year?: number; month?: number; page?: number; pageSize?: number }) =>
    api.get<ResortMaintenanceList>('/resort-maintenance', { params }),
  years: () => api.get<{ data: number[] }>('/resort-maintenance/years'),
  create: (data: Record<string, unknown>) => api.post<{ data: ResortMaintenance }>('/resort-maintenance', data),
  update: (id: string, data: Record<string, unknown>) => api.put<{ data: ResortMaintenance }>(`/resort-maintenance/${id}`, data),
  remove: (id: string) => api.delete(`/resort-maintenance/${id}`),
  availability: (id: string) => api.get<ResortMaintenanceAvailability>(`/resort-maintenance/${id}/availability`),
};

export const publicHolidaysApi = {
  list: (params: { q?: string; year?: number }) =>
    api.get<{ data: PublicHoliday[] }>('/public-holidays', { params }),
  years:  () => api.get<{ data: number[] }>('/public-holidays/years'),
  create: (data: Record<string, unknown>) => api.post<{ data: PublicHoliday }>('/public-holidays', data),
  update: (id: string, data: Record<string, unknown>) => api.put<{ data: PublicHoliday }>(`/public-holidays/${id}`, data),
  remove: (id: string) => api.delete(`/public-holidays/${id}`),
  // Copies a year's holidays to sourceYear + 1 on the same month/day
  clone: (data: { sourceYear: number }) => api.post<{ data: PublicHolidayCloneResult }>('/public-holidays/clone', data),
};

export const schoolHolidaysApi = {
  list: (params: { q?: string; academicYear?: number }) =>
    api.get<{ data: SchoolHoliday[] }>('/school-holidays', { params }),
  years:  () => api.get<{ data: number[] }>('/school-holidays/years'),
  create: (data: Record<string, unknown>) => api.post<{ data: SchoolHoliday }>('/school-holidays', data),
  update: (id: string, data: Record<string, unknown>) => api.put<{ data: SchoolHoliday }>(`/school-holidays/${id}`, data),
  remove: (id: string) => api.delete(`/school-holidays/${id}`),
  // Copies an academic year's breaks to sourceYear + 1, same month/day on both ends
  clone: (data: { sourceYear: number }) => api.post<{ data: SchoolHolidayCloneResult }>('/school-holidays/clone', data),
};

export const cpSeasonsApi = {
  // The screen works a month at a time — no pagination, no per-day endpoints
  month: (params: { year: number; month: number }) =>
    api.get<CpSeasonMonth>('/cp-seasons', { params }),
  years: () => api.get<{ data: number[] }>('/cp-seasons/years'),
  saveMonth: (data: { year: number; month: number; days: { date: string; season: string }[] }) =>
    api.post<{ data: CpSeasonMonthSaveResult }>('/cp-seasons/month', data),
  deleteMonth: (params: { year: number; month: number }) =>
    api.delete<{ data: CpSeasonMonthDeleteResult }>('/cp-seasons/month', { params }),
  clone: (data: { sourceYear: number }) => api.post<{ data: CpSeasonCloneResult }>('/cp-seasons/clone', data),
};

export type CpSeasonPointRowInput = {
  apartmentType: string;
  season: string;
  effectiveDate: string;
  ptsSun: number; ptsMon: number; ptsTue: number; ptsWed: number;
  ptsThu: number; ptsFri: number; ptsSat: number;
};

export const cpSeasonPointsApi = {
  // The screen works a resort-year at a time — no pagination
  year: (params: { resortCode: string; year: number }) =>
    api.get<CpSeasonPointYear>('/cp-season-points', { params }),
  years: (params: { resortCode: string }) =>
    api.get<{ data: number[] }>('/cp-season-points/years', { params }),
  saveYear: (data: { resortCode: string; year: number; rows: CpSeasonPointRowInput[] }) =>
    api.post<{ data: CpSeasonPointSaveResult }>('/cp-season-points/year', data),
  deleteYear: (params: { resortCode: string; year: number }) =>
    api.delete<{ data: CpSeasonPointDeleteResult }>('/cp-season-points/year', { params }),
  // Drops a single superseded effective-dated revision without wiping the year
  remove: (id: string) => api.delete(`/cp-season-points/${id}`),
};

export const lvcSeasonPointsApi = {
  // Same resort-year shape as cpSeasonPointsApi, plus lvcCoCode (the product charged)
  year: (params: { resortCode: string; year: number }) =>
    api.get<LvcSeasonPointYear>('/lvc-season-points', { params }),
  years: (params: { resortCode: string }) =>
    api.get<{ data: number[] }>('/lvc-season-points/years', { params }),
  saveYear: (data: { resortCode: string; year: number; lvcCoCode: string; rows: CpSeasonPointRowInput[] }) =>
    api.post<{ data: LvcSeasonPointSaveResult }>('/lvc-season-points/year', data),
  deleteYear: (params: { resortCode: string; year: number }) =>
    api.delete<{ data: LvcSeasonPointDeleteResult }>('/lvc-season-points/year', { params }),
  // Drops a single superseded effective-dated revision without wiping the year
  remove: (id: string) => api.delete(`/lvc-season-points/${id}`),
};

export const apartmentTypesApi = {
  list:   (q?: string) => api.get<{ data: ApartmentType[] }>('/apartment-types', { params: q ? { q } : undefined }),
  create: (data: Record<string, unknown>) => api.post<{ data: ApartmentType }>('/apartment-types', data),
  update: (id: string, data: Record<string, unknown>) => api.put<{ data: ApartmentType }>(`/apartment-types/${id}`, data),
  remove: (id: string) => api.delete(`/apartment-types/${id}`),
};
