import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';
import { create } from 'zustand';

import { keyManager } from '@/ai/keys';
import {
  TryOnError,
  encodeWithinBudget,
  geminiProvider,
  type EncodedImage,
  type TryOnHints,
  type TryOnPiece,
  type TryOnProvider,
} from '@/ai/tryOn';
import { fitWithin } from '@/closet/deviceImages';
import type { Slot } from '@/closet/taxonomy';
import { displayPath } from '@/closet/types';
import { newId } from '@/db/id';
import { getSetting, setSetting } from '@/db/settings';
import { profileRepository } from '@/profile/repository';
import type { Profile } from '@/profile/types';
import { imageStore } from '@/storage/imageStore';

import { outfitRepository, type Outfit } from './repository';
import {
  RenderFailedError,
  RenderSupersededError,
  createRenderQueue,
  type RenderResult,
} from './renderQueue';
import { fingerprint, renderRepository, usageLog, type Render } from './renders';

const AUTO_RENDER_SETTING = 'tryon.auto';
const DISCLOSED_SETTING = 'tryon.disclosed';

/** Longest side of the images sent to the provider. */
const INPUT_MAX = 1024;
const RENDER_THUMB_WIDTH = 400;

/** Whether saving an outfit asks for a render by itself. On unless the user turned it off. */
export const isAutoRenderOn = () => getSetting(AUTO_RENDER_SETTING) !== 'off';
export const setAutoRender = (on: boolean) => setSetting(AUTO_RENDER_SETTING, on ? null : 'off');

/** Whether the user has confirmed that their photo and item images go to the image provider. */
export const isDisclosed = () => getSetting(DISCLOSED_SETTING) === 'yes';
export const setDisclosed = () => setSetting(DISCLOSED_SETTING, 'yes');

const STUDIO_CANDIDATE_SETTING = 'avatar.studioCandidate';
/** A studio avatar that was made and paid for but not yet accepted or rejected. */
export const getStudioCandidate = () => getSetting(STUDIO_CANDIDATE_SETTING);
export const setStudioCandidate = (path: string | null) =>
  setSetting(STUDIO_CANDIDATE_SETTING, path);

/** The image renders are based on: the accepted studio avatar, otherwise the downscaled photo. */
export function avatarBasePath(
  profile: Pick<Profile, 'avatarStudioPath' | 'avatarSmallPath'> | null,
): string | null {
  return profile?.avatarStudioPath ?? profile?.avatarSmallPath ?? null;
}

/**
 * What identifies each piece for a render: the item and the picture of it that
 * is sent. Replacing an item's photo therefore drops the renders made with it.
 */
export function outfitItemIds(outfit: Pick<Outfit, 'entries'>): string[] {
  return outfit.entries.map((entry) => `${entry.item.id}@${displayPath(entry.item)}`);
}

/** Stands in for the avatar in a fingerprint when there is no photo of the user. */
const NO_AVATAR = 'none';

/** The fingerprint a render of this outfit made right now would have. */
export function currentFingerprint(outfit: Pick<Outfit, 'entries'>, basePath: string | null) {
  return fingerprint(basePath ?? NO_AVATAR, outfitItemIds(outfit));
}

export const SLOT_LABEL: Record<Slot, string> = {
  outer: 'outer layer, worn over the other pieces',
  top: 'top',
  bottom: 'bottom',
  fullBody: 'full-body piece',
  shoes: 'shoes',
  bag: 'bag, carried or worn',
  accessory: 'accessory',
};

/** A plain-English description of an item for the image model. */
export function describeItem(item: Outfit['entries'][number]['item']): string {
  const words = [...item.colours, item.subcategory ?? item.category];
  return item.name ? `${item.name}; ${words.join(' ')}` : words.join(' ');
}

async function encode(path: string, format: 'png' | 'jpeg', max: number): Promise<EncodedImage> {
  const uri = imageStore.uri(path);
  const size = await new Promise<{ width: number; height: number } | undefined>((resolve) =>
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(undefined),
    ),
  );
  const resize = fitWithin(size, max);
  const resized = await ImageManipulator.manipulateAsync(uri, resize ? [{ resize }] : [], {
    compress: 0.9,
    format: format === 'png' ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
  });
  const base64 = await FileSystem.readAsStringAsync(resized.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  // The resized copy was only needed to be read.
  if (resized.uri !== uri) {
    await FileSystem.deleteAsync(resized.uri, { idempotent: true }).catch(() => {});
  }
  return { base64, mimeType: format === 'png' ? 'image/png' : 'image/jpeg' };
}

