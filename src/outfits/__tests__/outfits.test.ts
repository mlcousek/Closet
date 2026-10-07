import {
  TryOnError,
  PIECES_BUDGET,
  createGeminiProvider,
  encodeWithinBudget,
  isInvalidKey,
  readGeminiImage,
  tryOnPrompt,
} from '@/ai/tryOn';
import { createItemRepository } from '@/closet/repository';
import type { Slot } from '@/closet/taxonomy';
import type { ItemDetails } from '@/closet/types';
import { createTestDb } from '@/db/testing';

import {
  EDITOR_SLOTS,
  addRow,
  draftFromItem,
  draftFromPieces,
  draftPieces,
  emptyDraft,
  isDraftEmpty,
  isSlotActive,
  removeRow,
  sameOutfit,
  select,
  setHidden,
  shuffle,
} from '../draft';
import { createOutfitRepository } from '../repository';
import { RenderFailedError, RenderSupersededError, createRenderQueue } from '../renderQueue';
import {
  createRenderRepository,
  createUsageLog,
  fingerprint,
  piecesOf,
  summariseRenders,
} from '../renders';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('@/db/settings', () => ({ getSetting: () => null, setSetting: jest.fn() }));

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
const images = {
  originalPath: 'images/items/o.jpg',
  cutoutPath: null,
  thumbPath: 'images/items/t.jpg',
};

describe('outfit draft rules', () => {
  it('starts empty and cannot be saved empty', () => {
    expect(isDraftEmpty(emptyDraft())).toBe(true);
    expect(draftPieces(emptyDraft())).toEqual([]);
  });

  it('collects the chosen pieces by slot', () => {
    let draft = select(emptyDraft(), 'top', 0, 'shirt');
    draft = select(draft, 'bottom', 0, 'skirt');
    draft = select(draft, 'shoes', 0, 'boots');
    expect(draftPieces(draft)).toEqual([
      { itemId: 'shirt', slot: 'top', position: 0 },
      { itemId: 'skirt', slot: 'bottom', position: 0 },
      { itemId: 'boots', slot: 'shoes', position: 0 },
    ]);
  });

  it('clears top and bottom when a full-body piece is chosen, and marks them as not needed', () => {
    let draft = select(emptyDraft(), 'top', 0, 'shirt');
    draft = select(draft, 'bottom', 0, 'skirt');
    draft = select(draft, 'fullBody', 0, 'dress');
    expect(draftPieces(draft)).toEqual([{ itemId: 'dress', slot: 'fullBody', position: 0 }]);
    expect(isSlotActive(draft, 'top')).toBe(false);
    expect(isSlotActive(draft, 'bottom')).toBe(false);
  });

  it('drops the full-body piece when a top is chosen afterwards', () => {
    let draft = select(emptyDraft(), 'fullBody', 0, 'dress');
    draft = select(draft, 'top', 0, 'shirt');
    expect(draftPieces(draft)).toEqual([{ itemId: 'shirt', slot: 'top', position: 0 }]);
  });

  it('allows several pieces only in layering slots', () => {
    let draft = select(emptyDraft(), 'accessory', 0, 'scarf');
    draft = addRow(draft, 'accessory');
    draft = select(draft, 'accessory', 1, 'hat');
    expect(draftPieces(draft).map((piece) => [piece.itemId, piece.position])).toEqual([
      ['scarf', 0],
      ['hat', 1],
    ]);
    expect(addRow(draft, 'shoes')).toBe(draft);
    expect(addRow(draft, 'bag')).toBe(draft);
  });

  it('does not let the same piece be worn twice', () => {
    let draft = select(emptyDraft(), 'top', 0, 'shirt');
    draft = addRow(draft, 'top');
    expect(select(draft, 'top', 1, 'shirt')).toBe(draft);
  });

  it('removes an extra row but always keeps one', () => {
    let draft = addRow(select(emptyDraft(), 'top', 0, 'shirt'), 'top');
    draft = select(draft, 'top', 1, 'vest');
    draft = removeRow(draft, 'top', 0);
    expect(draft.rows.top).toEqual(['vest']);
    expect(removeRow(draft, 'top', 0).rows.top).toEqual([null]);
  });

  it('leaves a hidden slot out and restores it when shown again', () => {
    let draft = select(emptyDraft(), 'shoes', 0, 'boots');
    draft = setHidden(draft, 'shoes', true);
    expect(draftPieces(draft)).toEqual([]);
    draft = setHidden(draft, 'shoes', false);
    expect(draftPieces(draft)).toEqual([{ itemId: 'boots', slot: 'shoes', position: 0 }]);
  });

  it('opens with a closet item in its slot', () => {
    expect(draftPieces(draftFromItem({ id: 'd1', category: 'dresses' }))).toEqual([
      { itemId: 'd1', slot: 'fullBody', position: 0 },
    ]);
    expect(draftPieces(draftFromItem({ id: 'n1', category: 'jewellery' }))[0].slot).toBe(
      'accessory',
    );
  });

  it('round-trips saved pieces and detects changes', () => {
    const pieces = [
      { itemId: 'coat', slot: 'outer' as const, position: 0 },
      { itemId: 'shirt', slot: 'top' as const, position: 0 },
      { itemId: 'vest', slot: 'top' as const, position: 1 },
      { itemId: 'boots', slot: 'shoes' as const, position: 0 },
    ];
    const draft = draftFromPieces(pieces);
    expect(draftPieces(draft)).toEqual(pieces);
    expect(sameOutfit(draft, draftFromPieces(pieces))).toBe(true);
    expect(sameOutfit(draft, select(draft, 'shoes', 0, 'sandals'))).toBe(false);
    // Hiding an empty slot is not a change to the outfit.
    expect(sameOutfit(draft, setHidden(draft, 'bag', true))).toBe(true);
  });

  it('shuffles only among the items of each slot and respects the slot rules', () => {
    const offered = Object.fromEntries(
      EDITOR_SLOTS.map((slot) => [slot, [{ id: `${slot}-a` }, { id: `${slot}-b` }]]),
    ) as Record<Slot, { id: string }[]>;
    for (const value of [0, 0.29, 0.31, 0.6, 0.99]) {
      const pieces = draftPieces(shuffle(emptyDraft(), offered, () => value));
      expect(pieces.length).toBeGreaterThan(0);
      for (const piece of pieces) expect(piece.itemId.startsWith(`${piece.slot}-`)).toBe(true);
      const slots = pieces.map((piece) => piece.slot);
      const hasDress = slots.includes('fullBody');
      expect(hasDress && (slots.includes('top') || slots.includes('bottom'))).toBe(false);
      expect(slots.filter((slot) => slot === 'shoes')).toHaveLength(1);
    }
  });

  it('gives the same shuffle for the same random source and skips hidden slots', () => {
    const offered = Object.fromEntries(
      EDITOR_SLOTS.map((slot) => [slot, [{ id: `${slot}-a` }, { id: `${slot}-b` }]]),
    ) as Record<Slot, { id: string }[]>;
    const hidden = setHidden(emptyDraft(), 'bag', true);
    const first = draftPieces(shuffle(hidden, offered, () => 0.5));
    expect(draftPieces(shuffle(hidden, offered, () => 0.5))).toEqual(first);
    expect(first.some((piece) => piece.slot === 'bag')).toBe(false);
  });
});

