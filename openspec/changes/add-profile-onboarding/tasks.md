## 1. Data

- [ ] 1.1 Add the profile table and repository (name, gender, body type, height, sizes, avatar path); verify repository unit tests
- [ ] 1.2 Include the profile and avatar in backup export and import; verify a round-trip unit test

## 2. Onboarding flow

- [ ] 2.1 Add the onboarding gate that shows the flow when no profile exists; verify a component test for both states
- [ ] 2.2 Build the welcome and name steps; verify the name is required to continue
- [ ] 2.3 Build the gender step with three options and skip; verify a component test
- [ ] 2.4 Create body type silhouettes and build the body type step filtered by gender; verify a component test for each gender choice
- [ ] 2.5 Build the avatar step with guidance, example images, camera and library pickers; verify on device
- [ ] 2.6 Add permission explanations in both languages and the denied-permission state; verify on device by denying access

## 3. Avatar handling

- [ ] 3.1 Store the avatar at full resolution plus a downscaled copy; verify unit tests on the image store
- [ ] 3.2 Add the on-device person check with a warn-and-keep option; verify on device with a good photo, a cropped photo and a photo with two people

## 4. Profile section

- [ ] 4.1 Build the Profile screen showing avatar, name, gender, body type and sizes; verify a component test
- [ ] 4.2 Add editing for every value, including replace and remove avatar with confirmation; verify component tests
- [ ] 4.3 Add the optional sizing form with unit handling per locale; verify unit tests

## 5. Greeting and wrap-up

- [ ] 5.1 Add the time-of-day greeting helper and show it on Home; verify unit tests for morning, afternoon, evening and night
- [ ] 5.2 Add all new strings in English and Czech; verify the missing-key check passes
- [ ] 5.3 Walk through every scenario in the `user-profile` spec on device and record the result in the pull request
