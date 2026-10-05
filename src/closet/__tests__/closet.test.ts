import { createTestDb } from '@/db/testing';
import en from '@/i18n/en.json';
import cs from '@/i18n/cs.json';

import {
  detailsFromTags,
  processImportJob,
  startBulkImport,
  type ImportJobDeps,
} from '../importActions';
import { createImportJobRepository, createImportProcessor } from '../importQueue';
import { fromFormValues, parseDateInput, parsePriceInput, toFormValues } from '../itemFormLogic';
import { THUMB_WIDTH, removeItemImages, storeItemImages, type ItemImageDeps } from '../itemImages';
import { createItemRepository } from '../repository';
import { matchesSearch, normalise } from '../search';
import {
  ALL_SUBCATEGORIES,
  CATEGORIES,
  CATEGORY_SLOT,
  COLOUR_NAMES,
  DEFAULT_WARMTH,
  OCCASIONS,
  SEASONS,
  SLOTS,
  WARMTH_LEVELS,
  isSubcategoryOf,
} from '../taxonomy';
import type { ItemDetails, ItemImages } from '../types';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('@/ai/tagging', () => ({ tagItem: jest.fn() }));
jest.mock('@/ai/client', () => ({ AiUnavailableError: class extends Error {} }));
jest.mock('@/i18n', () => ({ __esModule: true, default: { language: 'en' } }));
jest.mock('@/storage/imageStore', () => ({ imageStore: {} }));
jest.mock('../deviceImages', () => ({ itemImageDeps: {}, toTagImage: jest.fn() }));

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

const images = (name = 'a'): ItemImages => ({
  originalPath: `images/items/${name}.jpg`,
  cutoutPath: `images/items/${name}.png`,
  thumbPath: `images/items/${name}-t.png`,
});

describe('taxonomy', () => {
  const labels = [
    ['category', CATEGORIES],
    ['subcategory', ALL_SUBCATEGORIES],
    ['colour', COLOUR_NAMES],
    ['season', SEASONS],
    ['occasion', OCCASIONS],
    ['warmth', WARMTH_LEVELS],
  ] as const;

  it.each(labels)('every %s has an English and a Czech label', (group, values) => {
    for (const value of values) {
      const key = String(value);
      expect((en.taxonomy as Record<string, Record<string, string>>)[group][key]).toBeTruthy();
      expect((cs.taxonomy as Record<string, Record<string, string>>)[group][key]).toBeTruthy();
    }
  });

  it('maps every category to an outfit slot and a default warmth', () => {
    for (const category of CATEGORIES) {
      expect(SLOTS).toContain(CATEGORY_SLOT[category]);
      expect(WARMTH_LEVELS).toContain(DEFAULT_WARMTH[category]);
    }
  });

  it('has no subcategory in two categories', () => {
    expect(new Set(ALL_SUBCATEGORIES).size).toBe(ALL_SUBCATEGORIES.length);
    expect(isSubcategoryOf('shoes', 'sneakers')).toBe(true);
    expect(isSubcategoryOf('tops', 'sneakers')).toBe(false);
  });
});

