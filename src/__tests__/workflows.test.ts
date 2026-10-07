/**
 * Whole user journeys across features, on a real (in-memory) database with the
 * real repositories and rules. Each test follows one thing a person does with
 * the app from start to finish and checks what every affected part shows.
 */
import { drizzle } from 'drizzle-orm/sql-js';
import initSqlJs from 'sql.js';

import { createItemRepository } from '@/closet/repository';
import type { Category } from '@/closet/taxonomy';
import type { Item, ItemDetails } from '@/closet/types';
import type { Db } from '@/db/client';
import { LATEST_SCHEMA_VERSION } from '@/db/migrations';
import { schema } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { createLookbookRepository } from '@/lookbooks/repository';
import type { OutfitPiece } from '@/outfits/draft';
import { RenderFailedError, createRenderQueue } from '@/outfits/renderQueue';
import {
  createRenderRepository,
  createUsageLog,
  fingerprint,
  summariseRenders,
} from '@/outfits/renders';
import { createOutfitRepository, hasWishlistItem } from '@/outfits/repository';
import { FutureWearError, createCalendarRepository } from '@/planning/calendar';
import { addDays, toDay } from '@/planning/dates';
import { dayProfile, isWearable, suggest, type DayProfile } from '@/planning/suggestions';
import { createProfileRepository } from '@/profile/repository';
import { computeStats } from '@/stats/stats';
import {
  DB_FILE,
  finishRestore,
  stageBackupFrom,
  swapInStagedBackup,
  writeBackupArchive,
} from '@/storage/backup';
import { createMemoryFs } from '@/storage/memoryFs';
import { memoryArchive } from '@/storage/zip';
import { createSessionRepository } from '@/stylist/sessions';
import { validateProposals } from '@/stylist/stylist';
import { generateTrip } from '@/trips/actions';
import { packingList } from '@/trips/plan';
import { addTripToCalendar, createTripRepository } from '@/trips/repository';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('expo-secure-store', () => ({}));
jest.mock('@/db/settings', () => ({ getSetting: () => null, setSetting: () => {} }));

const DAY_MS = 24 * 60 * 60 * 1000;

/** A closet on a fresh database, with a clock the test can move. */
async function openApp() {
  const { db, sqlite, query } = await createTestDb();
  const clock = { now: new Date(2026, 9, 6, 12).getTime() };
  const now = () => clock.now++;
  const today = () => toDay(new Date(clock.now));
  const app = {
    db,
    sqlite,
    query,
    clock,
    today,
    profile: createProfileRepository(() => db, now),
    items: createItemRepository(() => db, now),
    outfits: createOutfitRepository(() => db, now),
    renders: createRenderRepository(() => db, now),
    usage: createUsageLog(() => db, now),
    calendar: createCalendarRepository(() => db, now, today),
    lookbooks: createLookbookRepository(() => db, now),
    trips: createTripRepository(() => db, now),
    sessions: createSessionRepository(() => db, now),
  };
  let photo = 0;
  const add = (
    name: string,
    category: Category,
    patch: Partial<ItemDetails> = {},
    ownership: 'owned' | 'wishlist' = 'owned',
  ) => {
    photo++;
    return app.items.create(
      {
        name,
        category,
        subcategory: null,
        colours: ['black'],
        seasons: [],
        occasions: [],
        warmth: 3,
        brand: null,
        size: null,
        price: null,
        currency: null,
        purchasedAt: null,
        notes: null,
        sourceUrl: null,
        ...patch,
      },
      {
        originalPath: `images/items/${photo}.jpg`,
        cutoutPath: `images/items/${photo}-cut.png`,
        thumbPath: `images/items/${photo}-thumb.png`,
      },
      { ownership },
    );
  };
  const pieces = (...items: Item[]): OutfitPiece[] => {
    const slot = { tops: 'top', bottoms: 'bottom', shoes: 'shoes', outerwear: 'outer' } as const;
    return items.map((item) => ({
      itemId: item.id,
      slot:
        item.category === 'dresses'
          ? 'fullBody'
          : (slot[item.category as keyof typeof slot] ?? 'accessory'),
      position: 0,
    }));
  };
  return { ...app, add, pieces };
}

