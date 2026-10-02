## Purpose

Defines what the app knows about its user (name, gender, body type, sizes and avatar photo), how that is collected on first run and how it is changed later.

## ADDED Requirements

### Requirement: First-run onboarding
The app SHALL guide a new user through onboarding that collects name, gender, body type and a full-body photo before showing the main sections.

#### Scenario: First launch
- **WHEN** the app is opened with no profile stored
- **THEN** the onboarding flow is shown instead of the main sections

#### Scenario: Completing onboarding
- **WHEN** the user finishes the last onboarding step
- **THEN** the profile is saved and the Home section is shown

#### Scenario: Skipping optional steps
- **WHEN** the user skips gender, body type or photo
- **THEN** onboarding continues and the skipped value is left unset

### Requirement: Gender selection
The user SHALL be able to choose woman, man or prefer not to say.

#### Scenario: Choosing a gender
- **WHEN** the user selects one of the options
- **THEN** the choice is stored and the body type step shows silhouettes matching it

### Requirement: Body type selection
The user SHALL be able to choose one body type from an illustrated set.

#### Scenario: Choosing a body type
- **WHEN** the user selects a silhouette
- **THEN** it is marked as selected and stored with the profile

### Requirement: Avatar photo
The user SHALL be able to provide a full-body photo of themselves by taking one or picking one from the photo library, and this photo SHALL be used as their avatar.

#### Scenario: Taking a photo
- **WHEN** the user takes a photo in the avatar step and confirms it
- **THEN** the photo is stored as the avatar and shown in the profile

#### Scenario: Photo guidance
- **WHEN** the user reaches the avatar step
- **THEN** guidance explains how to take a suitable photo, with an example

#### Scenario: Unsuitable photo
- **WHEN** the chosen photo does not show exactly one person in full
- **THEN** a warning explains the problem and offers to retake or keep the photo

#### Scenario: Permission denied
- **WHEN** the user has denied camera or photo library access
- **THEN** an explanation is shown with a shortcut to the system settings

### Requirement: Profile editing
The user SHALL be able to change every profile value, including replacing or removing the avatar photo, from the Profile section.

#### Scenario: Replacing the avatar
- **WHEN** the user replaces the avatar photo
- **THEN** the new photo is used for all later renders and existing renders are kept

#### Scenario: Removing the avatar
- **WHEN** the user removes the avatar photo and confirms
- **THEN** the photo is deleted from the device and features needing it ask for a new one

### Requirement: Optional sizing details
The user SHALL be able to record height and usual sizes for tops, bottoms and shoes.

#### Scenario: Saving sizes
- **WHEN** the user enters sizing details and saves
- **THEN** the values are shown in the profile and persist across restarts

### Requirement: Personal greeting
The app SHALL greet the user by name with a greeting that matches the time of day.

#### Scenario: Evening greeting
- **WHEN** the user opens Home in the evening
- **THEN** an evening greeting with their name is shown
