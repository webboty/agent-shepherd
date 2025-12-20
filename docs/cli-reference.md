# Agent Shepherd CLI Reference

## Command Overview

Agent Shepherd provides a comprehensive CLI for managing the orchestration system. All commands are run via `ashep <command> [options]`.

## Core Commands

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
- Creates `.agent-shepherd/` directory
- Generates default configuration files:
  - `config.yaml` - Main settings
  - `policies.yaml` - Workflow definitions
  - `agents.yaml` - Agent registry
- Skips existing files to avoid overwriting

**Output:**
```
Initializing Agent Shepherd configuration...
Created directory: /path/to/project/.agent-shepherd
Created: /path/to/project/.agent-shepherd/config.yaml
Created: /path/to/project/.agent-shepherd/policies.yaml
Created: /path/to/project/.agent-shepherd/agents.yaml

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

Update the agent registry from OpenCode.

**Usage:**
```bash
ashep sync-agents
```

**Behavior:**
- Queries OpenCode for available agents
- Updates local `agents.yaml` with new/updated agents
- Preserves existing agent configurations
- Reports changes made

**Output:**
```
Syncing agents with OpenCode...

Sync complete:
  Added: 3
  Updated: 2
  Removed: 1
```

## Configuration Files

### `.agent-shepherd/config.yaml`

Main configuration file:

```yaml
version: "1.0"

worker:
  poll_interval_ms: 30000      # Issue polling frequency
  max_concurrent_runs: 3       # Concurrent processing limit

monitor:
  poll_interval_ms: 10000      # Monitoring frequency
  stall_threshold_ms: 60000    # Stall detection threshold
  timeout_multiplier: 1.0      # Base timeout multiplier

ui:
  port: 3000                   # UI server port
  host: localhost              # UI server host
```

### `.agent-shepherd/policies.yaml`

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

### `.agent-shepherd/agents.yaml`

Agent registry:

```yaml
version: "1.0"
agents:
  - id: default-coder
    name: "Default Coding Agent"
    capabilities: [coding, refactoring, planning]
    provider_id: anthropic
    model_id: claude-3-5-sonnet-20241022
    priority: 10
    constraints:
      performance_tier: balanced
```

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
- Check YAML syntax in configuration files
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