const mild: DayProfile = {
  band: 3,
  needsOuter: false,
  rain: false,
  season: 'autumn',
  source: 'forecast',
  temperature: 14,
};

describe('first week with the app', () => {
  it('goes from an empty phone to a worn outfit with statistics', async () => {
    const app = await openApp();

    // Onboarding.
    expect(await app.profile.get()).toBeNull();
    await app.profile.save({
      name: 'Auri',
      gender: 'woman',
      bodyType: 'average',
      avatarPath: 'images/avatar/me.jpg',
      avatarSmallPath: 'images/avatar/me-small.jpg',
    });
    await app.profile.save({ heightCm: 168 });
    const profile = (await app.profile.get())!;
    expect(profile).toMatchObject({ name: 'Auri', heightCm: 168, gender: 'woman' });
    expect(app.query('SELECT count(*) AS n FROM profiles')[0].n).toBe(1);

    // The closet fills up.
    const tee = await app.add('White tee', 'tops', {
      price: 400,
      currency: 'CZK',
      colours: ['white'],
    });
    const shirt = await app.add('Blue shirt', 'tops', { colours: ['blue'], occasions: ['work'] });
    const jeans = await app.add('Jeans', 'bottoms', {
      price: 1600,
      currency: 'CZK',
      colours: ['blue'],
    });
    const boots = await app.add('Boots', 'shoes', { price: 2400, currency: 'CZK' });
    await app.add('Scarf', 'accessories');
    expect(await app.items.count()).toBe(5);
    expect(await app.items.count({ category: 'tops' })).toBe(2);
    expect((await app.items.list({ colours: ['blue'] })).map((item) => item.name).sort()).toEqual([
      'Blue shirt',
      'Jeans',
    ]);

    // An outfit is built and rendered once.
    const casual = await app.outfits.create(app.pieces(tee, jeans, boots), { name: 'Casual' });
    const calls: string[] = [];
    const queue = createRenderQueue({
      renders: app.renders,
      run: async (render) => {
        calls.push(render.outfitId);
        await app.usage.record('render');
        return {
          imagePath: `images/renders/${calls.length}.png`,
          thumbPath: 't.jpg',
          provider: 'gemini',
        };
      },
    });
    const base = profile.avatarSmallPath;
    const ids = (outfit: { entries: { item: Item }[] }) =>
      outfit.entries.map((entry) => entry.item.id);
    expect((await queue.request({ id: casual.id, itemIds: ids(casual) }, base)).kind).toBe(
      'queued',
    );
    await queue.start();
    // Opening the outfit again asks for the same picture: nothing is paid for twice.
    expect((await queue.request({ id: casual.id, itemIds: ids(casual) }, base)).kind).toBe(
      'reused',
    );
    await queue.start();
    expect(calls).toEqual([casual.id]);
    expect(await app.usage.counts('render')).toEqual({ month: 1, total: 1 });
    const print = fingerprint(base!, ids(casual));
    expect(summariseRenders(await app.renders.forOutfit(casual.id), print)).toMatchObject({
      current: { imagePath: 'images/renders/1.png' },
      pending: null,
    });

    // Swapping the top drops the picture, and a duplicate of the original reuses it.
    const edited = (await app.outfits.setPieces(casual.id, app.pieces(shirt, jeans, boots)))!;
    const newPrint = fingerprint(base!, ids(edited));
    expect(summariseRenders(await app.renders.forOutfit(casual.id), newPrint).current).toBeNull();
    const copy = await app.outfits.create(app.pieces(tee, jeans, boots), { name: 'Casual again' });
    expect((await queue.request({ id: copy.id, itemIds: ids(copy) }, base)).kind).toBe('reused');
    expect(calls).toHaveLength(1);

    // Planning and wearing.
    const today = app.today();
    await app.calendar.plan(addDays(today, 1), casual.id);
    await expect(app.calendar.logWorn(addDays(today, 1), casual.id)).rejects.toBeInstanceOf(
      FutureWearError,
    );
    await app.calendar.logWorn(addDays(today, -1), copy.id);
    const planned = await app.calendar.plan(today, casual.id);
    expect(await app.calendar.streak()).toBe(1);
    await app.calendar.markWorn(planned.id);
    expect(await app.calendar.streak()).toBe(2);

    expect(await app.calendar.itemStats(jeans.id)).toEqual({ count: 2, lastWorn: today });
    expect(await app.calendar.itemStats(tee.id)).toEqual({
      count: 1,
      lastWorn: addDays(today, -1),
    });
    expect((await app.calendar.outfitStats(casual.id)).count).toBe(1);

    // Statistics see all of it.
    const stats = computeStats({
      items: await app.items.list({}),
      wears: await app.calendar.wearLog(),
      period: '30d',
      today,
    });
    expect(stats.itemCount).toBe(5);
    expect(stats.value).toEqual([{ currency: 'CZK', total: 4400 }]);
    expect(
      stats.mostWorn
        .slice(0, 2)
        .map((entry) => entry.item.name)
        .sort(),
    ).toEqual(['Boots', 'Jeans']);
    expect(stats.neverWorn.map((item) => item.name)).toEqual(['Scarf']);
    expect(stats.usageShare).toBe(0.8);
    expect(stats.costPerWear.map((entry) => [entry.item.name, entry.cost])).toEqual([
      ['White tee', 400],
      ['Jeans', 800],
      ['Boots', 1200],
    ]);
    expect(stats.trend[stats.trend.length - 1].count).toBe(2);

    // Tomorrow's suggestion avoids what was just worn when there is a choice.
    const fresh = await app.outfits.create(app.pieces(shirt, jeans), { name: 'Fresh' });
    const recent = await app.calendar.recentlyWorn(addDays(today, -7));
    const suggestions = suggest({
      day: addDays(today, 1),
      profile: mild,
      outfits: await app.outfits.list(),
      owned: await app.items.list({}),
      history: {
        recentOutfitIds: recent.outfitIds,
        recentItemIds: recent.itemIds,
        wearCounts: await app.calendar.wearCounts([tee.id, shirt.id, jeans.id, boots.id]),
      },
    });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(recent.outfitIds.has(suggestions[0].outfit?.id ?? fresh.id)).toBe(false);
  });
});

