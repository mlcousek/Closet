## Purpose

Defines the ways items get into the closet (single photo, bulk photos and shop link) and the automatic cutout and tagging applied to them.

## ADDED Requirements

### Requirement: Add from a photo
The user SHALL be able to add an item by taking a photo or choosing one from the photo library.

#### Scenario: Adding from the camera
- **WHEN** the user chooses to add an item, takes a photo and confirms the details
- **THEN** a new item appears in the closet with that image

#### Scenario: Capture tips
- **WHEN** the camera screen opens for an item
- **THEN** a short tip explains how to photograph clothing for a good cutout

### Requirement: Automatic cutout
The app SHALL remove the background from an item photo on the device, without a network connection, and show the result before saving.

#### Scenario: Successful cutout
- **WHEN** the user provides a photo of a single garment
- **THEN** the garment is shown isolated on a plain background

#### Scenario: Unsatisfactory cutout
- **WHEN** the user is not satisfied with the cutout
- **THEN** they can keep the original photo instead or choose another photo

#### Scenario: Cutout not possible
- **WHEN** no subject can be isolated in the photo
- **THEN** the original photo is used and a message explains why

### Requirement: Automatic tagging
When a vision provider key is available, the app SHALL suggest category, subcategory, colours, seasons, occasions, warmth level and a name from the image, and the user SHALL be able to accept or change every suggestion before saving.

#### Scenario: Suggestions shown
- **WHEN** the cutout is ready and tagging succeeds
- **THEN** the item form is pre-filled with suggestions that are visibly marked as suggested

#### Scenario: Tagging unavailable
- **WHEN** there is no key, no network or the provider returns an error
- **THEN** the form opens without suggestions, a short notice explains why, and the item can still be saved

### Requirement: Bulk import
The user SHALL be able to select many photos at once and have each turned into an item with cutout and suggested tags.

#### Scenario: Starting a bulk import
- **WHEN** the user selects twenty photos and starts the import
- **THEN** progress shows how many are done, in progress and remaining

#### Scenario: Leaving during an import
- **WHEN** the user moves to another section while an import is running
- **THEN** the import continues and a progress indicator remains visible

#### Scenario: App restarted during an import
- **WHEN** the app is closed and reopened with photos still unprocessed
- **THEN** the import resumes with the remaining photos

#### Scenario: One photo fails
- **WHEN** processing fails for one photo
- **THEN** the other photos are still imported and the failed one is listed with a retry option

### Requirement: Review of imported items
Items created by bulk import SHALL be marked as needing review until the user confirms them, and the user SHALL be able to review them one after another.

#### Scenario: Reviewing imported items
- **WHEN** the user opens the review queue
- **THEN** each unconfirmed item is shown in turn with its suggested details to confirm, edit or discard

#### Scenario: Unreviewed items in the closet
- **WHEN** unconfirmed items exist
- **THEN** the Closet section shows how many need review with a shortcut to the review queue

### Requirement: Import from a shop link
The user SHALL be able to add an item by pasting a link to a product page, and the app SHALL fetch the product image, name, brand and price where the page provides them.

#### Scenario: Readable product page
- **WHEN** the user pastes a link to a product page that provides product data
- **THEN** the found images and details are shown for the user to choose an image and confirm

#### Scenario: Link on the clipboard
- **WHEN** the user opens link import with a web link on the clipboard
- **THEN** the app offers to use that link

#### Scenario: Unreadable page
- **WHEN** the page cannot be fetched or contains no product data
- **THEN** a message explains the problem and offers to add the item from a photo instead

### Requirement: Source link kept
An item imported from a link SHALL keep that link, and the user SHALL be able to open it from the item detail.

#### Scenario: Opening the source
- **WHEN** the user taps the source link in an item detail
- **THEN** the product page opens in the browser
