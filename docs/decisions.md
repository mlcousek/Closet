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
