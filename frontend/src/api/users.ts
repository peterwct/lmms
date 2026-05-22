import { api } from './client';
import type { User, PaginatedResponse } from '../types';

export const usersApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<User>>('/users', { params }),

  get: (id: number) => api.get<{ data: User }>(`/users/${id}`),

  create: (data: Record<string, unknown>) =>
    api.post<{ data: User; tempPassword?: string }>('/users', data),

  update: (id: number, data: Record<string, unknown>) =>
    api.put<{ data: User }>(`/users/${id}`, data),

  toggleSuspend: (id: number) =>
    api.patch<{ data: User }>(`/users/${id}/suspend`),

  resetPassword: (id: number) =>
    api.patch<{ tempPassword: string }>(`/users/${id}/reset-password`),

  clone: (id: number, data: Record<string, unknown>) =>
    api.post<{ data: User; tempPassword: string }>(`/users/${id}/clone`, data),
};
