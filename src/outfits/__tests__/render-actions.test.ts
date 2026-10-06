import { Image } from 'react-native';

import { TryOnError, type TryOnInput, type TryOnProvider } from '@/ai/tryOn';
import { createItemRepository } from '@/closet/repository';
import type { ItemDetails } from '@/closet/types';
import type { Db } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { profileRepository } from '@/profile/repository';

import {
  avatarBasePath,
  createStudioAvatar,
  currentFingerprint,
  describeItem,
  getStudioCandidate,
  isAutoRenderOn,
  isDisclosed,
  outfitItemIds,
  renderQueue,
  requestRender,
  runRender,
  setAutoRender,
  setDisclosed,
  setStudioCandidate,
  useRenderVersion,
} from '../renderActions';
import { RenderFailedError, RenderSupersededError } from '../renderQueue';
import { fingerprint, renderRepository, usageLog } from '../renders';
import { outfitRepository, type Outfit } from '../repository';

const mockDb = { current: null as Db | null };
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('@/db/client', () => ({ getDb: () => mockDb.current }));

const mockSettings = new Map<string, string>();
jest.mock('@/db/settings', () => ({
  getSetting: (key: string) => mockSettings.get(key) ?? null,
  setSetting: (key: string, value: string | null) => {
    if (value === null) mockSettings.delete(key);
    else mockSettings.set(key, value);
  },
}));

const mockKeys = { image: 'image-key' as string | null, asked: [] as string[] };
jest.mock('@/ai/keys', () => ({
  keyManager: {
    getKey: async (provider: string) => {
      mockKeys.asked.push(provider);
      return provider === 'image' ? mockKeys.image : null;
    },
  },
}));

/** The image store: what was saved where, with failures on request. */
const mockStore = {
  counter: 0,
  saved: [] as { uri: string; folder: string; extension: string; path: string }[],
  /** Decides whether saving this source fails. */
  fails: (_uri: string): boolean => false,
};
jest.mock('@/storage/imageStore', () => ({
  imageStore: {
    uri: (path: string) => `file:///documents/${path}`,
    save: async (uri: string, folder: string, extension: string) => {
      if (mockStore.fails(uri)) throw new Error('cannot copy into the image store');
      const path = `images/${folder}/${++mockStore.counter}.${extension}`;
      mockStore.saved.push({ uri, folder, extension, path });
      return path;
    },
  },
}));

// The device image helpers load the native vision module, which does not exist under test.
jest.mock('../../../modules/closet-vision', () => ({ removeBackground: async () => null }));

const mockFs = {
  written: [] as { uri: string; data: string; encoding?: string }[],
  deleted: [] as string[],
  failWrites: 0,
};
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  // The contents of a file are its own address, so a test can tell which file was read.
  readAsStringAsync: async (uri: string, options?: { encoding?: string }) => {
    if (options?.encoding !== 'base64') throw new Error('Images must be read as base64');
    return `DATA<${uri}>`;
  },
  writeAsStringAsync: async (uri: string, data: string, options?: { encoding?: string }) => {
    if (mockFs.failWrites > 0) {
      mockFs.failWrites--;
      throw new Error('disk full');
    }
    mockFs.written.push({ uri, data, encoding: options?.encoding });
  },
  deleteAsync: async (uri: string) => {
    mockFs.deleted.push(uri);
  },
}));

const mockManipulate = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  manipulateAsync: (...args: unknown[]) => mockManipulate(...args),
}));

const mockFetch = jest.fn();
const realFetch = global.fetch;

/** Width and height by image address; null for an image whose size cannot be read. */
const sizes = new Map<string, { width: number; height: number } | null>();

const stored = (path: string) => `file:///documents/${path}`;
/** Where the manipulator stand-in puts the resized copy of an image. */
const resized = (uri: string, format: 'png' | 'jpeg') =>
  `file:///cache/resized/${encodeURIComponent(uri)}.${format}`;
/** What the encoded image of a stored path looks like once resized and read. */
const encoded = (path: string, format: 'png' | 'jpeg') => ({
  base64: `DATA<${resized(stored(path), format)}>`,
  mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
});

const details = (patch: Partial<ItemDetails> = {}): ItemDetails => ({
  name: null,
  category: 'tops',
  subcategory: null,
  colours: [],
  seasons: [],
  occasions: [],
  warmth: null,
  brand: null,
  size: null,
  price: null,
  currency: null,
  purchasedAt: null,
  notes: null,
  sourceUrl: null,
  ...patch,
});

