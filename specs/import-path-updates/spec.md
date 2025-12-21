# Spec: Import Path Updates

## MODIFIED Requirements

### Requirement: Import Path Resolution
The system SHALL update all relative imports to work from the new directory structure

#### Scenario: Source File Imports
- **WHEN** source files are in .agent-shepherd/src/
- **AND** importing from core modules
- **THEN** import paths SHALL be updated to reflect new locations

#### Scenario: Schema Imports
- **WHEN** config-validator imports schemas
- **AND** loading schema files
- **THEN** paths SHALL be updated to .agent-shepherd/schemas/

### Requirement: Dynamic Path Resolution
The system SHALL implement utilities for dynamic path resolution

#### Scenario: Runtime Path Discovery
- **WHEN** CLI is running from any directory
- **AND** needing to access config files
- **THEN** paths are resolved relative to .agent-shepherd/ location