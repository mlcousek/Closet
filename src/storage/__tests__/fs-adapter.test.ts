import { expoFs } from '../fs';
import { createImageStore, imageStore } from '../imageStore';
import { createMemoryFs } from '../memoryFs';

/**
 * A stand-in for the device file system that behaves like it where it matters
 * here: writing, moving or copying into a folder that does not exist fails, and
 * deleting something that is not there fails unless asked to be idempotent.
 * File contents are base64 strings, keyed by absolute URI.
 */
const mockDisk = {
  root: 'file:///documents/' as string | null,
  files: new Map<string, string>(),
  dirs: new Set<string>(),
  calls: [] as [name: string, ...args: unknown[]][],
};

const mockTrim = (uri: string) => (uri.endsWith('/') ? uri.slice(0, -1) : uri);
const mockParent = (uri: string) => uri.slice(0, uri.lastIndexOf('/'));
const mockRequireParent = (uri: string) => {
  if (!mockDisk.dirs.has(mockParent(uri))) throw new Error(`No such folder: ${mockParent(uri)}`);
};
const mockMakeDirs = (uri: string) => {
  for (let dir = mockTrim(uri); dir.length > 'file://'.length; dir = mockParent(dir)) {
    mockDisk.dirs.add(dir);
  }
};

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));

jest.mock('expo-file-system/legacy', () => ({
  get documentDirectory() {
    return mockDisk.root;
  },
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  getInfoAsync: async (uri: string) => {
    mockDisk.calls.push(['getInfo', uri]);
    const path = mockTrim(uri);
    const isDirectory = mockDisk.dirs.has(path);
    return { exists: isDirectory || mockDisk.files.has(path), isDirectory };
  },
  makeDirectoryAsync: async (uri: string, options?: { intermediates?: boolean }) => {
    mockDisk.calls.push(['makeDirectory', uri, options]);
    if (!options?.intermediates) mockRequireParent(mockTrim(uri));
    mockMakeDirs(uri);
  },
  deleteAsync: async (uri: string, options?: { idempotent?: boolean }) => {
    mockDisk.calls.push(['delete', uri, options]);
    const path = mockTrim(uri);
    const known = mockDisk.dirs.has(path) || mockDisk.files.has(path);
    if (!known && !options?.idempotent) throw new Error(`No such file: ${uri}`);
    for (const key of [...mockDisk.files.keys()]) {
      if (key === path || key.startsWith(`${path}/`)) mockDisk.files.delete(key);
    }
    for (const key of [...mockDisk.dirs]) {
      if (key === path || key.startsWith(`${path}/`)) mockDisk.dirs.delete(key);
    }
  },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    mockDisk.calls.push(['move', from, to]);
    mockRequireParent(to);
    if (!mockDisk.files.has(from) && !mockDisk.dirs.has(from)) {
      throw new Error(`No such file: ${from}`);
    }
    for (const key of [...mockDisk.files.keys()]) {
      if (key === from || key.startsWith(`${from}/`)) {
        mockDisk.files.set(to + key.slice(from.length), mockDisk.files.get(key)!);
        mockDisk.files.delete(key);
      }
    }
    for (const key of [...mockDisk.dirs]) {
      if (key === from || key.startsWith(`${from}/`)) {
        mockDisk.dirs.add(to + key.slice(from.length));
        mockDisk.dirs.delete(key);
      }
    }
  },
  copyAsync: async ({ from, to }: { from: string; to: string }) => {
    mockDisk.calls.push(['copy', from, to]);
    mockRequireParent(to);
    const data = mockDisk.files.get(from);
    if (data === undefined) throw new Error(`No such file: ${from}`);
    mockDisk.files.set(to, data);
  },
  readDirectoryAsync: async (uri: string) => {
    mockDisk.calls.push(['readDirectory', uri]);
    const path = mockTrim(uri);
    if (!mockDisk.dirs.has(path)) throw new Error(`Not a folder: ${uri}`);
    return [...mockDisk.files.keys(), ...mockDisk.dirs]
      .filter((key) => mockParent(key) === path)
      .map((key) => key.slice(path.length + 1))
      .sort();
  },
  readAsStringAsync: async (uri: string, options?: { encoding?: string }) => {
    mockDisk.calls.push(['read', uri, options]);
    const data = mockDisk.files.get(uri);
    if (data === undefined) throw new Error(`No such file: ${uri}`);
    // Without the encoding the device would hand back text, not the stored bytes.
    return options?.encoding === 'base64' ? data : Buffer.from(data, 'base64').toString('utf8');
  },
  writeAsStringAsync: async (uri: string, data: string, options?: { encoding?: string }) => {
    mockDisk.calls.push(['write', uri, options]);
    mockRequireParent(uri);
    mockDisk.files.set(
      uri,
      options?.encoding === 'base64' ? data : Buffer.from(data).toString('base64'),
    );
  },
}));

jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    async bytes() {
      mockDisk.calls.push(['File.bytes', this.uri]);
      const data = mockDisk.files.get(this.uri);
      if (data === undefined) throw new Error(`No such file: ${this.uri}`);
      return new Uint8Array(Buffer.from(data, 'base64'));
    }
    create(options?: { intermediates?: boolean; overwrite?: boolean }) {
      mockDisk.calls.push(['File.create', this.uri, options]);
      if (mockDisk.files.has(this.uri) && !options?.overwrite) {
        throw new Error(`File already exists: ${this.uri}`);
      }
      if (options?.intermediates) mockMakeDirs(mockParent(this.uri));
      else mockRequireParent(this.uri);
      mockDisk.files.set(this.uri, '');
    }
    write(data: Uint8Array) {
      mockDisk.calls.push(['File.write', this.uri]);
      if (!mockDisk.files.has(this.uri)) throw new Error(`No such file: ${this.uri}`);
      mockDisk.files.set(this.uri, Buffer.from(data).toString('base64'));
    }
  },
}));

const ROOT = 'file:///documents/';
const b64 = (text: string) => Buffer.from(text).toString('base64');
const callsOf = (name: string) => mockDisk.calls.filter((call) => call[0] === name);
/** Puts files on the fake disk, creating their folders. Paths are relative to the document directory. */
const seed = (files: Record<string, string>) => {
  for (const [path, text] of Object.entries(files)) {
    mockMakeDirs(mockParent(ROOT + path));
    mockDisk.files.set(ROOT + path, b64(text));
  }
};

beforeEach(() => {
  mockDisk.root = ROOT;
  mockDisk.files.clear();
  mockDisk.dirs.clear();
  mockDisk.dirs.add('file:///documents');
  mockDisk.calls = [];
});

