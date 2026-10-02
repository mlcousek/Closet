## Why

A closet app is opened in the morning with one question: what do I wear today. Answering it needs the weather, the season and what was worn recently. The reference app's home screen does exactly this: a greeting, a weather chip, a week strip and today's outfit, backed by a month calendar with a streak.

## What Changes

- Add the Home screen: greeting, today's weather, a week strip with the outfit planned or worn each day, and today's outfit shown large.
- Add weather for the user's location (or a chosen city): current conditions and a forecast for the coming days.
- Add outfit suggestions for a day based on temperature, rain, wind, season and what was worn recently, drawn from saved outfits first and from closet items when no saved outfit fits.
- Add the outfit calendar: a month grid with the outfit for each day, planning outfits for future days, and moving or clearing them.
- Add the worn log: marking an outfit as worn on a day, which also records a wear for each of its items.
- Add a streak counter for consecutive days with a logged outfit.
- Add an optional daily reminder at a time the user chooses.

## Capabilities

### New Capabilities
- `home-today`: The Home screen that brings together greeting, weather, the week and today's outfit.
- `weather-suggestions`: Obtaining the weather and suggesting suitable outfits for a day.
- `outfit-calendar`: Planning outfits on days, logging what was worn, the month view, the streak and the daily reminder.

### Modified Capabilities

None.

## Impact

- New tables for calendar entries and wear events.
- Uses location permission (approximate, while using the app) and notification permission; both optional.
- New external service: a free weather forecast service that needs no key.
- Suggestions run on the device and cost nothing; AI-based styling is added in `add-smart-features`.
