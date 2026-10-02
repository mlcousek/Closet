## Purpose

Defines the AI stylist, which proposes outfits from the user's own closet for an occasion, mood or chosen item that the user describes in their own words.

## ADDED Requirements

### Requirement: Styling request
The user SHALL be able to describe an occasion or mood in free text, optionally with a date, and receive several outfit proposals made only of items from their closet.

#### Scenario: Request for an occasion
- **WHEN** the user asks for an outfit for a described occasion
- **THEN** at least one proposal is shown, each as a flat preview with a short explanation

#### Scenario: Request with a date
- **WHEN** the user includes a date for which a forecast is available
- **THEN** the proposals take that day's weather into account and the explanation mentions it

#### Scenario: Suggested prompts
- **WHEN** the user opens the stylist
- **THEN** example requests are offered that can be used with one tap

### Requirement: Proposals are wearable
Every proposal SHALL consist only of items the user owns and SHALL form a valid outfit.

#### Scenario: Invalid proposal from the provider
- **WHEN** the provider returns an outfit containing an item that does not exist in the closet
- **THEN** that outfit is not shown

#### Scenario: No valid proposals
- **WHEN** none of the returned outfits is valid
- **THEN** a message says no outfit could be put together and offers to try again

### Requirement: Style a chosen item
The user SHALL be able to ask for outfits built around one chosen item, including a wishlist item.

#### Scenario: Styling a closet item
- **WHEN** the user chooses "style this" on an item
- **THEN** every proposal includes that item

#### Scenario: Styling a wishlist item
- **WHEN** the user chooses "style this" on a wishlist item
- **THEN** every proposal includes that item, marked as wishlist, with all other pieces owned

### Requirement: Refinement
The user SHALL be able to refine the proposals with a follow-up instruction within the same request.

#### Scenario: Asking for a change
- **WHEN** the user replies that the outfit should be warmer
- **THEN** new proposals are shown that take both the original request and the refinement into account

### Requirement: Acting on a proposal
The user SHALL be able to save a proposal as an outfit, open it in the outfit editor, or plan it for a day.

#### Scenario: Saving a proposal
- **WHEN** the user saves a proposal
- **THEN** it appears in the Outfits section like any other outfit

### Requirement: Past requests
The user SHALL be able to reopen earlier styling requests with their proposals, and delete them.

#### Scenario: Reopening a request
- **WHEN** the user opens an earlier request
- **THEN** its proposals are shown without a new provider request

### Requirement: Availability and disclosure
The stylist SHALL require a text provider key and a network connection, and before the first request SHALL tell the user that descriptions of their items are sent to the provider.

#### Scenario: No key
- **WHEN** the user opens the stylist without a text provider key
- **THEN** a message explains that a key is needed, with a shortcut to the key settings

#### Scenario: First request
- **WHEN** the user sends the first styling request
- **THEN** a one-time notice explains what is sent and the request proceeds only after confirmation

#### Scenario: Provider error
- **WHEN** the provider request fails
- **THEN** a message explains the failure and the request can be sent again
