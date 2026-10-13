# Implementation and verification status

Updated 13 October 2026.

## Where the open checks are

The seven original OpenSpec changes are archived under `openspec/changes/archive/`, and their requirements are the main specs in `openspec/specs/`. The tasks still open when they were archived, nearly all checks on the phone, are in the [device checklist](device-checklist.md). Device checks remain open until their results are recorded; automated tests cannot complete them.

| Area                  | Implemented                                                                                                                   | Remaining verification or deliberate differences                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation            | Tabs, themes, local database, keys, translations, backups, CI and IPA workflow                                                | Device installation and native share/restore behavior. Startup now blocks on failed recovery and offers retry.                                    |
| Profile               | Name-only onboarding; optional gender, body type, sizes and avatar in Profile                                                 | Original multi-step onboarding is superseded. Native photo/person detection verification remains open.                                            |
| Wardrobe              | Imports, cutout wrapper, review, filters, wishlist and shop-page parser                                                       | Vision quality, large-library device performance, real shop compatibility. Review now uses explicit next-item acknowledgement instead of a timer. |
| Outfits               | Multiple pieces per layering slot; two labeled top rows by default; outerwear separately; saved outfits; AI and manual try-on | Provider quality comparison and native image composition verification. Shuffle preserves layer rows. No database migration is needed.             |
| Lookbooks and sharing | Lookbooks, wishlist purchases, outfit sharing and contact sheets                                                              | Native sharing and image capture verification; see the device checklist.                                                                          |
| Planning              | Weather, suggestions, calendar, per-item wear logging and local reminders                                                     | Device permissions and reminders; suggestion quality. Layered wear logging records every saved piece.                                             |
| Smart features        | Stylist, statistics, trips and display mode                                                                                   | Native display behavior and live AI verification. Charts use plain views; typical trip weather uses the previous year.                            |

## Automated regression coverage added in this update

- Recovery failure leaves wardrobe screens unmounted; retry succeeds; children wait for completion.
- Short onboarding validates a name, saves optional details unset, preserves the name on Back, and allows retry after save failure.
- Bulk-review repeated taps do not process the following item; the next item becomes actionable explicitly.
- Two top rows show both garments in the preview and save both positions.
- A T-shirt, hoodie and jacket survive persistence and editor round trips and each receives a wear count.

## Next engineering work

1. Work through the [device checklist](device-checklist.md).
2. Compare provider models with fixed garment/avatar photos using the [provider validation protocol](provider-validation.md). Settings capability checks and actionable model errors are implemented; live output quality is still unverified.

## Snapshots and real shop pages: 13 October 2026

- Snapshot tests cover the shared image in portrait, story and square, from a render and from the pieces with the item strip; lookbook contact sheets of five outfits and of thirty paged into twelve, twelve and six; the flat preview with two, four and six pieces; and the labelled try-on sheet. Snapshots hold the native views and their layout only (`src/testing/layoutTree.ts`).
- The product page reader is tested against pages saved from six real shops. That found and fixed four gaps: prices only on size variants, videos among the pictures, one picture at several sizes or over http, and thumbnail-only pictures. H&M, Uniqlo, Mango and Decathlon refuse the app’s request; see [decisions](decisions.md).
- Lookbook reordering stays with the Arrange buttons rather than drag; see [decisions](decisions.md).

## Own outfit photo: 13 October 2026

- The outfit screen offers Take a photo and Choose from Photos, so a good existing photo of the outfit can be its picture instead of a generated one. Nothing is sent anywhere, no key is needed and no usage is counted.
- The photo is stored like a hand-added try-on picture, resized to 1600 px with a thumbnail, and recorded with provider `photo`. It is shown in lists and shared images like any render, labelled Your own photo on the outfit screen.
- A render still queued for the outfit is dropped when the photo is saved, so a paid render cannot replace it. With an own photo shown, the render button offers Try it on me rather than Regenerate; the photo stays available as the previous picture.
- No database migration is needed. A camera permission denial explains how to allow it. Camera and library picking still need device verification.

## Date pickers: 8 October 2026

- Trip start/end and item purchase dates use native date controls. iPhone uses a sheet with Cancel and Done; Android uses its date dialog. Purchase dates can be cleared, and the web preview uses a browser calendar input.
- Dates still use local calendar days and local-noon timestamps. Existing trip range validation remains in place, with English/Czech display formatting.
- Regression coverage checks cancellation, confirmation, clearing, leap days, daylight-saving dates, purchase persistence and trip creation. The new native dependency requires rebuilding the iPhone app; device interaction remains to be checked.

## Layered suggestions and trip planning: 8 October 2026

- Automatic suggestions and trip generation now consider a base top plus a hoodie, sweater or cardigan on mild-to-cold days. Top positions remain base first, mid-layer second, with outerwear separate.
- Layers are identified from subcategories. Untyped tops remain single candidates, and a mid-layer can still be suggested alone when there is no known base top. Hot and warm days keep generated tops single.
- Warmth scoring counts the upper body once, using the warmest top plus 0.5 per additional top, capped at 5. A light base no longer dilutes a warmer top. The existing cold-day restriction on outfits made only of light body pieces remains.
- Each garment still contributes independently to recent-wear penalties, trip reuse limits and packing lists. Candidate generation chooses one base per attempt, avoiding enumeration of every possible pair.
- Regression coverage checks layer ordering, saved-outfit warmth, summer behavior, untyped and missing-base fallbacks, and four-day trip packing with per-garment reuse limits. Real-world comfort and suggestion quality still need device use.

## Provider model checks: 8 October 2026

- Each model field in Settings has a separate Check model action. It uses the saved provider key and a metadata request, without sending garment photos or requesting generated content.
- Claude checks photo-input and structured-output capabilities when supplied by the provider. Missing capability metadata is reported as available but unconfirmed.
- Gemini checks model availability and the generateContent method. Its metadata does not confirm image output; the result says so. Pasted models/ prefixes are accepted for checks and render requests.
- Unavailable models and explicitly unsupported capabilities have distinct English/Czech messages in tagging, stylist, try-on and studio-photo flows. Failed renders preserve those reasons in storage.
- Editing the model or changing/removing the saved key clears its previous check result. Model checks do not change key connection status or contribute to generation usage counts.
- Automated fixtures cover metadata, HTTP failures, unsupported output, missing keys, stale results and timeout cleanup. No live provider comparison has been run.

## Import reliability: 8 October 2026

- Failed imports show the copied photo, a localized reason, and individual retry/discard actions. Duplicate photos link to their existing wardrobe or wishlist item. Raw provider responses and device paths are not shown as diagnostics.
- Exact prepared-photo fingerprints are checked before cutout and tagging. Concurrent workers with the same fingerprint wait for each other; the second checks the database after the first finishes. A failed first attempt releases the fingerprint for another attempt.
- Single-photo adds warn before tagging and allow an explicit Add another item anyway override. The duplicate check is repeated before saving when no override was given.
- Schema version 8 adds a nullable indexed photo fingerprint. Existing photos are fingerprinted lazily on the first relevant import; no images are rewritten. Deleted/archived items do not block re-importing a photo. Replacing an original clears a stale fingerprint.
- An initial photo-copy failure is also listed, without retaining a temporary picker URI. It offers choosing the photo again; a source-less job cannot be retried automatically.
- Retry/discard cannot change processing jobs. Discard removes only the failed job and its copied source, leaving wardrobe items and other imports intact.
- Duplicate detection compares prepared file bytes, not visual similarity. Photos with different edits or encoding can remain separate; the first scan of an older large wardrobe can take time. Native hashing, photo previews and performance still require device verification.
