import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { productsApi } from '../api/resorts';

/**
 * Active products, for every product picker in Resorts Setup.
 *
 * `Product` gained an A/U status (2026-08-17) so a company that is no longer an active
 * exchange partner can be retired: a product can rarely be deleted, since deleteProduct
 * refuses while any Agreement / AmcSchedule / Resort / LvcCode carries its coCode.
 * Business rule, matching resorts: every product dropdown offers ACTIVE products only.
 *
 * The query deliberately keeps the shared `['products', '']` key and caches the UNFILTERED
 * response: Products (fn 1) reads the same key with `q=''` and must still show the inactive
 * rows -- that page is where they are managed. Filtering therefore happens here, after the
 * cache -- never inside `queryFn`, which would poison that shared entry.
 *
 * `allProducts` is the unfiltered list. Call sites need both: the filtered one populates
 * the <select>, the full one resolves a stored coCode to a display name, which must keep
 * working for records that reference a now-inactive product.
 *
 * Both arrays are always defined (never undefined), so call sites can pass them straight through.
 */
export function useActiveProducts() {
  const { data, ...rest } = useQuery({
    queryKey: ['products', ''],
    queryFn: () => productsApi.list().then(r => r.data.data),
  });

  const allProducts = data ?? [];
  const products = useMemo(() => allProducts.filter(p => p.status === 'A'), [data]);

  return { products, allProducts, ...rest };
}

/**
 * The option list for a product <select>: the active products, plus `selected` if it names
 * a product that has since been deactivated.
 *
 * Without the second half, opening a record that references a retired product would show an
 * empty control and silently rewrite the stored coCode on save. Pass the hook's `products`
 * and `allProducts` straight through.
 */
export function productOptions<T extends { coCode: string }>(
  products: T[],
  allProducts: T[],
  selected: string | null | undefined,
): T[] {
  if (!selected || products.some(p => p.coCode === selected)) return products;
  const retired = allProducts.find(p => p.coCode === selected);
  return retired ? [...products, retired] : products;
}
