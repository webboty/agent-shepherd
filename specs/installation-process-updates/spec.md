# Spec: Installation Process Updates


### Requirement: ashep init Command
The ashep init command SHALL create the new .agent-shepherd/ structure

#### Scenario: Initialization
- **WHEN** ashep init is run
- **AND** creating project structure
- **THEN** .agent-shepherd/ with subdirectories SHALL be created

### Requirement: Default File Locations
Core modules SHALL use updated default file locations

#### Scenario: Config Loading
- **WHEN** config.ts is loading default files
- **THEN** paths SHALL point to .agent-shepherd/config/

### Requirement: Migration Logic
The system SHALL handle migration from old structure

#### Scenario: Existing Installations
- **WHEN** old .agent-shepherd/ structure exists
- **AND** init is run
- **THEN** migration is performed or warning is shown

### Requirement: Existing Config Detection
The system SHALL detect existing configuration files in the current .agent-shepherd/ directory structure

#### Scenario: Config File Detection
- **WHEN** ashep init is run
- **AND** .agent-shepherd/ already exists with config files directly in root
- **THEN** the system SHALL identify config.yaml, policies.yaml, and agents.yaml in .agent-shepherd/

### Requirement: Migration Path to config/ Structure
The system SHALL provide a migration path to move existing config files to the new .agent-shepherd/config/ structure

#### Scenario: Config Migration
- **WHEN** existing config files are detected in .agent-shepherd/ root
- **THEN** the system SHALL move them to .agent-shepherd/config/
- **AND** update any internal references to the new locations

### Requirement: Backward Compatibility
The system SHALL maintain backward compatibility for users with existing .agent-shepherd/ installations

#### Scenario: Backward Compatible Loading
- **WHEN** loading config files
- **THEN** the system SHALL first check .agent-shepherd/config/
- **AND** fall back to .agent-shepherd/ root if config/ is empty
- **AND** log deprecation warnings for root-level config files

### Requirement: Error Handling for Conflicting Locations
The system SHALL handle errors when config files exist in both old and new locations

#### Scenario: Conflicting Config Files
- **WHEN** config files exist in both .agent-shepherd/ root and .agent-shepherd/config/
- **THEN** the system SHALL prioritize .agent-shepherd/config/ files
- **AND** show a warning about the conflict
- **AND** suggest manual resolution or automatic backup of old files