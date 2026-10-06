import JSZip from 'jszip';

import { LATEST_SCHEMA_VERSION } from '@/db/migrations';

import { BackupError, DB_FILE, writeBackupArchive } from '../backup';
import {
  exportBackup,
  importBackup,
  pickBackupFile,
  recoverInterruptedRestore,
} from '../backupActions';
import { createMemoryFs } from '../memoryFs';
import { memoryArchive } from '../zip';

/** Everything that happened, in order, across the database, the archive file and the share sheet. */
let mockLog: string[] = [];

/** The app's document directory. */
const mockDevice = { memory: createMemoryFs(), unsafeMoves: [] as string[] };

/** Files outside the document directory (the cache, a picked document), as raw bytes by URI. */
const mockFiles = {
  bytes: new Map<string, Uint8Array>(),
  handles: [] as { uri: string; closed: number; requests: number[]; overRead: boolean }[],
  createOptions: [] as unknown[],
  writes: 0,
  /** The write, counted from one, that fails with a full disk. */
  failWriteAt: null as number | null,
  hideSize: false,
};

const mockDb = {
  open: true,
  locked: false,
  /** Contents of a database file that cannot be opened or migrated. */
  unopenable: null as string | null,
};

/** App settings, which live in the database that a restore replaces. */
const mockSettings = new Map<string, string>();

const mockApp = { version: '1.2.3' as string | null };
const mockShare = jest.fn(async (..._args: unknown[]) => void mockLog.push('share'));
const mockPick = jest.fn(async (..._args: unknown[]): Promise<unknown> => ({ canceled: true }));

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-application', () => ({
  get nativeApplicationVersion() {
    return mockApp.version;
  },
}));
jest.mock('expo-sharing', () => ({ shareAsync: (...args: unknown[]) => mockShare(...args) }));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockPick(...args),
}));

jest.mock('expo-file-system', () => {
  class FakeFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map((part) => (typeof part === 'string' ? part : part.uri))
        .reduce((base, name) => (base.endsWith('/') ? base + name : `${base}/${name}`));
    }
    get exists() {
      return mockFiles.bytes.has(this.uri);
    }
    create(options?: { overwrite?: boolean }) {
      mockLog.push(`file:create:${this.uri}`);
      mockFiles.createOptions.push(options);
      if (this.exists && !options?.overwrite) throw new Error('File already exists');
      mockFiles.bytes.set(this.uri, new Uint8Array(0));
    }
    delete() {
      mockLog.push(`file:delete:${this.uri}`);
      if (!this.exists) throw new Error('No such file');
      mockFiles.bytes.delete(this.uri);
    }
    open() {
      const uri = this.uri;
      if (!this.exists) throw new Error('No such file');
      const record = { uri, closed: 0, requests: [] as number[], overRead: false };
      mockFiles.handles.push(record);
      let position = 0;
      const requireOpen = () => {
        if (record.closed > 0) throw new Error('The file handle is closed');
      };
      return {
        get size() {
          return mockFiles.hideSize ? null : mockFiles.bytes.get(uri)!.length;
        },
        writeBytes(chunk: Uint8Array) {
          requireOpen();
          if (++mockFiles.writes === mockFiles.failWriteAt) throw new Error('disk full');
          const before = mockFiles.bytes.get(uri)!;
          const after = new Uint8Array(before.length + chunk.length);
          after.set(before);
          after.set(chunk, before.length);
          mockFiles.bytes.set(uri, after);
        },
        readBytes(length: number) {
          requireOpen();
          const all = mockFiles.bytes.get(uri)!;
          record.requests.push(length);
          if (length <= 0 || position + length > all.length) record.overRead = true;
          const piece = all.slice(position, position + length);
          position += piece.length;
          return piece;
        },
        close() {
          record.closed++;
          mockLog.push('file:close');
        },
      };
    }
  }
  return { File: FakeFile, Paths: { cache: { uri: 'file:///cache/' } } };
});

