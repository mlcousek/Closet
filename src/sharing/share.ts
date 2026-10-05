import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

export const SHARE_FORMATS = ['portrait', 'story', 'square'] as const;
export type ShareFormat = (typeof SHARE_FORMATS)[number];

/** Width divided by height of each format. */
export const FORMAT_RATIO: Record<ShareFormat, number> = {
  portrait: 4 / 5,
  story: 9 / 16,
  square: 1,
};

/** Pixel width of exported images. */
export const EXPORT_WIDTH = 1080;

export type ShareContent = 'render' | 'collage';

/** Which pictures of an outfit can be shared: the try-on render only when one exists. */
export function availableContents(hasRender: boolean): ShareContent[] {
  return hasRender ? ['render', 'collage'] : ['collage'];
}

/** Outfits per contact-sheet image when sharing a lookbook. */
export const SHEET_SIZE = 12;

/** Splits a lookbook's outfits into the images needed to show them all. */
export function sheetPages<T>(outfits: T[], size = SHEET_SIZE): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < outfits.length; index += size) {
    pages.push(outfits.slice(index, index + size));
  }
  return pages;
}

/** Columns that keep a contact sheet close to the shape of a portrait image. */
export function sheetColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  return 3;
}

/** Turns the on-screen share card into an image file and returns its URI. */
export async function captureCard(card: RefObject<View | null>, format: ShareFormat) {
  return captureRef(card, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
    width: EXPORT_WIDTH,
    height: Math.round(EXPORT_WIDTH / FORMAT_RATIO[format]),
  });
}

/** Opens the system share sheet for an image. Nothing is sent unless the user picks a destination. */
export async function shareImage(uri: string): Promise<void> {
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
}

/** Saves an image to the photo library. Returns false when the user has not allowed adding photos. */
export async function saveImage(uri: string): Promise<boolean> {
  // Write-only access is enough to add a photo and never exposes the library.
  const permission = await requestPermissionsAsync(true);
  if (!permission.granted) return false;
  await Asset.create(uri);
  return true;
}
