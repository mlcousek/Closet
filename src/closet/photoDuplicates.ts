import { imageStore } from '@/storage/imageStore';

import { itemImageDeps } from './deviceImages';
import { itemRepository } from './repository';

/** Lazily fingerprints older photos once. Concurrent workers share the scan. */
export function createPhotoDuplicateFinder(deps: {
  repository: Pick<
    typeof itemRepository,
    'findPhotoDuplicate' | 'unhashedPhotos' | 'recordPhotoHash'
  >;
  fingerprint: (uri: string) => Promise<string>;
  uri: (path: string) => string;
}) {
  let scanning: Promise<void> | null = null;
  return async (hash: string) => {
    const known = await deps.repository.findPhotoDuplicate(hash);
    if (known) return known;
    if (!scanning)
      scanning = (async () => {
        for (const photo of await deps.repository.unhashedPhotos()) {
          // A missing old file must not prevent other photos from being imported.
          const value = await deps.fingerprint(deps.uri(photo.originalPath)).catch(() => null);
          if (value) await deps.repository.recordPhotoHash(photo.id, photo.originalPath, value);
        }
      })().finally(() => {
        scanning = null;
      });
    await scanning;
    return deps.repository.findPhotoDuplicate(hash);
  };
}

export const findPhotoDuplicate = createPhotoDuplicateFinder({
  repository: itemRepository,
  fingerprint: (uri) => itemImageDeps.fingerprint!(uri),
  uri: (path) => imageStore.uri(path),
});
