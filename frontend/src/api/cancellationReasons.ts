import { api } from './client';
import type { CancellationReason } from '../types';

export const cancellationReasonsApi = {
  list: () => api.get<{ data: CancellationReason[] }>('/cancellation-reasons'),
};
