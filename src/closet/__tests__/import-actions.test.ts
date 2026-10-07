import { AiUnavailableError } from '@/ai/client';
import type { ItemTags } from '@/ai/tagging';
import type { Db } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { usageLog } from '@/outfits/renders';

import {
  detailsFromTags,
  dismissFailedImports,
  importJobs,
  processImportJob,
  resumeImports,
  retryImportJob,
  setImportListener,
  startBulkImport,
  useImportProgress,
  type ImportJobDeps,
} from '../importActions';
import {
  IMPORT_CONCURRENCY,
  createImportJobRepository,
  createImportProcessor,
  type ImportJob,
} from '../importQueue';
import { itemRepository } from '../repository';

const mockDb = { current: null as Db | null };
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('@/db/client', () => ({ getDb: () => mockDb.current }));

const mockI18n = { language: 'en' };
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    get language() {
      return mockI18n.language;
    },
  },
}));

const mockTag = jest.fn();
jest.mock('@/ai/tagging', () => ({ tagItem: (...args: unknown[]) => mockTag(...args) }));
jest.mock('@/ai/client', () => ({
  AiUnavailableError: class extends Error {
    reason: string;
    constructor(reason: string) {
      super(`AI unavailable: ${reason}`);
      this.reason = reason;
    }
  },
}));

/** The image store: which paths hold a file, and what was asked of it. */
const mockStore = {
  files: new Set<string>(),
  counter: 0,
  unreadable: new Set<string>(),
  undeletable: new Set<string>(),
  saved: [] as [uri: string, folder: string, extension: string][],
  removed: [] as string[],
  async save(uri: string, folder: string, extension: string) {
    if (mockStore.unreadable.has(uri)) throw new Error(`Cannot read ${uri}`);
    const path = `images/${folder}/${++mockStore.counter}.${extension}`;
    mockStore.files.add(path);
    mockStore.saved.push([uri, folder, extension]);
    return path;
  },
  async remove(path: string) {
    if (mockStore.undeletable.has(path)) throw new Error(`Cannot delete ${path}`);
    mockStore.files.delete(path);
    mockStore.removed.push(path);
  },
};
jest.mock('@/storage/imageStore', () => ({
  imageStore: {
    save: (uri: string, folder: string, extension: string) =>
      mockStore.save(uri, folder, extension),
    remove: (path: string) => mockStore.remove(path),
    uri: (path: string) => `file:///documents/${path}`,
  },
}));

const mockImages = {
  cutout: jest.fn(),
  resize: jest.fn(),
  toTagImage: jest.fn(),
  reduce: jest.fn(),
  discard: jest.fn(),
};
jest.mock('../deviceImages', () => ({
  itemImageDeps: {
    reduce: (...args: unknown[]) => mockImages.reduce(...args),
    discard: (...args: unknown[]) => mockImages.discard(...args),
    save: (uri: string, folder: string, extension: string) =>
      mockStore.save(uri, folder, extension),
    remove: (path: string) => mockStore.remove(path),
    resize: (...args: unknown[]) => mockImages.resize(...args),
    cutout: (...args: unknown[]) => mockImages.cutout(...args),
  },
  toTagImage: (...args: unknown[]) => mockImages.toTagImage(...args),
}));

const tags: ItemTags = {
  name: 'Pink skirt',
  category: 'bottoms',
  subcategory: 'skirt',
  colours: ['pink'],
  seasons: ['summer'],
  occasions: ['party'],
  warmth: 2,
  brand: 'Zara',
};
const CUTOUT = { uri: 'file:///cache/cutout.png', width: 400, height: 600 };
const EMPTY = { queued: 0, processing: 0, done: 0, failed: 0, total: 0 };

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
/** Lets everything that can run without outside help run. */
const flush = async () => {
  for (let round = 0; round < 5; round++) await tick();
};
/** Waits until the import queue has nothing waiting or in progress. */
const settle = async () => {
  for (let attempt = 0; attempt < 400; attempt++) {
    const progress = await importJobs.progress();
    if (progress.queued + progress.processing === 0) return flush();
    await tick();
  }
  throw new Error('The import did not finish');
};
const progress = () => useImportProgress.getState().progress;
/** Puts photos that were already copied into the app in the queue. */
const queueCopied = async (names: string[]) => {
  const paths = names.map((name) => `images/import/${name}`);
  for (const path of paths) mockStore.files.add(path);
  await importJobs.enqueue(paths);
  return paths;
};
const reviewItems = () => itemRepository.list({ needsReview: true });