describe('item repository', () => {
  const setup = async () => {
    const { db } = await createTestDb();
    let clock = 1000;
    const repo = createItemRepository(
      () => db,
      () => clock++,
    );
    return { repo };
  };

  const seed = async () => {
    const { repo } = await setup();
    const shirt = await repo.create(
      details({
        name: 'White shirt',
        category: 'tops',
        subcategory: 'shirt',
        colours: ['white'],
        seasons: ['spring', 'summer'],
        occasions: ['work'],
        brand: 'Arket',
        price: 900,
        currency: 'CZK',
        warmth: 2,
      }),
      images('shirt'),
    );
    const skirt = await repo.create(
      details({
        name: 'Pink skirt',
        category: 'bottoms',
        subcategory: 'skirt',
        colours: ['pink', 'white'],
        seasons: ['summer'],
        occasions: ['party', 'casual'],
        brand: 'Zara',
        price: 600,
        currency: 'CZK',
      }),
      images('skirt'),
    );
    const boots = await repo.create(
      details({ category: 'shoes', subcategory: 'boots', colours: ['black'], seasons: ['winter'] }),
      images('boots'),
    );
    return { repo, shirt, skirt, boots };
  };

  it('stores a minimal item with only images and a category', async () => {
    const { repo } = await setup();
    const item = await repo.create(details({ category: 'bags' }), images());
    expect(item).toMatchObject({
      category: 'bags',
      name: null,
      colours: [],
      ownership: 'owned',
      needsReview: false,
      ...images(),
    });
    expect(await repo.get(item.id)).toEqual(item);
  });

  it('round-trips every detail', async () => {
    const { repo } = await setup();
    const full = details({
      name: 'Wool coat',
      category: 'outerwear',
      subcategory: 'coat',
      colours: ['navy', 'grey'],
      seasons: ['autumn', 'winter'],
      occasions: ['work', 'formal'],
      warmth: 5,
      brand: 'COS',
      size: 'M',
      price: 4990.5,
      currency: 'CZK',
      purchasedAt: 1_700_000_000_000,
      notes: 'Dry clean only',
      sourceUrl: 'https://example.com/coat',
    });
    const item = await repo.create(full, images());
    expect(item).toMatchObject(full);
  });

  it('lists newest first by default', async () => {
    const { repo, shirt, skirt, boots } = await seed();
    expect((await repo.list()).map((item) => item.id)).toEqual([boots.id, skirt.id, shirt.id]);
  });

  it('filters by category', async () => {
    const { repo, boots } = await seed();
    expect((await repo.list({ category: 'shoes' })).map((item) => item.id)).toEqual([boots.id]);
  });

  it('filters by colour, season, occasion and brand', async () => {
    const { repo, shirt, skirt, boots } = await seed();
    const ids = async (filter: Parameters<typeof repo.list>[0]) =>
      (await repo.list(filter)).map((item) => item.id).sort();
    expect(await ids({ colours: ['white'] })).toEqual([shirt.id, skirt.id].sort());
    expect(await ids({ colours: ['pink', 'black'] })).toEqual([skirt.id, boots.id].sort());
    expect(await ids({ seasons: ['winter'] })).toEqual([boots.id]);
    expect(await ids({ occasions: ['party'] })).toEqual([skirt.id]);
    expect(await ids({ brand: 'Arket' })).toEqual([shirt.id]);
  });

  it('combines filters so an item must match all of them', async () => {
    const { repo, skirt } = await seed();
    const result = await repo.list({
      colours: ['white'],
      seasons: ['summer'],
      category: 'bottoms',
    });
    expect(result.map((item) => item.id)).toEqual([skirt.id]);
    expect(await repo.list({ colours: ['pink'], seasons: ['winter'] })).toEqual([]);
  });

  it('sorts by name, price and brand with missing values last', async () => {
    const { repo, shirt, skirt, boots } = await seed();
    const order = async (sort: 'name' | 'price' | 'brand') =>
      (await repo.list({ sort })).map((item) => item.id);
    expect(await order('name')).toEqual([skirt.id, shirt.id, boots.id]);
    expect(await order('price')).toEqual([shirt.id, skirt.id, boots.id]);
    expect(await order('brand')).toEqual([shirt.id, skirt.id, boots.id]);
  });

  it('counts all items and filtered items', async () => {
    const { repo } = await seed();
    expect(await repo.count()).toBe(3);
    expect(await repo.count({ category: 'tops' })).toBe(1);
  });

  it('hides archived items by default and shows them under the archived filter', async () => {
    const { repo, shirt } = await seed();
    await repo.archive([shirt.id]);
    expect((await repo.list()).map((item) => item.id)).not.toContain(shirt.id);
    expect(await repo.count()).toBe(2);
    expect((await repo.list({ ownership: 'archived' })).map((item) => item.id)).toEqual([shirt.id]);
    await repo.unarchive([shirt.id]);
    expect(await repo.count()).toBe(3);
  });

  it('lists distinct brands of owned items', async () => {
    const { repo, shirt } = await seed();
    expect(await repo.brands()).toEqual(['Arket', 'Zara']);
    await repo.archive([shirt.id]);
    expect(await repo.brands()).toEqual(['Zara']);
  });

  it('updates details and clears the review flag', async () => {
    const { repo } = await setup();
    const item = await repo.create(details(), images(), { needsReview: true });
    expect(await repo.count({ needsReview: true })).toBe(1);
    const updated = await repo.update(item.id, {
      brand: 'Mango',
      colours: ['red'],
      needsReview: false,
    });
    expect(updated).toMatchObject({ brand: 'Mango', colours: ['red'], needsReview: false });
    expect(await repo.count({ needsReview: true })).toBe(0);
  });

  it('re-tags several items at once without touching other fields', async () => {
    const { repo, shirt, skirt, boots } = await seed();
    await repo.updateMany([shirt.id, skirt.id], { seasons: ['autumn'] });
    expect((await repo.get(shirt.id))!.seasons).toEqual(['autumn']);
    expect((await repo.get(skirt.id))!).toMatchObject({ seasons: ['autumn'], brand: 'Zara' });
    expect((await repo.get(boots.id))!.seasons).toEqual(['winter']);
  });

  it('deletes several items and restores them on undo', async () => {
    const { repo, shirt, skirt } = await seed();
    await repo.remove([shirt.id, skirt.id]);
    expect(await repo.count()).toBe(1);
    expect(await repo.get(shirt.id)).toBeNull();
    await repo.restore([shirt.id, skirt.id]);
    expect(await repo.count()).toBe(3);
  });

  it('purges only items deleted before the cutoff and returns them for image cleanup', async () => {
    const { repo, shirt, skirt } = await seed();
    await repo.remove([shirt.id]);
    expect(await repo.purgeDeleted(0)).toEqual([]);
    const purged = await repo.purgeDeleted(Number.MAX_SAFE_INTEGER);
    expect(purged.map((item) => item.thumbPath)).toEqual(['images/items/shirt-t.png']);
    await repo.restore([shirt.id]);
    expect(await repo.get(shirt.id)).toBeNull();
    expect(await repo.get(skirt.id)).not.toBeNull();
  });

  it('ignores stored values that are not in the taxonomy', async () => {
    const { repo } = await setup();
    const item = await repo.create(
      details({
        category: 'shoes',
        subcategory: 'tshirt' as never,
        colours: ['white', 'ultraviolet' as never],
        warmth: 9 as never,
      }),
      images(),
    );
    expect(item).toMatchObject({ subcategory: null, colours: ['white'], warmth: null });
  });
});

