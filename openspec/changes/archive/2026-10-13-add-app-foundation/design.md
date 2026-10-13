## Context

The developer works on Windows with no Mac. The app is personal for now and installed through AltStore with a free Apple ID; a public App Store release is a later possibility. See proposal.md for motivation.

Consequences of this setup:
- No iOS simulator. All testing on device happens on a real iPhone.
- Expo Go cannot load custom native modules (needed in `add-closet` for on-device cutouts), so a development client is required.
- AltStore re-signs the app on install, so CI does not need Apple certificates.

## Goals / Non-Goals

**Goals:**
- A fast edit-and-reload loop from Windows against a real iPhone.
- A data layer that later changes extend without restructuring, and that a sync backend can attach to.
- One place for AI provider access so features do not talk to providers directly.

**Non-Goals:**
- Accounts, cloud sync, subscriptions.
- iPad layouts and Android builds (not blocked, just not tested).
- App Store signing and submission.

## Decisions

### Expo with a development client, routed by expo-router
Use the current stable Expo SDK with TypeScript, `expo-router` for file-based navigation and Continuous Native Generation (`expo prebuild`), so the `ios/` folder is generated in CI and not committed.
Alternative: bare React Native. Rejected because it needs a Mac for routine native upkeep.

### Development loop
CI produces two artefacts: a **development client** IPA (installed once, reloads JavaScript from Metro running on the Windows PC over Wi-Fi) and a **release** IPA. Both are sideloaded with AltStore and use different bundle identifiers so they can coexist; together they use 2 of the 3 free sideload slots.

### Unsigned IPA in GitHub Actions
Workflow on a `macos` runner: install dependencies, `expo prebuild --platform ios`, `xcodebuild archive` with `CODE_SIGNING_ALLOWED=NO`, copy the `.app` into `Payload/`, zip to `.ipa`, upload as a workflow artefact and attach to a GitHub Release on version tags.
Alternative: EAS Build. Rejected for now because it requires a paid Apple Developer account for device builds.
An AltStore source JSON is published with each release so the phone can update from inside AltStore.

### SQLite with Drizzle ORM, images on the file system
`expo-sqlite` with Drizzle for typed schema and migrations. Images are files under the app's document directory, referenced by relative path in the database.
Sync-ready conventions for every table: UUID primary key, `createdAt`, `updatedAt`, `deletedAt` (soft delete). Features access data only through repository modules, so a remote implementation can be added behind the same interface.
Alternatives: WatermelonDB (heavier, own sync protocol), MMKV/JSON (no relational queries, which statistics and filtering need).

### State and data fetching
TanStack Query over the repositories for reads and cache invalidation, Zustand for small UI state. No global Redux store.

### Localisation
`i18next` with `expo-localization`. JSON resource files `en` and `cs`, typed keys, English as fallback. A lint check fails CI if a key is missing in either language.

### AI access layer
A single `ai/` module exposes task-level functions (`tagItem`, `renderTryOn`, `suggestOutfits`) and hides the provider. Keys live in `expo-secure-store` (iOS Keychain). Two providers are expected: Anthropic Claude for vision tagging and text reasoning, and an image-generation provider for try-on (chosen in `add-outfits-try-on`). When the app goes public, this module is pointed at a proxy backend and the key screens are removed; no feature code changes.

### Backup
Because sideloaded apps can be lost when signing lapses or the app is removed, the foundation includes export of the database and images as a single archive to the Files app, and import of that archive.

### Testing
Jest with React Native Testing Library for logic and components. Repositories are tested against an in-memory SQLite. Device checks are manual, listed per task.

## Risks / Trade-offs

- [7-day expiry of sideloaded builds] → AltStore refreshes in the background when AltServer is reachable on the same Wi-Fi; backup export protects data if a refresh is missed.
- [Unsigned builds fail on a new Xcode or SDK] → Pin the Xcode version in the workflow and the Expo SDK in `package.json`.
- [Keys stored on the device] → Acceptable for personal use; the AI layer is the single switch point to a proxy before any public release.
- [No simulator means slower UI verification] → Keep logic in testable modules; use the development client for fast reload.

## Open Questions

- Final app name and bundle identifier. "Closet" is a working name; renaming later only touches app config.
