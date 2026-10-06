import { drizzle } from 'drizzle-orm/sql-js';
import initSqlJs from 'sql.js';

import type { Db } from '@/db/client';
import { LATEST_SCHEMA_VERSION } from '@/db/migrations';
import { schema } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import {
  DB_FILE,
  createBackupArchive,
  finishRestore,
  stageBackup,
  swapInStagedBackup,
} from '@/storage/backup';
import { createMemoryFs } from '@/storage/memoryFs';
import { createSessionRepository } from '@/stylist/sessions';

import { createTripRepository } from '../repository';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('@/db/settings', () => ({ getSetting: () => null, setSetting: () => {} }));

describe('backup of smart-feature data', () => {
  it('carries trips, their days and checklist, and stylist sessions through export and import', async () => {
    const { db, sqlite } = await createTestDb();
    const trips = createTripRepository(() => db);
    const trip = await trips.create({
      name: 'Rome',
      place: { name: 'Rome, Italy', latitude: 41.9, longitude: 12.5 },
      startDay: '2026-11-01',
      endDay: '2026-11-02',
    });
    const pieces = [{ itemId: 'tee', slot: 'top' as const, position: 0 }];
    await trips.setDay(trip.id, '2026-11-02', { pieces, activity: 'formal' });
    await trips.setItemPacked(trip.id, 'tee', true);
    await trips.addText(trip.id, 'Passport');
    const sessions = createSessionRepository(() => db);
    await sessions.start({
      request: 'Dinner',
      day: null,
      itemId: null,
      proposals: [{ rationale: 'r', pieces }],
    });

    // The backup holds the database file as it is on disk.
    const source = createMemoryFs({
      [DB_FILE]: Buffer.from(sqlite.export()).toString('base64'),
    });
    const archive = await createBackupArchive(source.fs, {
      schemaVersion: LATEST_SCHEMA_VERSION,
      appVersion: '0.1.0',
    });

    const target = createMemoryFs();
    await stageBackup(target.fs, archive, LATEST_SCHEMA_VERSION);
    await swapInStagedBackup(target.fs);
    await finishRestore(target.fs);

    const SQL = await initSqlJs();
    const restored = drizzle(new SQL.Database(Buffer.from(target.files.get(DB_FILE)!, 'base64')), {
      schema,
    }) as unknown as Db;
    const [loaded] = await createTripRepository(() => restored).list('2026-10-06');
    expect(loaded).toMatchObject({ id: trip.id, name: 'Rome', startDay: '2026-11-01' });
    expect(loaded.days).toEqual([
      { day: '2026-11-01', activity: null, pieces: [], outfitId: null },
      { day: '2026-11-02', activity: 'formal', pieces, outfitId: null },
    ]);
    expect(loaded.packing.map((entry) => [entry.kind, entry.label, entry.packed]).sort()).toEqual([
      ['item', null, true],
      ['text', 'Passport', false],
    ]);
    const [session] = await createSessionRepository(() => restored).list();
    expect(session.turns[0].proposals[0].pieces).toEqual(pieces);
  });
});
