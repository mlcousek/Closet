## 1. AI stylist

- [ ] 1.1 Build the text catalogue of owned items with device-side pre-filtering by season and warmth; verify unit tests on catalogue content and size limits
- [ ] 1.2 Add the stylist function to the AI module with structured output (outfits as item ids by slot plus rationale); verify unit tests with mocked responses
- [ ] 1.3 Implement validation of returned outfits (ids exist, ownership, slot rules, duplicates); verify unit tests for each rejection reason and for the none-valid case
- [ ] 1.4 Add stylist sessions and proposals tables with a repository; verify repository unit tests
- [ ] 1.5 Build the stylist screen with free-text request, optional date, suggested prompts and proposal cards with flat previews; verify component tests
- [ ] 1.6 Add refinement within a session sending earlier proposals as context; verify a unit test on the request built for a refinement
- [ ] 1.7 Add save, open in editor and plan actions on a proposal; verify component tests
- [ ] 1.8 Add "style this" on closet and wishlist item details; verify a unit test that the chosen item is required in every proposal
- [ ] 1.9 Add the session list with reopen and delete, the one-time disclosure, and the no-key and error states; verify component tests
- [ ] 1.10 Count stylist requests in the usage log shown in Settings; verify a unit test

## 2. Closet statistics

- [ ] 2.1 Implement statistics queries (counts, value, category and colour breakdown, most and least worn, never worn, cost per wear, usage share, monthly trend) with a period parameter; verify unit tests against a seeded database
- [ ] 2.2 Add the charting library and shared chart components for bars, donut and trend; verify snapshot tests in light and dark themes
- [ ] 2.3 Build the statistics screen with period selector and all sections, reachable from Profile and from the Closet count; verify component tests
- [ ] 2.4 Add drill-down from a segment or list entry to the filtered closet or item detail; verify component tests
- [ ] 2.5 Add coverage notes and the little-data states; verify component tests with an empty wear log and with missing prices
- [ ] 2.6 Show cost per wear on item detail; verify a component test for priced-and-worn, priced-not-worn and unpriced items

## 3. Trip packing

- [ ] 3.1 Add trips, trip days and packing entries tables with a repository; verify repository unit tests including that deleting a trip keeps outfits
- [ ] 3.2 Add destination forecast and typical-conditions lookup with the "typical" marker; verify unit tests against recorded responses for near and far dates
- [ ] 3.3 Implement the trip selection pass over the suggestion engine with reuse limits and the shoe cap; verify unit tests that limits hold on a seeded closet
- [ ] 3.4 Derive the deduplicated packing list grouped by category with the days each item is worn; verify unit tests
- [ ] 3.5 Build the create-trip flow with place search, dates and validation; verify component tests
- [ ] 3.6 Build the trip screen with per-day weather, activity tags, outfit and swap; verify component tests that swapping updates the list
- [ ] 3.7 Build the packing checklist with extra items, free-text entries and progress; verify component tests
- [ ] 3.8 Add "add to calendar" and trip delete; verify repository unit tests
- [ ] 3.9 Add the option to have the AI stylist propose the trip outfits through the same validation; verify a unit test
- [ ] 3.10 Include trips in backup export and import; verify a round-trip unit test

## 4. Display mode

- [ ] 4.1 Build the full-screen display route with time, date, welcome line, weather and today's outfit, hiding the tab bar; verify a component test
- [ ] 4.2 Keep the screen awake while the route is visible and release on exit; verify on device beyond the auto-lock time
- [ ] 4.3 Add portrait and landscape layouts for this route only; verify on device by rotating
- [ ] 4.4 Add dimming after inactivity, slow content shift and tap-then-exit; verify on device
- [ ] 4.5 Add the start-while-charging option; verify on device on charger and on battery
- [ ] 4.6 Add three display themes and the theme setting; verify a component test
- [ ] 4.7 Make the display react to changes of today's outfit; verify a component test

## 5. Wrap-up

- [ ] 5.1 Add all new strings in English and Czech; verify the missing-key check passes
- [ ] 5.2 Walk through every scenario in the `ai-stylist`, `closet-statistics`, `trip-packing` and `display-mode` specs on device and record the result in the pull request
