## Purpose

Defines the Home screen, which answers "what do I wear today" by bringing together the greeting, the weather, the current week and today's outfit.

## ADDED Requirements

### Requirement: Today at a glance
The Home screen SHALL show a greeting, today's weather summary, a strip of the current week and today's outfit.

#### Scenario: Opening Home
- **WHEN** the user opens the app after onboarding
- **THEN** Home shows the greeting, the weather chip, the week strip with today marked, and an outfit for today

### Requirement: Today's outfit
Today's outfit SHALL be the outfit logged as worn today if there is one, otherwise the outfit planned for today, otherwise the best suggestion for today.

#### Scenario: Planned outfit exists
- **WHEN** an outfit is planned for today and none is logged as worn
- **THEN** the planned outfit is shown with an action to mark it as worn

#### Scenario: Nothing planned
- **WHEN** no outfit is planned or worn today
- **THEN** a suggested outfit is shown with actions to wear it or see another suggestion

#### Scenario: Seeing another suggestion
- **WHEN** the user asks for another suggestion
- **THEN** a different suitable outfit is shown

### Requirement: Week strip
The week strip SHALL show the seven days of the current week with the outfit planned or worn on each, and tapping a day SHALL show that day's outfit and weather.

#### Scenario: Tapping a future day
- **WHEN** the user taps a day later this week
- **THEN** that day's forecast and its planned outfit or a suggestion are shown

#### Scenario: Day without an outfit
- **WHEN** a past day has no logged outfit
- **THEN** the day is shown empty with an action to log what was worn

### Requirement: Shortcuts
Home SHALL offer shortcuts to the calendar and to creating an outfit.

#### Scenario: Opening the calendar
- **WHEN** the user taps the calendar shortcut
- **THEN** the month calendar opens on the current month

### Requirement: Usable with an empty closet
When the closet has too few items to form an outfit, Home SHALL explain what is missing and offer to add items.

#### Scenario: No items yet
- **WHEN** the closet is empty
- **THEN** Home shows the greeting and weather and a prompt to add the first items
