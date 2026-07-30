import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { resortsApi } from '../api/resorts';

/**
 * Active resorts, for every resort picker and resort filter in Resorts Setup.
 *
 * The unfiltered `resort_mast` re-import (2026-07-30) took `Resort` from 7 to 324 rows,
 * 275 of them Inactive — retired own-product resorts plus the partner/LVC `V-*` exchange
 * resorts. Business rule (2026-07-30): every resort dropdown lists ACTIVE resorts only.
 *
 * The query deliberately keeps the shared `['resorts', '']` key and caches the UNFILTERED
 * response: ResortMaster (fn 2) reads the same key with `q=''` and must still show all 324.
 * Filtering therefore happens here, after the cache — never inside `queryFn`, which would
 * poison that shared entry.
 *
 * Always returns an array (never undefined), so call sites can pass it straight through.
 */
export function useActiveResorts() {
  const { data, ...rest } = useQuery({
    queryKey: ['resorts', ''],
    queryFn: () => resortsApi.list().then(r => r.data.data),
  });

  const resorts = useMemo(() => (data ?? []).filter(r => r.status === 'A'), [data]);

  return { resorts, ...rest };
}
