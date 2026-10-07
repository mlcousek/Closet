import { parseHeight } from '@/profile/units';

import {
  BackupError,
  DB_FILE,
  clearStagedBackup,
  createBackupArchive,
  finishRestore,
  hasInterruptedRestore,
  isSafeImagePath,
  rollbackRestore,
  stageBackup,
  stageBackupFrom,
  swapInStagedBackup,
} from '../backup';
import type { FsAdapter } from '../fs';
import { createMemoryFs } from '../memoryFs';
import { base64ToBytes, createZipWriter, memoryArchive, readZip, textToBytes } from '../zip';

jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-file-system', () => ({ File: class {} }));

const b64 = (text: string) => Buffer.from(text).toString('base64');
const sqlite = (label: string) => b64('SQLite format 3\u0000' + label);
const info = { schemaVersion: 7, appVersion: '0.1.0' };

const mine = () =>
  createMemoryFs({
    [DB_FILE]: sqlite('mine'),
    'images/items/mine.png': b64('mine'),
    'images/avatar/me.jpg': b64('me'),
  });
const backupOf = (files: Record<string, string>) =>
  createBackupArchive(createMemoryFs(files).fs, info);

/** Makes the file system fail from the nth move on, as if the app had been killed there. */
function killAtMove(fs: FsAdapter, n: number) {
  const move = fs.move;
  let count = 0;
  fs.move = async (from, to) => {
    if (++count >= n) throw new Error('killed');
    return move(from, to);
  };
  return () => {
    fs.move = move;
  };
}

describe('names inside a backup', () => {
  it('accepts only what the app itself writes', () => {
    for (const good of [
      'images/items/3f2a-9c.jpg',
      'images/avatar/me_small.JPG',
      'images/renders/a.b.png',
    ]) {
      expect(isSafeImagePath(good)).toBe(true);
    }
    for (const bad of [
      'images/../SQLite/closet.db',
      'images/%2e%2e/%2e%2e/SQLite/closet.db',
      'images/items/a.png?x',
      'images/items/a.png#x',
      'images/items\\..\\x',
      'images/items/./a.png',
      'images//a.png',
      'images/',
      'images',
      '/images/a.png',
      'SQLite/closet.db',
      'images/items/a b.png',
      'images/items/\u0000.png',
    ]) {
      expect(isSafeImagePath(bad)).toBe(false);
    }
  });

  it('rejects an archive that tries to write outside its folder, and writes nothing', async () => {
    const archive = memoryArchive();
    const zip = createZipWriter(archive.writer);
    await zip.add(
      'manifest.json',
      textToBytes(JSON.stringify({ app: 'closet', formatVersion: 1, schemaVersion: 7 })),
    );
    await zip.add('closet.db', Buffer.from('SQLite format 3\u0000evil'));
    await zip.add('images/%2e%2e/%2e%2e/SQLite/closet.db', Buffer.from('overwritten'));
    await zip.finish();

    const device = mine();
    const before = Object.fromEntries(device.files);
    await expect(stageBackupFrom(device.fs, archive.reader(), 7)).rejects.toMatchObject({
      reason: 'invalid',
    });
    expect(Object.fromEntries(device.files)).toEqual(before);
  });
});

