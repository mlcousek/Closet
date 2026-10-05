import type { Item } from './types';

// The combining diacritical marks block, built from code points so the source stays plain ASCII.
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`,
  'g',
);

/** Lower-cases and strips diacritics, so a search without accents still matches accented text. */
export function normalise(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

/**
 * True when every word of the query appears somewhere in the item's name,
 * brand, notes, or the translated labels of its category, subcategory and
 * colours. `labels` supplies those translated labels for the current language.
 */
export function matchesSearch(
  item: Item,
  query: string,
  labels: (item: Item) => string[],
): boolean {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalise(
    [item.name, item.brand, item.notes, ...labels(item)].filter(Boolean).join(' '),
  );
  return words.every((word) => haystack.includes(word));
}
