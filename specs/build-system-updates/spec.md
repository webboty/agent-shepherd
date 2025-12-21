# Spec: Build System Updates

## MODIFIED Requirements

### Requirement: Build Output Location
The build system SHALL output the CLI binary to .agent-shepherd/bin/ashep

#### Scenario: Build Process
- **WHEN** bun build command is executed
- **THEN** output SHALL be created at .agent-shepherd/bin/ashep

### Requirement: Package.json Bin Field
The package.json bin field SHALL point to the new binary location

#### Scenario: NPM Installation
- **WHEN** package.json bin field is set
- **THEN** "ashep": "./.agent-shepherd/bin/ashep"

### Requirement: Package.json Bin Field Change
The package.json bin field SHALL be updated from the current dist/cli/index.js path to the new .agent-shepherd/bin/ashep path

#### Scenario: Bin Field Migration
- **WHEN** package.json is updated for the new structure
- **THEN** the bin field SHALL change from:
  ```json
  "bin": { "ashep": "./dist/cli/index.js" }
  ```
  to:
  ```json
  "bin": { "ashep": "./.agent-shepherd/bin/ashep" }
  ```

### Requirement: Build Scripts Update
Build scripts SHALL be updated to work with new structure

#### Scenario: Script Execution
- **WHEN** build scripts are run
- **THEN** all paths reference new locations