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

## Limits from the whole-app review, and what was done about them

**Recorded:** 6 October 2026. **Addressed:** 6 October 2026. All of this is covered by unit tests and none of it has run on a phone.

- **Backup no longer holds the library in memory.** The archive is written and read one file at a time by a small zip writer and reader of the app's own (`src/storage/zip.ts`), through file handles from the current `expo-file-system` API. The largest thing in memory is the largest single photo. The archive is an ordinary uncompressed zip that other tools can open, limited to 4 GB and 65 535 files by the classic zip format. `jszip` is now only used by tests, to check that compatibility. Originals are still stored at full camera resolution; if backups turn out too large, downscaling on import is the next step.
- **An interrupted restore is recovered at the next start.** Before any screen reads data, the app checks for data that a restore had set aside and puts it back (`recoverInterruptedRestore`), and removes what an abandoned restore had unpacked.
- **Try-on requests stay within the provider's limit.** Pieces are sent at 1024 px when they fit in one request and at 768 or 512 px when an outfit has too many (`encodeWithinBudget`). The 12 MB budget is an estimate of what the provider accepts, to be checked with a real key.
- **Temporary files are cleaned up.** At start, the app's own working files older than an hour are deleted from the cache folder. Cutouts are now written to the cache folder and not the system temporary folder, which changed one line of the Swift module.
- **After a restore, background work starts over** from the restored data: queued imports and renders are read again and every screen reloads.

## Try-on pictures: decided with the owner on 2026-10-07

These replace what the try-on spec in `openspec/changes/add-outfits-try-on` says about outdated renders.

- **A picture belongs to an outfit while its pieces stay the same.** Changing a piece, or the photo of a piece, drops the picture from view and the outfit shows the flat preview again. Going back to the earlier pieces shows their picture again. There is no "outdated" state any more.
- **A new photo of the user leaves existing pictures as they are.** Nothing is rendered again unless the user taps Regenerate.
- **The user's photo is reduced to the person on a white background, on the device** (Vision person segmentation). The original is kept as `avatarPath`; the cut-out, downscaled copy is `avatarSmallPath`, which renders and the free route use. When nobody can be told apart from the background the photo is used as it is and the app says so. A photo added before this is not cut out until it is added again.
- **A free route without a provider key.** A subscription to Gemini, ChatGPT or Claude cannot be used from another app, so the app shares one picture (the user's photo and the numbered pieces) with a matching request to an assistant app the user already has, and the finished picture is added back from Photos. It can run through every outfit without a picture, and add the pictures for all of them at once in the order they were picked.

Known limits of the free route, not yet seen on a device:

- The shared picture is a snapshot of an on-screen view about 300 points wide, scaled up. The user's face in it is small, so likeness may be worse than with the paid route, which sends each image on its own.
- Adding several pictures at once relies on the user picking them in the order of the outfits. A wrong picture can only be replaced by adding another one.

## Limits from the review of 2026-10-07, left open

- **Bulk import and memory.** Two photos are worked on at a time at full camera resolution. A photo that makes the app run out of memory is now tried twice and then marked as failed instead of at every start, but the memory use itself is unchanged.
- **Restore while photos are being imported** is refused rather than made safe.
- **Statistics in several currencies** are listed per currency; nothing is converted.
- **Reason text of a suggestion** can still mention an outer layer when the closet has none that fits and the suggestion was made without one.
- **Day chips in the stylist** are not refreshed when the screen stays open over midnight; planning from a reopened session never lands in the past.
- **Usage counts** show paid renders only. Studio photos and tagging requests are not shown, and a request that timed out is not counted although it may have been charged; the message for a timeout now says so.
- **Item names from a shop link go into prompts as they are.** The stylist's answers are checked against real item ids, so the worst case is an odd picture or explanation.
- **Prepared SQL statements** may not be released until the database closes (not confirmed); only a very long session, such as display mode left on, could notice.