const setupDb = async () => {
  const { db } = await createTestDb();
  let clock = 1000;
  const now = () => clock++;
  const items = createItemRepository(() => db, now);
  const outfits = createOutfitRepository(() => db, now);
  const renders = createRenderRepository(() => db, now);
  const shirt = await items.create(details({ name: 'Shirt', category: 'tops' }), images);
  const skirt = await items.create(details({ name: 'Skirt', category: 'bottoms' }), images);
  const boots = await items.create(details({ name: 'Boots', category: 'shoes' }), images);
  const pieces = [
    { itemId: shirt.id, slot: 'top' as const, position: 0 },
    { itemId: skirt.id, slot: 'bottom' as const, position: 0 },
    { itemId: boots.id, slot: 'shoes' as const, position: 0 },
  ];
  return { db, now, items, outfits, renders, shirt, skirt, boots, pieces };
};

describe('outfit repository', () => {
  it('stores an outfit with its pieces in editor order', async () => {
    const { outfits, pieces, shirt, skirt, boots } = await setupDb();
    const outfit = await outfits.create([...pieces].reverse(), { name: 'Friday' });
    expect(outfit.name).toBe('Friday');
    expect(outfit.entries.map((entry) => [entry.item.id, entry.slot])).toEqual([
      [shirt.id, 'top'],
      [skirt.id, 'bottom'],
      [boots.id, 'shoes'],
    ]);
    expect((await outfits.list()).map((entry) => entry.id)).toEqual([outfit.id]);
  });

  it('refuses an outfit without pieces', async () => {
    const { outfits, pieces } = await setupDb();
    await expect(outfits.create([])).rejects.toThrow();
    const outfit = await outfits.create(pieces);
    await expect(outfits.setPieces(outfit.id, [])).rejects.toThrow();
  });

  it('keeps an item only once even if it is given in two slots', async () => {
    const { outfits, pieces, shirt } = await setupDb();
    const outfit = await outfits.create([
      pieces[0],
      { itemId: shirt.id, slot: 'bottom', position: 0 },
      pieces[2],
    ]);
    expect(outfit.entries.map((entry) => entry.slot)).toEqual(['top', 'shoes']);
  });

  it('replaces the pieces of an outfit', async () => {
    const { outfits, pieces, shirt } = await setupDb();
    const outfit = await outfits.create(pieces);
    const updated = await outfits.setPieces(outfit.id, [pieces[0]]);
    expect(updated!.entries.map((entry) => entry.item.id)).toEqual([shirt.id]);
  });

  it('filters by favourite, season and occasion', async () => {
    const { outfits, pieces } = await setupDb();
    const summer = await outfits.create(pieces, { seasons: ['summer'], occasions: ['party'] });
    const work = await outfits.create(pieces, { occasions: ['work'], favourite: true });
    const ids = async (filter: Parameters<typeof outfits.list>[0]) =>
      (await outfits.list(filter)).map((outfit) => outfit.id);
    expect(await ids({ favourite: true })).toEqual([work.id]);
    expect(await ids({ season: 'summer' })).toEqual([summer.id]);
    expect(await ids({ occasion: 'work' })).toEqual([work.id]);
    expect(await ids({ season: 'summer', occasion: 'work' })).toEqual([]);
    expect(await ids({})).toEqual([work.id, summer.id]);
  });

  it('renames, marks as favourite and duplicates', async () => {
    const { outfits, pieces } = await setupDb();
    const outfit = await outfits.create(pieces, { name: 'Friday', favourite: true });
    await outfits.updateInfo(outfit.id, { name: 'Saturday' });
    const copy = await outfits.duplicate(outfit.id);
    expect(copy).toMatchObject({ name: 'Saturday', favourite: false });
    expect(copy!.id).not.toBe(outfit.id);
    expect(copy!.entries.map((entry) => entry.item.id)).toEqual(
      outfit.entries.map((entry) => entry.item.id),
    );
  });

  it('deletes an outfit without touching its items, and restores it on undo', async () => {
    const { outfits, items, pieces } = await setupDb();
    const outfit = await outfits.create(pieces);
    await outfits.remove(outfit.id);
    expect(await outfits.list()).toEqual([]);
    expect(await items.count()).toBe(3);
    await outfits.restore(outfit.id);
    expect((await outfits.get(outfit.id))!.entries).toHaveLength(3);
  });

  it('counts the outfits that use an item', async () => {
    const { outfits, pieces, shirt, boots } = await setupDb();
    const first = await outfits.create(pieces);
    await outfits.create([pieces[0]]);
    expect(await outfits.countUsing([shirt.id])).toBe(2);
    expect(await outfits.countUsing([boots.id])).toBe(1);
    expect(await outfits.countUsing([shirt.id, boots.id])).toBe(2);
    await outfits.remove(first.id);
    expect(await outfits.countUsing([boots.id])).toBe(0);
  });

  it('drops a deleted item from outfits and brings it back when the delete is undone', async () => {
    const { outfits, items, pieces, shirt } = await setupDb();
    const outfit = await outfits.create(pieces);
    await items.remove([shirt.id]);
    expect((await outfits.get(outfit.id))!.entries).toHaveLength(2);
    await items.restore([shirt.id]);
    expect((await outfits.get(outfit.id))!.entries).toHaveLength(3);
  });

  it('keeps an archived item in its outfits, marked as archived', async () => {
    const { outfits, items, pieces, shirt } = await setupDb();
    const outfit = await outfits.create(pieces);
    await items.archive([shirt.id]);
    const entry = (await outfits.get(outfit.id))!.entries.find(
      (candidate) => candidate.item.id === shirt.id,
    );
    expect(entry?.item.ownership).toBe('archived');
  });
});

