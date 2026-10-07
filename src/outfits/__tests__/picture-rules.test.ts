import { createTestDb } from '@/db/testing';

import { createRenderQueue, type RenderResult } from '../renderQueue';
import { createRenderRepository, fingerprint, piecesOf, summariseRenders } from '../renders';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));

const setup = async () => {
  const { db } = await createTestDb();
  let clock = 1000;
  const renders = createRenderRepository(
    () => db,
    () => ++clock,
  );
  const made: string[] = [];
  const queue = createRenderQueue({
    renders,
    run: async (render): Promise<RenderResult> => {
      made.push(render.fingerprint);
      const name = `r${made.length}`;
      return { imagePath: `${name}.png`, thumbPath: `${name}-t.jpg`, provider: 'gemini' };
    },
  });
  /** Asks for a picture and waits until the queue has nothing left to do. */
  const request = async (id: string, itemIds: string[], avatar: string | null, force = false) => {
    const outcome = await queue.request({ id, itemIds }, avatar, force);
    await queue.start();
    return outcome.kind;
  };
  const shown = async (id: string, itemIds: string[], avatar: string) =>
    summariseRenders(await renders.forOutfit(id), fingerprint(avatar, itemIds)).current
      ?.imagePath ?? null;
  return { renders, queue, made, request, shown };
};

describe('a picture made once is the one that is shown', () => {
  it('is not made again when the outfit is asked for again', async () => {
    const { made, request, shown } = await setup();
    expect(await request('o1', ['tee', 'jeans'], 'me.jpg')).toBe('queued');
    expect(await request('o1', ['jeans', 'tee'], 'me.jpg')).toBe('reused');
    expect(made).toHaveLength(1);
    expect(await shown('o1', ['tee', 'jeans'], 'me.jpg')).toBe('r1.png');
  });

  it('stays after the photo of the user is replaced, until a new one is asked for', async () => {
    const { made, request, shown } = await setup();
    await request('o1', ['tee', 'jeans'], 'old.jpg');

    // Saving the outfit again, or opening it, asks without force: nothing is made or paid.
    expect(await request('o1', ['tee', 'jeans'], 'new.jpg')).toBe('reused');
    expect(made).toHaveLength(1);
    expect(await shown('o1', ['tee', 'jeans'], 'new.jpg')).toBe('r1.png');

    // Regenerate makes one with the new photo.
    expect(await request('o1', ['tee', 'jeans'], 'new.jpg', true)).toBe('queued');
    expect(made).toEqual([
      fingerprint('old.jpg', ['tee', 'jeans']),
      fingerprint('new.jpg', ['tee', 'jeans']),
    ]);
    expect(await shown('o1', ['tee', 'jeans'], 'new.jpg')).toBe('r2.png');
  });

  it('is dropped when a piece changes, and comes back with the pieces', async () => {
    const { made, request, shown } = await setup();
    await request('o1', ['tee', 'jeans'], 'me.jpg');

    expect(await shown('o1', ['tee', 'chinos'], 'me.jpg')).toBeNull();
    expect(await request('o1', ['tee', 'chinos'], 'me.jpg')).toBe('queued');
    expect(await shown('o1', ['tee', 'chinos'], 'me.jpg')).toBe('r2.png');

    // Back to the first pieces: their picture is still there and nothing is made.
    expect(await request('o1', ['tee', 'jeans'], 'me.jpg')).toBe('reused');
    expect(await shown('o1', ['tee', 'jeans'], 'me.jpg')).toBe('r1.png');
    expect(made).toHaveLength(2);
  });

  it('is dropped when the photo of a piece is replaced', async () => {
    const { request, shown } = await setup();
    await request('o1', ['tee@a.png', 'jeans@b.png'], 'me.jpg');
    expect(await shown('o1', ['tee@a2.png', 'jeans@b.png'], 'me.jpg')).toBeNull();
  });

  it('is not taken from another outfit that was made with an earlier photo', async () => {
    const { made, request } = await setup();
    await request('o1', ['tee', 'jeans'], 'old.jpg');
    // A different outfit with the same pieces shares a picture only of the same photo.
    expect(await request('o2', ['tee', 'jeans'], 'new.jpg')).toBe('queued');
    expect(await request('o3', ['tee', 'jeans'], 'new.jpg')).toBe('reused');
    expect(made).toHaveLength(2);
  });
});

describe('clearing out old pictures', () => {
  it('keeps the picture of the current pieces whatever photo it was made with', async () => {
    const { renders, request } = await setup();
    await request('o1', ['tee', 'jeans'], 'old.jpg');
    for (const bottom of ['chinos', 'shorts', 'skirt']) {
      await request('o1', ['tee', bottom], 'old.jpg');
    }
    // The outfit is back to its first pieces, and the user has a new photo since.
    const current = new Set([fingerprint('new.jpg', ['tee', 'jeans'])]);

    const removed = await renders.purge([], 2, current);

    const left = (await renders.forOutfit('o1')).map((render) => piecesOf(render.fingerprint));
    expect(left).toEqual(['skirt,tee', 'shorts,tee', 'jeans,tee']);
    expect(removed).toEqual(['r2.png', 'r2-t.jpg']);
  });
});

describe('the pieces part of a fingerprint', () => {
  it('ignores the photo and the order of the pieces', () => {
    expect(piecesOf(fingerprint('a.jpg', ['b', 'a']))).toBe(
      piecesOf(fingerprint('z.jpg', ['a', 'b'])),
    );
    expect(piecesOf(fingerprint('a.jpg', ['a']))).not.toBe(piecesOf(fingerprint('a.jpg', ['b'])));
  });
});