const fakeProvider = (image = { base64: 'RENDERED', mimeType: 'image/png' }) => {
  const provider = {
    id: 'fake',
    render: jest.fn(async (_input: TryOnInput, _key: string) => image),
    studioAvatar: jest.fn(async (..._args: Parameters<TryOnProvider['studioAvatar']>) => image),
  };
  return provider;
};

const AVATAR = {
  avatarPath: 'images/avatar/full.jpg',
  avatarSmallPath: 'images/avatar/small.jpg',
};

const setup = async (options: { profile?: 'none' | 'noAvatar' | 'photo' | 'studio' } = {}) => {
  const { db } = await createTestDb();
  mockDb.current = db;
  const items = createItemRepository(() => db);
  const coat = await items.create(
    details({ name: 'Wool coat', category: 'outerwear', subcategory: 'coat', colours: ['navy'] }),
    {
      originalPath: 'images/items/coat.jpg',
      cutoutPath: null,
      thumbPath: 'images/items/coat-t.jpg',
    },
  );
  const shirt = await items.create(
    details({ name: 'Shirt', category: 'tops', subcategory: 'shirt', colours: ['white'] }),
    {
      originalPath: 'images/items/shirt.jpg',
      cutoutPath: 'images/items/shirt.png',
      thumbPath: 'images/items/shirt-t.png',
    },
  );
  const skirt = await items.create(
    details({ category: 'bottoms', subcategory: 'skirt', colours: ['pink', 'white'] }),
    {
      originalPath: 'images/items/skirt.jpg',
      cutoutPath: null,
      thumbPath: 'images/items/skirt-t.jpg',
    },
  );
  const kind = options.profile ?? 'photo';
  if (kind !== 'none') {
    await profileRepository.save({
      name: 'Auri',
      gender: 'woman',
      bodyType: 'average',
      ...(kind === 'noAvatar' ? {} : AVATAR),
      ...(kind === 'studio' ? { avatarStudioPath: 'images/avatar/studio.png' } : {}),
    });
  }
  const outfit = await outfitRepository.create(
    [
      { itemId: skirt.id, slot: 'bottom', position: 0 },
      { itemId: coat.id, slot: 'outer', position: 0 },
      { itemId: shirt.id, slot: 'top', position: 0 },
    ],
    { name: 'Friday' },
  );
  const basePath = kind === 'studio' ? 'images/avatar/studio.png' : AVATAR.avatarSmallPath;
  return { db, items, coat, shirt, skirt, outfit, basePath };
};

/** A queued render of the outfit as it is right now. */
const queued = (outfit: Outfit, basePath: string) =>
  renderRepository.enqueue(outfit.id, currentFingerprint(outfit, basePath)!);

const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'no error',
    (error: unknown) => (error instanceof RenderFailedError ? error.failure : error),
  );

const tryOnReasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'no error',
    (error: unknown) => (error instanceof TryOnError ? error.reason : error),
  );

const geminiImage = (data = 'GEMINI-OUT') => ({
  status: 200,
  json: async () => ({
    candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data } }] } }],
  }),
});

beforeEach(async () => {
  mockDb.current = (await createTestDb()).db;
  mockSettings.clear();
  mockKeys.image = 'image-key';
  mockKeys.asked = [];
  mockStore.counter = 0;
  mockStore.saved = [];
  mockStore.fails = () => false;
  mockFs.written = [];
  mockFs.deleted = [];
  mockFs.failWrites = 0;
  sizes.clear();
  mockManipulate
    .mockReset()
    .mockImplementation(async (uri: string, _actions: unknown, options: { format: string }) => ({
      uri: resized(uri, options.format as 'png' | 'jpeg'),
    }));
  mockFetch.mockReset().mockImplementation(async () => geminiImage());
  global.fetch = mockFetch as never;
  jest.spyOn(Image, 'getSize').mockImplementation(((
    uri: string,
    success: (width: number, height: number) => void,
    failure?: (error: unknown) => void,
  ) => {
    const size = sizes.has(uri) ? sizes.get(uri) : { width: 2000, height: 3000 };
    if (size) success(size.width, size.height);
    else failure?.(new Error('cannot read the image size'));
  }) as never);
  useRenderVersion.setState({ version: 0 });
});

afterEach(async () => {
  // The queue lives in the module; no test may leave it running for the next one.
  await renderQueue.start();
  jest.restoreAllMocks();
});

afterAll(() => {
  global.fetch = realFetch;
});

