import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { AiUnavailableError } from '@/ai/client';
import DisplayScreen from '@/app/display';
import StatsScreen from '@/app/stats';
import StylistScreen from '@/app/stylist';
import TripsScreen from '@/app/trips/index';
import TripScreen from '@/app/trips/[id]';
import { useClosetTab } from '@/closet/closetTab';
import type { Category } from '@/closet/taxonomy';
import type { Item } from '@/closet/types';
import { DisplaySettings } from '@/display/DisplaySettings';
import type { Outfit } from '@/outfits/repository';
import { addDays, today } from '@/planning/dates';
import { CostPerWear } from '@/stats/CostPerWear';
import type { Trip } from '@/trips/repository';

import type { StylistSession } from '../sessions';
import type { Proposal, StylistRequest } from '../stylist';
import { StylistUsage } from '../StylistUsage';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ regionCode: 'CZ' }] }));
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View {...props} /> };
});
jest.mock('@/storage/imageStore', () => ({
  imageStore: { uri: (path: string) => `file:///documents/${path}` },
}));

const mockRouter = { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

const mockSettings = new Map<string, string>();
jest.mock('@/db/settings', () => ({
  getSetting: (key: string) => mockSettings.get(key) ?? null,
  setSetting: (key: string, value: string | null) =>
    void (value === null ? mockSettings.delete(key) : mockSettings.set(key, value)),
}));
jest.mock('@/display/settings', () => {
  const actual = jest.requireActual('@/display/settings');
  // Dimming at once, so the tap that wakes the display can be tested without waiting a minute.
  return { ...actual, DISPLAY_RULES: { ...actual.DISPLAY_RULES, dimAfterMs: 0 } };
});

let mockHasKey = true;
jest.mock('@/ai/useKeyInfo', () => ({ useKeyInfo: () => ({ data: { hasKey: mockHasKey } }) }));
jest.mock('@/ai/KeyNeededPrompt', () => {
  const { Text } = require('react-native');
  return { KeyNeededPrompt: () => <Text testID="key-needed">key needed</Text> };
});

const item = (id: string, category: Category, patch: Partial<Item> = {}): Item => ({
  id,
  createdAt: 1,
  name: id,
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
  ownership: 'owned',
  originalPath: `${id}.jpg`,
  cutoutPath: null,
  thumbPath: `${id}-thumb.jpg`,
  needsReview: false,
  ...patch,
});
const closet = [
  item('tee', 'tops', { price: 400, currency: 'CZK' }),
  item('shirt', 'tops'),
  item('jeans', 'bottoms', { price: 1600, currency: 'CZK' }),
  item('chinos', 'bottoms'),
  item('boots', 'shoes'),
];
const mockWished = item('wish', 'tops', { ownership: 'wishlist' });
let mockOwned: Item[] = closet;
jest.mock('@/closet/useItems', () => ({
  useItems: () => ({ data: mockOwned, isPending: false }),
  useItem: (id?: string) => ({
    data: id ? ([...mockOwned, mockWished].find((entry) => entry.id === id) ?? null) : undefined,
  }),
  useItemsById: (ids: string[]) => ({
    data: [mockWished].filter((entry) => ids.includes(entry.id)),
  }),
}));
jest.mock('@/closet/repository', () => ({ itemRepository: { list: async () => mockOwned } }));
jest.mock('@/profile/useProfile', () => ({
  useProfile: () => ({ data: { name: 'Auri', gender: 'woman', bodyType: null } }),
}));

const outfit = (id: string, name: string | null, ids: string[]): Outfit => ({
  id,
  createdAt: 1,
  name,
  notes: null,
  favourite: false,
  seasons: [],
  occasions: [],
  entries: ids.map((entry) => ({
    item: closet.find((candidate) => candidate.id === entry)!,
    slot: 'top',
    position: 0,
  })),
});
let mockOutfits: Outfit[] = [];
/** Saved outfits that were deleted afterwards. */
let mockDeletedOutfits: string[] = [];
const mockOutfitRepo = {
  create: jest.fn(async (..._args: unknown[]) => ({ id: 'saved-outfit' })),
};
jest.mock('@/outfits/repository', () => ({
  outfitRepository: {
    create: (...args: unknown[]) => mockOutfitRepo.create(...args),
    get: async (id: string) => (mockDeletedOutfits.includes(id) ? null : { id }),
  },
}));
jest.mock('@/outfits/useOutfits', () => ({
  useOutfits: () => ({ data: mockOutfits }),
  useInvalidateOutfits: () => async () => {},
  useRenderSummary: () => () => ({ current: null }),
}));
const mockUsage = {
  record: jest.fn(async (..._args: unknown[]) => {}),
  counts: jest.fn(async (..._args: unknown[]) => ({ month: 2, total: 7 })),
};
jest.mock('@/outfits/renders', () => ({
  usageLog: {
    record: (...args: unknown[]) => mockUsage.record(...args),
    counts: (...args: unknown[]) => mockUsage.counts(...args),
  },
}));

const mockCalendar = {
  plan: jest.fn(async (..._args: unknown[]) => ({})),
  wearCounts: jest.fn(async (..._args: unknown[]) => new Map<string, number>()),
  wearLog: jest.fn(async (): Promise<{ itemId: string; day: string }[]> => []),
};
jest.mock('@/planning/calendar', () => ({
  calendarRepository: {
    plan: (...args: unknown[]) => mockCalendar.plan(...args),
    wearCounts: (...args: unknown[]) => mockCalendar.wearCounts(...args),
    wearLog: () => mockCalendar.wearLog(),
  },
}));
jest.mock('@/planning/settings', () => ({
  getTemperatureUnit: () => 'celsius',
  getChosenCity: () => null,
}));
let mockToday: { outfitId: string }[] = [];
let mockSuggested: Item[] = [];
let mockWearStats = { count: 0, lastWorn: null as string | null };
jest.mock('@/planning/usePlanning', () => ({
  useWeather: () => ({
    data: {
      status: 'fresh',
      weather: {
        place: { name: 'Brno', latitude: 49, longitude: 16 },
        current: { temperature: 12.4, feelsLike: 11, code: 61 },
        days: [],
      },
    },
  }),
  weatherFor: () => null,
  useInvalidatePlanning: () => async () => {},
  useCalendar: (day: string) => ({ data: new Map([[day, mockToday]]) }),
  useSuggestions: () => ({ suggestions: mockSuggested.length ? [{ items: mockSuggested }] : [] }),
  useWearStats: () => ({ data: mockWearStats }),
}));
const mockSearch = jest.fn(async (..._args: unknown[]) => [
  { name: 'Rome, Lazio, Italy', latitude: 41.9, longitude: 12.5 },
]);
jest.mock('@/planning/weather', () => ({
  ...jest.requireActual('@/planning/weather'),
  searchPlaces: (...args: unknown[]) => mockSearch(...args),
}));

const mockPropose = jest.fn(async (_request: StylistRequest): Promise<Proposal[]> => []);
jest.mock('../stylist', () => ({
  ...jest.requireActual('../stylist'),
  proposeOutfits: async (request: StylistRequest) => {
    const proposals = await mockPropose(request);
    // As the real function does once the provider has answered.
    await request.onAnswered?.();
    return proposals;
  },
}));
let mockSessions: StylistSession[] = [];
jest.mock('../sessions', () => ({
  isDisclosed: () => mockSettings.get('stylist.disclosed') === '1',
  setDisclosed: () => void mockSettings.set('stylist.disclosed', '1'),
  sessionRepository: {
    list: async () => [...mockSessions].reverse(),
    start: async (input: {
      request: string;
      day: string | null;
      itemId: string | null;
      proposals: Proposal[];
    }) => {
      const session: StylistSession = {
        id: `s${mockSessions.length + 1}`,
        createdAt: 1,
        request: input.request,
        day: input.day,
        itemId: input.itemId,
        turns: [{ request: input.request, proposals: input.proposals }],
      };
      mockSessions = [...mockSessions, session];
      return session;
    },
    addTurn: async (id: string, turn: { request: string; proposals: Proposal[] }) => {
      mockSessions = mockSessions.map((session) =>
        session.id === id ? { ...session, turns: [...session.turns, turn] } : session,
      );
    },
    markProposal: async (id: string, turn: number, index: number, patch: Partial<Proposal>) => {
      mockSessions = mockSessions.map((session) =>
        session.id !== id
          ? session
          : {
              ...session,
              turns: session.turns.map((entry, turnIndex) =>
                turnIndex !== turn
                  ? entry
                  : {
                      ...entry,
                      proposals: entry.proposals.map((proposal, proposalIndex) =>
                        proposalIndex === index ? { ...proposal, ...patch } : proposal,
                      ),
                    },
              ),
            },
      );
    },
    remove: async (id: string) => {
      mockSessions = mockSessions.filter((session) => session.id !== id);
    },
    restore: async () => {},
  },
}));

let mockTrip: Trip | null = null;
const mockTrips = {
  create: jest.fn(async (input: { name: string; startDay: string; endDay: string }) => {
    mockTrip = {
      id: 'trip-1',
      name: input.name,
      place: { name: 'Rome, Lazio, Italy', latitude: 41.9, longitude: 12.5 },
      startDay: input.startDay,
      endDay: input.endDay,
      days: [{ day: input.startDay, activity: null, pieces: [], outfitId: null }],
      packing: [],
    };
    return mockTrip;
  }),
};
jest.mock('@/trips/repository', () => ({
  ...jest.requireActual('@/trips/repository'),
  tripRepository: {
    list: async () => (mockTrip ? [mockTrip] : []),
    get: async () => (mockTrip ? { ...mockTrip } : null),
    create: (input: { name: string; startDay: string; endDay: string }) => mockTrips.create(input),
    setDay: async (
      _id: string,
      day: string,
      patch: { pieces?: Trip['days'][number]['pieces']; activity?: null },
    ) => {
      mockTrip = {
        ...mockTrip!,
        days: mockTrip!.days.map((entry) => (entry.day === day ? { ...entry, ...patch } : entry)),
      };
    },
    setItemPacked: async (_id: string, key: string, packed: boolean) => {
      mockTrip = {
        ...mockTrip!,
        packing: [
          ...mockTrip!.packing.filter((entry) => entry.key !== key),
          { key, kind: 'item', label: null, packed },
        ],
      };
    },
    addText: async (_id: string, label: string) => {
      mockTrip = {
        ...mockTrip!,
        packing: [...mockTrip!.packing, { key: 'text-1', kind: 'text', label, packed: false }],
      };
    },
    setTextPacked: async () => {},
    addItem: async () => {},
    removeEntry: async () => {},
    remove: async () => {},
    restore: async () => {},
  },
}));
jest.mock('@/trips/forecast', () => ({
  tripWeather: async (_place: unknown, days: string[]) =>
    days.map((day) => ({
      day,
      typical: true,
      weather: {
        day,
        feelsMin: 9,
        feelsMax: 15,
        precipitationChance: 0,
        precipitation: 0,
        wind: 5,
        code: 1,
      },
    })),
}));

const renderWithQuery = (ui: ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}
    >
      {ui}
    </QueryClientProvider>,
  );
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