describe('renders', () => {
  it('builds a fingerprint that ignores item order and changes with the avatar or pieces', () => {
    expect(fingerprint('a.jpg', ['2', '1'])).toBe(fingerprint('a.jpg', ['1', '2']));
    expect(fingerprint('a.jpg', ['1', '2'])).not.toBe(fingerprint('b.jpg', ['1', '2']));
    expect(fingerprint('a.jpg', ['1', '2'])).not.toBe(fingerprint('a.jpg', ['1']));
  });

  it('forgets long-deleted outfits and the pictures nobody sees any more', async () => {
    const { db, outfits, renders, pieces } = await setupDb();
    const file = (name: string) => ({
      imagePath: `${name}.png`,
      thumbPath: `${name}-t.jpg`,
      provider: 'gemini',
    });
    const kept = await outfits.create(pieces, { name: 'Kept' });
    const old = await outfits.create(pieces, { name: 'Old' });
    const recent = await outfits.create(pieces, { name: 'Recent' });
    // Three pictures of the kept outfit: only the current one and the one before stay.
    for (const name of ['k1', 'k2', 'k3']) await renders.createDone(kept.id, 'fp', file(name));
    await renders.createDone(old.id, 'fp', file('o1'));
    // A duplicate shares the files of the picture it was copied with.
    await renders.createDone(old.id, 'fp', file('k3'));
    await renders.createDone(recent.id, 'fp', file('r1'));
    const dropped = await renders.enqueue(kept.id, 'other');
    await renders.remove(dropped.id);

    await outfits.remove(old.id);
    const cutoff = Date.now();
    // Deleted with the test clock, which is far before the cutoff; this one is deleted "now".
    await createOutfitRepository(
      () => db,
      () => cutoff + 1000,
    ).remove(recent.id);

    const gone = await outfits.purgeDeleted(cutoff);
    expect(gone).toEqual([old.id]);
    expect(await outfits.get(kept.id)).not.toBeNull();
    // Still restorable: its undo period is not over.
    await outfits.restore(recent.id);
    expect((await outfits.get(recent.id))?.entries).toHaveLength(3);
    await outfits.restore(old.id);
    expect(await outfits.get(old.id)).toBeNull();

    const files = await renders.purge(gone);
    expect(files.sort()).toEqual(['k1-t.jpg', 'k1.png', 'o1-t.jpg', 'o1.png']);
    expect((await renders.forOutfit(kept.id)).map((render) => render.imagePath)).toEqual([
      'k3.png',
      'k2.png',
    ]);
    expect(await renders.forOutfit(old.id)).toEqual([]);
    expect(await renders.forOutfit(recent.id)).toHaveLength(1);
    expect(await renders.purge([])).toEqual([]);

    // An outfit edited back to earlier pieces shows an older picture as current: it stays.
    const edited = await outfits.create(pieces, { name: 'Edited' });
    await renders.createDone(edited.id, 'now', file('e1'));
    await renders.createDone(edited.id, 'then', file('e2'));
    await renders.createDone(edited.id, 'later', file('e3'));
    expect(await renders.purge([], 2, new Set(['now']))).toEqual([]);
    expect(await renders.forOutfit(edited.id)).toHaveLength(3);
    expect((await renders.purge([], 2, new Set())).sort()).toEqual(['e1-t.jpg', 'e1.png']);
  });

  it('removes an outfit when every one of its pieces is gone for good', async () => {
    const { outfits, pieces, shirt, skirt, boots } = await setupDb();
    const full = await outfits.create(pieces, { name: 'Full' });
    const single = await outfits.create([pieces[0]], { name: 'Only a shirt' });

    await outfits.forgetItems([shirt.id]);
    expect((await outfits.get(full.id))?.entries.map((entry) => entry.item.id)).toEqual([
      skirt.id,
      boots.id,
    ]);
    // Nothing is left of this one, so it could not be shown, edited or rendered.
    expect(await outfits.get(single.id)).toBeNull();
    expect((await outfits.list()).map((outfit) => outfit.name)).toEqual(['Full']);
  });

  it('summarises what to show for an outfit', async () => {
    const { renders } = await setupDb();
    const done = { imagePath: 'r1.png', thumbPath: 'r1-t.jpg', provider: 'gemini' };

    expect(summariseRenders([], 'fp')).toMatchObject({
      current: null,
      pending: null,
      failed: null,
    });

    const first = await renders.enqueue('o1', 'fp');
    expect(summariseRenders(await renders.forOutfit('o1'), 'fp').pending?.id).toBe(first.id);

    await renders.markDone(first.id, done);
    let summary = summariseRenders(await renders.forOutfit('o1'), 'fp');
    expect(summary).toMatchObject({ pending: null, failed: null });
    expect(summary.current?.imagePath).toBe('r1.png');

    // A regenerate that fails keeps the previous render on show.
    const second = await renders.enqueue('o1', 'fp');
    await renders.markFailed(second.id, 'declined');
    summary = summariseRenders(await renders.forOutfit('o1'), 'fp');
    expect(summary.current?.id).toBe(first.id);
    expect(summary.failed?.failure).toBe('declined');

    // A regenerate that succeeds becomes current, with the old one to step back to.
    const third = await renders.enqueue('o1', 'fp');
    await renders.markDone(third.id, { ...done, imagePath: 'r3.png' });
    summary = summariseRenders(await renders.forOutfit('o1'), 'fp');
    expect(summary.current?.imagePath).toBe('r3.png');
    expect(summary.previous?.id).toBe(first.id);
    expect(summary.failed).toBeNull();

    // A piece was changed: the picture is no longer shown, nor offered to step back to.
    expect(summariseRenders(await renders.forOutfit('o1'), 'other')).toMatchObject({
      current: null,
      previous: null,
    });
  });

  it('keeps showing a picture after the photo of the user changed', async () => {
    const { renders } = await setupDb();
    const done = { thumbPath: 't.jpg', provider: 'gemini' };
    const old = await renders.enqueue('o1', fingerprint('avatar/old.jpg', ['shirt', 'skirt']));
    await renders.markDone(old.id, { ...done, imagePath: 'old.png' });
    const now = fingerprint('avatar/new.jpg', ['skirt', 'shirt']);

    let summary = summariseRenders(await renders.forOutfit('o1'), now);
    expect(summary.current?.imagePath).toBe('old.png');

    // A picture made with the new photo takes its place, with the old one to step back to.
    const fresh = await renders.enqueue('o1', now);
    await renders.markDone(fresh.id, { ...done, imagePath: 'new.png' });
    summary = summariseRenders(await renders.forOutfit('o1'), now);
    expect(summary.current?.imagePath).toBe('new.png');
    expect(summary.previous?.imagePath).toBe('old.png');

    // Without any photo the picture is still the outfit's picture.
    expect(
      summariseRenders(await renders.forOutfit('o1'), fingerprint('none', ['shirt', 'skirt']))
        .current?.imagePath,
    ).toBe('new.png');
    expect(piecesOf(now)).toBe('shirt,skirt');
  });

  it('shows the render that matches the outfit after going back to an earlier combination', async () => {
    const { renders } = await setupDb();
    const done = { thumbPath: 't.jpg', provider: 'gemini' };
    const first = await renders.enqueue('o1', 'shirt+skirt');
    await renders.markDone(first.id, { ...done, imagePath: 'first.png' });
    const second = await renders.enqueue('o1', 'shirt+jeans');
    await renders.markDone(second.id, { ...done, imagePath: 'second.png' });

    const summary = summariseRenders(await renders.forOutfit('o1'), 'shirt+skirt');
    expect(summary.current?.imagePath).toBe('first.png');
    // The picture of the other combination is not one of this outfit as it is now.
    expect(summary.previous).toBeNull();
  });

  it('does not report a failed render that was for an earlier version of the outfit', async () => {
    const { renders } = await setupDb();
    const old = await renders.enqueue('o1', 'old');
    await renders.markFailed(old.id, 'timeout');
    expect(summariseRenders(await renders.forOutfit('o1'), 'new').failed).toBeNull();
    expect(summariseRenders(await renders.forOutfit('o1'), 'old').failed?.failure).toBe('timeout');
  });

  it('counts usage for the current month and in total', async () => {
    const { db } = await setupDb();
    let time = new Date(2026, 8, 20).getTime();
    const usage = createUsageLog(
      () => db,
      () => time,
    );
    await usage.record('render');
    time = new Date(2026, 9, 2).getTime();
    await usage.record('render');
    await usage.record('render');
    await usage.record('studio');
    expect(await usage.counts('render')).toEqual({ month: 2, total: 3 });
    expect(await usage.counts('studio')).toEqual({ month: 1, total: 1 });
    expect(await usage.counts('tag')).toEqual({ month: 0, total: 0 });
  });
});

