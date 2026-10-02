## Why

Once there are dozens of outfits, a single grid stops being usable, and the user wants to try pieces before buying them and show outfits to other people. The reference app has all three: lookbooks, a Wishlist tab next to Closet, and a share button on each outfit.

## What Changes

- Add lookbooks: named collections of outfits (for example "Summer", "Work", "Holiday in Italy") with a cover, shown at the top of the Outfits section.
- Add the wishlist: items the user does not own yet, in a Wishlist tab next to Closet, added from a shop link or a photo, with price and link.
- Allow wishlist items in the outfit editor and in try-on renders, clearly marked, so a purchase can be judged against the existing wardrobe.
- Add "I bought it", which moves a wishlist item into the closet with the purchase date and price.
- Add sharing: export an outfit as an image (render or collage, with an optional item list) through the system share sheet, and save to the photo library.
- Add sharing of a whole lookbook as a single contact-sheet image.

## Capabilities

### New Capabilities
- `lookbooks`: Named collections of outfits and how they are created, filled, browsed and removed.
- `wishlist`: Items the user does not own, their use in outfits and their conversion into owned items.
- `outfit-sharing`: Exporting outfits and lookbooks as images to other apps and to the photo library.

### Modified Capabilities

None.

## Impact

- New tables for lookbooks and their outfits; the item record gains a wishlist ownership state.
- Closet queries, statistics and suggestions must exclude wishlist items unless asked.
- Uses permission to add images to the photo library.
- No new external services.