/** Writes a generated image into the image store, with a thumbnail. */
async function store(image: EncodedImage, folder: string) {
  const extension = image.mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const temp = `${FileSystem.cacheDirectory}generated-${newId()}.${extension}`;
  await FileSystem.writeAsStringAsync(temp, image.base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const imagePath = await imageStore.save(temp, folder, extension);
  try {
    const thumb = await ImageManipulator.manipulateAsync(
      temp,
      [{ resize: { width: RENDER_THUMB_WIDTH } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
    );
    return { imagePath, thumbPath: await imageStore.save(thumb.uri, folder, 'jpg') };
  } catch {
    // The image has been paid for; without a thumbnail the full image is shown in its place.
    return { imagePath, thumbPath: imagePath };
  }
}

const hintsOf = (profile: Profile): TryOnHints => ({
  gender: profile.gender === 'woman' ? 'woman' : profile.gender === 'man' ? 'man' : null,
  bodyType: profile.bodyType,
});

const toFailure = (error: unknown) =>
  new RenderFailedError(error instanceof TryOnError ? error.reason : 'error');

/** Produces the image for one queued render with the user's image provider key. */
export async function runRender(
  render: Render,
  provider: TryOnProvider = geminiProvider,
): Promise<RenderResult> {
  const [outfit, profile, key] = await Promise.all([
    outfitRepository.get(render.outfitId),
    profileRepository.get(),
    keyManager.getKey('image'),
  ]);
  const basePath = avatarBasePath(profile);
  if (!profile || !basePath) throw new RenderFailedError('noAvatar');
  if (!key) throw new RenderFailedError('noKey');
  if (!outfit || outfit.entries.length === 0) throw new RenderFailedError('error');
  if (currentFingerprint(outfit, basePath) !== render.fingerprint)
    throw new RenderSupersededError();
  try {
    const images = await encodeWithinBudget(outfit.entries, (entry, max) =>
      encode(displayPath(entry.item), entry.item.cutoutPath ? 'png' : 'jpeg', max),
    );
    const pieces: TryOnPiece[] = outfit.entries.map((entry, index) => ({
      slotLabel: SLOT_LABEL[entry.slot],
      description: describeItem(entry.item),
      image: images[index],
    }));
    const avatar = await encode(basePath, 'jpeg', INPUT_MAX);
    const image = await provider.render({ avatar, pieces, hints: hintsOf(profile) }, key);
    // Counted once the provider has answered with an image, which is when it is charged.
    await usageLog.record('render');
    // The picture is paid for by now, so one failed write must not throw it away.
    const stored = await store(image, 'renders').catch(() => store(image, 'renders'));
    return { ...stored, provider: provider.id };
  } catch (error) {
    if (error instanceof RenderSupersededError) throw error;
    throw toFailure(error);
  }
}

/** Bumped whenever a render changes state, so screens showing renders refresh. */
export const useRenderVersion = create<{ version: number }>(() => ({ version: 0 }));

export const renderQueue = createRenderQueue({
  renders: renderRepository,
  run: (render) => runRender(render),
  onChange: () => useRenderVersion.setState((state) => ({ version: state.version + 1 })),
});

/** Longest side of a picture the user made elsewhere and added by hand. */
const MANUAL_MAX = 1600;

/**
 * Stores a picture the user made in another app as the outfit's current
 * render. Nothing is sent anywhere and nothing is counted as paid usage.
 */
export async function saveManualRender(
  outfit: Outfit,
  photo: { uri: string; width: number; height: number },
): Promise<void> {
  const profile = await profileRepository.get();
  const resize = fitWithin(photo, MANUAL_MAX);
  const full = await ImageManipulator.manipulateAsync(photo.uri, resize ? [{ resize }] : [], {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const imagePath = await imageStore.save(full.uri, 'renders', 'jpg');
  let thumbPath = imagePath;
  try {
    const thumb = await ImageManipulator.manipulateAsync(
      full.uri,
      [{ resize: { width: RENDER_THUMB_WIDTH } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
    );
    thumbPath = await imageStore.save(thumb.uri, 'renders', 'jpg');
  } catch {
    // Without a thumbnail the full picture is shown in its place.
  }
  await renderRepository.createDone(
    outfit.id,
    currentFingerprint(outfit, avatarBasePath(profile)),
    { imagePath, thumbPath, provider: 'manual' },
  );
  useRenderVersion.setState((state) => ({ version: state.version + 1 }));
}

/** Asks for a render of an outfit against the current avatar. `force` makes a fresh one (regenerate). */
export async function requestRender(outfit: Outfit, force = false) {
  const profile = await profileRepository.get();
  return renderQueue.request(
    { id: outfit.id, itemIds: outfitItemIds(outfit) },
    avatarBasePath(profile),
    force,
  );
}

/**
 * Creates a studio version of the avatar and returns its stored path without
 * making it the base yet: the user looks at it first and accepts or rejects it.
 */
export async function createStudioAvatar(
  provider: TryOnProvider = geminiProvider,
): Promise<string> {
  const [profile, key] = await Promise.all([profileRepository.get(), keyManager.getKey('image')]);
  if (!profile?.avatarSmallPath) throw new TryOnError('error');
  if (!key) throw new TryOnError('noKey');
  const avatar = await encode(profile.avatarSmallPath, 'jpeg', INPUT_MAX);
  const image = await provider.studioAvatar(avatar, hintsOf(profile), key);
  await usageLog.record('studio');
  return (await store(image, 'avatar')).imagePath;
}
