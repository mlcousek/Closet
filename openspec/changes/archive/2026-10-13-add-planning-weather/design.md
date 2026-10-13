## Context

The reference home screen shows "Good evening, Aurianna", a weather chip, a seven-day strip of small outfit figures with today underlined, and today's outfit large in the centre. The calendar screen is a month grid of outfit figures with a streak counter at the top. Depends on `add-outfits-try-on` and uses the warmth, season and occasion attributes from `add-closet`.

## Goals / Non-Goals

**Goals:**
- A sensible suggestion every morning with no taps, no key and no cost.
- One source of truth for what was worn, so statistics in the next change need no second log.

**Non-Goals:**
- AI-written styling advice or occasion-based requests (see `add-smart-features`).
- Reading the user's calendar events.
- Push notifications (not available with a free Apple ID); reminders are local.

## Decisions

### Weather from Open-Meteo
Open-Meteo provides current conditions and a multi-day forecast without a key or account. The app requests apparent temperature (minimum, maximum and daytime mean), precipitation probability and amount, wind and a condition code, for the device location rounded to about one kilometre or for a city the user picked through the same service's place search. Responses are cached for one hour and the last response is kept for offline use, shown with its age.
Alternative: Apple WeatherKit. Rejected because it requires a paid developer account.

### Location is optional
Approximate, while-in-use location only. If permission is denied the user picks a city. Without either, suggestions fall back to the season for the current month and hemisphere and say so.

### Calendar entries and wear events
`calendar_entries` (date, outfit, state: planned or worn, note); several entries per day are allowed, the first is the primary one shown in strips and grids. `wear_events` (date, item, calendar entry) is written when an entry becomes worn, one row per item in the outfit. Item wear counts and "last worn" are derived from wear events, never stored on the item, so editing the log cannot leave counts stale.
A past day can be logged or corrected at any time. A planned entry on a day that has passed is shown as "planned, not confirmed" with a one-tap confirm.

### Streak
The streak is the number of consecutive days up to today (or yesterday, if today has no entry yet) with at least one worn entry. Computed from the log on demand.

### Rule-based suggestion engine
Runs on the device in two stages.

1. Target profile for the day from the forecast: a warmth band from the daytime apparent temperature (five bands from hot to freezing), "needs outer layer" when cold, wet or windy, "rain" when precipitation probability and amount cross a threshold, and the season.
2. Score candidates. Saved outfits are scored on warmth match (summed item warmth against the band), presence or absence of an outer layer, season tags, a penalty for outfits or items worn in the last seven days, a bonus for favourites and a small bonus for items worn least. Outfits with wishlist or archived items are excluded. If fewer than three saved outfits score above a threshold, new combinations are assembled from closet items by slot using the same scoring plus a colour-compatibility table, and offered as unsaved suggestions with a flat preview.

Weights live in one configuration object with unit tests on representative days, so they can be tuned without touching logic.
Alternative: ask the AI every morning. Rejected as the default because it costs money, needs network and a key, and the rules cover the weather question well; the AI stylist complements it later.

### Home composition
Home reads three things: profile (greeting), weather cache, and the calendar entries for the visible week. Today's large outfit is, in order: the worn entry, the planned entry, or the top suggestion with "wear this" and "show another" actions. Accepting a suggestion that is a new combination saves it as an outfit first, which triggers a render as usual.

### Daily reminder
A repeating local notification at the chosen time, with the text depending only on static wording (local notifications are scheduled ahead and cannot read the forecast at delivery). Tapping it opens Home.

## Risks / Trade-offs

- [Suggestions feel wrong for the user's taste] → "Show another", favourites bonus, recent-wear penalty; AI stylist later.
- [Warmth tags are missing or wrong on items] → Items without warmth use a category default; suggestions name the reason ("light layers for 24°") so mistakes are visible.
- [Few saved outfits early on] → Generated combinations from items fill the gap.
- [Forecast unavailable] → Last cached forecast with its age, then the seasonal fallback.
- [Sideloaded builds lose scheduled notifications after reinstall] → Reminder is rescheduled on every app start.