jest.mock('../fs', () => ({
  // The adapter is captured when modules load, so it forwards to whichever disk the test set up.
  expoFs: new Proxy(
    {},
    {
      get:
        (_target, name: string) =>
        (...args: unknown[]) => {
          // The live database and the live photos may only move while nothing can open the database.
          const live = args.some((path) => path === 'SQLite/closet.db' || path === 'images');
          if (name === 'move' && live && (mockDb.open || !mockDb.locked)) {
            mockDevice.unsafeMoves.push(String(args[1]));
          }
          const fs = mockDevice.memory.fs as unknown as Record<
            string,
            (...inner: unknown[]) => unknown
          >;
          return fs[name](...args);
        },
    },
  ),
}));

jest.mock('@/db/settings', () => ({
  setSetting: (key: string, value: string | null) => {
    mockLog.push(`setting:${key}`);
    if (!mockDb.open) throw new Error('The database is closed');
    if (value === null) mockSettings.delete(key);
    else mockSettings.set(key, value);
  },
}));

jest.mock('@/db/client', () => ({
  checkpointDb: () => void mockLog.push('db:checkpoint'),
  closeDb: () => {
    mockLog.push('db:close');
    mockDb.open = false;
  },
  setDbLocked: (value: boolean) => {
    mockLog.push(`db:lock:${value}`);
    mockDb.locked = value;
  },
  openDb: () => {
    mockLog.push('db:open');
    if (mockDb.locked) throw new Error('The database is being replaced and cannot be opened yet.');
    const file = mockDevice.memory.files.get('SQLite/closet.db');
    if (file !== undefined && file === mockDb.unopenable) throw new Error('file is not a database');
    mockDb.open = true;
  },
}));

const b64 = (text: string) => Buffer.from(text).toString('base64');
const sqlite = (label: string) => b64('SQLite format 3\u0000' + label);
const text = (base64: string | undefined) => Buffer.from(base64 ?? '', 'base64').toString();
const dbLog = () => mockLog.filter((entry) => entry.startsWith('db:'));
const deviceFiles = () => Object.fromEntries(mockDevice.memory.files);

const mine = () => ({
  [DB_FILE]: sqlite('mine'),
  [`${DB_FILE}-wal`]: b64('my-wal'),
  'images/items/mine.png': b64('my picture'),
});
const theirs = () => ({
  [DB_FILE]: sqlite('from backup'),
  'images/items/new.png': b64('new picture'),
  'images/avatar/me.jpg': b64('me'),
});

/** A backup archive of the given files, as it would sit in the cache after being picked. */
const archiveOf = async (
  files: Record<string, string>,
  schemaVersion = LATEST_SCHEMA_VERSION,
): Promise<Uint8Array> => {
  const archive = memoryArchive();
  await writeBackupArchive(
    createMemoryFs(files).fs,
    { schemaVersion, appVersion: '1.0.0' },
    archive.writer,
  );
  return archive.bytes();
};

const PICKED = 'file:///cache/DocumentPicker/backup.zip';

const expectBackupError = async (promise: Promise<unknown>, reason: string) => {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(BackupError);
  expect((error as BackupError).reason).toBe(reason);
};