describe('search', () => {
  const item = {
    ...details({
      name: 'Bílé šaty',
      brand: 'Princess Polly',
      notes: 'thrifted',
      colours: ['white'],
    }),
    category: 'dresses' as const,
  } as never;
  const labels = () => ['Šaty a overaly', 'Bílá'];

  it('strips diacritics and case', () => {
    expect(normalise('Šaty Žluté')).toBe('saty zlute');
  });

  it('matches name, brand, notes and labels', () => {
    expect(matchesSearch(item, 'polly', labels)).toBe(true);
    expect(matchesSearch(item, 'saty', labels)).toBe(true);
    expect(matchesSearch(item, 'THRIFTED', labels)).toBe(true);
    expect(matchesSearch(item, 'overaly', labels)).toBe(true);
    expect(matchesSearch(item, 'bila', labels)).toBe(true);
  });

  it('requires every word to match', () => {
    expect(matchesSearch(item, 'princess bila', labels)).toBe(true);
    expect(matchesSearch(item, 'princess cerna', labels)).toBe(false);
  });

  it('matches everything for an empty query', () => {
    expect(matchesSearch(item, '   ', labels)).toBe(true);
  });
});

describe('item form', () => {
  it('requires a category', () => {
    expect(fromFormValues(toFormValues({}, 'CZK'))).toEqual({
      ok: false,
      error: 'categoryRequired',
    });
  });

  it('accepts an item with only a category', () => {
    const result = fromFormValues(toFormValues({ category: 'shoes' }, 'CZK'));
    expect(result).toEqual({ ok: true, details: details({ category: 'shoes' }) });
  });

  it('round-trips full details', () => {
    const full = details({
      name: 'Wool coat',
      category: 'outerwear',
      subcategory: 'coat',
      colours: ['navy'],
      seasons: ['winter'],
      occasions: ['work'],
      warmth: 5,
      brand: 'COS',
      size: 'M',
      price: 4990.5,
      currency: 'CZK',
      purchasedAt: parseDateInput('2026-03-15'),
      notes: 'Dry clean only',
      sourceUrl: 'https://example.com/coat',
    });
    expect(fromFormValues(toFormValues(full, 'EUR'))).toEqual({ ok: true, details: full });
  });

  it('drops a type that does not belong to the chosen category', () => {
    const values = { ...toFormValues({ category: 'tops', subcategory: 'shirt' }, 'CZK') };
    values.category = 'shoes';
    const result = fromFormValues(values);
    expect(result.ok && result.details.subcategory).toBeNull();
  });

  it('rejects a price that is not a number', () => {
    const values = { ...toFormValues({ category: 'tops' }, 'CZK'), price: 'cheap' };
    expect(fromFormValues(values)).toEqual({ ok: false, error: 'priceInvalid' });
  });

  it('reads prices with a comma or a point and stores no currency without a price', () => {
    expect(parsePriceInput('1 299,50')).toBe(1299.5);
    expect(parsePriceInput('59.9')).toBe(59.9);
    expect(parsePriceInput('-5')).toBeNull();
    const result = fromFormValues({ ...toFormValues({ category: 'tops' }, 'czk'), price: '' });
    expect(result.ok && result.details.currency).toBeNull();
    const priced = fromFormValues({ ...toFormValues({ category: 'tops' }, 'czk'), price: '10' });
    expect(priced.ok && priced.details.currency).toBe('CZK');
  });

  it('rejects impossible dates', () => {
    expect(parseDateInput('2026-02-30')).toBeNull();
    expect(parseDateInput('15.3.2026')).toBeNull();
    const values = { ...toFormValues({ category: 'tops' }, 'CZK'), purchasedAt: '2026-13-01' };
    expect(fromFormValues(values)).toEqual({ ok: false, error: 'purchasedAtInvalid' });
  });
});