describe('a restore cut off at any point', () => {
  // The moves of a swap, in order: photos aside, database aside, restored database in,
  // restored photos in. A kill before each one must leave the user's own data recoverable.
  it.each([1, 2, 3, 4])('keeps the previous data when killed before move %i', async (n) => {
    const device = mine();
    const original = Object.fromEntries(device.files);
    await stageBackup(
      device.fs,
      await backupOf({ [DB_FILE]: sqlite('theirs'), 'images/items/theirs.png': b64('theirs') }),
      7,
    );

    // The swap fails at this move, and so does its own attempt to put things back.
    const revive = killAtMove(device.fs, n);
    await expect(swapInStagedBackup(device.fs)).rejects.toThrow();
    revive();

    // Next launch: the app opens (and so creates) a database before it can check anything.
    if (!device.files.has(DB_FILE)) device.files.set(DB_FILE, sqlite('empty stand-in'));
    if (await hasInterruptedRestore(device.fs)) await rollbackRestore(device.fs);
    await clearStagedBackup(device.fs);

    expect(Object.fromEntries(device.files)).toEqual(original);
    expect(await hasInterruptedRestore(device.fs)).toBe(false);
  });

  it('never deletes photos that were not set aside', async () => {
    const device = mine();
    // Nothing was moved yet: there is nothing to roll back, and a rollback must be harmless.
    await rollbackRestore(device.fs);
    expect(device.files.has('images/items/mine.png')).toBe(true);
    expect(device.files.get(DB_FILE)).toBe(sqlite('mine'));
  });

  it('does not mistake a finished restore that was cut off while tidying up', async () => {
    const device = mine();
    await stageBackup(
      device.fs,
      await backupOf({ [DB_FILE]: sqlite('theirs'), 'images/items/theirs.png': b64('theirs') }),
      7,
    );
    await swapInStagedBackup(device.fs);
    expect(await hasInterruptedRestore(device.fs)).toBe(true);

    // Tidying up is cut off after its first step, the rename, with the old data half deleted.
    const remove = device.fs.remove;
    let removes = 0;
    device.fs.remove = async (path) => {
      if (++removes === 2) {
        device.files.delete('restore-discard/closet.db');
        throw new Error('killed');
      }
      return remove(path);
    };
    await expect(finishRestore(device.fs)).rejects.toThrow('killed');
    device.fs.remove = remove;

    // Next launch: the restored data is in place and nothing asks for it to be undone.
    expect(await hasInterruptedRestore(device.fs)).toBe(false);
    await clearStagedBackup(device.fs);
    expect(Object.fromEntries(device.files)).toEqual({
      [DB_FILE]: sqlite('theirs'),
      'images/items/theirs.png': b64('theirs'),
    });
  });

  it('restores onto a phone that had no photos yet', async () => {
    const device = createMemoryFs({ [DB_FILE]: sqlite('fresh install') });
    await stageBackup(
      device.fs,
      await backupOf({ [DB_FILE]: sqlite('theirs'), 'images/items/theirs.png': b64('theirs') }),
      7,
    );
    await swapInStagedBackup(device.fs);
    await finishRestore(device.fs);
    expect(Object.fromEntries(device.files)).toEqual({
      [DB_FILE]: sqlite('theirs'),
      'images/items/theirs.png': b64('theirs'),
    });
  });

  it('still reports a bad archive as such', async () => {
    await expect(stageBackup(mine().fs, 'not base64 at all!', 7)).rejects.toBeInstanceOf(
      BackupError,
    );
  });
});

describe('a backup made while the app keeps working', () => {
  /** The names of the files inside an archive. */
  const namesIn = async (archive: string) => {
    const names: string[] = [];
    await readZip(memoryArchive(base64ToBytes(archive)).reader(), async (path) => {
      names.push(path);
    });
    return names;
  };

  it('leaves out a photo that was deleted after the photos were listed', async () => {
    const device = createMemoryFs({
      [DB_FILE]: sqlite('mine'),
      'images/import/a.jpg': b64('a'),
      'images/import/b.jpg': b64('b'),
      'images/items/c.png': b64('c'),
    });
    // An import finishes and removes its source photo while the first photo is being read.
    const readBytes = device.fs.readBytes;
    device.fs.readBytes = async (path) => {
      if (path === 'images/import/a.jpg') device.files.delete('images/import/b.jpg');
      return readBytes(path);
    };

    const archive = await createBackupArchive(device.fs, info);
    expect(await namesIn(archive)).toEqual([
      'manifest.json',
      'closet.db',
      'images/import/a.jpg',
      'images/items/c.png',
    ]);

    // What was written is a backup that restores.
    const other = createMemoryFs({ [DB_FILE]: sqlite('other') });
    await stageBackup(other.fs, archive, 7);
    await swapInStagedBackup(other.fs);
    await finishRestore(other.fs);
    expect(Object.fromEntries(other.files)).toEqual({
      [DB_FILE]: sqlite('mine'),
      'images/import/a.jpg': b64('a'),
      'images/items/c.png': b64('c'),
    });
  });

  it('fails for a photo that is there and cannot be read', async () => {
    const device = mine();
    const readBytes = device.fs.readBytes;
    device.fs.readBytes = async (path) => {
      if (path === 'images/items/mine.png') throw new Error('read error');
      return readBytes(path);
    };
    // A backup that silently misses a photo the closet still has would be worse than none.
    await expect(createBackupArchive(device.fs, info)).rejects.toThrow('read error');
  });

  it('fails when the database is missing: only photos may be left out', async () => {
    const device = createMemoryFs({ 'images/items/mine.png': b64('mine') });
    await expect(createBackupArchive(device.fs, info)).rejects.toThrow(/No such file/);
  });
});

