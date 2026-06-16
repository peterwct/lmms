import { api } from './client';
import type { Member, Agreement, PaginatedResponse } from '../types';

export const membersApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Member>>('/members', { params }),

  enquiry: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Agreement>>('/members/enquiry', { params }),

  get: (id: string) => api.get<{ data: Member }>(`/members/${id}`),

  create: (data: Record<string, unknown>) =>
    api.post<{ data: Member }>('/members', data),

  update: (id: string, data: Record<string, unknown>) =>
    api.put<{ data: Member }>(`/members/${id}`, data),

  changeStatus: (id: string, status: string) =>
    api.patch<{ data: Member }>(`/members/${id}/status`, { status }),

  agreements: (id: string) =>
    api.get<{ data: Agreement[] }>(`/members/${id}/agreements`),
};
