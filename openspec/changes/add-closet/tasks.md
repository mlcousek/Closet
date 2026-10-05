## 1. Taxonomy and data

- [x] 1.1 Define the taxonomy constants (categories, subcategories, colours, seasons, occasions, warmth levels, slot mapping) with English and Czech labels; verify a unit test that every value has both labels and every category maps to a slot
- [x] 1.2 Add the items table, migration and repository with filter, search and sort parameters; verify repository unit tests for each filter and for combined filters
- [x] 1.3 Add thumbnail generation to the image store; verify a unit test on output size
- [x] 1.4 Include items and their images in backup export and import; verify a round-trip unit test

## 2. Background removal

- [ ] 2.1 Trial available on-device background-removal modules in the development client and record the choice in `docs/decisions.md`; verify a cutout of a sample garment on device
- [ ] 2.2 Wrap the chosen module behind a single cutout function returning a trimmed transparent image; verify on device with five different garments
- [ ] 2.3 Handle the no-subject case by returning the original image with a reason; verify on device with a blank photo
- [ ] 2.4 Rebuild and publish the development client through the pipeline; verify the new client loads the app

## 3. AI tagging

- [x] 3.1 Add the tagging function to the AI module with structured output limited to taxonomy values; verify unit tests with mocked provider responses, including an invalid response
- [x] 3.2 Map provider errors, missing key and no network to a single "tagging unavailable" result; verify unit tests for each cause

## 4. Add from a photo

- [ ] 4.1 Register "Add item" in the global add menu with camera and library options; verify a component test
- [ ] 4.2 Build the capture screen with tips and the cutout preview with keep-original and retake; verify on device
- [x] 4.3 Build the item form with suggested values marked and required-field validation; verify component tests for suggestions shown and for missing category
- [ ] 4.4 Save the item with original, cutout and thumbnail; verify the item appears in the grid on device

## 5. Closet section

- [ ] 5.1 Build the virtualised grid with thumbnails and labels; verify smooth scrolling on device with 300 seeded items
- [x] 5.2 Add category chips and the item count; verify component tests for select and clear
- [x] 5.3 Add search with the no-results state; verify component tests
- [x] 5.4 Add the filter sheet (colour, season, occasion, brand, archived) and sort options; verify component tests for combined filters
- [x] 5.5 Build item detail with edit, replace image, archive and delete with undo; verify component tests
- [x] 5.6 Add multi-select with bulk archive, delete and re-tag; verify a component test for the confirmation count

## 6. Bulk import

- [x] 6.1 Add the import job table and a queue processor running two jobs at a time with resume on app start; verify unit tests for resume and for a failing job
- [ ] 6.2 Build the multi-photo picker entry and the progress view with a global indicator; verify on device with twenty photos
- [x] 6.3 Build the review queue with confirm, edit and discard, and the "needs review" banner in Closet; verify component tests

## 7. Link import

- [ ] 7.1 Implement the product page reader (JSON-LD, then Open Graph) returning name, brand, price and images; verify unit tests against saved sample pages from five shops
- [x] 7.2 Build the link import screen with clipboard offer, image picker and the unreadable-page fallback; verify component tests for the three scenarios
- [ ] 7.3 Store the source link and show it in item detail; verify on device that it opens the browser

## 8. Wrap-up

- [x] 8.1 Add all new strings in English and Czech; verify the missing-key check passes
- [ ] 8.2 Walk through every scenario in the `closet-items` and `item-import` specs on device and record the result in the pull request
