import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import type { Db } from './client';
import { runMigrations, type Migration, type RawDb } from './migrations';
import { schema } from './schema';

/** In-memory database with all migrations applied, for unit tests only. */
export function createTestDb(extraSql?: string, list?: Migration[]) {
  const sqlite = new Database(':memory:');
  const raw: RawDb = {
    exec: (sql) => void sqlite.exec(sql),
    getUserVersion: () => sqlite.pragma('user_version', { simple: true }) as number,
    setUserVersion: (version) => void sqlite.pragma(`user_version = ${version}`),
  };
  runMigrations(raw, list);
  if (extraSql) sqlite.exec(extraSql);
  const db = drizzle(sqlite, { schema }) as unknown as Db;
  return { db, raw, sqlite };
}
