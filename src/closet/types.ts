import type { Category, Colour, Occasion, Season, Subcategory, Warmth } from './taxonomy';

export const OWNERSHIPS = ['owned', 'archived'] as const;
export type Ownership = (typeof OWNERSHIPS)[number];

export type Item = {
  id: string;
  createdAt: number;
  name: string | null;
  category: Category;
  subcategory: Subcategory | null;
  colours: Colour[];
  seasons: Season[];
  occasions: Occasion[];
  warmth: Warmth | null;
  brand: string | null;
  size: string | null;
  price: number | null;
  currency: string | null;
  purchasedAt: number | null;
  notes: string | null;
  sourceUrl: string | null;
  ownership: Ownership;
  originalPath: string;
  cutoutPath: string | null;
  thumbPath: string;
  needsReview: boolean;
};

/** The details a user can set on an item. */
export type ItemDetails = Pick<
  Item,
  | 'name'
  | 'category'
  | 'subcategory'
  | 'colours'
  | 'seasons'
  | 'occasions'
  | 'warmth'
  | 'brand'
  | 'size'
  | 'price'
  | 'currency'
  | 'purchasedAt'
  | 'notes'
  | 'sourceUrl'
>;

export type ItemImages = Pick<Item, 'originalPath' | 'cutoutPath' | 'thumbPath'>;

export const SORTS = ['newest', 'name', 'price', 'brand'] as const;
export type ItemSort = (typeof SORTS)[number];

export type ItemFilter = {
  /** Defaults to owned, so archived items never appear unless asked for. */
  ownership?: Ownership;
  category?: Category | null;
  /** An item matches when it has any of the listed colours. */
  colours?: Colour[];
  seasons?: Season[];
  occasions?: Occasion[];
  brand?: string | null;
  needsReview?: boolean;
  sort?: ItemSort;
};

/** The image to show for an item: the cutout when there is one. */
export function displayPath(item: Pick<Item, 'cutoutPath' | 'originalPath'>): string {
  return item.cutoutPath ?? item.originalPath;
}
