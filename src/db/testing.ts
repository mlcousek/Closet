import { drizzle } from 'drizzle-orm/sql-js';
import initSqlJs from 'sql.js';

import type { Db } from './client';
import { runMigrations, type Migration, type RawDb } from './migrations';
import { schema } from './schema';

/** In-memory database with all migrations applied, for unit tests only. */
export async function createTestDb(extraSql?: string, list?: Migration[]) {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  const raw: RawDb = {
    exec: (sql) => void sqlite.exec(sql),
    getUserVersion: () => sqlite.exec('PRAGMA user_version')[0].values[0][0] as number,
    setUserVersion: (version) => void sqlite.exec(`PRAGMA user_version = ${Math.trunc(version)}`),
  };
  runMigrations(raw, list);
  if (extraSql) sqlite.exec(extraSql);
  const db = drizzle(sqlite, { schema }) as unknown as Db;
  /** Runs a query and returns rows as objects. */
  const query = (sql: string): Record<string, unknown>[] => {
    const [result] = sqlite.exec(sql);
    if (!result) return [];
    return result.values.map((row) =>
      Object.fromEntries(result.columns.map((column, index) => [column, row[index]])),
    );
  };
  return { db, raw, sqlite, query };
}
