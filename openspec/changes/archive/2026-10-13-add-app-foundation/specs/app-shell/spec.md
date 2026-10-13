## Purpose

Defines the overall structure of the app: the main sections, how the user moves between them, and what is shown when a section has no content yet.

## ADDED Requirements

### Requirement: Main navigation
The app SHALL present five main sections reachable from a bottom tab bar: Home, Closet, Outfits, Calendar and Profile.

#### Scenario: Switching sections
- **WHEN** the user taps a tab
- **THEN** the corresponding section is shown and the tab is marked as active

#### Scenario: Returning to a section
- **WHEN** the user leaves a section and returns to it
- **THEN** the section shows the same scroll position and filters as before

### Requirement: Global add action
The app SHALL show a floating add button on the main sections that opens a menu of creation actions.

#### Scenario: Opening the add menu
- **WHEN** the user taps the add button
- **THEN** a menu lists the creation actions currently available in the app

### Requirement: Empty states
Each main section SHALL show an explanatory empty state with a call to action when it has no content.

#### Scenario: Empty closet
- **WHEN** the user opens Closet with no items stored
- **THEN** a message explains what the section is for and offers a button to add the first item

### Requirement: Light and dark appearance
The app SHALL follow the device appearance setting and remain legible in both light and dark modes.

#### Scenario: Device switches to dark mode
- **WHEN** the device appearance changes to dark
- **THEN** the app switches to its dark theme without restarting

### Requirement: iPhone portrait layout
The app SHALL be laid out for iPhone screens in portrait orientation and respect safe areas.

#### Scenario: Device with a notch or Dynamic Island
- **WHEN** the app runs on a device with a display cut-out
- **THEN** no interactive element is obscured by the cut-out or the home indicator
