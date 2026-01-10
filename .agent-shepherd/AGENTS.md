# Agent Shepherd - AI Agent Instructions

This file contains essential information for AI coding agents working on the Agent Shepherd project.

## Project Overview

Agent Shepherd is an orchestration system for AI coding agents that coordinates between:
- **Beads** (issue tracking system)
- **OpenCode** (AI agent execution platform)
- **Human developers**

The system manages autonomous issue processing, workflow orchestration, agent selection, execution monitoring, and enhanced features including AI-driven transitions, loop prevention, decision agents, garbage collection, and inter-phase messaging.

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

#### External Systems

**Beads** is a required issue tracking system for Agent Shepherd. All workflows depend on it.

**Note**: For comprehensive Beads integration and landing plane workflow, see `.agent-shepherd/AGENTS_BEADS.md`.

**OpenSpec** is a change proposal system (via `plugins/openspec/`) used for planning and approving significant changes to this project. When working on:
- New features or breaking changes
- Architecture shifts or major refactors
- Performance or security improvements
- Anything requiring specs or proposals

```
**Note**: For detailed OpenSpec instructions, see `.agent-shepherd/AGENTS_OpenSpec.md`.
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
- **Policy Engine** (`src/core/policy.ts`) - Defines and executes workflow policies with enhanced transitions
- **Decision Builder** (`src/core/decision-builder.ts`) - Builds prompts and parses AI decision responses
- **Policy Capability Validator** (`src/core/policy-capability-validator.ts`) - Validates policy→capability→agent chains
- **Policy Tree Visualizer** (`src/core/policy-tree-visualizer.ts`) - Visualizes relationship trees
- **Phase Messenger** (`src/core/phase-messenger.ts`) - Inter-phase communication system
- **Garbage Collector** (`src/core/garbage-collector.ts`) - Data archival and cleanup system
- **Retention Policy Manager** (`src/core/retention-policy.ts`) - Manages data retention rules
- **Beads Integration** (`src/core/beads.ts`) - Interface to Beads issue tracking
- **OpenCode Integration** (`src/core/opencode.ts`) - Interface to OpenCode agent sessions
- **Config Validator** (`src/core/config-validator.ts`) - Validates configuration files
- **CLI** (`src/cli/index.ts`) - Command-line interface
- **UI Server** (`src/ui/ui-server.ts`) - ReactFlow visualization server

## Worker Assistant

The worker assistant provides AI-powered interpretation of complex agent outcomes when the worker engine's deterministic logic cannot determine clear advance/retry/block actions.

### How It Works

When an agent completes execution, the worker engine analyzes the outcome:

1. **Deterministic processing**: Standard if-else logic handles clear cases (success → advance, failure → retry/block)
2. **Trigger detection**: Ambiguous outcomes trigger the worker assistant:
   - Successful outcome with warnings
   - Successful outcome with many artifacts (>5)
   - Message contains keywords: "unclear", "partial", "ambiguous", "review"
   - Failed outcome with structured error details
   - Failed outcome with timeout/incomplete keywords

3. **Assistant execution**: Worker assistant analyzes context and returns directive:
   - **ADVANCE**: Move to next phase (acceptable, minor issues)
   - **RETRY**: Retry current phase (fixable issues)
   - **BLOCK**: Block for human review (unclear, complex problems)

4. **Transition conversion**: Directive converted to workflow transition and logged

### Configuration

The worker assistant is controlled by the `worker_assistant` configuration in `config/config.yaml`:

```yaml
worker_assistant:
  enabled: true              # Master switch
  agentCapability: worker-assistant
  timeoutMs: 10000           # 10 seconds max for AI decision
  fallbackAction: block          # Action when unavailable
```

### Per-Policy Opt-Out

Policies can opt out of the worker assistant at the policy or phase level for workflows that require deterministic behavior:

```yaml
policies:
  my-policy:
    worker_assistant:
      enabled: false            # Disable for entire policy
    phases:
      - name: implement
        worker_assistant:
          enabled: false          # Disable for specific phase
