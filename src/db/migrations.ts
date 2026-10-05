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
