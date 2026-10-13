## Context

Four features that build on everything before them and are otherwise independent of each other. They can be implemented and released in any order within this change. The user selected iPhone only for the first version and also selected the wall-display mode from the video, so display mode is designed for a phone on a stand; a tablet layout can follow when iPad support is added. Depends on `add-planning-weather` and all earlier changes.

## Goals / Non-Goals

**Goals:**
- Stylist answers are always wearable: every proposed piece exists in the closet and the combination obeys the slot rules.
- Statistics need no extra data entry beyond what the app already records.
- A packing list that reuses pieces across days instead of one new outfit per day.

**Non-Goals:**
- Shopping recommendations or affiliate links.
- A general chat assistant.
- iPad or always-on-display hardware integration.

## Decisions

### Stylist sends descriptions, not photos
The request contains a compact text catalogue of owned items (id, name, category, subcategory, colours, warmth, seasons, occasions, wear count), the profile hints, optional weather for the target date, and the user's request. Photos are not sent: text is far cheaper, faster, and enough for combination decisions because tagging already captured the visual attributes. For large closets the catalogue is pre-filtered on the device by season and warmth before sending.
Provider: Anthropic Claude through the AI module, a mid-size model by default, with structured output: a list of outfits, each a list of item ids by slot plus a one or two sentence rationale in the interface language.

### Validation of stylist output
Every returned outfit is checked on the device: ids exist and are owned (or the one permitted wishlist item for "style this item"), slot rules hold, no duplicates. Invalid outfits are dropped; if none remain the user sees a retry message. Valid proposals are shown with the flat preview; nothing is rendered or saved until the user picks one.

### Stylist sessions
A session keeps the request, the proposals and follow-up refinements ("warmer", "no heels", "use the green skirt") so a refinement sends the previous proposals as context. Sessions are stored locally and listed so past ideas can be reopened. No streaming is needed; responses are short.

### Statistics computed by queries
All figures come from SQL over items and wear events at view time; nothing is precomputed. Cost per wear is price divided by wears, shown only for items with a price and at least one wear; items with a price and no wears are listed separately as "not worn yet". Period selector: last 30 days, last 90 days, this year, all time. Charts use a small charting library that renders with React Native SVG; colours for the colour breakdown come from the taxonomy palette.

### Packing as a second pass over the suggestion engine
A trip has a destination (place search from the weather service), dates and optional activity tags per day (city, beach, hiking, formal, travel day). For each day the app builds the day profile from the destination forecast and asks the suggestion engine for candidates. A selection pass then picks one outfit per day that maximises reuse of items already chosen for the trip, within limits (a top is not reused on consecutive days, shoes are capped at a chosen number of pairs). The packing list is the set of distinct items across the chosen outfits, grouped by category, plus free-text extras the user adds.
Forecasts only reach about two weeks ahead. Beyond that, the day profile uses the typical conditions for that place and month from the same service's historical data, and the trip shows that the forecast is not yet available and can be refreshed closer to departure.
The AI stylist can optionally be asked to propose the trip outfits instead; the result goes through the same validation and produces the same list.

### Display mode on a phone
A full-screen route with large time, date, a welcome line with the user's name, the weather chip and today's outfit, in portrait or landscape. It keeps the screen awake while visible, dims after a period without touch, shifts content position slightly every few minutes to avoid burn-in on OLED screens, and exits on tap. An option starts it automatically when the app is opened while charging.
Alternative: a home-screen or StandBy widget. Rejected for now because widgets are app extensions, which count against the app identifier limit of a free Apple ID.

## Risks / Trade-offs

- [Stylist proposes combinations the user dislikes] → Refinement in the same session; proposals are previews until chosen.
- [Model invents item ids] → Structured output plus device-side validation; invalid outfits are dropped.
- [Item details leave the device] → Text only, no photos; one-time notice before the first stylist request.
- [Statistics mislead when prices or wear logs are incomplete] → Each figure states how many items it covers.
- [Packing reuse produces repetitive outfits] → Reuse limits are user-adjustable; any day can be swapped manually.
- [Display mode drains the battery] → Intended for use while charging; dimming; clear exit.
