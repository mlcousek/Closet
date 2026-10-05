import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { imageStore } from '@/storage/imageStore';

import { detectPeople } from '../../modules/closet-vision';
import { assessAvatar, type AvatarDeps, type AvatarIssue } from './avatar';

export type PickedPhoto = { uri: string; width: number; height: number };

export type PickResult =
  { status: 'picked'; photo: PickedPhoto } | { status: 'cancelled' } | { status: 'denied' };

/** Asks for permission if needed, then lets the user take or choose one photo. */
export async function pickPhoto(source: 'camera' | 'library'): Promise<PickResult> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return { status: 'cancelled' };
  return { status: 'picked', photo: { uri: asset.uri, width: asset.width, height: asset.height } };
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
};
