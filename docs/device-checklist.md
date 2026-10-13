# Device checklist

Written 13 October 2026, when the seven original OpenSpec changes were archived. These are the tasks that were still open then. Nearly all of them are implemented and covered by automated tests, and only wait for a check on the iPhone or with real provider keys. The number in brackets is the task in the archived change's `tasks.md` (under `openspec/changes/archive/`), where the full wording is.

Tick an item here when it is checked, and write down anything that did not work.

## On the iPhone

### Install and basics (`add-app-foundation`)

- [ ] The release and development builds from the IPA workflow download, and both install through AltStore. (2.2, 2.3)
- [ ] AltStore lists the app from the source URL of a tagged release. (2.4)
- [ ] The development client connects to Metro on the Windows PC, and a code change reloads on the phone. (2.5)
- [ ] Every tab opens. (3.1)
- [ ] Light and dark appearance both look right. (3.2)
- [ ] A backup exported through the share sheet opens in the Files app. (4.4)
- [ ] The language chosen in Settings is kept after restarting the app. (5.2)
- [ ] The version and build number in Settings match the workflow run. (7.1)
- [ ] Every scenario of the `ai-settings`, `app-shell`, `build-pipeline`, `local-data` and `localization` specs, on a tagged release. (7.2)

### Profile and your photo (`add-profile-onboarding`)

- [ ] Taking and choosing your photo in Profile, with the guidance shown. (2.5)
- [ ] Denying camera and photo access shows the explanation and the way to system settings. (2.6)
- [ ] The person check warns for a cropped photo and for a photo with two people, and lets you keep it; a good photo passes. (3.2)
- [ ] Every scenario of the `user-profile` spec. (5.3)

### Wardrobe and imports (`add-closet`)

- [ ] Background removal on a sample garment, and on five different garments. (2.1, 2.2)
- [ ] A blank photo keeps the original and says why. (2.3)
- [ ] A rebuilt development client loads the app. (2.4)
- [ ] The capture screen with tips, and the cutout preview with keep original and retake. (4.2)
- [ ] A saved item appears in the grid. (4.4)
- [ ] Scrolling stays smooth with 300 items. (5.1)
- [ ] Importing twenty photos at once, with the progress view and the indicator. (6.2)
- [ ] The source link in item detail opens the browser. (7.3)
- [ ] Every scenario of the `closet-items` and `item-import` specs. (8.2)

### Outfits and try-on (`add-outfits-try-on`)

- [ ] Create outfit on item detail, and Duplicate on outfit detail. (4.6)
- [ ] Taking a photo and choosing one from Photos as the outfit's own picture.
- [ ] The free try-on: the shared sheet is not blank or cut off in the other app, and the picture comes back from Photos.
- [ ] The studio photo request and its accept or reject screen in Profile, with a real key. (6.1)
- [ ] Every scenario of the `outfit-builder` and `virtual-try-on` specs, with real keys. (9.2)

### Lookbooks, wishlist and sharing (`add-lookbooks-wishlist-sharing`)

- [ ] Sharing an outfit to Messages. (3.2)
- [ ] Saving to Photos, and the explanation when adding photos is not allowed. (3.3)
- [ ] Every scenario of the `lookbooks`, `wishlist` and `outfit-sharing` specs. (4.2)

### Weather, calendar and reminders (`add-planning-weather`)

- [ ] Approximate location when allowed and when denied, with the explanation in both languages. (2.3)
- [ ] City search and the chosen city. (2.4)
- [ ] The daily reminder arrives and opens Home; it is scheduled again after restarting. (6.1)
- [ ] The state when notifications are not allowed. (6.2)
- [ ] Three real days of suggestions: note how good they were and adjust the weights. (7.2)
- [ ] Every scenario of the `home-today`, `weather-suggestions` and `outfit-calendar` specs. (7.3)

### Stylist, statistics, trips and display mode (`add-smart-features`)

- [ ] Display mode keeps the screen awake past the auto-lock time, and releases it on exit. (4.2)
- [ ] Display mode in portrait and landscape. (4.3)
- [ ] Dimming after inactivity, the slow content shift, and tap then exit. (4.4)
- [ ] Start while charging, on the charger and on battery. (4.5)
- [ ] Every scenario of the `ai-stylist`, `closet-statistics`, `trip-packing` and `display-mode` specs. (5.2)

## Elsewhere

- [ ] GitHub: a branch with a deliberately failing test fails the CI run. (`add-app-foundation` 2.1)
- [ ] PC: following `docs/building.md` from a fresh clone works. (`add-app-foundation` 2.6)
- [ ] Provider keys: render three sample outfits with Gemini and with a dedicated try-on service, compare them, and record the default in `docs/decisions.md`. (`add-outfits-try-on` 1.1, 1.2)
- [ ] A FASHN (fal.ai) key: add the second try-on provider, written against a working key. (`add-outfits-try-on` 5.2)

## Decided against

- Charting library (`add-smart-features` 2.2): the charts are plain views, so the build gains no native dependency. See `docs/decisions.md`.
