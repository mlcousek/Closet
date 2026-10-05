import { useQuery, useQueryClient } from '@tanstack/react-query';

import { keyManager } from './keys';
import type { ProviderId } from './providers';

export const keyInfoQueryKey = (provider: ProviderId) => ['ai-key', provider] as const;

export function useKeyInfo(provider: ProviderId) {
  return useQuery({
    queryKey: keyInfoQueryKey(provider),
    queryFn: () => keyManager.getInfo(provider),
  });
}

export function useRefreshKeyInfo() {
  const client = useQueryClient();
  return (provider: ProviderId) =>
    client.invalidateQueries({ queryKey: keyInfoQueryKey(provider) });
}
