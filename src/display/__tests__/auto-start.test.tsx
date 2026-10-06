import { act, renderHook } from '@testing-library/react-native';
import { BatteryState } from 'expo-battery';
import { AppState, type AppStateStatus } from 'react-native';

import { displayState } from '../settings';
import { useDisplayAutoStart } from '../useAutoStart';

jest.mock('expo-sqlite', () => ({}));

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const mockSettings = new Map<string, string>();
jest.mock('@/db/settings', () => ({
  getSetting: (key: string) => mockSettings.get(key) ?? null,
  setSetting: (key: string, value: string | null) =>
    void (value === null ? mockSettings.delete(key) : mockSettings.set(key, value)),
}));

type BatteryListener = (event: { batteryState: number }) => void;
const mockBattery = {
  read: jest.fn(async (): Promise<number> => 1),
  listeners: [] as BatteryListener[],
};
jest.mock('expo-battery', () => ({
  BatteryState: { UNKNOWN: 0, UNPLUGGED: 1, CHARGING: 2, FULL: 3 },
  getBatteryStateAsync: () => mockBattery.read(),
  addBatteryStateListener: (listener: BatteryListener) => {
    mockBattery.listeners.push(listener);
    return {
      remove: () => {
        mockBattery.listeners = mockBattery.listeners.filter((entry) => entry !== listener);
      },
    };
  },
}));

let appListeners: ((state: AppStateStatus) => void)[] = [];

const flush = () => act(async () => {});
/** The system reports a battery change to whoever is still listening. */
const battery = (batteryState: BatteryState) =>
  act(async () => mockBattery.listeners.forEach((listener) => listener({ batteryState })));
/** The app moves between foreground, inactive and background. */
const app = (...states: AppStateStatus[]) =>
  act(async () => {
    for (const state of states) appListeners.forEach((listener) => listener(state));
  });

const start = async (state: BatteryState) => {
  mockBattery.read.mockResolvedValue(state);
  const hook = renderHook(() => useDisplayAutoStart());
  await flush();
  return hook;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.clear();
  mockSettings.set('display.startWhileCharging', '1');
  mockBattery.listeners = [];
  mockBattery.read.mockResolvedValue(BatteryState.UNPLUGGED);
  appListeners = [];
  displayState.open = false;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    const handler = listener as (state: AppStateStatus) => void;
    appListeners.push(handler);
    return {
      remove: () => {
        appListeners = appListeners.filter((entry) => entry !== handler);
      },
    } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  displayState.open = false;
  jest.restoreAllMocks();
});

describe('display auto start', () => {
  it('opens the display when the app starts on the charger and the setting is on', async () => {
    await start(BatteryState.CHARGING);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith('/display');
  });

  it('counts a full battery on the charger as charging', async () => {
    await start(BatteryState.FULL);
    expect(mockRouter.push).toHaveBeenCalledWith('/display');
  });

  it('stays closed when the setting is off', async () => {
    mockSettings.clear();
    await start(BatteryState.CHARGING);
    await battery(BatteryState.CHARGING);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('stays closed on battery, and when the state is unknown', async () => {
    await start(BatteryState.UNPLUGGED);
    await battery(BatteryState.UNKNOWN);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('opens when the charger is plugged in later', async () => {
    await start(BatteryState.UNPLUGGED);
    expect(mockRouter.push).not.toHaveBeenCalled();
    await battery(BatteryState.CHARGING);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith('/display');
  });

  it('opens once per time on the charger, and again after unplugging and plugging in', async () => {
    await start(BatteryState.CHARGING);
    // Reaching a full battery is another event on the same charger.
    await battery(BatteryState.CHARGING);
    await battery(BatteryState.FULL);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);

    await battery(BatteryState.UNPLUGGED);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    await battery(BatteryState.CHARGING);
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });

  it('does not open on top of a display that is already showing', async () => {
    displayState.open = true;
    await start(BatteryState.CHARGING);
    await battery(BatteryState.CHARGING);
    expect(mockRouter.push).not.toHaveBeenCalled();

    // Once the display was closed, the next report from the charger opens it.
    displayState.open = false;
    await battery(BatteryState.CHARGING);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('opens when the setting is turned on while already charging', async () => {
    mockSettings.clear();
    await start(BatteryState.CHARGING);
    expect(mockRouter.push).not.toHaveBeenCalled();
    mockSettings.set('display.startWhileCharging', '1');
    await battery(BatteryState.CHARGING);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('does not bring the display back when the app was only inactive for a moment', async () => {
    await start(BatteryState.CHARGING);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    // Control Centre, a permission alert or Face ID.
    await app('inactive', 'active');
    await app('inactive', 'active');
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    // The battery is not even asked again.
    expect(mockBattery.read).toHaveBeenCalledTimes(1);
  });

  it('opens again after a real return from the background while on the charger', async () => {
    await start(BatteryState.CHARGING);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    await app('inactive', 'background', 'inactive', 'active');
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
    // One return counts once.
    await app('inactive', 'active');
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });

  it('notices a charger that was plugged in while the app was in the background', async () => {
    await start(BatteryState.UNPLUGGED);
    mockBattery.read.mockResolvedValue(BatteryState.CHARGING);
    await app('background', 'active');
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('stays closed after a return from the background on battery', async () => {
    await start(BatteryState.CHARGING);
    mockBattery.read.mockResolvedValue(BatteryState.UNPLUGGED);
    await app('background', 'active');
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('stops listening when it is unmounted', async () => {
    const hook = await start(BatteryState.UNPLUGGED);
    expect(mockBattery.listeners).toHaveLength(1);
    expect(appListeners).toHaveLength(1);

    hook.unmount();
    expect(mockBattery.listeners).toHaveLength(0);
    expect(appListeners).toHaveLength(0);
    await battery(BatteryState.CHARGING);
    await app('background', 'active');
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('never opens by itself on a device that cannot report its battery', async () => {
    mockBattery.read.mockRejectedValue(new Error('no battery'));
    renderHook(() => useDisplayAutoStart());
    await flush();
    await app('background', 'active');
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockBattery.read).toHaveBeenCalledTimes(2);
  });
});
