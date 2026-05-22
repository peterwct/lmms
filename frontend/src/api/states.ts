import { api } from './client';
import type { State } from '../types';

export const statesApi = {
  list: () => api.get<{ data: State[] }>('/states'),
};
