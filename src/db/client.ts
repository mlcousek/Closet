import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';

import { runMigrations, type RawDb } from './migrations';
import { schema } from './schema';

export const DB_NAME = 'closet.db';

export type Db = BaseSQLiteDatabase<'sync', unknown, typeof schema>;

let sqlite: SQLite.SQLiteDatabase | null = null;
let db: Db | null = null;

function toRawDb(handle: SQLite.SQLiteDatabase): RawDb {
  return {
    exec: (sql) => handle.execSync(sql),
    getUserVersion: () =>
      handle.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0,
    setUserVersion: (version) => handle.execSync(`PRAGMA user_version = ${Math.trunc(version)}`),
  };
}

/** Opens the database and applies pending migrations. Safe to call repeatedly. */
export function openDb(): Db {
  if (db) return db;
  sqlite = SQLite.openDatabaseSync(DB_NAME);
  sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  runMigrations(toRawDb(sqlite));
  db = drizzle(sqlite, { schema });
  return db;
}

export function getDb(): Db {
  return db ?? openDb();
}

/** Flushes the write-ahead log into the main file so the file on disk is complete. */
export function checkpointDb(): void {
  sqlite?.execSync('PRAGMA wal_checkpoint(TRUNCATE)');
}

export function closeDb(): void {
  sqlite?.closeSync();
  sqlite = null;
  db = null;
}

/** Overrides the database, for tests. */
export function setDbForTests(testDb: Db | null): void {
  db = testDb;
}
