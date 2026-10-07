import type { ItemImages } from './types';

export const THUMB_WIDTH = 300;
/** Longest side of the image sent to the tagging model. */
export const TAG_IMAGE_MAX = 768;

/**
 * Longest side of a clothing photo the app keeps. Nothing shown or sent is
 * larger, and a full camera photo costs far more memory to cut out.
 */
export const PHOTO_MAX = 2400;

export type ResizeFormat = 'png' | 'jpeg';

type Size = { width: number; height: number };

/** A photo on its way into the app. The size is missing when nothing reported it. */
export type Photo = { uri: string; width?: number; height?: number };

/** The size of a photo when it is known. */
export function photoSize(photo: Photo): Size | undefined {
  return photo.width && photo.height ? { width: photo.width, height: photo.height } : undefined;
}

/**
 * The resize to apply so the longest side is at most `max`, never enlarging.
 * Without a known size the width is capped, which is right for all but very
 * tall images.
 */
export function fitWithin(
  size: Size | undefined,
  max: number,
): { width: number } | { height: number } | null {
  if (!size) return { width: max };
  if (Math.max(size.width, size.height) <= max) return null;
  return size.width >= size.height ? { width: max } : { height: max };
}

/** An image opened for measuring and re-encoding. */
export type OpenImage = Size & {
  /** Writes a JPEG copy to a temporary file, resized when a resize is given. */
  saveJpeg(resize: { width: number } | { height: number } | null): Promise<Required<Photo>>;
  /** Frees the decoded image. */
  close(): void;
};

/** Formats the rest of the app handles as they are, so a small photo in one of them is left alone. */
const KEPT_AS_IS = ['jpg', 'jpeg', 'png'];

/**
 * Reduces a clothing photo to at most PHOTO_MAX on its longest side, as a
 * JPEG. A photo within the limit is returned as it is when it is a JPEG or a
 * PNG; any other format (HEIC, WebP) is converted. This step must never stop
 * a photo from being added: when it fails, the photo is used as it came.
 */
export async function reducePhoto(
  photo: Photo,
  open: (uri: string) => Promise<OpenImage>,
): Promise<Photo> {
  const extension = photo.uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const keepable = KEPT_AS_IS.includes(extension);
  const known = photoSize(photo);
  // The common case for small photos: nothing to do, so the photo is not even opened.
  if (keepable && known && fitWithin(known, PHOTO_MAX) === null) return photo;
  try {
    const image = await open(photo.uri);
    try {
      const resize = fitWithin(image, PHOTO_MAX);
      if (!resize && keepable) return { uri: photo.uri, width: image.width, height: image.height };
      return await image.saveJpeg(resize);
    } finally {
      image.close();
    }
  } catch {
    return photo;
  }
}

export type ItemImageDeps = {
  /**
   * The photo reduced to what the app keeps (see reducePhoto), in a temporary
   * file when a copy had to be made. Never fails: the photo itself is the fallback.
   */
  reduce(photo: Photo): Promise<Photo>;
  /** Deletes a temporary file made by `reduce`. */
  discard(uri: string): Promise<void>;
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
