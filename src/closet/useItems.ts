import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

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
  });
}

export function useItem(id: string | undefined) {
  return useQuery({
    queryKey: [ITEMS, 'one', id],
    queryFn: () => itemRepository.get(id!),
    enabled: !!id,
  });
}

export function useItemCount(filter: ItemFilter) {
  return useQuery({
    queryKey: [ITEMS, 'count', filter],
    queryFn: () => itemRepository.count(filter),
  });
}

export function useBrands() {
  return useQuery({ queryKey: [ITEMS, 'brands'], queryFn: () => itemRepository.brands() });
}
