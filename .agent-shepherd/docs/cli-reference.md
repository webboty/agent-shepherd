# Agent Shepherd CLI Reference

## Command Overview

Agent Shepherd provides a comprehensive CLI for managing the orchestration system. All commands are run via `ashep <command> [options]`.

## Core Commands

### `ashep quickstart`

One-command onboarding that sets up Agent Shepherd with dependencies, configuration, and demo workflow.

**Usage:**
```bash
ashep quickstart
```

**Behavior:**
- Automatically installs missing dependencies (Bun, Beads)
- Initializes configuration directory with sample files
- Syncs agent registry with OpenCode (if available)
- Validates policy-capability-agent chain integrity
- Provides instructions for next steps

**Output:**
```
🚀 Agent Shepherd Quickstart - One-command onboarding

📦 Checking dependencies...
✅ Bun 1.2.23 is installed
✅ Beads (bd) is installed

⚙️ Initializing configuration...
...

🎉 Quickstart complete!

Next steps:
• Start the worker: ashep worker
• Start monitoring: ashep monitor
• View UI: ashep ui
• Process issues: ashep work <issue-id>
```

### `ashep worker`

Start the autonomous worker engine that processes issues from Beads.

**Usage:**
```bash
ashep worker
```

**Behavior:**
- Polls Beads for ready issues every 30 seconds (configurable)
- Processes up to 3 concurrent issues (configurable)
- Automatically selects agents and manages workflow phases
- Handles retries and failures according to policy
- Runs indefinitely until interrupted (Ctrl+C)

**Output:**
```
Starting Agent Shepherd Worker...
Processing issue: ISSUE-123 - Implement user authentication
Using policy 'default' at phase 'plan'
Selected agent: architect-expert (priority: 20)
Created OpenCode session: session-abc123
Run completed successfully
```

### `ashep monitor`

Start the supervision engine that monitors active runs and handles stalls.

**Usage:**
```bash
ashep monitor
```

**Behavior:**
- Monitors all active agent runs
- Detects stalled sessions (default: 60 seconds)
- Handles human-in-the-loop approvals
- Resumes interrupted runs on startup
- Manages timeouts and escalations

**Output:**
```
Starting Agent Shepherd Monitor...
Monitoring 3 active runs
Detected stall in session-def456 (60s elapsed)
Escalating to human approval required
```

### `ashep work <issue-id>`

Manually process a specific issue, bypassing the autonomous worker.

**Usage:**
```bash
ashep work ISSUE-123
ashep work --phase implement ISSUE-456
```

**Options:**
- `--phase <phase>`: Start at specific phase instead of first phase

**Behavior:**
- Validates issue exists in Beads
- Processes through complete workflow
- Returns detailed result status
- **Note**: Custom prompts configured in policies.yaml are automatically applied per phase and support variable substitution (e.g., `{{issue.title}}`, `{{phase}}`, `{{capabilities}}`)

**Output:**
```
Processing issue: ISSUE-123 - Implement user authentication

Result:
  Success: true
  Run ID: run-789
  Next Phase: implement
```

### `ashep ui`

Start the ReactFlow visualization server.

**Usage:**
```bash
ashep ui
ashep ui --port 8080
```

**Options:**
- `--port <port>`: Server port (default: 3000)
- `--host <host>`: Server host (default: localhost)

**Behavior:**
- Starts Express server with ReactFlow UI
- Provides REST API for data access
- Auto-refreshes every 5 seconds
- Serves on configurable port/host

**Output:**
```
Starting Agent Shepherd UI...
🚀 Server started: http://localhost:3000
API available at: http://localhost:3000/api
```

## Configuration Commands

### `ashep init`

Initialize the Agent Shepherd configuration directory.

**Usage:**
```bash
ashep init
```

**Behavior:**
- Creates `.agent-shepherd/` directory structure
- Creates `config/` and `plugins/` subdirectories
- Generates default configuration files:
  - `config/config.yaml` - Main settings
  - `config/policies.yaml` - Workflow definitions
  - `config/agents.yaml` - Agent registry
- Skips existing files to avoid overwriting

**Output:**
```
Initializing Agent Shepherd configuration...
Created directory: /path/to/project/.agent-shepherd/config
Created directory: /path/to/project/.agent-shepherd/plugins
Created: /path/to/project/.agent-shepherd/config/config.yaml
Created: /path/to/project/.agent-shepherd/config/policies.yaml
Created: /path/to/project/.agent-shepherd/config/agents.yaml

Initialization complete!
You can now run: ashep worker
```

### `ashep install`

Check system dependencies and installation status.

**Usage:**
```bash
ashep install
```

**Behavior:**
- Verifies Bun installation
- Checks for Beads CLI (`bd`)
- Validates configuration directory exists
- Provides installation instructions for missing dependencies

**Output:**
```
Checking dependencies...

✓ Bun 1.2.23 is installed
✓ Beads (bd) is installed
✓ Configuration directory exists

All dependencies are installed!
```

