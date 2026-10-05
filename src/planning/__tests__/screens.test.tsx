import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import CalendarScreen from '@/app/(tabs)/calendar';
import HomeScreen from '@/app/(tabs)/index';
import type { Item } from '@/closet/types';
import type { Outfit } from '@/outfits/repository';

import type { CalendarEntry } from '../calendar';
import { addDays, today, weekOf } from '../dates';
import { DayPanel } from '../DayPanel';
import { PlanningSettings } from '../PlanningSettings';
import { parseTime, restoreReminder, setReminder } from '../reminder';
import type { Suggestion } from '../suggestions';
import { WearStats } from '../WearStats';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View {...props} /> };
});
jest.mock('expo-localization', () => ({ getLocales: () => [{ regionCode: 'CZ' }] }));
jest.mock('expo-location', () => ({}));
const mockNotifications = {
  granted: true,
  scheduled: [] as object[],
  cancelled: 0,
};
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  getPermissionsAsync: async () => ({ granted: mockNotifications.granted }),
  requestPermissionsAsync: async () => ({ granted: mockNotifications.granted }),
  scheduleNotificationAsync: async (request: object) =>
    void mockNotifications.scheduled.push(request),
  cancelScheduledNotificationAsync: async () => void mockNotifications.cancelled++,
}));
jest.mock('@/storage/imageStore', () => ({
  imageStore: { uri: (path: string) => `file:///documents/${path}` },
}));

const mockSettings = new Map<string, string>();
jest.mock('@/db/settings', () => ({
  getSetting: (key: string) => mockSettings.get(key) ?? null,
  setSetting: (key: string, value: string | null) =>
    void (value === null ? mockSettings.delete(key) : mockSettings.set(key, value)),
}));

const piece = (id: string): Item =>
  ({
    id,
    thumbPath: `${id}.jpg`,
    ownership: 'owned',
    category: 'tops',
    colours: [],
    seasons: [],
  }) as never;
const outfit = (id: string, name = id): Outfit => ({
  id,
  createdAt: 1,
  name,
  notes: null,
  favourite: false,
  seasons: [],
  occasions: [],
  entries: [{ item: piece(`${id}-top`), slot: 'top', position: 0 }],
});
let mockOutfits: Outfit[] = [];
const mockOutfitRepo = { create: jest.fn(async (..._args: unknown[]) => outfit('created')) };
jest.mock('@/outfits/repository', () => ({
  hasWishlistItem: () => false,
  outfitRepository: { create: (...args: unknown[]) => mockOutfitRepo.create(...args) },
}));
jest.mock('@/outfits/useOutfits', () => ({
  useOutfits: () => ({ data: mockOutfits, isPending: false }),
  useInvalidateOutfits: () => async () => {},
  useRenderSummary: () => () => ({
    current: null,
    previous: null,
    pending: null,
    failed: null,
    outdated: false,
  }),
}));
jest.mock('@/outfits/renderActions', () => ({ isAutoRenderOn: () => false }));
jest.mock('@/outfits/useRenderRequest', () => ({ useRenderRequest: () => jest.fn() }));
let mockItemCount = 5;
jest.mock('@/closet/useItems', () => ({
  useItemCount: () => ({ data: mockItemCount, isPending: false }),
}));
jest.mock('@/profile/useProfile', () => ({ useProfile: () => ({ data: { name: 'Auri' } }) }));

const mockCalendar = {
  plan: jest.fn(async (..._args: unknown[]) => ({})),
  logWorn: jest.fn(async (..._args: unknown[]) => ({})),
  markWorn: jest.fn(async (..._args: unknown[]) => {}),
  replaceOutfit: jest.fn(async (..._args: unknown[]) => {}),
  move: jest.fn(async (..._args: unknown[]) => {}),
  remove: jest.fn(async (..._args: unknown[]) => {}),
  restore: jest.fn(async (..._args: unknown[]) => {}),
};
jest.mock('../calendar', () => ({
  ...jest.requireActual('../calendar'),
  calendarRepository: {
    plan: (...args: unknown[]) => mockCalendar.plan(...args),
    logWorn: (...args: unknown[]) => mockCalendar.logWorn(...args),
    markWorn: (...args: unknown[]) => mockCalendar.markWorn(...args),
    replaceOutfit: (...args: unknown[]) => mockCalendar.replaceOutfit(...args),
    move: (...args: unknown[]) => mockCalendar.move(...args),
    remove: (...args: unknown[]) => mockCalendar.remove(...args),
    restore: (...args: unknown[]) => mockCalendar.restore(...args),
  },
}));

