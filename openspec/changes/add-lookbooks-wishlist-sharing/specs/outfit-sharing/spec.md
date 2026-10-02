## Purpose

Defines how the user exports outfits and lookbooks as images to share in other apps or keep in their photo library.

## ADDED Requirements

### Requirement: Share an outfit as an image
The user SHALL be able to share an outfit as an image through the system share sheet.

#### Scenario: Sharing from outfit detail
- **WHEN** the user taps share on an outfit and confirms the options
- **THEN** the system share sheet opens with an image of the outfit

### Requirement: Share options
Before sharing, the user SHALL be able to choose the image content (try-on render or flat preview), the format (portrait, story or square) and whether the list of items is included.

#### Scenario: Flat preview only
- **WHEN** the user chooses the flat preview
- **THEN** the shared image shows the pieces without the user's photo

#### Scenario: Including the item list
- **WHEN** the user includes the item list
- **THEN** the image shows each piece with its brand or name beneath the outfit

#### Scenario: Outfit without a render
- **WHEN** the outfit has no try-on render
- **THEN** only the flat preview is offered

### Requirement: Save to the photo library
The user SHALL be able to save the outfit image to the photo library.

#### Scenario: Saving
- **WHEN** the user chooses to save the image and permission is granted
- **THEN** the image is added to the photo library and a confirmation is shown

#### Scenario: Permission denied
- **WHEN** permission to add photos has been denied
- **THEN** an explanation is shown with a shortcut to the system settings

### Requirement: Share a lookbook
The user SHALL be able to share a lookbook as one or more images showing its outfits together with the lookbook name.

#### Scenario: Large lookbook
- **WHEN** a lookbook has more outfits than fit on one image
- **THEN** several images are produced and offered together

### Requirement: Explicit sharing only
The app SHALL NOT send outfit images anywhere without an explicit share or save action by the user.

#### Scenario: Cancelling the share sheet
- **WHEN** the user closes the share sheet without choosing a destination
- **THEN** nothing is sent or saved
