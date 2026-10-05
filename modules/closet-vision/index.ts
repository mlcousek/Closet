import { requireOptionalNativeModule } from 'expo';

export type PersonBox = {
  /** Normalised 0..1, origin at the top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

type ClosetVisionNative = {
  detectPeople(uri: string): Promise<PersonBox[]>;
};

// Optional so the JavaScript still loads in a client built before this module existed.
const native = requireOptionalNativeModule<ClosetVisionNative>('ClosetVision');

export const isVisionAvailable = native !== null;

/** People found in an image, or null when detection is not available on this build. */
export async function detectPeople(uri: string): Promise<PersonBox[] | null> {
  if (!native) return null;
  return native.detectPeople(uri);
}
