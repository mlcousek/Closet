import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import type { TagImage } from '@/ai/tagging';
import { imageStore } from '@/storage/imageStore';

import { removeBackground } from '../../modules/closet-vision';
import {
  TAG_IMAGE_MAX,
  fitWithin,
  reducePhoto,
  type ItemImageDeps,
  type OpenImage,
  type ResizeFormat,
} from './itemImages';

// Kept here as well: other parts of the app import it from this file.
export { fitWithin };

type Size = { width: number; height: number };

/** JPEG quality of the reduced photo that becomes an item's original. */
const PHOTO_QUALITY = 0.9;

async function manipulate(
  sourceUri: string,
  resize: { width: number } | { height: number } | null,
  format: ResizeFormat,
): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(sourceUri, resize ? [{ resize }] : [], {
    compress: 0.85,
    format: format === 'png' ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

/**
 * Opens an image so that it is decoded once for both measuring and resizing.
 * The decoded images are held until `close`, which is what frees their memory.
 */
async function openImage(uri: string): Promise<OpenImage> {
  const context = ImageManipulator.ImageManipulator.manipulate(uri);
  const held: { release(): void }[] = [context];
  const close = () => {
    for (const reference of held.splice(0)) reference.release();
  };
  try {
    const full = await context.renderAsync();
    held.push(full);
    return {
      width: full.width,
      height: full.height,
      saveJpeg: async (resize) => {
        let image = full;
        if (resize) {
          image = await context.resize(resize).renderAsync();
          held.push(image);
        }
        const saved = await image.saveAsync({
          compress: PHOTO_QUALITY,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        return { uri: saved.uri, width: saved.width, height: saved.height };
      },
      close,
    };
  } catch (error) {
    close();
    throw error;
  }
}

/** The real implementations of the image steps, using the device. */
export const itemImageDeps: ItemImageDeps = {
  reduce: (photo) => reducePhoto(photo, openImage),
  discard: (uri) => FileSystem.deleteAsync(uri, { idempotent: true }),
  save: (sourceUri, folder, extension) => imageStore.save(sourceUri, folder, extension),
  remove: (path) => imageStore.remove(path),
  resize: (sourceUri, width, format) => manipulate(sourceUri, { width }, format),
  cutout: async (sourceUri) => {
    try {
      return await removeBackground(sourceUri);
    } catch {
      // A failed cutout is never fatal: the original photo is used instead.
      return null;
    }
  },
};

/** A small copy of an image, encoded for the tagging model. */
export async function toTagImage(
  uri: string,
  hasTransparency: boolean,
  size?: Size,
): Promise<TagImage> {
  const format: ResizeFormat = hasTransparency ? 'png' : 'jpeg';
  const small = await manipulate(uri, fitWithin(size, TAG_IMAGE_MAX), format);
  const base64 = await FileSystem.readAsStringAsync(small, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { base64, mediaType: format === 'png' ? 'image/png' : 'image/jpeg' };
}
