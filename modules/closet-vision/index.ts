import { requireOptionalNativeModule } from 'expo';

export type PersonBox = {
  /** Normalised 0..1, origin at the top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

export type Cutout = { uri: string; width: number; height: number };

type ClosetVisionNative = {
  detectPeople(uri: string): Promise<PersonBox[]>;
  removeBackground(uri: string): Promise<Cutout | null>;
  personOnWhite?(uri: string): Promise<Cutout | null>;
};

// Optional so the JavaScript still loads in a client built before this module existed.
const native = requireOptionalNativeModule<ClosetVisionNative>('ClosetVision');

export const isVisionAvailable = native !== null;

/** People found in an image, or null when detection is not available on this build. */
export async function detectPeople(uri: string): Promise<PersonBox[] | null> {
  if (!native) return null;
  return native.detectPeople(uri);
}

/**
 * The main subject of a photo on a transparent background, trimmed to the
 * subject, as a temporary PNG. Null when no subject can be isolated or the
 * feature is not available (older build, or iOS before 17).
 */
export async function removeBackground(uri: string): Promise<Cutout | null> {
  if (!native?.removeBackground) return null;
  return native.removeBackground(uri);
}

/**
 * The people in a photo on a plain white background, at the size of the
 * photo, as a temporary JPEG. Null when nobody is found or the feature is not
 * available on this build.
 */
export async function personOnWhite(uri: string): Promise<Cutout | null> {
  if (!native?.personOnWhite) return null;
  return native.personOnWhite(uri);
}
