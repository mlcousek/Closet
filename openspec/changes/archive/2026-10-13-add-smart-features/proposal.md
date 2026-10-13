## Why

With the closet, outfits and wear history in place, the app holds enough about the user's wardrobe to do things a plain catalogue cannot: style an outfit for an occasion on request, show which clothes earn their place, plan what to pack for a trip, and sit on a stand as an always-on closet display like the tablet in the reference video.

## What Changes

- Add the AI stylist: the user describes an occasion or mood ("wedding guest in June", "smart but comfortable for the office") and gets outfits assembled from their own closet with a short explanation, which they can refine, save and plan.
- Add "style this item": outfit ideas built around one chosen piece, including a wishlist piece.
- Add closet statistics: totals by category and colour, most and least worn, never worn, cost per wear, wardrobe value and wear trends over time.
- Add trip packing lists: destination, dates and activities produce an outfit per day from the forecast and a deduplicated list of items to pack, with check-off while packing.
- Add display mode: a full-screen idle view with the time, a welcome line and today's outfit, which keeps the screen on while the phone is on a stand.

## Capabilities

### New Capabilities
- `ai-stylist`: Outfit proposals from the user's closet for a described occasion or around a chosen item, produced by an AI text provider.
- `closet-statistics`: Figures and charts about what the user owns and wears.
- `trip-packing`: Trips with per-day outfits and a packing checklist.
- `display-mode`: An always-on idle screen for a phone on a stand.

### Modified Capabilities

None.

## Impact

- New tables for stylist sessions, trips, trip days and packing items.
- Uses the text provider key from `ai-settings`; each stylist request is a paid provider request. Item details (not photos) are sent to the provider.
- Uses the weather service from `add-planning-weather` for trip destinations.
- Display mode keeps the screen awake and so uses more battery while active.
