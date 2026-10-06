import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';

import { AiUnavailableError } from '@/ai/client';
import TripsScreen from '@/app/trips/index';
import TripScreen from '@/app/trips/[id]';
import type { Category, Occasion } from '@/closet/taxonomy';
import type { Item } from '@/closet/types';
import type { OutfitPiece } from '@/outfits/draft';
import { ToastHost } from '@/shell/ToastHost';
import type { StylistRequest } from '@/stylist/stylist';

import type { TripWeather } from '../forecast';
import type { PackingEntry, Trip, TripDay } from '../repository';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ regionCode: 'CZ' }] }));
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View {...props} /> };
});
jest.mock('@/storage/imageStore', () => ({
  imageStore: { uri: (path: string) => `file:///documents/${path}` },
}));

const mockRouter = { push: jest.fn(), back: jest.fn() };
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
jest.mock('@/stylist/sessions', () => ({
  isDisclosed: () => mockSettings.get('stylist.disclosed') === '1',
  setDisclosed: () => void mockSettings.set('stylist.disclosed', '1'),
}));

let mockHasKey = true;
jest.mock('@/ai/useKeyInfo', () => ({ useKeyInfo: () => ({ data: { hasKey: mockHasKey } }) }));
jest.mock('@/profile/useProfile', () => ({
  useProfile: () => ({ data: { name: 'Auri', gender: 'woman', bodyType: null } }),
}));

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
  item('tee', 'tops'),
  item('shirt', 'tops'),
  item('jeans', 'bottoms'),
  item('chinos', 'bottoms'),
  item('boots', 'shoes'),
];
let mockOwned: Item[] = closet;
/** Pieces a trip refers to that are no longer among the owned items. */
let mockOthers: Item[] = [];
const mockItemsById = jest.fn((ids: string[]) => ({
  data: mockOthers.filter((entry) => ids.includes(entry.id)),
}));
jest.mock('@/closet/useItems', () => ({
  useItems: () => ({ data: mockOwned, isPending: false }),
  useItemsById: (ids: string[]) => mockItemsById(ids),
}));
jest.mock('@/closet/repository', () => ({ itemRepository: { list: async () => mockOwned } }));

const mockOutfitRepo = {
  create: jest.fn(async (..._args: unknown[]) => ({ id: 'saved-outfit' })),
  get: jest.fn(async (id: string): Promise<{ id: string } | null> => ({ id })),
};
jest.mock('@/outfits/repository', () => ({
  outfitRepository: {
    create: (...args: unknown[]) => mockOutfitRepo.create(...args),
    get: (id: string) => mockOutfitRepo.get(id),
  },
}));
jest.mock('@/outfits/useOutfits', () => ({ useInvalidateOutfits: () => async () => {} }));
const mockUsage = { record: jest.fn(async (_kind: string) => {}) };
jest.mock('@/outfits/renders', () => ({
  usageLog: { record: (kind: string) => mockUsage.record(kind) },
}));

const mockCalendar = {
  plan: jest.fn(async (..._args: unknown[]) => ({})),
  wearCounts: jest.fn(async (_ids: string[]) => new Map<string, number>([['tee', 4]])),
};
jest.mock('@/planning/calendar', () => ({
  calendarRepository: {
    plan: (...args: unknown[]) => mockCalendar.plan(...args),
    wearCounts: (ids: string[]) => mockCalendar.wearCounts(ids),
  },
}));
jest.mock('@/planning/settings', () => ({ getTemperatureUnit: () => 'celsius' }));
jest.mock('@/planning/usePlanning', () => ({ useInvalidatePlanning: () => async () => {} }));
const mockSearch = jest.fn(
  async (..._args: unknown[]): Promise<{ name: string; latitude: number; longitude: number }[]> => [
    { name: 'Rome, Lazio, Italy', latitude: 41.9, longitude: 12.5 },
  ],
);
jest.mock('@/planning/weather', () => ({
  ...jest.requireActual('@/planning/weather'),
  searchPlaces: (...args: unknown[]) => mockSearch(...args),
}));

type StyleContext = Pick<
  StylistRequest,
  'items' | 'language' | 'hints' | 'wearCounts' | 'onAnswered'
>;
const mockStyleTrip = jest.fn(
  async (_trip: Trip, _weather: TripWeather[], _context: StyleContext): Promise<number> => 1,
);
jest.mock('../actions', () => ({
  dayInputs: (trip: Trip, weather: TripWeather[]) =>
    jest.requireActual('../actions').dayInputs(trip, weather),
  // The real planner, so "suggest" really chooses outfits from the closet.
  generateTrip: (...args: unknown[]) => jest.requireActual('../actions').generateTrip(...args),
  styleTrip: (trip: Trip, weather: TripWeather[], context: StyleContext) =>
    mockStyleTrip(trip, weather, context),
}));

const dayWeather = (day: string) => ({
  day,
  feelsMin: 9,
  feelsMax: 15,
  precipitationChance: 0,
  precipitation: 0,
  wind: 5,
  code: 1,
});
const mockWeather = jest.fn(async (_place: unknown, days: string[]): Promise<TripWeather[]> =>
  days.map((day) => ({ day, typical: true, weather: dayWeather(day) })),
);
jest.mock('../forecast', () => ({
  tripWeather: (place: unknown, days: string[]) => mockWeather(place, days),
}));