**Error Output:**
```
Checking dependencies...

✓ Bun 1.2.23 is installed
✗ Beads (bd) is NOT installed
  Install from: https://github.com/steveyegge/beads
✗ Configuration directory NOT found
  Run: ashep init

Some dependencies are missing. Please install them.
```

### `ashep sync-agents`

Sync the agent registry with OpenCode to discover available agents.

**Usage:**
```bash
ashep sync-agents
```

**Behavior:**
- Runs `opencode agent list` to discover all available agents
- Parses agent types (primary/subagent) and capabilities
- Updates `.agent-shepherd/config/agents.yaml` with new agent configurations
- Preserves existing agent customizations
- Supports agent names with letters, numbers, underscores, and hyphens

**Output:**
```
Syncing agents with OpenCode...

Sync complete:
  Added: 3
  Updated: 0
  Removed: 1
```

**Agent Configuration:**
Synced agents include metadata about their type and automatically assigned capabilities:
- **Primary agents**: build, plan, summary, title, compaction
- **Subagents**: explore, general
- **Custom agents**: Any user-defined agents in `.opencode/agent/`

### `ashep validate-policy-chain`

Validate the policy-capability-agent chain integrity to ensure all workflow requirements can be fulfilled.

**Usage:**
```bash
ashep validate-policy-chain
```

**Behavior:**
- Validates that all policy phases reference existing capabilities
- Ensures capabilities have active agents available
- Detects dead ends (capabilities without agents, policies without valid execution paths)
- Reports warnings for single points of failure (capabilities with only one agent)
- Provides detailed error messages with location information and fix suggestions

**Output:**
```
🔍 Validating policy-capability-agent chain...
✅ All policy-capability-agent chains are valid
```

**Error Output:**
```
❌ Validation failed: 2 errors, 1 warning found
• policies.yaml: default.test: Capability 'testing' is not provided by any agent
• policies.yaml: default.review: Capability 'review' has only one active agent
```

### `ashep show-policy-tree`

Display a visual tree representation of policy-capability-agent relationships.

**Usage:**
```bash
ashep show-policy-tree
ashep show-policy-tree --format json
```

**Options:**
- `--format json`: Output tree structure as JSON instead of ASCII art

**Behavior:**
- Shows hierarchical relationship between policies, phases, capabilities, and agents
- Uses status indicators: ✅ (valid), ⚠️ (warning), ❌ (error), ⚪ (inactive)
- Identifies dead ends and single points of failure
- Provides summary statistics of the relationship chain
- ASCII format shows tree structure with icons and metadata
- JSON format suitable for programmatic processing or external tools

**Output:**
```
Policy-Capability-Agent Tree
===========================

└── 📋 default
    ├── 🔄 plan
    │   ├── 🎯 planning
    │   │   ├── 🤖 General Agent
    │   │   └── 🤖 Planning Agent
    │   └── ⚠️🎯 architecture
    │       └── 🤖 Planning Agent (only one agent!)
    ├── 🔄 implement
    │   ├── 🎯 coding
    │   │   ├── 🤖 Build Agent
    │   │   └── 🤖 General Agent
    │   └── 🎯 refactoring
    │       └── 🤖 Build Agent
    └── ❌🔄 test
        ├── ❌🎯 testing
        │   └── ❌🤖 No agents available
        └── ❌🎯 qa
            └── ❌🤖 No agents available

Summary:
  Policies: 0/1 valid
  Phases: 4
  Capabilities: 6
  Agents: 8
  Issues: 1 warning, 2 errors
  Dead end capabilities: testing, qa
```

## Plugin Commands

### `ashep plugin-install <path-or-url>`

Install a plugin from a local path or git repository URL.

**Usage:**
```bash
ashep plugin-install /path/to/plugin-directory
ashep plugin-install https://github.com/user/plugin-repo.git
```

**Behavior:**
- Copies local plugin directory to `.agent-shepherd/plugins/`
- Clones git repositories for remote plugins
- Validates plugin structure after installation
- Plugins are activated automatically on next CLI startup

### `ashep plugin-activate <plugin-name>`

Activate an installed plugin.

**Usage:**
```bash
ashep plugin-activate my-plugin
```

**Behavior:**
- Marks plugin as active for loading
- Commands become available immediately (restart may be required)

### `ashep plugin-deactivate <plugin-name>`

Deactivate an installed plugin.

**Usage:**
```bash
ashep plugin-deactivate my-plugin
```

**Behavior:**
- Marks plugin as inactive
- Commands are unloaded on next CLI startup

### `ashep plugin-remove <plugin-name>`

Completely remove an installed plugin.

**Usage:**
```bash
ashep plugin-remove my-plugin
```

**Behavior:**
- Deletes plugin directory from `.agent-shepherd/plugins/`
- Commands are immediately unavailable

### `ashep plugin-list`

List all installed plugins and their status.

**Usage:**
```bash
ashep plugin-list
```