beforeEach(async () => {
  mockDb.current = (await createTestDb()).db;
  mockI18n.language = 'en';
  mockStore.files.clear();
  mockStore.counter = 0;
  mockStore.unreadable.clear();
  mockStore.undeletable.clear();
  mockStore.saved = [];
  mockStore.removed = [];
  mockTag.mockReset().mockResolvedValue(tags);
  mockImages.cutout.mockReset().mockResolvedValue(CUTOUT);
  // Photos small enough to be left as they are, unless a test says otherwise.
  mockImages.reduce.mockReset().mockImplementation(async (photo: object) => photo);
  mockImages.discard.mockReset().mockResolvedValue(undefined);
  mockImages.resize
    .mockReset()
    .mockImplementation(
      async (_uri: string, _width: number, format: string) => `file:///cache/thumb.${format}`,
    );
  mockImages.toTagImage
    .mockReset()
    .mockImplementation(async (_uri: string, hasTransparency: boolean) => ({
      base64: 'SMALL',
      mediaType: hasTransparency ? 'image/png' : 'image/jpeg',
    }));
  useImportProgress.setState({ progress: EMPTY, version: 0 });
});

afterEach(async () => {
  // The processor lives in the module; tests that start it wait for it, this is for what follows it.
  await flush();
  setImportListener(null);
});