const proposal = (ids: string[], rationale: string): Proposal => ({
  rationale,
  pieces: ids.map((itemId) => ({
    itemId,
    slot:
      itemId === 'jeans' || itemId === 'chinos' ? 'bottom' : itemId === 'boots' ? 'shoes' : 'top',
    position: 0,
  })),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.clear();
  mockSettings.set('stylist.disclosed', '1');
  mockParams = {};
  mockHasKey = true;
  mockOwned = closet;
  mockOutfits = [];
  mockDeletedOutfits = [];
  mockSessions = [];
  mockToday = [];
  mockSuggested = [];
  mockWearStats = { count: 0, lastWorn: null };
  mockTrip = null;
  mockCalendar.wearLog.mockResolvedValue([]);
  mockPropose.mockResolvedValue([proposal(['tee', 'jeans', 'boots'], 'Easy and smart.')]);
  useClosetTab.setState({ tab: 'closet', category: null });
});

describe('stylist', () => {
  it('asks for a key when there is none', () => {
    mockHasKey = false;
    renderWithQuery(<StylistScreen />);
    expect(screen.getByTestId('key-needed')).toBeTruthy();
    expect(screen.queryByTestId('stylist-request')).toBeNull();
  });

  it('explains once what is sent before the first request', () => {
    mockSettings.clear();
    renderWithQuery(<StylistScreen />);
    expect(screen.getByTestId('stylist-disclosure')).toHaveTextContent(/No photos are sent/);
    fireEvent.press(screen.getByTestId('stylist-disclosure-accept'));
    expect(screen.getByTestId('stylist-request')).toBeTruthy();
    expect(mockSettings.get('stylist.disclosed')).toBe('1');
  });

  it('sends a request for a chosen day and shows the proposals with their reasons', async () => {
    renderWithQuery(<StylistScreen />);
    expect(screen.getByTestId('stylist-ask')).toBeDisabled();
    fireEvent.press(screen.getByTestId('stylist-prompt-dinner'));
    expect(screen.getByTestId('stylist-request').props.value).toBe('Dinner with friends');
    fireEvent.press(screen.getByTestId(`stylist-day-${today()}`));
    fireEvent.press(screen.getByTestId('stylist-ask'));

    expect(await screen.findByTestId('proposal-0-0')).toHaveTextContent(/Easy and smart/);
    expect(screen.getByTestId('collage-piece-jeans')).toBeTruthy();
    expect(screen.getByTestId('stylist-session-day')).toHaveTextContent('For Today');
    const request = mockPropose.mock.calls[0][0];
    expect(request).toMatchObject({
      request: 'Dinner with friends',
      language: 'en',
      hints: { gender: 'woman', bodyType: null },
      mustInclude: null,
    });
    expect(request.history).toBeUndefined();
    expect(request.profile).not.toBeNull();
    expect(mockUsage.record).toHaveBeenCalledWith('stylist');
    expect(mockSessions[0].day).toBe(today());
  });

  it('refines within the session with the earlier proposals as context', async () => {
    renderWithQuery(<StylistScreen />);
    fireEvent.changeText(screen.getByTestId('stylist-request'), 'Work');
    fireEvent.press(screen.getByTestId('stylist-ask'));
    await screen.findByTestId('proposal-0-0');

    mockPropose.mockResolvedValue([proposal(['shirt', 'chinos'], 'Sharper.')]);
    fireEvent.changeText(screen.getByTestId('stylist-request'), 'More formal');
    fireEvent.press(screen.getByTestId('stylist-ask'));

    expect(await screen.findByTestId('proposal-1-0')).toHaveTextContent(/Sharper/);
    expect(screen.getByTestId('stylist-turn-1')).toHaveTextContent('More formal');
    const refinement = mockPropose.mock.calls[1][0];
    expect(refinement.request).toBe('More formal');
    expect(refinement.history).toHaveLength(1);
    expect(refinement.history![0].proposals[0].pieces[0].itemId).toBe('tee');
  });

  it('saves a proposal once, opens it in the editor, and plans it for the day', async () => {
    renderWithQuery(<StylistScreen />);
    fireEvent.changeText(screen.getByTestId('stylist-request'), 'Work');
    fireEvent.press(screen.getByTestId('stylist-ask'));
    await screen.findByTestId('proposal-0-0');

    fireEvent.press(screen.getByTestId('proposal-save-0-0'));
    await waitFor(() => expect(screen.getByTestId('proposal-save-0-0')).toBeDisabled());
    expect(mockOutfitRepo.create.mock.calls[0][0]).toHaveLength(3);

    fireEvent.press(screen.getByTestId('proposal-plan-0-0'));
    await waitFor(() => expect(mockCalendar.plan).toHaveBeenCalledWith(today(), 'saved-outfit'));
    // Planning reuses the outfit that was already saved.
    expect(mockOutfitRepo.create).toHaveBeenCalledTimes(1);

    // Both are remembered with the session, so reopening it cannot save or plan a second time.
    expect(mockSessions[0].turns[0].proposals[0]).toMatchObject({
      outfitId: 'saved-outfit',
      planned: true,
    });
    // The saved outfit is in the closet's outfits now.
    mockOutfits = [outfit('saved-outfit', null, ['tee'])];
    fireEvent.press(screen.getByTestId('stylist-new'));
    fireEvent.press(await screen.findByTestId('stylist-session-s1'));
    expect(screen.getByTestId('proposal-save-0-0')).toBeDisabled();
    expect(screen.getByTestId('proposal-plan-0-0')).toBeDisabled();

    fireEvent.press(screen.getByTestId('proposal-edit-0-0'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/outfit/edit',
      params: { itemIds: 'tee,jeans,boots' },
    });
  });

  it('saves again when the outfit saved earlier was deleted since', async () => {
    mockSessions = [
      {
        id: 's1',
        createdAt: 1,
        request: 'Work',
        day: null,
        itemId: null,
        turns: [
          {
            request: 'Work',
            proposals: [{ ...proposal(['tee', 'jeans'], 'Fine.'), outfitId: 'old-outfit' }],
          },
        ],
      },
    ];
    mockDeletedOutfits = ['old-outfit'];
    mockParams = { sessionId: 's1' };
    renderWithQuery(<StylistScreen />);
    // The outfit it was saved as is gone, so it is offered for saving again.
    expect(await screen.findByTestId('proposal-save-0-0')).not.toBeDisabled();
    fireEvent.press(screen.getByTestId('proposal-plan-0-0'));
    await waitFor(() => expect(mockCalendar.plan).toHaveBeenCalledWith(today(), 'saved-outfit'));
    expect(mockOutfitRepo.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['today, when its day has passed', addDays(today(), -3), today()],
    ['its own day, when that is still to come', addDays(today(), 2), addDays(today(), 2)],
    ['today, when its day is today', today(), today()],
  ])('plans a proposal of a reopened session on %s', async (_case, day, planned) => {
    mockSessions = [
      {
        id: 's1',
        createdAt: 1,
        request: 'Work',
        day,
        itemId: null,
        turns: [{ request: 'Work', proposals: [proposal(['tee', 'jeans'], 'Fine.')] }],
      },
    ];
    mockParams = { sessionId: 's1' };
    renderWithQuery(<StylistScreen />);

    fireEvent.press(await screen.findByTestId('proposal-plan-0-0'));
    await waitFor(() => expect(mockCalendar.plan).toHaveBeenCalledTimes(1));
    // An outfit is never planned on a day that is over.
    expect(mockCalendar.plan).toHaveBeenCalledWith(planned, 'saved-outfit');
    await waitFor(() => expect(mockSessions[0].turns[0].proposals[0].planned).toBe(true));
  });

  it('requires the chosen piece when styling an item, and cannot plan a wishlist piece', async () => {
    mockParams = { itemId: 'wish' };
    mockPropose.mockResolvedValue([proposal(['wish', 'jeans'], 'Try it with denim.')]);
    renderWithQuery(<StylistScreen />);
    expect(screen.getByTestId('stylist-required')).toHaveTextContent(/wish/);
    // No text is needed: the piece itself is the request.
    fireEvent.press(screen.getByTestId('stylist-ask'));

    await screen.findByTestId('proposal-0-0');
    const request = mockPropose.mock.calls[0][0];
    expect(request.mustInclude).toBe('wish');
    expect(request.items.map((entry) => entry.id)).toContain('wish');
    expect(mockSessions[0].itemId).toBe('wish');
    expect(screen.getByTestId('proposal-save-0-0')).toBeTruthy();
    expect(screen.queryByTestId('proposal-plan-0-0')).toBeNull();
    expect(screen.getByTestId('proposal-wishlist-0-0')).toBeTruthy();
  });

  it('says so when nothing usable came back, and explains failures', async () => {
    mockPropose.mockResolvedValue([]);
    renderWithQuery(<StylistScreen />);
    fireEvent.changeText(screen.getByTestId('stylist-request'), 'Work');
    fireEvent.press(screen.getByTestId('stylist-ask'));
    expect(await screen.findByTestId('stylist-problem')).toHaveTextContent(/did not come up/);
    // The provider answered, so the request still counts.
    expect(mockUsage.record).toHaveBeenCalledTimes(1);
    expect(mockSessions).toEqual([]);

    mockPropose.mockRejectedValue(new AiUnavailableError('offline'));
    fireEvent.press(screen.getByTestId('stylist-ask'));
    await waitFor(() =>
      expect(screen.getByTestId('stylist-problem')).toHaveTextContent(/No connection/),
    );
    expect(mockUsage.record).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('stylist-request').props.value).toBe('Work');
  });

  it('lists earlier requests, reopens one, and deletes one', async () => {
    mockSessions = [
      {
        id: 's1',
        createdAt: 1,
        request: 'Wedding guest',
        day: null,
        itemId: null,
        turns: [
          { request: 'Wedding guest', proposals: [proposal(['shirt', 'chinos'], 'Classic.')] },
        ],
      },
    ];
    renderWithQuery(<StylistScreen />);
    fireEvent.press(await screen.findByTestId('stylist-session-s1'));
    expect(screen.getByTestId('proposal-0-0')).toHaveTextContent(/Classic/);

    fireEvent.press(screen.getByTestId('stylist-new'));
    fireEvent.press(screen.getByTestId('stylist-session-delete-s1'));
    await waitFor(() => expect(screen.queryByTestId('stylist-session-s1')).toBeNull());
  });

  it('marks a proposal whose piece has left the closet', async () => {
    mockSessions = [
      {
        id: 's1',
        createdAt: 1,
        request: 'Old',
        day: null,
        itemId: null,
        turns: [{ request: 'Old', proposals: [proposal(['tee', 'gone'], 'Was nice.')] }],
      },
    ];
    mockParams = { sessionId: 's1' };
    renderWithQuery(<StylistScreen />);
    expect(await screen.findByTestId('proposal-incomplete-0-0')).toBeTruthy();
    expect(screen.queryByTestId('proposal-save-0-0')).toBeNull();
  });

  it('shows the number of stylist requests in settings', async () => {
    renderWithQuery(<StylistUsage />);
    expect(await screen.findByTestId('stylist-usage')).toHaveTextContent(
      'Stylist requests: 2 this month, 7 in total',
    );
    expect(mockUsage.counts).toHaveBeenCalledWith('stylist');
  });
});