describe('item images', () => {
  const makeDeps = (failOn?: string) => {
    const saved: { uri: string; extension: string }[] = [];
    const removed: string[] = [];
    const deps: ItemImageDeps = {
      save: async (uri, _folder, extension) => {
        if (uri === failOn) throw new Error('disk full');
        saved.push({ uri, extension });
        return `images/items/${saved.length}.${extension}`;
      },
      remove: async (path) => void removed.push(path),
      resize: jest.fn(async (_uri, _width, format) => `file:///tmp/thumb.${format}`),
      cutout: async () => null,
    };
    return { deps, saved, removed };
  };

  it('stores original, cutout and a PNG thumbnail of the cutout', async () => {
    const { deps, saved } = makeDeps();
    const result = await storeItemImages(
      { originalUri: 'file:///tmp/photo.HEIC', cutoutUri: 'file:///tmp/cut.png' },
      deps,
    );
    expect(result).toEqual({
      originalPath: 'images/items/1.heic',
      cutoutPath: 'images/items/2.png',
      thumbPath: 'images/items/3.png',
    });
    expect(deps.resize).toHaveBeenCalledWith('file:///tmp/cut.png', THUMB_WIDTH, 'png');
    expect(saved.map((entry) => entry.extension)).toEqual(['heic', 'png', 'png']);
  });

  it('uses a JPEG thumbnail of the original when there is no cutout', async () => {
    const { deps } = makeDeps();
    const result = await storeItemImages(
      { originalUri: 'file:///tmp/photo.jpg', cutoutUri: null },
      deps,
    );
    expect(result.cutoutPath).toBeNull();
    expect(result.thumbPath).toBe('images/items/2.jpg');
    expect(deps.resize).toHaveBeenCalledWith('file:///tmp/photo.jpg', THUMB_WIDTH, 'jpeg');
  });

  it('removes files already written when a later step fails', async () => {
    const { deps, removed } = makeDeps('file:///tmp/thumb.png');
    await expect(
      storeItemImages({ originalUri: 'file:///tmp/a.jpg', cutoutUri: 'file:///tmp/c.png' }, deps),
    ).rejects.toThrow('disk full');
    expect(removed).toEqual(['images/items/1.jpg', 'images/items/2.png']);
  });

  it('removes all images of an item', async () => {
    const { deps, removed } = makeDeps();
    await removeItemImages(images('x'), deps);
    await removeItemImages({ ...images('y'), cutoutPath: null }, deps);
    expect(removed).toHaveLength(5);
  });
});

