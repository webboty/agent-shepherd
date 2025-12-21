## 1. Directory Structure Creation
- [x] 1.1 Create .agent-shepherd/ directory structure with subdirectories (config/, bin/, src/, schemas/, tests/, docs/)

## 2. File Movement
- [x] 2.1 Move source files from src/ to .agent-shepherd/src/
- [x] 2.2 Move schema files from schemas/ to .agent-shepherd/schemas/
- [x] 2.3 Move test files from tests/ to .agent-shepherd/tests/
- [x] 2.4 Move docs from docs/ to .agent-shepherd/docs/
- [x] 2.5 Move README.md and package.json to .agent-shepherd/

## 3. Import and Path Updates
- [x] 3.1 Update all import paths in source files to work from new locations
- [x] 3.2 Create path resolution utilities for dynamic path handling

## 4. Build System Updates
- [x] 4.1 Update build system to output to .agent-shepherd/bin/ashep
- [x] 4.2 Modify package.json bin field to point to new location
- [x] 4.3 Update build scripts and validate build process

## 5. CLI and Discovery Implementation
- [x] 5.1 Implement CLI discovery logic (findAgentShepherdDir function)
- [x] 5.2 Update CLI entry point to use discovered paths

## 6. Installation and Migration
- [x] 6.1 Modify ashep init command to create .agent-shepherd/ structure
- [x] 6.2 Update default file locations in config and core modules
- [x] 6.3 Add migration logic for existing installations
- [x] 6.4 Handle backward compatibility for existing installations
- [x] 6.5 Implement error handling for conflicting file locations

## 7. Testing and Validation
- [x] 7.1 Update all test files to work with new import paths
- [x] 7.2 Create tests for CLI discovery functionality
- [x] 7.3 Test installation process creates correct structure
- [x] 7.4 Run full test suite and fix any failures
- [x] 7.5 Validate end-to-end workflow in new structure
- [x] 7.6 Test backward compatibility and migration

## 8. Documentation Updates
- [x] 8.1 Update documentation to reference new file locations
- [x] 8.2 Update any hardcoded paths in docs or code