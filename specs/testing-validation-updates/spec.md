# Spec: Testing & Validation Updates


### Requirement: Test File Updates
All test files SHALL be updated for new import paths

#### Scenario: Test Execution
- **WHEN** test files are in .agent-shepherd/tests/
- **AND** tests are run
- **THEN** all imports SHALL resolve correctly

### Requirement: CLI Discovery Tests
New tests SHALL validate CLI discovery functionality

#### Scenario: Discovery Testing
- **WHEN** findAgentShepherdDir is tested with different directory structures
- **THEN** it SHALL correctly find or fail to find .agent-shepherd/

### Requirement: Validation Tests
Build, installation, and end-to-end tests SHALL be updated

#### Scenario: Full Validation
- **WHEN** complete refactoring is applied
- **AND** all tests pass
- **THEN** structure is validated as working