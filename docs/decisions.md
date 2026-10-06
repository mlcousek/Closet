# Decisions

Short records of choices made during implementation that the plan left open.

## Background removal: our own Vision wrapper

**Decided:** 5 October 2026, during `add-closet`.

The plan asked for a trial of community background-removal modules on a device before choosing one. No device build was available at the time (GitHub Actions was blocked on the account, so no `.ipa` could be produced), so no trial could be run.

Chosen instead: extend the local `modules/closet-vision` Expo module, which already exists for person detection, with a `removeBackground` function built on `VNGenerateForegroundInstanceMaskRequest` (the iOS 17 subject-lifting API). Reasons:

- It adds no dependency and no second native module to keep compatible with each Expo SDK.
- The whole surface is one function behind `removeBackground(uri)` in `modules/closet-vision/index.ts`, so swapping in a community module or a cloud service later touches one file.
- On iOS 16, or when no subject is found, it returns nothing and the app keeps the original photo.

**Not yet verified:** the Swift code has never been compiled or run. The first successful iOS build and a cutout of a real garment on a phone are still outstanding (task 2.1 and 2.2 of `add-closet`). If it does not work, the fallback is a cloud removal service behind the same function.

## Text and vision model: Claude Opus 5.5 by default, configurable

**Decided:** 5 October 2026, during `add-closet`.

The design said tagging would use "the small fast model by default". The implementation defaults to `claude-opus-5-5`, the current default Claude model, at low effort, and stores the model id in settings (`ai.model.text`) so it can be changed without a code change. Switching to `claude-haiku-4-5` would cut the cost per tagged item roughly fourfold; that is a cost decision for the owner of the API key.

## Try-on: Gemini only for now, pieces sent as separate images

**Decided:** 5 October 2026, during `add-outfits-try-on`.

Three things differ from the design:

- **No provider trial was run.** The plan starts with a side-by-side trial of a multi-image generative model and a dedicated try-on model on sample outfits. That needs real provider keys and real photos, which were not available during implementation. Gemini is the default without having been compared.
- **Only the Gemini provider is implemented.** The provider interface (`TryOnProvider` in `src/ai/tryOn.ts`) is in place, and a second implementation can be added next to `createGeminiProvider` without touching feature code. The dedicated try-on provider (FASHN via fal.ai) was not written, because its request format could not be checked against a working key and guessing it would have produced code that looks finished and is not.
- **Pieces are sent as separate images, not as one composed outfit sheet.** The design composed all cutouts into a single labelled sheet to stay under any provider image limit. Sending the avatar plus one image per piece, each named in the prompt by position, needs no on-device image composition and keeps each piece at full resolution. An outfit has at most a handful of pieces, which is within what Gemini accepts. If a provider with a lower limit is added, the sheet can be built then.

The image model id is a stored setting (`ai.model.image`, default `gemini-2.5-flash-image`), editable under Settings, AI provider keys.

**Not yet verified:** no render has been produced. The request and response handling is covered by unit tests against the documented response shape only.

## Row filter in the outfit editor applies to all rows

The spec lets the user filter the items offered in a row. The editor has one season filter above the rows that narrows every row at once; pieces already chosen stay visible. A filter per row can be added if one filter for all rows proves too coarse.

## Smart features: where the implementation differs from the design

**Decided:** 5 October 2026, during `add-smart-features`.

- **No charting library.** The statistics need horizontal bars, one share bar and a column trend. These are plain views (`src/stats/charts.tsx`), so the build gains no native dependency that cannot be tried without a Mac. The donut in the design is a share bar.
- **Trip outfits are stored as pieces, not as saved outfits.** A generated trip would otherwise fill the Outfits tab with one outfit per day. Outfits are saved only when the trip is added to the calendar; deleting the trip keeps them.
- **Typical conditions are last year's weather.** For days beyond the 14-day forecast, the trip uses the same dates a year earlier from the Open-Meteo archive and marks them "typical". One year is a sample, not a climate average.
- **The stylist plans a trip all or nothing.** The stylist returns outfits without saying which day each is for, and validation can drop some. If fewer valid outfits come back than the trip has days, nothing is changed, so no outfit lands on the wrong day's weather.
- **Display orientation uses the navigator.** The app allows every orientation in its configuration and each screen locks itself to portrait through the stack's `orientation` option; only the display allows all. No orientation module was added.
- **Dates are typed as YYYY-MM-DD** in the trip form, as for the purchase date of an item. There is no date picker in the app yet.

**Not yet verified:** the display's keep-awake, rotation, dimming and start-while-charging behaviour, and every stylist request, have only been exercised in tests with mocks.
- **Trip activities are the closet's occasions.** The design named city, beach, hiking and travel day. Items are tagged with occasions (casual, work, formal, party, sport, home, outdoor), so a day's activity is one of those and filters by the same tag; a second vocabulary would have matched nothing in the closet.
- **Reuse limits are fixed.** Tops and dresses twice, bottoms three times, two pairs of shoes (three beyond a week), in `TRIP_RULES`. There is no setting for them yet. When the closet is too small, the limits give way before a day is left without an outfit.
- **Statistics are about items.** The overview counts saved outfits, but there are no most and least worn outfits, no worst-value list and no "not worn for a long time" list; "not worn in this period" shows the first eight.

## Known limits found in the whole-app review

**Recorded:** 6 October 2026. These were found by reading the code and are not fixed, because a sound fix needs a device, a native module, or a decision.

- **Backup holds the whole library in memory.** Export and restore read every image as base64 and build the zip in the JavaScript heap, roughly three to four times the size of the photos. Originals are stored at full camera resolution, so a closet of a few dozen items may already be too much. Until this is rebuilt file by file with a native zip module, treat the backup as unproven for a real closet, and try an export early, with few items.
- **An interrupted restore is not recovered.** If the app is killed in the moment between setting the current data aside and moving the restored data into place, the next start creates an empty database; the previous data is still in `restore-previous/` in the app's documents, but nothing puts it back.
- **Try-on requests grow with the outfit.** Each piece is sent as its own PNG. An outfit of seven or eight pieces may exceed what the image provider accepts in one request, and that would show as a general failure.
- **Temporary files are not cleaned up.** Cutouts, resized copies, downloaded product photos and the backup zip stay in the cache folder until iOS clears it.
- **After a restore, background work is not reset.** Queries are cleared, but an import or render that was running keeps its in-memory state until the app is restarted.
