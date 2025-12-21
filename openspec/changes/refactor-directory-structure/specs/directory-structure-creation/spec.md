# Spec: Directory Structure Creation

## ADDED Requirements

### Requirement: Directory Structure Creation
The system SHALL create a `.agent-shepherd/` directory with the following subdirectories: config/, bin/, src/, schemas/, tests/, docs/

#### Scenario: Initial Setup
- **WHEN** ashep init is run in a clean project directory
- **THEN** .agent-shepherd/ directory is created with all required subdirectories

#### Scenario: File Organization
- **WHEN** files are moved to new structure in development repository
- **THEN** all source files are under src/, schemas under schemas/, etc.

### Requirement: File Movement Mapping
The system SHALL move files according to the specified inventory

#### Scenario: Source Files Movement
- **WHEN** refactoring is applied
- **THEN** all files from src/ SHALL be moved to .agent-shepherd/src/

#### Scenario: Schema Files Movement
- **WHEN** refactoring is applied
- **THEN** all files from schemas/ SHALL be moved to .agent-shepherd/schemas/

#### Scenario: Test Files Movement
- **WHEN** refactoring is applied
- **THEN** all files from tests/ SHALL be moved to .agent-shepherd/tests/

#### Scenario: Documentation Files Movement
- **WHEN** refactoring is applied
- **THEN** all files from docs/ SHALL be moved to .agent-shepherd/docs/

#### Scenario: Package Files Movement
- **WHEN** refactoring is applied
- **THEN** README.md and package.json SHALL be moved to .agent-shepherd/