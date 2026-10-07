import { getSetting, setSetting } from '@/db/settings';

export const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';
const IMAGE_MODEL_SETTING = 'ai.model.image';
const TIMEOUT_MS = 120_000;

export function getImageModel(): string {
  return getSetting(IMAGE_MODEL_SETTING) ?? DEFAULT_IMAGE_MODEL;
}

export function setImageModel(model: string | null): void {
  setSetting(IMAGE_MODEL_SETTING, model?.trim() || null);
}

export type TryOnFailure =
  | 'noKey'
  | 'offline'
  /** The request went out and the connection dropped before the answer; it may have been charged. */
  | 'connectionLost'
  | 'declined'
  | 'rateLimited'
  | 'timeout'
  | 'rejectedKey'
  | 'error';

/** A request that fails this quickly never reached the provider. */
const NEVER_SENT_MS = 4000;

export class TryOnError extends Error {
  constructor(public reason: TryOnFailure) {
    super(`Try-on failed: ${reason}`);
    this.name = 'TryOnError';
  }
}

export type EncodedImage = { base64: string; mimeType: string };

export type TryOnPiece = {
  /** Where the piece is worn, in plain English, for example "top" or "shoes". */
  slotLabel: string;
  /** A short description, for example "pink pleated skirt". */
  description: string;
  image: EncodedImage;
};

export type TryOnHints = { gender: string | null; bodyType: string | null };

export type TryOnInput = { avatar: EncodedImage; pieces: TryOnPiece[]; hints: TryOnHints };

/** An image provider that can dress a person. Implementations hide the provider's API. */
export type TryOnProvider = {
  id: string;
  /** Renders the avatar wearing the pieces. Throws TryOnError with the reason on failure. */
  render(input: TryOnInput, key: string): Promise<EncodedImage>;
  /** Turns a casual full-body photo into a neutral studio base image of the same person. */
  studioAvatar(avatar: EncodedImage, hints: TryOnHints, key: string): Promise<EncodedImage>;
};

function person(hints: TryOnHints): string {
  const parts = [hints.bodyType ? `${hints.bodyType} build` : null, hints.gender].filter(Boolean);
  return parts.length > 0 ? `the person (${parts.join(', ')})` : 'the person';
}

/** The instruction sent with a try-on request. Images follow in the order described. */
export function tryOnPrompt(input: Pick<TryOnInput, 'pieces' | 'hints'>): string {
  const list = input.pieces
    .map((piece, index) => `- Image ${index + 2}: ${piece.slotLabel} (${piece.description})`)
    .join('\n');
  return `Image 1 is a full-body photo of a person. The other images each show one piece of clothing or one accessory on a plain background:
${list}

Create one photorealistic full-body image of ${person(input.hints)} from image 1 wearing exactly these pieces together as one outfit.

Requirements:
- Keep the person's face, hair, skin tone, body shape and proportions exactly as in image 1. Do not change who they are.
- Replace everything the person is wearing in image 1. Nothing from their original clothing may remain.
- Reproduce every piece faithfully: its colour, pattern, print, length, cut, neckline and details. Do not redesign, recolour or restyle anything.
- Wear each piece as it is normally worn in the position given. Do not add any clothing, shoes, bag, jewellery or accessory that is not in the list. If no shoes are listed, show plain bare feet or neutral socks.
- Show the whole body from head to feet, standing in a relaxed, natural pose facing the camera.
- Plain, light, even studio background with soft lighting. Portrait orientation. No text, no watermark, no borders.`;
}

export function studioAvatarPrompt(hints: TryOnHints): string {
  return `This is a casual full-body photo of a person. Create a clean studio version of the same photo to use as a base for trying on clothes.

Requirements:
- Keep ${person(hints)}'s face, hair, skin tone, body shape and proportions exactly as they are. Do not change who they are.
- Standing upright, facing the camera, arms relaxed slightly away from the body, feet visible.
- Dressed in simple, plain, close-fitting neutral grey basics: a short-sleeved top and shorts, barefoot.
- Plain, light, even studio background with soft lighting. The whole body from head to feet in frame, portrait orientation.
- No text, no watermark, no borders, no other people or objects.`;
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ status: number; json(): Promise<unknown> }>;

