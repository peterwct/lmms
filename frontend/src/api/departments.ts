import { api } from './client';
import type { Department, Permission, AppModule } from '../types';

export const departmentsApi = {
  list: () => api.get<{ data: Department[] }>('/departments'),

  create: (data: { name: string; description?: string }) =>
    api.post<{ data: Department }>('/departments', data),

  update: (id: number, data: { name?: string; description?: string }) =>
    api.put<{ data: Department }>(`/departments/${id}`, data),

  delete: (id: number) => api.delete(`/departments/${id}`),

  getPermissions: (id: number) =>
    api.get<{ data: Department & { permissions: Permission[] } }>(`/departments/${id}/permissions`),

  updatePermissions: (id: number, perms: Partial<Record<AppModule, Omit<Permission, 'module'>>>) =>
    api.put(`/departments/${id}/permissions`, perms),
};
