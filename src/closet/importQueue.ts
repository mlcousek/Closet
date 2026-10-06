import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getDb, type Db } from '@/db/client';
import { createRepository } from '@/db/repository';
import { importJobs } from '@/db/schema';

export type ImportStatus = 'queued' | 'processing' | 'done' | 'failed';

export type ImportJob = {
  id: string;
  sourcePath: string;
  status: ImportStatus;
  error: string | null;
  itemId: string | null;
};

export type ImportProgress = Record<ImportStatus, number> & { total: number };

type Row = typeof importJobs.$inferSelect;

const toJob = (row: Row): ImportJob => ({
  id: row.id,
  sourcePath: row.sourcePath,
  status: (['queued', 'processing', 'done', 'failed'] as const).includes(row.status as ImportStatus)
    ? (row.status as ImportStatus)
    : 'failed',
  error: row.error,
  itemId: row.itemId,
});

export function createImportJobRepository(db: () => Db = getDb, now: () => number = Date.now) {
  const base = createRepository(db, importJobs, now);
  const active = isNull(importJobs.deletedAt);

  const setStatus = (id: string, status: ImportStatus, extra: Partial<Row> = {}) => {
    db()
      .update(importJobs)
      .set({ status, updatedAt: now(), ...extra })
      .where(eq(importJobs.id, id))
      .run();
  };

  return {
    async enqueue(sourcePaths: string[]): Promise<void> {
      for (const sourcePath of sourcePaths) await base.create({ sourcePath, status: 'queued' });
    },
    async list(): Promise<ImportJob[]> {
      return db()
        .select()
        .from(importJobs)
        .where(active)
        .orderBy(asc(importJobs.createdAt), asc(importJobs.id))
        .all()
        .map(toJob);
    },
    /** The oldest queued job, marked as processing, or null when none is waiting. */
    async claimNext(): Promise<ImportJob | null> {
      const row = db()
        .select()
        .from(importJobs)
        .where(and(active, eq(importJobs.status, 'queued')))
        .orderBy(asc(importJobs.createdAt), asc(importJobs.id))
        .limit(1)
        .get();
      if (!row) return null;
      setStatus(row.id, 'processing');
      return toJob({ ...row, status: 'processing' });
    },
    async markDone(id: string, itemId: string): Promise<void> {
      setStatus(id, 'done', { itemId, error: null });
    },
    async markFailed(id: string, error: string): Promise<void> {
      setStatus(id, 'failed', { error });
    },
    async retry(id: string): Promise<void> {
      setStatus(id, 'queued', { error: null });
    },
    /** Jobs left in "processing" by an app that was closed mid-import go back to the queue. */
    async requeueInterrupted(): Promise<void> {
      db()
        .update(importJobs)
        .set({ status: 'queued', updatedAt: now() })
        .where(and(active, eq(importJobs.status, 'processing')))
        .run();
    },
    async progress(): Promise<ImportProgress> {
      const rows = db()
        .select({ status: importJobs.status, count: sql<number>`count(*)` })
        .from(importJobs)
        .where(active)
        .groupBy(importJobs.status)
        .all();
      const progress: ImportProgress = { queued: 0, processing: 0, done: 0, failed: 0, total: 0 };
      for (const row of rows) {
        if (row.status in progress) progress[row.status as ImportStatus] = row.count;
        progress.total += row.count;
      }
      return progress;
    },
    /** Forgets finished jobs so the next import starts counting from zero. */
    async clear(statuses: ImportStatus[]): Promise<ImportJob[]> {
      const rows = db()
        .select()
        .from(importJobs)
        .where(and(active, inArray(importJobs.status, statuses)))
        .all();
      if (rows.length > 0) {
        db()
          .delete(importJobs)
          .where(
            inArray(
              importJobs.id,
              rows.map((row) => row.id),
            ),
          )
          .run();
      }
      return rows.map(toJob);
    },
  };
}

export type ImportJobRepository = ReturnType<typeof createImportJobRepository>;

export const IMPORT_CONCURRENCY = 2;

/**
 * Works through the import queue a few jobs at a time. One failing photo never
 * stops the others. Starting it again while it runs is harmless, and starting
 * it after a restart picks up where the previous run stopped.
 */
export function createImportProcessor(options: {
  jobs: ImportJobRepository;
  /** Turns one photo into an item and returns the item id. */
  process: (job: ImportJob) => Promise<string>;
  onChange?: () => void;
  concurrency?: number;
}) {
  const { jobs, process, onChange, concurrency = IMPORT_CONCURRENCY } = options;
  let running: Promise<void> | null = null;

  const worker = async () => {
    for (;;) {
      const job = await jobs.claimNext();
      if (!job) return;
      onChange?.();
      try {
        const itemId = await process(job);
        await jobs.markDone(job.id, itemId);
      } catch (error) {
        await jobs.markFailed(job.id, error instanceof Error ? error.message : String(error));
      }
      onChange?.();
    }
  };

  let active = 0;
  const pool: Promise<void>[] = [];
  /** Starts workers until as many run as are allowed. */
  const topUp = () => {
    while (active < concurrency) {
      active++;
      pool.push(
        worker().finally(() => {
          active--;
        }),
      );
    }
  };

  return {
    /** Resolves when the queue is empty. */
    start(): Promise<void> {
      if (!running) {
        running = (async () => {
          await jobs.requeueInterrupted();
          topUp();
          // Workers added while these run are waited for as well.
          while (pool.length > 0) await Promise.all(pool.splice(0));
        })().finally(() => {
          running = null;
        });
      } else {
        // Photos are queued one by one; a worker that found the queue empty has left, and
        // without this a bulk import would crawl along with a single worker.
        topUp();
      }
      return running;
    },
    isRunning: () => running !== null,
  };
}