```

### Benefits

- **Handles ambiguous outputs**: When agents return complex or unclear results
- **Keeps logic simple**: Deterministic rules for clear cases, AI for edge cases
- **Performance**: Only triggered for uncertain cases (<5% of runs)
- **Graceful degradation**: Falls back to configured action if unavailable
- **Full observability**: All decisions logged with reasoning and metadata

### Capabilities

Agents with the `worker-assistant` capability are eligible to serve as worker assistants. The assistant analyzes:
- Agent outcome summary (success, warnings, artifacts, errors)
- Issue context (ID, type, phase)
- Error details when available

Returns one-word directive: `ADVANCE`, `RETRY`, or `BLOCK`

### Required Agent Capability

To use the worker assistant feature, ensure your `agents.yaml` includes agents with the `worker-assistant` capability:

```yaml
agents:
  - id: my-worker-assistant
    name: "Worker Assistant"
    capabilities:
      - worker-assistant
      - analysis
    priority: 10
    active: true
```

See `docs/agents-config.md` for complete agent configuration reference and `docs/config-config.md` for worker assistant settings.

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
│   │   ├── decision-builder.ts   # Decision agent prompts
│   │   ├── garbage-collector.ts  # Data archival and cleanup
│   │   ├── logging.ts          # Logging system
│   │   ├── monitor-engine.ts    # Process supervision
│   │   ├── opencode.ts         # OpenCode client
│   │   ├── path-utils.ts       # Path utilities
│   │   ├── phase-messenger.ts   # Inter-phase communication
│   │   ├── policy.ts           # Policy engine
│   │   ├── policy-capability-validator.ts  # Chain validation
│   │   ├── policy-tree-visualizer.ts     # Tree visualization
│   │   ├── retention-policy.ts  # Retention rules management
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
│   └── openspec/            # OpenSpec integration plugin
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
│   ├── plugin-system.md
│   ├── enhanced-transitions.md
│   ├── loop-prevention.md
│   ├── decision-agents.md
│   ├── garbage-collection.md
│   └── phase-messenger.md
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
- **Label-based triggers**: Issue type matching and explicit workflow labels
- Phase sequences with capabilities
- Retry strategies
- Timeout settings
- Model overrides (optional)

**Label Conventions**:
- `ashep-workflow:<name>` - Explicit workflow assignment (highest priority)
- `ashep-phase:<name>` - Current workflow phase (system-managed)
- `ashep-hitl:<reason>` - Human-in-the-loop state (system-managed)
- `ashep-excluded` - Exclude from processing (user-set)

**Trigger Priority**:
1. Explicit workflow label (`ashep-workflow:xxx`) → Direct assignment
2. Issue type matching → Policy with matching `issue_types` array (highest priority wins)
3. Default policy → Fallback

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

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

### Beads Label System

Agent Shepherd uses the following labels to track issue state:

- `ashep-managed` - Indicates issue is managed by ashep (set once, kept until issue closed)
- `ashep-phase:<name>` - Current workflow phase (e.g., `ashep-phase:implement`)
- `ashep-hitl:<reason>` - Human-in-the-loop state (e.g., `ashep-hitl:approval`)

**Useful commands:**
- `bd list --label ashep-managed` - See all managed issues
- `ashep list-active` - See currently active work (open or in_progress)
- `ashep list-hitl` - See issues needing human attention
- `ashep list-ready` - See issues ready to be worked on (open only)
- `ashep list-struggle` - See blocked, HITL, or stale issues

### Quick Reference

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
| `docs/enhanced-transitions.md` | Understanding advanced workflow routing and AI-based transitions | Enhanced transition system with conditional branching, decision agents, and confidence thresholds |
| `docs/loop-prevention.md` | Configuring loop prevention and preventing infinite workflows | Loop prevention mechanisms including phase visit limits, transition limits, and cycle detection |
| `docs/decision-agents.md` | Understanding AI-driven decision making and routing | Decision agent system with template-based prompts, confidence scoring, and analytics |
| `docs/garbage-collection.md` | Managing data lifecycle and storage cleanup | Garbage collection and archival system with retention policies and cleanup operations |
| `docs/phase-messenger.md` | Understanding inter-phase communication and data exchange | Phase messenger system for passing context and results between workflow phases |

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
| `.agent-shepherd/AGENTS_OpenSpec.md` | Working on proposals, specs, planning changes | OpenSpec change proposal system and workflow |

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

### Testing the Installer

When modifying the installer scripts, always test them before deploying:

**Automated Testing:**
Both installers support a `--auto` flag for automated testing:
```bash
# Bash installer with auto mode
bash install.sh --auto

