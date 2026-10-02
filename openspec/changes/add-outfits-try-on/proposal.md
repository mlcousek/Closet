## Why

This is the feature that makes the app worth using: combining pieces from the closet into an outfit and seeing it on yourself before getting dressed. It is the centre of the reference video.

## What Changes

- Add outfits: a named combination of closet items, each in a slot (outer layer, top, bottom, full body, shoes, bag, accessories).
- Add the outfit editor from the video: one horizontal carousel per slot, swipe to change the piece, hide a slot, add extra pieces, then save.
- Add an instant flat collage of the chosen pieces as preview and as fallback image.
- Add AI try-on: a render of the user's avatar photo wearing the outfit, produced after saving and on demand with Regenerate.
- Add an optional studio avatar: a cleaned-up version of the avatar photo on a plain background, used as the base for all renders.
- Add the Outfits section: a grid of saved outfits shown as renders, with outfit detail, edit, duplicate, favourite and delete.
- Add render usage tracking so the user can see how many renders they have paid for.

## Capabilities

### New Capabilities
- `outfit-builder`: Creating, editing, browsing and removing outfits made of closet items.
- `virtual-try-on`: Rendering an outfit on the user's avatar with an AI image provider, including regeneration, failure handling and usage tracking.

### Modified Capabilities

None.

## Impact

- New tables for outfits, their items and renders; render images in local storage.
- Uses the image provider key from `ai-settings`; every render is a paid provider request taking several seconds.
- The avatar photo and item cutouts are sent to the image provider when a render is requested.
- Deleting or archiving a closet item now has to account for outfits that use it.