describe('from wishlist to closet', () => {
  it('keeps a wished piece apart until it is bought, then treats it like any other', async () => {
    const app = await openApp();
    const jeans = await app.add('Jeans', 'bottoms');
    const tee = await app.add('Tee', 'tops');
    const coat = await app.add(
      'Dream coat',
      'outerwear',
      { price: 5000, currency: 'CZK', sourceUrl: 'https://shop.example/coat' },
      'wishlist',
    );
    await app.add('Dream bag', 'bags', {}, 'wishlist');

    // The closet does not count it; the wishlist does.
    expect(await app.items.count()).toBe(2);
    expect(
      (await app.items.list({ ownership: 'wishlist' })).map((item) => item.name).sort(),
    ).toEqual(['Dream bag', 'Dream coat']);
    expect(await app.items.wishlistTotals()).toEqual({
      count: 2,
      unpriced: 1,
      totals: [{ currency: 'CZK', amount: 5000 }],
    });

    // An outfit can try it out, but cannot be worn or suggested.
    const outfit = await app.outfits.create(app.pieces(tee, jeans, coat), {
      name: 'With the coat',
    });
    expect(hasWishlistItem(outfit)).toBe(true);
    expect(isWearable(outfit)).toBe(false);
    const cold: DayProfile = { ...mild, band: 4, needsOuter: true };
    const owned = await app.items.list({});
    expect(suggest({ day: app.today(), profile: cold, outfits: [outfit], owned })).toEqual([
      // Without an owned coat the day is dressed without one, from owned pieces only.
      expect.objectContaining({ outfit: null }),
    ]);
    const statsBefore = computeStats({
      items: owned,
      wears: [],
      period: 'all',
      today: app.today(),
    });
    expect(statsBefore.itemCount).toBe(2);
    expect(statsBefore.value).toEqual([]);

    // Bought, for less than the listed price.
    const boughtAt = app.clock.now;
    const bought = (await app.items.markBought(coat.id, {
      price: 4200,
      currency: 'CZK',
      purchasedAt: boughtAt,
    }))!;
    expect(bought).toMatchObject({ ownership: 'owned', price: 4200, purchasedAt: boughtAt });
    expect(bought.sourceUrl).toBe('https://shop.example/coat');
    expect(await app.items.wishlistTotals()).toEqual({ count: 1, unpriced: 1, totals: [] });
    expect(await app.items.count()).toBe(3);

    // The same outfit is now wearable, suggested, and counted.
    const after = (await app.outfits.get(outfit.id))!;
    expect(hasWishlistItem(after)).toBe(false);
    expect(isWearable(after)).toBe(true);
    const [first] = suggest({
      day: app.today(),
      profile: cold,
      outfits: [after],
      owned: await app.items.list({}),
    });
    expect(first.outfit?.id).toBe(outfit.id);
    await app.calendar.logWorn(app.today(), outfit.id);
    const stats = computeStats({
      items: await app.items.list({}),
      wears: await app.calendar.wearLog(),
      period: 'all',
      today: app.today(),
    });
    expect(stats.value).toEqual([{ currency: 'CZK', total: 4200 }]);
    expect(stats.costPerWear).toEqual([expect.objectContaining({ cost: 4200, wears: 1 })]);
  });
});

