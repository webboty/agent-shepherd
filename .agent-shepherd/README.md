# Agent Shepherd

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Agent Shepherd is an orchestration system for AI coding agents that coordinates between Beads (issue tracking), OpenCode (execution environment), and human developers.

## Features

- **Intelligent Agent Selection**: Automatically matches issues to the best available AI agents based on capabilities and requirements
- **Workflow Orchestration**: Manages complex development workflows with phases, retries, and human-in-the-loop approval
- **Real-time Monitoring**: Supervises agent execution with stall detection and timeout management
- **Flow Visualization**: Interactive ReactFlow UI showing workflow progress and agent assignments
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

### Main Configuration (`config/config.yaml`)

```yaml
version: "1.0"
worker:
  poll_interval_ms: 30000
  max_concurrent_runs: 3
monitor:
  poll_interval_ms: 10000
  stall_threshold_ms: 60000
ui:
  port: 3000
  host: localhost
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

### Agent Registry (`config/agents.yaml`)

Agent Shepherd automatically syncs with OpenCode using `ashep sync-agents`:

```yaml
version: "1.0"
agents:
  - id: build
    name: "Build Agent"
    description: "Handles code building and compilation tasks"
    capabilities: [coding, refactoring, building]
    provider_id: anthropic
    model_id: claude-3-5-sonnet-20241022
    priority: 15
    constraints:
      performance_tier: balanced
    metadata:
      agent_type: primary  # primary or subagent classification

  - id: plan
    name: "Planning Agent"
    description: "Handles planning and architecture design"
    capabilities: [planning, architecture, analysis]
    provider_id: anthropic
    model_id: claude-3-5-sonnet-20241022
    priority: 12
    constraints:
      performance_tier: balanced
    metadata:
      agent_type: primary
```

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
- **`ashep help`** - Show all available commands

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