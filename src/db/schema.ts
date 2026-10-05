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

/** An outfit planned for, or worn on, a day. Days are local dates written as YYYY-MM-DD. */
export const calendarEntries = sqliteTable('calendar_entries', {
  ...baseColumns,
  day: text('day').notNull(),
  outfitId: text('outfit_id').notNull(),
  /** 'planned' or 'worn'. */
  state: text('state').notNull().default('planned'),
  /** Order within the day; the first entry is the one shown in grids and strips. */
  position: integer('position').notNull().default(0),
});

/** One row per item per worn entry. Wear counts are derived from these, never stored on items. */
export const wearEvents = sqliteTable('wear_events', {
  entryId: text('entry_id').notNull(),
  itemId: text('item_id').notNull(),
  day: text('day').notNull(),
});

/** One conversation with the stylist: the first request and every refinement, with their proposals. */
export const stylistSessions = sqliteTable('stylist_sessions', {
  ...baseColumns,
  /** The first request, shown in the session list. */
  request: text('request').notNull(),
  /** The day the outfits are for, when one was chosen. */
  day: text('day'),
  /** The item every proposal must contain, for "style this". */
  itemId: text('item_id'),
  /** JSON array of turns: { request, proposals: [{ pieces, rationale }] }. */
  turns: text('turns').notNull().default('[]'),
});

export const trips = sqliteTable('trips', {
  ...baseColumns,
  name: text('name').notNull(),
  placeName: text('place_name').notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  startDay: text('start_day').notNull(),
  endDay: text('end_day').notNull(),
});

/** One day of a trip: what it is for and which pieces are worn. */
export const tripDays = sqliteTable('trip_days', {
  tripId: text('trip_id').notNull(),
  day: text('day').notNull(),
  activity: text('activity'),
  /** JSON array of outfit pieces; empty when no outfit could be put together. */
  pieces: text('pieces').notNull().default('[]'),
  /** The saved outfit made from the pieces once the day was added to the calendar. */
  outfitId: text('outfit_id'),
});

/** Checklist state of a trip. Outfit pieces are derived from the days; rows exist for what the user touched or added. */
export const tripPacking = sqliteTable('trip_packing', {
  tripId: text('trip_id').notNull(),
  /** An item id, or a generated id for a free-text entry. */
  key: text('key').notNull(),
  /** 'item' for a closet item, 'text' for a free-text entry. */
  kind: text('kind').notNull(),
  label: text('label'),
  packed: integer('packed', { mode: 'boolean' }).notNull().default(false),
});

export const schema = {
  stylistSessions,
  trips,
  tripDays,
  tripPacking,
  calendarEntries,
  wearEvents,
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
