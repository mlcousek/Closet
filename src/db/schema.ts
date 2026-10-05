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
  /** 'owned' or 'archived'. */
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

export const schema = { appSettings, profiles, items, importJobs };
