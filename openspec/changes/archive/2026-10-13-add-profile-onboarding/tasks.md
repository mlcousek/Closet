> Status note (8 October 2026): this is the original implementation/verification checklist. Unchecked tasks can contain implemented behavior awaiting their stated validation. See [current status](../../../docs/status.md) and [decisions](../../../docs/decisions.md) for superseded designs and remaining checks.

## 1. Data

- [x] 1.1 Add the profile table and repository (name, gender, body type, height, sizes, avatar path); verify repository unit tests
- [x] 1.2 Include the profile and avatar in backup export and import; verify a round-trip unit test

## 2. Onboarding flow

- [x] 2.1 Add the onboarding gate that shows the flow when no profile exists; verify a component test for both states
- [x] 2.2 Build the welcome and name steps; verify the name is required to continue
- [x] 2.3 Provide the three gender options in Profile editing; onboarding no longer collects gender
- [x] 2.4 Provide matching body type silhouettes in Profile editing; onboarding no longer collects body type
- [ ] 2.5 Provide the optional Profile avatar picker with guidance, camera and library; verify native behavior on device
- [ ] 2.6 Add permission explanations in both languages and the denied-permission state; verify on device by denying access

## 3. Avatar handling

- [x] 3.1 Store the avatar at full resolution plus a downscaled copy; verify unit tests on the image store
- [ ] 3.2 Add the on-device person check with a warn-and-keep option; verify on device with a good photo, a cropped photo and a photo with two people

## 4. Profile section

- [x] 4.1 Build the Profile screen showing avatar, name, gender, body type and sizes; verify a component test
- [x] 4.2 Add editing for every value, including replace and remove avatar with confirmation; verify component tests
- [x] 4.3 Add the optional sizing form with unit handling per locale; verify unit tests

## 5. Greeting and wrap-up

- [x] 5.1 Add the time-of-day greeting helper and show it on Home; verify unit tests for morning, afternoon, evening and night
- [x] 5.2 Add all new strings in English and Czech; verify the missing-key check passes
- [ ] 5.3 Walk through every scenario in the `user-profile` spec on device and record the result in the pull request
