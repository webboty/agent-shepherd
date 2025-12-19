## ADDED Requirements
### Requirement: Logging Stores RunRecords
The Logging system SHALL append RunRecords to JSONL file as source of truth.

#### Scenario: JSONL append
- **WHEN** run created or updated
- **THEN** writes complete record to .agent-shepherd/runs.jsonl

### Requirement: Logging Uses SQLite Cache
The Logging system SHALL maintain SQLite database for fast queries and indexing.

#### Scenario: SQLite sync
- **WHEN** JSONL updated
- **THEN** syncs changes to SQLite for performance

### Requirement: Logging Records Decisions
The Logging system SHALL log policy decisions, agent selections, and transitions.

#### Scenario: Decision logging
- **WHEN** agent selected
- **THEN** records selection criteria and reasoning

### Requirement: Logging Tracks Outcomes
The Logging system SHALL store structured RunOutcome JSON from agents.

#### Scenario: Outcome storage
- **WHEN** agent produces outcome
- **THEN** validates and stores JSON with result metadata

### Requirement: Logging Supports Queries
The Logging system SHALL provide query interface for runs by issue, agent, status.

#### Scenario: Query support
- **WHEN** UI requests timeline
- **THEN** returns filtered run history from SQLite

### Requirement: Logging Maintains Audit Trail
The Logging system SHALL ensure JSONL is git-trackable and human-editable.

#### Scenario: Audit trail
- **WHEN** runs.jsonl committed
- **THEN** provides complete history of orchestration decisions