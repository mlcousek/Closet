## Purpose

Defines how the app obtains the weather for the user's location and uses it, together with the season and recent wear, to suggest suitable outfits for a day.

## ADDED Requirements

### Requirement: Weather for the user's location
The app SHALL show current conditions and a forecast for the coming days for the device location, when the user allows location access.

#### Scenario: Location allowed
- **WHEN** the user allows location access
- **THEN** the weather for their area is shown with temperature and conditions

#### Scenario: Location denied
- **WHEN** the user denies location access
- **THEN** the app asks them to pick a city and uses that city for the weather

### Requirement: Chosen city
The user SHALL be able to choose a city to use instead of the device location and to switch back.

#### Scenario: Choosing a city
- **WHEN** the user searches for and selects a city in Settings
- **THEN** the weather and suggestions use that city

### Requirement: Units
Temperature SHALL be shown in Celsius or Fahrenheit according to the device region, with an override in Settings.

#### Scenario: Override
- **WHEN** the user selects Fahrenheit in Settings
- **THEN** all temperatures are shown in Fahrenheit

### Requirement: Weather when offline
When the weather cannot be fetched, the app SHALL show the most recent weather it has with its age, and SHALL fall back to the season when it has none.

#### Scenario: Offline with earlier data
- **WHEN** the network is unavailable and weather was fetched earlier today
- **THEN** the earlier weather is shown with an indication of when it was updated

#### Scenario: No weather at all
- **WHEN** no weather has ever been fetched and the network is unavailable
- **THEN** suggestions are based on the current season and a notice says the weather is unavailable

### Requirement: Weather-appropriate suggestions
The app SHALL suggest outfits for a given day that suit that day's temperature, rain and wind and the current season.

#### Scenario: Cold and wet day
- **WHEN** the forecast for the day is cold with rain
- **THEN** every suggested outfit includes an outer layer and no suggested outfit consists only of pieces tagged as light

#### Scenario: Hot day
- **WHEN** the forecast for the day is hot and dry
- **THEN** no suggested outfit includes pieces tagged as warm

### Requirement: Variety
Suggestions SHALL avoid outfits worn in the last seven days when other suitable outfits exist.

#### Scenario: Recently worn outfit
- **WHEN** an otherwise suitable outfit was worn two days ago and other suitable outfits exist
- **THEN** it is not the first suggestion

### Requirement: Suggestions from saved outfits and from items
Suggestions SHALL come from the user's saved outfits when enough are suitable, and otherwise SHALL include new combinations assembled from closet items.

#### Scenario: Few saved outfits
- **WHEN** fewer than three saved outfits suit the day
- **THEN** new combinations of closet items are offered, marked as new

#### Scenario: Accepting a new combination
- **WHEN** the user chooses to wear a new combination
- **THEN** it is saved as an outfit and planned for that day

### Requirement: Reason for a suggestion
Each suggestion SHALL state briefly why it suits the day.

#### Scenario: Reason shown
- **WHEN** a suggestion is shown for a 24 degree sunny day
- **THEN** a short line explains the match, such as light layers for warm weather

### Requirement: Only wearable outfits
Suggestions SHALL NOT include outfits containing wishlist or archived items.

#### Scenario: Outfit with a wishlist item
- **WHEN** a saved outfit contains a wishlist item
- **THEN** it is never suggested
