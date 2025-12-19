## ADDED Requirements
### Requirement: CLI Worker Command
The system SHALL provide `ashep worker` command that starts the autonomous worker loop to process Beads issues.

#### Scenario: Worker starts successfully
- **WHEN** user runs `ashep worker`
- **THEN** worker pulls ready issues from Beads and processes them autonomously

### Requirement: CLI Monitor Command
The system SHALL provide `ashep monitor` command that starts the supervision loop to monitor running runs.

#### Scenario: Monitor detects stalls
- **WHEN** monitor detects stalled runs
- **THEN** applies timeout policies and handles appropriately

### Requirement: CLI Work Command
The system SHALL provide `ashep work <issue>` command that manually processes a specific issue.

#### Scenario: Manual work execution
- **WHEN** user runs `ashep work ISSUE-123`
- **THEN** processes the specific issue through the workflow

### Requirement: CLI Init Command
The system SHALL provide `ashep init` command that creates default configuration in .agent-shepherd.

#### Scenario: Init creates configs
- **WHEN** user runs `ashep init`
- **THEN** generates default policies.yaml, agents.yaml, config.yaml

### Requirement: CLI Install Command
The system SHALL provide `ashep install` command that checks and installs dependencies.

#### Scenario: Install checks Beads
- **WHEN** user runs `ashep install`
- **THEN** verifies Beads installation and suggests fixes

### Requirement: CLI Sync-Agents Command
The system SHALL provide `ashep sync-agents` command that updates agent registry from OpenCode.

#### Scenario: Sync updates registry
- **WHEN** user runs `ashep sync-agents`
- **THEN** adds available OpenCode agents to agents.yaml

### Requirement: CLI UI Command
The system SHALL provide `ashep ui` command that starts the flow visualization server.

#### Scenario: UI server starts
- **WHEN** user runs `ashep ui`
- **THEN** launches HTTP server with ReactFlow UI on configured port