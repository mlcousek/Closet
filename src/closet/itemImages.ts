import type { ItemImages } from './types';

export const THUMB_WIDTH = 300;
/** Longest side of the image sent to the tagging model. */
export const TAG_IMAGE_MAX = 768;

export type ResizeFormat = 'png' | 'jpeg';

export type ItemImageDeps = {
  /** Copies an image into the store and returns its relative path. */
  save(sourceUri: string, folder: string, extension: string): Promise<string>;
  remove(path: string): Promise<void>;
  /** Writes a resized copy to a temporary file and returns its URI. */
  resize(sourceUri: string, width: number, format: ResizeFormat): Promise<string>;
  /** Isolates the subject on a transparent background, or null when that is not possible. */
  cutout(sourceUri: string): Promise<{ uri: string; width: number; height: number } | null>;
};

const EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp'];

export function extensionOf(uri: string): string {
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return EXTENSIONS.includes(extension) ? extension : 'jpg';
}

/**
 * Stores the images of an item: the original photo, the cutout when the user
 * kept one, and a thumbnail of whichever is shown. If any step fails, the
 * files already written are removed again.
 */
export async function storeItemImages(
  photo: { originalUri: string; cutoutUri: string | null },
  deps: ItemImageDeps,
): Promise<ItemImages> {
  const written: string[] = [];
  const save = async (uri: string, extension: string) => {
    const path = await deps.save(uri, 'items', extension);
    written.push(path);
    return path;
  };
  try {
    const originalPath = await save(photo.originalUri, extensionOf(photo.originalUri));
    const cutoutPath = photo.cutoutUri ? await save(photo.cutoutUri, 'png') : null;
    // A cutout has transparency, which JPEG would turn black.
    const format: ResizeFormat = photo.cutoutUri ? 'png' : 'jpeg';
    const thumbUri = await deps.resize(photo.cutoutUri ?? photo.originalUri, THUMB_WIDTH, format);
    const thumbPath = await save(thumbUri, format === 'png' ? 'png' : 'jpg');
    return { originalPath, cutoutPath, thumbPath };
  } catch (error) {
    for (const path of written) await deps.remove(path).catch(() => {});
    throw error;
  }
}

export async function removeItemImages(
  images: ItemImages,
  deps: Pick<ItemImageDeps, 'remove'>,
): Promise<void> {
  for (const path of [images.originalPath, images.cutoutPath, images.thumbPath]) {
    if (path) await deps.remove(path).catch(() => {});
  }
}
