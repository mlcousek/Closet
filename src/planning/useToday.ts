import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { today, type Day } from './dates';

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
