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
import { extensionOf, storeItemImages, type ItemImageDeps } from './itemImages';
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
  /** Suggested details, or null when tagging is unavailable. */
  tag: (uri: string, isCutout: boolean) => Promise<ItemTags | null>;
  createItem: typeof itemRepository.create;
};

/** Turns one imported photo into an item that waits for review. */
export async function processImportJob(job: ImportJob, deps: ImportJobDeps): Promise<string> {
  const originalUri = deps.sourceUri(job.sourcePath);
  const cutout = await deps.images.cutout(originalUri);
  const tags = await deps.tag(cutout?.uri ?? originalUri, cutout !== null);
  const images = await storeItemImages(
    { originalUri, cutoutUri: cutout?.uri ?? null },
    deps.images,
  );
  const item = await deps.createItem(detailsFromTags(tags), images, { needsReview: true });
  await deps.images.remove(job.sourcePath).catch(() => {});
  return item.id;
}

const deviceDeps: ImportJobDeps = {
  images: itemImageDeps,
  sourceUri: (path) => imageStore.uri(path),
  tag: async (uri, isCutout) => {
    try {
      return await tagItem(await toTagImage(uri, isCutout), i18n.language === 'cs' ? 'cs' : 'en');
    } catch (error) {
      // Without a key or a connection the item is still imported, just without suggestions.
      if (error instanceof AiUnavailableError) return null;
      throw error;
    }
  },
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

/** Copies the chosen photos into the app and starts turning them into items. */
export async function startBulkImport(photoUris: string[]): Promise<void> {
  // A finished earlier import no longer counts towards the progress shown.
  await importJobs.clear(['done']);
  const paths: string[] = [];
  for (const uri of photoUris) paths.push(await imageStore.save(uri, 'import', extensionOf(uri)));
  await importJobs.enqueue(paths);
  await refreshProgress();
  void processor.start();
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