describe('render queue', () => {
  const result = { imagePath: 'r.png', thumbPath: 'r-t.jpg', provider: 'gemini' };
  const outfit = { id: 'o1', itemIds: ['a', 'b'] };

  it('renders after a request and reports the result', async () => {
    const { renders } = await setupDb();
    const run = jest.fn(async () => result);
    const onChange = jest.fn();
    const queue = createRenderQueue({ renders, run, onChange });

    const outcome = await queue.request(outfit, 'avatar.jpg');
    expect(outcome.kind).toBe('queued');
    await queue.start();

    expect(run).toHaveBeenCalledTimes(1);
    const [render] = await renders.forOutfit('o1');
    expect(render).toMatchObject({ status: 'done', imagePath: 'r.png' });
    expect(onChange).toHaveBeenCalled();
  });

  it('reuses a finished render when the pieces and avatar are unchanged', async () => {
    const { renders } = await setupDb();
    const run = jest.fn(async () => result);
    const queue = createRenderQueue({ renders, run });
    await queue.request(outfit, 'avatar.jpg');
    await queue.start();

    const again = await queue.request({ id: 'o1', itemIds: ['b', 'a'] }, 'avatar.jpg');
    await queue.start();
    expect(again.kind).toBe('reused');
    expect(run).toHaveBeenCalledTimes(1);

    // Another outfit made of the same pieces gets the same picture without a new request.
    const other = await queue.request({ id: 'o2', itemIds: ['a', 'b'] }, 'avatar.jpg');
    expect(other.kind).toBe('reused');
    expect((await renders.forOutfit('o2'))[0]).toMatchObject({
      status: 'done',
      imagePath: 'r.png',
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('renders again when the pieces changed or when forced, but not for a new avatar alone', async () => {
    const { renders } = await setupDb();
    const run = jest.fn(async () => result);
    const queue = createRenderQueue({ renders, run });
    await queue.request(outfit, 'avatar.jpg');
    await queue.start();

    expect((await queue.request({ id: 'o1', itemIds: ['a'] }, 'avatar.jpg')).kind).toBe('queued');
    await queue.start();
    expect((await queue.request(outfit, 'studio.jpg')).kind).toBe('reused');
    await queue.start();
    expect((await queue.request(outfit, 'studio.jpg', true)).kind).toBe('queued');
    await queue.start();
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('drops a waiting render when the outfit changes before it starts, so only one is paid', async () => {
    const { renders } = await setupDb();
    let release: (value: typeof result) => void = () => {};
    const run = jest.fn(() => new Promise<typeof result>((resolve) => (release = resolve)));
    const queue = createRenderQueue({ renders, run });
    // Another outfit is rendering, so ours waits.
    await queue.request({ id: 'busy', itemIds: ['x'] }, 'avatar.jpg');
    await queue.request({ id: 'o1', itemIds: ['a', 'b'] }, 'avatar.jpg');
    await queue.request({ id: 'o1', itemIds: ['a', 'c'] }, 'avatar.jpg');

    const waiting = (await renders.forOutfit('o1')).filter((render) => render.status === 'queued');
    expect(waiting.map((render) => render.fingerprint)).toEqual([
      fingerprint('avatar.jpg', ['a', 'c']),
    ]);
    release(result);
  });

  it('forgets a render whose inputs changed while it waited, without a failure', async () => {
    const { renders } = await setupDb();
    const run = jest.fn(async () => {
      throw new RenderSupersededError();
    });
    const queue = createRenderQueue({ renders, run });
    await queue.request(outfit, 'avatar.jpg');
    await queue.start();
    expect(await renders.forOutfit('o1')).toEqual([]);
  });

  it('does nothing without an avatar or without pieces', async () => {
    const { renders } = await setupDb();
    const run = jest.fn(async () => result);
    const queue = createRenderQueue({ renders, run });
    expect(await queue.request(outfit, null)).toEqual({ kind: 'skipped', reason: 'noAvatar' });
    expect(await queue.request({ id: 'o1', itemIds: [] }, 'a.jpg')).toEqual({
      kind: 'skipped',
      reason: 'empty',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('records why a render failed and never retries by itself', async () => {
    const { renders } = await setupDb();
    const run = jest.fn(async () => {
      throw new RenderFailedError('declined');
    });
    const queue = createRenderQueue({ renders, run });
    await queue.request(outfit, 'avatar.jpg');
    await queue.start();
    await queue.start();

    expect(run).toHaveBeenCalledTimes(1);
    expect((await renders.forOutfit('o1'))[0]).toMatchObject({
      status: 'failed',
      failure: 'declined',
    });
  });

  it('keeps the previous render when a regenerate fails', async () => {
    const { renders } = await setupDb();
    let fail = false;
    const queue = createRenderQueue({
      renders,
      run: async () => {
        if (fail) throw new RenderFailedError('timeout');
        return result;
      },
    });
    await queue.request(outfit, 'avatar.jpg');
    await queue.start();
    fail = true;
    await queue.request(outfit, 'avatar.jpg', true);
    await queue.start();

    const summary = summariseRenders(
      await renders.forOutfit('o1'),
      fingerprint('avatar.jpg', ['a', 'b']),
    );
    expect(summary.current?.imagePath).toBe('r.png');
    expect(summary.failed?.failure).toBe('timeout');
  });

  it('does not queue the same outfit twice while one render is waiting', async () => {
    const { renders } = await setupDb();
    let release: (value: typeof result) => void = () => {};
    const run = jest.fn(() => new Promise<typeof result>((resolve) => (release = resolve)));
    const queue = createRenderQueue({ renders, run });
    await queue.request(outfit, 'avatar.jpg');
    await queue.request(outfit, 'avatar.jpg');
    expect(await renders.forOutfit('o1')).toHaveLength(1);
    release(result);
    await queue.start();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs one render at a time', async () => {
    const { renders } = await setupDb();
    let active = 0;
    let peak = 0;
    const queue = createRenderQueue({
      renders,
      run: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return result;
      },
    });
    await queue.request({ id: 'o1', itemIds: ['a'] }, 'avatar.jpg');
    await queue.request({ id: 'o2', itemIds: ['b'] }, 'avatar.jpg');
    await queue.request({ id: 'o3', itemIds: ['c'] }, 'avatar.jpg');
    await queue.start();
    expect(peak).toBe(1);
  });

  it('on restart fails the interrupted render and continues the waiting ones', async () => {
    const { renders } = await setupDb();
    await renders.enqueue('o1', 'fp1');
    await renders.enqueue('o2', 'fp2');
    await renders.claimNext(); // o1 was running when the app closed
    const run = jest.fn(async () => result);
    const queue = createRenderQueue({ renders, run });

    await queue.resume();
    await queue.start();

    expect((await renders.forOutfit('o1'))[0]).toMatchObject({
      status: 'failed',
      failure: 'interrupted',
    });
    expect((await renders.forOutfit('o2'))[0].status).toBe('done');
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('try-on provider', () => {
  const input = {
    avatar: { base64: 'AVATAR', mimeType: 'image/jpeg' },
    pieces: [
      {
        slotLabel: 'top',
        description: 'pink crop top',
        image: { base64: 'TOP', mimeType: 'image/png' },
      },
      {
        slotLabel: 'bottom',
        description: 'yellow skirt',
        image: { base64: 'SKIRT', mimeType: 'image/png' },
      },
    ],
    hints: { gender: 'woman', bodyType: 'average' },
  };
  const imageResponse = {
    candidates: [
      {
        content: {
          parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: 'OUT' } }],
        },
      },
    ],
  };
  const respond = (status: number, body: unknown = imageResponse) =>
    jest.fn(async () => ({ status, json: async () => body }));

  it('describes every piece and insists on keeping the person and the pieces unchanged', () => {
    const prompt = tryOnPrompt(input);
    expect(prompt).toContain('Image 2: top (pink crop top)');
    expect(prompt).toContain('Image 3: bottom (yellow skirt)');
    expect(prompt).toContain('average build, woman');
    expect(prompt).toMatch(/face, hair, skin tone, body shape/);
    expect(prompt).toMatch(/Do not add any clothing/);
    expect(tryOnPrompt({ ...input, hints: { gender: null, bodyType: null } })).toContain(
      'image of the person from image 1',
    );
  });

  it('sends the avatar first, then the pieces, with the key in a header', async () => {
    const fetchMock = respond(200);
    const provider = createGeminiProvider(fetchMock, () => 'test-model');

    expect(await provider.render(input, 'secret-key')).toEqual({
      base64: 'OUT',
      mimeType: 'image/png',
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toContain('/models/test-model:generateContent');
    expect(url).not.toContain('secret-key');
    expect(init.headers['x-goog-api-key']).toBe('secret-key');
    const parts = JSON.parse(init.body).contents[0].parts;
    expect(
      parts.slice(1).map((part: { inlineData: { data: string } }) => part.inlineData.data),
    ).toEqual(['AVATAR', 'TOP', 'SKIRT']);
  });

  const reasonOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error instanceof TryOnError ? error.reason : 'not-mapped';
    }
    return 'no-error';
  };

  it.each([
    // A key was sent and refused: that is not the same as having no key.
    [401, 'rejectedKey'],
    [403, 'rejectedKey'],
    [429, 'rateLimited'],
    [400, 'error'],
    [500, 'error'],
  ])('maps HTTP %i to %s', async (status, reason) => {
    const provider = createGeminiProvider(respond(status, {}), () => 'm');
    expect(await reasonOf(provider.render(input, 'k'))).toBe(reason);
  });

  it('reports an invalid key, which Gemini answers as a bad request, as a rejected key', async () => {
    const invalid = {
      error: {
        code: 400,
        message: 'API key not valid. Please pass a valid API key.',
        details: [{ reason: 'API_KEY_INVALID' }],
      },
    };
    expect(
      await reasonOf(createGeminiProvider(respond(400, invalid), () => 'm').render(input, 'k')),
    ).toBe('rejectedKey');
    // Any other bad request stays a plain error.
    const other = { error: { code: 400, message: 'Unsupported image format' } };
    expect(
      await reasonOf(createGeminiProvider(respond(400, other), () => 'm').render(input, 'k')),
    ).toBe('error');
    expect(isInvalidKey({ error: { message: 'Unsupported image format' } })).toBe(false);
    expect(isInvalidKey(null)).toBe(false);
  });

  it('reports a declined request when the answer has no image', async () => {
    const blocked = { promptFeedback: { blockReason: 'SAFETY' }, candidates: [] };
    expect(
      await reasonOf(createGeminiProvider(respond(200, blocked), () => 'm').render(input, 'k')),
    ).toBe('declined');
    expect(() => readGeminiImage({ candidates: [{ finishReason: 'IMAGE_SAFETY' }] })).toThrow(
      TryOnError,
    );
    expect(() => readGeminiImage(null)).toThrow(TryOnError);
  });

  it('says the picture may have been charged when the connection drops mid-request', async () => {
    // The request was under way for ten seconds before it failed: it had been sent.
    const clock = jest.spyOn(Date, 'now');
    clock.mockReturnValueOnce(1_000).mockReturnValueOnce(11_000);
    const dropped = jest.fn(async () => {
      throw new Error('network connection lost');
    });
    expect(await reasonOf(createGeminiProvider(dropped, () => 'm').render(input, 'k'))).toBe(
      'connectionLost',
    );
    clock.mockRestore();
  });

  it('sends the pieces smaller when an outfit has too many for one request', async () => {
    // Each piece weighs its size in characters, so the total depends on the size tried.
    const encodeAt = jest.fn(async (_entry: string, max: number) => ({
      base64: 'x'.repeat(max),
      mimeType: 'image/png',
    }));
    const few = await encodeWithinBudget(['a', 'b'], encodeAt, 3000);
    expect(few.map((image) => image.base64.length)).toEqual([1024, 1024]);

    encodeAt.mockClear();
    const many = await encodeWithinBudget(['a', 'b', 'c', 'd'], encodeAt, 3200);
    expect(many.map((image) => image.base64.length)).toEqual([768, 768, 768, 768]);
    // All pieces are tried at one size before the next, so they stay the same size.
    expect(encodeAt.mock.calls.map((call) => call[1])).toEqual([
      1024, 1024, 1024, 1024, 768, 768, 768, 768,
    ]);

    // Nothing fits: the smallest size is sent, since there is nothing smaller to try.
    const huge = await encodeWithinBudget(['a', 'b'], encodeAt, 10);
    expect(huge.map((image) => image.base64.length)).toEqual([512, 512]);
    expect(PIECES_BUDGET).toBeLessThan(20_000_000);
  });

  it('reports no connection and a timeout separately', async () => {
    const offline = jest.fn(async () => {
      throw new Error('network');
    });
    expect(await reasonOf(createGeminiProvider(offline, () => 'm').render(input, 'k'))).toBe(
      'offline',
    );

    const hanging = jest.fn(
      (_url: string, init: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) =>
          init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    expect(await reasonOf(createGeminiProvider(hanging, () => 'm', 20).render(input, 'k'))).toBe(
      'timeout',
    );
  });

  it('asks for a studio avatar from the photo alone', async () => {
    const fetchMock = respond(200);
    const provider = createGeminiProvider(fetchMock, () => 'm');
    await provider.studioAvatar(input.avatar, input.hints, 'k');
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    );
    expect(body.contents[0].parts).toHaveLength(2);
    expect(body.contents[0].parts[0].text).toMatch(/studio version/);
  });
});
