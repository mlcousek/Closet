import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { runMigrations, migrations, LATEST_SCHEMA_VERSION } from '../migrations';
import { createRepository } from '../repository';
import { baseColumns } from '../schema';
import { createTestDb } from '../testing';

jest.mock('expo-crypto', () => ({
  randomUUID: () => require('node:crypto').randomUUID(),
}));

describe('migrations', () => {
  it('applies all migrations to a new database', async () => {
    const { raw, query } = await createTestDb();
    expect(raw.getUserVersion()).toBe(LATEST_SCHEMA_VERSION);
    const tables = query("SELECT name FROM sqlite_master WHERE type = 'table'").map(
      (row) => row.name,
    );
    expect(tables).toContain('app_settings');
  });

  it('keeps existing data and only applies newer migrations', async () => {
    const { raw, query } = await createTestDb();
    raw.exec("INSERT INTO app_settings (key, value) VALUES ('language', 'cs')");

    const next = [
      ...migrations,
      {
        version: LATEST_SCHEMA_VERSION + 1,
        sql: "ALTER TABLE app_settings ADD COLUMN note TEXT DEFAULT ''",
      },
    ];
    expect(runMigrations(raw, next)).toBe(LATEST_SCHEMA_VERSION + 1);
    // Running again is a no-op.
    expect(runMigrations(raw, next)).toBe(LATEST_SCHEMA_VERSION + 1);

    expect(query('SELECT key, value, note FROM app_settings')).toEqual([
      { key: 'language', value: 'cs', note: '' },
    ]);
  });

  it('rolls back a failing migration and leaves the version unchanged', async () => {
    const { raw, query } = await createTestDb();
    const broken = [
      ...migrations,
      {
        version: LATEST_SCHEMA_VERSION + 1,
        sql: 'CREATE TABLE half_done (id TEXT); THIS IS NOT SQL;',
      },
    ];
    expect(() => runMigrations(raw, broken)).toThrow();
    expect(raw.getUserVersion()).toBe(LATEST_SCHEMA_VERSION);
    const tables = query("SELECT name FROM sqlite_master WHERE type = 'table'").map(
      (row) => row.name,
    );
    expect(tables).not.toContain('half_done');
  });
});

describe('base repository', () => {
  const things = sqliteTable('things', { ...baseColumns, name: text('name').notNull() });

  const setup = async () => {
    const { db } = await createTestDb(`
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
    return { repo };
  };

  it('creates a record with an id and timestamps', async () => {
    const { repo } = await setup();
    const created = await repo.create({ name: 'Blue shirt' });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created).toMatchObject({
      name: 'Blue shirt',
      createdAt: 1000,
      updatedAt: 1000,
      deletedAt: null,
    });
  });

  it('updates fields and the update timestamp', async () => {
    const { repo } = await setup();
    const created = await repo.create({ name: 'Blue shirt' });
    const updated = await repo.update(created.id, { name: 'Navy shirt' });
    expect(updated).toMatchObject({ name: 'Navy shirt', createdAt: 1000, updatedAt: 1001 });
  });

  it('hides a deleted record and brings it back unchanged on restore', async () => {
    const { repo } = await setup();
    const kept = await repo.create({ name: 'Kept' });
    const removed = await repo.create({ name: 'Removed' });

    await repo.softDelete(removed.id);
    expect((await repo.list()).map((row) => row.id)).toEqual([kept.id]);
    expect(await repo.getById(removed.id)).toBeUndefined();

    await repo.restore(removed.id);
    expect(await repo.getById(removed.id)).toMatchObject({ name: 'Removed', deletedAt: null });
    expect(await repo.list()).toHaveLength(2);
  });

  it('does not update a deleted record', async () => {
    const { repo } = await setup();
    const created = await repo.create({ name: 'Gone' });
    await repo.softDelete(created.id);
    expect(await repo.update(created.id, { name: 'Changed' })).toBeUndefined();
    await repo.restore(created.id);
    expect(await repo.getById(created.id)).toMatchObject({ name: 'Gone' });
  });
});
