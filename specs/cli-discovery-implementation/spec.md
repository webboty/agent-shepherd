# Spec: CLI Discovery Implementation


### Requirement: Directory Walking Logic
The system SHALL implement directory walking to find .agent-shepherd/ from any subdirectory

#### Scenario: CLI Execution
- **WHEN** user runs ashep from project subdirectory
- **AND** CLI starts
- **THEN** it SHALL find the nearest .agent-shepherd/ directory by walking up

### Requirement: findAgentShepherdDir Function
The system SHALL provide a findAgentShepherdDir utility function

#### Scenario: Path Resolution
- **WHEN** findAgentShepherdDir is called with a starting path
- **THEN** it SHALL return the path to .agent-shepherd/ or null if not found

### Requirement: Fallback Behavior
The system SHALL provide fallback when no local installation is found

#### Scenario: Global Fallback
- **WHEN** no .agent-shepherd/ is found
- **AND** CLI is executed
- **THEN** it falls back to global installation or shows appropriate error