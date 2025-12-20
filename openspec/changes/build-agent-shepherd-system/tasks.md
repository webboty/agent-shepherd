## 1. Project Setup
- [ ] 1.1 Create package.json with Bun, TypeScript, dependencies (@opencode-ai/sdk, react, reactflow, etc.)
- [ ] 1.2 Create tsconfig.json and bunfig.toml
- [ ] 1.3 Set up directory structure (src/cli, src/core, src/utils, .agent-shepherd, docs, schemas, ui)
- [ ] 1.4 Initialize git repo if not present

## 2. Core Modules
- [ ] 2.1 Implement Beads integration (shell commands, issue parsing)
- [ ] 2.2 Implement OpenCode integration (@opencode-ai/sdk, sessions, messages)
- [ ] 2.3 Implement Policy Engine (YAML parsing, phase transitions)
- [ ] 2.4 Implement Agent Registry (YAML loading, capability matching)
- [ ] 2.5 Implement Logging (JSONL + SQLite dual storage)

## 3. Engines
- [ ] 3.1 Implement Worker Engine (ready issues, agent selection, run creation)
- [ ] 3.2 Implement Monitor Engine (stall detection, HITL handling, timeouts)
- [ ] 3.3 Implement CLI commands (worker, monitor, work, init, install, sync-agents, ui)

## 4. UI and Installer
- [ ] 4.1 Create placeholder ReactFlow UI with basic flow visualization
- [ ] 4.2 Implement UI server with configurable port
- [ ] 4.3 Implement installer (check dependencies, suggest installs)
- [ ] 4.4 Implement init (create .agent-shepherd with defaults)

## 5. Configuration and Schemas
- [ ] 5.1 Create JSON schemas for config, policies, agents, run outcomes
- [ ] 5.2 Create default config.yaml, policies.yaml, agents.yaml
- [ ] 5.3 Validate configurations at startup

## 6. Testing and Validation
- [ ] 6.1 Add unit tests for core modules
- [ ] 6.2 Add integration tests for CLI commands
- [ ] 6.3 Validate with linting and type checking
- [ ] 6.4 Test end-to-end workflow (mock Beads/OpenCode)

## 7. Documentation
- [ ] 7.1 Create README.md with setup and usage
- [ ] 7.2 Expand docs/architecture.md
- [ ] 7.3 Document CLI commands and configs