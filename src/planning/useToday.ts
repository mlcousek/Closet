import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { today, type Day } from './dates';

/**
 * The current time, to the minute. For what depends on the hour and not only
 * on the date, such as a greeting or the age of the weather.
 */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  return now;
}

/**
 * Today's date, kept current. The tabs stay mounted for as long as the app
 * lives, so without this a screen opened yesterday would still say it is
 * yesterday when the app is picked up in the morning.
 */
export function useToday(): Day {
  const [day, setDay] = useState<Day>(today);
  useEffect(() => {
    // Setting the same day again changes nothing, so checking often is free.
    const check = () => setDay(today());
    const timer = setInterval(check, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  return day;
}
