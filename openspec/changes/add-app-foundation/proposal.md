## Why

There is no project yet. Every later feature (closet, outfits, try-on, planning) needs the same base: a running Expo app, a place to store data, translated strings, somewhere to keep AI keys, and a way to get a build onto an iPhone without a Mac.

## What Changes

- Create the React Native + Expo (TypeScript) project, iPhone only, portrait.
- Add the navigation shell: bottom tabs for Home, Closet, Outfits, Calendar and Profile, plus a floating "+" action that later changes hook into.
- Add an on-device database and image file storage, structured so a cloud backend can be added later (stable ids, timestamps, soft deletes).
- Add English and Czech localisation that follows the device language, with a manual override.
- Add a Settings screen where the user stores their own AI provider keys securely on the device and can test them.
- Add a GitHub Actions workflow that builds an unsigned `.ipa` for AltStore, and a development-client build for day-to-day work from Windows.
- Add lint, type-check and unit-test tooling, run in CI.

## Capabilities

### New Capabilities
- `app-shell`: Navigation structure, empty states, theming and the global add action.
- `local-data`: On-device persistence of records and images, export and import of a full backup.
- `localization`: English and Czech interface language selection.
- `ai-settings`: Storage, validation and status of user-supplied AI provider keys.
- `build-pipeline`: Automated production of installable iPhone builds for sideloading.

### Modified Capabilities

None.

## Impact

- New repository contents: Expo app, CI workflows, test setup.
- External services: GitHub Actions (macOS runners), AltStore/AltServer on the user's PC and phone.
- Constraint carried by all later changes: a free Apple ID means builds expire after 7 days, at most 3 sideloaded apps, and no push notifications or iCloud.