# PowerShell installer with auto mode
pwsh install.ps1 --auto
```
The `--auto` flag enables:
- Automatic default selections for install prompts
- 5-second timeout for interactive prompts (auto-accepts defaults)
- Useful for CI/CD pipelines and automated testing

# Super Important
**Test in Temporary Directory:**
Always test the installer in a temporary directory before committing changes:
```bash
# Create temp directory
mkdir -p /tmp/ashep-test
cd /tmp/ashep-test

# Copy and test installer
cp /path/to/agent-shepherd/.agent-shepherd/install.sh .
echo -e "L\nN" | bash install.sh --auto

# Clean up after testing
rm -rf /tmp/ashep-test
```

**Testing Checklist:**
- [ ] Syntax validation (bash -n for shell, no syntax errors for PowerShell)
- [ ] Fresh install (choice 'L' or 'F') works correctly
- [ ] Update install (choice 'H' or 'U') works correctly
- [ ] Local mode config created in `.agent-shepherd/`
- [ ] Hybrid mode config created in project directory
- [ ] Dependencies installed successfully
- [ ] Binary rebuilt (bun run build executed)
- [ ] No backup directories left in production (plugins-backup, config-backup)
- [ ] Prompt messages are clear and prominent
- [ ] Next step message stands out visually

## Important Notes

1. **Well-Commented Code**: Code should be well-commented (planned for future refactor). Currently minimal comments exist, but aim to add clear documentation for complex logic, decisions, and APIs
2. **Type Safety**: Always use TypeScript types, avoid `any`
3. **Error Messages**: Be specific and actionable
4. **Logging**: Use the logging system from when agent-shepherd was involved in the work itself `src/core/logging.ts`
5. **Configuration**: Always validate configs before using
6. **Testing**: Write tests for new functionality
7. **Documentation**: Update relevant docs when changing features
8. **Cross-Platform**: Ensure code works on macOS, Linux, and Windows
9. **Dotfolder Isolation**: Keep everything in `.agent-shepherd/` to avoid polluting user projects

## External References

- **Beads**: https://github.com/steveyegge/beads
- **OpenCode**: AI agent execution platform
- **OpenSpec**: Change proposal system (see `.agent-shepherd/AGENTS_OpenSpec.md`)

### CRITICAL RULES:


### Agent Shepherd-Specific Steps:

After completing the Beads Landing Plane workflow, also run:
1. `bun run lint` and `bun run type-check`
2. Ensure all tests pass
3. Commit changes with descriptive messages (if not already done in workflow)

## Phase Messenger

Phase Messenger enables inter-phase communication, allowing phases to exchange data, context, and results.

### Key Features
- **Message passing**: Send structured data between phases
- **Automatic delivery**: Messages delivered when phase starts
- **Context preservation**: Keep important information across phase boundaries
- **Size management**: Automatic cleanup of old messages
- **Persistence**: Dual storage (JSONL + SQLite) for performance and reliability

### Message Types
- **Context**: Planning decisions, requirements clarifications, technical constraints
- **Result**: Phase completion results, test results, performance metrics
- **Decision**: AI decision reasoning, confidence scores, audit trail
- **Data**: Arbitrary structured data, implementation metrics, build artifacts

### CLI Commands
- `get-messages <issue-id> [--phase <phase>] [--unread]` - Get phase messages for an issue

### Usage
```bash
# Get all messages for an issue
ashep get-messages ISSUE-123

# Get messages for specific phase
ashep get-messages ISSUE-123 --phase test

# Get only unread messages
ashep get-messages ISSUE-123 --unread

# Combined filters
ashep get-messages ISSUE-123 --phase test --unread
```

### Integration
- Worker engine automatically receives pending messages before phase execution
- Messages included in agent instructions with usage guidance
- Result messages automatically sent on successful phase completion and advance
- CLI tool for manual message inspection and debugging

### Documentation
See `docs/phase-messenger.md` for detailed documentation.
