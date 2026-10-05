/** A local calendar day written as YYYY-MM-DD. Sorting these strings sorts the days. */
export type Day = string;

const pad = (value: number) => String(value).padStart(2, '0');

export function toDay(date: Date): Day {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local noon of the day, so adding days never trips over a daylight-saving change. */
export function fromDay(day: Day): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 12);
}

export function today(now: Date = new Date()): Day {
  return toDay(now);
}

export function addDays(day: Day, count: number): Day {
  const date = fromDay(day);
  date.setDate(date.getDate() + count);
  return toDay(date);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: Day, to: Day): number {
  return Math.round((fromDay(to).getTime() - fromDay(from).getTime()) / 86_400_000);
}

/** The seven days of the week containing `day`, Monday first. */
export function weekOf(day: Day): Day[] {
  const offset = (fromDay(day).getDay() + 6) % 7;
  const monday = addDays(day, -offset);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** The first day of the month `count` months away from the month of `day`. */
export function addMonths(day: Day, count: number): Day {
  const date = fromDay(day);
  return toDay(new Date(date.getFullYear(), date.getMonth() + count, 1, 12));
}

/**
 * The weeks to show for the month containing `day`: full Monday-to-Sunday
 * rows, with null for the cells that belong to neighbouring months.
 */
export function monthGrid(day: Day): (Day | null)[][] {
  const first = addMonths(day, 0);
  const month = fromDay(first).getMonth();
  const weeks: (Day | null)[][] = [];
  let cursor = weekOf(first)[0];
  for (;;) {
    const week = Array.from({ length: 7 }, (_, index) => addDays(cursor, index));
    if (week.every((entry) => fromDay(entry).getMonth() !== month)) break;
    weeks.push(week.map((entry) => (fromDay(entry).getMonth() === month ? entry : null)));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

export type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter';

/** The meteorological season of a day; flipped for the southern hemisphere. */
export function seasonOf(day: Day, southern = false): SeasonName {
  const month = fromDay(day).getMonth();
  const northern: SeasonName =
    month <= 1 || month === 11
      ? 'winter'
      : month <= 4
        ? 'spring'
        : month <= 7
          ? 'summer'
          : 'autumn';
  if (!southern) return northern;
  return ({ winter: 'summer', spring: 'autumn', summer: 'winter', autumn: 'spring' } as const)[
    northern
  ];
}