describe('statistics', () => {
  it('shows counts, value with its coverage, and usage for the period', async () => {
    mockCalendar.wearLog.mockResolvedValue([
      { itemId: 'tee', day: today() },
      { itemId: 'tee', day: today() },
      { itemId: 'jeans', day: today() },
    ]);
    renderWithQuery(<StatsScreen />);
    expect(await screen.findByTestId('stats-count')).toHaveTextContent('5 items');
    expect(screen.getByTestId('stats-outfits')).toHaveTextContent('Saved outfits: 0');
    expect(screen.getByTestId('stats-value-CZK')).toHaveTextContent(/2.000/);
    expect(screen.getByTestId('stats-price-coverage')).toHaveTextContent(/2 of 5/);
    expect(screen.getByTestId('stats-category-tops')).toHaveTextContent(/Tops.*2/);
    expect(screen.getByTestId('stats-usage-share')).toHaveTextContent(
      '40% of your closet worn (2 of 5 items)',
    );
    expect(screen.getByTestId('stats-most-tee')).toHaveTextContent(/2×/);
    expect(screen.getByTestId('stats-never-boots')).toBeTruthy();
    expect(screen.getByTestId('stats-cost-tee')).toHaveTextContent(/200/);
    expect(screen.getByTestId('stats-trend')).toBeTruthy();
    fireEvent.press(screen.getByTestId('stats-period-all'));
    expect(screen.getByTestId('stats-period-all')).toBeChecked();
  });

  it('drills down to the closet category and to an item', async () => {
    mockCalendar.wearLog.mockResolvedValue([{ itemId: 'tee', day: today() }]);
    renderWithQuery(<StatsScreen />);
    fireEvent.press(await screen.findByTestId('stats-category-bottoms'));
    expect(useClosetTab.getState()).toMatchObject({ tab: 'closet', category: 'bottoms' });
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/closet');
    fireEvent.press(screen.getByTestId('stats-most-tee'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/item/[id]', params: { id: 'tee' } });
  });

  it('explains what is missing with an empty wear log and no prices', async () => {
    mockOwned = [item('plain', 'tops')];
    renderWithQuery(<StatsScreen />);
    expect(await screen.findByTestId('stats-no-wears')).toBeTruthy();
    expect(screen.getByTestId('stats-no-cost')).toBeTruthy();
    expect(screen.queryByTestId('stats-usage-share')).toBeNull();
    expect(screen.queryByTestId('stats-never-plain')).toBeNull();
  });

  it('shows an empty state for an empty closet', async () => {
    mockOwned = [];
    renderWithQuery(<StatsScreen />);
    expect(await screen.findByText('Nothing to count yet')).toBeTruthy();
  });

  it('shows cost per wear on an item only when it has a price', () => {
    mockWearStats = { count: 4, lastWorn: today() };
    const { rerender } = render(<CostPerWear item={{ id: 'tee', price: 400, currency: 'CZK' }} />);
    // Where the currency goes and how digits are grouped depends on the ICU data of the runtime.
    expect(screen.getByTestId('cost-per-wear')).toHaveTextContent(
      /Cost per wear: (CZK.100|100.00.CZK)/,
    );

    mockWearStats = { count: 0, lastWorn: null };
    rerender(<CostPerWear item={{ id: 'jeans', price: 1600, currency: 'CZK' }} />);
    expect(screen.getByTestId('cost-per-wear')).toHaveTextContent('Cost per wear: not worn yet');

    rerender(<CostPerWear item={{ id: 'shirt', price: null, currency: null }} />);
    expect(screen.queryByTestId('cost-per-wear')).toBeNull();
  });
});

describe('trips', () => {
  const fill = (start: string, end: string) => {
    fireEvent.changeText(screen.getByTestId('trip-start'), start);
    fireEvent.changeText(screen.getByTestId('trip-end'), end);
  };

  it('validates a new trip and creates it with a searched destination', async () => {
    renderWithQuery(<TripsScreen />);
    expect(await screen.findByText('No trips yet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('trip-new'));

    fireEvent.press(screen.getByTestId('trip-create'));
    expect(screen.getByTestId('trip-problem')).toHaveTextContent(/Enter both dates/);
    fill('2030-05-01', '2030-05-03');
    fireEvent.press(screen.getByTestId('trip-create'));
    expect(screen.getByTestId('trip-problem')).toHaveTextContent('Give the trip a name.');

    fireEvent.changeText(screen.getByTestId('trip-place-query'), 'Rome');
    fireEvent.press(screen.getByTestId('trip-place-search'));
    fireEvent.press(await screen.findByTestId('trip-place-result-0'));
    expect(screen.getByTestId('trip-place')).toHaveTextContent('Rome, Lazio, Italy');
    // The destination suggests a name.
    expect(screen.getByTestId('trip-name').props.value).toBe('Rome');

    fill('2030-05-03', '2030-05-01');
    fireEvent.press(screen.getByTestId('trip-create'));
    expect(screen.getByTestId('trip-problem')).toHaveTextContent(/ends before it starts/);

    fill('2030-05-01', '2030-05-01');
    fireEvent.press(screen.getByTestId('trip-create'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/trips/[id]',
        params: { id: 'trip-1' },
      }),
    );
    expect(mockTrips.create.mock.calls[0][0]).toMatchObject({
      name: 'Rome',
      startDay: '2030-05-01',
      endDay: '2030-05-01',
    });
    // The new trip already has an outfit for its day.
    expect(mockTrip!.days[0].pieces.length).toBeGreaterThan(0);
  });

  const tripWith = (pieces: string[]): Trip => ({
    id: 'trip-1',
    name: 'Rome',
    place: { name: 'Rome, Lazio, Italy', latitude: 41.9, longitude: 12.5 },
    startDay: '2030-05-01',
    endDay: '2030-05-01',
    days: [
      {
        day: '2030-05-01',
        activity: null,
        pieces: proposal(pieces, '').pieces,
        outfitId: null,
      },
    ],
    packing: [],
  });

  it('shows each day with typical weather and swaps its outfit, which updates the packing list', async () => {
    mockTrip = tripWith(['tee', 'jeans']);
    mockParams = { id: 'trip-1' };
    renderWithQuery(<TripScreen />);
    expect(await screen.findByTestId('trip-title')).toHaveTextContent('Rome');
    await waitFor(() =>
      expect(screen.getByTestId('trip-weather-2030-05-01')).toHaveTextContent(
        /9°C – 15°C.*typical/,
      ),
    );
    expect(screen.getByTestId('pack-tee')).toBeTruthy();
    expect(screen.getByTestId('trip-progress')).toHaveTextContent('0 of 2 packed');

    fireEvent.press(screen.getByTestId('trip-swap-2030-05-01'));
    await settle();
    const after = mockTrip!.days[0].pieces.map((piece) => piece.itemId).sort();
    expect(after).not.toEqual(['jeans', 'tee']);
    for (const id of after) expect(screen.getByTestId(`pack-${id}`)).toBeTruthy();
    for (const id of ['tee', 'jeans'].filter((entry) => !after.includes(entry))) {
      expect(screen.queryByTestId(`pack-${id}`)).toBeNull();
    }
  });

  it('ticks items off, takes free-text entries, and counts progress', async () => {
    mockTrip = tripWith(['tee', 'jeans']);
    mockParams = { id: 'trip-1' };
    renderWithQuery(<TripScreen />);
    fireEvent.press(await screen.findByTestId('pack-tee'));
    await waitFor(() => expect(screen.getByTestId('pack-tee')).toBeChecked());
    expect(screen.getByTestId('trip-progress')).toHaveTextContent('1 of 2 packed');
    // A piece of an outfit cannot be removed from the list, only swapped out of the outfit.
    expect(screen.queryByTestId('pack-tee-remove')).toBeNull();

    fireEvent.changeText(screen.getByTestId('pack-text-input'), 'Passport');
    fireEvent.press(screen.getByTestId('pack-text-add'));
    expect(await screen.findByTestId('pack-text-text-1')).toBeTruthy();
    expect(screen.getByTestId('trip-progress')).toHaveTextContent('1 of 3 packed');
    expect(screen.getByTestId('pack-text-text-1-remove')).toBeTruthy();
  });

  it('adds the trip to the calendar', async () => {
    mockTrip = tripWith(['tee', 'jeans']);
    mockParams = { id: 'trip-1' };
    renderWithQuery(<TripScreen />);
    fireEvent.press(await screen.findByTestId('trip-calendar'));
    await waitFor(() =>
      expect(mockCalendar.plan).toHaveBeenCalledWith('2030-05-01', 'saved-outfit'),
    );
    expect(mockOutfitRepo.create.mock.calls[0][1]).toMatchObject({
      name: expect.stringMatching(/^Rome · /),
    });
  });
});

describe('display', () => {
  it('shows the time, a welcome, the weather and the suggestion for today', () => {
    mockSuggested = [closet[0], closet[2]];
    renderWithQuery(<DisplayScreen />);
    expect(screen.getByTestId('display-time')).toHaveTextContent(/\d{1,2}:\d{2}/);
    expect(screen.getByTestId('display-date')).toBeTruthy();
    expect(screen.getByTestId('display-welcome')).toHaveTextContent(/Auri/);
    expect(screen.getByTestId('display-weather')).toHaveTextContent('12°C · Rain');
    expect(screen.getByTestId('display-outfit-label')).toHaveTextContent('Suggested for today');
    expect(screen.getByTestId('collage-piece-tee')).toBeTruthy();
    expect(screen.getByTestId('display-layout-portrait')).toBeTruthy();
    expect(require('expo-keep-awake').useKeepAwake).toHaveBeenCalled();
  });

  it("follows today's outfit as it changes", () => {
    mockOutfits = [outfit('o1', 'Office', ['shirt']), outfit('o2', null, ['tee'])];
    const view = renderWithQuery(<DisplayScreen />);
    expect(screen.getByTestId('display-no-outfit')).toBeTruthy();

    mockToday = [{ outfitId: 'o1' }];
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <DisplayScreen />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('display-outfit-label')).toHaveTextContent('Office');
    expect(screen.getByTestId('collage-piece-shirt')).toBeTruthy();

    mockToday = [{ outfitId: 'o2' }];
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <DisplayScreen />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('display-outfit-label')).toHaveTextContent("Today's outfit");
    expect(screen.getByTestId('collage-piece-tee')).toBeTruthy();
  });

  it('shows the planned outfit that still exists when an entry before it is for a deleted one', () => {
    mockOutfits = [outfit('o2', 'Office', ['shirt'])];
    mockSuggested = [closet.find((entry) => entry.id === 'tee')!];
    mockToday = [{ outfitId: 'deleted' }, { outfitId: 'o2' }];
    renderWithQuery(<DisplayScreen />);
    expect(screen.getByTestId('display-outfit-label')).toHaveTextContent('Office');
    expect(screen.getByTestId('collage-piece-shirt')).toBeTruthy();
    // The suggestion is for a day without a plan, which this is not.
    expect(screen.queryByTestId('collage-piece-tee')).toBeNull();
    expect(screen.queryByText('Suggested for today')).toBeNull();
  });

  it('falls back to the suggestion when every outfit planned for today was deleted', () => {
    mockOutfits = [outfit('o2', 'Office', ['shirt'])];
    mockSuggested = [closet.find((entry) => entry.id === 'tee')!];
    mockToday = [{ outfitId: 'deleted' }, { outfitId: 'also-deleted' }];
    renderWithQuery(<DisplayScreen />);
    expect(screen.getByTestId('display-outfit-label')).toHaveTextContent('Suggested for today');
    expect(screen.getByTestId('collage-piece-tee')).toBeTruthy();
    expect(screen.queryByTestId('collage-piece-shirt')).toBeNull();
  });

  it('dims when left alone, wakes on a tap, and only then offers to close', () => {
    renderWithQuery(<DisplayScreen />);
    expect(screen.getByTestId('display-dim')).toBeTruthy();
    expect(screen.queryByTestId('display-exit')).toBeNull();
    fireEvent.press(screen.getByTestId('display'));
    expect(screen.queryByTestId('display-dim')).toBeNull();
    fireEvent.press(screen.getByTestId('display-exit'));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('uses the chosen theme', () => {
    render(<DisplaySettings />);
    expect(screen.getByTestId('display-theme-dark')).toBeChecked();
    fireEvent.press(screen.getByTestId('display-theme-warm'));
    expect(mockSettings.get('display.theme')).toBe('warm');
    fireEvent.press(screen.getByTestId('display-charging-on'));
    expect(mockSettings.get('display.startWhileCharging')).toBe('1');
    fireEvent.press(screen.getByTestId('display-charging-on'));
    expect(mockSettings.has('display.startWhileCharging')).toBe(false);
    fireEvent.press(screen.getByTestId('display-open'));
    expect(mockRouter.push).toHaveBeenCalledWith('/display');

    renderWithQuery(<DisplayScreen />);
    expect(screen.getByTestId('display')).toHaveStyle({ backgroundColor: '#1F1410' });
  });
});
