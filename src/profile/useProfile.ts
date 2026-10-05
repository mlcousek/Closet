import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { profileRepository } from './repository';
import type { ProfileInput } from './types';

export const profileQueryKey = ['profile'] as const;

export function useProfile() {
  return useQuery({ queryKey: profileQueryKey, queryFn: () => profileRepository.get() });
}

export function useSaveProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) => profileRepository.save(input),
    onSuccess: (profile) => client.setQueryData(profileQueryKey, profile),
  });
}
