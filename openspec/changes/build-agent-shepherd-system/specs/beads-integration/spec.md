## ADDED Requirements
### Requirement: Beads Executes Commands
The Beads Integration SHALL shell out to `bd` commands for issue operations.

#### Scenario: Command execution
- **WHEN** worker needs issue list
- **THEN** runs `bd ready --json` and parses output

### Requirement: Beads Parses Issue JSON
The Beads Integration SHALL parse Beads JSON output into typed structures.

#### Scenario: JSON parsing
- **WHEN** bd command returns JSON
- **THEN** validates and converts to Issue objects

### Requirement: Beads Updates Status
The Beads Integration SHALL change issue status via `bd update`.

#### Scenario: Status update
- **WHEN** run transitions
- **THEN** sets appropriate status (in_progress, blocked, closed)

### Requirement: Beads Manages Labels
The Beads Integration SHALL add/remove phase and control labels.

#### Scenario: Label management
- **WHEN** phase advances
- **THEN** updates phase: labels and adds ashep:excluded if needed

### Requirement: Beads Handles Comments
The Beads Integration SHALL post run summaries and instructions as comments.

#### Scenario: Comment posting
- **WHEN** HITL triggered
- **THEN** adds comment with human approval instructions

### Requirement: Beads Respects Dependencies
The Beads Integration SHALL check blockers before processing issues.

#### Scenario: Dependency check
- **WHEN** querying ready issues
- **THEN** only returns issues without blocking dependencies