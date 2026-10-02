## Purpose

Defines clothing items: what is recorded about each one and how the user browses, finds, edits and removes them in the Closet section.

## ADDED Requirements

### Requirement: Item details
Each item SHALL have an image and a category, and MAY have a name, subcategory, colours, seasons, occasions, warmth level, brand, size, price, purchase date, notes and a source link.

#### Scenario: Saving a minimal item
- **WHEN** the user saves an item with only an image and a category
- **THEN** the item is stored and appears in the closet

#### Scenario: Missing category
- **WHEN** the user tries to save an item without a category
- **THEN** the item is not saved and the category field is marked as required

### Requirement: Closet grid
The Closet section SHALL show items as a grid of cutout images with the brand or name beneath each, newest first by default.

#### Scenario: Browsing a large closet
- **WHEN** the closet holds several hundred items and the user scrolls
- **THEN** scrolling stays smooth and images appear without blocking interaction

### Requirement: Category filter
The user SHALL be able to filter the grid by category using a row of category chips: Tops, Dresses and jumpsuits, Bottoms, Outerwear, Shoes, Bags, Accessories and Jewellery.

#### Scenario: Selecting a category
- **WHEN** the user taps the Shoes chip
- **THEN** only shoes are shown and the chip is marked active

#### Scenario: Clearing the category
- **WHEN** the user taps the active chip again
- **THEN** all items are shown

### Requirement: Search
The user SHALL be able to search items by text matching name, brand, category, subcategory, colour or notes.

#### Scenario: Searching by brand
- **WHEN** the user types a brand name into search
- **THEN** only items of that brand are shown

#### Scenario: No results
- **WHEN** the search matches no items
- **THEN** a message says nothing was found and offers to clear the search

### Requirement: Additional filters and sorting
The user SHALL be able to filter by colour, season, occasion and brand, combine filters, and sort by date added, name, price or brand.

#### Scenario: Combining filters
- **WHEN** the user selects the colour pink and the season summer
- **THEN** only items tagged with both are shown and the number of active filters is indicated

### Requirement: Item detail and editing
The user SHALL be able to open an item to see all its details and edit any of them, including replacing the image.

#### Scenario: Editing a detail
- **WHEN** the user changes the brand of an item and saves
- **THEN** the grid and the detail show the new brand

### Requirement: Archive and delete
The user SHALL be able to archive an item they no longer own and to delete an item. Archived items SHALL be hidden from the grid by default and remain available through a filter.

#### Scenario: Archiving an item
- **WHEN** the user archives an item
- **THEN** it disappears from the default grid and appears under the archived filter

#### Scenario: Deleting an item
- **WHEN** the user deletes an item and confirms
- **THEN** the item and its images are removed and an undo is offered

### Requirement: Multi-select actions
The user SHALL be able to select several items and archive, delete or re-tag them together.

#### Scenario: Deleting several items
- **WHEN** the user selects three items and chooses delete
- **THEN** a confirmation states the number of items, and on confirming all three are removed

### Requirement: Closet count
The Closet section SHALL show the total number of owned items and the number in the current filter.

#### Scenario: Count with a filter
- **WHEN** a category filter is active
- **THEN** the count shows how many items match out of the total