describe('try-on settings', () => {
  it('renders automatically unless the user turned it off, and forgets the choice when turned on again', () => {
    expect(isAutoRenderOn()).toBe(true);

    setAutoRender(false);
    expect(isAutoRenderOn()).toBe(false);
    expect(mockSettings.get('tryon.auto')).toBe('off');

    setAutoRender(true);
    expect(isAutoRenderOn()).toBe(true);
    expect(mockSettings.has('tryon.auto')).toBe(false);
  });

  it('treats any other stored value as on', () => {
    mockSettings.set('tryon.auto', 'on');
    expect(isAutoRenderOn()).toBe(true);
  });

  it('counts the provider notice as seen only after it was confirmed', () => {
    expect(isDisclosed()).toBe(false);
    mockSettings.set('tryon.disclosed', 'no');
    expect(isDisclosed()).toBe(false);

    setDisclosed();
    expect(isDisclosed()).toBe(true);
    expect(mockSettings.get('tryon.disclosed')).toBe('yes');
  });

  it('remembers a studio avatar that waits for a decision, and forgets it once decided', () => {
    expect(getStudioCandidate()).toBeNull();

    setStudioCandidate('images/avatar/candidate.png');
    expect(getStudioCandidate()).toBe('images/avatar/candidate.png');

    setStudioCandidate(null);
    expect(getStudioCandidate()).toBeNull();
    expect(mockSettings.size).toBe(0);
  });
});

describe('what a render is based on', () => {
  it('uses the studio avatar when there is one, otherwise the small photo, never the full photo', () => {
    expect(avatarBasePath(null)).toBeNull();
    expect(avatarBasePath({ avatarStudioPath: null, avatarSmallPath: null })).toBeNull();
    expect(avatarBasePath({ avatarStudioPath: null, avatarSmallPath: 'small.jpg' })).toBe(
      'small.jpg',
    );
    expect(avatarBasePath({ avatarStudioPath: 'studio.png', avatarSmallPath: 'small.jpg' })).toBe(
      'studio.png',
    );
  });

  it('identifies each piece by the item and the picture of it that is sent', async () => {
    const { outfit, coat, shirt, skirt } = await setup();
    expect(outfitItemIds(outfit)).toEqual([
      `${coat.id}@images/items/coat.jpg`,
      `${shirt.id}@images/items/shirt.png`,
      `${skirt.id}@images/items/skirt.jpg`,
    ]);
  });

  it('has no fingerprint without an avatar', async () => {
    const { outfit } = await setup();
    expect(currentFingerprint(outfit, null)).toBeNull();
  });

  it('changes the fingerprint with the avatar, a piece or the photo of a piece, and not with their order', async () => {
    const { outfit, items, skirt, coat } = await setup();
    const print = currentFingerprint(outfit, 'small.jpg');

    expect(print).toBe(fingerprint('small.jpg', outfitItemIds(outfit)));
    expect(currentFingerprint({ entries: [...outfit.entries].reverse() }, 'small.jpg')).toBe(print);
    expect(currentFingerprint(outfit, 'studio.png')).not.toBe(print);
    expect(currentFingerprint({ entries: outfit.entries.slice(1) }, 'small.jpg')).not.toBe(print);

    // The skirt gets a cutout: renders made with its old photo are out of date.
    await items.update(skirt.id, { cutoutPath: 'images/items/skirt.png' });
    const changed = (await outfitRepository.get(outfit.id))!;
    expect(currentFingerprint(changed, 'small.jpg')).not.toBe(print);

    // Renaming a piece changes nothing about how it looks.
    await items.update(coat.id, { name: 'Winter coat' });
    const renamed = (await outfitRepository.get(outfit.id))!;
    expect(currentFingerprint(renamed, 'small.jpg')).toBe(currentFingerprint(changed, 'small.jpg'));
  });

  it('describes an item by its name, colours and kind', async () => {
    const { coat, skirt, items } = await setup();
    expect(describeItem(coat)).toBe('Wool coat; navy coat');
    // Without a name the colours and the kind are all there is.
    expect(describeItem(skirt)).toBe('pink white skirt');

    const plain = await items.create(details({ category: 'shoes' }), {
      originalPath: 'o.jpg',
      cutoutPath: null,
      thumbPath: 't.jpg',
    });
    // Without a type the category stands in; without colours nothing is made up.
    expect(describeItem(plain)).toBe('shoes');
    expect(describeItem({ ...plain, name: 'Boots', colours: ['black'] })).toBe(
      'Boots; black shoes',
    );
  });
});