beforeEach(() => {
  mockLog = [];
  mockDevice.memory = createMemoryFs(mine());
  mockDevice.unsafeMoves = [];
  mockFiles.bytes.clear();
  mockFiles.handles = [];
  mockFiles.createOptions = [];
  mockFiles.writes = 0;
  mockFiles.failWriteAt = null;
  mockFiles.hideSize = false;
  mockDb.open = true;
  mockDb.locked = false;
  mockDb.unopenable = null;
  mockApp.version = '1.2.3';
  mockSettings.clear();
  mockShare.mockClear();
  mockPick.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('exporting a backup', () => {
  const TARGET = 'file:///cache/closet-backup-2026-10-06.zip';
  const atNoon = () =>
    jest.useFakeTimers({
      now: new Date('2026-10-06T10:00:00Z'),
      doNotFake: [
        'nextTick',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
      ],
    });

  it('checkpoints the database, writes a complete archive to a dated file in the cache and shares it', async () => {
    atNoon();
    mockDevice.memory = createMemoryFs({ ...mine(), 'images/renders/r.jpg': b64('render') });

    await exportBackup();

    // The file on disk must be complete before it is read.
    expect(mockLog[0]).toBe('db:checkpoint');
    expect(mockLog[1]).toBe(`file:create:${TARGET}`);
    expect(mockFiles.createOptions).toEqual([{ overwrite: true }]);

    const zip = await JSZip.loadAsync(mockFiles.bytes.get(TARGET)!, { checkCRC32: true });
    expect(Object.keys(zip.files).sort()).toEqual([
      'closet.db',
      'images/items/mine.png',
      'images/renders/r.jpg',
      'manifest.json',
    ]);
    expect(JSON.parse(await zip.file('manifest.json')!.async('string'))).toEqual({
      app: 'closet',
      formatVersion: 1,
      schemaVersion: LATEST_SCHEMA_VERSION,
      appVersion: '1.2.3',
      createdAt: '2026-10-06T10:00:00.000Z',
    });
    expect(await zip.file('closet.db')!.async('base64')).toBe(sqlite('mine'));
    expect(await zip.file('images/items/mine.png')!.async('string')).toBe('my picture');

    // The file is closed once, before it is handed to the share sheet.
    expect(mockFiles.handles).toHaveLength(1);
    expect(mockFiles.handles[0]).toMatchObject({ uri: TARGET, closed: 1 });
    expect(mockLog.indexOf('file:close')).toBeLessThan(mockLog.indexOf('share'));
    expect(mockShare).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith(TARGET, {
      mimeType: 'application/zip',
      UTI: 'public.zip-archive',
    });
    // The live data is only read.
    expect(deviceFiles()).toEqual({ ...mine(), 'images/renders/r.jpg': b64('render') });
  });

  it('writes the archive in pieces instead of one block', async () => {
    atNoon();
    await exportBackup();
    // A header, a name and the contents for each of three entries, then the index.
    expect(mockFiles.writes).toBeGreaterThanOrEqual(9);
  });

  it('replaces an earlier backup of the same day instead of adding to it', async () => {
    atNoon();
    mockFiles.bytes.set(TARGET, Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]));

    await exportBackup();

    const zip = await JSZip.loadAsync(mockFiles.bytes.get(TARGET)!, { checkCRC32: true });
    expect(Object.keys(zip.files).sort()).toEqual([
      'closet.db',
      'images/items/mine.png',
      'manifest.json',
    ]);
  });

  it('records an unknown app version when the platform does not tell it', async () => {
    atNoon();
    mockApp.version = null;

    await exportBackup();

    const zip = await JSZip.loadAsync(mockFiles.bytes.get(TARGET)!);
    expect(JSON.parse(await zip.file('manifest.json')!.async('string')).appVersion).toBe('unknown');
  });

  it('deletes the half-written file, closes it and shares nothing when a write fails', async () => {
    atNoon();
    // The manifest goes out in three writes; the database entry fails part-way.
    mockFiles.failWriteAt = 5;

    await expect(exportBackup()).rejects.toThrow('disk full');

    expect(mockFiles.bytes.has(TARGET)).toBe(false);
    expect(mockFiles.handles[0].closed).toBe(1);
    // Closed first, then removed.
    expect(mockLog.slice(-2)).toEqual(['file:close', `file:delete:${TARGET}`]);
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('cleans up in the same way when the database file cannot be read', async () => {
    atNoon();
    mockDevice.memory = createMemoryFs({ 'images/items/mine.png': b64('my picture') });

    await expect(exportBackup()).rejects.toThrow(`No such file: ${DB_FILE}`);

    expect(mockFiles.bytes.size).toBe(0);
    expect(mockFiles.handles[0].closed).toBe(1);
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('keeps the archive when only the sharing fails, and reports the failure', async () => {
    atNoon();
    mockShare.mockRejectedValueOnce(new Error('sharing is not available'));

    await expect(exportBackup()).rejects.toThrow('sharing is not available');

    expect(mockFiles.bytes.get(TARGET)!.length).toBeGreaterThan(0);
    expect(mockFiles.handles[0].closed).toBe(1);
  });
});

describe('choosing a backup file', () => {
  it('returns where the chosen file was copied to', async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: PICKED, name: 'backup.zip' }] });

    expect(await pickBackupFile()).toBe(PICKED);
    expect(mockPick).toHaveBeenCalledWith({ copyToCacheDirectory: true });
  });

  it('returns null when the user cancels', async () => {
    mockPick.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickBackupFile()).toBeNull();
  });

  it('returns null when the picker answers without a file', async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [] });
    expect(await pickBackupFile()).toBeNull();
  });
});

