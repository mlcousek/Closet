import { useQuery, useQueryClient } from '@tanstack/react-query';

import { lookbookRepository } from './repository';

const LOOKBOOKS = 'lookbooks';

export function useInvalidateLookbooks() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: [LOOKBOOKS] });
}

export function useLookbooks() {
  return useQuery({ queryKey: [LOOKBOOKS, 'list'], queryFn: () => lookbookRepository.list() });
}

export function useLookbook(id: string | undefined) {
  return useQuery({
    queryKey: [LOOKBOOKS, 'one', id],
    queryFn: () => lookbookRepository.get(id!),
    enabled: !!id,
  });
}

/** Ids of the lookbooks that contain an outfit. */
export function useLookbooksContaining(outfitId: string | undefined) {
  return useQuery({
    queryKey: [LOOKBOOKS, 'containing', outfitId],
    queryFn: () => lookbookRepository.containing(outfitId!),
    enabled: !!outfitId,
  });
}
