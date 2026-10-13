## Purpose

Defines outfits as combinations of closet items and how the user creates, edits, browses and removes them.

## ADDED Requirements

### Requirement: Outfit composition
An outfit SHALL consist of closet items assigned to slots: outer layer, top, bottom, full body, shoes, bag and accessories. An outfit SHALL contain at least one item.

#### Scenario: Saving an outfit
- **WHEN** the user selects a top, a bottom and shoes and saves
- **THEN** an outfit containing those three items is stored and appears in the Outfits section

#### Scenario: Empty outfit
- **WHEN** no item is selected in any slot
- **THEN** saving is not possible

#### Scenario: Full-body piece
- **WHEN** the user selects a dress in the full body slot
- **THEN** the top and bottom slots are cleared and shown as not needed

### Requirement: Slot carousels
The outfit editor SHALL show one horizontally scrolling row of closet items per slot, and the item at the centre of a row SHALL be the selection for that slot.

#### Scenario: Swiping a slot
- **WHEN** the user swipes the tops row
- **THEN** the next top snaps to the centre and becomes the selected top

#### Scenario: Leaving a slot empty
- **WHEN** the user hides a slot
- **THEN** the slot contributes no item to the outfit and can be shown again

#### Scenario: Slot with no items
- **WHEN** the closet has no items for a slot
- **THEN** the row shows a shortcut to add an item of that kind

### Requirement: Layering and extra pieces
The user SHALL be able to add more than one item to the outer layer, top and accessories slots.

#### Scenario: Adding a second accessory
- **WHEN** the user adds a second piece to accessories
- **THEN** both pieces are part of the outfit

### Requirement: Instant preview
The editor SHALL show a preview of the selected pieces together that updates immediately on every change, without a network connection.

#### Scenario: Changing a piece
- **WHEN** the user changes the selected bottom
- **THEN** the preview shows the new bottom without delay

### Requirement: Narrowing and shuffling
The user SHALL be able to filter the items offered in a row and to ask for a random combination.

#### Scenario: Shuffle
- **WHEN** the user taps shuffle
- **THEN** each visible slot selects a random item and the preview updates

### Requirement: Start from an item or an outfit
The user SHALL be able to start a new outfit from a closet item, and to duplicate an existing outfit as a starting point.

#### Scenario: Starting from an item
- **WHEN** the user chooses "create outfit" on a closet item
- **THEN** the editor opens with that item selected in its slot

### Requirement: Discarding changes
Leaving the editor without saving SHALL leave the stored outfit unchanged, after asking for confirmation when there are unsaved changes.

#### Scenario: Leaving with unsaved changes
- **WHEN** the user leaves the editor after changing a piece without saving
- **THEN** a confirmation is shown, and on discarding the stored outfit is unchanged

### Requirement: Outfits grid
The Outfits section SHALL show saved outfits as a grid of images, newest first, with filters for favourites, season and occasion.

#### Scenario: Outfit without a render
- **WHEN** an outfit has no try-on render
- **THEN** the grid shows its flat preview instead

### Requirement: Outfit detail
The user SHALL be able to open an outfit to see its image large, the items it contains, and to rename, edit, duplicate, mark as favourite or delete it.

#### Scenario: Opening an item from an outfit
- **WHEN** the user taps an item in the outfit detail
- **THEN** that item's detail opens

#### Scenario: Deleting an outfit
- **WHEN** the user deletes an outfit and confirms
- **THEN** the outfit disappears from the grid, its items remain in the closet, and an undo is offered

### Requirement: Removed items in outfits
Deleting a closet item that is used in outfits SHALL warn how many outfits are affected, and archived items SHALL remain in their outfits marked as archived.

#### Scenario: Deleting a used item
- **WHEN** the user deletes an item used in two outfits
- **THEN** the confirmation states that two outfits are affected, and on confirming the item is removed from both