**Output:**
```
Installed plugins:
  openspec: ✅ Active
    Integration tools for OpenSpec proposals and Beads task management
  my-plugin: ❌ Invalid
    Plugin has configuration issues
```

## Configuration Files

For detailed configuration guides, see:
- [Agent Configuration](agents-config.md)
- [Main Configuration](config-config.md)
- [Policy Configuration](policies-config.md)

### `.agent-shepherd/config/agents.yaml`

Agent registry (automatically maintained by `ashep sync-agents`):

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
      agent_type: primary  # primary or subagent

  - id: explore
    name: "Exploration Agent"
    description: "Handles code exploration and analysis"
    capabilities: [exploration, analysis, discovery]
    provider_id: anthropic
    model_id: claude-3-5-sonnet-20241022
    priority: 8
    constraints:
      performance_tier: fast
    metadata:
      agent_type: subagent
```

### `.agent-shepherd/config/policies.yaml`

Workflow policy definitions:

```yaml
policies:
  default:
    name: "Default Workflow"
    phases:
      - name: plan
        capabilities: [planning, architecture]
        timeout_multiplier: 1.0
      - name: implement
        capabilities: [coding, refactoring]
        timeout_multiplier: 2.0
      - name: test
        capabilities: [testing, qa]
        timeout_multiplier: 1.5
      - name: review
        capabilities: [review, documentation]
        require_approval: true

    retry:
      max_attempts: 3
      backoff_strategy: exponential
      initial_delay_ms: 5000
      max_delay_ms: 300000

    timeout_base_ms: 300000
    stall_threshold_ms: 60000
    require_hitl: false

default_policy: default
```

### `.agent-shepherd/config/agents.yaml`

Agent registry (automatically maintained by `ashep sync-agents`):

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
      agent_type: primary  # primary or subagent

  - id: explore
    name: "Exploration Agent"
    description: "Handles code exploration and analysis"
    capabilities: [exploration, analysis, discovery]
    provider_id: anthropic
    model_id: claude-3-5-sonnet-20241022
    priority: 8
    constraints:
      performance_tier: fast
    metadata:
      agent_type: subagent
```

## Model Override Support

Agent Shepherd supports overriding the model specified in OpenCode agent configurations. This allows policies to use different models for the same agent based on task requirements.

### Usage in Policies

```yaml
phases:
  - name: complex-implementation
    agent: build
    model: anthropic/claude-3-5-sonnet-20241022  # High capability for complex tasks

  - name: simple-refactoring
    agent: build
    model: anthropic/claude-3-5-haiku-20241022   # Fast and cost-effective for simple tasks
```

### Benefits

- **Cost Optimization**: Use appropriate models for task complexity
- **Performance Tuning**: Balance speed vs. capability
- **Resource Management**: Match model requirements to task needs

## REST API

The UI server provides a REST API:

### `GET /api/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-20T10:00:00.000Z"
}
```

### `GET /api/runs`

Get current agent runs.

**Response:**
```json
[
  {
    "id": "run-1",
    "issueId": "agent-shepherd-001",
    "agentId": "bmad-master",
    "phase": "implementation",
    "status": "completed",
    "startTime": "2025-12-20T10:00:00Z",
    "endTime": "2025-12-20T10:45:00Z",
    "sessionId": "session-abc123",
    "outcome": "Successfully implemented core modules"
  }
]
```

### `GET /api/phases`

Get workflow phases.

**Response:**
```json
[
  {
    "id": "planning",
    "name": "Planning Phase",
    "status": "idle"
  },
  {
    "id": "implementation",
    "name": "Implementation Phase",
    "status": "active"
  }
]
```

## Exit Codes

- `0`: Success
- `1`: Error (missing arguments, validation failure, etc.)
- `130`: Interrupted (Ctrl+C)

## Environment Variables

- `AGENT_SHEPHERD_CONFIG`: Override config directory path
- `AGENT_SHEPHERD_PORT`: Override UI port (alternative to --port)
- `AGENT_SHEPHERD_HOST`: Override UI host (alternative to --host)

## Troubleshooting

### Common Issues

**"Configuration validation failed"**
- Run `ashep init` to create missing config files
- Run `ashep sync-agents` to ensure agent registry is up to date
- Check YAML syntax in `.agent-shepherd/config/` files
- Verify required fields are present

**"Beads not installed"**
- Install Beads CLI: `curl -fsSL https://get.beads.dev | bash`
- Add to PATH: `export PATH="$HOME/.beads/bin:$PATH"`

**"OpenCode connection failed"**
- Verify OpenCode is running
- Check network connectivity
- Validate authentication credentials

**"UI server won't start"**
- Check if port is already in use: `lsof -i :3000`
- Try different port: `ashep ui --port 8080`
- Verify firewall allows connections

### Debug Mode

Set environment variable for verbose logging:
```bash
DEBUG=agent-shepherd ashep worker
```

### Log Files

Logs are stored in:
- `.agent-shepherd/logs/` - Application logs
- Individual run logs in JSONL format
- SQLite database for fast queries