describe('deleting, undoing and cleaning up', () => {
  it('lets everything that used a deleted piece recover on undo', async () => {
    const app = await openApp();
    const tee = await app.add('Tee', 'tops');
    const jeans = await app.add('Jeans', 'bottoms');
    const outfit = await app.outfits.create(app.pieces(tee, jeans), { name: 'Basics' });
    const book = await app.lookbooks.create('Everyday');
    await app.lookbooks.addOutfits(book.id, [outfit.id]);
    await app.calendar.logWorn(app.today(), outfit.id);
    expect(await app.outfits.countUsing([tee.id])).toBe(1);

    await app.items.remove([tee.id]);
    expect(await app.items.count()).toBe(1);
    // The outfit loses the piece but stays; what was worn stays worn.
    expect((await app.outfits.get(outfit.id))!.entries.map((entry) => entry.item.name)).toEqual([
      'Jeans',
    ]);
    expect((await app.calendar.itemStats(tee.id)).count).toBe(1);

    await app.items.restore([tee.id]);
    expect((await app.outfits.get(outfit.id))!.entries).toHaveLength(2);

    // Deleting the outfit takes it out of the lookbook; undo puts it back where it was.
    await app.outfits.remove(outfit.id);
    expect(await app.outfits.list()).toEqual([]);
    expect((await app.lookbooks.list())[0].outfitIds).toEqual([]);
    await app.outfits.restore(outfit.id);
    expect((await app.lookbooks.list())[0].outfitIds).toEqual([outfit.id]);
    expect(await app.lookbooks.containing(outfit.id)).toEqual([book.id]);
  });

  it('clears out what was deleted long ago without touching history that is still shown', async () => {
    const app = await openApp();
    const tee = await app.add('Tee', 'tops');
    const jeans = await app.add('Jeans', 'bottoms');
    const dress = await app.add('Dress', 'dresses');
    const worn = await app.outfits.create(app.pieces(tee, jeans), { name: 'Worn once' });
    const unused = await app.outfits.create(app.pieces(dress), { name: 'Never worn' });
    const onlyDress = await app.outfits.create(app.pieces(dress), { name: 'Only the dress' });
    const book = await app.lookbooks.create('Book');
    await app.lookbooks.addOutfits(book.id, [worn.id, unused.id]);
    const entry = await app.calendar.logWorn(app.today(), worn.id);
    for (const outfit of [worn, unused]) {
      await app.renders.createDone(outfit.id, 'fp', {
        imagePath: `images/renders/${outfit.name}.png`,
        thumbPath: `images/renders/${outfit.name}-t.jpg`,
        provider: 'gemini',
      });
    }

    await app.outfits.remove(worn.id);
    await app.outfits.remove(unused.id);
    await app.items.remove([dress.id]);

    // Two days later the app starts and tidies up.
    app.clock.now += 2 * DAY_MS;
    const cutoff = app.clock.now - DAY_MS;
    const purgedItems = await app.items.purgeDeleted(cutoff);
    expect(purgedItems.map((item) => item.name)).toEqual(['Dress']);
    await app.outfits.forgetItems(purgedItems.map((item) => item.id));
    // An outfit whose only piece is gone for good goes too.
    expect(await app.outfits.get(onlyDress.id)).toBeNull();

    const gone = await app.outfits.purgeDeleted(cutoff);
    // The worn outfit is still in the calendar, so its pieces are kept for the wear history.
    expect(gone).toEqual([unused.id]);
    const files = await app.renders.purge(gone);
    expect(files.sort()).toEqual([
      'images/renders/Never worn-t.jpg',
      'images/renders/Never worn.png',
    ]);
    expect(await app.renders.forOutfit(worn.id)).toHaveLength(1);

    // Removing the worn day and undoing it keeps the wear counts intact.
    await app.calendar.remove(entry.id);
    expect((await app.calendar.itemStats(tee.id)).count).toBe(0);
    await app.calendar.restore(entry.id);
    expect((await app.calendar.itemStats(tee.id)).count).toBe(1);
    expect((await app.calendar.itemStats(jeans.id)).count).toBe(1);

    // Purged for good: undo no longer brings it back, and the lookbook has forgotten it.
    await app.outfits.restore(unused.id);
    expect(await app.outfits.get(unused.id)).toBeNull();
    expect(app.query('SELECT count(*) AS n FROM lookbook_outfits')[0].n).toBe(1);
  });
});

