/** Longest item name that goes into a prompt; a name is a few words, not a product page. */
export const PROMPT_NAME_MAX = 80;

/**
 * Makes a name the user typed, or one taken from a product page, safe to put
 * on one line of a prompt: line breaks and other whitespace become single
 * spaces, control characters and the `|` that separates catalogue fields are
 * removed, and what is left is cut to a sensible length. Only the text that is
 * sent goes through here; what is stored and shown stays as it is.
 */
export function promptName(name: string | null | undefined): string {
  if (!name) return '';
  const clean = name
    // Line and paragraph separators count as whitespace too.
    .replace(/\s+/g, ' ')
    .replace(/\p{Cc}/gu, '')
    .replace(/\|/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  // Cut by whole characters, so an emoji or an accented letter is not split in two.
  return [...clean].slice(0, PROMPT_NAME_MAX).join('').trimEnd();
}
