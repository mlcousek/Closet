## Purpose

Defines display mode: a full-screen idle view for a phone left on a stand, showing the time, a welcome line and today's outfit, like the wall-mounted closet screen that inspired the app.

## ADDED Requirements

### Requirement: Idle display
Display mode SHALL show the current time and date, a welcome line with the user's name, the weather summary and today's outfit, full screen without navigation controls.

#### Scenario: Entering display mode
- **WHEN** the user starts display mode from the Profile section
- **THEN** the idle display fills the screen and the tab bar is hidden

#### Scenario: Today's outfit changes
- **WHEN** today's outfit is planned or changed while display mode is active
- **THEN** the display shows the new outfit without being restarted

### Requirement: Screen stays on
While display mode is visible, the device SHALL NOT lock or turn the screen off automatically.

#### Scenario: Left idle
- **WHEN** display mode is left untouched for longer than the device's auto-lock time
- **THEN** the screen remains on

#### Scenario: Leaving display mode
- **WHEN** the user leaves display mode
- **THEN** the device's normal auto-lock behaviour applies again

### Requirement: Both orientations
Display mode SHALL adapt its layout to portrait and landscape orientation.

#### Scenario: Rotating the phone
- **WHEN** the phone is rotated to landscape in display mode
- **THEN** the layout rearranges to fit and nothing is cut off

### Requirement: Dimming and screen protection
Display mode SHALL dim after a period without touch and SHALL shift its content slightly over time to protect the screen.

#### Scenario: Dimming
- **WHEN** display mode is untouched for the dimming period
- **THEN** the display dims, and a touch restores full brightness

### Requirement: Exit
The user SHALL be able to leave display mode with a tap followed by a visible exit control.

#### Scenario: Exiting
- **WHEN** the user taps the screen and then the exit control
- **THEN** the app returns to the screen it was on before display mode

### Requirement: Start while charging
The user SHALL be able to choose that display mode starts automatically when the app is opened while the phone is charging.

#### Scenario: Opened while charging
- **WHEN** the option is on and the app is opened while charging
- **THEN** display mode starts

#### Scenario: Opened on battery
- **WHEN** the option is on and the app is opened on battery
- **THEN** the app opens normally

### Requirement: Display theme
The user SHALL be able to choose the background style of display mode from a small set of themes.

#### Scenario: Choosing a theme
- **WHEN** the user selects a different theme
- **THEN** display mode uses that theme from then on
