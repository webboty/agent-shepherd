## ADDED Requirements
### Requirement: Agent Registry Loads YAML
The Agent Registry SHALL load and validate agents.yaml configuration.

#### Scenario: Registry loading
- **WHEN** Shepherd initializes
- **THEN** parses agent definitions with capabilities and constraints

### Requirement: Agent Registry Matches Capabilities
The Agent Registry SHALL find agents that match required capabilities.

#### Scenario: Capability matching
- **WHEN** phase needs 'test' capability
- **THEN** returns agents with test capability

### Requirement: Agent Registry Applies Constraints
The Agent Registry SHALL filter agents by read/write permissions, tags, and performance.

#### Scenario: Constraint filtering
- **WHEN** issue has 'laravel' tag
- **THEN** prefers agents tagged for laravel

### Requirement: Agent Registry Selects by Priority
The Agent Registry SHALL choose highest priority agent when multiple match.

#### Scenario: Priority selection
- **WHEN** multiple agents available
- **THEN** selects highest priority matching agent

### Requirement: Agent Registry Provides Model Info
The Agent Registry SHALL supply provider, model, and performance hints.

#### Scenario: Model configuration
- **WHEN** agent selected
- **THEN** provides OpenCode session parameters

### Requirement: Agent Registry Syncs with OpenCode
The Agent Registry SHALL update registry from installed OpenCode agents.

#### Scenario: Sync operation
- **WHEN** sync-agents runs
- **THEN** adds new agents and marks obsolete ones