## Purpose

Defines how an outfit is rendered on the user's avatar by an AI image provider: when renders happen, what the user sees while waiting and on failure, and how usage is made visible.

## ADDED Requirements

### Requirement: Render on save
Saving a new or changed outfit SHALL request a render of the avatar wearing the outfit, when an avatar photo and an image provider key are available.

#### Scenario: Render after saving
- **WHEN** the user saves an outfit with an avatar and a key present
- **THEN** the outfit is saved immediately, a render is shown as in progress, and the render replaces the flat preview when ready

#### Scenario: Unchanged pieces
- **WHEN** the user saves an outfit whose pieces match an existing render
- **THEN** the existing render is used and no new render is requested

#### Scenario: No avatar photo
- **WHEN** the user saves an outfit without an avatar photo set
- **THEN** the outfit is saved with its flat preview and a prompt offers to add an avatar photo

### Requirement: Non-blocking rendering
The user SHALL be able to continue using the app while a render is in progress.

#### Scenario: Leaving during a render
- **WHEN** the user leaves the outfit while its render is in progress
- **THEN** the render completes and is shown the next time the outfit is displayed

### Requirement: Regenerate
The user SHALL be able to request a new render of an outfit, and the previous render SHALL be kept until the new one succeeds.

#### Scenario: Regenerating
- **WHEN** the user taps Regenerate on an outfit
- **THEN** a new render is produced and shown, and the user can return to the previous one

#### Scenario: Regenerate fails
- **WHEN** a regenerate request fails
- **THEN** the previous render remains shown

### Requirement: Render failure handling
When a render fails, the app SHALL keep the flat preview, explain the cause in plain language and offer a retry. The app SHALL NOT retry automatically.

#### Scenario: Provider declines the request
- **WHEN** the provider refuses to produce the image
- **THEN** a message says the provider declined this outfit and the flat preview stays in place

#### Scenario: No network
- **WHEN** a render is requested without a network connection
- **THEN** the render is marked as failed with a retry option and no request is charged

### Requirement: Studio avatar
The user SHALL be able to create a studio version of their avatar photo on a plain background and choose whether renders use it or the original photo.

#### Scenario: Accepting the studio avatar
- **WHEN** the user creates a studio avatar and accepts the result
- **THEN** later renders use it as the base

#### Scenario: Rejecting the studio avatar
- **WHEN** the user rejects the result
- **THEN** the original photo remains the base and the rejected image is discarded

### Requirement: Outdated renders
A render SHALL be marked as outdated when the avatar base changes or an item in the outfit is removed, and the user SHALL be able to refresh it.

#### Scenario: Avatar replaced
- **WHEN** the user replaces their avatar photo
- **THEN** existing renders are kept, marked as outdated, and each can be regenerated

### Requirement: Disclosure before first render
Before the first render, the app SHALL tell the user that their photo and item images are sent to the image provider and ask for confirmation.

#### Scenario: First render
- **WHEN** the user triggers a render for the first time
- **THEN** a one-time notice explains what is sent and the render starts only after the user confirms

### Requirement: Usage visibility
The app SHALL show how many render requests have been made in the current month and in total.

#### Scenario: Viewing usage
- **WHEN** the user opens the AI section of Settings
- **THEN** the number of renders this month and overall is shown

### Requirement: Render toggle
The user SHALL be able to turn automatic rendering on save off, leaving renders to be requested manually.

#### Scenario: Automatic rendering off
- **WHEN** automatic rendering is off and the user saves an outfit
- **THEN** no render is requested and the outfit detail offers a button to render it
