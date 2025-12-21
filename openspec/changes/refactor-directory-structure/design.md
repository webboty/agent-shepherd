# Design Document: Directory Structure Refactoring

## Architectural Reasoning

### Current State
Agent Shepherd currently scatters files across the project root and src/, with built CLI in dist/cli/index.js and configs in .agent-shepherd/. This violates tool conventions and clutters user projects.

### Proposed Architecture
Move all tool files into `.agent-shepherd/` directory with substructure:
- config/ for user configs
- bin/ for CLI binary
- src/ for source code
- schemas/ for validation
- tests/ for tests
- docs/ for docs

Development repo becomes the canonical structure, installation copies it.

### Benefits of config/ Subdirectory Approach
Using a dedicated `config/` subdirectory within `.agent-shepherd/` provides several advantages compared to placing configuration files directly in the root:

- **Better Organization**: Separates configuration files from other tool components (binaries, source code, schemas), making the directory structure more intuitive and easier to navigate. Users can quickly identify and modify configuration without sifting through unrelated files.

- **Improved User Experience**: A clear config/ location reduces confusion about where to place or find settings. This follows common patterns in developer tools, creating a familiar experience that lowers the learning curve for new users.

- **Enhanced Scalability**: As Agent Shepherd evolves, additional configuration types (e.g., environment-specific configs, user profiles, or integration settings) can be added to config/ without cluttering the root directory. This supports future growth while maintaining clean separation.

### Trade-offs
1. **Import Path Complexity**: Dynamic path resolution needed vs. simple relative imports
   - Decision: Implement path resolution utilities to maintain clean imports

2. **CLI Discovery**: Directory walking logic vs. hardcoded paths
   - Decision: Implement findAgentShepherdDir function for flexible discovery

3. **Build Process**: Change output location vs. keep current
   - Decision: Update build to output to .agent-shepherd/bin/ashep for consistency

4. **Development vs Production**: Same structure vs. separate
   - Decision: Use same structure, installation copies development repo

### Key Design Decisions
- Follow Git/VSCode pattern of hidden directories
- Keep development repo as source of truth
- Use dynamic path resolution for runtime flexibility
- Maintain backward compatibility where possible

### System Interactions
- Beads integration: Update path references
- OpenCode integration: Update CLI paths
- Build system: Modify output and scripts
- Installation: Change init process

### Validation Strategy
- Unit tests for path resolution
- Integration tests for CLI discovery
- E2E tests for full workflow
- Migration tests for existing installations