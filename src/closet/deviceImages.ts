import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import type { TagImage } from '@/ai/tagging';
import { imageStore } from '@/storage/imageStore';

import { removeBackground } from '../../modules/closet-vision';
import { TAG_IMAGE_MAX, type ItemImageDeps, type ResizeFormat } from './itemImages';

type Size = { width: number; height: number };

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

/** The real implementations of the image steps, using the device. */
export const itemImageDeps: ItemImageDeps = {
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
