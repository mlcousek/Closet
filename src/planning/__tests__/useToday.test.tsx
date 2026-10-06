import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { useToday } from '../useToday';

describe('useToday', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('moves on to the next day while the screen stays open', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 6, 23, 59, 30));
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe('2026-10-06');

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe('2026-10-07');
  });

  it('checks the date when the app comes back to the foreground', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 6, 22, 0, 0));
    let listener: (state: string) => void = () => {};
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listener = handler as (state: string) => void;
      return { remove } as never;
    });
    const { result, unmount } = renderHook(() => useToday());

    // The phone slept through the night; timers did not run.
    jest.setSystemTime(new Date(2026, 9, 7, 7, 30, 0));
    act(() => listener('background'));
    expect(result.current).toBe('2026-10-06');
    act(() => listener('active'));
    expect(result.current).toBe('2026-10-07');

    unmount();
    expect(remove).toHaveBeenCalled();
  });
});
