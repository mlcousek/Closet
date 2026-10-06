import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

import {
  DB_NAME,
  checkpointDb,
  closeDb,
  getDb,
  openDb,
  setDbForTests,
  setDbLocked,
} from '../client';
import { LATEST_SCHEMA_VERSION, migrations } from '../migrations';
import { createRepository } from '../repository';
import { baseColumns } from '../schema';
import { getSetting, setSetting } from '../settings';
import { createTestDb } from '../testing';

/**
 * A stand-in for the device's SQLite: databases are kept by name, as files are,
 * so closing and opening again finds the same data. Every statement is recorded.
 */
const mockSqlite = {
  SQL: null as SqlJsStatic | null,
  disk: new Map<string, Database>(),
  opened: [] as string[],
  executed: [] as string[],
  closed: 0,
  /** A statement that fails when it is run, to simulate a broken migration. */
  failSql: null as string | null,
};

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: (name: string) => {
    mockSqlite.opened.push(name);
    let database = mockSqlite.disk.get(name);
    if (!database) {
      database = new mockSqlite.SQL!.Database();
      mockSqlite.disk.set(name, database);
    }
    const file = database;
    let open = true;
    const requireOpen = () => {
      if (!open) throw new Error('The database handle is closed');
    };
    return {
      execSync(sql: string) {
        requireOpen();
        mockSqlite.executed.push(sql);
        if (sql === mockSqlite.failSql) throw new Error('disk I/O error');
        file.exec(sql);
      },
      getFirstSync(sql: string) {
        requireOpen();
        const [result] = file.exec(sql);
        if (!result) return null;
        return Object.fromEntries(
          result.columns.map((column, index) => [column, result.values[0][index]]),
        );
      },
      closeSync() {
        requireOpen();
        open = false;
        mockSqlite.closed++;
      },
    };
  },
}));