let mockEntries = new Map<string, CalendarEntry[]>();
let mockSuggestions: Suggestion[] = [];
let mockWeather: object | undefined;
let mockStats = { count: 0, lastWorn: null as string | null };
let mockStreak = 0;
const mockInvalidateWeather = jest.fn(async () => {});
jest.mock('../usePlanning', () => ({
  useInvalidatePlanning: () => async () => {},
  useInvalidateWeather: () => mockInvalidateWeather,
  useWeather: () => ({ data: mockWeather }),
  weatherFor: () => null,
  useCalendar: () => ({ data: mockEntries }),
  useStreak: () => ({ data: mockStreak }),
  useWearStats: () => ({ data: mockStats }),
  useSuggestions: () => ({
    profile: {
      band: 3,
      needsOuter: false,
      rain: false,
      season: 'autumn',
      source: 'forecast',
      temperature: 16,
    },
    suggestions: mockSuggestions,
    ready: true,
  }),
}));
const mockSearch = jest.fn();
jest.mock('../weather', () => ({
  ...jest.requireActual('../weather'),
  searchPlaces: (...args: unknown[]) => mockSearch(...args),
}));

const TODAY = today();
const entry = (
  id: string,
  day: string,
  outfitId: string,
  state: 'planned' | 'worn',
): CalendarEntry => ({
  id,
  day,
  outfitId,
  state,
  position: 0,
});
const suggestionOf = (source: Outfit | null, id = 'new'): Suggestion => ({
  outfit: source,
  items: source
    ? source.entries.map((candidate) => candidate.item)
    : [piece(`${id}-a`), piece(`${id}-b`)],
  pieces: [{ itemId: `${id}-a`, slot: 'top', position: 0 }],
  score: 90,
  reason: 'mild',
});
const byId = () => new Map(mockOutfits.map((candidate) => [candidate.id, candidate]));
const panel = (day: string, entries: CalendarEntry[] = []) =>
  render(<DayPanel day={day} entries={entries} outfitsById={byId()} temperature={16} />);

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.clear();
  mockOutfits = [outfit('o1', 'Friday'), outfit('o2', 'Sunday')];
  mockEntries = new Map();
  mockSuggestions = [];
  mockWeather = undefined;
  mockItemCount = 5;
  mockStats = { count: 0, lastWorn: null };
  mockStreak = 0;
  Object.assign(mockNotifications, { granted: true, scheduled: [], cancelled: 0 });
});

