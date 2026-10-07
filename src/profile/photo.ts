import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { imageStore } from '@/storage/imageStore';

import { detectPeople, personOnWhite } from '../../modules/closet-vision';
import { assessAvatar, type AvatarDeps, type AvatarIssue } from './avatar';

export type PickedPhoto = { uri: string; width: number; height: number };

export type PickResult =
  { status: 'picked'; photo: PickedPhoto } | { status: 'cancelled' } | { status: 'denied' };

/**
 * Lets the user take or choose one photo. Only the camera needs permission:
 * the system photo picker runs outside the app and hands back just the chosen
 * photo, so asking for library access would only add a prompt that can block it.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<PickResult> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
  }

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return { status: 'cancelled' };
  return { status: 'picked', photo: { uri: asset.uri, width: asset.width, height: asset.height } };
}

/** Lets the user choose several photos from the library, in the order they tap them. */
export async function pickPhotos(limit: number): Promise<PickedPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: true,
    orderedSelection: true,
    selectionLimit: limit,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
  }));
}

/**
 * Checks a photo on the device. Returns null when it looks suitable, and also
 * when the check cannot run, because the check only ever warns.
 */
export async function checkAvatarPhoto(uri: string): Promise<AvatarIssue | null> {
  try {
    const boxes = await detectPeople(uri);
    return boxes ? assessAvatar(boxes) : null;
  } catch {
    return null;
  }
}

const KNOWN_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic'];

export function extensionOf(uri: string): string {
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return KNOWN_EXTENSIONS.includes(extension) ? extension : 'jpg';
}

export const avatarDeps: AvatarDeps = {
  save: (sourceUri, folder) => imageStore.save(sourceUri, folder, extensionOf(sourceUri)),
  remove: (path) => imageStore.remove(path),
  resize: async (sourceUri, size) => {
    const result = await ImageManipulator.manipulateAsync(sourceUri, [{ resize: size }], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return result.uri;
  },
  isolate: (sourceUri) => personOnWhite(sourceUri),
};
