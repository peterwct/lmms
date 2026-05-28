import { api } from './client';

export const reportsApi = {
  membersReport: (params: { coCode?: string; status?: string; format: 'pdf' | 'excel' }) =>
    api.get('/reports/members', { params, responseType: 'blob' }),
};
