/**
 * The fixed vocabulary for clothing items. Outfit slots, weather rules and
 * statistics rely on these values, so they are constants and not user data.
 * Labels live in the translation files under `taxonomy.*`.
 */

export const SLOTS = ['outer', 'top', 'bottom', 'fullBody', 'shoes', 'bag', 'accessory'] as const;
export type Slot = (typeof SLOTS)[number];

export const CATEGORIES = [
  'tops',
  'dresses',
  'bottoms',
  'outerwear',
  'shoes',
  'bags',
  'accessories',
  'jewellery',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Which outfit slot items of a category fill. */
export const CATEGORY_SLOT: Record<Category, Slot> = {
  tops: 'top',
  dresses: 'fullBody',
  bottoms: 'bottom',
  outerwear: 'outer',
  shoes: 'shoes',
  bags: 'bag',
  accessories: 'accessory',
  jewellery: 'accessory',
};

export const SUBCATEGORIES = {
  tops: ['tshirt', 'shirt', 'blouse', 'tank', 'cropTop', 'sweater', 'hoodie', 'cardigan', 'polo'],
  dresses: ['dress', 'jumpsuit', 'romper', 'suit'],
  bottoms: ['jeans', 'trousers', 'shorts', 'skirt', 'leggings', 'sweatpants'],
  outerwear: ['jacket', 'coat', 'blazer', 'vest', 'raincoat', 'puffer'],
  shoes: ['sneakers', 'boots', 'heels', 'flats', 'sandals', 'loafers', 'formalShoes'],
  bags: ['handbag', 'shoulderBag', 'backpack', 'tote', 'clutch', 'crossbody'],
  accessories: ['hat', 'scarf', 'belt', 'gloves', 'sunglasses', 'tie', 'socks'],
  jewellery: ['necklace', 'earrings', 'bracelet', 'ring', 'watch'],
} as const satisfies Record<Category, readonly string[]>;
export type Subcategory = (typeof SUBCATEGORIES)[Category][number];

export const ALL_SUBCATEGORIES: readonly Subcategory[] = CATEGORIES.flatMap(
  (category) => SUBCATEGORIES[category] as readonly Subcategory[],
);

export const COLOURS = {
  black: '#1B1B1B',
  white: '#FFFFFF',
  grey: '#9A9A9A',
  beige: '#D9C7A8',
  brown: '#7A5230',
  red: '#D0312D',
  orange: '#F08A24',
  yellow: '#F2D13A',
  green: '#3E9B4F',
  blue: '#2F6FD0',
  navy: '#1F2A52',
  purple: '#8B5CF6',
  pink: '#F06FA8',
  gold: '#C9A227',
  silver: '#C0C4CC',
  multicolour: '#888888',
} as const;
export type Colour = keyof typeof COLOURS;
export const COLOUR_NAMES = Object.keys(COLOURS) as Colour[];

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export const OCCASIONS = ['casual', 'work', 'formal', 'party', 'sport', 'home', 'outdoor'] as const;
export type Occasion = (typeof OCCASIONS)[number];

/** How warm a piece is, from 1 (very light) to 5 (very warm). */
export const WARMTH_LEVELS = [1, 2, 3, 4, 5] as const;
export type Warmth = (typeof WARMTH_LEVELS)[number];

/** Used when an item has no warmth recorded. */
export const DEFAULT_WARMTH: Record<Category, Warmth> = {
  tops: 2,
  dresses: 2,
  bottoms: 3,
  outerwear: 4,
  shoes: 3,
  bags: 3,
  accessories: 3,
  jewellery: 3,
};

const includes = <T extends string | number>(list: readonly T[], value: unknown): value is T =>
  list.includes(value as T);

export const isCategory = (value: unknown): value is Category => includes(CATEGORIES, value);
export const isColour = (value: unknown): value is Colour => includes(COLOUR_NAMES, value);
export const isSeason = (value: unknown): value is Season => includes(SEASONS, value);
export const isOccasion = (value: unknown): value is Occasion => includes(OCCASIONS, value);
export const isWarmth = (value: unknown): value is Warmth => includes(WARMTH_LEVELS, value);

/** True when the subcategory belongs to the category. */
export function isSubcategoryOf(category: Category, value: unknown): value is Subcategory {
  return includes(SUBCATEGORIES[category] as readonly string[], value);
}

export function slotOf(category: Category): Slot {
  return CATEGORY_SLOT[category];
}
