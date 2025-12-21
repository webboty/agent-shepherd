# Agent Shepherd

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Agent Shepherd is an orchestration system for AI coding agents that coordinates between Beads (issue tracking), OpenCode (execution environment), and human developers.

## Features

- **Intelligent Agent Selection**: Automatically matches issues to the best available AI agents based on capabilities and requirements
- **Workflow Orchestration**: Manages complex development workflows with phases, retries, and human-in-the-loop approval
- **Configuration Validation**: Validates policy-capability-agent relationships to prevent dead ends and ensure workflow integrity
- **Visual Relationship Tree**: ASCII/JSON tree visualization showing policy-capability-agent mappings and health status
- **Real-time Monitoring**: Supervises agent execution with stall detection and timeout management
- **Flow Visualization**: Interactive ReactFlow UI showing workflow progress and agent assignments
- **Plugin System**: Extensible architecture for optional functionality and custom integrations - [Plugin Documentation](docs/plugin-system.md)
- **Configuration Management**: YAML-based configuration with JSON schema validation
- **Dual Storage**: Efficient logging with JSONL for source-of-truth and SQLite for fast queries

## Quick Start

### Prerequisites

- **Bun** runtime (1.0.0+)
- **Beads** (issue tracking system) - `curl -fsSL https://get.beads.dev | bash`
- **OpenCode** (AI agent execution platform)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd agent-shepherd

# Install dependencies and link globally
bun install
bun link

# Initialize configuration (run from your project directory)
cd /path/to/your/project
ashep init

# Check dependencies
ashep install
```

### Basic Usage

```bash
# Start autonomous issue processing
ashep worker

# Start monitoring in another terminal
ashep monitor

# Process a specific issue
ashep work ISSUE-123

# View workflow visualization
ashep ui

# Validate policy-capability-agent relationships
ashep validate-policy-chain

# Show relationship tree
ashep show-policy-tree
```

## Architecture

For detailed architecture information, see [docs/architecture.md](docs/architecture.md).

```
Beads Issues → Worker Engine → Agent Registry → OpenCode Sessions
                     ↓              ↓                 ↓
                 Policy Engine → Agent Selection → Agent Execution
                     ↓              ↓                 ↓
                 Monitor Engine → Logging System → Run Outcomes
```

## Configuration

## Agent Management

### Agent Synchronization

Agent Shepherd automatically discovers and configures OpenCode agents:

```bash
# Sync with OpenCode to discover new agents
ashep sync-agents

# View available agents
cat .agent-shepherd/config/agents.yaml
```

**Supported Agent Name Formats**: Agent IDs can contain letters, numbers, underscores (`_`), and hyphens (`-`).

### Model Override Capability

Policies can override the default model specified in OpenCode agent configuration:

```yaml
# Example policy with model override
phases:
  - name: complex-planning
    capabilities: [planning, architecture]
    # Override to use more capable model for complex tasks
    model: anthropic/claude-3-5-sonnet-20241022

  - name: simple-planning
    capabilities: [planning]
    # Use faster model for basic planning
    model: anthropic/claude-3-5-haiku-20241022
```

This provides fine-grained control over cost, speed, and quality based on task requirements.

Agent Shepherd uses YAML configuration files in the `.agent-shepherd/config/` directory:

## Configuration Files

### [Main Configuration](docs/config-config.md) (`config/config.yaml`)

Controls system behavior, performance tuning, and resource management.

```yaml
version: "1.0"
worker:
  poll_interval_ms: 30000      # How often to check for work
  max_concurrent_runs: 3       # Maximum parallel processing
monitor:
  poll_interval_ms: 10000      # Monitoring frequency
  stall_threshold_ms: 60000    # Failure detection timeout
ui:
  port: 3000                   # Web interface port
  host: localhost              # Network binding
