import type { Item } from './types';

/** Lower-cases and strips diacritics, so "Šaty" matches "saty". */
export function normalise(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
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
