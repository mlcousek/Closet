## 1. Calendar data

- [x] 1.1 Add calendar entries and wear events tables with migrations and a repository (plan, move, clear, mark worn, remove, list by range); verify repository unit tests including that marking worn writes one wear event per item and removing deletes them
- [x] 1.2 Add derived queries for wear count and last worn per item and per outfit; verify unit tests
- [x] 1.3 Add the streak calculation; verify unit tests for continuing, broken, and today-not-yet-logged cases
- [x] 1.4 Include calendar entries and wear events in backup export and import; verify a round-trip unit test

## 2. Weather

- [x] 2.1 Add the weather client for current conditions and daily forecast with a typed result; verify unit tests against recorded responses
- [x] 2.2 Add one-hour caching and last-known weather with age; verify unit tests for fresh, stale and offline cases
- [ ] 2.3 Add approximate location with the permission explanation in both languages; verify on device for allowed and denied
- [ ] 2.4 Add city search and the chosen-city setting; verify a component test and on device
- [x] 2.5 Add the temperature unit setting with region default; verify unit tests

## 3. Suggestion engine

- [x] 3.1 Implement the day profile from a forecast (warmth band, outer layer needed, rain, season) and the seasonal fallback; verify unit tests for hot, mild, cold, wet and no-weather days
- [x] 3.2 Implement scoring of saved outfits with a single weights configuration; verify unit tests for warmth match, recent-wear penalty, favourites bonus and exclusion of wishlist and archived items
- [x] 3.3 Implement generation of new combinations from closet items with the colour-compatibility table; verify unit tests that slot rules hold and results are deterministic for a fixed seed
- [x] 3.4 Implement the reason line for a suggestion in both languages; verify unit tests
- [x] 3.5 Add "accept a new combination" which saves the outfit and plans it; verify a repository unit test

## 4. Home

- [x] 4.1 Build the weather chip and the greeting header; verify component tests for with-weather, stale and unavailable states
- [x] 4.2 Build the week strip with outfit thumbnails and day selection; verify component tests
- [x] 4.3 Build today's outfit panel with worn, planned and suggested states and their actions; verify component tests for each state and for "show another"
- [x] 4.4 Add the empty-closet state and the shortcuts; verify a component test

## 5. Calendar section

- [x] 5.1 Build the month grid with outfit thumbnails, month navigation and the streak counter; verify component tests
- [x] 5.2 Build the day detail with plan, replace, move, clear, mark worn, add second outfit and the not-confirmed state; verify component tests
- [ ] 5.3 Add "plan" on outfit detail with a date picker; verify a component test
- [x] 5.4 Show wear count and last worn on outfit and item details; verify component tests

## 6. Daily reminder

- [ ] 6.1 Add the reminder setting with time picker and local notification scheduling, rescheduled on app start; verify on device that the notification arrives and opens Home
- [ ] 6.2 Handle the notifications-not-allowed state; verify on device

## 7. Wrap-up

- [x] 7.1 Add all new strings in English and Czech; verify the missing-key check passes
- [ ] 7.2 Use the app for three consecutive real days and note suggestion quality; adjust weights and record the changes in the pull request
- [ ] 7.3 Walk through every scenario in the `home-today`, `weather-suggestions` and `outfit-calendar` specs on device and record the result in the pull request
