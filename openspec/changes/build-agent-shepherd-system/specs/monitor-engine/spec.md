## ADDED Requirements
### Requirement: Monitor Tracks Running Runs
The Monitor Engine SHALL periodically check all runs in 'running' status.

#### Scenario: Run tracking
- **WHEN** monitor loop executes
- **THEN** inspects active runs from storage

### Requirement: Monitor Detects Stalls
The Monitor Engine SHALL detect when last message time exceeds stall threshold.

#### Scenario: Stall detection
- **WHEN** last_message_time > threshold
- **THEN** marks run as failed or retries based on policy

### Requirement: Monitor Detects Human Takeover
The Monitor Engine SHALL identify human-origin messages in OpenCode sessions.

#### Scenario: Human detection
- **WHEN** human sends message
- **THEN** applies takeover policy (pause/resume/idle cooldown)

### Requirement: Monitor Applies Timeout Rules
The Monitor Engine SHALL enforce policy-defined timeouts adjusted by agent performance.

#### Scenario: Timeout enforcement
- **WHEN** run exceeds adjusted timeout
- **THEN** applies configured action (retry/diagnostic/fail)

### Requirement: Monitor Handles HITL States
The Monitor Engine SHALL detect and manage human-in-the-loop waiting states.

#### Scenario: HITL handling
- **WHEN** run requires human approval
- **THEN** sets blocked status and waits for human labels

### Requirement: Monitor Resumes Interrupted Runs
The Monitor Engine SHALL recover crashed runs safely on restart.

#### Scenario: Crash recovery
- **WHEN** Shepherd restarts
- **THEN** resumes or restarts interrupted runs appropriately