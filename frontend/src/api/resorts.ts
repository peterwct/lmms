import { api } from './client';
import type { ApartmentType, AptBlock, AptBlockAvailability, AptBlockList, AvailabilityChart, Resort, ResortDetail, ResortInfoCategory, ResortMaintenance, ResortMaintenanceAvailability, ResortMaintenanceList, ResortUnit, ResortUnitList } from '../types';

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

export const apartmentTypesApi = {
  list:   (q?: string) => api.get<{ data: ApartmentType[] }>('/apartment-types', { params: q ? { q } : undefined }),
  create: (data: Record<string, unknown>) => api.post<{ data: ApartmentType }>('/apartment-types', data),
  update: (id: string, data: Record<string, unknown>) => api.put<{ data: ApartmentType }>(`/apartment-types/${id}`, data),
  remove: (id: string) => api.delete(`/apartment-types/${id}`),
};
