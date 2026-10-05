import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

export const schema = { appSettings, profiles };
