import { api } from './client';
import type { SuReason } from '../types';

export const suReasonsApi = {
  list: () => api.get<{ data: SuReason[] }>('/su-reasons'),
};