describe('importing a backup', () => {
  it('rejects a file that is not there and touches nothing', async () => {
    await expectBackupError(importBackup(PICKED), 'invalid');

    expect(mockLog).toEqual([]);
    expect(mockFiles.handles).toEqual([]);
    expect(deviceFiles()).toEqual(mine());
  });

  it('replaces all data with the archive, with the database closed and locked while files move', async () => {
    mockFiles.bytes.set(PICKED, await archiveOf(theirs()));

    await importBackup(PICKED);

    // Exactly what was in the backup: no old picture, no old write-ahead log, no leftovers.
    expect(deviceFiles()).toEqual(theirs());
    expect(mockLog).toEqual([
      // The archive is unpacked and let go of before the database is touched.
      'file:close',
      `file:delete:${PICKED}`,
      'db:lock:true',
      'db:close',
      'db:lock:false',
      'db:open',
      'db:lock:false',
      'db:open',
      'setting:ai.status.anthropic',
      'setting:ai.status.image',
    ]);
    expect(mockDevice.unsafeMoves).toEqual([]);
    expect(mockDb).toMatchObject({ open: true, locked: false });
    expect(mockFiles.handles).toHaveLength(1);
    expect(mockFiles.handles[0]).toMatchObject({ uri: PICKED, closed: 1 });
  });

  it('deletes the copy of the archive that the picker made, whether the restore works or not', async () => {
    mockFiles.bytes.set(PICKED, await archiveOf(theirs()));
    await importBackup(PICKED);
    expect(mockFiles.bytes.has(PICKED)).toBe(false);

    mockFiles.bytes.set(PICKED, Uint8Array.from(Buffer.from('not a backup')));
    await expectBackupError(importBackup(PICKED), 'invalid');
    expect(mockFiles.bytes.has(PICKED)).toBe(false);
  });

  it('forgets whether the provider keys were found to work, and nothing else, once the data is restored', async () => {
    mockSettings.set('ai.status.anthropic', 'connected');
    mockSettings.set('ai.status.image', 'rejected');
    mockSettings.set('language', 'cs');
    mockFiles.bytes.set(PICKED, await archiveOf(theirs()));

    await importBackup(PICKED);

    // The keys stay on the phone the backup was made on; what was tested there says nothing here.
    expect(Object.fromEntries(mockSettings)).toEqual({ language: 'cs' });
  });

  it('keeps what is known about the keys when the restore is rejected', async () => {
    mockSettings.set('ai.status.anthropic', 'connected');
    mockFiles.bytes.set(PICKED, await archiveOf(theirs(), LATEST_SCHEMA_VERSION + 1));

    await expectBackupError(importBackup(PICKED), 'newer');

    expect(Object.fromEntries(mockSettings)).toEqual({ 'ai.status.anthropic': 'connected' });
  });

  it('counts as restored even when the set-aside data cannot be cleared away afterwards', async () => {
    mockFiles.bytes.set(PICKED, await archiveOf(theirs()));
    mockDevice.memory.failMoveTo.add('restore-discard');

    await expect(importBackup(PICKED)).resolves.toBeUndefined();

    expect(mockDevice.memory.files.get(DB_FILE)).toBe(sqlite('from backup'));
    expect(text(mockDevice.memory.files.get('images/items/new.png'))).toBe('new picture');
    expect(mockDb).toMatchObject({ open: true, locked: false });
  });

  it('reads the archive one piece at a time and never past its end', async () => {
    const archive = await archiveOf({
      ...theirs(),
      'images/items/big.png': Buffer.alloc(50_000, 7).toString('base64'),
    });
    mockFiles.bytes.set(PICKED, archive);

    await importBackup(PICKED);

    const [handle] = mockFiles.handles;
    expect(handle.overRead).toBe(false);
    expect(Math.max(...handle.requests)).toBe(50_000);
    expect(handle.requests.reduce((sum, length) => sum + length, 0)).toBeLessThanOrEqual(
      archive.length,
    );
    expect(text(mockDevice.memory.files.get('images/avatar/me.jpg'))).toBe('me');
  });

  it('rejects an archive that is cut off, without asking the file for bytes it does not have', async () => {
    const archive = await archiveOf({
      ...theirs(),
      'images/zz/last.png': Buffer.alloc(4000, 9).toString('base64'),
    });
    // Cut in the middle of the last picture: its header promises more than is left.
    const cut = archive.slice(0, archive.length - 2500);
    mockFiles.bytes.set(PICKED, cut);

    await expectBackupError(importBackup(PICKED), 'invalid');

    const [handle] = mockFiles.handles;
    expect(handle.overRead).toBe(false);
    // The picture that claims 4000 bytes is not read at all, not even the part that is there.
    expect(Math.max(...handle.requests)).toBeLessThan(1000);
    expect(handle.requests.reduce((sum, length) => sum + length, 0)).toBeLessThan(
      cut.length - 1000,
    );
    expect(handle.closed).toBe(1);
    expect(dbLog()).toEqual([]);
    expect(deviceFiles()).toEqual(mine());
  });

  it('rejects a file that is not a backup, closes it and leaves the database open and the data as it was', async () => {
    mockFiles.bytes.set(PICKED, Uint8Array.from(Buffer.from('just some holiday notes')));

    await expectBackupError(importBackup(PICKED), 'invalid');

    expect(mockLog).toEqual(['file:close', `file:delete:${PICKED}`]);
    expect(mockDb).toMatchObject({ open: true, locked: false });
    expect(deviceFiles()).toEqual(mine());
  });

  it('rejects an empty file', async () => {
    mockFiles.bytes.set(PICKED, new Uint8Array(0));

    await expectBackupError(importBackup(PICKED), 'invalid');

    expect(mockFiles.handles[0]).toMatchObject({ closed: 1, requests: [] });
    expect(deviceFiles()).toEqual(mine());
  });

  it('treats a file of unknown size as empty rather than reading blindly', async () => {
    mockFiles.bytes.set(PICKED, await archiveOf(theirs()));
    mockFiles.hideSize = true;

    await expectBackupError(importBackup(PICKED), 'invalid');

    expect(mockFiles.handles[0]).toMatchObject({ closed: 1, requests: [] });
    expect(dbLog()).toEqual([]);
    expect(deviceFiles()).toEqual(mine());
  });

  it('says so when the backup comes from a newer version of the app, and changes nothing', async () => {
    mockFiles.bytes.set(PICKED, await archiveOf(theirs(), LATEST_SCHEMA_VERSION + 1));

    await expectBackupError(importBackup(PICKED), 'newer');

    expect(mockFiles.handles[0].closed).toBe(1);
    expect(dbLog()).toEqual([]);
    expect(deviceFiles()).toEqual(mine());
  });

  it('accepts a backup from an older version of the app', async () => {
    mockFiles.bytes.set(PICKED, await archiveOf(theirs(), 1));

    await importBackup(PICKED);

    expect(deviceFiles()).toEqual(theirs());
    expect(mockDb).toMatchObject({ open: true, locked: false });
  });

  it('puts the previous data back when the restored database will not open', async () => {
    mockFiles.bytes.set(PICKED, await archiveOf(theirs()));
    mockDb.unopenable = sqlite('from backup');
    const before = { ...mine() };
    // The write-ahead log belongs to a database that was closed; it is not kept.
    delete (before as Record<string, string>)[`${DB_FILE}-wal`];

    await expectBackupError(importBackup(PICKED), 'invalid');

    expect(deviceFiles()).toEqual(before);
    expect(dbLog()).toEqual([
      'db:lock:true',
      'db:close',
      'db:lock:false',
      // The restored file is tried and fails.
      'db:open',
      'db:close',
      'db:lock:true',
      // After the roll-back the previous database opens again.
      'db:lock:false',
      'db:open',
    ]);
    expect(mockDevice.unsafeMoves).toEqual([]);
    expect(mockDb).toMatchObject({ open: true, locked: false });
    expect(mockFiles.handles[0].closed).toBe(1);
  });

  it('reopens and unlocks the database when moving the files into place fails', async () => {
    mockFiles.bytes.set(PICKED, await archiveOf(theirs()));
    mockDevice.memory.failMoveTo.add('images');
    const before = { ...mine() };
    delete (before as Record<string, string>)[`${DB_FILE}-wal`];

    await expect(importBackup(PICKED)).rejects.toThrow('Cannot move to images');

    expect(deviceFiles()).toEqual(before);
    expect(dbLog()).toEqual(['db:lock:true', 'db:close', 'db:lock:false', 'db:open']);
    expect(mockDb).toMatchObject({ open: true, locked: false });
  });

  it('restores onto a device that has no data yet', async () => {
    mockDevice.memory = createMemoryFs();
    mockFiles.bytes.set(PICKED, await archiveOf(theirs()));

    await importBackup(PICKED);

    expect(deviceFiles()).toEqual(theirs());
  });
});