const onDisk = (sql: string) => mockSqlite.disk.get(DB_NAME)!.exec(sql)[0]?.values ?? [];
const userVersion = () => onDisk('PRAGMA user_version')[0][0];
const tables = () =>
  onDisk("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row[0]);

beforeAll(async () => {
  mockSqlite.SQL = await initSqlJs();
});

beforeEach(() => {
  mockSqlite.disk.clear();
  mockSqlite.opened = [];
  mockSqlite.executed = [];
  mockSqlite.closed = 0;
  mockSqlite.failSql = null;
});

afterEach(() => {
  // The client keeps its handle in the module, so every test hands it back.
  setDbLocked(false);
  setDbForTests(null);
  closeDb();
});

describe('database client', () => {
  it('opens the database file, turns on WAL and foreign keys, then migrates to the latest schema', () => {
    openDb();

    expect(mockSqlite.opened).toEqual([DB_NAME]);
    expect(DB_NAME).toBe('closet.db');
    // The settings come before anything else is run on the new connection.
    expect(mockSqlite.executed[0]).toBe('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    expect(onDisk('PRAGMA foreign_keys')[0][0]).toBe(1);
    expect(userVersion()).toBe(LATEST_SCHEMA_VERSION);
    expect(tables()).toEqual(expect.arrayContaining(['app_settings', 'items', 'outfits']));
    // One transaction per migration.
    expect(mockSqlite.executed.filter((sql) => sql === 'BEGIN')).toHaveLength(migrations.length);
    expect(mockSqlite.executed.filter((sql) => sql === 'COMMIT')).toHaveLength(migrations.length);
    expect(mockSqlite.executed).not.toContain('ROLLBACK');
  });

  it('hands back the same database when opened again, without reopening or migrating twice', () => {
    const first = openDb();
    const statements = mockSqlite.executed.length;

    expect(openDb()).toBe(first);
    expect(getDb()).toBe(first);
    expect(mockSqlite.opened).toHaveLength(1);
    expect(mockSqlite.executed).toHaveLength(statements);
  });

  it('opens lazily, on the first use', () => {
    expect(mockSqlite.opened).toEqual([]);

    const db = getDb();

    expect(mockSqlite.opened).toEqual([DB_NAME]);
    expect(userVersion()).toBe(LATEST_SCHEMA_VERSION);
    expect(openDb()).toBe(db);
  });

  it('refuses to open while locked and opens again once unlocked', () => {
    setDbLocked(true);
    expect(() => openDb()).toThrow(/cannot be opened/);
    expect(() => getDb()).toThrow(/cannot be opened/);
    expect(mockSqlite.opened).toEqual([]);

    setDbLocked(false);
    expect(openDb()).toBeDefined();
    expect(mockSqlite.opened).toEqual([DB_NAME]);
  });

  it('keeps a database that is already open usable while locked, until it is closed', () => {
    const db = openDb();
    setDbLocked(true);
    expect(openDb()).toBe(db);

    closeDb();
    expect(() => openDb()).toThrow(/cannot be opened/);
  });

  it('closes the connection and opens a new one afterwards, without migrating again', () => {
    const first = openDb();
    onDisk("INSERT INTO app_settings (key, value) VALUES ('language', 'cs')");
    closeDb();
    expect(mockSqlite.closed).toBe(1);
    const statements = mockSqlite.executed.length;

    const second = openDb();

    expect(second).not.toBe(first);
    expect(mockSqlite.opened).toEqual([DB_NAME, DB_NAME]);
    // Only the connection settings are run on the schema that is already current.
    expect(mockSqlite.executed.slice(statements)).toEqual([
      'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;',
    ]);
    expect(onDisk('SELECT value FROM app_settings')).toEqual([['cs']]);
  });

  it('does nothing when closing or checkpointing a database that is not open', () => {
    closeDb();
    checkpointDb();
    expect(mockSqlite.closed).toBe(0);
    expect(mockSqlite.executed).toEqual([]);
    expect(mockSqlite.opened).toEqual([]);
  });

  it('checkpoints the write-ahead log into the main file', () => {
    openDb();
    const statements = mockSqlite.executed.length;

    checkpointDb();

    expect(mockSqlite.executed.slice(statements)).toEqual(['PRAGMA wal_checkpoint(TRUNCATE)']);
  });

  it('rolls back a migration that fails, keeps the version before it and finishes on the next start', () => {
    const [, previous, broken] = migrations;
    mockSqlite.failSql = broken.sql;

    expect(() => openDb()).toThrow('disk I/O error');

    expect(mockSqlite.executed[mockSqlite.executed.length - 1]).toBe('ROLLBACK');
    expect(userVersion()).toBe(previous.version);
    expect(tables()).toContain('profiles');
    expect(tables()).not.toContain('items');

    // The next start, on a healthy disk, carries on from where it stopped.
    closeDb();
    mockSqlite.failSql = null;
    openDb();
    expect(userVersion()).toBe(LATEST_SCHEMA_VERSION);
    expect(tables()).toContain('items');
    const begun = mockSqlite.executed.filter((sql) => sql === 'BEGIN');
    // The two that passed, the one that failed, then the failed one and the rest again.
    expect(begun).toHaveLength(3 + (migrations.length - 2));
  });

  it('lets tests put their own database in place of the device one', async () => {
    const { db } = await createTestDb();
    setDbForTests(db);
    expect(getDb()).toBe(db);
    expect(openDb()).toBe(db);
    expect(mockSqlite.opened).toEqual([]);
  });
});

describe('app settings', () => {
  const setup = async () => {
    const { db, query } = await createTestDb();
    setDbForTests(db);
    return { query };
  };

  it('returns null for a setting that was never stored', async () => {
    await setup();
    expect(getSetting('language')).toBeNull();
  });

  it('stores a value and reads it back, each key on its own', async () => {
    const { query } = await setup();
    setSetting('language', 'cs');
    setSetting('weather.unit', 'celsius');

    expect(getSetting('language')).toBe('cs');
    expect(getSetting('weather.unit')).toBe('celsius');
    expect(query('SELECT key, value FROM app_settings ORDER BY key')).toEqual([
      { key: 'language', value: 'cs' },
      { key: 'weather.unit', value: 'celsius' },
    ]);
  });

  it('replaces the value of a key that already exists, keeping one row', async () => {
    const { query } = await setup();
    setSetting('language', 'cs');
    setSetting('language', 'en');

    expect(getSetting('language')).toBe('en');
    expect(query('SELECT count(*) AS rows FROM app_settings')).toEqual([{ rows: 1 }]);
  });

  it('deletes a setting when it is set to null, and only that one', async () => {
    const { query } = await setup();
    setSetting('language', 'cs');
    setSetting('tryon.auto', 'off');

    setSetting('language', null);
    // Deleting what is not there is not an error.
    setSetting('never.stored', null);

    expect(getSetting('language')).toBeNull();
    expect(query('SELECT key FROM app_settings')).toEqual([{ key: 'tryon.auto' }]);
  });

  it('keeps an empty string and text with quotes as they are', async () => {
    await setup();
    setSetting('note', '');
    setSetting('weather.city', '{"name":"Ústí nad Labem, \'CZ\'"}');
    expect(getSetting('note')).toBe('');
    expect(getSetting('weather.city')).toBe('{"name":"Ústí nad Labem, \'CZ\'"}');
  });
});

describe('repository on base columns', () => {
  const things = sqliteTable('things', { ...baseColumns, name: text('name').notNull() });

  const setup = async () => {
    const { db, query } = await createTestDb(`
      CREATE TABLE things (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        name TEXT NOT NULL
      );
    `);
    let clock = 1000;
    const repo = createRepository(
      () => db,
      things,
      () => clock++,
    );
    const stored = (id: string) => query(`SELECT * FROM things WHERE id = '${id}'`)[0];
    return { repo, stored, query };
  };

  it('gives a new record a generated id and equal created and updated times', async () => {
    const { repo, stored } = await setup();
    const first = await repo.create({ name: 'Blue shirt' });
    const second = await repo.create({ name: 'Red skirt' });

    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.id).not.toBe(first.id);
    expect(stored(first.id)).toEqual({
      id: first.id,
      name: 'Blue shirt',
      created_at: 1000,
      updated_at: 1000,
      deleted_at: null,
    });
    expect(second).toMatchObject({ createdAt: 1001, updatedAt: 1001 });
  });

  it('keeps an id supplied by the caller', async () => {
    const { repo } = await setup();
    const created = await repo.create({ id: 'job-7', name: 'From an import job' });

    expect(created.id).toBe('job-7');
    expect(await repo.getById('job-7')).toMatchObject({ name: 'From an import job' });
  });

  it('refuses a second record with the same id and keeps the first', async () => {
    const { repo } = await setup();
    await repo.create({ id: 'same', name: 'First' });

    await expect(repo.create({ id: 'same', name: 'Second' })).rejects.toThrow();
    expect((await repo.list()).map((row) => row.name)).toEqual(['First']);
  });

  it('changes the given fields, moves the update time on and leaves the creation time', async () => {
    const { repo } = await setup();
    const created = await repo.create({ name: 'Blue shirt' });

    const updated = await repo.update(created.id, { name: 'Navy shirt' });

    expect(updated).toEqual({ ...created, name: 'Navy shirt', updatedAt: 1001 });
    // An empty patch still counts as a change.
    expect(await repo.update(created.id, {})).toMatchObject({
      name: 'Navy shirt',
      updatedAt: 1002,
    });
  });

  it('returns nothing when updating a record that does not exist', async () => {
    const { repo, query } = await setup();
    expect(await repo.update('missing', { name: 'Anything' })).toBeUndefined();
    expect(query('SELECT count(*) AS rows FROM things')).toEqual([{ rows: 0 }]);
  });

  it('leaves a deleted record exactly as it was when an update is attempted', async () => {
    const { repo, stored } = await setup();
    const created = await repo.create({ name: 'Gone' });
    await repo.softDelete(created.id);
    const before = stored(created.id);

    expect(await repo.update(created.id, { name: 'Changed' })).toBeUndefined();

    expect(stored(created.id)).toEqual(before);
  });

  it('marks a record as deleted with the time, without removing the row', async () => {
    const { repo, stored } = await setup();
    const created = await repo.create({ name: 'Removed' });

    await repo.softDelete(created.id);

    expect(stored(created.id)).toMatchObject({
      name: 'Removed',
      deleted_at: 1001,
      updated_at: 1001,
    });
    expect(await repo.getById(created.id)).toBeUndefined();
  });

  it('brings a deleted record back with its values and a new update time', async () => {
    const { repo } = await setup();
    const created = await repo.create({ name: 'Removed' });
    await repo.softDelete(created.id);

    await repo.restore(created.id);

    expect(await repo.getById(created.id)).toEqual({ ...created, updatedAt: 1002 });
  });

  it('lists only records that are not deleted', async () => {
    const { repo } = await setup();
    const kept = await repo.create({ name: 'Kept' });
    const removed = await repo.create({ name: 'Removed' });
    const other = await repo.create({ name: 'Other' });
    expect(await repo.list()).toHaveLength(3);

    await repo.softDelete(removed.id);
    expect((await repo.list()).map((row) => row.id).sort()).toEqual([kept.id, other.id].sort());

    await repo.restore(removed.id);
    expect((await repo.list()).map((row) => row.name).sort()).toEqual(['Kept', 'Other', 'Removed']);
  });

  it('uses the real clock when none is given', async () => {
    const { db } = await createTestDb(`
      CREATE TABLE things (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        name TEXT NOT NULL
      );
    `);
    const before = Date.now();
    const created = await createRepository(() => db, things).create({ name: 'Now' });
    expect(created.createdAt).toBeGreaterThanOrEqual(before);
    expect(created.createdAt).toBeLessThanOrEqual(Date.now());
  });
});
