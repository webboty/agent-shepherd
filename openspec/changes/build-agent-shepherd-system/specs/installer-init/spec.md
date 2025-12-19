## ADDED Requirements
### Requirement: Installer Checks Dependencies
The Installer SHALL verify presence of Beads, OpenCode, and other requirements.

#### Scenario: Dependency check
- **WHEN** ashep install runs
- **THEN** reports missing dependencies and suggests installation

### Requirement: Installer Suggests Fixes
The Installer SHALL provide commands or links to install missing tools.

#### Scenario: Installation suggestions
- **WHEN** Beads missing
- **THEN** outputs installation instructions

### Requirement: Init Creates Config Directory
The Init command SHALL create .agent-shepherd directory with default configs.

#### Scenario: Directory creation
- **WHEN** ashep init runs
- **THEN** creates .agent-shepherd/ with policies.yaml, agents.yaml, config.yaml

### Requirement: Init Generates Defaults
The Init command SHALL write default policy, agent, and config files.

#### Scenario: Default generation
- **WHEN** init completes
- **THEN** provides working starter configuration

### Requirement: Init Validates Environment
The Init command SHALL check write permissions and basic setup.

#### Scenario: Environment validation
- **WHEN** init runs
- **THEN** ensures .agent-shepherd is writable and git repo detected

### Requirement: Sync-Agents Updates Registry
The Sync-Agents command SHALL query OpenCode for available agents and update agents.yaml.

#### Scenario: Registry sync
- **WHEN** sync-agents runs
- **THEN** adds new agents with detected capabilities