describe('a trip from plan to calendar', () => {
  it('suggests outfits, builds the packing list, and follows changes into the calendar', async () => {
    const app = await openApp();
    const closet = [
      await app.add('Tee', 'tops'),
      await app.add('Shirt', 'tops'),
      await app.add('Polo', 'tops'),
      await app.add('Jeans', 'bottoms'),
      await app.add('Chinos', 'bottoms'),
      await app.add('Trainers', 'shoes'),
      await app.add('Loafers', 'shoes'),
      await app.add('Sandals', 'shoes'),
    ];
    const today = app.today();
    const start = addDays(today, 3);
    const trip = await app.trips.create({
      name: 'Rome',
      place: { name: 'Rome, Italy', latitude: 41.9, longitude: 12.5 },
      startDay: start,
      endDay: addDays(start, 3),
    });
    const weather = trip.days.map((day) => ({
      day: day.day,
      typical: false,
      weather: {
        day: day.day,
        feelsMin: 12,
        feelsMax: 18,
        precipitationChance: 0,
        precipitation: 0,
        wind: 5,
        code: 1,
      },
    }));
    expect(dayProfile(trip.days[0].day, weather[0].weather).band).toBe(3);

    await generateTrip(trip, closet, weather, app.trips);
    let planned = (await app.trips.get(trip.id))!;
    expect(planned.days.every((day) => day.pieces.length >= 3)).toBe(true);

    // One suitcase: every piece once, at most two pairs of shoes for four days.
    const list = packingList(planned.days, closet);
    const packedIds = list.flatMap((group) => group.entries.map((entry) => entry.item.id));
    expect(new Set(packedIds).size).toBe(packedIds.length);
    const shoes = list.find((group) => group.category === 'shoes')!;
    expect(shoes.entries.length).toBeLessThanOrEqual(2);
    expect(shoes.entries.flatMap((entry) => entry.days).length).toBe(4);

    // Ticking, extras and free text survive a reload.
    await app.trips.setItemPacked(trip.id, packedIds[0], true);
    await app.trips.addItem(trip.id, closet[7].id);
    await app.trips.addText(trip.id, 'Passport');
    planned = (await app.trips.get(trip.id))!;
    expect(planned.packing.map((entry) => entry.kind).sort()).toEqual(['extra', 'item', 'text']);
    const withExtra = packingList(
      planned.days,
      closet,
      planned.packing.filter((entry) => entry.kind === 'extra').map((entry) => entry.key),
    );
    expect(withExtra.flatMap((group) => group.entries.map((entry) => entry.item.name))).toContain(
      'Sandals',
    );

    // Into the calendar: one saved outfit and one planned entry per day, once.
    const deps = {
      createOutfit: (list_: OutfitPiece[], name: string) => app.outfits.create(list_, { name }),
      outfitExists: async (id: string) => (await app.outfits.get(id)) !== null,
      plan: (day: string, outfitId: string) => app.calendar.plan(day, outfitId),
      setDay: app.trips.setDay,
      today,
      nameFor: (day: string) => `Rome ${day}`,
    };
    expect(await addTripToCalendar(planned, deps)).toBe(4);
    planned = (await app.trips.get(trip.id))!;
    expect(await addTripToCalendar(planned, deps)).toBe(0);
    const entries = await app.calendar.range(start, addDays(start, 3));
    expect(entries.map((entry) => entry.state)).toEqual([
      'planned',
      'planned',
      'planned',
      'planned',
    ]);
    expect(await app.outfits.list()).toHaveLength(4);

    // Changing a day changes the outfit that is already in the calendar.
    const second = planned.days[1];
    const swapped = app.pieces(closet[2], closet[4]);
    await app.trips.setDay(trip.id, second.day, { pieces: swapped });
    const linked = (await app.outfits.get(second.outfitId!))!;
    expect(linked.entries.map((entry) => entry.item.name).sort()).toEqual(['Chinos', 'Polo']);
    expect(await app.calendar.range(start, addDays(start, 3))).toHaveLength(4);

    // On the trip: the first day arrives and is worn.
    app.clock.now += 3 * DAY_MS;
    await app.calendar.markWorn(entries[0].id);
    const firstIds = planned.days[0].pieces.map((piece) => piece.itemId);
    for (const id of firstIds) expect((await app.calendar.itemStats(id)).count).toBe(1);
    // A day that is over keeps the outfit it was worn with, whatever the trip says later.
    await app.trips.setDay(trip.id, planned.days[0].day, { pieces: swapped });
    app.clock.now += DAY_MS;
    await app.trips.setDay(trip.id, planned.days[0].day, {
      pieces: app.pieces(closet[0], closet[3]),
    });
    const firstOutfit = (await app.outfits.get(planned.days[0].outfitId!))!;
    expect(firstOutfit.entries.map((entry) => entry.item.id).sort()).toEqual(
      swapped.map((piece) => piece.itemId).sort(),
    );

    // Deleting the trip keeps what is in the calendar.
    await app.trips.remove(trip.id);
    expect(await app.trips.list(app.today())).toEqual([]);
    expect(await app.outfits.list()).toHaveLength(4);
    expect(await app.calendar.range(start, addDays(start, 3))).toHaveLength(4);
  });
});

