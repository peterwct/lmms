import { api } from './client';
import type { User } from '../types';

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ user: User }>('/auth/login', { username, password }),

  logout: () => api.post('/auth/logout'),

  me: () => api.get<{ user: User }>('/auth/me'),

  changePassword: (data: { currentPassword?: string; newPassword: string }) =>
    api.post('/auth/change-password', data),
};
