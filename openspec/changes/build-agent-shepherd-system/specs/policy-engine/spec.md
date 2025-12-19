## ADDED Requirements
### Requirement: Policy Engine Parses YAML
The Policy Engine SHALL load and parse policies.yaml configuration.

#### Scenario: Policy loading
- **WHEN** Shepherd starts
- **THEN** validates and loads policy definitions

### Requirement: Policy Engine Determines Phases
The Policy Engine SHALL provide phase sequence and capabilities for each policy.

#### Scenario: Phase sequence
- **WHEN** issue uses 'default' policy
- **THEN** defines plan→implement→test→review phases

### Requirement: Policy Engine Handles Transitions
The Policy Engine SHALL manage phase advancement, retries, and HITL logic.

#### Scenario: Phase transition
- **WHEN** run completes with success
- **THEN** advances to next phase or closes issue

### Requirement: Policy Engine Manages Retries
The Policy Engine SHALL configure retry limits and backoff strategies.

#### Scenario: Retry logic
- **WHEN** run fails
- **THEN** retries up to configured limit with exponential backoff

### Requirement: Policy Engine Defines Timeouts
The Policy Engine SHALL specify timeout durations and stall thresholds.

#### Scenario: Timeout configuration
- **WHEN** agent is slow model
- **THEN** applies higher timeout multiplier

### Requirement: Policy Engine Supports HITL
The Policy Engine SHALL define when and how human intervention is required.

#### Scenario: HITL trigger
- **WHEN** run needs approval
- **THEN** sets human_review phase and blocked status