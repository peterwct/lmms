import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { resortsApi } from '../api/resorts';
import type { Resort } from '../types';

/**
 * RCI-affiliated ACTIVE resorts, for the RCI Enrolment resort picker (RCI fn 1).
 *
 * Narrower than useActiveResorts: an enrolment may only name a resort LHB holds an RCI
 * affiliation for, so the filter is `rciAffiliate === 'Y'` AND `status === 'A'`. On the
 * 2026-09-08 data that is 5 of the 16 affiliated resorts (CP-PBR, L-10016, L-10024,
 * L-10026, L-101) -- re-check that rather than quoting it, exactly as the Resort note in
 * CLAUDE.md warns for the active count.
 *
 * Same request and the same shared `['resorts', '']` key as useActiveResorts, so the two
 * hooks read ONE cache entry and a page calling both still fetches resorts once. The
 * UNFILTERED response is what gets cached and the narrowing happens here in a useMemo --
 * never inside `queryFn`, which would poison the entry for every other consumer (see
 * "One query key, one shape" in CLAUDE.md).
 *
 * `allResorts` is the escape hatch. 12,961 of the 17,915 migrated enrolments name L-10013,
 * which IS rciAffiliate='Y' but is INACTIVE, so editing one of those rows must still
 * resolve and display its stored code. Pass both arrays to resortOptions().
 *
 * Both arrays are always defined (never undefined), so call sites can pass them straight through.
 */
export function useRciResorts() {
  const { data, ...rest } = useQuery({
    queryKey: ['resorts', ''],
    queryFn: () => resortsApi.list().then(r => r.data.data),
  });

  const allResorts = data ?? [];
  const resorts = useMemo(
    () => allResorts.filter(r => r.status === 'A' && r.rciAffiliate === 'Y'),
    [data],
  );

  return { resorts, allResorts, ...rest };
}

export interface ResortOption { resortCode: string; label: string }

/**
 * The option list for a resort <select>: the offerable resorts, plus `selected` when it
 * names something not among them.
 *
 * Mirrors productOptions() with ONE critical difference. `Product.coCode` always resolves to
 * a Product, so productOptions can safely return the base list unchanged when it fails to
 * find the stored value. `RciEnrolment.resortCode` is FREE TEXT with no FK -- the Informix
 * source carries `1704`, `L.COVE` and `LCS` alongside the real codes -- so a stored value
 * may match nothing in allResorts, and returning the base list would blank the control and
 * SILENTLY REWRITE the stored code on save. A synthetic option is therefore appended so the
 * raw string round-trips untouched.
 */
export function resortOptions(
  resorts: Resort[],
  allResorts: Resort[],
  selected: string | null | undefined,
): ResortOption[] {
  const opts = resorts.map(r => ({
    resortCode: r.resortCode,
    label: `${r.resortCode} — ${r.shortName || r.resortName}`,
  }));
  if (!selected || opts.some(o => o.resortCode === selected)) return opts;

  const known = allResorts.find(r => r.resortCode === selected);
  return [...opts, {
    resortCode: selected,
    label: known
      ? `${known.resortCode} — ${known.shortName || known.resortName}`
      : `${selected} — (not a registered resort)`,
  }];
}
