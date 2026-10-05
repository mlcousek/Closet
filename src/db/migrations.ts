/** Minimal surface the migration runner needs; implemented by expo-sqlite and by better-sqlite3 in tests. */
export type RawDb = {
  exec(sql: string): void;
  getUserVersion(): number;
  setUserVersion(version: number): void;
};

export type Migration = { version: number; sql: string };

/** Append only. Never edit a migration that has shipped. */
export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        name TEXT NOT NULL,
        gender TEXT,
        body_type TEXT,
        height_cm INTEGER,
        size_top TEXT,
        size_bottom TEXT,
        size_shoes TEXT,
        avatar_path TEXT,
        avatar_small_path TEXT
      );
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        name TEXT,
        category TEXT NOT NULL,
        subcategory TEXT,
        colours TEXT NOT NULL DEFAULT '[]',
        seasons TEXT NOT NULL DEFAULT '[]',
        occasions TEXT NOT NULL DEFAULT '[]',
        warmth INTEGER,
        brand TEXT,
        size TEXT,
        price REAL,
        currency TEXT,
        purchased_at INTEGER,
        notes TEXT,
        source_url TEXT,
        ownership TEXT NOT NULL DEFAULT 'owned',
        original_path TEXT NOT NULL,
        cutout_path TEXT,
        thumb_path TEXT NOT NULL,
        needs_review INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS items_listing ON items (deleted_at, ownership, category);

      CREATE TABLE IF NOT EXISTS import_jobs (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        source_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        error TEXT,
        item_id TEXT
      );
    `,
  },
  {
    version: 4,
    sql: `
      ALTER TABLE profiles ADD COLUMN avatar_studio_path TEXT;

      CREATE TABLE IF NOT EXISTS outfits (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        name TEXT,
        notes TEXT,
        favourite INTEGER NOT NULL DEFAULT 0,
        seasons TEXT NOT NULL DEFAULT '[]',
        occasions TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS outfit_items (
        outfit_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        slot TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (outfit_id, item_id)
      );
      CREATE INDEX IF NOT EXISTS outfit_items_item ON outfit_items (item_id);

      CREATE TABLE IF NOT EXISTS renders (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        outfit_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        fingerprint TEXT NOT NULL,
        provider TEXT,
        image_path TEXT,
        thumb_path TEXT,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS renders_outfit ON renders (outfit_id, created_at);

      CREATE TABLE IF NOT EXISTS ai_usage (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        kind TEXT NOT NULL
      );
    `,
  },
  {
    version: 5,
    sql: `
      CREATE TABLE IF NOT EXISTS lookbooks (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        name TEXT NOT NULL,
        description TEXT,
        cover_outfit_id TEXT
      );

      CREATE TABLE IF NOT EXISTS lookbook_outfits (
        lookbook_id TEXT NOT NULL,
        outfit_id TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (lookbook_id, outfit_id)
      );
      CREATE INDEX IF NOT EXISTS lookbook_outfits_outfit ON lookbook_outfits (outfit_id);
    `,
  },
  {
    version: 6,
    sql: `
      CREATE TABLE IF NOT EXISTS calendar_entries (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        day TEXT NOT NULL,
        outfit_id TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'planned',
        position INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS calendar_entries_day ON calendar_entries (day);

      CREATE TABLE IF NOT EXISTS wear_events (
        entry_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        day TEXT NOT NULL,
        PRIMARY KEY (entry_id, item_id)
      );
      CREATE INDEX IF NOT EXISTS wear_events_item ON wear_events (item_id, day);
    `,
  },
  {
    version: 7,
    sql: `
      CREATE TABLE IF NOT EXISTS stylist_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        request TEXT NOT NULL,
        day TEXT,
        item_id TEXT,
        turns TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        name TEXT NOT NULL,
        place_name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        start_day TEXT NOT NULL,
        end_day TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trip_days (
        trip_id TEXT NOT NULL,
        day TEXT NOT NULL,
        activity TEXT,
        pieces TEXT NOT NULL DEFAULT '[]',
        outfit_id TEXT,
        PRIMARY KEY (trip_id, day)
      );

      CREATE TABLE IF NOT EXISTS trip_packing (
        trip_id TEXT NOT NULL,
        key TEXT NOT NULL,
        kind TEXT NOT NULL,
        label TEXT,
        packed INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (trip_id, key)
      );
    `,
  },
];

export const LATEST_SCHEMA_VERSION = migrations[migrations.length - 1].version;

/** Applies pending migrations in order, each in its own transaction. Returns the resulting version. */
export function runMigrations(db: RawDb, list: Migration[] = migrations): number {
  let current = db.getUserVersion();
  for (const migration of [...list].sort((a, b) => a.version - b.version)) {
    if (migration.version <= current) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.setUserVersion(migration.version);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    current = migration.version;
  }
  return current;
}
