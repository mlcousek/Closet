## 1. Provider trial

- [ ] 1.1 Write a standalone script that renders three sample outfits on a sample avatar with the multi-image generative provider and with the dedicated try-on provider; verify output images are saved side by side
- [ ] 1.2 Compare identity preservation, garment accuracy, time and cost, choose the default and record it in `docs/decisions.md`; verify the document names the default and the reason

## 2. Data

- [x] 2.1 Add outfits, outfit items and renders tables with migrations and repositories; verify repository unit tests including slot rules (full body clears top and bottom, single shoes and bag)
- [x] 2.2 Add the input fingerprint (base avatar version plus sorted item ids) and render reuse lookup; verify unit tests for match and mismatch
- [x] 2.3 Add the usage log table and monthly and total counts; verify unit tests
- [x] 2.4 Include outfits and renders in backup export and import; verify a round-trip unit test

## 3. Collage

- [ ] 3.1 Implement the local collage composer laying out cutouts by slot; verify snapshot tests for two, four and six pieces
- [ ] 3.2 Implement the labelled outfit sheet composer used as provider input; verify a snapshot test

## 4. Outfit editor

- [x] 4.1 Build the snapping slot carousel component with a "none" position and hide control; verify component tests for selection and hide
- [x] 4.2 Build the editor screen with one row per slot, live collage preview and draft state; verify a component test that changing a row updates the preview
- [x] 4.3 Add multi-piece slots with the add control; verify a component test for two accessories
- [x] 4.4 Add row filters and shuffle; verify a unit test that shuffle only picks items of the right slot
- [x] 4.5 Add save, the empty-outfit guard and the unsaved-changes confirmation; verify component tests
- [ ] 4.6 Add "create outfit" on item detail and "duplicate" on outfit detail; verify on device

## 5. Try-on rendering

- [x] 5.1 Add the render function to the AI module with the provider interface and the default provider implementation; verify unit tests with mocked responses for success, refusal, timeout and rate limit
- [ ] 5.2 Add the second provider implementation behind the same interface; verify the same unit test suite passes
- [x] 5.3 Build the prompt from profile hints and item descriptions; verify a unit test on the generated prompt for a sample outfit
- [x] 5.4 Add the render queue (one at a time, states, no automatic retry) triggered on save, with fingerprint reuse; verify unit tests for reuse and for failure keeping the previous render
- [x] 5.5 Add the one-time disclosure before the first render; verify a component test
- [x] 5.6 Add the automatic-render toggle and the model id setting; verify a component test for manual mode

## 6. Studio avatar

- [ ] 6.1 Add the studio avatar request and the accept or reject screen in Profile; verify on device
- [x] 6.2 Version the base avatar and mark existing renders outdated when it changes; verify a unit test

## 7. Outfits section

- [x] 7.1 Build the outfits grid with render or collage, progress and failed states, and filters; verify component tests for each state
- [x] 7.2 Build outfit detail with large image, item list, Regenerate, previous render, rename, favourite, edit and delete with undo; verify component tests
- [x] 7.3 Register "Create outfit" in the global add menu; verify a component test
- [x] 7.4 Show render usage in the AI section of Settings; verify a component test

## 8. Item removal rules

- [x] 8.1 Add the affected-outfits count to item delete confirmation and remove the item from outfits on confirm; verify repository unit tests
- [x] 8.2 Mark archived items inside outfits and mark renders outdated when an item is removed; verify component tests

## 9. Wrap-up

- [x] 9.1 Add all new strings in English and Czech; verify the missing-key check passes
- [ ] 9.2 Walk through every scenario in the `outfit-builder` and `virtual-try-on` specs on device with real keys and record the result in the pull request
