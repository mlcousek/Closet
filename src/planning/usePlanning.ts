import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import { useItems } from '@/closet/useItems';
import { useOutfits } from '@/outfits/useOutfits';

import { calendarRepository, type CalendarEntry } from './calendar';
import { addDays, today, type Day } from './dates';
import { getChosenCity, resolvePlace, weatherStore } from './settings';
import { RULES, dayProfile, suggest, type DayProfile, type Suggestion } from './suggestions';
import { loadWeather, type DayWeather, type WeatherResult } from './weather';

const CALENDAR = 'calendar';
const WEATHER = 'weather';

export function useInvalidatePlanning() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: [CALENDAR] });
}

export function useInvalidateWeather() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: [WEATHER] });
}

export type WeatherState = WeatherResult | { status: 'needsCity'; weather: null };

/** Weather for the chosen city or the device location; says when a city has to be chosen. */
export function useWeather() {
  return useQuery({
    queryKey: [WEATHER],
    queryFn: async (): Promise<WeatherState> => {
      const place = await resolvePlace();
      if (place.status === 'needsCity') {
        const cached = await loadWeather(null, weatherStore);
        return cached.weather ? cached : { status: 'needsCity', weather: null };
      }
      return loadWeather(place.place, weatherStore);
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function weatherFor(state: WeatherState | undefined, day: Day): DayWeather | null {
  return state?.weather?.days.find((entry) => entry.day === day) ?? null;
}

/** Calendar entries of a range of days, grouped by day in their order within the day. */
export function useCalendar(from: Day, to: Day) {
  return useQuery({
    queryKey: [CALENDAR, 'range', from, to],
    queryFn: async () => {
      const byDay = new Map<Day, CalendarEntry[]>();
      for (const entry of await calendarRepository.range(from, to)) {
        byDay.set(entry.day, [...(byDay.get(entry.day) ?? []), entry]);
      }
      return byDay;
    },
    placeholderData: keepPreviousData,
  });
}

export function useStreak() {
  return useQuery({ queryKey: [CALENDAR, 'streak'], queryFn: () => calendarRepository.streak() });
}

export function useWearStats(kind: 'item' | 'outfit', id: string) {
  return useQuery({
    queryKey: [CALENDAR, 'stats', kind, id],
    queryFn: () =>
      kind === 'item' ? calendarRepository.itemStats(id) : calendarRepository.outfitStats(id),
  });
}

/** Suggestions for a day from its forecast (or the season), saved outfits, the closet and recent wear. */
export function useSuggestions(day: Day): {
  profile: DayProfile;
  suggestions: Suggestion[];
  ready: boolean;
} {
  const { data: weather } = useWeather();
  const { data: outfits, isPending: outfitsPending } = useOutfits({});
  const { data: owned, isPending: itemsPending } = useItems({});
  const { data: history } = useQuery({
    queryKey: [CALENDAR, 'history', today(), owned?.length ?? 0],
    queryFn: async () => {
      const recent = await calendarRepository.recentlyWorn(addDays(today(), -RULES.recentDays));
      return {
        recentOutfitIds: recent.outfitIds,
        recentItemIds: recent.itemIds,
        wearCounts: await calendarRepository.wearCounts((owned ?? []).map((item) => item.id)),
      };
    },
  });
  // Without weather the chosen city still says which hemisphere the seasons follow.
  const southern = (weather?.weather?.place.latitude ?? getChosenCity()?.latitude ?? 1) < 0;
  const profile = dayProfile(day, weatherFor(weather, day), southern);
  return {
    profile,
    ready: !outfitsPending && !itemsPending,
    suggestions: suggest({ day, profile, outfits: outfits ?? [], owned: owned ?? [], history }),
  };
}