describe('turning one imported photo into an item', () => {
  const job: ImportJob = {
    id: 'job-1',
    sourcePath: 'images/import/a.heic',
    status: 'processing',
    error: null,
    itemId: null,
  };
  const makeDeps = (overrides: Partial<ImportJobDeps> = {}) => {
    mockStore.files.add(job.sourcePath);
    const tag = jest.fn<Promise<ItemTags | null>, Parameters<ImportJobDeps['tag']>>(
      async () => tags,
    );
    const deps: ImportJobDeps = {
      images: {
        reduce: async (photo) => photo,
        discard: async () => {},
        save: (uri, folder, extension) => mockStore.save(uri, folder, extension),
        remove: (path) => mockStore.remove(path),
        resize: async (_uri, _width, format) => `file:///cache/thumb.${format}`,
        cutout: async () => CUTOUT,
      },
      sourceUri: (path) => `file:///documents/${path}`,
      tag,
      itemExists: async (id) => (await itemRepository.get(id)) !== null,
      createItem: itemRepository.create,
      ...overrides,
    };
    return { deps, tag };
  };

  it('with a cutout: tags the cutout, stores original, cutout and a PNG thumbnail, and removes the imported photo', async () => {
    const { deps, tag } = makeDeps();

    const itemId = await processImportJob(job, deps);

    // The item takes the id of the job.
    expect(itemId).toBe('job-1');
    expect(tag).toHaveBeenCalledTimes(1);
    expect(tag).toHaveBeenCalledWith(CUTOUT.uri, true, CUTOUT);
    expect(mockStore.saved).toEqual([
      ['file:///documents/images/import/a.heic', 'items', 'heic'],
      [CUTOUT.uri, 'items', 'png'],
      ['file:///cache/thumb.png', 'items', 'png'],
    ]);
    expect(await itemRepository.get('job-1')).toMatchObject({
      id: 'job-1',
      name: 'Pink skirt',
      category: 'bottoms',
      subcategory: 'skirt',
      colours: ['pink'],
      seasons: ['summer'],
      occasions: ['party'],
      warmth: 2,
      brand: 'Zara',
      ownership: 'owned',
      needsReview: true,
      originalPath: 'images/items/1.heic',
      cutoutPath: 'images/items/2.png',
      thumbPath: 'images/items/3.png',
    });
    expect(mockStore.removed).toEqual(['images/import/a.heic']);
    expect([...mockStore.files].sort()).toEqual([
      'images/items/1.heic',
      'images/items/2.png',
      'images/items/3.png',
    ]);
  });

  it('without a cutout: tags the original photo and stores it with a JPEG thumbnail', async () => {
    const { deps, tag } = makeDeps();
    deps.images.cutout = async () => null;

    await processImportJob(job, deps);

    expect(tag).toHaveBeenCalledWith('file:///documents/images/import/a.heic', false, undefined);
    expect(await itemRepository.get('job-1')).toMatchObject({
      originalPath: 'images/items/1.heic',
      cutoutPath: null,
      thumbPath: 'images/items/2.jpg',
    });
    expect(mockStore.saved[1]).toEqual(['file:///cache/thumb.jpeg', 'items', 'jpg']);
  });

  it('without tags: creates a placeholder item to review', async () => {
    const { deps } = makeDeps({ tag: async () => null });

    await processImportJob(job, deps);

    expect(await itemRepository.get('job-1')).toMatchObject({
      name: null,
      category: 'tops',
      subcategory: null,
      colours: [],
      seasons: [],
      occasions: [],
      warmth: null,
      brand: null,
      needsReview: true,
      cutoutPath: 'images/items/2.png',
    });
  });

  it('fills details from tags and never invents what a photo cannot tell', () => {
    expect(detailsFromTags(tags)).toEqual({
      ...tags,
      size: null,
      price: null,
      currency: null,
      purchasedAt: null,
      notes: null,
      sourceUrl: null,
    });
    expect(detailsFromTags(null)).toEqual({
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
    });
    // Tags with gaps keep what they have.
    expect(
      detailsFromTags({ ...tags, name: null, subcategory: null, warmth: null, brand: null }),
    ).toMatchObject({ name: null, category: 'bottoms', subcategory: null, colours: ['pink'] });
  });

  it('does nothing when the item already exists, so a job run twice makes one item', async () => {
    const { deps, tag } = makeDeps();
    await processImportJob(job, deps);
    const first = await itemRepository.get('job-1');
    const savedBefore = mockStore.saved.length;
    deps.images.cutout = jest.fn(async () => CUTOUT);

    expect(await processImportJob(job, deps)).toBe('job-1');

    expect(deps.images.cutout).not.toHaveBeenCalled();
    expect(tag).toHaveBeenCalledTimes(1);
    expect(mockStore.saved).toHaveLength(savedBefore);
    expect(await itemRepository.count({ needsReview: true })).toBe(1);
    expect(await itemRepository.get('job-1')).toEqual(first);
  });

  it('fails when tagging fails, creating nothing and keeping the photo for another try', async () => {
    const { deps } = makeDeps({
      tag: async () => {
        throw new Error('rate limited');
      },
    });

    await expect(processImportJob(job, deps)).rejects.toThrow('rate limited');

    expect(await itemRepository.get('job-1')).toBeNull();
    expect(mockStore.saved).toEqual([]);
    expect(mockStore.files.has(job.sourcePath)).toBe(true);
  });

  it('fails when the images cannot be stored, removing what was written and keeping the photo', async () => {
    const { deps } = makeDeps();
    mockStore.unreadable.add('file:///cache/thumb.png');

    await expect(processImportJob(job, deps)).rejects.toThrow('Cannot read');

    expect(await itemRepository.get('job-1')).toBeNull();
    expect([...mockStore.files]).toEqual([job.sourcePath]);
  });

  it('counts as done when only removing the imported photo fails', async () => {
    const { deps } = makeDeps();
    mockStore.undeletable.add(job.sourcePath);

    expect(await processImportJob(job, deps)).toBe('job-1');
    expect(await itemRepository.get('job-1')).not.toBeNull();
  });

  describe('with a photo that is reduced first', () => {
    const SOURCE = 'file:///documents/images/import/a.heic';
    const REDUCED = {
      uri: 'file:///cache/ImageManipulator/reduced.jpg',
      width: 1800,
      height: 2400,
    };
    /** Deps that reduce the photo, recording the order of the steps and what is discarded. */
    const reducing = (overrides: Partial<ImportJobDeps> = {}) => {
      const { deps, tag } = makeDeps(overrides);
      const steps: string[] = [];
      const discarded: string[] = [];
      const cutout = deps.images.cutout;
      deps.images.reduce = async (photo) => {
        steps.push(`reduce ${photo.uri}`);
        return REDUCED;
      };
      deps.images.cutout = async (uri) => {
        steps.push(`cutout ${uri}`);
        return cutout(uri);
      };
      deps.images.discard = async (uri) => void discarded.push(uri);
      return { deps, tag, steps, discarded };
    };

    it('cuts out and stores the reduced copy, never the photo as it was picked', async () => {
      const { deps, steps, discarded } = reducing();

      await processImportJob(job, deps);

      // Once, and before the cutout.
      expect(steps).toEqual([`reduce ${SOURCE}`, `cutout ${REDUCED.uri}`]);
      expect(mockStore.saved).toEqual([
        [REDUCED.uri, 'items', 'jpg'],
        [CUTOUT.uri, 'items', 'png'],
        ['file:///cache/thumb.png', 'items', 'png'],
      ]);
      expect(await itemRepository.get('job-1')).toMatchObject({
        originalPath: 'images/items/1.jpg',
        cutoutPath: 'images/items/2.png',
      });
      // The picked photo and the temporary copy are both gone; only the item's images are left.
      expect(mockStore.removed).toEqual([job.sourcePath]);
      expect(discarded).toEqual([REDUCED.uri]);
      expect([...mockStore.files].sort()).toEqual([
        'images/items/1.jpg',
        'images/items/2.png',
        'images/items/3.png',
      ]);
    });

    it('tags the reduced copy, with its size, when there is no cutout', async () => {
      const { deps, tag } = reducing();
      deps.images.cutout = async () => null;

      await processImportJob(job, deps);

      expect(tag).toHaveBeenCalledWith(REDUCED.uri, false, { width: 1800, height: 2400 });
      expect(mockStore.saved[0]).toEqual([REDUCED.uri, 'items', 'jpg']);
    });

    it('discards the reduced copy when the job fails, and keeps the picked photo for a retry', async () => {
      const { deps, discarded } = reducing({
        tag: async () => {
          throw new Error('rate limited');
        },
      });

      await expect(processImportJob(job, deps)).rejects.toThrow('rate limited');

      expect(discarded).toEqual([REDUCED.uri]);
      expect(mockStore.files.has(job.sourcePath)).toBe(true);
    });

    it('counts as done when the reduced copy cannot be discarded', async () => {
      const { deps } = reducing();
      deps.images.discard = async () => {
        throw new Error('busy');
      };

      expect(await processImportJob(job, deps)).toBe('job-1');
    });
  });

  it('does not discard a photo that was left as it is', async () => {
    const { deps } = makeDeps();
    deps.images.discard = jest.fn(async () => {});

    await processImportJob(job, deps);

    expect(deps.images.discard).not.toHaveBeenCalled();
  });

  it('does not reduce the photo again when the item already exists', async () => {
    const { deps } = makeDeps({ itemExists: async () => true });
    deps.images.reduce = jest.fn(async (photo) => photo);

    await processImportJob(job, deps);

    expect(deps.images.reduce).not.toHaveBeenCalled();
  });
});

