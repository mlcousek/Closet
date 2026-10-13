## Purpose

Defines how the user's wardrobe data and images are kept on the device, survive app restarts and updates, and can be backed up and restored.

## ADDED Requirements

### Requirement: Offline persistence
The app SHALL store all user-created records and images on the device and make them available without a network connection.

#### Scenario: Restart without network
- **WHEN** the user creates data, closes the app, disables the network and reopens the app
- **THEN** all previously created data and images are shown

### Requirement: Data survives updates
Installing a newer build over an existing one SHALL preserve all stored data and apply any required data migrations automatically.

#### Scenario: Update with a changed data structure
- **WHEN** a newer build with a changed data structure is installed over an older one
- **THEN** the app opens with all existing data intact and usable

### Requirement: Recoverable deletion
Deleting a record SHALL remove it from all lists immediately and offer an undo for a short period.

#### Scenario: Undo a deletion
- **WHEN** the user deletes a record and taps undo while the option is shown
- **THEN** the record reappears unchanged

### Requirement: Backup export
The user SHALL be able to export all data and images as a single backup file to a location of their choice.

#### Scenario: Exporting a backup
- **WHEN** the user chooses to export a backup
- **THEN** a single file containing all records and images is produced and the system share sheet is shown

### Requirement: Backup import
The user SHALL be able to restore the app from a backup file, replacing current data after confirmation.

#### Scenario: Restoring a backup
- **WHEN** the user selects a valid backup file and confirms the replacement
- **THEN** the app's data and images match the contents of the backup

#### Scenario: Invalid backup file
- **WHEN** the user selects a file that is not a valid backup
- **THEN** an error is shown and existing data is left unchanged
