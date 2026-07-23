import { api } from './client';
import type { Resort, ResortDetail, ResortInfoCategory } from '../types';

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
