## Purpose

Defines the languages the interface is available in and how the active language is chosen.

## ADDED Requirements

### Requirement: English and Czech interface
All interface text SHALL be available in English and Czech.

#### Scenario: Czech device
- **WHEN** the device language is Czech and no override is set
- **THEN** the interface is shown in Czech

#### Scenario: Unsupported device language
- **WHEN** the device language is neither English nor Czech and no override is set
- **THEN** the interface is shown in English

### Requirement: Language override
The user SHALL be able to choose the interface language in Settings, independent of the device language.

#### Scenario: Switching language in Settings
- **WHEN** the user selects a different language in Settings
- **THEN** the interface switches immediately and the choice persists across restarts

### Requirement: Localised formats
Dates, numbers, temperatures and currency amounts SHALL be formatted according to the active language and the device region.

#### Scenario: Date in Czech
- **WHEN** the active language is Czech
- **THEN** dates are shown in Czech format with Czech month and weekday names
