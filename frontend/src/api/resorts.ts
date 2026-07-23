import { api } from './client';
import type { ApartmentType, Resort, ResortDetail, ResortInfoCategory, ResortUnit, ResortUnitList } from '../types';

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

export const apartmentTypesApi = {
  list:   (q?: string) => api.get<{ data: ApartmentType[] }>('/apartment-types', { params: q ? { q } : undefined }),
  create: (data: Record<string, unknown>) => api.post<{ data: ApartmentType }>('/apartment-types', data),
  update: (id: string, data: Record<string, unknown>) => api.put<{ data: ApartmentType }>(`/apartment-types/${id}`, data),
  remove: (id: string) => api.delete(`/apartment-types/${id}`),
};
