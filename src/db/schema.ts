import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Columns every synced table carries, so a cloud backend can be attached later:
 * stable UUID, creation and update timestamps, and a soft-delete marker.
 * Timestamps are epoch milliseconds.
 */
export const baseColumns = {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
};

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** The single user of this device. A row id exists so a later account can own it. */
export const profiles = sqliteTable('profiles', {
  ...baseColumns,
  name: text('name').notNull(),
  gender: text('gender'),
  bodyType: text('body_type'),
  heightCm: integer('height_cm'),
  sizeTop: text('size_top'),
  sizeBottom: text('size_bottom'),
  sizeShoes: text('size_shoes'),
  /** Relative path of the full-resolution avatar photo. */
  avatarPath: text('avatar_path'),
  /** Relative path of the downscaled copy that is sent to the image provider. */
  avatarSmallPath: text('avatar_small_path'),
  /** Relative path of the accepted studio version of the avatar, used as the base for renders. */
  avatarStudioPath: text('avatar_studio_path'),
});

/** One piece of clothing. Multi-value attributes are JSON arrays of taxonomy values. */
export const items = sqliteTable('items', {
  ...baseColumns,
  name: text('name'),
  category: text('category').notNull(),
  subcategory: text('subcategory'),
  colours: text('colours').notNull().default('[]'),
  seasons: text('seasons').notNull().default('[]'),
  occasions: text('occasions').notNull().default('[]'),
  warmth: integer('warmth'),
  brand: text('brand'),
  size: text('size'),
  price: real('price'),
  currency: text('currency'),
  purchasedAt: integer('purchased_at'),
  notes: text('notes'),
  sourceUrl: text('source_url'),
  /** 'owned', 'archived' or 'wishlist'. */
  ownership: text('ownership').notNull().default('owned'),
  originalPath: text('original_path').notNull(),
  /** Background-removed image; null when no cutout could be made or the user kept the original. */
  cutoutPath: text('cutout_path'),
  thumbPath: text('thumb_path').notNull(),
  /** Set for items created by bulk import until the user confirms them. */
  needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),
});

/** One photo waiting to be turned into an item by bulk import. */
export const importJobs = sqliteTable('import_jobs', {
  ...baseColumns,
  /** Relative path of the photo, copied into the image store when the import started. */
  sourcePath: text('source_path').notNull(),
  /** 'queued', 'processing', 'done' or 'failed'. */
  status: text('status').notNull().default('queued'),
  error: text('error'),
  itemId: text('item_id'),
});

/** A named combination of closet items. */
export const outfits = sqliteTable('outfits', {
  ...baseColumns,
  name: text('name'),
  notes: text('notes'),
  favourite: integer('favourite', { mode: 'boolean' }).notNull().default(false),
  seasons: text('seasons').notNull().default('[]'),
  occasions: text('occasions').notNull().default('[]'),
});

/** Which items an outfit contains, and in which slot. Replaced as a whole when an outfit is saved. */
export const outfitItems = sqliteTable('outfit_items', {
  outfitId: text('outfit_id').notNull(),
  itemId: text('item_id').notNull(),
  slot: text('slot').notNull(),
  position: integer('position').notNull().default(0),
});

/** One try-on render of an outfit, including ones still waiting or that failed. */
export const renders = sqliteTable('renders', {
  ...baseColumns,
  outfitId: text('outfit_id').notNull(),
  /** 'queued', 'running', 'done' or 'failed'. */
  status: text('status').notNull().default('queued'),
  /** Identifies the avatar base and the pieces the render was made from. */
  fingerprint: text('fingerprint').notNull(),
  provider: text('provider'),
  imagePath: text('image_path'),
  thumbPath: text('thumb_path'),
  error: text('error'),
});

/** One row per paid provider request, so usage can be shown. */
export const aiUsage = sqliteTable('ai_usage', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  kind: text('kind').notNull(),
});

/** A named collection of outfits. */
export const lookbooks = sqliteTable('lookbooks', {
  ...baseColumns,
  name: text('name').notNull(),
  description: text('description'),
  /** The outfit shown as the cover; null means the first outfit. */
  coverOutfitId: text('cover_outfit_id'),
});

/** Which outfits a lookbook contains, in the user's order. An outfit can be in several lookbooks. */
export const lookbookOutfits = sqliteTable('lookbook_outfits', {
  lookbookId: text('lookbook_id').notNull(),
  outfitId: text('outfit_id').notNull(),
  position: integer('position').notNull().default(0),
});

export const schema = {
  lookbooks,
  lookbookOutfits,
  appSettings,
  profiles,
  items,
  importJobs,
  outfits,
  outfitItems,
  renders,
  aiUsage,
};
