## Context

The chosen approach is "photo is the avatar": the user's own full-body photo is what gets dressed. Gender and body type are hints for the AI render and for suggestions, not a replacement for the photo. Depends on `add-app-foundation`.

## Goals / Non-Goals

**Goals:**
- Get a usable avatar photo with as few retakes as possible.
- Keep the flow short: five screens, each skippable except the name.

**Non-Goals:**
- Generating a synthetic model from presets.
- Multiple profiles on one device.
- Body measurements from the photo.

## Decisions

### Single profile record
One profile row with name, gender, body type, optional height and sizes, and the path of the avatar image. A single-user app does not need a users table, but the row has an id so a later account can own it.

### Body type as a small illustrated set
Five neutral silhouettes per gender choice (for example slim, athletic, average, curvy, plus), shown as illustrations with short labels. "Prefer not to say" shows a combined set. The value is passed as text in AI prompts; no logic depends on it.
Alternative: free-form measurements. Rejected as too much effort for the benefit.

### Avatar photo checks on the device
After capture, the app runs the on-device person detection that iOS provides to check that exactly one person is present and that the body is fully in frame, then shows the result with retake or keep. The check warns but never blocks, because lighting and clothing can fool it.
The photo is stored at full resolution and a downscaled copy is kept for sending to the image provider.

### Avatar standardisation is deferred
A clean studio-style avatar (plain background, neutral pose) makes renders more consistent. Producing it needs the image provider, so the option is added in `add-outfits-try-on`; this change only stores the original photo.

### Onboarding gate
The app shows onboarding when no profile exists. Skipping the photo is allowed; features needing it prompt for it later.

## Risks / Trade-offs

- [Poor avatar photo leads to poor renders] → Photo guidance screen with a good and a bad example, plus the on-device check.
- [A body photo is sensitive data] → Stored only on the device and in backups the user creates; sent to the provider only on an explicit render action; stated plainly on the photo step.
- [Gender options feel limiting] → "Prefer not to say" is a first-class option and unlocks all clothing categories.
