## Purpose

Defines the figures and charts that show the user what they own, what they actually wear and what their clothes cost per wear.

## ADDED Requirements

### Requirement: Wardrobe overview
The statistics screen SHALL show the number of owned items, the number of outfits, and the total value of items that have a price.

#### Scenario: Value with missing prices
- **WHEN** some items have no price
- **THEN** the total value covers the priced items and states how many items have no price

### Requirement: Breakdown by category and colour
The statistics screen SHALL show how owned items are distributed across categories and across colours.

#### Scenario: Opening a segment
- **WHEN** the user taps a category in the breakdown
- **THEN** the closet opens filtered to that category

### Requirement: Most and least worn
The statistics screen SHALL list the most worn and the least worn items and outfits for a selectable period.

#### Scenario: Changing the period
- **WHEN** the user switches the period from all time to the last 30 days
- **THEN** the lists reflect only wears within the last 30 days

### Requirement: Unworn items
The statistics screen SHALL list owned items that have never been worn and items not worn for a long time.

#### Scenario: Never worn
- **WHEN** an owned item has no recorded wear
- **THEN** it appears in the never-worn list

#### Scenario: Acting on an unworn item
- **WHEN** the user opens an item from the list
- **THEN** actions are offered to build an outfit with it or archive it

### Requirement: Cost per wear
For each item with a price and at least one wear, the app SHALL show its cost per wear, and the statistics screen SHALL list the best and worst value items.

#### Scenario: Cost per wear on an item
- **WHEN** an item cost 600 and has been worn 12 times
- **THEN** its cost per wear is shown as 50 in the item's currency

#### Scenario: Priced item never worn
- **WHEN** an item has a price and no wears
- **THEN** no cost per wear is shown and the item is listed as not worn yet

### Requirement: Closet usage
The statistics screen SHALL show the share of owned items worn at least once in the selected period.

#### Scenario: Usage share
- **WHEN** 30 of 120 owned items were worn in the selected period
- **THEN** the usage is shown as 25 percent

### Requirement: Wear trend
The statistics screen SHALL show the number of days with a logged outfit over time.

#### Scenario: Monthly trend
- **WHEN** the period is this year
- **THEN** a chart shows logged days per month

### Requirement: Statistics with little data
When there is not enough data for a figure, the app SHALL say what is missing instead of showing an empty or misleading chart.

#### Scenario: No wear history
- **WHEN** no outfit has been logged as worn
- **THEN** the wear-based sections explain that logging outfits in the calendar will fill them
