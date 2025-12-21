# Change Proposal: Refactor Directory Structure to .agent-shepherd/

## Overview
This change proposal addresses the problem of scattered tool files in the project root by refactoring Agent Shepherd to use a clean `.agent-shepherd/` directory structure, following developer tool conventions like Git (.git/), VSCode (.vscode/), etc.

## Why
The current implementation clutters the project root with tool files, violating conventions and creating a poor developer experience. Other tools maintain clean separation using hidden directories.

## What Changes
Refactor the file structure to consolidate all Agent Shepherd files under `.agent-shepherd/`, with subdirectories for config, bin, src, schemas, tests, docs.

## Impact
- Clean project root
- Professional developer experience
- Maintains all existing functionality
- Requires updates to imports, build system, CLI discovery, and installation

## Related Specs
- Modifies beads-integration (if applicable)
- No new specs created, updates existing structure

## Dependencies
- build-agent-shepherd-system (for build changes)
- test-beads (for testing updates)

## Risks
- Import path breakage
- CLI discovery failures
- Build process issues
- Migration challenges

## Success Criteria
1. No Agent Shepherd files in project root
2. CLI discovery works from any subdirectory
3. All imports work in new structure
4. Build creates correct output
5. Installation creates proper structure
6. All tests pass
7. Documentation updated