type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: {
    finishReason?: string;
    content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
  }[];
};

/** Reads the generated image out of a Gemini response, or throws when there is none. */
export function readGeminiImage(payload: unknown): EncodedImage {
  const response = (payload ?? {}) as GeminiResponse;
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType ?? 'image/png' };
      }
    }
  }
  // A request that was accepted but produced no image was declined by the provider's filters.
  throw new TryOnError('declined');
}

/** True when an error response says the key itself was not accepted. */
export function isInvalidKey(payload: unknown): boolean {
  const error = (payload as { error?: { message?: string; details?: { reason?: string }[] } })
    ?.error;
  if (!error) return false;
  return (
    (error.details ?? []).some((detail) => detail?.reason === 'API_KEY_INVALID') ||
    /api key not valid/i.test(error.message ?? '')
  );
}

export function createGeminiProvider(
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
  getModel: () => string = getImageModel,
  timeoutMs = TIMEOUT_MS,
): TryOnProvider {
  const generate = async (
    prompt: string,
    images: EncodedImage[],
    key: string,
  ): Promise<EncodedImage> => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    let status: number;
    let payload: unknown;
    const startedAt = Date.now();
    try {
      const response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(getModel())}:generateContent`,
        {
          method: 'POST',
          // The key travels in a header, never in the URL.
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt },
                  ...images.map((image) => ({
                    inlineData: { mimeType: image.mimeType, data: image.base64 },
                  })),
                ],
              },
            ],
            generationConfig: { responseModalities: ['IMAGE'] },
          }),
          signal: controller.signal,
        },
      );
      status = response.status;
      payload = await response.json().catch(() => null);
    } catch {
      if (timedOut) throw new TryOnError('timeout');
      // Without a connection the request fails at once. A failure after a while means it was
      // sent, with its images, and the answer was lost: the provider may have made the picture.
      throw new TryOnError(Date.now() - startedAt < NEVER_SENT_MS ? 'offline' : 'connectionLost');
    } finally {
      clearTimeout(timer);
    }
    // There is a key, and the provider would not take it: asking for one again would mislead.
    if (status === 401 || status === 403 || isInvalidKey(payload)) {
      throw new TryOnError('rejectedKey');
    }
    if (status === 429) throw new TryOnError('rateLimited');
    if (status < 200 || status >= 300) throw new TryOnError('error');
    return readGeminiImage(payload);
  };

  return {
    id: 'gemini',
    render: (input, key) =>
      generate(
        tryOnPrompt(input),
        [input.avatar, ...input.pieces.map((piece) => piece.image)],
        key,
      ),
    studioAvatar: (avatar, hints, key) => generate(studioAvatarPrompt(hints), [avatar], key),
  };
}

export const geminiProvider = createGeminiProvider();

/**
 * How much image data the pieces of one request may carry, in base64
 * characters. The provider limits a request to about 20 MB; this leaves room
 * for the avatar and the prompt.
 */
export const PIECES_BUDGET = 12_000_000;
/** Sizes to try for the pieces, largest first. */
export const PIECE_SIZES = [1024, 768, 512];

/**
 * Encodes the pieces at the largest size at which all of them fit in one
 * request. A few pieces go at full size; an outfit with many is sent smaller,
 * since a rejected request would produce no picture at all.
 */
export async function encodeWithinBudget<T>(
  entries: T[],
  encodeAt: (entry: T, max: number) => Promise<EncodedImage>,
  budget: number = PIECES_BUDGET,
  sizes: number[] = PIECE_SIZES,
): Promise<EncodedImage[]> {
  let images: EncodedImage[] = [];
  for (const max of sizes) {
    images = [];
    for (const entry of entries) images.push(await encodeAt(entry, max));
    if (images.reduce((sum, image) => sum + image.base64.length, 0) <= budget) break;
  }
  return images;
}
