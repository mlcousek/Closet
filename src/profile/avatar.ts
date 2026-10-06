import type { PersonBox } from '../../modules/closet-vision';

/** Longest side of the copy that is sent to the image provider. */
export const AVATAR_SMALL_MAX = 1024;

export type AvatarIssue = 'noPerson' | 'severalPeople' | 'cutOff' | 'tooSmall';

/** Detections below this confidence are ignored as noise. */
const MIN_CONFIDENCE = 0.5;
/** A box closer than this to the top or bottom edge suggests the body is cut off. */
const EDGE_MARGIN = 0.01;
/** A person shorter than this share of the image height is too far away. */
const MIN_HEIGHT = 0.4;

/**
 * Judges whether a photo suits being the avatar: exactly one person, fully in
 * frame, large enough. Returns null when the photo looks fine.
 */
export function assessAvatar(boxes: PersonBox[]): AvatarIssue | null {
  const people = boxes.filter((box) => box.confidence >= MIN_CONFIDENCE);
  if (people.length === 0) return 'noPerson';
  if (people.length > 1) return 'severalPeople';
  const [person] = people;
  if (person.y <= EDGE_MARGIN || person.y + person.height >= 1 - EDGE_MARGIN) return 'cutOff';
  if (person.height < MIN_HEIGHT) return 'tooSmall';
  return null;
}

/** Target size for the downscaled copy, keeping the aspect ratio and never enlarging. */
export function smallSize(width: number, height: number, max = AVATAR_SMALL_MAX) {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export type AvatarDeps = {
  /** Copies an image into the store and returns its relative path. */
  save(sourceUri: string, folder: string, extension?: string): Promise<string>;
  remove(path: string): Promise<void>;
  /** Writes a resized JPEG copy and returns its temporary URI. */
  resize(sourceUri: string, size: { width: number; height: number }): Promise<string>;
};

export type StoredAvatar = { avatarPath: string; avatarSmallPath: string };

/** Stores a photo as the avatar: the original plus a downscaled copy. */
export async function storeAvatar(
  photo: { uri: string; width: number; height: number },
  deps: AvatarDeps,
): Promise<StoredAvatar> {
  const avatarPath = await deps.save(photo.uri, 'avatar');
  try {
    const smallUri = await deps.resize(photo.uri, smallSize(photo.width, photo.height));
    const avatarSmallPath = await deps.save(smallUri, 'avatar');
    return { avatarPath, avatarSmallPath };
  } catch (error) {
    // The reason the photo could not be stored is what matters, not a failed clean-up.
    await deps.remove(avatarPath).catch(() => {});
    throw error;
  }
}

/**
 * Stores a photo as the avatar and records it with `persist`. If recording
 * fails the new files are deleted again, so a failed save leaves nothing behind.
 */
export async function storeAvatarAnd<T>(
  photo: { uri: string; width: number; height: number },
  deps: AvatarDeps,
  persist: (stored: StoredAvatar) => Promise<T>,
): Promise<T> {
  const stored = await storeAvatar(photo, deps);
  try {
    return await persist(stored);
  } catch (error) {
    await discardAvatar(stored, deps).catch(() => {});
    throw error;
  }
}

/** Deletes the files of an avatar that is being replaced or removed. */
export async function discardAvatar(
  avatar: { avatarPath: string | null; avatarSmallPath: string | null },
  deps: Pick<AvatarDeps, 'remove'>,
): Promise<void> {
  for (const path of [avatar.avatarPath, avatar.avatarSmallPath]) {
    if (path) await deps.remove(path);
  }
}