describe('producing a render', () => {
  it('fails with "no avatar" before there is a profile or a photo, without asking the provider', async () => {
    const none = await setup({ profile: 'none' });
    const provider = fakeProvider();
    const render = await renderRepository.enqueue(none.outfit.id, 'whatever');
    expect(await failureOf(runRender(render, provider))).toBe('noAvatar');

    const noPhoto = await setup({ profile: 'noAvatar' });
    const second = await renderRepository.enqueue(noPhoto.outfit.id, 'whatever');
    // Even without a key the missing photo is what the user has to fix first.
    mockKeys.image = null;
    expect(await failureOf(runRender(second, provider))).toBe('noAvatar');

    expect(provider.render).not.toHaveBeenCalled();
    expect(mockManipulate).not.toHaveBeenCalled();
    expect(await usageLog.counts('render')).toEqual({ month: 0, total: 0 });
  });

  it('fails with "no key" when no image provider key is stored', async () => {
    const { outfit, basePath } = await setup();
    mockKeys.image = null;
    const provider = fakeProvider();

    expect(await failureOf(runRender(await queued(outfit, basePath), provider))).toBe('noKey');

    expect(mockKeys.asked).toEqual(['image']);
    expect(provider.render).not.toHaveBeenCalled();
    expect(mockManipulate).not.toHaveBeenCalled();
  });

  it('fails when the outfit no longer exists or has no pieces left', async () => {
    const { outfit, basePath, items, coat, shirt, skirt } = await setup();
    const provider = fakeProvider();

    const orphan = await renderRepository.enqueue('no-such-outfit', 'whatever');
    expect(await failureOf(runRender(orphan, provider))).toBe('error');

    const render = await queued(outfit, basePath);
    await items.remove([coat.id, shirt.id, skirt.id]);
    expect(await failureOf(runRender(render, provider))).toBe('error');

    expect(provider.render).not.toHaveBeenCalled();
    expect(await usageLog.counts('render')).toEqual({ month: 0, total: 0 });
  });

  it('is superseded, unpaid, when the pieces changed since it was queued', async () => {
    const { outfit, basePath, skirt } = await setup();
    const provider = fakeProvider();
    const render = await queued(outfit, basePath);
    await outfitRepository.setPieces(outfit.id, [
      { itemId: skirt.id, slot: 'bottom', position: 0 },
    ]);

    await expect(runRender(render, provider)).rejects.toBeInstanceOf(RenderSupersededError);

    expect(provider.render).not.toHaveBeenCalled();
    expect(mockManipulate).not.toHaveBeenCalled();
    expect(await usageLog.counts('render')).toEqual({ month: 0, total: 0 });
  });

  it('is superseded when the avatar changed since it was queued', async () => {
    const { outfit, basePath } = await setup();
    const render = await queued(outfit, basePath);
    await profileRepository.save({ avatarStudioPath: 'images/avatar/studio.png' });

    await expect(runRender(render, fakeProvider())).rejects.toBeInstanceOf(RenderSupersededError);
  });

  it('sends the avatar and every piece, described and encoded, then stores the picture with a thumbnail', async () => {
    const { outfit, basePath } = await setup();
    const provider = fakeProvider();

    const result = await runRender(await queued(outfit, basePath), provider);

    expect(provider.render).toHaveBeenCalledTimes(1);
    const [input, key] = provider.render.mock.calls[0];
    expect(key).toBe('image-key');
    expect(input.hints).toEqual({ gender: 'woman', bodyType: 'average' });
    expect(input.avatar).toEqual(encoded('images/avatar/small.jpg', 'jpeg'));
    // In the order of the editor, each with the picture that is shown for it:
    // a cutout stays a PNG to keep its transparency, a plain photo goes as JPEG.
    expect(input.pieces).toEqual([
      {
        slotLabel: 'outer layer, worn over the other pieces',
        description: 'Wool coat; navy coat',
        image: encoded('images/items/coat.jpg', 'jpeg'),
      },
      {
        slotLabel: 'top',
        description: 'Shirt; white shirt',
        image: encoded('images/items/shirt.png', 'png'),
      },
      {
        slotLabel: 'bottom',
        description: 'pink white skirt',
        image: encoded('images/items/skirt.jpg', 'jpeg'),
      },
    ]);

    // Portrait photos of 2000 x 3000 are brought down to 1024 on their longest side.
    expect(mockManipulate.mock.calls.slice(0, 4)).toEqual([
      [
        stored('images/items/coat.jpg'),
        [{ resize: { height: 1024 } }],
        { compress: 0.9, format: 'jpeg' },
      ],
      [
        stored('images/items/shirt.png'),
        [{ resize: { height: 1024 } }],
        { compress: 0.9, format: 'png' },
      ],
      [
        stored('images/items/skirt.jpg'),
        [{ resize: { height: 1024 } }],
        { compress: 0.9, format: 'jpeg' },
      ],
      [
        stored('images/avatar/small.jpg'),
        [{ resize: { height: 1024 } }],
        { compress: 0.9, format: 'jpeg' },
      ],
    ]);
    // The resized copies were only needed to be read.
    expect(mockFs.deleted).toEqual([
      resized(stored('images/items/coat.jpg'), 'jpeg'),
      resized(stored('images/items/shirt.png'), 'png'),
      resized(stored('images/items/skirt.jpg'), 'jpeg'),
      resized(stored('images/avatar/small.jpg'), 'jpeg'),
    ]);

    // The answer is written to a temporary file and copied into the store, with a small JPEG.
    expect(mockFs.written).toHaveLength(1);
    const [temp] = mockFs.written;
    expect(temp.uri).toMatch(/^file:\/\/\/cache\/generated-[0-9a-f-]{36}\.png$/);
    expect(temp).toMatchObject({ data: 'RENDERED', encoding: 'base64' });
    expect(mockManipulate.mock.calls[4]).toEqual([
      temp.uri,
      [{ resize: { width: 400 } }],
      { compress: 0.85, format: 'jpeg' },
    ]);
    expect(mockStore.saved).toEqual([
      { uri: temp.uri, folder: 'renders', extension: 'png', path: 'images/renders/1.png' },
      {
        uri: resized(temp.uri, 'jpeg'),
        folder: 'renders',
        extension: 'jpg',
        path: 'images/renders/2.jpg',
      },
    ]);
    expect(result).toEqual({
      imagePath: 'images/renders/1.png',
      thumbPath: 'images/renders/2.jpg',
      provider: 'fake',
    });
  });

  it('records the paid request exactly once, and only after the provider has answered', async () => {
    const { outfit, basePath } = await setup();
    const provider = fakeProvider();
    let countedWhenAsked: number | null = null;
    provider.render.mockImplementation(async () => {
      countedWhenAsked = (await usageLog.counts('render')).total;
      return { base64: 'RENDERED', mimeType: 'image/png' };
    });

    await runRender(await queued(outfit, basePath), provider);

    expect(countedWhenAsked).toBe(0);
    expect(await usageLog.counts('render')).toEqual({ month: 1, total: 1 });
    expect(await usageLog.counts('studio')).toEqual({ month: 0, total: 0 });
  });

  it('bases the render on the studio avatar when one was accepted', async () => {
    const { outfit, basePath } = await setup({ profile: 'studio' });
    const provider = fakeProvider();

    await runRender(await queued(outfit, basePath), provider);

    expect(provider.render.mock.calls[0][0].avatar).toEqual(
      encoded('images/avatar/studio.png', 'jpeg'),
    );
  });

  it('gives no hint about gender or build when the profile does not say', async () => {
    const { outfit, basePath } = await setup();
    await profileRepository.save({ gender: 'unspecified', bodyType: null });
    const provider = fakeProvider();

    await runRender(await queued(outfit, basePath), provider);

    expect(provider.render.mock.calls[0][0].hints).toEqual({ gender: null, bodyType: null });

    await profileRepository.save({ gender: 'man', bodyType: 'athletic' });
    await runRender(await queued(outfit, basePath), provider);
    expect(provider.render.mock.calls[1][0].hints).toEqual({ gender: 'man', bodyType: 'athletic' });
  });

  it('never enlarges a small picture, and caps the width when the size cannot be read', async () => {
    const { outfit, basePath } = await setup();
    sizes.set(stored('images/items/coat.jpg'), { width: 800, height: 600 });
    sizes.set(stored('images/items/shirt.png'), { width: 3000, height: 1500 });
    sizes.set(stored('images/items/skirt.jpg'), null);

    await runRender(await queued(outfit, basePath), fakeProvider());

    expect(mockManipulate.mock.calls.slice(0, 3).map((call) => call[1])).toEqual([
      [],
      [{ resize: { width: 1024 } }],
      [{ resize: { width: 1024 } }],
    ]);
  });

  it('keeps a stored image that needed no temporary copy', async () => {
    const { outfit, basePath } = await setup();
    // The manipulator hands back the very file it was given.
    mockManipulate.mockImplementation(async (uri: string) => ({ uri }));

    await runRender(await queued(outfit, basePath), fakeProvider());

    expect(mockFs.deleted).toEqual([]);
  });

  it.each([
    'noKey',
    'offline',
    'connectionLost',
    'declined',
    'rateLimited',
    'timeout',
    'error',
  ] as const)(
    'reports a provider failure as "%s", with nothing stored and nothing counted',
    async (reason) => {
      const { outfit, basePath } = await setup();
      const provider = fakeProvider();
      provider.render.mockRejectedValue(new TryOnError(reason));

      expect(await failureOf(runRender(await queued(outfit, basePath), provider))).toBe(reason);

      expect(mockStore.saved).toEqual([]);
      expect(mockFs.written).toEqual([]);
      expect(await usageLog.counts('render')).toEqual({ month: 0, total: 0 });
    },
  );

  it('reports anything unexpected as a plain error', async () => {
    const { outfit, basePath } = await setup();
    const provider = fakeProvider();
    provider.render.mockRejectedValue(new TypeError('undefined is not a function'));
    expect(await failureOf(runRender(await queued(outfit, basePath), provider))).toBe('error');

    // An image that cannot be prepared never reaches the provider.
    mockManipulate.mockRejectedValue(new Error('cannot decode'));
    const second = fakeProvider();
    expect(await failureOf(runRender(await queued(outfit, basePath), second))).toBe('error');
    expect(second.render).not.toHaveBeenCalled();
  });

  it('tries once more when writing the paid picture fails, without asking the provider again', async () => {
    const { outfit, basePath } = await setup();
    const provider = fakeProvider();
    mockFs.failWrites = 1;

    const result = await runRender(await queued(outfit, basePath), provider);

    expect(result).toEqual({
      imagePath: 'images/renders/1.png',
      thumbPath: 'images/renders/2.jpg',
      provider: 'fake',
    });
    expect(mockFs.written).toHaveLength(1);
    expect(mockFs.written[0].data).toBe('RENDERED');
    expect(provider.render).toHaveBeenCalledTimes(1);
    expect(await usageLog.counts('render')).toEqual({ month: 1, total: 1 });
  });

  it('tries once more when copying the paid picture into the store fails', async () => {
    const { outfit, basePath } = await setup();
    const provider = fakeProvider();
    let failures = 1;
    mockStore.fails = (uri) => uri.includes('generated-') && failures-- > 0;

    const result = await runRender(await queued(outfit, basePath), provider);

    expect(result.imagePath).toBe('images/renders/1.png');
    // Written again from the answer that is still in memory.
    expect(mockFs.written.map((file) => file.data)).toEqual(['RENDERED', 'RENDERED']);
    expect(provider.render).toHaveBeenCalledTimes(1);
  });

  it('fails, with the request still counted, when the picture cannot be stored twice in a row', async () => {
    const { outfit, basePath } = await setup();
    const provider = fakeProvider();
    mockFs.failWrites = 2;

    expect(await failureOf(runRender(await queued(outfit, basePath), provider))).toBe('error');

    expect(provider.render).toHaveBeenCalledTimes(1);
    expect(await usageLog.counts('render')).toEqual({ month: 1, total: 1 });
  });

  it('shows the full picture in place of a thumbnail that could not be made', async () => {
    const { outfit, basePath } = await setup();
    mockManipulate.mockImplementation(
      async (uri: string, _actions: unknown, options: { format: 'png' | 'jpeg' }) => {
        if (uri.includes('generated-')) throw new Error('out of memory');
        return { uri: resized(uri, options.format) };
      },
    );

    const result = await runRender(await queued(outfit, basePath), fakeProvider());

    expect(result).toEqual({
      imagePath: 'images/renders/1.png',
      thumbPath: 'images/renders/1.png',
      provider: 'fake',
    });
  });

  it('does the same when the thumbnail cannot be saved', async () => {
    const { outfit, basePath } = await setup();
    mockStore.fails = (uri) => uri.includes('resized') && uri.includes('generated-');

    const result = await runRender(await queued(outfit, basePath), fakeProvider());

    expect(result.thumbPath).toBe(result.imagePath);
    expect(mockStore.saved).toHaveLength(1);
  });

  it('stores a JPEG answer as a JPEG', async () => {
    const { outfit, basePath } = await setup();
    const provider = fakeProvider({ base64: 'JPEG-DATA', mimeType: 'image/jpeg' });

    const result = await runRender(await queued(outfit, basePath), provider);

    expect(mockFs.written[0].uri).toMatch(/generated-[0-9a-f-]{36}\.jpg$/);
    expect(result.imagePath).toBe('images/renders/1.jpg');
  });
});

