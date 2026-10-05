import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import type { TagImage } from '@/ai/tagging';
import { imageStore } from '@/storage/imageStore';

import { removeBackground } from '../../modules/closet-vision';
import { TAG_IMAGE_MAX, type ItemImageDeps, type ResizeFormat } from './itemImages';

async function resize(sourceUri: string, width: number, format: ResizeFormat): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(sourceUri, [{ resize: { width } }], {
    compress: 0.85,
    format: format === 'png' ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

/** The real implementations of the image steps, using the device. */
export const itemImageDeps: ItemImageDeps = {
  save: (sourceUri, folder, extension) => imageStore.save(sourceUri, folder, extension),
  remove: (path) => imageStore.remove(path),
  resize,
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
export async function toTagImage(uri: string, hasTransparency: boolean): Promise<TagImage> {
  const format: ResizeFormat = hasTransparency ? 'png' : 'jpeg';
  const small = await resize(uri, TAG_IMAGE_MAX, format);
  const base64 = await FileSystem.readAsStringAsync(small, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { base64, mediaType: format === 'png' ? 'image/png' : 'image/jpeg' };
}
