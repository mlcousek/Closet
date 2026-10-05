import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { itemRepository } from './repository';
import type { ItemFilter } from './types';

const ITEMS = 'items';

export function invalidateItems(client: QueryClient) {
  return client.invalidateQueries({ queryKey: [ITEMS] });
}

export function useInvalidateItems() {
  const client = useQueryClient();
  return () => invalidateItems(client);
}

export function useItems(filter: ItemFilter) {
  return useQuery({
    queryKey: [ITEMS, 'list', filter],
    queryFn: () => itemRepository.list(filter),
    // Keeps the current grid on screen while a changed filter loads, instead of flashing empty.
    placeholderData: keepPreviousData,
  });
}

export function useItem(id: string | undefined) {
  return useQuery({
    queryKey: [ITEMS, 'one', id],
    queryFn: () => itemRepository.get(id!),
    enabled: !!id,
  });
}

/** Items by id, whatever their ownership, in the order asked for. Unknown ids are left out. */
export function useItemsById(ids: string[]) {
  return useQuery({
    queryKey: [ITEMS, 'byId', ids],
    queryFn: async () =>
      (await Promise.all(ids.map((id) => itemRepository.get(id)))).filter((item) => item !== null),
    enabled: ids.length > 0,
  });
}

export function useItemCount(filter: ItemFilter) {
  return useQuery({
    queryKey: [ITEMS, 'count', filter],
    queryFn: () => itemRepository.count(filter),
    placeholderData: keepPreviousData,
  });
}

export function useWishlistTotals() {
  return useQuery({
    queryKey: [ITEMS, 'wishlist-totals'],
    queryFn: () => itemRepository.wishlistTotals(),
  });
}

export function useBrands() {
  return useQuery({ queryKey: [ITEMS, 'brands'], queryFn: () => itemRepository.brands() });
}
