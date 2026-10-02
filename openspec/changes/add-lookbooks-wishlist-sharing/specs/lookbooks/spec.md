## Purpose

Defines lookbooks: named collections that let the user group outfits by theme, season or occasion and browse them separately from the full outfits grid.

## ADDED Requirements

### Requirement: Creating a lookbook
The user SHALL be able to create a lookbook with a name and an optional description.

#### Scenario: New lookbook
- **WHEN** the user creates a lookbook named "Summer"
- **THEN** it appears in the lookbooks row of the Outfits section

#### Scenario: Missing name
- **WHEN** the user tries to create a lookbook without a name
- **THEN** it is not created and the name field is marked as required

### Requirement: Adding and removing outfits
The user SHALL be able to add outfits to a lookbook and remove them, from the lookbook and from the outfit detail. An outfit MAY belong to several lookbooks.

#### Scenario: Adding from outfit detail
- **WHEN** the user adds an outfit to two lookbooks from its detail
- **THEN** the outfit appears in both lookbooks

#### Scenario: Adding several outfits
- **WHEN** the user selects several outfits in the grid and adds them to a lookbook
- **THEN** all selected outfits appear in that lookbook

#### Scenario: Removing from a lookbook
- **WHEN** the user removes an outfit from a lookbook
- **THEN** the outfit leaves that lookbook and remains in the outfits grid

### Requirement: Browsing a lookbook
Opening a lookbook SHALL show its outfits as a grid in an order the user can rearrange.

#### Scenario: Reordering
- **WHEN** the user drags an outfit to a new position in a lookbook
- **THEN** the new order is kept across restarts

#### Scenario: Empty lookbook
- **WHEN** a lookbook has no outfits
- **THEN** a message explains how to add outfits to it

### Requirement: Lookbook cover
Each lookbook SHALL show a cover image, which is its first outfit unless the user chooses another.

#### Scenario: Choosing a cover
- **WHEN** the user sets an outfit as the cover
- **THEN** the lookbook is shown with that outfit's image

### Requirement: Renaming and deleting a lookbook
The user SHALL be able to rename and delete a lookbook. Deleting a lookbook SHALL NOT delete its outfits.

#### Scenario: Deleting a lookbook
- **WHEN** the user deletes a lookbook and confirms
- **THEN** the lookbook is removed and all its outfits remain in the outfits grid
