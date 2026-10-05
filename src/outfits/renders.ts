import { and, asc, desc, eq, gte, isNull, sql } from 'drizzle-orm';

import { getDb, type Db } from '@/db/client';
import { newId } from '@/db/id';
import { createRepository } from '@/db/repository';
import { aiUsage, renders } from '@/db/schema';

export type RenderStatus = 'queued' | 'running' | 'done' | 'failed';

/** Why a render did not produce an image. Each has its own message in the interface. */
export const RENDER_FAILURES = [
  'noKey',
  'noAvatar',
  'offline',
  'declined',
  'rateLimited',
  'timeout',
  'interrupted',
  'error',
] as const;
export type RenderFailure = (typeof RENDER_FAILURES)[number];

export type Render = {
  id: string;
  createdAt: number;
  outfitId: string;
  status: RenderStatus;
  fingerprint: string;
  provider: string | null;
  imagePath: string | null;
  thumbPath: string | null;
  failure: RenderFailure | null;
};

type Row = typeof renders.$inferSelect;

const STATUSES: RenderStatus[] = ['queued', 'running', 'done', 'failed'];

const toRender = (row: Row): Render => ({
  id: row.id,
  createdAt: row.createdAt,
  outfitId: row.outfitId,
  status: STATUSES.includes(row.status as RenderStatus) ? (row.status as RenderStatus) : 'failed',
  fingerprint: row.fingerprint,
  provider: row.provider,
  imagePath: row.imagePath,
  thumbPath: row.thumbPath,
  failure:
    row.status === 'failed'
      ? RENDER_FAILURES.includes(row.error as RenderFailure)
        ? (row.error as RenderFailure)
        : 'error'
      : null,
});

/**
 * Identifies what a render shows: the avatar image it was based on and the
 * pieces it dresses. A render is up to date exactly when its fingerprint
 * equals the outfit's current one, so replacing the avatar or removing an item
 * makes renders outdated without anything having to be flagged.
 */
export function fingerprint(avatarBasePath: string, itemIds: string[]): string {
  return `${avatarBasePath}|${[...itemIds].sort().join(',')}`;
}

export function createRenderRepository(db: () => Db = getDb, now: () => number = Date.now) {
  const base = createRepository(db, renders, now);
  const active = isNull(renders.deletedAt);

  const set = (id: string, values: Partial<Row>) => {
    db()
      .update(renders)
      .set({ ...values, updatedAt: now() })
      .where(eq(renders.id, id))
      .run();
  };

  return {
    async enqueue(outfitId: string, print: string): Promise<Render> {
      return toRender(await base.create({ outfitId, fingerprint: print, status: 'queued' }));
    },
    async get(id: string): Promise<Render | null> {
      const row = await base.getById(id);
      return row ? toRender(row) : null;
    },
    /** All renders of an outfit, newest first. */
    async forOutfit(outfitId: string): Promise<Render[]> {
      return db()
        .select()
        .from(renders)
        .where(and(active, eq(renders.outfitId, outfitId)))
        .orderBy(desc(renders.createdAt), desc(renders.id))
        .all()
        .map(toRender);
    },
    /** Every render that is not deleted, newest first, for showing outfit grids. */
    async all(): Promise<Render[]> {
      return db()
        .select()
        .from(renders)
        .where(active)
        .orderBy(desc(renders.createdAt), desc(renders.id))
        .all()
        .map(toRender);
    },
    /** A finished render made from exactly these inputs, if one exists. */
    async findDone(print: string): Promise<Render | null> {
      const row = db()
        .select()
        .from(renders)
        .where(and(active, eq(renders.status, 'done'), eq(renders.fingerprint, print)))
        .orderBy(desc(renders.createdAt))
        .limit(1)
        .get();
      return row ? toRender(row) : null;
    },
    /** The oldest queued render, marked as running, or null when none is waiting. */
    async claimNext(): Promise<Render | null> {
      const row = db()
        .select()
        .from(renders)
        .where(and(active, eq(renders.status, 'queued')))
        .orderBy(asc(renders.createdAt), asc(renders.id))
        .limit(1)
        .get();
      if (!row) return null;
      set(row.id, { status: 'running' });
      return toRender({ ...row, status: 'running' });
    },
    async markDone(
      id: string,
      result: { imagePath: string; thumbPath: string; provider: string },
    ): Promise<void> {
      set(id, { status: 'done', error: null, ...result });
    },
    async markFailed(id: string, failure: RenderFailure): Promise<void> {
      set(id, { status: 'failed', error: failure });
    },
    /**
     * Renders that were running when the app closed are marked as failed and
     * are not started again by themselves, because every attempt costs money.
     */
    async failInterrupted(): Promise<void> {
      db()
        .update(renders)
        .set({ status: 'failed', error: 'interrupted', updatedAt: now() })
        .where(and(active, eq(renders.status, 'running')))
        .run();
    },
    async remove(id: string): Promise<void> {
      await base.softDelete(id);
    },
  };
}

export type RenderRepository = ReturnType<typeof createRenderRepository>;

export const renderRepository = createRenderRepository();

export type RenderSummary = {
  current: Render | null;
  previous: Render | null;
  pending: Render | null;
  failed: Render | null;
  /** True when the shown render no longer matches the avatar or the pieces. */
  outdated: boolean;
};

/**
 * Picks what to show for an outfit from its renders (newest first):
 * - `current`: the newest finished render, whether or not it is up to date;
 * - `previous`: the finished render before it, to step back to after a regenerate;
 * - `pending`: a render that is queued or running;
 * - `failed`: the newest attempt, when it failed and nothing newer succeeded.
 */
export function summariseRenders(list: Render[], currentFingerprint: string | null): RenderSummary {
  const done = list.filter((render) => render.status === 'done');
  const current = done[0] ?? null;
  const newest = list[0] ?? null;
  return {
    current,
    previous: done[1] ?? null,
    pending:
      list.find((render) => render.status === 'queued' || render.status === 'running') ?? null,
    failed: newest?.status === 'failed' ? newest : null,
    /** True when the shown render no longer matches the avatar or the pieces. */
    outdated:
      current !== null && currentFingerprint !== null && current.fingerprint !== currentFingerprint,
  };
}

export type UsageKind = 'render' | 'studio' | 'tag' | 'stylist';

export function createUsageLog(db: () => Db = getDb, now: () => number = Date.now) {
  return {
    /** Records one paid provider request. */
    async record(kind: UsageKind): Promise<void> {
      db().insert(aiUsage).values({ id: newId(), createdAt: now(), kind }).run();
    },
    /** Requests of a kind this calendar month and in total. */
    async counts(kind: UsageKind): Promise<{ month: number; total: number }> {
      const today = new Date(now());
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
      const count = (since: number) =>
        db()
          .select({ value: sql<number>`count(*)` })
          .from(aiUsage)
          .where(and(eq(aiUsage.kind, kind), gte(aiUsage.createdAt, since)))
          .get()?.value ?? 0;
      return { month: count(monthStart), total: count(0) };
    },
  };
}

export const usageLog = createUsageLog();
