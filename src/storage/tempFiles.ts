import * as FileSystem from 'expo-file-system/legacy';

/**
 * Working files the app leaves in the cache folder: background cutouts,
 * resized copies, downloaded product photos, generated pictures on their way
 * into the image store, and backup archives that were shared.
 */
const PREFIXES = ['cutout-', 'generated-', 'link-import-', 'closet-backup-'];
/** Folders that hold nothing but working files. */
const FOLDERS = ['ImageManipulator'];
/** Younger files may still be in use by something that is running. */
const KEEP_MS = 60 * 60 * 1000;

export type TempFileDeps = {
  list(dir: string): Promise<string[]>;
  /** When the entry was last changed, in milliseconds, or null if it is gone. */
  modifiedAt(path: string): Promise<number | null>;
  remove(path: string): Promise<void>;
};

const cache = () => FileSystem.cacheDirectory ?? '';

const deviceDeps: TempFileDeps = {
  list: async (dir) => {
    const info = await FileSystem.getInfoAsync(cache() + dir);
    return info.exists ? FileSystem.readDirectoryAsync(cache() + dir) : [];
  },
  modifiedAt: async (path) => {
    const info = await FileSystem.getInfoAsync(cache() + path);
    // The legacy API reports seconds.
    return info.exists ? info.modificationTime * 1000 : null;
  },
  remove: (path) => FileSystem.deleteAsync(cache() + path, { idempotent: true }),
};

/**
 * Deletes the app's own working files that are older than an hour. iOS clears
 * the cache folder only when the phone runs short of space, and until then
 * these files would count towards the app's size. Returns how many were removed.
 */
export async function cleanTemporaryFiles(
  deps: TempFileDeps = deviceDeps,
  now: () => number = Date.now,
): Promise<number> {
  let removed = 0;
  const sweep = async (dir: string, matches: (name: string) => boolean) => {
    for (const name of await deps.list(dir)) {
      if (!matches(name)) continue;
      const path = dir ? `${dir}/${name}` : name;
      try {
        const changed = await deps.modifiedAt(path);
        if (changed === null || now() - changed < KEEP_MS) continue;
        await deps.remove(path);
        removed++;
      } catch {
        // One file that cannot be removed must not stop the rest.
      }
    }
  };
  await sweep('', (name) => PREFIXES.some((prefix) => name.startsWith(prefix)));
  for (const folder of FOLDERS) await sweep(folder, () => true);
  return removed;
}