```

### [Workflow Policies](docs/policies-config.md) (`config/policies.yaml`)

Defines processing workflows, agent selection, and task orchestration.

```yaml
version: "1.0"
policies:
  - id: "default-workflow"
    name: "Default Development Workflow"
    trigger:
      type: "issue"
      patterns: ["feature", "bug"]
    phases:
      - name: "analysis"
        capabilities: ["analysis", "planning"]
        agent: "plan"
        max_iterations: 3
      - name: "implementation"
        capabilities: ["coding"]
        depends_on: ["analysis"]
        max_iterations: 5
```

### [Agent Registry](docs/agents-config.md) (`config/agents.yaml`)

Agent definitions with capabilities, constraints, and metadata. Auto-synced from OpenCode.

```yaml
version: "1.0"
agents:
  - id: build
    name: "Build Agent"
    capabilities: [coding, refactoring, building]
    provider_id: anthropic
    model_id: claude-3-5-sonnet-20241022
    priority: 15
    constraints:
      performance_tier: balanced
    metadata:
      agent_type: primary

  - id: explore
    name: "Exploration Agent"
    capabilities: [exploration, analysis, discovery]
    priority: 8
    constraints:
      performance_tier: fast
    metadata:
      agent_type: subagent
```

### Workflow Policies (`config/policies.yaml`)

```yaml
policies:
  default:
    name: "Default Workflow"
    phases:
      - name: plan
        capabilities: [planning, architecture]
      - name: implement
        capabilities: [coding, refactoring]
      - name: test
        capabilities: [testing, qa]
      - name: review
        capabilities: [review, documentation]
    retry:
      max_attempts: 3
      backoff_strategy: exponential
    timeout_base_ms: 300000

default_policy: default
```

## Policy-Capability-Agent Validation

Agent Shepherd includes comprehensive validation tools to ensure workflow integrity:

### Chain Validation

Validate that all policies can execute by checking the complete policy → capability → agent chain:

```bash
ashep validate-policy-chain
```

This command:
- ✅ Verifies all policy phases reference valid capabilities
- ✅ Ensures capabilities have active agents available
- ⚠️ Warns about single points of failure (capabilities with only one agent)
- ❌ Detects dead ends (capabilities without agents, policies without valid paths)
- 📍 Provides detailed location information and fix suggestions

### Relationship Visualization

View the complete relationship tree between policies, capabilities, and agents:

```bash
# ASCII tree view
ashep show-policy-tree

# JSON export for tools
ashep show-policy-tree --format json
```

The tree visualization shows:
- 📋 Policies with status indicators
- 🔄 Phases within policies
- 🎯 Capabilities required by phases
- 🤖 Agents that can fulfill capabilities
- Status: ✅ valid, ⚠️ warning, ❌ error, ⚪ inactive

### Integration

- **Startup Validation**: Policy chain validation runs automatically during `ashep worker` startup
- **Configuration Checks**: Prevents execution with broken relationships
- **Issue Prevention**: Catches configuration problems before they cause runtime failures

## CLI Commands

For detailed CLI documentation, see [docs/cli-reference.md](docs/cli-reference.md).

### Core Commands

- **`ashep worker`** - Start autonomous issue processing
- **`ashep monitor`** - Start supervision and monitoring
- **`ashep work <issue-id>`** - Process specific issue
- **`ashep ui`** - Start flow visualization server

### Management Commands

- **`ashep init`** - Initialize configuration directory
- **`ashep install`** - Check system dependencies
- **`ashep sync-agents`** - Sync agent registry with OpenCode
- **`ashep validate-policy-chain`** - Validate policy-capability-agent relationships
- **`ashep show-policy-tree`** - Display relationship tree visualization
- **`ashep help`** - Show all available commands

### Plugin Commands

- **`ashep plugin-install <path/url>`** - Install plugin from local path or git URL
- **`ashep plugin-activate <name>`** - Activate an installed plugin
- **`ashep plugin-deactivate <name>`** - Deactivate an installed plugin
- **`ashep plugin-remove <name>`** - Remove an installed plugin
- **`ashep plugin-list`** - List all installed plugins

For detailed plugin documentation, see [docs/plugin-system.md](docs/plugin-system.md).

## Development

### Building

```bash
bun run build
bun link  # Make globally available for development
```

### Testing

```bash
# Run all tests
bun test

