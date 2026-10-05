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

export const schema = { appSettings };
