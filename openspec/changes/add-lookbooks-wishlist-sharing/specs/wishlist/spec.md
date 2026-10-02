## Purpose

Defines the wishlist: items the user is considering buying, kept apart from owned items, usable in outfits to judge a purchase, and convertible into owned items.

## ADDED Requirements

### Requirement: Wishlist tab
The Closet section SHALL have a Wishlist tab showing wishlist items separately from owned items.

#### Scenario: Switching tabs
- **WHEN** the user switches from Closet to Wishlist
- **THEN** only wishlist items are shown

#### Scenario: Empty wishlist
- **WHEN** the wishlist has no items
- **THEN** a message explains what the wishlist is for and offers to add an item from a link

### Requirement: Adding wishlist items
The user SHALL be able to add a wishlist item from a shop link or from a photo, with the same cutout and tagging as closet items.

#### Scenario: Adding from a link
- **WHEN** the user adds an item from a product link while on the Wishlist tab
- **THEN** the item is saved to the wishlist with its price and link

### Requirement: Separation from owned items
Wishlist items SHALL NOT appear in the Closet tab, in item counts, in statistics or in outfit suggestions.

#### Scenario: Closet count
- **WHEN** the user has ten owned items and three wishlist items
- **THEN** the closet count shows ten

### Requirement: Wishlist items in outfits
The user SHALL be able to include wishlist items when building an outfit, and such items and outfits SHALL be visibly marked.

#### Scenario: Trying a wishlist item
- **WHEN** the user turns on wishlist items in the outfit editor and selects one
- **THEN** the item is shown with a wishlist mark and can be saved and rendered as part of the outfit

#### Scenario: Outfit with a wishlist item
- **WHEN** an outfit contains a wishlist item
- **THEN** the outfit is marked in the grid and is not offered for planning on a day

### Requirement: Marking as bought
The user SHALL be able to mark a wishlist item as bought, which moves it to the closet with a purchase date and price.

#### Scenario: Buying an item
- **WHEN** the user marks a wishlist item as bought and confirms the price
- **THEN** the item appears in the Closet tab, leaves the Wishlist tab, and outfits containing it lose the wishlist mark

### Requirement: Wishlist total
The Wishlist tab SHALL show the number of items and the sum of their prices where prices are known.

#### Scenario: Total with a missing price
- **WHEN** some wishlist items have no price
- **THEN** the total covers the items with a price and states how many have none

### Requirement: Opening the shop page
The user SHALL be able to open the shop page of a wishlist item that has a link.

#### Scenario: Opening the link
- **WHEN** the user taps the shop link on a wishlist item
- **THEN** the product page opens in the browser
