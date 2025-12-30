# Agent Shepherd - AI Agent Instructions

This file contains essential information for AI coding agents working on the Agent Shepherd project.

## Project Overview

Agent Shepherd is an orchestration system for AI coding agents that coordinates between:
- **Beads** (issue tracking system)
- **OpenCode** (AI agent execution platform)
- **Human developers**

The system manages autonomous issue processing, workflow orchestration, agent selection, and execution monitoring.

## Design Philosophy

### File Layout and Symlinks

The repository contains symlinks at the root level for convenience:

- `README.md` → `.agent-shepherd/README.md`
- `AGENTS.md` → `.agent-shepherd/AGENTS.md`

**Purpose:**
- GitHub README detection (expects README.md in repository root)
- Easier agentic processing (files readily accessible)
- Convenience for users and tools

**Important:** During installation, anything above `../.agent-shepherd/` is ignored. The installer only copies the `.agent-shepherd/` directory, so these symlinks and root-level files are not installed into user projects.

### Self-Contained Dotfolder

Agent Shepherd lives in `.agent-shepherd/` by design. When installed in user projects, it should be a clean, self-contained dotfolder that doesn't pollute the user's repository.

**Principles:**
- All Agent Shepherd code, config, and runtime files are isolated in `.agent-shepherd/`
- User projects remain clean and uncluttered
- Easy to uninstall (remove the `.agent-shepherd/` directory)
- No hidden configuration in system directories (unless using hybrid mode)
- Supports both local (per-project) and hybrid (shared global binary) installations

### Cross-Platform Compatibility

Agent Shepherd is designed to work on **macOS, Linux, and Windows**. All code and scripts must be compatible with these three operating systems.

**Why Two Installers:**
- `install.sh` - Shell script for Unix-like systems (macOS and Linux)
- `install.ps1` - PowerShell script for Windows
- Both scripts accomplish the same installation steps using their respective platform-native approaches

**Cross-Platform Considerations:**
- Use forward slashes (`/`) for paths in TypeScript/JavaScript (Node.js handles this)
- When spawning shell commands, detect OS and use appropriate syntax
- File system operations should use `path` module for cross-platform path handling
- Avoid OS-specific APIs when cross-platform alternatives exist
- Test on all three platforms when making OS-related changes

## Architecture

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Beads Issues  │    │ Agent Registry  │    │ OpenCode Agents │
│   (Issue Pool)  │    │ (Capability DB) │    │   (Execution)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
           │                       │                       │
           └───────────────────────┼───────────────────────┘
                                   │
                      ┌─────────────────────┐
                      │  Policy Engine      │
                      │ (Workflow Rules)    │
                      └─────────────────────┘
                                   │
                      ┌─────────────────────┐
                      │  Worker Engine      │
                      │ (Issue Processing)  │
                      └─────────────────────┘
                                   │
                      ┌─────────────────────┐
                      │  Monitor Engine     │
                      │ (Supervision)       │
                      └─────────────────────┘
