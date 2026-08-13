import { api } from './client';
import type { ApartmentType, AptBlock, AptBlockAvailability, AptBlockList, AvailabilityChart, CpSeasonCloneResult, CpSeasonMonth, CpSeasonMonthDeleteResult, CpSeasonMonthSaveResult, LvcCode, PointsType, SeasonPointDeleteResult, SeasonPointSaveResult, SeasonPointVersion, SeasonPointVersionSummary, Product, Holiday, HolidayCloneResult, HolidayType, Resort, ResortDetail, ResortInfoCategory, ResortMaintenance, ResortMaintenanceAvailability, ResortMaintenanceList, ResortUnit, ResortUnitList } from '../types';

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

// One client for both kinds — `type` selects public holidays or school holidays
export const holidaysApi = {
  list: (params: { type: HolidayType; q?: string; year?: number }) =>
    api.get<{ data: Holiday[] }>('/holidays', { params }),
  years:  (type: HolidayType) => api.get<{ data: number[] }>('/holidays/years', { params: { type } }),
  create: (data: Record<string, unknown>) => api.post<{ data: Holiday }>('/holidays', data),
  update: (id: string, data: Record<string, unknown>) => api.put<{ data: Holiday }>(`/holidays/${id}`, data),
  remove: (id: string) => api.delete(`/holidays/${id}`),
  // Copies a year's holidays to sourceYear + 1 on the same month/day (both ends of a range)
  clone: (data: { holidayType: HolidayType; sourceYear: number }) =>
    api.post<{ data: HolidayCloneResult }>('/holidays/clone', data),
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

// No effectiveDate per row — one date per version, on the envelope
export type SeasonPointRowInput = {
  apartmentType: string;
  season: string;
  ptsSun: number; ptsMon: number; ptsTue: number; ptsWed: number;
  ptsThu: number; ptsFri: number; ptsSat: number;
};

// One client for both charts — `type` selects HOME (own-product resorts) or AWAY
// (exchange resorts). lvcCoCode, the product charged, is AWAY-only.
export const seasonPointsApi = {
  // One VERSION at a time — no pagination. Omit effectiveDate for the one in force today.
  version: (params: { type: PointsType; resortCode: string; effectiveDate?: string }) =>
    api.get<SeasonPointVersion>('/season-points', { params }),
  versions: (params: { resortCode: string }) =>
    api.get<{ data: SeasonPointVersionSummary[] }>('/season-points/versions', { params }),
  // `replaces` is the version's stored date when editing, so the date can be corrected
  // in place; omit it when creating. Save is replace-all within the version.
  saveVersion: (data: {
    pointsType: PointsType; resortCode: string; effectiveDate: string;
    replaces?: string; lvcCoCode?: string; rows: SeasonPointRowInput[];
  }) => api.post<{ data: SeasonPointSaveResult }>('/season-points/version', data),
  deleteVersion: (params: { type: PointsType; resortCode: string; effectiveDate: string }) =>
    api.delete<{ data: SeasonPointDeleteResult }>('/season-points/version', { params }),
};

export const apartmentTypesApi = {
  list:   (q?: string) => api.get<{ data: ApartmentType[] }>('/apartment-types', { params: q ? { q } : undefined }),
  create: (data: Record<string, unknown>) => api.post<{ data: ApartmentType }>('/apartment-types', data),
  update: (id: string, data: Record<string, unknown>) => api.put<{ data: ApartmentType }>(`/apartment-types/${id}`, data),
  remove: (id: string) => api.delete(`/apartment-types/${id}`),
};
