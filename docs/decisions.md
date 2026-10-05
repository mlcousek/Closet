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