describe('asking for a render', () => {
  const rendersOf = (outfit: Outfit) => renderRepository.forOutfit(outfit.id);

  it('is skipped without an avatar: nothing is queued and nothing is sent', async () => {
    const { outfit } = await setup({ profile: 'noAvatar' });

    expect(await requestRender(outfit)).toEqual({ kind: 'skipped', reason: 'noAvatar' });
    await renderQueue.start();

    expect(await rendersOf(outfit)).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('queues a render, sends it with the stored key and keeps the picture', async () => {
    const { outfit, basePath } = await setup();

    const outcome = await requestRender(outfit);
    expect(outcome).toMatchObject({
      kind: 'queued',
      render: { outfitId: outfit.id, fingerprint: currentFingerprint(outfit, basePath) },
    });
    await renderQueue.start();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toContain(':generateContent');
    expect(url).not.toContain('image-key');
    expect(init.headers['x-goog-api-key']).toBe('image-key');
    const parts = JSON.parse(init.body).contents[0].parts as {
      text?: string;
      inlineData?: { data: string };
    }[];
    expect(parts[0].text).toContain('Image 3: top (Shirt; white shirt)');
    // The avatar first, then the pieces in the order they are described.
    expect(parts.slice(1).map((part) => part.inlineData?.data)).toEqual([
      encoded('images/avatar/small.jpg', 'jpeg').base64,
      encoded('images/items/coat.jpg', 'jpeg').base64,
      encoded('images/items/shirt.png', 'png').base64,
      encoded('images/items/skirt.jpg', 'jpeg').base64,
    ]);

    expect(await rendersOf(outfit)).toMatchObject([
      {
        status: 'done',
        provider: 'gemini',
        imagePath: 'images/renders/1.png',
        thumbPath: 'images/renders/2.jpg',
        failure: null,
      },
    ]);
    expect(mockFs.written[0].data).toBe('GEMINI-OUT');
    expect(await usageLog.counts('render')).toEqual({ month: 1, total: 1 });
    // Screens showing renders were told to refresh.
    expect(useRenderVersion.getState().version).toBeGreaterThan(0);
  });

  it('reuses the finished render of the same pieces and avatar instead of paying again', async () => {
    const { outfit } = await setup();
    await requestRender(outfit);
    await renderQueue.start();
    const [done] = await rendersOf(outfit);

    const again = await requestRender(outfit);
    await renderQueue.start();

    expect(again).toMatchObject({ kind: 'reused', render: { id: done.id, status: 'done' } });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(await rendersOf(outfit)).toHaveLength(1);
    expect(await usageLog.counts('render')).toEqual({ month: 1, total: 1 });
  });

  it('gives a second outfit made of the same pieces the same picture, unpaid', async () => {
    const { outfit } = await setup();
    await requestRender(outfit);
    await renderQueue.start();
    const copy = (await outfitRepository.duplicate(outfit.id))!;

    const outcome = await requestRender(copy);

    expect(outcome.kind).toBe('reused');
    expect(await rendersOf(copy)).toMatchObject([
      { status: 'done', imagePath: 'images/renders/1.png', thumbPath: 'images/renders/2.jpg' },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not queue a second render while one for the same outfit is waiting or running', async () => {
    const { outfit } = await setup();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockFetch.mockImplementation(async () => {
      await gate;
      return geminiImage();
    });

    const first = await requestRender(outfit);
    const second = await requestRender(outfit);
    // By now the first has been taken up by the queue and is running.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const third = await requestRender(outfit);

    const [only] = await rendersOf(outfit);
    expect(await rendersOf(outfit)).toHaveLength(1);
    expect(only.status).toBe('running');
    for (const outcome of [first, second, third]) {
      expect(outcome).toMatchObject({ kind: 'queued', render: { id: only.id } });
    }

    release();
    await renderQueue.start();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(await rendersOf(outfit)).toMatchObject([{ status: 'done' }]);
    expect(await usageLog.counts('render')).toEqual({ month: 1, total: 1 });
  });

  it('makes a fresh render when forced, keeping the earlier one to step back to', async () => {
    const { outfit } = await setup();
    await requestRender(outfit);
    await renderQueue.start();
    mockFetch.mockImplementation(async () => geminiImage('SECOND-OUT'));

    const outcome = await requestRender(outfit, true);
    await renderQueue.start();

    expect(outcome.kind).toBe('queued');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const renders = await rendersOf(outfit);
    expect(renders.map((render) => render.status)).toEqual(['done', 'done']);
    expect(new Set(renders.map((render) => render.imagePath))).toEqual(
      new Set(['images/renders/1.png', 'images/renders/3.png']),
    );
    expect(mockFs.written.map((file) => file.data)).toEqual(['GEMINI-OUT', 'SECOND-OUT']);
    expect(await usageLog.counts('render')).toEqual({ month: 2, total: 2 });
  });

  it('renders again after the avatar was replaced', async () => {
    const { outfit } = await setup();
    await requestRender(outfit);
    await renderQueue.start();
    await profileRepository.save({ avatarStudioPath: 'images/avatar/studio.png' });

    const outcome = await requestRender(outfit);
    await renderQueue.start();

    expect(outcome.kind).toBe('queued');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('marks the render as failed with the reason when there is no key, without sending anything', async () => {
    const { outfit } = await setup();
    mockKeys.image = null;

    await requestRender(outfit);
    await renderQueue.start();

    expect(await rendersOf(outfit)).toMatchObject([
      { status: 'failed', failure: 'noKey', imagePath: null },
    ]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('marks the render as failed with what the provider said, and does not try again by itself', async () => {
    const { outfit } = await setup();
    mockFetch.mockImplementation(async () => ({ status: 429, json: async () => ({}) }));

    await requestRender(outfit);
    await renderQueue.start();
    await renderQueue.start();

    expect(await rendersOf(outfit)).toMatchObject([{ status: 'failed', failure: 'rateLimited' }]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(await usageLog.counts('render')).toEqual({ month: 0, total: 0 });
  });

  it('forgets a waiting render whose outfit changed before its turn, without a failure or a request', async () => {
    const { outfit, skirt, shirt } = await setup();
    const other = await outfitRepository.create([
      { itemId: shirt.id, slot: 'top', position: 0 },
      { itemId: skirt.id, slot: 'bottom', position: 0 },
    ]);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockFetch.mockImplementation(async () => {
      await gate;
      return geminiImage();
    });
    await requestRender(outfit);
    await requestRender(other);
    // The second outfit loses a piece while it waits behind the first.
    await outfitRepository.setPieces(other.id, [{ itemId: skirt.id, slot: 'bottom', position: 0 }]);

    release();
    await renderQueue.start();

    expect(await rendersOf(outfit)).toMatchObject([{ status: 'done' }]);
    expect(await rendersOf(other)).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('creating a studio avatar', () => {
  it('needs a photo first', async () => {
    await setup({ profile: 'none' });
    const provider = fakeProvider();
    expect(await tryOnReasonOf(createStudioAvatar(provider))).toBe('error');

    await setup({ profile: 'noAvatar' });
    expect(await tryOnReasonOf(createStudioAvatar(provider))).toBe('error');
    expect(provider.studioAvatar).not.toHaveBeenCalled();
  });

  it('needs an image provider key', async () => {
    await setup();
    mockKeys.image = null;
    const provider = fakeProvider();

    expect(await tryOnReasonOf(createStudioAvatar(provider))).toBe('noKey');

    expect(provider.studioAvatar).not.toHaveBeenCalled();
    expect(mockManipulate).not.toHaveBeenCalled();
    expect(await usageLog.counts('studio')).toEqual({ month: 0, total: 0 });
  });

  it('sends the small photo, counts one studio request and returns the stored picture without making it the base', async () => {
    await setup();
    const provider = fakeProvider({ base64: 'STUDIO', mimeType: 'image/png' });

    const path = await createStudioAvatar(provider);

    expect(provider.studioAvatar).toHaveBeenCalledTimes(1);
    expect(provider.studioAvatar).toHaveBeenCalledWith(
      encoded('images/avatar/small.jpg', 'jpeg'),
      { gender: 'woman', bodyType: 'average' },
      'image-key',
    );
    expect(path).toBe('images/avatar/1.png');
    expect(mockStore.saved.map((file) => [file.folder, file.extension])).toEqual([
      ['avatar', 'png'],
      ['avatar', 'jpg'],
    ]);
    expect(mockFs.written[0]).toMatchObject({ data: 'STUDIO', encoding: 'base64' });
    expect(await usageLog.counts('studio')).toEqual({ month: 1, total: 1 });
    expect(await usageLog.counts('render')).toEqual({ month: 0, total: 0 });
    // The user looks at it first: the profile still points at the photo.
    expect(await profileRepository.get()).toMatchObject({
      avatarStudioPath: null,
      avatarSmallPath: 'images/avatar/small.jpg',
    });
    expect(provider.render).not.toHaveBeenCalled();
  });

  it('starts from the photo again even when a studio avatar is already in use', async () => {
    await setup({ profile: 'studio' });
    const provider = fakeProvider();

    await createStudioAvatar(provider);

    expect(provider.studioAvatar.mock.calls[0][0]).toEqual(
      encoded('images/avatar/small.jpg', 'jpeg'),
    );
  });

  it('passes on why the provider failed and counts nothing', async () => {
    await setup();
    const provider = fakeProvider();
    provider.studioAvatar.mockRejectedValue(new TryOnError('declined'));

    expect(await tryOnReasonOf(createStudioAvatar(provider))).toBe('declined');

    expect(mockStore.saved).toEqual([]);
    expect(await usageLog.counts('studio')).toEqual({ month: 0, total: 0 });
  });
});
