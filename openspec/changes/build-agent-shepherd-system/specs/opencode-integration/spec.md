## ADDED Requirements
### Requirement: OpenCode Creates Sessions
The OpenCode Integration SHALL create new sessions for agent runs using @opencode-ai/sdk.

#### Scenario: Session creation
- **WHEN** worker launches agent
- **THEN** creates session with selected provider/model

### Requirement: OpenCode Sends Messages
The OpenCode Integration SHALL send initial instructions and context to agents.

#### Scenario: Message sending
- **WHEN** run starts
- **THEN** provides issue details, phase requirements, and outcome format

### Requirement: OpenCode Retrieves Messages
The OpenCode Integration SHALL poll for latest messages and detect completion.

#### Scenario: Message polling
- **WHEN** monitoring run
- **THEN** fetches new messages since last check

### Requirement: OpenCode Detects Human Messages
The OpenCode Integration SHALL identify human vs agent message origins.

#### Scenario: Human detection
- **WHEN** session has human message
- **THEN** flags for takeover handling

### Requirement: OpenCode Handles Timeouts
The OpenCode Integration SHALL manage session lifecycle and cleanup.

#### Scenario: Session cleanup
- **WHEN** run completes
- **THEN** optionally closes session based on policy

### Requirement: OpenCode Supports Re-use
The OpenCode Integration SHALL allow session persistence across phases/runs.

#### Scenario: Session persistence
- **WHEN** policy allows
- **THEN** re-uses existing session for follow-up runs