import {
  DB_FILE,
  clearStagedBackup,
  createBackupArchive,
  finishRestore,
  hasInterruptedRestore,
  stageBackup,
  swapInStagedBackup,
} from '@/storage/backup';
import { createMemoryFs } from '@/storage/memoryFs';

import { processImportJob, type ImportJobDeps } from '../importActions';
import { createImportProcessor, type ImportJob } from '../importQueue';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('../deviceImages', () => ({ itemImageDeps: {}, toTagImage: jest.fn() }));
jest.mock('@/storage/imageStore', () => ({
  ...jest.requireActual('@/storage/imageStore'),
  imageStore: { uri: (path: string) => path },
}));
jest.mock('@/db/settings', () => ({ getSetting: () => null, setSetting: () => {} }));

const job = (id: string): ImportJob =>
  ({ id, sourcePath: `images/import/${id}.jpg`, status: 'queued', error: null }) as ImportJob;

describe('bulk import, photos queued one by one', () => {
  it('works on two photos at a time although the queue starts with one', async () => {
    const queued: ImportJob[] = [];
    let working = 0;
    let peak = 0;
    const done: string[] = [];
    const processor = createImportProcessor({
      jobs: {
        requeueInterrupted: async () => {},
        claimNext: async () => queued.shift() ?? null,
        markDone: async (id: string) => void done.push(id),
        markFailed: async () => {},
      } as never,
      process: async (next) => {
        working++;
        peak = Math.max(peak, working);
        await new Promise((resolve) => setTimeout(resolve, 15));
        working--;
        return next.id;
      },
    });

    // As the picker hands photos over: enqueue, start, enqueue, start…
    let last: Promise<void> = Promise.resolve();
    for (let index = 0; index < 6; index++) {
      queued.push(job(`p${index}`));
      last = processor.start();
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    await last;
    expect(done).toHaveLength(6);
    expect(peak).toBe(2);
    expect(processor.isRunning()).toBe(false);
  });
});

describe('an import job run again', () => {
  const deps = (overrides: Partial<ImportJobDeps> = {}) => {
    const removed: string[] = [];
    const base = {
      images: {
        reduce: async (photo: { uri: string }) => photo,
        discard: async () => {},
        save: async (_uri: string, _folder: string, extension: string) =>
          `images/items/${removed.length}-${Math.random()}.${extension}`,
        remove: async (path: string) => void removed.push(path),
        resize: async (uri: string) => `${uri}-small`,
        cutout: async () => null,
      },
      sourceUri: (path: string) => `file:///${path}`,
      tag: async () => null,
      itemExists: async () => false,
      createItem: async (_details: unknown, _images: unknown, options: { id?: string }) => ({
        id: options.id,
      }),
      ...overrides,
    } as unknown as ImportJobDeps;
    return { base, removed };
  };

  it('removes the copied photo when the item was already made', async () => {
    const { base, removed } = deps({ itemExists: async () => true });
    expect(await processImportJob(job('a'), base)).toBe('a');
    expect(removed).toEqual(['images/import/a.jpg']);
  });

  it('removes the stored pictures when the item cannot be created, and keeps the photo for a retry', async () => {
    const { base, removed } = deps({
      createItem: async () => {
        throw new Error('database is full');
      },
    });
    await expect(processImportJob(job('b'), base)).rejects.toThrow('database is full');
    // The original and the thumbnail that had been stored are gone; the source photo stays.
    expect(removed).toHaveLength(2);
    expect(removed.every((path) => path.startsWith('images/items/'))).toBe(true);
  });
});

describe('a restore that worked but could not tidy up', () => {
  const b64 = (text: string) => Buffer.from(text).toString('base64');
  const sqlite = (label: string) => b64('SQLite format 3\u0000' + label);

  it('is not undone at the next start', async () => {
    const archive = await createBackupArchive(
      createMemoryFs({ [DB_FILE]: sqlite('theirs'), 'images/items/theirs.png': b64('t') }).fs,
      { schemaVersion: 7, appVersion: '0.1.0' },
    );
    const device = createMemoryFs({ [DB_FILE]: sqlite('mine'), 'images/items/mine.png': b64('m') });
    await stageBackup(device.fs, archive, 7);
    await swapInStagedBackup(device.fs);

    // Tidying fails outright: the old data cannot be moved or deleted right now.
    const { move, remove } = device.fs;
    device.fs.move = async () => {
      throw new Error('busy');
    };
    device.fs.remove = async () => {
      throw new Error('busy');
    };
    await expect(finishRestore(device.fs)).rejects.toThrow('busy');
    Object.assign(device.fs, { move, remove });

    // Next start: nothing to undo, and the leftovers are cleared away.
    expect(await hasInterruptedRestore(device.fs)).toBe(false);
    await clearStagedBackup(device.fs);
    expect(Object.fromEntries(device.files)).toEqual({
      [DB_FILE]: sqlite('theirs'),
      'images/items/theirs.png': b64('t'),
    });
  });
});
