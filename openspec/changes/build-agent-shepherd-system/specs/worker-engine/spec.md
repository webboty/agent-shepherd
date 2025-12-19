## ADDED Requirements
### Requirement: Worker Pulls Ready Issues
The Worker Engine SHALL query `bd ready --json` and filter issues that are open and not ashep:excluded.

#### Scenario: Ready issues filtered
- **WHEN** worker queries Beads
- **THEN** only processes eligible issues

### Requirement: Worker Resolves Policy and Phase
The Worker Engine SHALL determine the active policy and current phase for each issue.

#### Scenario: Policy resolution
- **WHEN** issue has phase:implement label
- **THEN** applies implement phase requirements

### Requirement: Worker Selects Agent
The Worker Engine SHALL select appropriate agent based on capabilities, constraints, and priority.

#### Scenario: Agent selection
- **WHEN** phase requires 'implement' capability
- **THEN** chooses highest priority agent with that capability

### Requirement: Worker Creates RunRecord
The Worker Engine SHALL create structured RunRecord with issue, agent, phase, and timestamps.

#### Scenario: Run creation
- **WHEN** agent selected
- **THEN** generates unique run ID and logs to JSONL/SQLite

### Requirement: Worker Launches Agent in OpenCode
The Worker Engine SHALL create OpenCode session and instruct agent to execute.

#### Scenario: Session launch
- **WHEN** run starts
- **THEN** sends initial message with context and instructions

### Requirement: Worker Handles RunOutcome
The Worker Engine SHALL wait for structured JSON RunOutcome from agent and process it.

#### Scenario: Outcome processing
- **WHEN** agent produces valid outcome
- **THEN** transitions issue based on result (advance/repeat/block)

### Requirement: Worker Updates Beads State
The Worker Engine SHALL update issue status, labels, and comments in Beads.

#### Scenario: State transition
- **WHEN** run completes
- **THEN** sets appropriate status (open/blocked/closed) and phase labels