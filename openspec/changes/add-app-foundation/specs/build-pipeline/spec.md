## Purpose

Defines how installable iPhone builds are produced automatically, without a Mac, in a form that AltStore can sideload.

## ADDED Requirements

### Requirement: Checks on every push
Every push and pull request SHALL run lint, type-check and unit tests, and report failure if any of them fail.

#### Scenario: Failing test
- **WHEN** a commit with a failing unit test is pushed
- **THEN** the pipeline run is marked as failed

### Requirement: Sideloadable release build
The pipeline SHALL produce an unsigned iPhone application package that AltStore can install, on demand and for every version tag.

#### Scenario: Tagged release
- **WHEN** a version tag is pushed
- **THEN** an installable application package is attached to a release for that tag

#### Scenario: Manual build
- **WHEN** the build is started manually for a branch
- **THEN** an installable application package is available for download from that run

### Requirement: Development build
The pipeline SHALL produce a development build that loads application code from a development server on the local network and can be installed alongside the release build.

#### Scenario: Both builds installed
- **WHEN** the development build and the release build are both installed on one phone
- **THEN** they appear as separate apps with distinguishable names and do not share data

### Requirement: Version visibility
Each build SHALL display its version and build number in Settings.

#### Scenario: Checking the installed version
- **WHEN** the user opens Settings
- **THEN** the version and build number of the installed build are shown

### Requirement: In-AltStore updates
Releases SHALL be published in a form that lets AltStore on the phone discover and install a newer version.

#### Scenario: New release available
- **WHEN** a new release is published and the user refreshes the app's source in AltStore
- **THEN** AltStore offers the new version for installation