```

### Key Modules

- **Worker Engine** (`src/core/worker-engine.ts`) - Processes issues from Beads through workflow phases
- **Monitor Engine** (`src/core/monitor-engine.ts`) - Supervises agent execution and detects stalls
- **Agent Registry** (`src/core/agent-registry.ts`) - Manages agent capabilities and selection
- **Policy Engine** (`src/core/policy.ts`) - Defines and executes workflow policies
- **Policy Capability Validator** (`src/core/policy-capability-validator.ts`) - Validates policy→capability→agent chains
- **Policy Tree Visualizer** (`src/core/policy-tree-visualizer.ts`) - Visualizes relationship trees
- **Beads Integration** (`src/core/beads.ts`) - Interface to Beads issue tracking
- **OpenCode Integration** (`src/core/opencode.ts`) - Interface to OpenCode agent sessions
- **Config Validator** (`src/core/config-validator.ts`) - Validates configuration files
- **CLI** (`src/cli/index.ts`) - Command-line interface
- **UI Server** (`src/ui/ui-server.ts`) - ReactFlow visualization server

## Tech Stack

### Runtime & Build
- **Bun** >= 1.0.0 - JavaScript runtime and package manager
- **TypeScript** 5.7.2 - Type-safe development

### Core Dependencies
- **@opencode-ai/sdk** (^1.0.171) - OpenCode integration
- **express** (^5.2.1) - UI web server
- **react** (^18.3.1) + **react-dom** (^18.3.1) - UI framework
- **reactflow** (^11.11.4) - Workflow visualization
- **yaml** (^2.5.1) - YAML configuration parsing
- **ajv** (^8.17.1) - JSON schema validation
- **ajv-formats** (^3.0.1) - Additional AJV validators

### Dev Tools
- **eslint** (^9.16.0) - Linting
- **typescript** (^5.7.2) - Type checking

## Project Structure

```
.agent-shepherd/
├── bin/
│   └── ashep                    # Compiled CLI binary
├── src/
│   ├── cli/
│   │   └── index.ts             # CLI entry point
│   ├── core/
│   │   ├── agent-registry.ts     # Agent management
│   │   ├── beads.ts             # Beads integration
│   │   ├── config-validator.ts   # Config validation
│   │   ├── config.ts            # Config loading
│   │   ├── logging.ts          # Logging system
│   │   ├── monitor-engine.ts    # Process supervision
│   │   ├── opencode.ts         # OpenCode client
│   │   ├── path-utils.ts       # Path utilities
│   │   ├── policy.ts           # Policy engine
│   │   ├── policy-capability-validator.ts  # Chain validation
│   │   ├── policy-tree-visualizer.ts     # Tree visualization
│   │   └── worker-engine.ts    # Issue processing
│   └── ui/
│       ├── ui-server.ts         # Express server
│       ├── AgentShepherdFlow.tsx # ReactFlow component
│       └── index.html          # UI page
├── config/
│   ├── config.yaml            # Main config
│   ├── policies.yaml          # Workflow policies
│   └── agents.yaml           # Agent registry
├── plugins/
│   ├── hello-world/          # Example plugin
│   └── openspec/            # OpenSpec integration
├── schemas/
│   ├── config.schema.json
│   ├── policies.schema.json
│   ├── agents.schema.json
│   ├── plugin.schema.json
│   └── run-outcome.schema.json
├── tests/
│   ├── agent-registry.test.ts
│   ├── basic.test.ts
│   ├── cli-integration.test.ts
│   ├── config-validator.test.ts
│   ├── policy-capability-validator.test.ts
│   └── policy-engine.test.ts
├── docs/
│   ├── architecture.md
│   ├── cli-reference.md
│   ├── config-config.md
│   ├── policies-config.md
│   ├── agents-config.md
│   └── plugin-system.md
├── package.json
├── tsconfig.json
├── eslint.config.js
└── install.sh / install.ps1
```

## Coding Standards

### TypeScript Configuration
- **Target**: ES2022
- **Module**: ESNext
- **Strict mode**: Enabled
- **Path aliases**: `@/*` → `src/*`
- **JSX**: React (react-jsx)
- **Imports**: Use ES modules

### Code Style

1. **Type Safety**: Always use TypeScript with explicit types
2. **Error Handling**: Use try-catch with proper error messages
3. **Async/Await**: Prefer async/await over promises
4. **Naming**:
   - Files: kebab-case (`worker-engine.ts`)
   - Classes: PascalCase (`AgentRegistry`)
   - Functions/Variables: camelCase (`selectAgent`)
   - Constants: UPPER_SNAKE_CASE (`MAX_RETRIES`)
5. **Comments**: Code should be well-commented (planned refactor). Add comments to explain:
   - Complex algorithms or logic
   - Non-obvious decisions or trade-offs
   - External dependencies and their purposes
   - Public API documentation
6. **File Organization**: One major class/module per file
7. **Imports**: Group by type (external, internal, relative)

### Linting Rules
Run `bun run lint` to check code quality. Use the existing ESLint configuration.

## Common Commands

### Development
```bash
# Run CLI in development
bun run dev

# Build the CLI binary
bun run build

# Run tests
bun test

# Lint code
bun run lint

# Type check
bun run type-check
```

### CLI Commands (after build)
```bash
ashep init              # Initialize configuration
ashep quickstart        # One-command onboarding
ashep worker            # Start autonomous worker
ashep monitor           # Start monitoring engine
ashep work <issue-id>   # Process specific issue
ashep ui                # Start UI server
ashep sync-agents       # Sync agents from OpenCode
ashep validate-policy-chain    # Validate relationships
ashep show-policy-tree        # Visualize tree
```

## Key Concepts

### Policies
Workflow definitions with sequential phases that define:
- **Phases**: Steps (plan → implement → test → review)
- **Capabilities**: Required skills for each phase
- **Timeouts**: Time limits for phases
- **Retries**: Failure handling
- **Model Overrides**: Optional per-phase model selection

### Agents
AI coding assistants defined by:
- **Capabilities**: What they can do (coding, planning, etc.)
- **Priority**: Selection preference (1-20)
- **Provider**: AI service (Anthropic, OpenAI, etc.)
- **Model**: Specific model to use
- **Constraints**: Performance tier, read-only, etc.
- **Active/Inactive**: Whether available for automation

### Chain Validation
Critical validation ensuring:
- All policy phases reference valid capabilities
- Every capability has active agents
- No dead ends (capabilities without agents)
- No single points of failure (warns if only one agent per capability)

## Configuration Files

### config/config.yaml
Main system settings:
- Worker polling interval and concurrency
- Monitor polling and stall thresholds
- UI server port and host

### config/policies.yaml
Workflow definitions:
- Policy triggers (issue labels)
- Phase sequences with capabilities
- Retry strategies
- Timeout settings
- Model overrides (optional)

### config/agents.yaml
Agent registry (auto-synced from OpenCode):
- Agent capabilities and priorities
- Provider/model information
- Constraints and metadata

## Plugin System

Plugins extend Agent Shepherd functionality:

### Structure
```
my-plugin/
├── manifest.json     # Plugin metadata
├── index.js         # Command implementations
└── README.md        # Documentation
```

### Development
- Commands export as async functions
- Use CommonJS (module.exports)
- Minimal boilerplate

## Testing

- **Framework**: Bun's built-in test runner
- **Location**: `tests/` directory
- **Naming**: `<module>.test.ts`
- **Run**: `bun test` or `bun test tests/<specific-test>`

## Architecture Patterns

### Dual Storage
- **JSONL**: Append-only source of truth (audit trail)
- **SQLite**: Indexed cache (fast queries)

### Agent Selection
1. Filter by active status
2. Filter by required capabilities
3. Sort by priority (highest first)
4. Apply constraints
5. Select best match

### Model Resolution Hierarchy
1. Phase-level override (highest)
2. Agent-level configuration
3. OpenCode agent default (fallback)

## Beads Integration

This project uses **bd** (beads) for issue tracking:

```bash
bd ready              # Find available work
bd show <id>         # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Documentation

When working on specific features, open the relevant documentation for detailed information:

### Core Documentation

| Document | When to Open | Description |
|----------|--------------|-------------|
| `docs/architecture.md` | Understanding system design, data flow, component interactions | Detailed architecture, design decisions, component relationships |
| `docs/cli-reference.md` | Working on CLI commands, adding new commands, understanding CLI behavior | Complete CLI command reference with examples, options, and troubleshooting |
| `docs/config-config.md` | Modifying main system settings, worker/monitor/UI configuration | Main config file reference with field descriptions and tuning guides |
| `docs/policies-config.md` | Creating workflows, defining phases, agent selection rules | Policy system reference with examples, validation, and best practices |
| `docs/agents-config.md` | Syncing agents, understanding agent capabilities, agent selection | Agent registry reference with capability mapping and selection logic |
| `docs/plugin-system.md` | Developing plugins, understanding plugin architecture, installing plugins | Plugin development guide with examples and best practices |

### Configuration Files

| File | When to Open | Description |
|------|--------------|-------------|
| `config/config.yaml` | Adjusting polling intervals, concurrency, UI server settings | Main system configuration for worker, monitor, and UI |
| `config/policies.yaml` | Creating new workflows, modifying phase sequences | Workflow definitions with triggers, phases, capabilities |
| `config/agents.yaml` | Reviewing available agents, manually adjusting agent settings | Agent registry (usually auto-synced from OpenCode) |

### Other Documentation

| Document | When to Open | Description |
|----------|--------------|-------------|
| `README.md` | First-time setup, quick start, overview of the project | Getting started guide with installation and basic usage |
| `AGENTS.md` (this file) | Understanding project structure, coding standards, architecture | AI agent instructions and development guide |
| `openspec/AGENTS.md` | Working on proposals, specs, planning changes | OpenSpec change proposal system and workflow |

**Note**: Open the specific documentation when you need detailed information about that particular area. This file provides a high-level overview and quick reference.

## Installation

Agent Shepherd provides two installer scripts for cross-platform support:

### macOS and Linux

```bash
# Download and run installer
curl -fsSL https://raw.githubusercontent.com/USER/agent-shepherd/main/.agent-shepherd/install.sh | bash

# Or install specific version
curl -fsSL https://raw.githubusercontent.com/USER/agent-shepherd/main/.agent-shepherd/install.sh | bash -s v1.0.0
```

### Windows (PowerShell)

```powershell
# Download and run installer
irm https://raw.githubusercontent.com/USER/agent-shepherd/main/.agent-shepherd/install.ps1 | iex

# Or install specific version
irm https://raw.githubusercontent.com/USER/agent-shepherd/main/.agent-shepherd/install.ps1 | iex; Install-AgentShepherd v1.0.0
```

### Installation Modes

The installer prompts for:

1. **Hybrid Mode** (Recommended)
   - Binary: Shared in `~/.agent-shepherd/` (saves disk space)
   - Config: Per-project in `./.agent-shepherd/config/`
   - Best for: Multiple projects, easy updates

2. **Local Mode**
   - Everything: Self-contained in `./.agent-shepherd/`
   - Best for: Isolated projects, air-gapped environments

### Manual Installation

See `README.md` for manual installation steps including:
- Prerequisites (Bun, Beads, OpenCode)
- Development setup
- Building from source

## Important Notes

1. **Well-Commented Code**: Code should be well-commented (planned for future refactor). Currently minimal comments exist, but aim to add clear documentation for complex logic, decisions, and APIs
2. **Type Safety**: Always use TypeScript types, avoid `any`
3. **Error Messages**: Be specific and actionable
4. **Logging**: Use the logging system from `src/core/logging.ts`
5. **Configuration**: Always validate configs before using
6. **Testing**: Write tests for new functionality
7. **Documentation**: Update relevant docs when changing features
8. **Cross-Platform**: Ensure code works on macOS, Linux, and Windows
9. **Dotfolder Isolation**: Keep everything in `.agent-shepherd/` to avoid polluting user projects

## External References

- **Beads**: https://github.com/steveyegge/beads
- **OpenCode**: AI agent execution platform
- **OpenSpec**: Change proposal system (see `openspec/AGENTS.md`)

## Session Completion

When ending a work session:
1. Run `bun run lint` and `bun run type-check`
2. Ensure all tests pass
3. Commit changes with descriptive messages
4. Push to remote repository
5. Update issue status in Beads if applicable