describe('tagging on the device', () => {
  it('sends a small copy of the cutout to the tagging model in the interface language', async () => {
    await queueCopied(['a.jpg']);

    await resumeImports();
    await settle();

    expect(mockImages.toTagImage).toHaveBeenCalledWith(CUTOUT.uri, true, CUTOUT);
    expect(mockTag).toHaveBeenCalledWith({ base64: 'SMALL', mediaType: 'image/png' }, 'en', {
      onAnswered: expect.any(Function),
    });
    // An answered request is a paid one, and is counted as such.
    expect(await usageLog.counts('tag')).toEqual({ month: 0, total: 0 });
    await mockTag.mock.calls[0][2].onAnswered();
    expect(await usageLog.counts('tag')).toEqual({ month: 1, total: 1 });
    expect(await reviewItems()).toMatchObject([{ name: 'Pink skirt', brand: 'Zara' }]);
  });

  it('sends the original photo when no cutout could be made', async () => {
    mockImages.cutout.mockResolvedValue(null);
    await queueCopied(['a.jpg']);

    await resumeImports();
    await settle();

    expect(mockImages.toTagImage).toHaveBeenCalledWith(
      'file:///documents/images/import/a.jpg',
      false,
      undefined,
    );
    expect(mockTag).toHaveBeenCalledWith({ base64: 'SMALL', mediaType: 'image/jpeg' }, 'en', {
      onAnswered: expect.any(Function),
    });
  });

  it.each([
    ['cs', 'cs'],
    ['en', 'en'],
    ['de', 'en'],
  ])('asks for names in %s as %s', async (language, asked) => {
    mockI18n.language = language;
    await queueCopied(['a.jpg']);

    await resumeImports();
    await settle();

    expect(mockTag.mock.calls[0][1]).toBe(asked);
  });

  it.each(['noKey', 'rejectedKey'])(
    'imports the photo untagged when tagging cannot work at all (%s)',
    async (reason) => {
      mockTag.mockRejectedValue(new AiUnavailableError(reason as never));
      const [source] = await queueCopied(['a.jpg']);

      await resumeImports();
      await settle();

      expect(progress()).toEqual({ ...EMPTY, done: 1, total: 1 });
      const [job] = await importJobs.list();
      expect(job).toMatchObject({ status: 'done', error: null, itemId: job.id });
      expect(await reviewItems()).toMatchObject([
        { id: job.id, name: null, category: 'tops', colours: [], needsReview: true },
      ]);
      expect(mockStore.files.has(source)).toBe(false);
    },
  );

  it.each(['offline', 'rateLimited', 'error'])(
    'fails the photo so it can be retried when tagging is unavailable for now (%s)',
    async (reason) => {
      mockTag.mockRejectedValue(new AiUnavailableError(reason as never));
      const [source] = await queueCopied(['a.jpg']);

      await resumeImports();
      await settle();

      expect(progress()).toEqual({ ...EMPTY, failed: 1, total: 1 });
      expect(await importJobs.list()).toMatchObject([
        { status: 'failed', error: `AI unavailable: ${reason}`, itemId: null },
      ]);
      expect(await reviewItems()).toEqual([]);
      // Nothing was stored for an item, and the photo is still there to retry.
      expect([...mockStore.files]).toEqual([source]);
    },
  );

  it('fails the photo when the small copy for tagging cannot be made', async () => {
    mockImages.toTagImage.mockRejectedValue(new Error('cannot decode image'));
    await queueCopied(['a.jpg']);

    await resumeImports();
    await settle();

    expect(mockTag).not.toHaveBeenCalled();
    expect(await importJobs.list()).toMatchObject([
      { status: 'failed', error: 'cannot decode image' },
    ]);
  });

  it('treats an error that only looks like a missing key as a failure', async () => {
    mockTag.mockRejectedValue(Object.assign(new Error('odd'), { reason: 'noKey' }));
    await queueCopied(['a.jpg']);

    await resumeImports();
    await settle();

    expect(await importJobs.list()).toMatchObject([{ status: 'failed', error: 'odd' }]);
  });
});

