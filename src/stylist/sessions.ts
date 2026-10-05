import { desc, isNull } from 'drizzle-orm';

import { SLOTS, type Slot } from '@/closet/taxonomy';
import { getDb, type Db } from '@/db/client';
import { createRepository } from '@/db/repository';
import { getSetting, setSetting } from '@/db/settings';
import { stylistSessions } from '@/db/schema';
import type { Day } from '@/planning/dates';

import type { Proposal } from './stylist';

export type Turn = { request: string; proposals: Proposal[] };

export type StylistSession = {
  id: string;
  createdAt: number;
  request: string;
  day: Day | null;
  itemId: string | null;
  turns: Turn[];
};

type Row = typeof stylistSessions.$inferSelect;

/** Reads stored turns, dropping anything that is not shaped like one. */
function parseTurns(json: string): Turn[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((turn) => typeof turn?.request === 'string' && Array.isArray(turn?.proposals))
      .map((turn) => ({
        request: turn.request as string,
        proposals: (turn.proposals as Proposal[]).filter(
          (proposal) =>
            typeof proposal?.rationale === 'string' &&
            Array.isArray(proposal?.pieces) &&
            proposal.pieces.every(
              (piece) => typeof piece?.itemId === 'string' && SLOTS.includes(piece?.slot as Slot),
            ),
        ),
      }));
  } catch {
    return [];
  }
}

const toSession = (row: Row): StylistSession => ({
  id: row.id,
  createdAt: row.createdAt,
  request: row.request,
  day: row.day,
  itemId: row.itemId,
  turns: parseTurns(row.turns),
});

export function createSessionRepository(db: () => Db = getDb, now: () => number = Date.now) {
  const base = createRepository(db, stylistSessions, now);
  return {
    /** Sessions, newest first. */
    async list(): Promise<StylistSession[]> {
      return db()
        .select()
        .from(stylistSessions)
        .where(isNull(stylistSessions.deletedAt))
        .orderBy(desc(stylistSessions.createdAt), desc(stylistSessions.id))
        .all()
        .map(toSession);
    },
    async get(id: string): Promise<StylistSession | null> {
      const row = await base.getById(id);
      return row ? toSession(row) : null;
    },
    /** Starts a session with its first request and the proposals it got. */
    async start(input: {
      request: string;
      day: Day | null;
      itemId: string | null;
      proposals: Proposal[];
    }): Promise<StylistSession> {
      const turns: Turn[] = [{ request: input.request, proposals: input.proposals }];
      return toSession(
        await base.create({
          request: input.request,
          day: input.day,
          itemId: input.itemId,
          turns: JSON.stringify(turns),
        }),
      );
    },
    /** Adds a refinement and its proposals to a session. */
    async addTurn(id: string, turn: Turn): Promise<StylistSession | null> {
      const row = await base.getById(id);
      if (!row) return null;
      const updated = await base.update(id, {
        turns: JSON.stringify([...parseTurns(row.turns), turn]),
      });
      return updated ? toSession(updated) : null;
    },
    /** Remembers that a proposal was saved or planned, so reopening the session cannot repeat it. */
    async markProposal(
      id: string,
      turn: number,
      index: number,
      patch: Pick<Proposal, 'outfitId' | 'planned'>,
    ): Promise<void> {
      const row = await base.getById(id);
      if (!row) return;
      const turns = parseTurns(row.turns);
      const proposal = turns[turn]?.proposals[index];
      if (!proposal) return;
      turns[turn].proposals[index] = { ...proposal, ...patch };
      await base.update(id, { turns: JSON.stringify(turns) });
    },
    async remove(id: string): Promise<void> {
      await base.softDelete(id);
    },
    async restore(id: string): Promise<void> {
      await base.restore(id);
    },
  };
}

export const sessionRepository = createSessionRepository();

const DISCLOSED = 'stylist.disclosed';

/** Whether the user has been told once what the stylist sends to the provider. */
export const isDisclosed = () => getSetting(DISCLOSED) === '1';
export const setDisclosed = () => setSetting(DISCLOSED, '1');
