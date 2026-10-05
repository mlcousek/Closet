import { newId } from '@/db/id';

import { expoFs, type FsAdapter } from './fs';

export const IMAGES_DIR = 'images';

const SAFE_SEGMENT = /^[a-z0-9-]+$/;

/**
 * Stores images under the document directory and hands out relative paths.
 * Relative paths go in the database because the absolute document directory
 * changes between installs.
 */
export function createImageStore(fs: FsAdapter = expoFs, makeId: () => string = newId) {
  return {
    /** Copies an image into the store and returns its relative path. */
    async save(sourceUri: string, folder: string, extension = 'jpg'): Promise<string> {
      if (!SAFE_SEGMENT.test(folder) || !SAFE_SEGMENT.test(extension)) {
        throw new Error(`Invalid image location: ${folder}.${extension}`);
      }
      const path = `${IMAGES_DIR}/${folder}/${makeId()}.${extension}`;
      await fs.copyIn(sourceUri, path);
      return path;
    },
    /** Absolute URI for displaying a stored image. */
    uri(path: string): string {
      return fs.uri(path);
    },
    async remove(path: string): Promise<void> {
      if (!path.startsWith(`${IMAGES_DIR}/`) || path.includes('..')) {
        throw new Error(`Refusing to delete outside the image store: ${path}`);
      }
      await fs.remove(path);
    },
    exists(path: string): Promise<boolean> {
      return fs.exists(path);
    },
  };
}

export const imageStore = createImageStore();