describe('import queue', () => {
  const setup = async () => {
    const { db } = await createTestDb();
    let clock = 1000;
    const jobs = createImportJobRepository(
      () => db,
      () => clock++,
    );
    return { jobs };
  };

  it('processes every photo and reports progress', async () => {
    const { jobs } = await setup();
    await jobs.enqueue(['images/import/a.jpg', 'images/import/b.jpg', 'images/import/c.jpg']);
    expect(await jobs.progress()).toMatchObject({ queued: 3, total: 3 });

    const seen: string[] = [];
    const onChange = jest.fn();
    const processor = createImportProcessor({
      jobs,
      process: async (job) => {
        seen.push(job.sourcePath);
        return `item-${job.sourcePath}`;
      },
      onChange,
    });
    await processor.start();

    expect(seen.sort()).toEqual([
      'images/import/a.jpg',
      'images/import/b.jpg',
      'images/import/c.jpg',
    ]);
    expect(await jobs.progress()).toMatchObject({ done: 3, queued: 0, failed: 0, total: 3 });
    expect(onChange).toHaveBeenCalled();
    expect(processor.isRunning()).toBe(false);
  });

  it('runs at most two photos at a time', async () => {
    const { jobs } = await setup();
    await jobs.enqueue(['a', 'b', 'c', 'd', 'e']);
    let active = 0;
    let peak = 0;
    const processor = createImportProcessor({
      jobs,
      process: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return 'item';
      },
    });
    await processor.start();
    expect(peak).toBe(2);
  });

  it('keeps importing the others when one photo fails, and can retry it', async () => {
    const { jobs } = await setup();
    await jobs.enqueue(['good-1', 'bad', 'good-2']);
    let failBad = true;
    const processor = createImportProcessor({
      jobs,
      process: async (job) => {
        if (job.sourcePath === 'bad' && failBad) throw new Error('unreadable image');
        return 'item';
      },
    });
    await processor.start();

    expect(await jobs.progress()).toMatchObject({ done: 2, failed: 1 });
    const failed = (await jobs.list()).find((job) => job.status === 'failed')!;
    expect(failed).toMatchObject({ sourcePath: 'bad', error: 'unreadable image' });

    failBad = false;
    await jobs.retry(failed.id);
    await processor.start();
    expect(await jobs.progress()).toMatchObject({ done: 3, failed: 0 });
  });

  it('resumes photos that were in progress when the app closed', async () => {
    const { jobs } = await setup();
    await jobs.enqueue(['a', 'b', 'c']);
    // The app closes after one photo was claimed and another finished.
    const claimed = await jobs.claimNext();
    const finished = await jobs.claimNext();
    await jobs.markDone(finished!.id, 'item-1');
    expect(await jobs.progress()).toMatchObject({ processing: 1, done: 1, queued: 1 });

    const seen: string[] = [];
    await createImportProcessor({
      jobs,
      process: async (job) => {
        seen.push(job.sourcePath);
        return 'item';
      },
    }).start();

    expect(seen.sort()).toEqual([claimed!.sourcePath, 'c'].sort());
    expect(await jobs.progress()).toMatchObject({ done: 3, processing: 0, queued: 0 });
  });

  it('does not start a second run while one is in progress', async () => {
    const { jobs } = await setup();
    await jobs.enqueue(['a']);
    const process = jest.fn(async () => 'item');
    const processor = createImportProcessor({ jobs, process });
    await Promise.all([processor.start(), processor.start()]);
    expect(process).toHaveBeenCalledTimes(1);
  });

  it('clears finished jobs', async () => {
    const { jobs } = await setup();
    await jobs.enqueue(['a', 'b']);
    await createImportProcessor({ jobs, process: async () => 'item' }).start();
    expect(await jobs.clear(['done'])).toHaveLength(2);
    expect(await jobs.progress()).toMatchObject({ total: 0 });
  });
});

