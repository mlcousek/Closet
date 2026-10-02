## Why

The closet is the core of the app: nothing can be styled, suggested or counted until the user's clothes are in it. Getting clothes in must be fast, because typing in a whole wardrobe by hand is where apps like this lose people.

## What Changes

- Add clothing items with a cutout image and details: category, subcategory, colours, seasons, occasions, brand, size, price, purchase date and notes.
- Add the Closet section: a grid of cutouts with category chips (Tops, Dresses and jumpsuits, Bottoms, Outerwear, Shoes, Bags, Accessories, Jewellery), search, sort, filters and multi-select.
- Add item capture from the camera or photo library with automatic background removal on the device.
- Add AI tagging that fills in the item details from the photo for the user to confirm.
- Add bulk import of many photos at once, processed as a queue that survives leaving the screen.
- Add import from a shop product link, which pulls the product image and details.
- Add item detail with editing, archive (no longer owned) and delete.

## Capabilities

### New Capabilities
- `closet-items`: Clothing item records, their attributes, browsing, searching, filtering, editing and removal.
- `item-import`: Ways of getting items into the closet: single photo, bulk photos and shop link, including cutout creation and automatic tagging.

### Modified Capabilities

None.

## Impact

- New tables for items and their tags; new images (original and cutout) in local storage.
- Adds a small native module for on-device background removal, so the development client must be rebuilt.
- Uses the vision provider key from `ai-settings` for tagging; each tagged item is one provider request.
- Network access to shop pages for link import.