describe('starting a bulk import on the device', () => {
  it('copies each photo into the app with its own extension and imports them all', async () => {
    const failed = await startBulkImport([
      'file:///picker/IMG_1.HEIC',
      'file:///picker/IMG_2.png?token=abc',
      'file:///picker/no-extension',
    ]);
    await settle();

    expect(failed).toBe(0);
    expect(mockStore.saved.filter((call) => call[1] === 'import')).toEqual([
      ['file:///picker/IMG_1.HEIC', 'import', 'heic'],
      ['file:///picker/IMG_2.png?token=abc', 'import', 'png'],
      ['file:///picker/no-extension', 'import', 'jpg'],
    ]);
    expect(progress()).toEqual({ ...EMPTY, done: 3, total: 3 });
    const items = await reviewItems();
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.originalPath.split('.').pop()).sort()).toEqual([
      'heic',
      'jpg',
      'png',
    ]);
    // The copies in the import folder are gone; what is left are the images of the items.
    expect([...mockStore.files].filter((path) => path.startsWith('images/import/'))).toEqual([]);
    expect(mockStore.files.size).toBe(9);
    for (const item of items) {
      expect(mockStore.files.has(item.originalPath)).toBe(true);
      expect(mockStore.files.has(item.cutoutPath!)).toBe(true);
      expect(mockStore.files.has(item.thumbPath)).toBe(true);
    }
  });

  it('counts the photos that cannot be read and imports the others', async () => {
    mockStore.unreadable.add('file:///picker/broken.jpg');
    mockStore.unreadable.add('file:///picker/also-broken.jpg');

    const failed = await startBulkImport([
      'file:///picker/a.jpg',
      'file:///picker/broken.jpg',
      'file:///picker/b.jpg',
      'file:///picker/also-broken.jpg',
    ]);
    await settle();

    expect(failed).toBe(2);
    expect(progress()).toEqual({ ...EMPTY, done: 2, total: 2 });
    expect(await reviewItems()).toHaveLength(2);
  });

  it('reduces each photo when its turn comes, not while the selection is being queued', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockImages.reduce.mockImplementation(async (photo: { uri: string }) => {
      await gate;
      return { uri: photo.uri.replace('/documents/images/import/', '/cache/reduced-') };
    });
    const names = ['a', 'b', 'c', 'd', 'e'];

    // All five are queued although no photo has been reduced yet.
    expect(await startBulkImport(names.map((name) => `file:///picker/${name}.heic`))).toBe(0);
    await flush();
    expect(mockImages.reduce).toHaveBeenCalledTimes(IMPORT_CONCURRENCY);
    expect(mockImages.cutout).not.toHaveBeenCalled();

    release();
    await settle();

    // Each photo once, from its copy in the import folder, and the cutout from the reduced copy.
    const reducedFrom = mockImages.reduce.mock.calls.map(([photo]) => photo.uri).sort();
    expect(reducedFrom).toEqual(
      [1, 2, 3, 4, 5].map((n) => `file:///documents/images/import/${n}.heic`),
    );
    expect(mockImages.cutout.mock.calls.map(([uri]) => uri).sort()).toEqual(
      [1, 2, 3, 4, 5].map((n) => `file:///cache/reduced-${n}.heic`),
    );
    expect(mockImages.discard).toHaveBeenCalledTimes(5);
    expect(progress()).toEqual({ ...EMPTY, done: 5, total: 5 });
  });

  it('does nothing for an empty selection', async () => {
    expect(await startBulkImport([])).toBe(0);
    await flush();
    expect(await importJobs.list()).toEqual([]);
    expect(mockImages.cutout).not.toHaveBeenCalled();
  });

  it('starts counting from zero again, while photos that failed earlier stay listed', async () => {
    mockTag.mockRejectedValueOnce(new AiUnavailableError('offline'));
    await startBulkImport(['file:///picker/first.jpg', 'file:///picker/second.jpg']);
    await settle();
    expect(progress()).toEqual({ ...EMPTY, done: 1, failed: 1, total: 2 });

    await startBulkImport(['file:///picker/third.jpg']);
    await settle();

    // The finished photo of the first import no longer counts; the failed one still does.
    expect(progress()).toEqual({ ...EMPTY, done: 1, failed: 1, total: 2 });
    expect(await reviewItems()).toHaveLength(2);
  });

  it('keeps importing when one photo fails, and never works on more than the limit at once', async () => {
    let active = 0;
    let peak = 0;
    let calls = 0;
    mockImages.cutout.mockImplementation(async () => {
      const call = ++calls;
      active++;
      peak = Math.max(peak, active);
      await tick();
      active--;
      if (call === 2) throw new Error('vision crashed');
      return null;
    });

    await startBulkImport(['a', 'b', 'c', 'd', 'e'].map((name) => `file:///picker/${name}.jpg`));
    await settle();

    expect(progress()).toEqual({ ...EMPTY, done: 4, failed: 1, total: 5 });
    expect((await importJobs.list()).filter((job) => job.status === 'failed')).toMatchObject([
      { error: 'vision crashed', itemId: null },
    ]);
    expect(await reviewItems()).toHaveLength(4);
    expect(peak).toBeGreaterThanOrEqual(1);
    expect(peak).toBeLessThanOrEqual(IMPORT_CONCURRENCY);
  });
});

