import JSZip from 'jszip';

import { BackupError, DB_FILE, createBackupArchive, restoreBackupArchive } from '../backup';
import { createImageStore } from '../imageStore';
import { createMemoryFs } from '../memoryFs';

const b64 = (text: string) => Buffer.from(text).toString('base64');

describe('image store', () => {
  it('copies an image into the store and returns a relative path', async () => {
    const { fs, files, external } = createMemoryFs();
    external.set('file:///tmp/photo.jpg', b64('photo'));
    const store = createImageStore(fs, () => 'abc');

    const path = await store.save('file:///tmp/photo.jpg', 'items');

    expect(path).toBe('images/items/abc.jpg');
    expect(files.get(path)).toBe(b64('photo'));
    expect(store.uri(path)).toBe('file:///documents/images/items/abc.jpg');
    expect(await store.exists(path)).toBe(true);
  });

  it('deletes a stored image', async () => {
    const { fs, external } = createMemoryFs();
    external.set('file:///tmp/photo.png', b64('photo'));
    const store = createImageStore(fs, () => 'abc');
    const path = await store.save('file:///tmp/photo.png', 'items', 'png');

    await store.remove(path);

    expect(await store.exists(path)).toBe(false);
  });

  it('refuses unsafe locations', async () => {
    const { fs } = createMemoryFs({ [DB_FILE]: b64('db') });
    const store = createImageStore(fs, () => 'abc');
    await expect(store.save('file:///tmp/a.jpg', '../SQLite')).rejects.toThrow();
    await expect(store.remove(DB_FILE)).rejects.toThrow();
    await expect(store.remove('images/../SQLite/closet.db')).rejects.toThrow();
    expect(await fs.exists(DB_FILE)).toBe(true);
  });
});

describe('backup', () => {
  const populated = () =>
    createMemoryFs({
      [DB_FILE]: b64('database-bytes'),
      'images/items/a.png': b64('image-a'),
      'images/avatar/b.jpg': b64('image-b'),
    });

  const info = { schemaVersion: 3, appVersion: '0.1.0', now: new Date('2026-10-02T10:00:00Z') };

  it('round-trips the database and all images', async () => {
    const source = populated();
    const archive = await createBackupArchive(source.fs, info);

    const target = createMemoryFs({
      [DB_FILE]: b64('old-database'),
      [`${DB_FILE}-wal`]: b64('old-wal'),
      'images/items/stale.png': b64('stale'),
    });
    const manifest = await restoreBackupArchive(target.fs, archive, 3);

    expect(manifest).toMatchObject({ app: 'closet', schemaVersion: 3, appVersion: '0.1.0' });
    expect(Object.fromEntries(target.files)).toEqual(Object.fromEntries(source.files));
  });

  it('contains only the manifest, the database and images', async () => {
    const archive = await createBackupArchive(populated().fs, info);
    const zip = await JSZip.loadAsync(archive, { base64: true });
    expect(
      Object.keys(zip.files)
        .filter((name) => !zip.files[name].dir)
        .sort(),
    ).toEqual(['closet.db', 'images/avatar/b.jpg', 'images/items/a.png', 'manifest.json']);
  });

  it('accepts a backup from an older schema version', async () => {
    const archive = await createBackupArchive(populated().fs, { ...info, schemaVersion: 1 });
    const target = createMemoryFs();
    await expect(restoreBackupArchive(target.fs, archive, 3)).resolves.toMatchObject({
      schemaVersion: 1,
    });
  });

  const expectUnchanged = async (archive: string, reason: string, current = 3) => {
    const target = createMemoryFs({
      [DB_FILE]: b64('old-database'),
      'images/items/keep.png': b64('keep'),
    });
    const before = Object.fromEntries(target.files);
    await expect(restoreBackupArchive(target.fs, archive, current)).rejects.toMatchObject({
      name: 'BackupError',
      reason,
    });
    expect(Object.fromEntries(target.files)).toEqual(before);
  };

  it('rejects a file that is not a zip and leaves data unchanged', async () => {
    await expectUnchanged(b64('this is not a backup'), 'invalid');
  });

  it('rejects a zip without a manifest', async () => {
    const zip = new JSZip();
    zip.file('closet.db', 'x');
    await expectUnchanged(await zip.generateAsync({ type: 'base64' }), 'invalid');
  });

  it('rejects a zip from another app', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ app: 'other', formatVersion: 1, schemaVersion: 1 }));
    zip.file('closet.db', 'x');
    await expectUnchanged(await zip.generateAsync({ type: 'base64' }), 'invalid');
  });

  it('rejects entries outside the image folder', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({ app: 'closet', formatVersion: 1, schemaVersion: 1 }),
    );
    zip.file('closet.db', 'x');
    zip.file('SQLite/other.db', 'x');
    await expectUnchanged(await zip.generateAsync({ type: 'base64' }), 'invalid');
  });

  it('rejects a backup from a newer schema version', async () => {
    const archive = await createBackupArchive(populated().fs, { ...info, schemaVersion: 4 });
    await expectUnchanged(archive, 'newer');
    expect(new BackupError('newer').reason).toBe('newer');
  });
});