# Run linting
bun run lint

# Type checking
bun run type-check
```

### Project Structure

```
src/
├── cli/                    # Command-line interface
├── core/                   # Core orchestration modules
│   ├── agent-registry.ts   # Agent selection and registry
│   ├── beads.ts           # Beads integration
│   ├── config-validator.ts # Configuration validation
│   ├── config.ts          # Configuration loading
│   ├── logging.ts         # Logging system
│   ├── monitor-engine.ts  # Supervision and monitoring
│   ├── opencode.ts        # OpenCode integration
│   ├── path-utils.ts      # Path resolution utilities
│   ├── policy.ts          # Policy engine
│   ├── policy-capability-validator.ts # Chain validation
│   ├── policy-tree-visualizer.ts # Relationship visualization
│   └── worker-engine.ts   # Issue processing
├── ui/                    # ReactFlow visualization
│   ├── ui-server.ts       # Express server for UI
│   └── AgentShepherdFlow.tsx # ReactFlow component

config/                    # User configuration files
├── agents.yaml           # Agent registry (auto-synced from OpenCode)
├── config.yaml           # Main configuration
└── policies.yaml         # Workflow policies

schemas/                   # JSON schema validation
docs/                      # Documentation
tests/                     # Test files
```

## API Reference

### REST API (UI Server)

- `GET /api/health` - Health check
- `GET /api/runs` - Get agent runs
- `GET /api/phases` - Get workflow phases

### Programmatic Usage

```typescript
import { getWorkerEngine, getMonitorEngine } from './src/core';

const worker = getWorkerEngine();
await worker.start();

const monitor = getMonitorEngine();
await monitor.start();
```

## Key Concepts

### Policies

Workflow definitions that specify:
- **Phases**: Sequential steps (plan → implement → test → review)
- **Capabilities**: Required agent skills for each phase
- **Timeouts**: Time limits for each phase
- **Retries**: Failure handling strategies

### Agents

AI coding assistants with:
- **Capabilities**: What they can do (coding, testing, planning, etc.)
- **Priority**: Selection preference ranking
- **Provider**: AI service (Anthropic, OpenAI, etc.)
- **Constraints**: Performance tier and specialization

### Runs

Agent execution instances with:
- **Status**: pending, running, completed, failed
- **Session**: OpenCode session identifier
- **Outcome**: Success/failure results and artifacts
- **Timeline**: Start/end times and duration

## Troubleshooting

### Common Issues

**"Configuration validation failed"**
```bash
ashep init  # Reinitialize configuration
# Check YAML syntax in .agent-shepherd/config/ files
```

**"Beads not installed"**
```bash
curl -fsSL https://get.beads.dev | bash
export PATH="$HOME/.beads/bin:$PATH"
```

**"UI server won't start"**
```bash
# Check if port is in use
lsof -i :3000
# Use different port
ashep ui --port 8080
```

### Debug Mode

```bash
DEBUG=agent-shepherd ashep worker
```

### Logs

- Application logs: `.agent-shepherd/logs/`
- Run logs: JSONL format with SQLite index
- Issue tracking: Beads database

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests (`bun test`)
5. Run linting (`bun run lint`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## Documentation

- **[Architecture Guide](docs/architecture.md)** - Detailed system architecture and design decisions
- **[CLI Reference](docs/cli-reference.md)** - Comprehensive command-line interface documentation

## License

MIT License - see LICENSE file for details.

## Related Projects

- **Beads**: Issue tracking system - https://github.com/steveyegge/beads
- **OpenCode**: AI agent execution platform
- **BMad Method**: AI-driven development methodology