import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { useProfile } from '@/profile/useProfile';

import { avatarBasePath, currentFingerprint, useRenderVersion } from './renderActions';
import { outfitRepository, type Outfit, type OutfitFilter } from './repository';
import { renderRepository, summariseRenders, type Render } from './renders';

const OUTFITS = 'outfits';

export function invalidateOutfits(client: QueryClient) {
  return client.invalidateQueries({ queryKey: [OUTFITS] });
}

export function useInvalidateOutfits() {
  const client = useQueryClient();
  return () => invalidateOutfits(client);
}

export function useOutfits(filter: OutfitFilter = {}) {
  return useQuery({
    queryKey: [OUTFITS, 'list', filter],
    queryFn: () => outfitRepository.list(filter),
    placeholderData: keepPreviousData,
  });
}

export function useOutfit(id: string | undefined) {
  return useQuery({
    queryKey: [OUTFITS, 'one', id],
    queryFn: () => outfitRepository.get(id!),
    enabled: !!id,
  });
}

/** All renders grouped by outfit, refreshed whenever the render queue reports a change. */
export function useRendersByOutfit() {
  const version = useRenderVersion((state) => state.version);
  return useQuery({
    queryKey: ['renders', version],
    queryFn: async () => {
      const byOutfit = new Map<string, Render[]>();
      for (const render of await renderRepository.all()) {
        byOutfit.set(render.outfitId, [...(byOutfit.get(render.outfitId) ?? []), render]);
      }
      return byOutfit;
    },
    placeholderData: keepPreviousData,
  });
}

/** What to show for an outfit: its render state judged against the current avatar and pieces. */
export function useRenderSummary() {
  const { data: profile } = useProfile();
  const { data: byOutfit } = useRendersByOutfit();
  const basePath = avatarBasePath(profile ?? null);
  return (outfit: Outfit) =>
    summariseRenders(byOutfit?.get(outfit.id) ?? [], currentFingerprint(outfit, basePath));
}
