export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

/** Part of the day for a greeting: morning 5–11, afternoon 12–17, evening 18–21, night otherwise. */
export function dayPart(date: Date = new Date()): DayPart {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

/** Translation key of the greeting for a time of day. */
export function greetingKey(date: Date = new Date()): `greeting.${DayPart}` {
  return `greeting.${dayPart(date)}`;
}
