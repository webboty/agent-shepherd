# Tasks: Refactor Directory Structure

1. Create .agent-shepherd/ directory structure with subdirectories (config/, bin/, src/, schemas/, tests/, docs/)
2. Move source files from src/ to .agent-shepherd/src/
3. Move schema files from schemas/ to .agent-shepherd/schemas/
4. Move test files from tests/ to .agent-shepherd/tests/
5. Move docs from docs/ to .agent-shepherd/docs/
6. Move README.md and package.json to .agent-shepherd/
7. Update all import paths in source files to work from new locations
8. Create path resolution utilities for dynamic path handling
9. Update build system to output to .agent-shepherd/bin/ashep
10. Modify package.json bin field to point to new location
11. Implement CLI discovery logic (findAgentShepherdDir function)
12. Update CLI entry point to use discovered paths
13. Modify ashep init command to create .agent-shepherd/ structure
14. Update default file locations in config and core modules
15. Add migration logic for existing installations
16. Update all test files to work with new import paths
17. Create tests for CLI discovery functionality
18. Update build scripts and validate build process
19. Test installation process creates correct structure
20. Run full test suite and fix any failures
21. Update documentation to reference new file locations
22. Validate end-to-end workflow in new structure
23. Test backward compatibility and migration
24. Update any hardcoded paths in docs or code