describe('day panel', () => {
  it('suggests an outfit for today with a reason, and offers another', async () => {
    mockSuggestions = [suggestionOf(mockOutfits[0]), suggestionOf(mockOutfits[1])];
    panel(TODAY);
    expect(screen.getByTestId('suggestion-reason')).toHaveTextContent(/mild day \(16°C\)/);
    fireEvent.press(screen.getByTestId('suggestion-another'));
    fireEvent.press(screen.getByTestId('suggestion-accept'));
    await waitFor(() => expect(mockCalendar.plan).toHaveBeenCalledWith(TODAY, 'o2'));
  });

  it('saves a new combination as an outfit before planning it, and marks it as new', async () => {
    mockSuggestions = [suggestionOf(null)];
    panel(TODAY);
    expect(screen.getByTestId('suggestion-collage')).toBeTruthy();
    expect(screen.getByTestId('suggestion-reason')).toHaveTextContent(/new combination/);
    fireEvent.press(screen.getByTestId('suggestion-accept'));
    await waitFor(() => expect(mockOutfitRepo.create).toHaveBeenCalled());
    await waitFor(() => expect(mockCalendar.plan).toHaveBeenCalledWith(TODAY, 'created'));
  });

  it('shows a planned outfit for today with an action to mark it as worn', async () => {
    panel(TODAY, [entry('e1', TODAY, 'o1', 'planned')]);
    expect(screen.getByTestId('day-entry-state-e1')).toHaveTextContent('Planned');
    expect(screen.queryByTestId('day-suggestion')).toBeNull();
    fireEvent.press(screen.getByTestId('day-mark-worn-e1'));
    await waitFor(() => expect(mockCalendar.markWorn).toHaveBeenCalledWith('e1'));
  });

  it('shows a past plan as not confirmed, with one tap to confirm', () => {
    const yesterday = addDays(TODAY, -1);
    panel(yesterday, [entry('e1', yesterday, 'o1', 'planned')]);
    expect(screen.getByTestId('day-entry-state-e1')).toHaveTextContent('Planned, not confirmed');
    expect(screen.getByTestId('day-mark-worn-e1')).toBeTruthy();
  });

  it('lets a future day be planned but not marked as worn', async () => {
    const tomorrow = addDays(TODAY, 1);
    const view = panel(tomorrow, [entry('e1', tomorrow, 'o1', 'planned')]);
    expect(screen.queryByTestId('day-mark-worn-e1')).toBeNull();
    view.unmount();

    mockSuggestions = [suggestionOf(mockOutfits[0])];
    panel(tomorrow);
    expect(screen.getByText('Plan this')).toBeTruthy();
    fireEvent.press(screen.getByTestId('day-add'));
    fireEvent.press(screen.getByTestId('pick-outfit-o2'));
    await waitFor(() => expect(mockCalendar.plan).toHaveBeenCalledWith(tomorrow, 'o2'));
    expect(mockCalendar.logWorn).not.toHaveBeenCalled();
  });

  it('logs what was worn on an empty past day', async () => {
    const past = addDays(TODAY, -3);
    panel(past);
    expect(screen.getByTestId('day-empty')).toBeTruthy();
    expect(screen.queryByTestId('day-suggestion')).toBeNull();
    fireEvent.press(screen.getByText('Log what you wore'));
    fireEvent.press(screen.getByTestId('pick-outfit-o1'));
    await waitFor(() => expect(mockCalendar.logWorn).toHaveBeenCalledWith(past, 'o1'));
  });

  it('replaces, moves and removes a plan', async () => {
    panel(TODAY, [entry('e1', TODAY, 'o1', 'planned')]);
    fireEvent.press(screen.getByTestId('day-replace-e1'));
    fireEvent.press(screen.getByTestId('pick-outfit-o2'));
    await waitFor(() => expect(mockCalendar.replaceOutfit).toHaveBeenCalledWith('e1', 'o2'));

    fireEvent.press(screen.getByTestId('day-move-e1'));
    const target = addDays(TODAY, 2);
    fireEvent.press(screen.getByTestId(`pick-day-${target}`));
    await waitFor(() => expect(mockCalendar.move).toHaveBeenCalledWith('e1', target));

    await act(async () => {
      fireEvent.press(screen.getByTestId('day-remove-e1'));
    });
    expect(mockCalendar.remove).toHaveBeenCalledWith('e1');
  });

  it('shows two outfits on one day and offers to add another', () => {
    panel(TODAY, [
      entry('e1', TODAY, 'o1', 'worn'),
      { ...entry('e2', TODAY, 'o2', 'worn'), position: 1 },
    ]);
    expect(screen.getByTestId('day-entry-e1')).toBeTruthy();
    expect(screen.getByTestId('day-entry-e2')).toBeTruthy();
    expect(screen.getByText('Add another outfit')).toBeTruthy();
    // A worn outfit is not moved; it is removed and logged again.
    expect(screen.queryByTestId('day-move-e1')).toBeNull();
  });
});