describe('asking the stylist', () => {
  it('turns a valid answer into a saved, planned outfit that is remembered with the session', async () => {
    const app = await openApp();
    const tee = await app.add('Tee', 'tops');
    const jeans = await app.add('Jeans', 'bottoms');
    const boots = await app.add('Boots', 'shoes');
    const wished = await app.add('Wished top', 'tops', {}, 'wishlist');
    const everything = [...(await app.items.list({})), wished];

    // The model answers with one good outfit, one invented piece and one wishlist piece.
    const proposals = validateProposals(
      [
        { itemIds: [tee.id, jeans.id, boots.id], rationale: 'Easy.' },
        { itemIds: [tee.id, 'made-up'], rationale: 'Invented.' },
        { itemIds: [wished.id, jeans.id], rationale: 'Not yours yet.' },
      ],
      everything,
    );
    expect(proposals.map((proposal) => proposal.rationale)).toEqual(['Easy.']);
    await app.usage.record('stylist');

    const day = addDays(app.today(), 2);
    const session = await app.sessions.start({ request: 'Dinner', day, itemId: null, proposals });
    const outfit = await app.outfits.create(proposals[0].pieces);
    await app.sessions.markProposal(session.id, 0, 0, { outfitId: outfit.id });
    await app.calendar.plan(day, outfit.id);
    await app.sessions.markProposal(session.id, 0, 0, { planned: true });

    // A refinement adds a turn and leaves the first one as it was.
    await app.sessions.addTurn(session.id, { request: 'Warmer', proposals: [] });
    const reopened = (await app.sessions.get(session.id))!;
    expect(reopened.turns.map((turn) => turn.request)).toEqual(['Dinner', 'Warmer']);
    expect(reopened.turns[0].proposals[0]).toMatchObject({ outfitId: outfit.id, planned: true });
    expect((await app.calendar.range(day, day)).map((entry) => entry.outfitId)).toEqual([
      outfit.id,
    ]);
    expect((await app.outfits.get(outfit.id))!.entries.map((entry) => entry.slot)).toEqual([
      'top',
      'bottom',
      'shoes',
    ]);
    expect(await app.usage.counts('stylist')).toEqual({ month: 1, total: 1 });
    expect(await app.usage.counts('render')).toEqual({ month: 0, total: 0 });
  });
});