describe('progress and the listener', () => {
  it('shows what is waiting, in progress and finished while an import runs', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockImages.cutout.mockImplementation(async () => {
      await gate;
      return null;
    });
    await queueCopied(['a.jpg', 'b.jpg', 'c.jpg']);

    await resumeImports();
    await flush();
    // Two at a time; the third waits.
    expect(progress()).toEqual({ queued: 1, processing: 2, done: 0, failed: 0, total: 3 });
    const during = useImportProgress.getState().version;

    release();
    await settle();
    expect(progress()).toEqual({ queued: 0, processing: 0, done: 3, failed: 0, total: 3 });
    expect(useImportProgress.getState().version).toBeGreaterThan(during);
  });

  it('tells the listener every time a photo is started and every time one is finished', async () => {
    const listener = jest.fn();
    setImportListener(listener);
    await queueCopied(['a.jpg', 'b.jpg']);

    await resumeImports();
    await settle();

    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('stops telling a listener that was taken away', async () => {
    const listener = jest.fn();
    setImportListener(listener);
    setImportListener(null);
    await queueCopied(['a.jpg']);

    await resumeImports();
    await settle();

    expect(listener).not.toHaveBeenCalled();
    expect(progress().done).toBe(1);
  });
});

describe('resuming after the app was closed', () => {
  it('puts photos that were in progress back in the queue and finishes everything', async () => {
    await queueCopied(['a.jpg', 'b.jpg', 'c.jpg']);
    // The app closed while the first photo was being worked on.
    const interrupted = await importJobs.claimNext();
    expect(await importJobs.progress()).toMatchObject({ processing: 1, queued: 2 });

    await resumeImports();
    await settle();

    expect(progress()).toEqual({ ...EMPTY, done: 3, total: 3 });
    const items = await reviewItems();
    expect(items.map((item) => item.id)).toContain(interrupted!.id);
    expect(items).toHaveLength(3);
  });

  it('resumes when the only work left is a photo that was in progress', async () => {
    await queueCopied(['a.jpg']);
    await importJobs.claimNext();

    await resumeImports();
    await settle();

    expect(progress()).toEqual({ ...EMPTY, done: 1, total: 1 });
  });

  it('works on two photos at a time', async () => {
    let active = 0;
    let peak = 0;
    mockImages.cutout.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await tick();
      active--;
      return null;
    });
    await queueCopied(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg']);

    await resumeImports();
    await settle();

    expect(peak).toBe(IMPORT_CONCURRENCY);
    expect(IMPORT_CONCURRENCY).toBe(2);
    expect(progress().done).toBe(5);
  });

  it('only reports the numbers when nothing is waiting: failed photos are not retried by themselves', async () => {
    mockTag.mockRejectedValueOnce(new AiUnavailableError('offline'));
    await queueCopied(['a.jpg', 'b.jpg']);
    await resumeImports();
    await settle();
    useImportProgress.setState({ progress: EMPTY, version: 0 });
    mockImages.cutout.mockClear();

    await resumeImports();
    await flush();

    expect(progress()).toEqual({ ...EMPTY, done: 1, failed: 1, total: 2 });
    expect(useImportProgress.getState().version).toBe(1);
    expect(mockImages.cutout).not.toHaveBeenCalled();
  });
});

