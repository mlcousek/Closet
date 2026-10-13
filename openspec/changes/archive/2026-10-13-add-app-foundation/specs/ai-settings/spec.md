## Purpose

Defines how the user supplies, checks and removes the AI provider keys that power tagging, try-on rendering and styling features.

## ADDED Requirements

### Requirement: Key entry and secure storage
The user SHALL be able to enter a key for each AI provider the app uses, and keys SHALL be stored only in the device's secure storage.

#### Scenario: Saving a key
- **WHEN** the user enters a key and saves it
- **THEN** the key is stored securely and shown masked from then on

#### Scenario: Keys excluded from backups
- **WHEN** the user exports a backup
- **THEN** the backup file contains no provider keys

### Requirement: Key validation
The user SHALL be able to test a stored key and see whether the provider accepted it.

#### Scenario: Valid key
- **WHEN** the user tests a key the provider accepts
- **THEN** the provider is shown as connected

#### Scenario: Rejected key
- **WHEN** the user tests a key the provider rejects
- **THEN** an error explains that the key was rejected and the provider is shown as not connected

### Requirement: Key removal
The user SHALL be able to remove a stored key.

#### Scenario: Removing a key
- **WHEN** the user removes a key and confirms
- **THEN** the key is deleted and features depending on that provider become unavailable

### Requirement: Graceful behaviour without keys
Features that need an AI provider SHALL remain visible when the key is missing and SHALL direct the user to Settings instead of failing.

#### Scenario: AI feature without a key
- **WHEN** the user triggers an AI feature whose provider has no key
- **THEN** a message explains that a key is needed and offers a shortcut to the key settings
