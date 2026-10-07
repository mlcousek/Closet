import { SLOT_LABEL, describeItem } from './renderActions';
import type { Outfit } from './repository';

/** Pixel width of the picture handed to the other app. */
export const SHEET_WIDTH = 1600;
/** Width divided by height of that picture. */
export const SHEET_RATIO = 4 / 3;

/** Columns for the pieces on the sheet, so each stays as large as it can. */
export function pieceColumns(count: number): number {
  if (count <= 2) return 1;
  if (count <= 6) return 2;
  return 3;
}

/**
 * The request to paste next to the sheet in an assistant app such as Gemini or
 * ChatGPT. It is in English whatever the app's language, because that is what
 * image models follow most reliably. The numbers match the ones on the sheet.
 */
export function manualPrompt(outfit: Pick<Outfit, 'entries'>, hasPhoto: boolean): string {
  const pieces = outfit.entries
    .map((entry, index) => `${index + 1}. ${SLOT_LABEL[entry.slot]}: ${describeItem(entry.item)}`)
    .join('\n');
  const count = outfit.entries.length;
  const noun = count === 1 ? 'clothing piece' : 'clothing pieces';
  const intro = hasPhoto
    ? `The attached picture has two parts. On the left is a photo of me. On the right ${count === 1 ? 'is' : 'are'} ${count} numbered ${noun}:`
    : `The attached picture shows ${count} numbered ${noun}. I am also attaching a full-body photo of me.`;
  return [
    intro,
    pieces,
    `Create one photorealistic full-body picture of me wearing ${count === 1 ? 'this piece' : 'all of these pieces together'}.`,
    'Keep my face, hair, skin tone and body shape exactly as in my photo.',
    'Show every piece as it is in its picture: same colour, pattern, material and cut. Do not add other clothes over them.',
    'Standing pose, facing the camera, plain light background, portrait format 3:4. Reply with the picture only.',
  ].join('\n');
}