/** The stored trips; the repository below changes them the way the real one does. */
let mockTrip: Trip | null = null;
let mockList: Trip[] = [];
let mockDeleted = false;
const mockPatchTrip = (patch: (trip: Trip) => Partial<Trip>) => {
  mockTrip = { ...mockTrip!, ...patch(mockTrip!) };
};
const mockRepo = {
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
  setDay: jest.fn(async (_id: string, day: string, patch: Partial<TripDay>) =>
    mockPatchTrip((trip) => ({
      days: trip.days.map((entry) => (entry.day === day ? { ...entry, ...patch } : entry)),
    })),
  ),
  setItemPacked: jest.fn(async (_id: string, key: string, packed: boolean) =>
    mockPatchTrip((trip) => ({
      packing: trip.packing.some((entry) => entry.key === key)
        ? trip.packing.map((entry) => (entry.key === key ? { ...entry, packed } : entry))
        : [...trip.packing, { key, kind: 'item', label: null, packed }],
    })),
  ),
  setTextPacked: jest.fn(async (_id: string, key: string, packed: boolean) =>
    mockPatchTrip((trip) => ({
      packing: trip.packing.map((entry) => (entry.key === key ? { ...entry, packed } : entry)),
    })),
  ),
  addItem: jest.fn(async (_id: string, key: string) =>
    mockPatchTrip((trip) => ({
      packing: [
        ...trip.packing.filter((entry) => entry.key !== key),
        { key, kind: 'extra', label: null, packed: false },
      ],
    })),
  ),
  addText: jest.fn(async (_id: string, label: string) =>
    mockPatchTrip((trip) => ({
      packing: [...trip.packing, { key: 'new-text', kind: 'text', label, packed: false }],
    })),
  ),
  removeEntry: jest.fn(async (_id: string, key: string) =>
    mockPatchTrip((trip) => ({ packing: trip.packing.filter((entry) => entry.key !== key) })),
  ),
  remove: jest.fn(async (_id: string) => {
    mockDeleted = true;
  }),
  restore: jest.fn(async (_id: string) => {
    mockDeleted = false;
  }),
};
jest.mock('../repository', () => ({
  TRIPS: 'trips',
  addTripToCalendar: (...args: unknown[]) =>
    jest.requireActual('../repository').addTripToCalendar(...args),
  tripRepository: {
    list: async () => mockList,
    get: async (id: string) =>
      mockTrip && mockTrip.id === id && !mockDeleted ? { ...mockTrip } : null,
    create: (input: { name: string; startDay: string; endDay: string }) => mockRepo.create(input),
    setDay: (id: string, day: string, patch: Partial<TripDay>) => mockRepo.setDay(id, day, patch),
    setItemPacked: (id: string, key: string, packed: boolean) =>
      mockRepo.setItemPacked(id, key, packed),
    setTextPacked: (id: string, key: string, packed: boolean) =>
      mockRepo.setTextPacked(id, key, packed),
    addItem: (id: string, key: string) => mockRepo.addItem(id, key),
    addText: (id: string, label: string) => mockRepo.addText(id, label),
    removeEntry: (id: string, key: string) => mockRepo.removeEntry(id, key),
    remove: (id: string) => mockRepo.remove(id),
    restore: (id: string) => mockRepo.restore(id),
  },
}));

const renderWithQuery = (ui: ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}
    >
      {ui}
      <ToastHost />
    </QueryClientProvider>,
  );
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

const DAY = '2031-05-01';
const NEXT_DAY = '2031-05-02';
const pieces = (ids: string[]): OutfitPiece[] =>
  ids.map((itemId) => ({
    itemId,
    slot:
      itemId === 'jeans' || itemId === 'chinos' ? 'bottom' : itemId === 'boots' ? 'shoes' : 'top',
    position: 0,
  }));
const tripDay = (day: string, ids: string[], patch: Partial<TripDay> = {}): TripDay => ({
  day,
  activity: null,
  pieces: pieces(ids),
  outfitId: null,
  ...patch,
});
const trip = (days: TripDay[], packing: PackingEntry[] = [], patch: Partial<Trip> = {}): Trip => ({
  id: 'trip-1',
  name: 'Rome',
  place: { name: 'Rome, Lazio, Italy', latitude: 41.9, longitude: 12.5 },
  startDay: days[0].day,
  endDay: days[days.length - 1].day,
  days,
  packing,
  ...patch,
});

/** Opens the trip and waits until its weather has loaded, as the buttons do. */
const openTrip = async () => {
  renderWithQuery(<TripScreen />);
  await screen.findByTestId('trip-title');
  await waitFor(() =>
    expect(screen.getByTestId(`trip-weather-${mockTrip!.days[0].day}`)).not.toHaveTextContent(
      'No forecast',
    ),
  );
};