describe('device file system adapter', () => {
  it('turns a relative path into a URI under the document directory', () => {
    expect(expoFs.uri('images/items/a.png')).toBe('file:///documents/images/items/a.png');
    expect(expoFs.uri('')).toBe(ROOT);
  });

  it('uses the bare path when the platform has no document directory', async () => {
    mockDisk.root = null;
    expect(expoFs.uri('images/a.png')).toBe('images/a.png');
    expect(await expoFs.exists('images/a.png')).toBe(false);
    expect(callsOf('getInfo')).toEqual([['getInfo', 'images/a.png']]);
  });

  it('says whether a file or a folder exists', async () => {
    seed({ 'images/items/a.png': 'a' });
    expect(await expoFs.exists('images/items/a.png')).toBe(true);
    expect(await expoFs.exists('images/items')).toBe(true);
    expect(await expoFs.exists('images/items/b.png')).toBe(false);
    expect(await expoFs.exists('SQLite')).toBe(false);
    expect(callsOf('getInfo')[0]).toEqual(['getInfo', 'file:///documents/images/items/a.png']);
  });

  it('creates a folder together with the folders above it', async () => {
    await expoFs.makeDir('restore-staging/images/items');

    expect(await expoFs.exists('restore-staging/images/items')).toBe(true);
    expect(await expoFs.exists('restore-staging')).toBe(true);
    expect(callsOf('makeDirectory')).toEqual([
      ['makeDirectory', 'file:///documents/restore-staging/images/items', { intermediates: true }],
    ]);
  });

  it('removes a file, and a folder with everything in it', async () => {
    seed({ 'images/items/a.png': 'a', 'images/items/b.png': 'b', 'images/avatar/c.jpg': 'c' });

    await expoFs.remove('images/items/a.png');
    expect([...mockDisk.files.keys()].sort()).toEqual([
      'file:///documents/images/avatar/c.jpg',
      'file:///documents/images/items/b.png',
    ]);

    await expoFs.remove('images');
    expect(mockDisk.files.size).toBe(0);
    expect(await expoFs.exists('images')).toBe(false);
  });

  it('removes something that is not there without an error', async () => {
    await expect(expoFs.remove('restore-previous')).resolves.toBeUndefined();
    expect(callsOf('delete')).toEqual([
      ['delete', 'file:///documents/restore-previous', { idempotent: true }],
    ]);
  });

  it('moves a file into a folder that does not exist yet, creating it first', async () => {
    seed({ 'SQLite/closet.db': 'database' });

    await expoFs.move('SQLite/closet.db', 'restore-previous/closet.db');

    expect(Object.fromEntries(mockDisk.files)).toEqual({
      'file:///documents/restore-previous/closet.db': b64('database'),
    });
    const order = mockDisk.calls.map((call) => call[0]);
    expect(order).toEqual(['makeDirectory', 'move']);
    expect(mockDisk.calls[0]).toEqual([
      'makeDirectory',
      'file:///documents/restore-previous',
      { intermediates: true },
    ]);
    expect(mockDisk.calls[1]).toEqual([
      'move',
      'file:///documents/SQLite/closet.db',
      'file:///documents/restore-previous/closet.db',
    ]);
  });

  it('moves a whole folder, and makes no folder for a destination at the top level', async () => {
    seed({ 'restore-staging/images/items/a.png': 'a', 'restore-staging/images/b.jpg': 'b' });

    await expoFs.move('restore-staging/images', 'images');

    expect(Object.fromEntries(mockDisk.files)).toEqual({
      'file:///documents/images/items/a.png': b64('a'),
      'file:///documents/images/b.jpg': b64('b'),
    });
    expect(callsOf('makeDirectory')).toEqual([]);
    expect(await expoFs.exists('restore-staging/images')).toBe(false);
  });

  it('copies a file from anywhere into the document directory, creating the folder first', async () => {
    mockDisk.files.set('file:///cache/picked/photo.jpg', b64('photo'));

    await expoFs.copyIn('file:///cache/picked/photo.jpg', 'images/items/new.jpg');

    expect(mockDisk.files.get('file:///documents/images/items/new.jpg')).toBe(b64('photo'));
    // The source is given as it is, outside the document directory, and is left in place.
    expect(mockDisk.files.has('file:///cache/picked/photo.jpg')).toBe(true);
    expect(mockDisk.calls).toEqual([
      ['makeDirectory', 'file:///documents/images/items', { intermediates: true }],
      ['copy', 'file:///cache/picked/photo.jpg', 'file:///documents/images/items/new.jpg'],
    ]);
  });

  it('fails to copy a source that does not exist and stores nothing', async () => {
    await expect(expoFs.copyIn('file:///cache/missing.jpg', 'images/items/x.jpg')).rejects.toThrow(
      'No such file',
    );
    expect(mockDisk.files.size).toBe(0);
  });

  it('writes base64 into a new folder and reads the same base64 back', async () => {
    await expoFs.writeBase64('images/renders/r.png', b64('picture'));

    expect(await expoFs.readBase64('images/renders/r.png')).toBe(b64('picture'));
    expect(mockDisk.calls).toEqual([
      ['makeDirectory', 'file:///documents/images/renders', { intermediates: true }],
      ['write', 'file:///documents/images/renders/r.png', { encoding: 'base64' }],
      ['read', 'file:///documents/images/renders/r.png', { encoding: 'base64' }],
    ]);
  });

  it('writes base64 at the top level without making a folder', async () => {
    await expoFs.writeBase64('note.bin', b64('x'));
    expect(callsOf('makeDirectory')).toEqual([]);
    expect(mockDisk.files.get('file:///documents/note.bin')).toBe(b64('x'));
  });

  it('lists every file below a folder, however deep, as paths relative to the document directory', async () => {
    seed({
      'images/items/a.png': 'a',
      'images/items/b.png': 'b',
      'images/renders/2026/r.jpg': 'r',
      'images/top.jpg': 't',
      'SQLite/closet.db': 'db',
    });
    await expoFs.makeDir('images/empty');

    expect((await expoFs.listFiles('images')).sort()).toEqual([
      'images/items/a.png',
      'images/items/b.png',
      'images/renders/2026/r.jpg',
      'images/top.jpg',
    ]);
    expect(await expoFs.listFiles('images/renders')).toEqual(['images/renders/2026/r.jpg']);
  });

  it('lists nothing for a folder that does not exist, without trying to read it', async () => {
    expect(await expoFs.listFiles('images')).toEqual([]);
    expect(callsOf('readDirectory')).toEqual([]);
  });

  it('writes raw bytes into a new folder and reads the same bytes back', async () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 255, 128]);

    await expoFs.writeBytes('restore-staging/images/items/a.png', bytes);

    expect(Array.from(await expoFs.readBytes('restore-staging/images/items/a.png'))).toEqual(
      Array.from(bytes),
    );
    expect(callsOf('File.create')).toEqual([
      [
        'File.create',
        'file:///documents/restore-staging/images/items/a.png',
        { intermediates: true, overwrite: true },
      ],
    ]);
    expect(callsOf('File.bytes')).toEqual([
      ['File.bytes', 'file:///documents/restore-staging/images/items/a.png'],
    ]);
  });

  it('replaces a file that already exists when writing bytes', async () => {
    seed({ 'SQLite/closet.db': 'old database, longer than the new one' });

    await expoFs.writeBytes('SQLite/closet.db', Uint8Array.from([7, 8, 9]));

    expect(Array.from(await expoFs.readBytes('SQLite/closet.db'))).toEqual([7, 8, 9]);
  });

  it('fails to read bytes of a file that does not exist', async () => {
    // The lookup throws while the promise is being made or when it settles; both are a failure.
    await expect((async () => expoFs.readBytes('SQLite/closet.db'))()).rejects.toThrow(
      'No such file',
    );
  });
});