describe('unpacking a backup', () => {
  const theirs = () =>
    backupOf({
      [DB_FILE]: sqlite('theirs'),
      'images/items/one.png': b64('one'),
      'images/items/two.png': b64('two'),
    });

  /** Makes the nth file written, and every one after it, fail as a full disk does. */
  function fullAtWrite(fs: FsAdapter, n: number) {
    const writeBytes = fs.writeBytes;
    let count = 0;
    fs.writeBytes = async (path, data) => {
      if (++count >= n) throw new Error('ENOSPC: no space left on device');
      return writeBytes(path, data);
    };
  }

  it.each([
    ['the database', 1],
    ['a photo, after other files were unpacked', 3],
  ])(
    'says the phone could not take it when writing %s fails, and leaves nothing behind',
    async (_case, n) => {
      const device = mine();
      const before = Object.fromEntries(device.files);
      const archive = await theirs();
      fullAtWrite(device.fs, n);

      const error = await stageBackup(device.fs, archive, 7).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(BackupError);
      expect(error).toMatchObject({ reason: 'unwritable' });
      // No half-unpacked folder is left to take up the space that was missing.
      expect(Object.fromEntries(device.files)).toEqual(before);
      expect(await device.fs.exists('restore-staging')).toBe(false);
      expect(await hasInterruptedRestore(device.fs)).toBe(false);
    },
  );

  it('still calls a damaged archive invalid, and leaves nothing behind', async () => {
    const archive = memoryArchive();
    const zip = createZipWriter(archive.writer);
    await zip.add(
      'manifest.json',
      textToBytes(JSON.stringify({ app: 'closet', formatVersion: 1, schemaVersion: 7 })),
    );
    await zip.add('images/items/one.png', Buffer.from('one'));
    await zip.add('closet.db', Buffer.from('not a database'));
    await zip.finish();

    const device = mine();
    const before = Object.fromEntries(device.files);
    await expect(stageBackupFrom(device.fs, archive.reader(), 7)).rejects.toMatchObject({
      reason: 'invalid',
    });
    expect(Object.fromEntries(device.files)).toEqual(before);

    // Cut short inside its last photo, after the files before it were unpacked.
    const whole = Buffer.from(base64ToBytes(await theirs()));
    const index = whole.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(index).toBeGreaterThan(0);
    await expect(
      stageBackupFrom(device.fs, memoryArchive(whole.subarray(0, index - 2)).reader(), 7),
    ).rejects.toMatchObject({ reason: 'invalid' });
    expect(Object.fromEntries(device.files)).toEqual(before);
  });

  it('keeps its own message for a backup from a newer app, full phone or not', async () => {
    const device = mine();
    const archive = await theirs();
    fullAtWrite(device.fs, 1);
    await expect(stageBackup(device.fs, archive, 6)).rejects.toMatchObject({ reason: 'newer' });
  });
});

describe('finishing a restore on a full phone', () => {
  const restored = {
    [DB_FILE]: sqlite('theirs'),
    'images/items/theirs.png': b64('theirs'),
  };
  const swapped = async () => {
    const device = mine();
    await stageBackup(device.fs, await backupOf(restored), 7);
    await swapInStagedBackup(device.fs);
    expect(await hasInterruptedRestore(device.fs)).toBe(true);
    device.fs.writeBase64 = async () => {
      throw new Error('ENOSPC: no space left on device');
    };
    return device;
  };

  it('counts as done without the marker: the set-aside data goes and the restored data stays', async () => {
    const device = await swapped();
    await finishRestore(device.fs);

    expect(await hasInterruptedRestore(device.fs)).toBe(false);
    expect(Object.fromEntries(device.files)).toEqual(restored);

    // Next launch: nothing is put back.
    if (await hasInterruptedRestore(device.fs)) await rollbackRestore(device.fs);
    await clearStagedBackup(device.fs);
    expect(Object.fromEntries(device.files)).toEqual(restored);
  });

  it('is not undone at the next start when deleting the set-aside data was cut off', async () => {
    const device = await swapped();
    // The rename has happened; the delete after it stops half way.
    const remove = device.fs.remove;
    let removes = 0;
    device.fs.remove = async (path) => {
      if (++removes === 2) {
        device.files.delete('restore-discard/closet.db');
        throw new Error('killed');
      }
      return remove(path);
    };
    await expect(finishRestore(device.fs)).rejects.toThrow('killed');
    device.fs.remove = remove;
    expect([...device.files.keys()].some((path) => path.startsWith('restore-discard/'))).toBe(true);

    expect(await hasInterruptedRestore(device.fs)).toBe(false);
    await clearStagedBackup(device.fs);
    expect(Object.fromEntries(device.files)).toEqual(restored);
  });
});

describe('zip limits', () => {
  it('refuses more files than other tools can count', async () => {
    const zip = createZipWriter({ write: () => {} });
    const empty = new Uint8Array(0);
    for (let index = 0; index < 65534; index++) await zip.add(`f${index}`, empty);
    await expect(zip.add('one-too-many', empty)).rejects.toThrow(/Too many files/);
  });
});

describe('height in feet and inches', () => {
  it('reads every common way of writing it', () => {
    for (const text of ['5 7', "5'7", '5ft 7in', '5.7', '5,7', '5′ 7″']) {
      expect(parseHeight(text, 'imperial')).toBe(170);
    }
    expect(parseHeight('6', 'imperial')).toBe(183);
    expect(parseHeight('5 11', 'imperial')).toBe(180);
    expect(parseHeight('', 'imperial')).toBeNull();
    expect(parseHeight('50', 'imperial')).toBeNull();
  });

  it('keeps reading centimetres with a decimal in metric', () => {
    expect(parseHeight('170', 'metric')).toBe(170);
    expect(parseHeight('170,4 cm', 'metric')).toBe(170);
    expect(parseHeight('12', 'metric')).toBeNull();
  });
});
