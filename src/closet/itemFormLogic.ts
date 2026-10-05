import type { Category, Colour, Occasion, Season, Subcategory, Warmth } from './taxonomy';
import { isSubcategoryOf } from './taxonomy';
import type { ItemDetails } from './types';

/** What the item form holds while the user edits: text fields as typed, category possibly unset. */
export type ItemFormValues = {
  name: string;
  category: Category | null;
  subcategory: Subcategory | null;
  colours: Colour[];
  seasons: Season[];
  occasions: Occasion[];
  warmth: Warmth | null;
  brand: string;
  size: string;
  price: string;
  currency: string;
  purchasedAt: string;
  notes: string;
  sourceUrl: string | null;
};

export type ItemFormError = 'categoryRequired' | 'priceInvalid' | 'purchasedAtInvalid';

const pad = (value: number) => String(value).padStart(2, '0');

export function formatDateInput(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Reads YYYY-MM-DD as local noon, so the day never shifts with the time zone. */
export function parseDateInput(text: string): number | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, 12);
  const valid =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return valid ? date.getTime() : null;
}

export function parsePriceInput(text: string): number | null {
  const normalised = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalised)) return null;
  return Number(normalised);
}

export function toFormValues(
  details: Partial<ItemDetails>,
  defaultCurrency: string,
): ItemFormValues {
  return {
    name: details.name ?? '',
    category: details.category ?? null,
    subcategory: details.subcategory ?? null,
    colours: details.colours ?? [],
    seasons: details.seasons ?? [],
    occasions: details.occasions ?? [],
    warmth: details.warmth ?? null,
    brand: details.brand ?? '',
    size: details.size ?? '',
    price: details.price != null ? String(details.price) : '',
    currency: details.currency ?? defaultCurrency,
    purchasedAt: details.purchasedAt != null ? formatDateInput(details.purchasedAt) : '',
    notes: details.notes ?? '',
    sourceUrl: details.sourceUrl ?? null,
  };
}

/** Checks the form and turns it into item details, or says which field is wrong. */
export function fromFormValues(
  values: ItemFormValues,
): { ok: true; details: ItemDetails } | { ok: false; error: ItemFormError } {
  if (!values.category) return { ok: false, error: 'categoryRequired' };
  const price = values.price.trim() ? parsePriceInput(values.price) : null;
  if (values.price.trim() && price === null) return { ok: false, error: 'priceInvalid' };
  const purchasedAt = values.purchasedAt.trim() ? parseDateInput(values.purchasedAt) : null;
  if (values.purchasedAt.trim() && purchasedAt === null) {
    return { ok: false, error: 'purchasedAtInvalid' };
  }
  const text = (value: string) => value.trim() || null;
  return {
    ok: true,
    details: {
      name: text(values.name),
      category: values.category,
      // A type chosen under another category is dropped when the category changes.
      subcategory: isSubcategoryOf(values.category, values.subcategory) ? values.subcategory : null,
      colours: values.colours,
      seasons: values.seasons,
      occasions: values.occasions,
      warmth: values.warmth,
      brand: text(values.brand),
      size: text(values.size),
      price,
      currency: price !== null ? (text(values.currency)?.toUpperCase() ?? null) : null,
      purchasedAt,
      notes: text(values.notes),
      sourceUrl: values.sourceUrl,
    },
  };
}