describe('image store, beyond the basics', () => {
  it('uses jpg when no extension is given and keeps the one that is', async () => {
    const { fs, external } = createMemoryFs();
    external.set('file:///tmp/a', b64('a'));
    let next = 0;
    const store = createImageStore(fs, () => `id-${++next}`);

    expect(await store.save('file:///tmp/a', 'items')).toBe('images/items/id-1.jpg');
    expect(await store.save('file:///tmp/a', 'avatar', 'heic')).toBe('images/avatar/id-2.heic');
    expect(await store.save('file:///tmp/a', 'renders', 'png')).toBe('images/renders/id-3.png');
  });

  it.each([
    ['items', 'PNG'],
    ['items', 'p/ng'],
    ['items', ''],
    ['items', 'jpg?x=1'],
    ['Items', 'jpg'],
    ['items/..', 'jpg'],
    ['', 'jpg'],
    ['my items', 'jpg'],
  ])('refuses folder "%s" with extension "%s" and copies nothing', async (folder, extension) => {
    const { fs, files, external } = createMemoryFs();
    external.set('file:///tmp/a.jpg', b64('a'));
    const makeId = jest.fn(() => 'abc');
    const store = createImageStore(fs, makeId);

    await expect(store.save('file:///tmp/a.jpg', folder, extension)).rejects.toThrow(
      'Invalid image location',
    );
    expect(files.size).toBe(0);
    expect(makeId).not.toHaveBeenCalled();
  });

  it('gives every image its own generated name', async () => {
    const { fs, files, external } = createMemoryFs();
    external.set('file:///tmp/a.jpg', b64('a'));
    const store = createImageStore(fs);

    const first = await store.save('file:///tmp/a.jpg', 'items');
    const second = await store.save('file:///tmp/a.jpg', 'items');

    expect(first).toMatch(/^images\/items\/[0-9a-f-]{36}\.jpg$/);
    expect(second).toMatch(/^images\/items\/[0-9a-f-]{36}\.jpg$/);
    expect(second).not.toBe(first);
    expect([...files.keys()].sort()).toEqual([first, second].sort());
  });

  it('lets a failed copy through and leaves nothing behind', async () => {
    const { fs, files } = createMemoryFs();
    const store = createImageStore(fs, () => 'abc');

    await expect(store.save('file:///tmp/gone.jpg', 'items')).rejects.toThrow('No such file');
    expect(files.size).toBe(0);
    expect(await store.exists('images/items/abc.jpg')).toBe(false);
  });

  it('gives the absolute URI of any stored path and says what exists', async () => {
    const { fs } = createMemoryFs({ 'images/avatar/me.jpg': b64('me') });
    const store = createImageStore(fs, () => 'abc');

    expect(store.uri('images/avatar/me.jpg')).toBe('file:///documents/images/avatar/me.jpg');
    expect(await store.exists('images/avatar/me.jpg')).toBe(true);
    expect(await store.exists('images/avatar/other.jpg')).toBe(false);
  });

  it('removes only the image asked for and refuses the image folder itself', async () => {
    const { fs, files } = createMemoryFs({
      'images/items/a.jpg': b64('a'),
      'images/items/b.jpg': b64('b'),
    });
    const store = createImageStore(fs, () => 'abc');

    await store.remove('images/items/a.jpg');
    expect([...files.keys()]).toEqual(['images/items/b.jpg']);

    await expect(store.remove('images')).rejects.toThrow('Refusing to delete');
    await expect(store.remove('imagesX/a.jpg')).rejects.toThrow('Refusing to delete');
    await expect(store.remove('')).rejects.toThrow('Refusing to delete');
    expect([...files.keys()]).toEqual(['images/items/b.jpg']);
  });

  it('by default stores on the device, under the document directory', async () => {
    mockDisk.files.set('file:///cache/picked.png', b64('picked'));

    const path = await imageStore.save('file:///cache/picked.png', 'items', 'png');

    expect(path).toMatch(/^images\/items\/[0-9a-f-]{36}\.png$/);
    expect(imageStore.uri(path)).toBe(ROOT + path);
    expect(mockDisk.files.get(ROOT + path)).toBe(b64('picked'));
    expect(await imageStore.exists(path)).toBe(true);

    await imageStore.remove(path);
    expect(await imageStore.exists(path)).toBe(false);
    expect(mockDisk.files.has('file:///cache/picked.png')).toBe(true);
  });
});