describe('a failed render', () => {
  it('costs nothing, stays failed until asked again, and then succeeds', async () => {
    const app = await openApp();
    const tee = await app.add('Tee', 'tops');
    const jeans = await app.add('Jeans', 'bottoms');
    const outfit = await app.outfits.create(app.pieces(tee, jeans));
    let online = false;
    let attempts = 0;
    const queue = createRenderQueue({
      renders: app.renders,
      run: async () => {
        attempts++;
        if (!online) throw new RenderFailedError('offline');
        await app.usage.record('render');
        return { imagePath: 'r.png', thumbPath: 'r-t.jpg', provider: 'gemini' };
      },
    });
    const request = { id: outfit.id, itemIds: [tee.id, jeans.id] };
    const print = fingerprint('avatar.jpg', request.itemIds);

    await queue.request(request, 'avatar.jpg');
    await queue.start();
    let summary = summariseRenders(await app.renders.forOutfit(outfit.id), print);
    expect(summary.failed?.failure).toBe('offline');
    expect(summary.current).toBeNull();
    expect(await app.usage.counts('render')).toEqual({ month: 0, total: 0 });

    // Restarting the app does not retry by itself: every attempt could cost money.
    await queue.resume();
    await queue.start();
    expect(attempts).toBe(1);

    online = true;
    await queue.request(request, 'avatar.jpg', true);
    await queue.start();
    summary = summariseRenders(await app.renders.forOutfit(outfit.id), print);
    expect(summary).toMatchObject({ failed: null, current: { imagePath: 'r.png' } });
    expect(attempts).toBe(2);
    expect(await app.usage.counts('render')).toEqual({ month: 1, total: 1 });
    // Without an avatar nothing is requested at all.
    expect(await queue.request(request, null)).toEqual({ kind: 'skipped', reason: 'noAvatar' });
  });
});