/** The answer, by button index, to each confirmation by its title; unlisted ones stay open. */
let answers: Record<string, number> = {};
const DISCLOSURE = 'Before the first request';
const REPLACE = 'Replace the outfits?';
const DELETE = 'Delete this trip?';
let alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.clear();
  mockSettings.set('stylist.disclosed', '1');
  mockParams = { id: 'trip-1' };
  mockHasKey = true;
  mockOwned = closet;
  mockOthers = [];
  mockTrip = trip([tripDay(DAY, ['tee', 'jeans'])]);
  mockList = [];
  mockDeleted = false;
  mockStyleTrip.mockResolvedValue(1);
  mockOutfitRepo.get.mockImplementation(async (id: string) => ({ id }));
  answers = {};
  alert = jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons) => {
    const index = answers[title];
    if (index !== undefined) buttons?.[index].onPress?.();
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('trip list', () => {
  const listed = (id: string, name: string, startDay: string, endDay: string): Trip => ({
    ...trip([tripDay(startDay, [])]),
    id,
    name,
    place: { name: `${name}, Somewhere`, latitude: 1, longitude: 1 },
    startDay,
    endDay,
  });

  it('lists trips in the order they come, with place and dates, and dims the ones that are over', async () => {
    mockList = [
      listed('soon', 'Lisbon', '2031-05-01', '2031-05-03'),
      listed('later', 'Oslo', '2031-08-10', '2031-08-12'),
      listed('past', 'Vienna', '2020-01-02', '2020-01-05'),
    ];
    renderWithQuery(<TripsScreen />);
    expect(await screen.findByTestId('trip-soon')).toHaveTextContent(
      /Lisbon.*Lisbon, Somewhere.*May 1 – May 3/,
    );
    expect(
      screen.getAllByTestId(/^trip-(soon|later|past)$/).map((row) => row.props.testID as string),
    ).toEqual(['trip-soon', 'trip-later', 'trip-past']);
    expect(screen.getByTestId('trip-later')).toHaveTextContent(/Aug 10 – Aug 12/);
    expect(screen.getByTestId('trip-past')).toHaveTextContent(/Vienna.*Jan 2 – Jan 5/);

    expect(screen.getByTestId('trip-soon')).toHaveStyle({ opacity: 1 });
    expect(screen.getByTestId('trip-later')).toHaveStyle({ opacity: 1 });
    expect(screen.getByTestId('trip-past')).toHaveStyle({ opacity: 0.6 });
    expect(screen.queryByText('No trips yet')).toBeNull();
    expect(screen.getByTestId('trip-new')).toHaveTextContent(/Plan a trip/);
  });

  it('opens a trip, also one that is over', async () => {
    mockList = [
      listed('soon', 'Lisbon', '2031-05-01', '2031-05-03'),
      listed('past', 'Vienna', '2020-01-02', '2020-01-05'),
    ];
    renderWithQuery(<TripsScreen />);
    fireEvent.press(await screen.findByTestId('trip-past'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/trips/[id]',
      params: { id: 'past' },
    });
    fireEvent.press(screen.getByTestId('trip-soon'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/trips/[id]',
      params: { id: 'soon' },
    });
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });

  it('keeps the list in view while a new trip is filled in, without the empty message', async () => {
    renderWithQuery(<TripsScreen />);
    expect(await screen.findByText('No trips yet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('trip-new'));
    expect(screen.getByTestId('trip-form')).toBeTruthy();
    expect(screen.queryByText('No trips yet')).toBeNull();
    expect(screen.queryByTestId('trip-new')).toBeNull();
  });

  it('searches for the destination, reports a failed or empty search, and lets it be changed', async () => {
    renderWithQuery(<TripsScreen />);
    fireEvent.press(await screen.findByTestId('trip-new'));
    // One letter is not enough to search for.
    fireEvent.changeText(screen.getByTestId('trip-place-query'), 'R');
    expect(screen.getByTestId('trip-place-search')).toBeDisabled();

    mockSearch.mockRejectedValueOnce(new Error('offline'));
    fireEvent.changeText(screen.getByTestId('trip-place-query'), 'Rome');
    fireEvent.press(screen.getByTestId('trip-place-search'));
    expect(await screen.findByTestId('trip-problem')).toHaveTextContent(
      'The search did not work. Check your connection.',
    );
    expect(mockSearch).toHaveBeenCalledWith('Rome', 'en');

    mockSearch.mockResolvedValueOnce([]);
    fireEvent.press(screen.getByTestId('trip-place-search'));
    expect(await screen.findByText('No place found with that name.')).toBeTruthy();
    expect(screen.queryByTestId('trip-problem')).toBeNull();

    // A name typed before choosing the place is kept.
    fireEvent.changeText(screen.getByTestId('trip-name'), 'Anniversary');
    fireEvent.press(screen.getByTestId('trip-place-search'));
    fireEvent.press(await screen.findByTestId('trip-place-result-0'));
    expect(screen.getByTestId('trip-place')).toHaveTextContent('Rome, Lazio, Italy');
    expect(screen.getByTestId('trip-name').props.value).toBe('Anniversary');
    expect(screen.queryByTestId('trip-place-query')).toBeNull();

    fireEvent.press(screen.getByTestId('trip-place-change'));
    expect(screen.queryByTestId('trip-place')).toBeNull();
    expect(screen.getByTestId('trip-place-query')).toBeTruthy();
  });

  it('refuses a trip without a destination, one that is over, and one longer than 30 days', async () => {
    renderWithQuery(<TripsScreen />);
    fireEvent.press(await screen.findByTestId('trip-new'));
    const dates = (start: string, end: string) => {
      fireEvent.changeText(screen.getByTestId('trip-start'), start);
      fireEvent.changeText(screen.getByTestId('trip-end'), end);
      fireEvent.press(screen.getByTestId('trip-create'));
    };
    fireEvent.changeText(screen.getByTestId('trip-name'), 'Rome');
    dates('2031-05-01', '2031-05-03');
    expect(screen.getByTestId('trip-problem')).toHaveTextContent('Choose a destination.');

    fireEvent.changeText(screen.getByTestId('trip-place-query'), 'Rome');
    fireEvent.press(screen.getByTestId('trip-place-search'));
    fireEvent.press(await screen.findByTestId('trip-place-result-0'));
    dates('2020-01-02', '2020-01-05');
    expect(screen.getByTestId('trip-problem')).toHaveTextContent('This trip is already over.');
    dates('2031-05-01', '2031-05-31');
    expect(screen.getByTestId('trip-problem')).toHaveTextContent('A trip can be 30 days at most.');
    dates('2031-05-01', 'soon');
    expect(screen.getByTestId('trip-problem')).toHaveTextContent(/Enter both dates/);
    await settle();
    expect(mockRepo.create).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe('trip', () => {
  it('says so when the trip no longer exists', async () => {
    mockParams = { id: 'gone' };
    renderWithQuery(<TripScreen />);
    expect(await screen.findByText('This trip no longer exists.')).toBeTruthy();
    expect(screen.getByText('Trips')).toBeTruthy();
    expect(screen.queryByTestId('trip-title')).toBeNull();
    expect(screen.queryByTestId('trip-delete')).toBeNull();
    expect(mockWeather).not.toHaveBeenCalled();
  });

  it('shows the destination, each day with its date, and the forecast without calling it typical', async () => {
    mockTrip = trip([tripDay(DAY, ['tee', 'jeans']), tripDay(NEXT_DAY, [])]);
    mockWeather.mockResolvedValueOnce([
      { day: DAY, typical: false, weather: { ...dayWeather(DAY), code: 61 } },
      { day: NEXT_DAY, typical: true, weather: dayWeather(NEXT_DAY) },
    ]);
    await openTrip();
    expect(screen.getByTestId('trip-title')).toHaveTextContent('Rome');
    expect(screen.getByText('Rome, Lazio, Italy')).toBeTruthy();
    expect(mockWeather).toHaveBeenCalledWith(mockTrip!.place, [DAY, NEXT_DAY]);

    expect(screen.getByTestId(`trip-day-${DAY}`)).toHaveTextContent(/Thu, May 1/);
    expect(screen.getByTestId(`trip-weather-${DAY}`)).toHaveTextContent('9°C – 15°C · Rain');
    expect(screen.getByTestId(`trip-weather-${NEXT_DAY}`)).toHaveTextContent(/· typical$/);
    expect(screen.getByTestId(`trip-collage-${DAY}`)).toBeTruthy();
    expect(screen.getByTestId(`trip-empty-${NEXT_DAY}`)).toHaveTextContent(
      'No outfit could be put together for this day.',
    );
  });

  it('says there is no forecast for a day without weather', async () => {
    mockTrip = trip([tripDay(DAY, ['tee', 'jeans']), tripDay(NEXT_DAY, ['shirt', 'chinos'])]);
    mockWeather.mockResolvedValueOnce([
      { day: DAY, typical: false, weather: null },
      { day: NEXT_DAY, typical: true, weather: dayWeather(NEXT_DAY) },
    ]);
    renderWithQuery(<TripScreen />);
    await waitFor(() =>
      expect(screen.getByTestId(`trip-weather-${NEXT_DAY}`)).toHaveTextContent(/typical/),
    );
    expect(screen.getByTestId(`trip-weather-${DAY}`)).toHaveTextContent('No forecast');
    // The day can still get another outfit, chosen for the season.
    expect(screen.getByTestId(`trip-swap-${DAY}`)).not.toBeDisabled();
  });

  it('says there is no forecast when the weather could not be fetched at all', async () => {
    mockWeather.mockResolvedValueOnce([]);
    renderWithQuery(<TripScreen />);
    await screen.findByTestId('trip-title');
    await settle();
    expect(screen.getByTestId(`trip-weather-${DAY}`)).toHaveTextContent('No forecast');
  });

  it('marks the days that are already in the calendar', async () => {
    mockTrip = trip([
      tripDay(DAY, ['tee', 'jeans'], { outfitId: 'outfit-9' }),
      tripDay(NEXT_DAY, ['shirt', 'chinos']),
    ]);
    await openTrip();
    expect(screen.getByTestId(`trip-planned-${DAY}`)).toHaveTextContent('In the calendar');
    expect(screen.queryByTestId(`trip-planned-${NEXT_DAY}`)).toBeNull();
  });

  it('still shows a piece that has left the closet since', async () => {
    mockOthers = [item('old-coat', 'outerwear', { ownership: 'archived', name: 'Old coat' })];
    mockTrip = trip([tripDay(DAY, ['tee', 'jeans', 'old-coat'])]);
    await openTrip();
    expect(mockItemsById).toHaveBeenLastCalledWith(['old-coat']);
    expect(screen.getByTestId('collage-piece-old-coat')).toBeTruthy();
    expect(screen.getByTestId('pack-old-coat')).toHaveTextContent(/Old coat/);
    expect(screen.getByTestId('trip-progress')).toHaveTextContent('0 of 3 packed');
  });
});

describe('suggesting outfits', () => {
  it('suggests straight away when the trip has no outfits yet', async () => {
    mockTrip = trip([tripDay(DAY, []), tripDay(NEXT_DAY, [])]);
    await openTrip();
    expect(screen.getByTestId('trip-suggest')).toHaveTextContent(/Suggest outfits/);
    expect(screen.queryByTestId('trip-calendar')).toBeNull();
    expect(screen.getByTestId('trip-progress')).toHaveTextContent('0 of 0 packed');

    fireEvent.press(screen.getByTestId('trip-suggest'));
    await waitFor(() => expect(mockRepo.setDay).toHaveBeenCalledTimes(2));
    await settle();
    expect(alert).not.toHaveBeenCalled();
    for (const day of [DAY, NEXT_DAY]) {
      expect(mockRepo.setDay).toHaveBeenCalledWith('trip-1', day, {
        pieces: expect.arrayContaining([expect.objectContaining({ slot: 'top' })]),
      });
      expect(screen.getByTestId(`trip-collage-${day}`)).toBeTruthy();
    }
    // Only pieces of the closet are chosen, and they are on the packing list now.
    const chosen = mockTrip!.days.flatMap((day) => day.pieces.map((piece) => piece.itemId));
    expect(chosen.length).toBeGreaterThan(0);
    for (const id of chosen) {
      expect(closet.map((entry) => entry.id)).toContain(id);
      expect(screen.getByTestId(`pack-${id}`)).toBeTruthy();
    }
    expect(screen.getByTestId('trip-suggest')).toHaveTextContent(/Suggest all again/);
    expect(screen.getByTestId('trip-calendar')).toBeTruthy();
  });

  it('asks before replacing the outfits that are there, and keeps them on cancel', async () => {
    answers = { [REPLACE]: 0 };
    await openTrip();
    expect(screen.getByTestId('trip-suggest')).toHaveTextContent(/Suggest all again/);
    fireEvent.press(screen.getByTestId('trip-suggest'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      'Replace the outfits?',
      'The outfits chosen for this trip so far will be replaced.',
      [
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Replace' }),
      ],
    );
    await settle();
    expect(mockRepo.setDay).not.toHaveBeenCalled();
    expect(mockTrip!.days[0].pieces.map((piece) => piece.itemId)).toEqual(['tee', 'jeans']);
    expect(screen.getByTestId('pack-tee')).toBeTruthy();
    expect(screen.getByTestId('trip-suggest')).not.toBeDisabled();
  });

  it('suggests everything again once that was confirmed', async () => {
    answers = { [REPLACE]: 1 };
    mockTrip = trip([tripDay(DAY, ['tee', 'jeans']), tripDay(NEXT_DAY, ['shirt', 'chinos'])]);
    await openTrip();
    fireEvent.press(screen.getByTestId('trip-suggest'));
    await waitFor(() => expect(mockRepo.setDay).toHaveBeenCalledTimes(2));
    await settle();
    expect(mockRepo.setDay.mock.calls.map((call) => call[1])).toEqual([DAY, NEXT_DAY]);
    for (const call of mockRepo.setDay.mock.calls) {
      expect(call[0]).toBe('trip-1');
      expect(call[2].pieces!.length).toBeGreaterThan(0);
    }
    expect(screen.getByTestId('trip-suggest')).not.toBeDisabled();
  });
});

describe('asking the stylist for a trip', () => {
  it('is not offered without a key', async () => {
    mockHasKey = false;
    await openTrip();
    expect(screen.queryByTestId('trip-stylist')).toBeNull();
    expect(screen.getByTestId('trip-suggest')).toBeTruthy();
  });

  it('waits for the weather, which the request describes', async () => {
    let arrive!: (weather: TripWeather[]) => void;
    mockWeather.mockReturnValueOnce(new Promise<TripWeather[]>((resolve) => (arrive = resolve)));
    renderWithQuery(<TripScreen />);
    expect(await screen.findByTestId('trip-stylist')).toBeDisabled();
    expect(screen.getByTestId('trip-stylist')).toHaveTextContent(/Let the AI stylist choose/);
    expect(screen.getByTestId(`trip-swap-${DAY}`)).toBeDisabled();
    // Choosing what a day is for waits too, as it picks an outfit for the weather.
    fireEvent.press(screen.getByTestId(`trip-activity-${DAY}-work`));
    await settle();
    expect(mockRepo.setDay).not.toHaveBeenCalled();

    await act(async () => arrive([{ day: DAY, typical: false, weather: dayWeather(DAY) }]));
    await waitFor(() => expect(screen.getByTestId('trip-stylist')).not.toBeDisabled());
    expect(screen.getByTestId(`trip-swap-${DAY}`)).not.toBeDisabled();
  });

  it('explains once what is sent, and sends nothing when that is declined', async () => {
    mockSettings.clear();
    answers = { [DISCLOSURE]: 0, [REPLACE]: 1 };
    await openTrip();
    fireEvent.press(screen.getByTestId('trip-stylist'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      'Before the first request',
      expect.stringMatching(/No photos are sent/),
      [
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Understood' }),
      ],
    );
    await settle();
    expect(mockStyleTrip).not.toHaveBeenCalled();
    expect(mockSettings.has('stylist.disclosed')).toBe(false);

    // Declining is not remembered: it is explained again the next time.
    fireEvent.press(screen.getByTestId('trip-stylist'));
    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenLastCalledWith(DISCLOSURE, expect.any(String), expect.any(Array));
  });

  it('remembers the acceptance and sends the trip with the closet, the weather and the hints', async () => {
    mockSettings.clear();
    answers = { [DISCLOSURE]: 1 };
    mockTrip = trip([tripDay(DAY, [])]);
    mockStyleTrip.mockImplementation(async (_trip, _weather, context) => {
      await context.onAnswered?.();
      return 1;
    });
    await openTrip();
    fireEvent.press(screen.getByTestId('trip-stylist'));
    await waitFor(() => expect(mockStyleTrip).toHaveBeenCalledTimes(1));
    await settle();
    expect(mockSettings.get('stylist.disclosed')).toBe('1');

    const [sentTrip, sentWeather, context] = mockStyleTrip.mock.calls[0];
    expect(sentTrip).toMatchObject({ id: 'trip-1', name: 'Rome' });
    expect(sentWeather).toEqual([{ day: DAY, typical: true, weather: dayWeather(DAY) }]);
    expect(context.items.map((entry) => entry.id)).toEqual([
      'tee',
      'shirt',
      'jeans',
      'chinos',
      'boots',
    ]);
    expect(context.language).toBe('en');
    expect(context.hints).toEqual({ gender: 'woman', bodyType: null });
    expect(mockCalendar.wearCounts).toHaveBeenCalledWith([
      'tee',
      'shirt',
      'jeans',
      'chinos',
      'boots',
    ]);
    expect(context.wearCounts).toEqual(new Map([['tee', 4]]));
    // The request counts once the provider has answered.
    expect(mockUsage.record).toHaveBeenCalledTimes(1);
    expect(mockUsage.record).toHaveBeenCalledWith('stylist');
    expect(screen.queryByText(/did not manage/)).toBeNull();
    expect(screen.getByTestId('trip-stylist')).not.toBeDisabled();

    // It is not explained a second time.
    fireEvent.press(screen.getByTestId('trip-stylist'));
    await waitFor(() => expect(mockStyleTrip).toHaveBeenCalledTimes(2));
    await settle();
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('also asks before the stylist replaces outfits, and sends nothing on cancel', async () => {
    answers = { [REPLACE]: 0 };
    await openTrip();
    fireEvent.press(screen.getByTestId('trip-stylist'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenLastCalledWith(REPLACE, expect.any(String), expect.any(Array));
    await settle();
    expect(mockStyleTrip).not.toHaveBeenCalled();

    answers = { [REPLACE]: 1 };
    fireEvent.press(screen.getByTestId('trip-stylist'));
    await waitFor(() => expect(mockStyleTrip).toHaveBeenCalledTimes(1));
    await settle();
  });

  it('says so when the stylist did not manage an outfit for every day', async () => {
    answers = { [REPLACE]: 1 };
    mockStyleTrip.mockResolvedValue(0);
    await openTrip();
    fireEvent.press(screen.getByTestId('trip-stylist'));
    expect(
      await screen.findByText(
        'The stylist did not manage an outfit for every day. Nothing was changed.',
      ),
    ).toBeTruthy();
    expect(mockRepo.setDay).not.toHaveBeenCalled();
    expect(screen.getByTestId('pack-tee')).toBeTruthy();
    expect(screen.getByTestId('trip-stylist')).not.toBeDisabled();
  });

  it.each([
    ['offline', 'No connection. The stylist needs the internet.'],
    ['rejectedKey', 'Anthropic rejected your key. Check it in Settings.'],
    ['rateLimited', 'Too many requests right now. Try again in a moment.'],
    ['noKey', 'Add your Anthropic key in Settings to use the stylist.'],
  ] as const)('explains why the stylist is unavailable: %s', async (reason, message) => {
    answers = { [REPLACE]: 1 };
    mockStyleTrip.mockRejectedValue(new AiUnavailableError(reason));
    await openTrip();
    fireEvent.press(screen.getByTestId('trip-stylist'));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(mockUsage.record).not.toHaveBeenCalled();
    // The trip is as it was and the stylist can be asked again.
    expect(screen.getByTestId('pack-tee')).toBeTruthy();
    expect(screen.getByTestId('trip-stylist')).not.toBeDisabled();
  });

  it('gives the general message for any other failure', async () => {
    answers = { [REPLACE]: 1 };
    mockStyleTrip.mockRejectedValue(new Error('bad json'));
    await openTrip();
    fireEvent.press(screen.getByTestId('trip-stylist'));
    expect(await screen.findByText('The stylist could not answer. Please try again.')).toBeTruthy();
    expect(screen.getByTestId('trip-stylist')).not.toBeDisabled();
  });
});

describe('what a day is for', () => {
  const activity = (occasion: Occasion) => screen.getByTestId(`trip-activity-${DAY}-${occasion}`);

  it('sets the activity with an outfit for it, and clears it with a second tap', async () => {
    await openTrip();
    expect(activity('work')).toHaveTextContent('Work');
    expect(activity('work')).not.toBeChecked();

    fireEvent.press(activity('work'));
    await waitFor(() => expect(activity('work')).toBeChecked());
    expect(mockRepo.setDay).toHaveBeenCalledTimes(1);
    expect(mockRepo.setDay).toHaveBeenLastCalledWith(
      'trip-1',
      DAY,
      expect.objectContaining({ activity: 'work' }),
    );
    // The day gets another outfit along with it.
    const first = mockRepo.setDay.mock.calls[0][2].pieces!.map((piece) => piece.itemId).sort();
    expect(first.length).toBeGreaterThan(0);
    expect(first).not.toEqual(['jeans', 'tee']);

    // Another activity replaces the first: a day is for one thing.
    fireEvent.press(activity('party'));
    await waitFor(() => expect(activity('party')).toBeChecked());
    expect(activity('work')).not.toBeChecked();
    expect(mockRepo.setDay).toHaveBeenLastCalledWith(
      'trip-1',
      DAY,
      expect.objectContaining({ activity: 'party' }),
    );

    fireEvent.press(activity('party'));
    await waitFor(() => expect(activity('party')).not.toBeChecked());
    expect(mockRepo.setDay).toHaveBeenLastCalledWith(
      'trip-1',
      DAY,
      expect.objectContaining({ activity: null }),
    );
    expect(mockTrip!.days[0].activity).toBeNull();
  });

  it('keeps the outfit but still sets the activity when the closet has no other outfit', async () => {
    mockOwned = [item('tee', 'tops'), item('jeans', 'bottoms'), item('boots', 'shoes')];
    mockTrip = trip([tripDay(DAY, ['tee', 'jeans', 'boots'])]);
    await openTrip();

    fireEvent.press(screen.getByTestId(`trip-swap-${DAY}`));
    expect(await screen.findByText('There is no other outfit for this day.')).toBeTruthy();
    await settle();
    expect(mockRepo.setDay).not.toHaveBeenCalled();

    fireEvent.press(activity('sport'));
    await waitFor(() => expect(activity('sport')).toBeChecked());
    expect(mockRepo.setDay).toHaveBeenCalledTimes(1);
    expect(mockRepo.setDay).toHaveBeenCalledWith('trip-1', DAY, { activity: 'sport' });
    expect(mockTrip!.days[0].pieces.map((piece) => piece.itemId)).toEqual([
      'tee',
      'jeans',
      'boots',
    ]);
  });
});

describe('adding a trip to the calendar', () => {
  it('says there is nothing new when every day is in the calendar already', async () => {
    mockTrip = trip([tripDay(DAY, ['tee', 'jeans'], { outfitId: 'outfit-9' })]);
    await openTrip();
    fireEvent.press(screen.getByTestId('trip-calendar'));
    expect(await screen.findByText('Nothing new to add to the calendar')).toBeTruthy();
    expect(mockOutfitRepo.get).toHaveBeenCalledWith('outfit-9');
    expect(mockOutfitRepo.create).not.toHaveBeenCalled();
    expect(mockCalendar.plan).not.toHaveBeenCalled();
    expect(mockRepo.setDay).not.toHaveBeenCalled();
    expect(screen.getByTestId('trip-calendar')).not.toBeDisabled();
  });

  it('adds only the days that are not there yet, and says how many', async () => {
    mockTrip = trip([
      tripDay(DAY, ['tee', 'jeans'], { outfitId: 'outfit-9' }),
      tripDay(NEXT_DAY, ['shirt', 'chinos']),
    ]);
    await openTrip();
    fireEvent.press(screen.getByTestId('trip-calendar'));
    expect(await screen.findByText('Days added to the calendar: 1')).toBeTruthy();
    expect(mockOutfitRepo.create).toHaveBeenCalledTimes(1);
    expect(mockOutfitRepo.create).toHaveBeenCalledWith(pieces(['shirt', 'chinos']), {
      name: expect.stringMatching(/^Rome · /),
    });
    expect(mockRepo.setDay).toHaveBeenCalledWith('trip-1', NEXT_DAY, { outfitId: 'saved-outfit' });
    expect(mockCalendar.plan).toHaveBeenCalledTimes(1);
    expect(mockCalendar.plan).toHaveBeenCalledWith(NEXT_DAY, 'saved-outfit');
    expect(await screen.findByTestId(`trip-planned-${NEXT_DAY}`)).toHaveTextContent(
      'In the calendar',
    );
  });

  it('adds a day again when the outfit saved for it was deleted since', async () => {
    mockTrip = trip([tripDay(DAY, ['tee', 'jeans'], { outfitId: 'deleted-outfit' })]);
    mockOutfitRepo.get.mockResolvedValue(null);
    await openTrip();
    fireEvent.press(screen.getByTestId('trip-calendar'));
    expect(await screen.findByText('Days added to the calendar: 1')).toBeTruthy();
    expect(mockCalendar.plan).toHaveBeenCalledWith(DAY, 'saved-outfit');
    expect(mockTrip!.days[0].outfitId).toBe('saved-outfit');
  });
});

describe('packing list', () => {
  it('groups the pieces by category and says on which days each is worn', async () => {
    mockTrip = trip([tripDay(DAY, ['tee', 'jeans']), tripDay(NEXT_DAY, ['tee', 'chinos'])]);
    await openTrip();
    expect(screen.getByText('Packing list')).toBeTruthy();
    expect(screen.getByTestId('pack-tee')).toHaveTextContent(/tee.*Days: 1, 2/);
    expect(screen.getByTestId('pack-jeans')).toHaveTextContent(/Days: 1$/);
    expect(screen.getByTestId('pack-chinos')).toHaveTextContent(/Days: 2$/);
    // A piece worn on two days is packed once.
    expect(screen.getAllByTestId('pack-tee')).toHaveLength(1);
    expect(screen.getByTestId('trip-progress')).toHaveTextContent('0 of 3 packed');
    expect(
      screen
        .getAllByTestId(/^pack-(tee|jeans|chinos)$/)
        .map((row) => (row.props.testID as string).replace('pack-', '')),
    ).toEqual(['tee', 'jeans', 'chinos']);
  });

  it('adds a piece from the closet as an extra, ticks it, and removes it again', async () => {
    await openTrip();
    expect(screen.getByTestId('pack-item-toggle')).toHaveTextContent(/Add from closet/);
    expect(screen.queryByTestId('pack-add-boots')).toBeNull();

    fireEvent.press(screen.getByTestId('pack-item-toggle'));
    expect(screen.getByTestId('pack-item-toggle')).toHaveTextContent(/Done/);
    // Only what is not on the list yet is offered.
    expect(
      screen
        .getAllByTestId(/^pack-add-/)
        .map((tile) => (tile.props.testID as string).replace('pack-add-', '')),
    ).toEqual(['shirt', 'chinos', 'boots']);
    expect(screen.getByLabelText('boots')).toBe(screen.getByTestId('pack-add-boots'));

    fireEvent.press(screen.getByTestId('pack-add-boots'));
    expect(await screen.findByTestId('pack-boots')).toHaveTextContent(/boots.*Extra/);
    expect(mockRepo.addItem).toHaveBeenCalledTimes(1);
    expect(mockRepo.addItem).toHaveBeenCalledWith('trip-1', 'boots');
    expect(screen.getByText('Shoes')).toBeTruthy();
    expect(screen.getByTestId('trip-progress')).toHaveTextContent('0 of 3 packed');
    expect(screen.queryByTestId('pack-add-boots')).toBeNull();
    expect(screen.getByTestId('pack-add-shirt')).toBeTruthy();

    fireEvent.press(screen.getByTestId('pack-boots'));
    await waitFor(() => expect(screen.getByTestId('pack-boots')).toBeChecked());
    expect(mockRepo.setItemPacked).toHaveBeenCalledWith('trip-1', 'boots', true);
    expect(screen.getByTestId('trip-progress')).toHaveTextContent('1 of 3 packed');

    // An extra can be taken off the list; a piece of an outfit cannot.
    expect(screen.queryByTestId('pack-tee-remove')).toBeNull();
    fireEvent.press(screen.getByTestId('pack-boots-remove'));
    await settle();
    expect(screen.queryByTestId('pack-boots')).toBeNull();
    expect(mockRepo.removeEntry).toHaveBeenCalledTimes(1);
    expect(mockRepo.removeEntry).toHaveBeenCalledWith('trip-1', 'boots');
    expect(screen.getByTestId('trip-progress')).toHaveTextContent('0 of 2 packed');
    expect(screen.getByTestId('pack-add-boots')).toBeTruthy();

    fireEvent.press(screen.getByTestId('pack-item-toggle'));
    expect(screen.queryByTestId('pack-add-boots')).toBeNull();
    expect(screen.getByTestId('pack-item-toggle')).toHaveTextContent(/Add from closet/);
  });

  it('unticks a packed piece', async () => {
    mockTrip = trip(
      [tripDay(DAY, ['tee', 'jeans'])],
      [{ key: 'tee', kind: 'item', label: null, packed: true }],
    );
    await openTrip();
    expect(screen.getByTestId('pack-tee')).toBeChecked();
    expect(screen.getByTestId('trip-progress')).toHaveTextContent('1 of 2 packed');
    fireEvent.press(screen.getByTestId('pack-tee'));
    await waitFor(() => expect(screen.getByTestId('pack-tee')).not.toBeChecked());
    expect(mockRepo.setItemPacked).toHaveBeenCalledWith('trip-1', 'tee', false);
    expect(screen.getByTestId('trip-progress')).toHaveTextContent('0 of 2 packed');
  });

  it('adds a free-text entry only when something was typed, and clears the field', async () => {
    await openTrip();
    expect(screen.getByTestId('pack-text-add')).toBeDisabled();
    fireEvent.changeText(screen.getByTestId('pack-text-input'), '   ');
    expect(screen.getByTestId('pack-text-add')).toBeDisabled();
    fireEvent.press(screen.getByTestId('pack-text-add'));

    fireEvent.changeText(screen.getByTestId('pack-text-input'), 'Charger');
    fireEvent.press(screen.getByTestId('pack-text-add'));
    expect(await screen.findByTestId('pack-text-new-text')).toHaveTextContent(/Charger$/);
    expect(mockRepo.addText).toHaveBeenCalledTimes(1);
    expect(mockRepo.addText).toHaveBeenCalledWith('trip-1', 'Charger');
    expect(screen.getByTestId('pack-text-input').props.value).toBe('');
    expect(screen.getByTestId('pack-text-add')).toBeDisabled();
  });

  it('ticks a free-text entry and removes it', async () => {
    mockTrip = trip(
      [tripDay(DAY, ['tee', 'jeans'])],
      [
        { key: 't1', kind: 'text', label: 'Passport', packed: false },
        { key: 't2', kind: 'text', label: 'Charger', packed: true },
      ],
    );
    await openTrip();
    expect(screen.getByTestId('pack-text-t1')).toHaveTextContent(/Passport$/);
    expect(screen.getByTestId('pack-text-t1')).not.toBeChecked();
    expect(screen.getByTestId('pack-text-t2')).toBeChecked();
    expect(screen.getByTestId('trip-progress')).toHaveTextContent('1 of 4 packed');

    fireEvent.press(screen.getByTestId('pack-text-t1'));
    await waitFor(() => expect(screen.getByTestId('pack-text-t1')).toBeChecked());
    expect(mockRepo.setTextPacked).toHaveBeenCalledWith('trip-1', 't1', true);
    expect(screen.getByTestId('trip-progress')).toHaveTextContent('2 of 4 packed');

    expect(screen.getAllByLabelText('Remove')).toHaveLength(2);
    fireEvent.press(screen.getByTestId('pack-text-t1-remove'));
    await settle();
    expect(screen.queryByTestId('pack-text-t1')).toBeNull();
    expect(mockRepo.removeEntry).toHaveBeenCalledTimes(1);
    expect(mockRepo.removeEntry).toHaveBeenCalledWith('trip-1', 't1');
    expect(screen.getByTestId('pack-text-t2')).toBeTruthy();
    expect(screen.getByTestId('trip-progress')).toHaveTextContent('1 of 3 packed');
  });
});

describe('deleting a trip', () => {
  it('asks first and keeps the trip on cancel', async () => {
    answers = { [DELETE]: 0 };
    await openTrip();
    expect(screen.getByTestId('trip-delete')).toHaveTextContent('Delete trip');
    fireEvent.press(screen.getByTestId('trip-delete'));
    expect(alert).toHaveBeenCalledWith(
      'Delete this trip?',
      'Outfits already added to the calendar are kept.',
      [
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Delete', style: 'destructive' }),
      ],
    );
    await settle();
    expect(mockRepo.remove).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(screen.queryByText('Trip deleted')).toBeNull();
    expect(screen.getByTestId('trip-title')).toBeTruthy();
  });

  it('deletes after confirmation, leaves the screen, and can be undone', async () => {
    answers = { [DELETE]: 1 };
    await openTrip();
    fireEvent.press(screen.getByTestId('trip-delete'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Trip deleted')).toBeTruthy();
    expect(mockRepo.remove).toHaveBeenCalledTimes(1);
    expect(mockRepo.remove).toHaveBeenCalledWith('trip-1');
    // Whoever still shows it reads it again and finds it gone.
    expect(await screen.findByText('This trip no longer exists.')).toBeTruthy();

    expect(screen.getByText('Undo')).toBeTruthy();
    fireEvent.press(screen.getByTestId('toast-action'));
    await waitFor(() => expect(mockRepo.restore).toHaveBeenCalledWith('trip-1'));
    expect(await screen.findByTestId('trip-title')).toHaveTextContent('Rome');
    expect(screen.queryByText('Trip deleted')).toBeNull();
    expect(mockRepo.restore).toHaveBeenCalledTimes(1);
  });
});
