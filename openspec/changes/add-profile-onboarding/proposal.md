## Why

Try-on rendering needs a picture of the user to dress, and suggestions need to know who they are dressing. This has to be collected once, before the closet and outfit features are useful.

## What Changes

- Add a first-run onboarding flow: welcome, name, gender (woman, man, prefer not to say), body type, full-body photo.
- Add guidance and checks for the avatar photo (full body visible, one person, plain pose) so try-on renders work.
- Add a Profile section where every onboarding answer can be changed later, including replacing the avatar photo.
- Add optional sizing details (height, usual clothing sizes) used as hints by AI features.
- Add a greeting that uses the user's name and the time of day.

## Capabilities

### New Capabilities
- `user-profile`: The user's identity and body details, the avatar photo, onboarding and later editing.

### Modified Capabilities

None.

## Impact

- New profile record and avatar image in local storage; included in backups.
- Uses the camera and photo library, which require permission prompts with explanatory text in both languages.
- The avatar photo is sent to the image provider only when a try-on render is requested (see `add-outfits-try-on`).