describe('moving to a new phone', () => {
  it('carries the whole closet through a backup and a restore', async () => {
    const app = await openApp();
    await app.profile.save({ name: 'Auri', avatarPath: 'images/avatar/me.jpg' });
    const tee = await app.add('Tee', 'tops', { price: 400, currency: 'CZK' });
    const jeans = await app.add('Jeans', 'bottoms');
    await app.add('Wish', 'tops', {}, 'wishlist');
    const outfit = await app.outfits.create(app.pieces(tee, jeans), {
      name: 'Basics',
      favourite: true,
    });
    const book = await app.lookbooks.create('Everyday');
    await app.lookbooks.addOutfits(book.id, [outfit.id]);
    await app.calendar.logWorn(app.today(), outfit.id);
    await app.renders.createDone(outfit.id, 'fp', {
      imagePath: 'images/renders/r.png',
      thumbPath: 'images/renders/r-t.jpg',
      provider: 'gemini',
    });
    await app.usage.record('render');
    const trip = await app.trips.create({
      name: 'Rome',
      place: { name: 'Rome', latitude: 41.9, longitude: 12.5 },
      startDay: addDays(app.today(), 5),
      endDay: addDays(app.today(), 6),
    });
    await app.sessions.start({ request: 'Dinner', day: null, itemId: null, proposals: [] });

    // The old phone: database file and photos on disk.
    const photo = Buffer.from('photo').toString('base64');
    const oldPhone = createMemoryFs({
      [DB_FILE]: Buffer.from(app.sqlite.export()).toString('base64'),
      'images/avatar/me.jpg': photo,
      'images/items/1.jpg': photo,
      'images/renders/r.png': photo,
    });
    const archive = memoryArchive();
    await writeBackupArchive(
      oldPhone.fs,
      { schemaVersion: LATEST_SCHEMA_VERSION, appVersion: '0.1.0' },
      archive.writer,
    );

    // The new phone has a fresh install with someone else's test item.
    const newPhone = createMemoryFs({
      [DB_FILE]: Buffer.from('SQLite format 3\u0000empty').toString('base64'),
      'images/items/stale.jpg': photo,
    });
    await stageBackupFrom(newPhone.fs, archive.reader(), LATEST_SCHEMA_VERSION);
    await swapInStagedBackup(newPhone.fs);
    await finishRestore(newPhone.fs);
    expect([...newPhone.files.keys()].sort()).toEqual([...oldPhone.files.keys()].sort());

    const SQL = await initSqlJs();
    const restored = drizzle(
      new SQL.Database(Buffer.from(newPhone.files.get(DB_FILE)!, 'base64')),
      { schema },
    ) as unknown as Db;
    const there = {
      profile: createProfileRepository(() => restored),
      items: createItemRepository(() => restored),
      outfits: createOutfitRepository(() => restored),
      lookbooks: createLookbookRepository(() => restored),
      calendar: createCalendarRepository(() => restored, undefined, app.today),
      renders: createRenderRepository(() => restored),
      usage: createUsageLog(
        () => restored,
        () => app.clock.now,
      ),
      trips: createTripRepository(() => restored),
      sessions: createSessionRepository(() => restored),
    };
    expect((await there.profile.get())?.name).toBe('Auri');
    expect((await there.items.list({})).map((item) => item.name).sort()).toEqual(['Jeans', 'Tee']);
    expect(await there.items.wishlistTotals()).toMatchObject({ count: 1 });
    const [restoredOutfit] = await there.outfits.list();
    expect(restoredOutfit).toMatchObject({ id: outfit.id, name: 'Basics', favourite: true });
    expect(restoredOutfit.entries.map((entry) => entry.item.id).sort()).toEqual(
      [tee.id, jeans.id].sort(),
    );
    expect((await there.lookbooks.list())[0]).toMatchObject({
      name: 'Everyday',
      outfitIds: [outfit.id],
    });
    expect(await there.calendar.streak()).toBe(1);
    expect(await there.calendar.itemStats(tee.id)).toEqual({ count: 1, lastWorn: app.today() });
    expect((await there.renders.forOutfit(outfit.id))[0].imagePath).toBe('images/renders/r.png');
    expect((await there.usage.counts('render')).total).toBe(1);
    expect((await there.trips.get(trip.id))?.days).toHaveLength(2);
    expect((await there.sessions.list())[0].request).toBe('Dinner');
  });
});
