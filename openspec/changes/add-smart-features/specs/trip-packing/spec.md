## Purpose

Defines trips: for a destination and dates, the app proposes an outfit for each day from the expected weather and turns those outfits into a checklist of items to pack.

## ADDED Requirements

### Requirement: Creating a trip
The user SHALL be able to create a trip with a name, a destination chosen by place search, and start and end dates.

#### Scenario: New trip
- **WHEN** the user enters a destination and dates and saves
- **THEN** the trip is listed with its destination and dates and one entry per day

#### Scenario: End before start
- **WHEN** the end date is earlier than the start date
- **THEN** the trip is not saved and the dates are marked as invalid

### Requirement: Expected weather per day
Each day of a trip SHALL show the expected weather at the destination: the forecast when available, otherwise typical conditions for that place and time of year, marked as typical.

#### Scenario: Trip within forecast range
- **WHEN** the trip starts in three days
- **THEN** each day shows the forecast for the destination

#### Scenario: Trip beyond forecast range
- **WHEN** the trip starts in two months
- **THEN** each day shows typical conditions marked as typical, and the user can refresh closer to departure

### Requirement: Day activities
The user SHALL be able to tag each day with activities such as city, beach, hiking, formal or travel day, and the proposed outfit SHALL take the tag into account.

#### Scenario: Formal day
- **WHEN** a day is tagged formal
- **THEN** the proposed outfit for that day uses pieces tagged for formal occasions where the closet has them

### Requirement: Outfit per day
The app SHALL propose an outfit for each day of the trip that suits the expected weather, and the user SHALL be able to replace any day's outfit with another saved outfit, another proposal or a new outfit.

#### Scenario: Replacing a day's outfit
- **WHEN** the user swaps the outfit for one day
- **THEN** that day shows the new outfit and the packing list updates

### Requirement: Reuse across days
Proposals SHALL favour reusing items across the days of the trip, within limits the user can adjust, including a maximum number of pairs of shoes.

#### Scenario: Shoe limit
- **WHEN** the shoe limit is two pairs
- **THEN** the proposed outfits for the whole trip use at most two different pairs of shoes

### Requirement: Packing list
The app SHALL produce a packing list containing each item used by the trip's outfits exactly once, grouped by category.

#### Scenario: Item worn on two days
- **WHEN** the same item is part of the outfits for two days
- **THEN** it appears once in the packing list, with the days it is worn on

### Requirement: Extra entries
The user SHALL be able to add other closet items and free-text entries to the packing list.

#### Scenario: Adding a free-text entry
- **WHEN** the user adds "phone charger" to the list
- **THEN** it appears in the list under other

### Requirement: Checking off
The user SHALL be able to mark packing list entries as packed, and progress SHALL be shown.

#### Scenario: Packing progress
- **WHEN** the user checks off 6 of 12 entries
- **THEN** progress shows 6 of 12 packed and the state is kept across restarts

### Requirement: Trip outfits in the calendar
The user SHALL be able to add a trip's outfits to the calendar as planned outfits on their days.

#### Scenario: Adding to the calendar
- **WHEN** the user adds the trip to the calendar
- **THEN** each trip day shows its outfit as planned in the calendar

### Requirement: Removing a trip
The user SHALL be able to delete a trip, which SHALL NOT delete outfits or items.

#### Scenario: Deleting a trip
- **WHEN** the user deletes a trip and confirms
- **THEN** the trip and its packing list are removed and its outfits remain in the Outfits section
