# Agent Shepherd CLI Reference

## Command Overview

Agent Shepherd provides a comprehensive CLI for managing the orchestration system. All commands are run via `ashep <command> [options]`.

**Important Note:**
Agent Shepherd now uses **OpenCode SDK** for reliable agent execution by default. The legacy CLI execution mode is deprecated and will be removed in a future version. See [Configuration](#execution-configuration) for details.

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
ashep worker --epic PROJ-123
ashep worker --policy test-policy
ashep worker --epic PROJ-123 --policy test-policy
```

**Options:**
- `--epic <id>`: Restrict the worker to only process issues within a specific epic's subtree. Useful for focused testing or phased rollouts.
- `--policy <name>`: Force all processed issues to use the specified policy, overriding any labels or default mappings. Useful for testing new workflow logic.

**Behavior:**
- Polls Beads for ready issues every 30 seconds (configurable)
- Processes up to 3 concurrent issues (configurable)
- Automatically selects agents and manages workflow phases
- Handles retries and failures according to policy
- Runs indefinitely until interrupted (Ctrl+C)
- If `--epic` is provided, it applies the smart picker logic specifically to that epic's scope.
- If `--policy` is provided, it forces that policy for all issues. Priority order: CLI Flag > Beads Label > Issue Type > Default.

**Output:**
```
Starting Agent Shepherd Worker...
🔍 Scope restricted to epic subtree: PROJ-123
🔒 Forcing policy: test-policy
Processing issue: ISSUE-123 - Implement user authentication
Using policy 'test-policy' (CLI override) at phase 'plan'
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

### `ashep work [issue-id]`

Process an issue, optionally auto-picking the next ready issue if none specified.

**Usage:**
```bash
# Auto-pick next ready issue (uses config: simple/smart)
ashep work
# Process specific issue
ashep work ISSUE-123
# Process entire epic subtree (single pass)
ashep work --epic EPIC-123
```

**Options:**
- `--epic <id>`: Process all ready issues in an epic's subtree. Note: This runs a single pass (concurrency limit applies) using the configured picker logic (simple/smart) filtered to the epic. It does not loop continuously like `ashep worker`.

**Note:** Manual `work` commands operate outside the automated worker loop and bypass the `max_concurrent_runs` limit configured in `config.yaml`. Running multiple manual commands simultaneously may exceed your system or API limits.

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

## Listing Commands

### `ashep list-active`

List all ashep-managed issues that are currently active (open or in_progress status).

**Usage:**
```bash
ashep list-active
```

**Behavior:**
- Queries Beads for issues with `ashep-managed` label
- Filters for issues with status `open` or `in_progress`
- Displays phase information extracted from `ashep-phase:` labels
- Shows worker assignment from coordination state (when smart picking is enabled)
- Shows priority, last update time
- Handles empty results gracefully

**Output:**
```
Active Issues (3):
┌──────────┬─────────────────────────────────┬──────────────┬──────────┬────────────┬──────────────┐
│ ID       │ Title                           │ Phase        │ Worker   │ Priority   │ Updated      │
├──────────┼─────────────────────────────────┼──────────────┼──────────┼────────────┼──────────────┤
│ bd-42    │ Fix authentication bug          │ implement    │ worker-1 │ P1         │ 2m ago       │
│ bd-87    │ Add user settings              │ test         │ worker-2 │ P2         │ 15m ago      │
│ bd-91    │ Database migration             │ plan         │ -        │ P1         │ 1h ago       │
└──────────┴─────────────────────────────────┴──────────────┴──────────┴────────────┴──────────────┘

Legend:
  Worker: Worker assigned via coordination (epoch_id→assigned-worker state)
  -       : No worker assigned (simple mode or unclaimed epic)
```

**Options:**
- `--format table|json`: Output format (default: table)
- `--worker <id>`: Filter by specific worker

```bash
# Filter by worker
ashep list-active --worker worker-1

# JSON output for scripting
ashep list-active --format json
```

### `ashep list-hitl`

List issues requiring human-in-the-loop (HITL) intervention.

**Usage:**
```bash
ashep list-hitl
```

**Behavior:**
- Queries all Beads issues
- Filters for issues with `ashep-hitl:` labels
- Displays HITL reason, current phase, and status
- Useful for identifying issues that need human attention

**Output:**
```
HITL Issues (1):
┌─────────┬─────────────────────────────────┬──────────────┬─────────┬──────────────────┐
│ ID      │ Title                           │ Reason       │ Phase    │ Status          │
├─────────┼─────────────────────────────────┼──────────────┼─────────┼──────────────────┤
│ bd-123  │ Complex API integration         │ approval     │ review   │ open            │
└─────────┴─────────────────────────────────┴──────────────┴─────────┴──────────────────┘
```

### `ashep list-ready`

List ashep-managed issues ready to be worked on (open status only, no blockers).

**Usage:**
```bash
ashep list-ready
```

**Behavior:**
- Queries Beads for issues with `ashep-managed` label
- Filters for issues with status `open`
- Shows issues that are not blocked and ready for worker pickup
- Displays phase, priority, and last update time

**Output:**
```
Ready Issues (1):
┌─────────┬─────────────────────────────────┬──────────────┬─────────┬──────────────┐
│ ID      │ Title                           │ Phase        │ Priority │ Updated      │
├─────────┼─────────────────────────────────┼──────────────┼─────────┼──────────────┤
│ bd-99   │ Implement caching              │ plan         │ P1       │ 5m ago       │
└─────────┴─────────────────────────────────┴──────────────┴─────────┴──────────────┘
```

### `ashep list-struggle [hours]`

List problematic/struggling issues (blocked, HITL, or stale).

**Usage:**
```bash
ashep list-struggle           # Default: 24 hours
ashep list-struggle 48       # Custom threshold: 48 hours
```

**Options:**
- `hours` (optional): Stale threshold in hours (default: 24)

**Behavior:**
- Identifies ashep-managed issues that are:
  - Blocked status
  - Have `ashep-hitl:` labels
  - Not updated within specified hours
- Useful for identifying issues that need human intervention
- Customizable stale threshold

**Output:**
```
Struggling Issues (3):
┌─────────┬─────────────────────────────────┬──────────────┬──────────────┬─────────┬──────────────────┐
│ ID      │ Title                           │ Issue Type  │ Phase        │ Status   │ Age/Reason      │
├─────────┼─────────────────────────────────┼──────────────┼──────────────┼─────────┼──────────────────┤
│ bd-45   │ Database migration             │ blocked     │ test         │ blocked  │ blocked         │
│ bd-78   │ Performance regression         │ hitl        │ fix      │ review   │ approval        │
│ bd-91   │ Legacy code cleanup          │ stale       │ review   │ 72h old        │
└─────────┴─────────────────────────────────┴──────────────┴──────────────┴─────────┴──────────────────┘
```

### `ashep phase-msg-list <issue-id> [--phase <phase>] [--unread]`

List messages sent by the Phase Messenger between workflow phases.

**Aliases:** `get-messages`

**Usage:**
```bash
ashep phase-msg-list ISSUE-123                                    # All messages
ashep phase-msg-list ISSUE-123 --phase test                      # Specific phase
ashep phase-msg-list ISSUE-123 --unread                           # Unread only
ashep phase-msg-list ISSUE-123 --phase test --unread           # Combined
```

**Options:**
- `issue-id` (required): Issue identifier
- `--phase <phase>` (optional): Filter messages by destination phase
- `--unread` (optional): Show only unread messages

**Behavior:**
- Retrieves messages from the Phase Messenger system
- Messages include: context, results, decisions, and data
- Messages are automatically sent between phases during workflow execution
- Useful for debugging workflows and verifying phase communication

**Output:**
```
Messages (2):
┌─────────────────┬───────────┬───────────┬─────────────────────────────────────┬─────────┬──────────────┐
│ ID              │ Type      │ Read      │ Content                          │ From    │ To           │
├─────────────────┼───────────┼───────────┼─────────────────────────────────────┼─────────┼──────────────┤
│ msg-1234567890  │ context   │ ✓         │ Planning completed                │ plan     │ implement    │
│ msg-9876543210  │ result    │ ✗         │ Tests passed                   │ test     │ deploy      │
└─────────────────┴───────────┴───────────┴─────────────────────────────────────┴─────────┴──────────────┘
```

### `ashep phase-msg-read <message-id>`

Read the full content and metadata of a specific phase message.

**Aliases:** `read-message`

**Usage:**
```bash
ashep phase-msg-read msg-1234567890
```

**Behavior:**
- Fetches full details of a single message
- Displays metadata, sender, timestamps, and full text content
- Useful for inspecting large payloads that are truncated in list view


### `ashep list-sessions <issue-id>`

List OpenCode sessions associated with an issue.

**Usage:**
```bash
ashep list-sessions ISSUE-123
```

**Behavior:**
- Queries OpenCode for all sessions associated with the issue
- Displays session ID, title, phase, and token count
- Useful for monitoring session continuation and token usage
- Helps identify which phases reused sessions

**Output:**
```
Sessions for issue ISSUE-123 (2):
┌───────────────────────────────────────┬───────────────────────────────────────────────┬──────────────┬──────────┐
│ Session ID                            │ Title                                     │ Phase        │ Tokens   │
├───────────────────────────────────────┼───────────────────────────────────────────────┼──────────────┼──────────┤
│ session-abc123def456...               │ Implement user authentication              │ implement    │ 85000    │
│ session-xyz789abc012...               │ Test user authentication                   │ test         │ 42000    │
└───────────────────────────────────────┴───────────────────────────────────────────────┴──────────────┴──────────┘
```

**Empty Output:**
```
No sessions found for issue ISSUE-456
```

### Use Cases

- **Debug workflow issues**: Verify sessions are being reused correctly
- **Monitor token usage**: Track accumulated context across phases
- **Audit session continuity**: Ensure multi-phase workflows maintain context
- **Optimize workflows**: Identify phases that may benefit from session continuation

## Session Commands

### `ashep session-list`

List active OpenCode sessions. By default, it uses smart filtering to show only sessions that are currently running or have recent activity.

**Usage:**
```bash
ashep session-list
ashep session-list --all
```

**Options:**
- `--all`: Show all sessions (history), not just active ones.

**Output:**
```
Active Sessions (2):
┌───────────────────────────────────────┬───────────────────────────────────────────────┬──────────────────────┬─────────────┐
│ Session ID                            │ Title                                         │ Updated              │ Status      │
├───────────────────────────────────────┼───────────────────────────────────────────────┼──────────────────────┼─────────────┤
│ ses_4361d9304ffezUGZULVfrBW7wG        │ astro-test-cg3.7.1: Step 9: Create validation... │ 1/17/2026, 3:57:32 AM │ Active      │
└───────────────────────────────────────┴───────────────────────────────────────────────┴──────────────────────┴─────────────┘
```

**Filtering Logic:**
Sessions are considered "active" if:
1. OpenCode reports their status as 'busy' or 'retry'.
2. OR they were created or updated within the last 5 minutes (fallback if status API is unavailable).

### `ashep session-stop <session-id>`

Abort/Stop a specific OpenCode session. Useful for stopping runaway agents or cleaning up stuck sessions.

**Usage:**
```bash
ashep session-stop ses_4361d9304ffezUGZULVfrBW7wG
```

**Behavior:**
- Sends an abort signal to the OpenCode server for the specified session.
- Returns success or failure message.

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

## Coordination Commands

### `ashep heartbeat status`

Display the status of the heartbeat checker daemon and session monitoring.

**Usage:**
```bash
ashep heartbeat status
```

**Behavior:**
- Shows whether heartbeat checker is running
- Displays current configuration (poll_interval_ms, stale_threshold_ms)
- Shows statistics: total sessions checked, alive sessions, stale sessions, errors
- Lists monitored epics with their last heartbeat timestamps

**Output:**
```
Heartbeat Checker Status:
  Running: true
  Config:
    poll_interval_ms: 30000
    stale_threshold_ms: 300000
  Stats:
    total_checked: 150
    alive_sessions: 145
    stale_sessions: 5
    error_count: 0

Monitored Epics:
  epic-123: last heartbeat 45s ago (alive)
  epic-456: last heartbeat 6m ago (STALE)
```

### `ashep heartbeat start`

Start the heartbeat checker daemon for session monitoring.

**Usage:**
```bash
ashep heartbeat start
ashep heartbeat start --poll-interval 60000
```

**Options:**
- `--poll-interval <ms>`: Polling interval in milliseconds (default: 30000)
- `--stale-threshold <ms>`: Threshold in ms to consider heartbeat stale (default: 300000)

**Behavior:**
- Starts background daemon that monitors active sessions
- Updates Beads state with last heartbeat timestamps
- Detects abandoned sessions based on activity
- Emits events for monitoring integration

### `ashep heartbeat stop`

Stop the heartbeat checker daemon.

**Usage:**
```bash
ashep heartbeat stop
```

### `ashep coordination status`

Display the current coordination state for epics and workers.

**Usage:**
```bash
ashep coordination status
ashep coordination status --epic epic-123
ashep coordination status --worker worker-1
```

**Options:**
- `--epic <id>`: Filter by specific epic ID
- `--worker <id>`: Filter by specific worker ID

**Output:**
```
Coordination State:
  Total Managed Epics: 5
  Active Workers: 2

Epic Assignments:
  epic-123: worker-1 (lease expires in 25m, heartbeat 45s ago)
  epic-456: worker-2 (lease expired, ABANDONED)
  epic-789: worker-1 (lease expires in 28m, heartbeat 2m ago)

Abandoned Epics:
  epic-456: Detected 5m ago, recoverable
```

### `ashep coordination claim <epic-id>`

Manually claim an epic for the current worker.

**Usage:**
```bash
ashep coordination claim epic-123
```

**Behavior:**
- Claims the epic for the current worker (ASHEP_WORKER_ID)
- Sets lease expiration timestamp
- Checks for abandonment and recovers if needed
- Updates coordination state in Beads

### `ashep coordination release <epic-id>`

Release a claimed epic, making it available for other workers.

**Usage:**
```bash
ashep coordination release epic-123
```

**Behavior:**
- Clears the assigned worker from the epic
- Removes lease expiration
- Epic becomes available for other workers to claim

### `ashep coordination recover <epic-id>`

Manually trigger recovery of an abandoned epic.

**Usage:**
```bash
ashep coordination recover epic-123
```

**Behavior:**
- Detects if epic is truly abandoned (heartbeat stale or lease expired)
- Recovers any active runs in the epic subtree
- Claims the epic for the current worker
- Logs recovery decision

### `ashep picking status`

Display the current issue picker configuration and mode.

**Usage:**
```bash
ashep picking status
```

**Output:**
```
Issue Picker Status:
  Mode: smart
  Max Issues: 3
  Epic Affinity: true
  Coordination Mode: hybrid

Recent Picks:
  epic-123.1: priority=1, depth=1, epic=123
  epic-456.2: priority=2, depth=2, epic=456
  epic-789.1: priority=1, depth=1, epic=789
```

### `ashep picking mode <simple|smart>`

Switch the issue picker mode at runtime.

**Usage:**
```bash
ashep picking mode simple
ashep picking mode smart
```

**Behavior:**
- `simple`: Priority-based selection without dependency awareness
- `smart`: Dependency-aware selection with epic affinity
- Change takes effect on next pick cycle
- Mode stored in configuration for persistence

### Configuration Options

The following configuration options control coordination behavior in `config/config.yaml`:

```yaml
worker:
  picking:
    mode: "smart"           # "simple" | "smart"
    max_issues: 3           # Max issues to pick per cycle
    prefer_epic_affinity: true  # Maintain epic ownership
  coordination:
    mode: "hybrid"          # "lease" | "heartbeat" | "hybrid"
    lease_duration_ms: 1800000  # 30 minutes
  checker:
    enabled: true           # Enable heartbeat checker daemon
    poll_interval_ms: 30000 # Heartbeat check interval
    heartbeat_threshold_ms: 300000  # 5 minutes stale threshold
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
- Ensure SDK mode is enabled (default: `mode: sdk` in config)
- If using CLI mode, consider switching to SDK mode for better reliability

**"Agent execution unreliable"**
- Check execution mode in `.agent-shepherd/config/config.yaml`
- Ensure SDK mode is enabled: `worker.execution.mode: sdk`
- CLI mode is deprecated and less reliable; switch to SDK mode

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