describe('home', () => {
  it('shows the greeting, the week with today marked, and the outfit for today', () => {
    mockEntries = new Map([[TODAY, [entry('e1', TODAY, 'o1', 'planned')]]]);
    mockWeather = {
      status: 'fresh',
      weather: {
        fetchedAt: Date.now(),
        current: { temperature: 15, feelsLike: 14, code: 61 },
        days: [],
        place: {},
      },
    };
    render(<HomeScreen />);
    expect(screen.getByTestId('greeting')).toHaveTextContent(/^Good \w+, Auri$/);
    expect(screen.getByTestId('weather-chip')).toHaveTextContent(/14°C.*Rain/);
    expect(screen.getByTestId(`week-day-${TODAY}`)).toBeSelected();
    expect(screen.getByTestId(`day-panel-${TODAY}`)).toBeTruthy();
    expect(screen.getByTestId('day-entry-e1')).toBeTruthy();
  });

  it('shows another day of the week when it is tapped', () => {
    render(<HomeScreen />);
    const other = addDays(TODAY, TODAY === weekOf(TODAY)[6] ? -1 : 1);
    fireEvent.press(screen.getByTestId(`week-day-${other}`));
    expect(screen.getByTestId(`day-panel-${other}`)).toBeTruthy();
  });

  it('says when the weather is old, unavailable, or needs a city', () => {
    mockWeather = {
      status: 'stale',
      weather: {
        fetchedAt: Date.now() - 3 * 3_600_000,
        current: { temperature: 15, feelsLike: 14, code: 0 },
        days: [],
        place: {},
      },
    };
    const view = render(<HomeScreen />);
    expect(screen.getByTestId('weather-stale')).toHaveTextContent('updated 3 h ago');
    mockWeather = { status: 'unavailable', weather: null };
    view.rerender(<HomeScreen />);
    expect(screen.getByTestId('weather-unavailable')).toBeTruthy();
    mockWeather = { status: 'needsCity', weather: null };
    view.rerender(<HomeScreen />);
    fireEvent.press(screen.getByTestId('weather-needs-city'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings');
  });

  it('prompts to add items when the closet is empty, and links to the calendar', () => {
    mockItemCount = 0;
    mockOutfits = [];
    render(<HomeScreen />);
    expect(screen.getByText('Add your first item')).toBeTruthy();
    expect(screen.queryByTestId(`day-panel-${TODAY}`)).toBeNull();
    fireEvent.press(screen.getByTestId('open-calendar'));
    expect(mockRouter.push).toHaveBeenCalledWith('/calendar');
  });
});

describe('calendar', () => {
  it('shows the current month with today selected, the streak, and more-than-one marks', () => {
    mockStreak = 5;
    mockEntries = new Map([
      [
        TODAY,
        [entry('e1', TODAY, 'o1', 'worn'), { ...entry('e2', TODAY, 'o2', 'worn'), position: 1 }],
      ],
    ]);
    render(<CalendarScreen />);
    expect(screen.getByTestId('streak')).toHaveTextContent('5');
    expect(screen.getByTestId(`calendar-day-${TODAY}`)).toBeSelected();
    expect(screen.getByTestId(`calendar-more-${TODAY}`)).toHaveTextContent('+1');
    expect(screen.getByTestId(`day-panel-${TODAY}`)).toBeTruthy();
  });

  it('moves to the previous month and back', () => {
    render(<CalendarScreen />);
    const title = screen.getByTestId('month-title').props.children;
    fireEvent.press(screen.getByTestId('month-previous'));
    expect(screen.getByTestId('month-title').props.children).not.toBe(title);
    expect(screen.queryByTestId(`calendar-day-${TODAY}`)).toBeNull();
    fireEvent.press(screen.getByTestId('month-next'));
    expect(screen.getByTestId('month-title').props.children).toBe(title);
    expect(screen.getByTestId(`calendar-day-${TODAY}`)).toBeSelected();
  });
});

describe('wear history', () => {
  it('shows the wear count and the last day', () => {
    mockStats = { count: 3, lastWorn: '2026-09-30' };
    render(<WearStats kind="item" id="i1" />);
    expect(screen.getByTestId('wear-stats')).toHaveTextContent(/Worn 3 times · last on .*30.*2026/);
  });

  it('says when something was never worn', () => {
    render(<WearStats kind="outfit" id="o1" />);
    expect(screen.getByTestId('wear-stats')).toHaveTextContent('Not worn yet');
  });
});

describe('planning settings', () => {
  it('searches for a city, uses it, and can go back to the device location', async () => {
    mockSearch.mockResolvedValue([{ name: 'Brno, Czechia', latitude: 49.19, longitude: 16.61 }]);
    render(<PlanningSettings />);
    expect(screen.getByTestId('weather-city')).toHaveTextContent('Using your approximate location');
    fireEvent.changeText(screen.getByTestId('city-search'), 'Brno');
    fireEvent.press(screen.getByTestId('city-search-go'));
    fireEvent.press(await screen.findByTestId('city-result-0'));
    await waitFor(() =>
      expect(screen.getByTestId('weather-city')).toHaveTextContent('Brno, Czechia'),
    );
    expect(JSON.parse(mockSettings.get('weather.city')!)).toMatchObject({ latitude: 49.19 });
    expect(mockInvalidateWeather).toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('city-clear'));
    await waitFor(() => expect(mockSettings.has('weather.city')).toBe(false));
  });

  it('switches the temperature unit', () => {
    render(<PlanningSettings />);
    expect(screen.getByTestId('unit-celsius')).toBeChecked();
    fireEvent.press(screen.getByTestId('unit-fahrenheit'));
    expect(mockSettings.get('weather.unit')).toBe('fahrenheit');
  });

  it('turns the reminder on at a valid time and off again', async () => {
    render(<PlanningSettings />);
    fireEvent.changeText(screen.getByTestId('reminder-time'), 'soon');
    fireEvent.press(screen.getByTestId('reminder-toggle'));
    expect(await screen.findByTestId('planning-notice')).toHaveTextContent(
      'Enter a time like 7:30.',
    );

    fireEvent.changeText(screen.getByTestId('reminder-time'), '7:30');
    fireEvent.press(screen.getByTestId('reminder-toggle'));
    expect(await screen.findByTestId('reminder-on')).toBeTruthy();
    expect(mockNotifications.scheduled).toEqual([
      expect.objectContaining({ trigger: { type: 'daily', hour: 7, minute: 30 } }),
    ]);

    fireEvent.press(screen.getByTestId('reminder-toggle'));
    await waitFor(() => expect(screen.queryByTestId('reminder-on')).toBeNull());
    expect(mockSettings.has('reminder.time')).toBe(false);
  });

  it('explains when notifications are not allowed and leaves the reminder off', async () => {
    mockNotifications.granted = false;
    render(<PlanningSettings />);
    fireEvent.changeText(screen.getByTestId('reminder-time'), '7:30');
    fireEvent.press(screen.getByTestId('reminder-toggle'));
    expect(await screen.findByTestId('reminder-denied')).toBeTruthy();
    expect(mockNotifications.scheduled).toEqual([]);
    expect(screen.queryByTestId('reminder-on')).toBeNull();
  });
});

describe('reminder', () => {
  const text = { title: 'T', body: 'B' };

  it('reads times of day', () => {
    expect(parseTime('7:30')).toEqual({ hour: 7, minute: 30 });
    expect(parseTime('07.05')).toEqual({ hour: 7, minute: 5 });
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('7:75')).toBeNull();
    expect(parseTime('half past seven')).toBeNull();
  });

  it('schedules the stored reminder again on app start, replacing the old one', async () => {
    mockSettings.set('reminder.time', JSON.stringify({ hour: 8, minute: 0 }));
    await restoreReminder(text);
    expect(mockNotifications.cancelled).toBe(1);
    expect(mockNotifications.scheduled).toHaveLength(1);
  });

  it('does nothing on app start when the reminder is off', async () => {
    await restoreReminder(text);
    expect(mockNotifications.scheduled).toEqual([]);
  });

  it('delivers no further reminders after it is turned off', async () => {
    await setReminder({ hour: 8, minute: 0 }, text);
    expect(await setReminder(null, text)).toBe(true);
    expect(mockNotifications.cancelled).toBe(2);
    expect(mockSettings.has('reminder.time')).toBe(false);
  });
});
