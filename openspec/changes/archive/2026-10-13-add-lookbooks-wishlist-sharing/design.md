## Context

The reference video shows "Add Lookbook" above the outfits grid, a Wishlist tab beside Closet, and a share icon on outfit detail. Depends on `add-closet` and `add-outfits-try-on`.

## Goals / Non-Goals

**Goals:**
- Reuse the item record and import paths for wishlist items, so there is one editor and one cutout pipeline.
- Shared images look good on their own, without the app.

**Non-Goals:**
- Social features: profiles, followers, likes, comments. The counters seen in the reference app are left out.
- Public links to outfits (needs a backend).
- Price tracking or availability alerts for wishlist items.

## Decisions

### Lookbooks as a many-to-many collection
`lookbooks` (name, description, cover outfit, order) and `lookbook_outfits` (lookbook, outfit, order). An outfit can be in several lookbooks. Deleting a lookbook never deletes outfits. The cover defaults to the first outfit.
Alternative: a single folder per outfit. Rejected because one outfit commonly fits several themes.

### Wishlist as an ownership state
The item record gains the ownership value `wishlist` next to owned and archived. Every closet query takes an ownership filter that defaults to owned, so wishlist items cannot leak into counts, suggestions or statistics by accident. The Wishlist tab is the same grid component with the filter set.
"I bought it" flips the state to owned, sets the purchase date to today and asks to confirm the price. Outfits that used the item need no change.
Alternative: a separate wishlist table. Rejected because it duplicates the item form, import and editor integration.

### Wishlist items in outfits
The outfit editor has a toggle to include wishlist items in the carousels; they carry a badge. An outfit containing a wishlist item is itself badged, and is excluded from calendar planning and suggestions until all its items are owned.

### Share images composed locally
A share composer renders an off-screen view to an image: the render (or collage) on a plain background, the outfit name, and optionally a strip of item cutouts with brands. Three formats: portrait 4:5, story 9:16 and square. The result goes to the system share sheet or the photo library. A lookbook is shared as a contact sheet of up to twelve outfits per image.
No watermark or branding while the app is personal; a discreet app name can be added before a public release.

## Risks / Trade-offs

- [Wishlist items counted as owned somewhere] → Ownership filter is a required repository parameter with a safe default; a unit test covers every query used by statistics and suggestions.
- [Shop product photos on models make poor cutouts and renders] → Image picker from link import; the user can replace the image with a better one.
- [Sharing a render exposes the user's body photo] → Sharing is always an explicit action through the system sheet; a collage-only option is offered in the same dialog.