describe('retrying and dismissing failed photos', () => {
  const failTwoOfThree = async () => {
    mockTag
      .mockRejectedValueOnce(new AiUnavailableError('offline'))
      .mockRejectedValueOnce(new AiUnavailableError('offline'));
    await queueCopied(['a.jpg', 'b.jpg', 'c.jpg']);
    await resumeImports();
    await settle();
    expect(progress()).toEqual({ ...EMPTY, done: 1, failed: 2, total: 3 });
    return (await importJobs.list()).filter((job) => job.status === 'failed');
  };

  it('retries one failed photo and leaves the other failed', async () => {
    const [first, second] = await failTwoOfThree();

    await retryImportJob(first.id);
    await settle();

    expect(progress()).toEqual({ ...EMPTY, done: 2, failed: 1, total: 3 });
    const jobs = await importJobs.list();
    expect(jobs.find((job) => job.id === first.id)).toMatchObject({
      status: 'done',
      error: null,
      itemId: first.id,
    });
    expect(jobs.find((job) => job.id === second.id)).toMatchObject({ status: 'failed' });
    expect(await itemRepository.get(first.id)).toMatchObject({ name: 'Pink skirt' });
    expect(mockStore.files.has(first.sourcePath)).toBe(false);
    expect(mockStore.files.has(second.sourcePath)).toBe(true);
  });

  it('shows a retried photo as waiting straight away', async () => {
    const [first] = await failTwoOfThree();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockImages.cutout.mockImplementation(async () => {
      await gate;
      return null;
    });

    await retryImportJob(first.id);
    await flush();
    expect(progress()).toEqual({ ...EMPTY, processing: 1, done: 1, failed: 1, total: 3 });

    release();
    await settle();
    expect(progress()).toEqual({ ...EMPTY, done: 2, failed: 1, total: 3 });
  });

  it('dismisses the failed photos: their rows and their copies are removed, finished ones stay', async () => {
    const failed = await failTwoOfThree();
    const itemFiles = [...mockStore.files].filter((path) => path.startsWith('images/items/'));
    expect(itemFiles).toHaveLength(3);

    await dismissFailedImports();

    expect(progress()).toEqual({ ...EMPTY, done: 1, total: 1 });
    expect((await importJobs.list()).map((job) => job.status)).toEqual(['done']);
    for (const job of failed) expect(mockStore.files.has(job.sourcePath)).toBe(false);
    // The item that was imported keeps its images.
    expect([...mockStore.files].sort()).toEqual(itemFiles.sort());
    expect(await reviewItems()).toHaveLength(1);
  });

  it('dismisses the rest when one copy cannot be deleted', async () => {
    const [first, second] = await failTwoOfThree();
    mockStore.undeletable.add(first.sourcePath);

    await dismissFailedImports();

    expect(progress()).toEqual({ ...EMPTY, done: 1, total: 1 });
    expect(mockStore.files.has(second.sourcePath)).toBe(false);
  });

  it('has nothing to dismiss when nothing failed', async () => {
    await queueCopied(['a.jpg']);
    await resumeImports();
    await settle();
    const removed = mockStore.removed.length;

    await dismissFailedImports();

    expect(mockStore.removed).toHaveLength(removed);
    expect(progress()).toEqual({ ...EMPTY, done: 1, total: 1 });
  });
});

