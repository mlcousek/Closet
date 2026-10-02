## 1. Project setup

- [ ] 1.1 Create the Expo TypeScript project with expo-router, iPhone-only portrait config, and working-name bundle identifiers for release and development variants; verify `npx expo config` shows both variants
- [ ] 1.2 Add ESLint, Prettier and strict TypeScript; verify `npm run lint` and `npm run typecheck` pass
- [ ] 1.3 Add Jest with React Native Testing Library and one sample test; verify `npm test` passes
- [ ] 1.4 Commit the baseline and push to the existing GitHub repository; verify the repository shows the commit

## 2. Build pipeline

- [ ] 2.1 Add a CI workflow running lint, type-check and tests on push and pull request; verify a deliberately failing test fails the run
- [ ] 2.2 Add a macOS workflow that prebuilds, archives without code signing and packages an unsigned release `.ipa`, triggered manually and on version tags; verify the artefact downloads
- [ ] 2.3 Add the development-client variant to the same workflow with its own name, icon badge and bundle identifier; verify a second artefact is produced
- [ ] 2.4 Attach the release `.ipa` to a GitHub Release on tags and publish an AltStore source JSON; verify AltStore lists the app from the source URL
- [ ] 2.5 Sideload both builds with AltStore and connect the development client to Metro on the Windows PC; verify a code change reloads on the phone
- [ ] 2.6 Document the build, install and refresh procedure in `docs/building.md`; verify by following it from a clean checkout

## 3. App shell

- [ ] 3.1 Implement the five-tab layout with placeholder screens; verify each tab opens on the device
- [ ] 3.2 Add light and dark theme tokens (colours, spacing, typography) and shared primitives (screen, button, text, empty state); verify both appearances on device
- [ ] 3.3 Add the floating add button with an action menu driven by a registry that later changes add to; verify a component test that registered actions are listed
- [ ] 3.4 Add empty states to every section; verify component tests render title and call to action

## 4. Local data

- [ ] 4.1 Add SQLite with Drizzle, the migration runner on app start and shared column conventions (UUID id, createdAt, updatedAt, deletedAt); verify a migration test against in-memory SQLite
- [ ] 4.2 Add an image store module (save, read, delete, relative paths under the document directory); verify unit tests with a mocked file system
- [ ] 4.3 Add a base repository with soft delete and undo; verify unit tests for create, update, delete and restore
- [ ] 4.4 Implement backup export of database and images as one archive via the share sheet; verify on device that the file opens in the Files app
- [ ] 4.5 Implement backup import with validation and a confirmation step; verify that an invalid file leaves data unchanged and a valid file restores it

## 5. Localisation

- [ ] 5.1 Add i18next with `en` and `cs` resources, device language detection and English fallback; verify unit tests for the three language cases
- [ ] 5.2 Add the language override in Settings, persisted across restarts; verify on device
- [ ] 5.3 Add locale-aware date, number, temperature and currency formatters; verify unit tests for both languages
- [ ] 5.4 Add a CI check that fails when a translation key is missing in either language; verify by removing a key

## 6. AI settings

- [ ] 6.1 Add the AI access module with a provider interface and secure key storage; verify unit tests with a mocked secure store
- [ ] 6.2 Build the key settings screen with masked display, save, test and remove; verify component tests for connected and rejected states
- [ ] 6.3 Add the shared "key needed" prompt with a shortcut to Settings; verify a component test
- [ ] 6.4 Confirm that backup export excludes keys; verify a unit test inspecting the archive contents

## 7. Wrap-up

- [ ] 7.1 Show version and build number in Settings; verify they match the workflow run
- [ ] 7.2 Run the full check on a tagged release installed through AltStore; verify every scenario in the five specs by hand and record the result in the pull request
