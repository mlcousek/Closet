## Context

The reference app shows items as clean cutouts on white with a brand label, grouped by category chips. The user wants three ways in: single photo with automatic cutout and tags, bulk import from the gallery, and import from a shop link. Depends on `add-app-foundation` and `add-profile-onboarding`.

## Goals / Non-Goals

**Goals:**
- Adding one item takes a photo and one confirmation tap in the normal case.
- Cutouts cost nothing and work offline.
- A fixed taxonomy that later features (outfit slots, weather rules, statistics) can rely on.

**Non-Goals:**
- Wishlist items (added in `add-lookbooks-wishlist-sharing`, reusing the same item record).
- Barcode or receipt scanning.
- A share extension from the browser (would use an extra app identifier under the free Apple ID limit).

## Decisions

### Item record
One `items` table: name, category, subcategory, colours, seasons, occasions, warmth level, brand, size, price and currency, purchase date, notes, source link, ownership state (owned or archived), paths of original and cutout images, and a "needs review" flag. Multi-value fields are stored as JSON arrays; SQLite JSON functions are enough for filtering at wardrobe scale (hundreds to low thousands of items).

### Fixed taxonomy in code
Categories, subcategories, colour names, seasons, occasions and warmth levels are constants with English and Czech labels. Each category maps to an outfit slot (top, bottom, full body, outer layer, shoes, bag, accessory), which `add-outfits-try-on` uses for its carousels. The category set shown depends on nothing in the profile; all categories are available to everyone.
Alternative: user-defined categories. Rejected for now because free-form categories break slot mapping and suggestions; free-form tags can be added later without affecting this.

### Background removal on the device
Use the subject-lifting capability built into iOS (available from iOS 17) through a native module. First choice is an existing community Expo or React Native module; if none is reliable, write a small Expo module in Swift, which CI compiles. The result is a transparent PNG trimmed to the subject, plus a thumbnail.
Alternatives: a cloud removal service (costs per image, needs network and a third key) or a JavaScript model (slow, large download). The cloud service stays as a documented fallback if the native route proves unworkable without a Mac.
The user can always keep the original photo if the cutout is wrong, and can retry with a different photo.

### AI tagging
One request per item to the vision provider (Anthropic Claude, the small fast model by default) with the downscaled cutout and the taxonomy, asking for structured output constrained to taxonomy values plus a short name and a guessed brand if a logo is readable. The result pre-fills the form; the user confirms or edits. Without a key or network, the form opens empty and the item is still saved.

### Import queue
Bulk import creates one job per photo in a persistent queue table and processes jobs two at a time: cutout, then tagging, then save as an item marked "needs review". The queue continues while the user browses the app and resumes after a restart. A review screen lets the user step through pending items quickly.
iOS suspends apps in the background, so processing only runs while the app is open; the screen says so.

### Link import
Fetch the product page, read structured product data (JSON-LD, then Open Graph tags) for name, brand, price and images. Show the found images so the user picks the one without a model where possible, then run the normal cutout and tagging path. If the page cannot be read, explain and offer the photo path with a saved image or screenshot.

### Browsing performance
Grid uses a virtualised list with thumbnails (about 300 px) generated at save time; full cutouts load only in detail. Filters and sort are query parameters on the repository, cached per combination.

## Risks / Trade-offs

- [Native module cannot be debugged without a Mac] → Prefer a maintained community module; keep the module surface to one function; keep the cloud fallback behind the same interface.
- [Cutout fails on flat-lay photos with busy backgrounds or on white clothes on white] → Capture tips on the camera screen; keep-original option.
- [Shop pages block automated requests or show only model photos] → Image picker for found images; clear fallback to photo import.
- [AI tags are wrong] → Tags are suggestions the user confirms; the "needs review" flag keeps unconfirmed items visible.
- [Tagging cost for a large bulk import] → Show the number of items before starting; small model and downscaled image keep the cost per item to a fraction of a cent.

## Open Questions

- Which community background-removal module to adopt is decided by a short trial in the first task; it does not change specs or the task list.
