# Agent Shepherd

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Agent Shepherd is an orchestration system for AI coding agents that coordinates between Beads (issue tracking), OpenCode (execution environment), and human developers.

## Features

- **Intelligent Agent Selection**: Automatically matches issues to the best available AI agents based on capabilities and requirements
- **Workflow Orchestration**: Manages complex development workflows with phases, retries, and human-in-the-loop approval
- **Label-Based Workflows**: Automatic workflow selection via Beads labels with explicit assignment, issue type matching, and phase tracking
- **Configuration Validation**: Validates policy-capability-agent relationships to prevent dead ends and ensure workflow integrity
- **Visual Relationship Tree**: ASCII/JSON tree visualization showing policy-capability-agent mappings and health status
- **Real-time Monitoring**: Supervises agent execution with stall detection and timeout management
- **Flow Visualization**: Interactive ReactFlow UI showing workflow progress and agent assignments
- **Plugin System**: Extensible architecture for optional functionality and custom integrations - [Plugin Documentation](docs/plugin-system.md)
- **Configuration Management**: YAML-based configuration with JSON schema validation
- **Dual Storage**: Efficient logging with JSONL for source-of-truth and SQLite for fast queries

## What to Expect

This guide walks you through setting up Agent Shepherd in under 5 minutes:

**You will:**
- 📥 **Install** Agent Shepherd globally (Hybrid mode) or locally
- ⚙️ **Initialize** project configuration (creates `.agent-shepherd/` directory)
- 🚀 **Run quickstart** to sync agents, validate setup, and get ready
- 📝 **Add your first issue** to Beads (we'll provide a perfect example)
- ▶️ **Start worker** to process issues autonomously

**You'll create:**
- `.agent-shepherd/config/` directory with policy, agents, and config files
- Your first Beads issue (self-contained "Hello World" task)
- A complete working system ready for autonomous AI agent workflows

**After completing this guide, you'll have:**
- ✅ Agent Shepherd installed and ready
- ✅ Simple multi-phase workflow (Implement → Test → Validate with auto-retry)
- ✅ A test issue you can immediately process
- ✅ Autonomous orchestration demonstrating Agent Shepherd's power

**Time commitment**: ~5 minutes

---

## Installation

Agent Shepherd supports two installation modes:

**Hybrid Mode (Recommended)**
- Binary globally in `~/.agent-shepherd/` (shared across projects)
- Config per-project in `./.agent-shepherd/config/`
- Best for: Multiple projects, easy updates

**Local Mode**
- Everything self-contained in `./.agent-shepherd/`
- Best for: Isolated projects, air-gapped environments

### Quick Install

#### macOS/Linux

```bash
# Download installer
curl -fsSL https://raw.githubusercontent.com/webboty/agent-shepherd/master/.agent-shepherd/install.sh -o install.sh

# Make executable
chmod +x install.sh

# Run installer (latest version)
./install.sh

# Or install specific version
./install.sh v1.0.0

# If chmod fails, run directly with bash:
bash install.sh
```

#### Windows (PowerShell)

```powershell
# Download installer
irm https://raw.githubusercontent.com/webboty/agent-shepherd/master/.agent-shepherd/install.ps1 -OutFile install.ps1

# Run installer (latest version)
.\install.ps1

# Or install specific version
.\install.ps1 v1.0.0
```

The installer will prompt you to choose:
1. **Installation mode** (Hybrid/Local)
2. **Global linking** (run `ashep` from anywhere or via `bunx ashep`)

## After Installation

**Your Complete Onboarding Journey:**
**Install → Init → Quickstart → Add Issue → Start Worker ✨**

---

### Step 1: Initialize (if using Hybrid mode)

```bash
# In your project directory
ashep init
```

This creates the `.agent-shepherd/` directory with configuration files.

**If you chose Local mode**: The `.agent-shepherd/` directory is already created - skip this step.

### Step 2: Quickstart

```bash
# Set up dependencies and validate your setup
ashep quickstart
```

This command will:
- ✅ Auto-install missing dependencies (Bun, Beads)
- ✅ Generate sample configuration files
- ✅ Sync with available AI agents
- ✅ Validate your setup
- ✅ Show next steps for using Agent Shepherd

**Important**: Quickstart is REQUIRED after initialization - it completes the setup process. Don't skip to `ashep worker` directly, or your system won't be ready!

**Quickstart uses simple policy** which works out-of-the-box with basic OpenCode agents. No configuration needed!

### Step 3: Add Your First Issue

Agent Shepherd works with **Beads** (issue tracking). Before running the worker, add at least one issue.

**Best First Issue: Independent Hello World**

A perfect first issue is completely self-contained - no knowledge of your codebase needed:
```bash
bd create \
  --type task \
  --title "Create animated hello world" \
  --description "Create index.html with animated 'Hello World' text. Use CSS for smooth pulsing animation. Add JavaScript click handler to change text color randomly." \
  --labels quickstart,documentation
```

This works perfectly because:
- ✅ Completely self-contained (HTML/CSS/JS only)
- ✅ Verifiable (open browser and see it work)
- ✅ Requires no codebase knowledge
- ✅ Matches simple policy (just implement what's described)

**📘 Beads Crash Course: Adding Your First Issue**

See [docs/beads-crash-course.md](docs/beads-crash-course.md) for:
- Beads basic commands
- How to add issues
- Issue types and priorities
- Using Beads effectively
- **Full Beads reference and learning guide**

### Step 4: Start Processing

```bash
# Start autonomous issue processing
ashep worker

# In another terminal, start monitoring
ashep monitor
```

### Configuration Customization (Advanced)

Agent Shepherd comes with two pre-configured policies:

**🌱 Simple Policy (Default - Beginner Friendly)**
- Works out-of-the-box with basic OpenCode agents
- **Autonomous multi-phase workflow**: Implement → Test → Validate (with retry loop)
- Demonstrates Agent Shepherd's power: autonomous retries, self-healing, monitoring
- Best for: Issues with clear requirements that can be self-tested
- **How it works**:
  1. **Implement**: Agent builds feature based on issue description
  2. **Test**: Agent runs and verifies what was built
  3. **Validate**: Agent checks if result matches original requirements
  4. **Retry loop**: If test fails, automatically fixes and retests
- Uses: `coding`, `testing` capabilities (builder agent has both)
- **Single agent handles all phases** - shows autonomous orchestration
 
**🚀 Advanced Policy (Complex Projects)**
- Requires agents with specialized capabilities
- **Phases**: Plan → Implement → Test → Review
- Best for: High-level issues needing exploration, production workflows
- Use when: Issue title is vague ("Fix bug", "Add feature") and needs discovery
- Uses: `planning`, `architecture`, `testing`, `qa`, `review`, `documentation`
- **Planning phase explores and creates detailed approach** before implementation
- **Multiple agents may handle different phases**
 
**💡 Pro Tip**: For complex projects, use **OpenSpec** to plan first, then sync to Beads:
```bash
# Create detailed plan in OpenSpec
openspec create "Implement user authentication"
 
# Sync plan to Beads (issue becomes as plan)
# Copy the plan from OpenSpec and add it as a Beads issue description
bd create --title "Implement user authentication" --description "<paste OpenSpec plan here>"
 
# Agent Shepherd then just implements what's in the issue
```

**Note**: The simple policy is set as default for first-time users. Switch to advanced policy when you're ready for planning-heavy workflows.

## Label-Based Workflow Control

Agent Shepherd uses Beads labels to control workflow behavior, providing visibility and manual control over issue processing.

### Workflow Labels

| Label | Purpose | Usage |
|--------|---------|--------|
| `ashep-workflow:<name>` | Assign specific workflow | `bd update ISSUE-1 --labels "ashep-workflow:security-audit"` |
| `ashep-phase:<name>` | Current workflow phase (auto) | System-managed, shows current phase |
| `ashep-hitl:<reason>` | Human-in-the-loop state (auto) | System-managed for approvals |
| `ashep-excluded` | Exclude from processing | `bd update ISSUE-1 --labels "ashep-excluded"` |

### Automatic Workflow Selection

Agent Shepherd automatically selects workflows using three priority levels:

**1. Explicit Workflow Label** (highest priority)
```bash
# Force specific workflow
bd update ISSUE-123 --labels "ashep-workflow:security-audit"
```

**2. Issue Type Matching** (automatic)
```bash
# Issue type automatically matched to policy
bd create --type bug --title "Fix login error"
# Policies with issue_types: ['bug'] will match
```

**3. Default Policy** (fallback)
```bash
# No label or type match → use default policy
# Default policy specified in policies.yaml
```

### Phase Tracking and Resumption

Agent Shepherd tracks workflow phases using labels:

```bash
# Worker automatically adds phase label
ashep-phase:plan  # First phase
ashep-phase:implement  # Second phase
ashep-phase:test  # Third phase

# Worker reads phase label to resume processing
# If worker restarts, it resumes from current phase
```

**Manual Phase Control** (advanced):
```bash
# Manually set phase label to force phase (rarely needed)
bd update ISSUE-123 --labels "ashep-phase:implement"
```

### Human-in-the-Loop (HITL) Labels

When a workflow phase requires approval or human intervention:

```bash
# System automatically adds HITL label
ashep-hitl:approval  # Approval required
ashep-hitl:manual-intervention  # Manual intervention needed
ashep-hitl:timeout  # Phase timed out
ashep-hitl:error  # Error occurred
ashep-hitl:review-request  # Review requested
```

**HITL Workflow**:
```bash
# 1. Worker pauses at approval point
ashep-hitl:approval

# 2. Human reviews issue
bd show ISSUE-123

# 3. Human resolves HITL (removes label or adds note)
bd update ISSUE-123 --notes "Approved implementation"

# 4. Worker detects resolution and resumes
# ashep-hitl:approval label cleared automatically
```

### Exclusion Control

Exclude issues from automated processing:

```bash
# Mark issue as excluded (won't be processed by worker)
bd update ISSUE-123 --labels "ashep-excluded"

# Later, remove exclusion to allow processing
bd label remove ISSUE-123 ashep-excluded
```

**Use cases for exclusion**:
- Manual testing required
- Human-only tasks
- Issues awaiting external dependencies
- Testing workflow changes

### Advanced Label Examples

**Multi-workflow Setup**:
```yaml
# policies.yaml
policies:
  security-audit:
    name: "Security Audit"
    issue_types: [bug, feature]
    priority: 90  # High priority for security
    phases:
      - name: threat-modeling
        capabilities: [security, analysis]

  quick-fix:
    name: "Quick Fix"
    issue_types: [bug]
    priority: 50
    phases:
      - name: fix
        capabilities: [coding]
```

```bash
# Regular bug → quick-fix policy (priority 50)
bd create --type bug --title "Fix typo"

# Security bug → security-audit policy (priority 90)
bd create --type bug --title "Fix security vulnerability"

# Force security audit on any issue
bd update ISSUE-123 --labels "ashep-workflow:security-audit"
```

**Invalid Workflow Label Handling**:
```yaml
# config.yaml
workflow:
  invalid_label_strategy: "warning"  # or "error" or "ignore"
```

```bash
# Invalid workflow label (policy doesn't exist)
bd update ISSUE-123 --labels "ashep-workflow:nonexistent"

# With strategy "error": Worker fails with error
# With strategy "warning": Worker logs warning, uses default
# With strategy "ignore": Worker silently uses default
```

### Label Validation

HITL labels are validated against configuration:

```yaml
# config.yaml
hitl:
  allowed_reasons:
    predefined:
      - approval
      - manual-intervention
      - security-review
    allow_custom: true
    custom_validation: "alphanumeric-dash-underscore"
```

**Valid labels**:
```bash
ashep-hitl:approval  # Predefined (always allowed)
ashep-hitl:security-review  # Predefined (always allowed)
ashep-hitl:custom-reason-123  # Custom (matches validation)
```

**Invalid labels**:
```bash
ashep-hitl:Invalid  # Wrong case (must be lowercase)
ashep-hitl:invalid reason!  # Contains spaces and special chars
```

## Fallback Agent System

When a policy requires a capability that no agent has, the fallback system allows you to specify a default agent to handle the task anyway. This is especially useful for getting started quickly with default agents.

### When to Use Fallback

- **First-time setup**: Get started immediately with default agents
- **Testing workflows**: Test workflows before adding specialized agents
- **Limited agent pool**: Use available agents for all capability requirements

### Basic Configuration

Add to `.agent-shepherd/config/config.yaml`:

```yaml
fallback:
  enabled: true
  default_agent: build
```

### Cascading Hierarchy

The fallback system works on three levels:

1. **Global Level** (config.yaml): System-wide default
2. **Policy Level** (policies.yaml): Policy-specific override
3. **Phase Level** (policies.yaml): Phase-specific override

Each level can override the levels above it.

### Advanced Configuration

Use capability-specific mappings for better agent matching:

```yaml
fallback:
  enabled: true
  default_agent: build
  mappings:
    review: summary
    architecture: plan
    documentation: summary
    testing: general
```

See [Configuration Customization (Advanced)](#configuration-customization-advanced) for more details on configuring fallback at different levels.

---

After you have a working setup, customize Agent Shepherd to your needs:

**What to Configure:**
- **Policies** (`.agent-shepherd/config/policies.yaml`): Define workflow phases, capabilities, and retry strategies
- **Agents** (`.agent-shepherd/config/agents.yaml`): Usually auto-synced from OpenCode, but can be manually adjusted
- **Config** (`.agent-shepherd/config/config.yaml`): Worker, monitor, and UI settings

**How to Customize:**

1. **Review Your Agents' Capabilities:**
```bash
ashep sync-agents
cat .agent-shepherd/config/agents.yaml
```

2. **Match Policies to Available Capabilities:**
Edit `.agent-shepherd/config/policies.yaml` to use capabilities that your agents provide.

3. **Validate Your Changes:**
```bash
ashep validate-policy-chain
```

**Why Customize?**
- **Team Needs**: Adjust workflows to match your development process
- **Cost Optimization**: Use faster models for simple tasks
- **Quality Control**: Add review and testing phases for critical changes
- **Resource Management**: Control concurrent runs and polling intervals

**📘 Configuration Guides:**
- [Policy Configuration](docs/policies-config.md) - Workflow definitions and agent selection
- [Agent Configuration](docs/agents-config.md) - Agent registry and capabilities
- [Main Configuration](docs/config-config.md) - System settings and tuning

### Ready to Go!

Run `ashep --help` to see all available commands.

### Manual Setup (Advanced)

If you prefer manual installation:

#### Prerequisites

- **Bun** runtime (1.0.0+)
- **Beads** (issue tracking system) - `curl -fsSL https://get.beads.dev | bash`
- **OpenCode** (AI agent execution platform)

#### Installation

```bash
# Clone the repository
git clone <repository-url>
cd agent-shepherd

# Install dependencies
bun install

# Choose installation approach:

# Option 1: Hybrid (recommended)
mkdir -p ~/.agent-shepherd
cp -r .agent-shepherd/* ~/.agent-shepherd/
bun link  # Global linking

# Option 2: Local (self-contained)
# Use as-is for development

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

# Check current version
ashep version

# Update to latest version (preserves config/plugins)
ashep update

# Update to specific version
ashep update v1.2.0
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
    issue_types: ["feature", "bug"]
    priority: 50
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
- **`ashep version`** - Show installed version
- **`ashep update [version]`** - Update to latest or specific version
- **`ashep help`** - Show all available commands

### Plugin Commands

- **`ashep plugin-install <path/url>`** - Install plugin from local path or git URL
- **`ashep plugin-activate <name>`** - Activate an installed plugin
- **`ashep plugin-deactivate <name>`** - Deactivate an installed plugin
- **`ashep plugin-remove <name>`** - Remove an installed plugin
- **`ashep plugin-list`** - List all installed plugins

For detailed plugin documentation, see [docs/plugin-system.md](docs/plugin-system.md).

## Development

### Developer Setup

Contributors should clone the full repository for development:

```bash
# Clone the repository
git clone <repository-url>
cd agent-shepherd

# Install dependencies
bun install

# Build and link for development
bun run build
bun link

# Run from anywhere during development
ashep --help
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

plugins/                   # Plugin directory
├── openspec/             # OpenSpec integration plugin
│   ├── manifest.json     # Plugin metadata
│   ├── index.js          # Command implementations
│   └── README.md         # Plugin documentation

schemas/                   # JSON schema validation
├── plugin.schema.json    # Plugin manifest validation
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

- **[Phase Transition Flow](docs/phase-transition-flow.md)** - Complete visual guide to Agent Shepherd's workflow orchestration, including policy matching, agent selection, transition logic, loop prevention, and all enhanced features
- **[Architecture Guide](docs/architecture.md)** - Detailed system architecture and design decisions
- **[CLI Reference](docs/cli-reference.md)** - Comprehensive command-line interface documentation

## License

MIT License - see LICENSE file for details.

## Related Projects

- **Beads**: Issue tracking system - https://github.com/steveyegge/beads
- **OpenCode**: AI agent execution platform
- **BMad Method**: AI-driven development methodology