describe('recovering from an interrupted restore', () => {
  it('has nothing to put back after a normal start, and clears what an abandoned restore unpacked', async () => {
    mockDevice.memory = createMemoryFs({
      ...mine(),
      'restore-staging/closet.db': sqlite('half unpacked'),
      'restore-staging/images/items/x.png': b64('x'),
      'restore-discard/closet.db': sqlite('on its way out'),
    });

    expect(await recoverInterruptedRestore()).toBe(false);

    expect(deviceFiles()).toEqual(mine());
    // The database that is in use is not disturbed.
    expect(mockLog).toEqual([]);
    expect(mockDb).toMatchObject({ open: true, locked: false });
  });

  it('puts the set-aside data back in place of the empty stand-in and reopens the database', async () => {
    mockDevice.memory = createMemoryFs({
      // The app was closed after the data in use had been moved aside.
      'restore-previous/closet.db': sqlite('mine'),
      'restore-previous/images/items/mine.png': b64('my picture'),
      // Created by the launch that follows, before anything could check.
      [DB_FILE]: sqlite('empty stand-in'),
      [`${DB_FILE}-wal`]: b64('stand-in wal'),
      [`${DB_FILE}-shm`]: b64('stand-in shm'),
      'images/items/half-restored.png': b64('from the backup'),
      'restore-staging/images/items/x.png': b64('x'),
    });

    expect(await recoverInterruptedRestore()).toBe(true);

    expect(deviceFiles()).toEqual({
      [DB_FILE]: sqlite('mine'),
      'images/items/mine.png': b64('my picture'),
    });
    expect(mockLog).toEqual(['db:lock:true', 'db:close', 'db:lock:false', 'db:open']);
    expect(mockDevice.unsafeMoves).toEqual([]);
    expect(mockDb).toMatchObject({ open: true, locked: false });
  });

  it('puts the photos back when the app was closed after they were set aside and before the database was', async () => {
    mockDevice.memory = createMemoryFs({
      [DB_FILE]: sqlite('mine'),
      'restore-previous/images/items/mine.png': b64('my picture'),
      'restore-staging/closet.db': sqlite('from backup'),
    });

    expect(await recoverInterruptedRestore()).toBe(true);

    expect(deviceFiles()).toEqual({
      [DB_FILE]: sqlite('mine'),
      'images/items/mine.png': b64('my picture'),
    });
    expect(mockDb).toMatchObject({ open: true, locked: false });
  });

  it('is done after one recovery: the next start finds nothing to do', async () => {
    mockDevice.memory = createMemoryFs({
      'restore-previous/closet.db': sqlite('mine'),
      [DB_FILE]: sqlite('empty stand-in'),
    });

    expect(await recoverInterruptedRestore()).toBe(true);
    mockLog = [];
    expect(await recoverInterruptedRestore()).toBe(false);

    expect(mockLog).toEqual([]);
    expect(deviceFiles()).toEqual({ [DB_FILE]: sqlite('mine') });
  });

  it('unlocks and reopens the database even when putting the data back fails', async () => {
    mockDevice.memory = createMemoryFs({
      'restore-previous/closet.db': sqlite('mine'),
      [DB_FILE]: sqlite('empty stand-in'),
    });
    mockDevice.memory.failMoveTo.add(DB_FILE);

    await expect(recoverInterruptedRestore()).rejects.toThrow(`Cannot move to ${DB_FILE}`);

    expect(mockLog).toEqual(['db:lock:true', 'db:close', 'db:lock:false', 'db:open']);
    expect(mockDb).toMatchObject({ open: true, locked: false });
    // The set-aside data is still there for the next attempt.
    expect(mockDevice.memory.files.get('restore-previous/closet.db')).toBe(sqlite('mine'));
  });
});
