import JSZip from 'jszip';

import {
  BackupError,
  DB_FILE,
  clearStagedBackup,
  hasInterruptedRestore,
  rollbackRestore,
  stageBackup,
  stageBackupFrom,
  swapInStagedBackup,
  writeBackupArchive,
  createBackupArchive,
} from '../backup';
import { createMemoryFs } from '../memoryFs';
import { cleanTemporaryFiles, type TempFileDeps } from '../tempFiles';
import {
  ZipError,
  base64ToBytes,
  bytesToBase64,
  bytesToText,
  crc32,
  createZipWriter,
  memoryArchive,
  readZip,
  textToBytes,
} from '../zip';

jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/' }));
jest.mock('expo-file-system', () => ({ File: class {} }));

const b64 = (text: string) => Buffer.from(text).toString('base64');
const sqlite = (label: string) => b64('SQLite format 3\u0000' + label);
const bytesOf = (length: number, seed = 1) =>
  Uint8Array.from({ length }, (_, index) => (index * 31 + seed) & 0xff);

describe('encoding helpers', () => {
  it('computes the standard checksum', () => {
    expect(crc32(textToBytes('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('converts bytes to base64 and back for every length', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 4095, 12288, 12289, 30000]) {
      const bytes = bytesOf(length);
      const text = bytesToBase64(bytes);
      expect(text).toBe(Buffer.from(bytes).toString('base64'));
      expect(Array.from(base64ToBytes(text))).toEqual(Array.from(bytes));
    }
    expect(() => base64ToBytes('not base64!')).toThrow(ZipError);
    expect(() => base64ToBytes('abc')).toThrow(ZipError);
  });

  it('writes and reads names beyond ASCII', () => {
    const name = 'Kč – žluťoučký 👗';
    expect(bytesToText(textToBytes(name))).toBe(name);
    expect(Array.from(textToBytes(name))).toEqual(Array.from(Buffer.from(name, 'utf8')));
  });
});

describe('zip writer and reader', () => {
  const build = async (files: Record<string, Uint8Array>) => {
    const archive = memoryArchive();
    const zip = createZipWriter(archive.writer, new Date(2026, 9, 6, 12, 30));
    for (const [path, data] of Object.entries(files)) await zip.add(path, data);
    await zip.finish();
    return archive;
  };
  const files = {
    'manifest.json': textToBytes('{"a":1}'),
    'images/items/šaty.png': bytesOf(5000),
    'empty.bin': new Uint8Array(0),
  };

  it('writes an archive an ordinary zip tool can open', async () => {
    const archive = await build(files);
    const zip = await JSZip.loadAsync(archive.bytes(), { checkCRC32: true });
    expect(Object.keys(zip.files).sort()).toEqual(Object.keys(files).sort());
    expect(Array.from(await zip.file('images/items/šaty.png')!.async('uint8array'))).toEqual(
      Array.from(files['images/items/šaty.png']),
    );
  });

  it('reads back what it wrote, one file at a time and in order', async () => {
    const archive = await build(files);
    const seen: [string, number][] = [];
    const count = await readZip(archive.reader(), (path, data) => {
      seen.push([path, data.length]);
    });
    expect(count).toBe(3);
    expect(seen).toEqual([
      ['manifest.json', 7],
      ['images/items/šaty.png', 5000],
      ['empty.bin', 0],
    ]);
  });

  it('reads an uncompressed archive made by another tool, skipping folders', async () => {
    const other = new JSZip();
    other.file('a.txt', 'hello');
    other.folder('images')!.file('b.bin', bytesOf(100));
    const made = await other.generateAsync({ type: 'uint8array', compression: 'STORE' });
    const seen: string[] = [];
    await readZip(memoryArchive(made).reader(), (path) => void seen.push(path));
    expect(seen).toEqual(['a.txt', 'images/b.bin']);
  });

  it('refuses a compressed archive, a damaged file, a cut-off archive and other files', async () => {
    const other = new JSZip();
    other.file('a.txt', 'hello hello hello hello hello');
    const deflated = await other.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const read = (bytes: Uint8Array) => readZip(memoryArchive(bytes).reader(), () => {});
    await expect(read(deflated)).rejects.toThrow(ZipError);

    const good = (await build(files)).bytes();
    const damaged = good.slice();
    // One byte inside the picture, past the headers of the first two entries.
    damaged[200] ^= 0xff;
    await expect(read(damaged)).rejects.toThrow(/Damaged/);
    await expect(read(good.slice(0, 3000))).rejects.toThrow(/too early/);
    await expect(read(textToBytes('this is not an archive'))).rejects.toThrow(/Not a zip/);
    await expect(read(new Uint8Array(0))).rejects.toThrow(/Not a zip/);
  });
});

describe('backup, file by file', () => {
  const info = { schemaVersion: 7, appVersion: '0.1.0', now: new Date('2026-10-06T10:00:00Z') };
  const library = () =>
    createMemoryFs({
      [DB_FILE]: sqlite('db'),
      'images/items/a.png': bytesToBase64(bytesOf(40_000, 1)),
      'images/items/b.png': bytesToBase64(bytesOf(60_000, 2)),
      'images/renders/c.jpg': bytesToBase64(bytesOf(50_000, 3)),
    });

  it('never hands over more than one file at a time while writing', async () => {
    const chunks: number[] = [];
    await writeBackupArchive(library().fs, info, {
      write: (bytes) => void chunks.push(bytes.length),
    });
    // The largest single write is the largest file, not the archive.
    expect(Math.max(...chunks)).toBe(60_000);
    expect(chunks.reduce((sum, size) => sum + size, 0)).toBeGreaterThan(150_000);
  });

  it('restores from a reader that is asked for one file at a time', async () => {
    const source = library();
    const archive = memoryArchive();
    await writeBackupArchive(source.fs, info, archive.writer);

    const reads: number[] = [];
    const inner = archive.reader();
    const target = createMemoryFs({ [DB_FILE]: sqlite('old') });
    const manifest = await stageBackupFrom(
      target.fs,
      {
        read: (length) => {
          reads.push(length);
          return inner.read(length);
        },
      },
      7,
    );
    expect(manifest.schemaVersion).toBe(7);
    expect(Math.max(...reads)).toBe(60_000);
    await swapInStagedBackup(target.fs);
    expect(Object.fromEntries(target.files)).toMatchObject(Object.fromEntries(source.files));
  });

  it('stops at the manifest of a backup from a newer app, before unpacking any photo', async () => {
    const archive = memoryArchive();
    await writeBackupArchive(library().fs, { ...info, schemaVersion: 9 }, archive.writer);
    const target = createMemoryFs({ [DB_FILE]: sqlite('old') });
    let asked = 0;
    const inner = archive.reader();
    await expect(
      stageBackupFrom(
        target.fs,
        {
          read: (length) => {
            asked += length;
            return inner.read(length);
          },
        },
        7,
      ),
    ).rejects.toMatchObject({ reason: 'newer' });
    expect(asked).toBeLessThan(1000);
    expect([...target.files.keys()]).toEqual([DB_FILE]);
  });

  it('rejects a damaged archive and leaves nothing behind', async () => {
    const bytes = base64ToBytes(await createBackupArchive(library().fs, info));
    bytes[bytes.length - 80_000] ^= 0xff;
    const target = createMemoryFs({ [DB_FILE]: sqlite('old') });
    await expect(stageBackup(target.fs, bytesToBase64(bytes), 7)).rejects.toBeInstanceOf(
      BackupError,
    );
    expect([...target.files.keys()]).toEqual([DB_FILE]);
  });
});

describe('interrupted restore', () => {
  it('is noticed at the next start and the previous data is put back', async () => {
    const archive = await createBackupArchive(
      createMemoryFs({ [DB_FILE]: sqlite('from backup'), 'images/items/new.png': b64('new') }).fs,
      { schemaVersion: 7, appVersion: '0.1.0' },
    );
    const device = createMemoryFs({
      [DB_FILE]: sqlite('mine'),
      'images/items/mine.png': b64('mine'),
    });
    expect(await hasInterruptedRestore(device.fs)).toBe(false);
    await stageBackup(device.fs, archive, 7);

    // The app is killed after the current data was set aside and before the restored data
    // is in place: the move of the staged database fails and so does putting things back.
    const move = device.fs.move;
    let moves = 0;
    device.fs.move = async (from, to) => {
      if (++moves > 2) throw new Error('killed');
      return move(from, to);
    };
    await expect(swapInStagedBackup(device.fs)).rejects.toThrow();
    device.fs.move = move;
    expect(await device.fs.exists(DB_FILE)).toBe(false);

    // Next start: an empty database is created before anything can check.
    device.files.set(DB_FILE, sqlite('empty stand-in'));
    expect(await hasInterruptedRestore(device.fs)).toBe(true);
    await rollbackRestore(device.fs);
    await clearStagedBackup(device.fs);

    expect(await hasInterruptedRestore(device.fs)).toBe(false);
    expect(Object.fromEntries(device.files)).toEqual({
      [DB_FILE]: sqlite('mine'),
      'images/items/mine.png': b64('mine'),
    });
  });
});

describe('temporary files', () => {
  it("removes the app's own working files once they are an hour old, and nothing else", async () => {
    const hour = 60 * 60 * 1000;
    const now = 10 * hour;
    const files: Record<string, number> = {
      'cutout-1.png': now - 2 * hour,
      'cutout-2.png': now - 60_000,
      'generated-1.png': now - 3 * hour,
      'link-import-1.jpg': now - 2 * hour,
      'closet-backup-2026-10-01.zip': now - 5 * hour,
      'ImageManipulator/a.jpg': now - 2 * hour,
      'ImageManipulator/b.jpg': now - 1000,
      'someone-elses.dat': now - 9 * hour,
      'locked/keep.txt': now - 9 * hour,
    };
    const removed: string[] = [];
    const deps: TempFileDeps = {
      list: async (dir) =>
        [
          ...new Set(
            Object.keys(files)
              .filter((path) => (dir ? path.startsWith(`${dir}/`) : true))
              .map((path) => (dir ? path.slice(dir.length + 1) : path.split('/')[0])),
          ),
        ].sort(),
      modifiedAt: async (path) => files[path] ?? null,
      remove: async (path) => {
        if (path === 'generated-1.png') throw new Error('in use');
        removed.push(path);
      },
    };
    expect(await cleanTemporaryFiles(deps, () => now)).toBe(4);
    expect(removed.sort()).toEqual([
      'ImageManipulator/a.jpg',
      'closet-backup-2026-10-01.zip',
      'cutout-1.png',
      'link-import-1.jpg',
    ]);
  });
});
