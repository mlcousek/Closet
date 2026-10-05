import type Anthropic from '@anthropic-ai/sdk';

import type { Item } from '@/closet/types';
import { dayProfile } from '@/planning/suggestions';
import { proposeOutfits, type StylistRequest } from '@/stylist/stylist';

import { tripWeather, type TripWeather } from './forecast';
import { planTrip, shoeLimitFor, type TripDayInput } from './plan';
import { tripRepository, type Trip, type TripRepository } from './repository';

/** What each day of a trip asks of an outfit, from its weather or, without any, the season. */
export function dayInputs(trip: Trip, weather: TripWeather[]): TripDayInput[] {
  const byDay = new Map(weather.map((entry) => [entry.day, entry.weather]));
  return trip.days.map((day) => ({
    day: day.day,
    activity: day.activity,
    profile: dayProfile(day.day, byDay.get(day.day) ?? null, trip.place.latitude < 0),
  }));
}

/** Chooses an outfit for every day of a trip and stores them, replacing what was there. */
export async function generateTrip(
  trip: Trip,
  owned: Item[],
  weather?: TripWeather[],
  repository: Pick<TripRepository, 'setDay'> = tripRepository,
): Promise<void> {
  const conditions =
    weather ??
    (await tripWeather(
      trip.place,
      trip.days.map((day) => day.day),
    ));
  const plan = planTrip({ tripSeed: trip.id, days: dayInputs(trip, conditions), owned });
  for (const day of plan) await repository.setDay(trip.id, day.day, { pieces: day.pieces });
}

/**
 * Has the AI stylist choose the trip outfits instead: one request for one
 * outfit per day, through the same validation as any stylist proposal.
 * Returns how many days were filled: all of them, or none.
 */
export async function styleTrip(
  trip: Trip,
  weather: TripWeather[],
  context: Pick<StylistRequest, 'items' | 'language' | 'hints' | 'wearCounts'>,
  repository: Pick<TripRepository, 'setDay'> = tripRepository,
  client?: Anthropic,
): Promise<number> {
  const days = dayInputs(trip, weather);
  const lines = days.map((day, index) => {
    const feels =
      day.profile.temperature === null
        ? `${day.profile.season}, no forecast`
        : `feels like ${Math.round(day.profile.temperature)} °C${day.profile.rain ? ', rain' : ''}`;
    return `Day ${index + 1} (${day.day}): ${feels}${day.activity ? `, for ${day.activity}` : ''}`;
  });
  const proposals = await proposeOutfits(
    {
      ...context,
      count: days.length,
      request: `Outfits for a ${days.length}-day trip to ${trip.place.name}, one per day and in day order. Pack light: reuse pieces across days and use at most ${shoeLimitFor(days.length)} pairs of shoes in total.\n${lines.join('\n')}`,
    },
    client,
  );
  // Validation drops outfits without saying which day they were for, so anything but a full
  // set could put an outfit on the wrong day's weather. Nothing is changed in that case.
  if (proposals.length !== trip.days.length) return 0;
  for (const [index, day] of trip.days.entries()) {
    await repository.setDay(trip.id, day.day, { pieces: proposals[index].pieces });
  }
  return proposals.length;
}
