## Purpose

Defines planning outfits on days, logging what was actually worn, the month view of that history, the streak and the optional daily reminder.

## ADDED Requirements

### Requirement: Month view
The Calendar section SHALL show a month grid with the outfit planned or worn on each day and allow moving between months.

#### Scenario: Viewing a month
- **WHEN** the user opens the Calendar section
- **THEN** the current month is shown with today marked and an outfit image on each day that has one

#### Scenario: Previous month
- **WHEN** the user moves to the previous month
- **THEN** that month's days and outfits are shown

### Requirement: Planning an outfit
The user SHALL be able to plan a saved outfit for today or a future day, from the calendar and from the outfit detail.

#### Scenario: Planning from the calendar
- **WHEN** the user taps a future day and chooses an outfit
- **THEN** the outfit is shown on that day as planned

#### Scenario: Planning from an outfit
- **WHEN** the user chooses "plan" on an outfit and picks a date
- **THEN** the outfit is shown on that date as planned

### Requirement: Changing a plan
The user SHALL be able to replace, move or clear a planned outfit.

#### Scenario: Moving a plan
- **WHEN** the user moves a planned outfit to another day
- **THEN** it leaves the original day and appears on the new one

### Requirement: Logging what was worn
The user SHALL be able to mark an outfit as worn on today or any past day, and doing so SHALL record a wear for each item in the outfit.

#### Scenario: Confirming a planned outfit
- **WHEN** the user marks today's planned outfit as worn
- **THEN** the day shows the outfit as worn and each of its items has one more wear

#### Scenario: Logging a past day
- **WHEN** the user selects a past day without an entry and chooses an outfit
- **THEN** the outfit is recorded as worn on that day

#### Scenario: Removing a log entry
- **WHEN** the user removes a worn entry
- **THEN** the day becomes empty and the wears recorded for its items are removed

#### Scenario: Future day
- **WHEN** the user selects a future day
- **THEN** an outfit can be planned but not marked as worn

### Requirement: More than one outfit per day
The user SHALL be able to add a second outfit to a day, and the first SHALL be the one shown in the month grid and week strip.

#### Scenario: Two outfits in one day
- **WHEN** the user logs a second outfit on a day
- **THEN** the day detail shows both and the grid shows the first with an indication of more

### Requirement: Unconfirmed plans
A planned outfit on a day that has passed SHALL be shown as not confirmed, with an action to confirm it as worn or clear it.

#### Scenario: Yesterday's plan
- **WHEN** yesterday had a planned outfit that was never marked as worn
- **THEN** it is shown as not confirmed and can be confirmed with one tap

### Requirement: Streak
The app SHALL show the number of consecutive days, ending today or yesterday, on which an outfit was logged as worn.

#### Scenario: Continuing a streak
- **WHEN** outfits were logged on each of the last four days and the user logs today
- **THEN** the streak shows five

#### Scenario: Broken streak
- **WHEN** neither today nor yesterday has a logged outfit
- **THEN** the streak shows zero

### Requirement: Wear history on outfits and items
Outfit and item details SHALL show how many times and when they were last worn.

#### Scenario: Item wear count
- **WHEN** an item was part of outfits logged on three days
- **THEN** its detail shows three wears and the most recent date

### Requirement: Daily reminder
The user SHALL be able to turn on a daily reminder at a time they choose, delivered as a notification that opens the Home screen.

#### Scenario: Reminder delivered
- **WHEN** the reminder is on and the chosen time arrives
- **THEN** a notification is shown, and tapping it opens Home

#### Scenario: Notifications not allowed
- **WHEN** the user turns the reminder on while notifications are not allowed
- **THEN** an explanation is shown with a shortcut to the system settings and the reminder stays off

#### Scenario: Turning the reminder off
- **WHEN** the user turns the reminder off
- **THEN** no further reminders are delivered