describe('import queue', () => {
  const setup = () => {
    let clock = 1000;
    const jobs = createImportJobRepository(
      () => mockDb.current!,
      () => clock++,
    );
    return { jobs };
  };

  it('works through the queue one photo at a time, oldest first, when told to', async () => {
    const { jobs } = setup();
    await jobs.enqueue(['a', 'b', 'c', 'd']);
    const seen: string[] = [];
    let active = 0;
    let peak = 0;

    await createImportProcessor({
      jobs,
      concurrency: 1,
      process: async (job) => {
        active++;
        peak = Math.max(peak, active);
        seen.push(job.sourcePath);
        await tick();
        active--;
        return `item-${job.sourcePath}`;
      },
    }).start();

    expect(peak).toBe(1);
    expect(seen).toEqual(['a', 'b', 'c', 'd']);
    expect((await jobs.list()).map((job) => job.itemId)).toEqual([
      'item-a',
      'item-b',
      'item-c',
      'item-d',
    ]);
  });

  it('works on as many photos at once as it is told to, and no more than there are', async () => {
    const { jobs } = setup();
    await jobs.enqueue(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    let active = 0;
    let peak = 0;
    const process = async () => {
      active++;
      peak = Math.max(peak, active);
      await tick();
      active--;
      return 'item';
    };

    await createImportProcessor({ jobs, concurrency: 3, process }).start();
    expect(peak).toBe(3);

    peak = 0;
    await jobs.enqueue(['h', 'i']);
    await createImportProcessor({ jobs, concurrency: 5, process }).start();
    expect(peak).toBe(2);
    expect(await jobs.progress()).toEqual({ ...EMPTY, done: 9, total: 9 });
  });

  it('carries on with the others when photos fail, recording why for each', async () => {
    const { jobs } = setup();
    await jobs.enqueue(['good-1', 'bad-error', 'good-2', 'bad-text', 'good-3']);
    const onChange = jest.fn();

    await createImportProcessor({
      jobs,
      onChange,
      process: async (job) => {
        if (job.sourcePath === 'bad-error') throw new Error('unreadable image');
        // Not every failure arrives as an Error.
        if (job.sourcePath === 'bad-text') return Promise.reject('no space left');
        return `item-${job.sourcePath}`;
      },
    }).start();

    expect(await jobs.progress()).toEqual({ ...EMPTY, done: 3, failed: 2, total: 5 });
    expect(
      (await jobs.list()).map((job) => [job.sourcePath, job.status, job.error, job.itemId]),
    ).toEqual([
      ['good-1', 'done', null, 'item-good-1'],
      ['bad-error', 'failed', 'unreadable image', null],
      ['good-2', 'done', null, 'item-good-2'],
      ['bad-text', 'failed', 'no space left', null],
      ['good-3', 'done', null, 'item-good-3'],
    ]);
    // Once when a photo is taken up and once when it is finished, whatever the outcome.
    expect(onChange).toHaveBeenCalledTimes(10);
  });

  it('says whether it is running, and can be started again after it has finished', async () => {
    const { jobs } = setup();
    await jobs.enqueue(['a']);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const process = jest.fn(async () => {
      await gate;
      return 'item';
    });
    const processor = createImportProcessor({ jobs, process });
    expect(processor.isRunning()).toBe(false);

    const run = processor.start();
    expect(processor.isRunning()).toBe(true);
    // Starting again while it runs joins the same run.
    expect(processor.start()).toBe(run);
    release();
    await run;
    expect(processor.isRunning()).toBe(false);

    await jobs.enqueue(['b']);
    await processor.start();
    expect(process).toHaveBeenCalledTimes(2);
    expect(await jobs.progress()).toEqual({ ...EMPTY, done: 2, total: 2 });
  });

  it('clears a retried photo of its error and reads an unknown status as failed', async () => {
    const { jobs } = setup();
    await jobs.enqueue(['a', 'b']);
    const [first, second] = await jobs.list();
    await jobs.markFailed(first.id, 'offline');
    expect((await jobs.list())[0]).toMatchObject({ status: 'failed', error: 'offline' });

    await jobs.retry(first.id);
    expect((await jobs.list())[0]).toMatchObject({ status: 'queued', error: null });

    // A status written by a newer version of the app.
    mockDb.current!.run(`UPDATE import_jobs SET status = 'paused' WHERE id = '${second.id}'`);
    expect((await jobs.list())[1].status).toBe('failed');
    // It still counts towards the total, under no known heading.
    expect(await jobs.progress()).toEqual({ ...EMPTY, queued: 1, total: 2 });
  });

  it('removes only the jobs with the given statuses and returns them', async () => {
    const { jobs } = setup();
    await jobs.enqueue(['a', 'b', 'c']);
    const [first, second] = await jobs.list();
    await jobs.markDone(first.id, 'item-a');
    await jobs.markFailed(second.id, 'offline');

    expect(await jobs.clear(['done', 'failed'])).toMatchObject([
      { sourcePath: 'a', status: 'done', itemId: 'item-a' },
      { sourcePath: 'b', status: 'failed', error: 'offline' },
    ]);
    expect((await jobs.list()).map((job) => job.sourcePath)).toEqual(['c']);
    expect(await jobs.clear(['done'])).toEqual([]);
  });
});