describe('import job', () => {
  const makeDeps = (overrides: Partial<ImportJobDeps> = {}) => {
    const removed: string[] = [];
    const created: unknown[] = [];
    let counter = 0;
    const deps: ImportJobDeps = {
      images: {
        save: async (_uri, _folder, extension) => `images/items/${++counter}.${extension}`,
        remove: async (path) => void removed.push(path),
        resize: async () => 'file:///tmp/thumb.png',
        cutout: async () => ({ uri: 'file:///tmp/cut.png', width: 10, height: 10 }),
      },
      sourceUri: (path) => `file:///documents/${path}`,
      itemExists: async () => false,
      tag: async () => ({
        name: 'Pink skirt',
        category: 'bottoms',
        subcategory: 'skirt',
        colours: ['pink'],
        seasons: ['summer'],
        occasions: ['party'],
        warmth: 2,
        brand: null,
      }),
      createItem: (async (itemDetails: unknown, itemImages: unknown, options: unknown) => {
        created.push({ itemDetails, itemImages, options });
        return { id: 'item-1' };
      }) as never,
      ...overrides,
    };
    return { deps, removed, created };
  };
  const job = {
    id: 'j1',
    sourcePath: 'images/import/a.jpg',
    status: 'processing',
    error: null,
    itemId: null,
  } as const;

  it('creates a tagged item awaiting review and removes the imported photo', async () => {
    const { deps, removed, created } = makeDeps();
    expect(await processImportJob(job, deps)).toBe('item-1');
    expect(created).toEqual([
      {
        itemDetails: expect.objectContaining({ name: 'Pink skirt', category: 'bottoms' }),
        itemImages: {
          originalPath: 'images/items/1.jpg',
          cutoutPath: 'images/items/2.png',
          thumbPath: 'images/items/3.png',
        },
        options: { needsReview: true, id: 'j1' },
      },
    ]);
    expect(removed).toEqual(['images/import/a.jpg']);
  });

  it('still imports the photo when tagging is unavailable and no cutout can be made', async () => {
    const { deps, created } = makeDeps({ tag: async () => null });
    deps.images.cutout = async () => null;
    await processImportJob(job, deps);
    expect(created[0]).toMatchObject({
      itemDetails: detailsFromTags(null),
      itemImages: { cutoutPath: null },
      options: { needsReview: true, id: 'j1' },
    });
  });

  it('does not create a second item when a finished job is run again', async () => {
    const { deps, created } = makeDeps({ itemExists: async () => true });
    expect(await processImportJob(job, deps)).toBe('j1');
    expect(created).toEqual([]);
  });

  it('fails the job when tagging fails for a reason that a retry can fix', async () => {
    const { deps, created } = makeDeps({
      tag: async () => {
        throw new Error('rate limited');
      },
    });
    await expect(processImportJob(job, deps)).rejects.toThrow('rate limited');
    expect(created).toEqual([]);
  });
});

describe('starting a bulk import', () => {
  it('queues each photo as soon as it is copied and counts the ones that fail', async () => {
    const enqueued: string[] = [];
    const started = jest.fn();
    const failed = await startBulkImport(['a.jpg', 'broken.jpg', 'c.jpg'], {
      save: async (uri) => {
        if (uri === 'broken.jpg') throw new Error('unreadable');
        return `images/import/${uri}`;
      },
      jobs: {
        clear: async () => [],
        enqueue: async (paths) => void enqueued.push(...paths),
      },
      started,
    });
    expect(failed).toBe(1);
    expect(enqueued).toEqual(['images/import/a.jpg', 'images/import/c.jpg']);
    expect(started).toHaveBeenCalledTimes(2);
  });
});
