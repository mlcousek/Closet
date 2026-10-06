import { create } from 'zustand';

import { AiUnavailableError } from '@/ai/client';
import { tagItem, type ItemTags } from '@/ai/tagging';
import i18n from '@/i18n';
import { imageStore } from '@/storage/imageStore';

import { itemImageDeps, toTagImage } from './deviceImages';
import {
  createImportJobRepository,
  createImportProcessor,
  type ImportJob,
  type ImportProgress,
} from './importQueue';
import { extensionOf, removeItemImages, storeItemImages, type ItemImageDeps } from './itemImages';
import { itemRepository } from './repository';
import type { ItemDetails } from './types';

const EMPTY: ImportProgress = { queued: 0, processing: 0, done: 0, failed: 0, total: 0 };

/** Live progress of the bulk import, shown by the indicator and the import screen. */
export const useImportProgress = create<{ progress: ImportProgress; version: number }>(() => ({
  progress: EMPTY,
  version: 0,
}));

export const importJobs = createImportJobRepository();

async function refreshProgress(): Promise<void> {
  const progress = await importJobs.progress();
  useImportProgress.setState((state) => ({ progress, version: state.version + 1 }));
}

/** Details for an imported item: the suggestions when there are any, otherwise a placeholder to review. */
export function detailsFromTags(tags: ItemTags | null): ItemDetails {
  return {
    name: tags?.name ?? null,
    category: tags?.category ?? 'tops',
    subcategory: tags?.subcategory ?? null,
    colours: tags?.colours ?? [],
    seasons: tags?.seasons ?? [],
    occasions: tags?.occasions ?? [],
    warmth: tags?.warmth ?? null,
    brand: tags?.brand ?? null,
    size: null,
    price: null,
    currency: null,
    purchasedAt: null,
    notes: null,
    sourceUrl: null,
  };
}

export type ImportJobDeps = {
  images: ItemImageDeps;
  sourceUri: (path: string) => string;
  /**
   * Suggested details, or null when tagging cannot work at all (no key, key
   * rejected, offline). Temporary failures throw, so the photo can be retried.
   */
  tag: (
    uri: string,
    isCutout: boolean,
    size?: { width: number; height: number },
  ) => Promise<ItemTags | null>;
  /** True when an item with this id already exists. */
  itemExists: (id: string) => Promise<boolean>;
  createItem: typeof itemRepository.create;
};

/**
 * Turns one imported photo into an item that waits for review. The item takes
 * the job's id, so a job that is run again after the app was closed mid-way
 * cannot create the same item twice.
 */
export async function processImportJob(job: ImportJob, deps: ImportJobDeps): Promise<string> {
  if (await deps.itemExists(job.id)) {
    // Interrupted after the item was made: only the copied photo is left to remove.
    await deps.images.remove(job.sourcePath).catch(() => {});
    return job.id;
  }
  const originalUri = deps.sourceUri(job.sourcePath);
  const cutout = await deps.images.cutout(originalUri);
  const tags = await deps.tag(cutout?.uri ?? originalUri, cutout !== null, cutout ?? undefined);
  const images = await storeItemImages(
    { originalUri, cutoutUri: cutout?.uri ?? null },
    deps.images,
  );
  const item = await deps
    .createItem(detailsFromTags(tags), images, { needsReview: true, id: job.id })
    .catch(async (error: unknown) => {
      // Without the item nothing points at these files any more.
      await removeItemImages(images, deps.images);
      throw error;
    });
  await deps.images.remove(job.sourcePath).catch(() => {});
  return item.id;
}

/** Failures for which retrying the same photo later cannot help, so it is imported without tags. */
const NO_TAGS_REASONS = ['noKey', 'rejectedKey'];

const deviceDeps: ImportJobDeps = {
  images: itemImageDeps,
  sourceUri: (path) => imageStore.uri(path),
  tag: async (uri, isCutout, size) => {
    try {
      const image = await toTagImage(uri, isCutout, size);
      return await tagItem(image, i18n.language === 'cs' ? 'cs' : 'en');
    } catch (error) {
      if (error instanceof AiUnavailableError && NO_TAGS_REASONS.includes(error.reason)) {
        return null;
      }
      // No connection, rate limits and provider errors pass: the job fails and can be retried.
      throw error;
    }
  },
  itemExists: async (id) => (await itemRepository.get(id)) !== null,
  createItem: itemRepository.create,
};

let onItemsChanged: (() => void) | null = null;

/** Lets the app refresh item lists as imported items arrive. */
export function setImportListener(listener: (() => void) | null): void {
  onItemsChanged = listener;
}

const processor = createImportProcessor({
  jobs: importJobs,
  process: (job) => processImportJob(job, deviceDeps),
  onChange: () => {
    void refreshProgress();
    onItemsChanged?.();
  },
});

/**
 * Copies the chosen photos into the app and starts turning them into items.
 * Each photo is queued as soon as it is copied, so an interruption or one
 * unreadable photo loses nothing that was already copied. Returns how many
 * photos could not be copied.
 */
export async function startBulkImport(
  photoUris: string[],
  deps: {
    save: (uri: string) => Promise<string>;
    jobs: Pick<typeof importJobs, 'clear' | 'enqueue'>;
    started: () => void;
  } = {
    save: (uri) => imageStore.save(uri, 'import', extensionOf(uri)),
    jobs: importJobs,
    started: () => {
      void refreshProgress();
      void processor.start();
    },
  },
): Promise<number> {
  // A finished earlier import no longer counts towards the progress shown.
  await deps.jobs.clear(['done']);
  let failed = 0;
  for (const uri of photoUris) {
    try {
      await deps.jobs.enqueue([await deps.save(uri)]);
      deps.started();
    } catch {
      failed++;
    }
  }
  return failed;
}

/** Continues an import that was interrupted by the app closing. Called on app start. */
export async function resumeImports(): Promise<void> {
  await refreshProgress();
  const { queued, processing } = useImportProgress.getState().progress;
  if (queued + processing > 0) void processor.start();
}

export async function retryImportJob(id: string): Promise<void> {
  await importJobs.retry(id);
  await refreshProgress();
  void processor.start();
}

/** Drops failed photos the user does not want to retry. */
export async function dismissFailedImports(): Promise<void> {
  const removed = await importJobs.clear(['failed']);
  for (const job of removed) await imageStore.remove(job.sourcePath).catch(() => {});
  await refreshProgress();
}
