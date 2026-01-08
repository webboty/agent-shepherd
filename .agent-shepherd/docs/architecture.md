# Agent Shepherd Architecture

## Overview

Agent Shepherd is a sophisticated orchestration system designed to coordinate AI coding agents across the software development lifecycle. It bridges the gap between issue tracking (Beads), agent execution (OpenCode), and human oversight through intelligent workflow management.

## Core Architecture

### System Components

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
                     │ Policy Capability   │
                     │ Validator           │
                     │ (Chain Integrity)   │
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
                                  │
                     ┌─────────────────────┐
                     │  Logging System     │
                     │ (Audit Trail)       │
                     └─────────────────────┘
                                  │
                     ┌─────────────────────┐
                     │  UI Layer           │
                     │ (Visualization)     │
                     └─────────────────────┘
                                  │
                     ┌─────────────────────┐
                     │  Plugin System      │
                     │ (Extensions)        │
                     └─────────────────────┘
```

### Data Flow

 1. **Issue Discovery**: Worker Engine polls Beads for ready issues
2. **Label-Based Policy Resolution**: Policy Engine determines appropriate workflow using label triggers
    - **Explicit workflow label** (`ashep-workflow:<name>`): Highest priority, direct policy assignment
    - **Issue type matching**: Automatic matching based on policy `issue_types` arrays
    - **Priority ordering**: Higher priority policies win when multiple match same issue type
    - **Default policy**: Fallback when no label or type match
3. **Phase Tracking**: Worker reads `ashep-phase:<name>` label to resume from current phase
4. **HITL State Management**: Worker checks `ashep-hitl:<reason>` label for human intervention requirements
5. **Exclusion Control**: Worker skips issues with `ashep-excluded` label
6. **Agent Selection**: Agent Registry finds best agent for current phase
    - **Fallback Agent Selection**: When no agent has a capability, uses cascading fallback hierarchy (global → policy → phase) to select appropriate fallback agent

### Capability-Based Matching with Fallback

Agents are selected based on:
- Required capabilities for current phase
- Agent priority scores
- Performance tier constraints
- **Fallback hierarchy** (if no agents have capability):
  1. **Global Level** (`config.yaml`): System-wide default
  2. **Policy Level** (`policies.yaml`): Policy-specific override
  3. **Phase Level** (`policies.yaml`): Phase-specific override

Selection logic:
1. Try to find agents with required capability
2. If agents found, select highest priority (active agent preferred)
3. If no agents found, check fallback hierarchy:
   - Phase level: Use `phase.fallback_agent` if set
   - Policy level: Use `policy.fallback_mappings[capability]` if set
   - Global level: Use `config.fallback.mappings[capability]` if set
   - Default: Use `policy.fallback_agent` or `config.fallback.default_agent`

4. Verify selected fallback agent is active
5. Log which fallback agent is being used
4. **Session Creation**: OpenCode client launches agent session
5. **Progress Monitoring**: Monitor Engine watches execution and detects stalls
6. **Outcome Recording**: Logging system captures results and updates issue status
7. **Enhanced Transition Decision**: For decision transitions, AI agent analyzes outcome and selects next phase from allowed destinations
8. **Loop Prevention Checks**: Validates phase visits, transition counts, and cycle detection before proceeding
9. **Phase Messenger Integration**: Automatically sends result messages to next phase if messaging enabled
10. **Visualization**: UI displays flow state and progress

## Key Design Decisions

### Dual Storage Pattern

The logging system uses both JSONL (source of truth) and SQLite (cache) for optimal performance:

- **JSONL**: Append-only, immutable audit trail
- **SQLite**: Indexed queries, fast lookups, aggregations

### Phase-Based Workflows

Policies define sequential phases with:
- Required agent capabilities
- Timeout multipliers
- Approval requirements
- Retry strategies
- **Label-based tracking** via `ashep-phase:<name>` labels
- **Resumption capability** from intermediate phases

### Label-Based Orchestration

Workflow management through Beads labels provides:
- **Visibility**: Current state visible in issue labels
- **Control**: Humans can manually set workflow labels
- **Resumption**: Worker can resume from any phase
- **Intervention**: HITL labels for human approval points
- **Exclusion**: Skip processing for specific issues

**Key Benefits**:
- State persists across worker restarts
- Issues can be manually paused/resumed
- Integration with Beads UI and CLI
- Audit trail in issue label history

### Capability-Based Matching

Agents are selected based on:
- Required capabilities for current phase
- Agent priority scores
- Performance tier preferences
- Availability status

### Label-Based Workflow System

Agent Shepherd uses Beads labels for workflow orchestration, providing visibility and control over issue processing:

#### Label Naming Conventions

| Label Format | Purpose | Auto-Managed |
|--------------|---------|---------------|
| `ashep-workflow:<name>` | Explicit workflow assignment | No (user-set) |
| `ashep-phase:<name>` | Current workflow phase | Yes (system) |
| `ashep-hitl:<reason>` | Human-in-the-loop state | Yes (system) |
| `ashep-excluded` | Exclude from processing | No (user-set) |

#### Trigger System Priority

1. **Explicit Workflow Label** (highest)
   - `ashep-workflow:security-audit` → Forces use of security-audit policy
   - Invalid label handling controlled by `workflow.invalid_label_strategy` config

2. **Issue Type Matching** (automatic)
   - Policy with `issue_types: ['bug']` matches bug issues
   - Multiple policies can match same type
   - Priority determines winner (config order breaks ties)

3. **Default Policy** (fallback)
   - Used when no label or type match
   - Specified in `default_policy` field

#### Phase Tracking

- Worker reads `ashep-phase:<name>` label on issue processing
- Resumes from current phase if label exists
- Updates label on phase transitions
- Clears label on workflow completion

#### Human-in-the-Loop (HITL) Management

- Worker checks `ashep-hitl:<reason>` label
- Pauses processing when HITL label present
- Validates HITL reasons against config:
  - Predefined list (`approval`, `manual-intervention`, etc.)
  - Custom reason validation (`alphanumeric`, `alphanumeric-dash-underscore`)
- Clears label after human resolution

#### Exclusion Control

- Issues with `ashep-excluded` label are skipped
- Worker logs skip message and continues to next issue
- Useful for issues requiring manual processing or testing

#### Label Lifecycle Example

```bash
# 1. Create issue
bd create --type feature --title "Add authentication"

# 2. Assign workflow (optional, overrides issue type)
bd update ISSUE-1 --labels "ashep-workflow:security-audit"

# 3. Worker starts processing
# System adds: ashep-phase:threat-modeling

# 4. Worker completes first phase
# System updates: ashep-phase:implementation

# 5. Approval required
# System adds: ashep-hitl:approval

# 6. Human reviews and approves
# System removes: ashep-hitl:approval
# System updates: ashep-phase:testing

# 7. Workflow completes
# System removes: ashep-phase:testing
```

### Chain Validation System

The Policy Capability Validator ensures workflow integrity by validating the complete policy → capability → agent relationship chain:

- **Dead End Detection**: Identifies capabilities without agents and policies without valid execution paths
- **Health Monitoring**: Tracks relationship health with status indicators (valid/warning/error)
- **Startup Validation**: Runs automatically during system startup to prevent broken configurations
- **Visual Diagnostics**: Tree visualization shows relationship status and identifies issues

### Enhanced Transitions System

Enhanced transitions enable AI-driven workflow routing with conditional branching and intelligent phase selection:

- **String Transitions**: Simple direct jumps between phases (e.g., `test → deploy`)
- **Decision Transitions**: AI agents analyze outcomes and select from `allowed_destinations`
- **Outcome-Based Routing**: Different transitions for success, failure, partial success, and unclear outcomes
- **Confidence Thresholds**: Automatic progression vs. human-in-the-loop decisions based on AI confidence scores
- **Phase Messaging**: Automatic data exchange between phases when messaging enabled

**Data Flow**:
1. Phase completes with outcome
2. Worker engine checks transition configuration
3. If decision transition: Launch AI decision agent with context
4. Decision agent returns selected phase and confidence
5. Confidence check determines auto-advance or HITL request
6. Loop prevention validates transition
7. Phase messenger sends result message (if enabled)
8. Workflow advances to selected phase

### Loop Prevention System

Loop prevention ensures workflows remain bounded and efficient through multiple protective mechanisms:

- **Phase Visit Limits**: Maximum number of visits per phase (e.g., test phase limited to 5 visits)
- **Transition Limits**: Maximum repetitions of specific phase-to-phase transitions (e.g., fix→test limited to 5 times)
- **Cycle Detection**: Pattern detection for oscillating transitions (e.g., A→B→A→B patterns)
- **HITL Escalation**: Automatic human-in-the-loop request when limits are reached

**Protection Layers**:
1. **Phase Visit Limits**: Track visits per phase, block if exceeded
2. **Transition Limits**: Track transition pairs, block if repeated too many times
3. **Cycle Detection**: Analyze recent transitions for oscillating patterns, block if detected
4. **HITL Escalation**: Add `ashep-hitl:loop-prevention` label when blocked

**Configuration Hierarchy**:
- Global defaults in `config.yaml` → Policy-level overrides → Phase-level overrides
- Per-phase `max_visits` can override global defaults for critical phases

### Decision Agent System

Decision agents are specialized AI agents that analyze workflow outcomes and make routing decisions:

- **Template-Based Prompts**: Structured prompts from `decision-prompts.yaml` or custom instructions
- **Context Injection**: Issue data, outcomes, phase history, and performance metrics
- **Constrained Routing**: Selection limited to `allowed_destinations` for safety
- **Confidence Scoring**: Agents provide 0.0-1.0 confidence scores for decisions
- **Analytics Tracking**: Decision patterns, confidence distributions, and approval rates tracked

**Decision Process**:
1. Triggered when phase completes with decision transition configured
2. System gathers context (issue, outcome, phase history, performance)
3. Decision prompt built from template or custom instructions
4. AI agent executes and returns structured response
5. Response validation ensures required fields and valid target phase
6. Confidence check determines automation level (auto-advance, approval, or escalation)
7. Decision logged for analytics and audit trail

**Decision Response Format**:
```json
{
  "decision": "advance_to_deploy",
  "reasoning": "All tests passed, coverage 95%, no critical issues",
  "confidence": 0.92,
  "recommendations": ["Monitor production metrics"]
}
```

### Phase Messenger System

Phase messenger enables inter-phase communication for context preservation and data exchange:

- **Message Types**: Context, result, decision, and data messages
- **Dual Storage**: JSONL (audit trail) + SQLite (fast queries)
- **Automatic Delivery**: Messages received when phase starts
- **Size Management**: Automatic cleanup when limits exceeded
- **Message Lifecycle**: Create → Send → Receive → Mark Read → Cleanup

**Message Flow**:
1. Phase A completes successfully with `messaging: true` enabled
2. System automatically sends result message to next phase
3. Message stored in both JSONL and SQLite
4. When Phase B starts, receives all unread messages
5. Messages marked as read automatically
6. Old messages cleaned up when size limits reached

**Storage Architecture**:
- **JSONL Source**: Append-only log of all messages (audit trail)
- **SQLite Cache**: Indexed database for fast queries and lookups
- **Synchronization**: JSONL → SQLite sync on startup, writes to both on creation

### Garbage Collection System

Garbage collection manages data lifecycle to maintain performance and storage efficiency:

- **Retention Policies**: Configurable rules for archiving and deletion
- **Archive Database**: Historical run data stored separately from active runs
- **Cleanup Operations**: Archive old runs, delete ancient data, enforce size limits
- **Metrics Tracking**: Record cleanup operations for monitoring
- **Message Cleanup**: Messages follow same retention as associated runs

**Cleanup Operations**:
1. **Archive Old Runs**: Move runs older than `archive_after_days` to archive database
2. **Delete Ancient Data**: Permanently remove runs older than `delete_after_days`
3. **Enforce Size Limits**: Remove oldest runs when exceeding `max_runs` or `max_size_mb`

**Data Flow**:
```
Active DB (runs.db)
  ↓ [age > archive_after_days]
Archive DB (archive/archive.db)
  ↓ [age > delete_after_days]
Deleted (permanently removed)
```

**Retention Policy Fields**:
- `age_days`: Age threshold for archiving
- `max_runs`: Maximum run count limit
- `max_size_mb`: Maximum database size limit
- `archive_enabled`: Whether to archive before delete
- `archive_after_days`: When to archive (overrides `age_days`)
- `delete_after_days`: When to permanently delete
- `status_filter`: Filter by run status
- `phase_filter`: Filter by phase name

### Tree Visualization

The Policy Tree Visualizer provides hierarchical views of relationships:

- **ASCII Tree**: Human-readable tree with status icons and metadata
- **JSON Export**: Programmatic access for tools and integrations
- **Status Indicators**: Visual cues for relationship health
- **Summary Statistics**: Overview of chain health and issue counts

### Human-in-the-Loop (HITL)

Support for human intervention at critical points:
- Approval gates for sensitive operations
- Manual override for stuck processes
- Escalation for complex decisions

## Component Details

### Policy Engine

Manages workflow definitions and transition logic:

```typescript
interface PolicyConfig {
  name: string;
  phases: PhaseConfig[];
  retry: RetryConfig;
  timeout_base_ms: number;
  require_hitl: boolean;
}

interface PhaseConfig {
  name: string;
  capabilities: string[];
  timeout_multiplier: number;
  require_approval: boolean;
}
```

### Agent Registry

Maintains agent capabilities and selection logic:

```typescript
interface AgentConfig {
  id: string;
  capabilities: string[];
  provider_id: string;
  model_id: string;
  priority: number;
  constraints: AgentConstraints;
}
```

### Worker Engine

Processes issues through workflow phases:

1. Poll for ready issues
2. Resolve policy and current phase
3. Select appropriate agent
4. Launch OpenCode session
5. Monitor progress
6. Handle completion/failure

### Monitor Engine

Provides supervision and intervention:

- **Stall Detection**: Identifies hung processes
- **Timeout Management**: Enforces phase deadlines
- **HITL Coordination**: Manages human approvals
- **Recovery**: Resumes interrupted runs

### UI Layer

ReactFlow-based visualization:

- **Flow Diagram**: Shows phases and transitions
- **Run Timeline**: Displays agent assignments
- **Session Links**: Direct access to OpenCode sessions
- **Real-time Updates**: Live progress monitoring

## Configuration Management

### JSON Schema Validation

All configuration files are validated against JSON schemas:
- `schemas/config.schema.json` - Main configuration
- `schemas/policies.schema.json` - Workflow policies
- `schemas/agents.schema.json` - Agent registry
- `schemas/run-outcome.schema.json` - Execution results

### Startup Validation

Configuration is validated at startup to catch errors early:
- Schema compliance
- Required fields
- Cross-reference integrity
- Environment compatibility

## Error Handling & Recovery

### Retry Strategies

- Exponential backoff for transient failures
- Configurable retry limits
- Failure classification (retryable vs permanent)

### Recovery Mechanisms

- Session resumption after restarts
- Partial completion handling
- State reconstruction from logs

### Monitoring & Alerting

- Health checks for all components
- Performance metrics collection
- Issue escalation paths

## Security Considerations

### Agent Isolation

- Each agent runs in isolated OpenCode sessions
- No direct file system access
- Sandboxed execution environment

### Configuration Security

- Sensitive data validation
- Path traversal prevention
- Input sanitization

### Audit Trail

- Complete execution history
- Agent action logging
- Human intervention records

## Performance Characteristics

### Scalability

- Concurrent issue processing (configurable limit)
- Efficient polling strategies
- Database indexing for fast queries

### Resource Management

- Memory-efficient logging
- Connection pooling for external services
- Graceful degradation under load

### Monitoring Overhead

- Minimal performance impact
- Configurable monitoring frequency
- Batch operation support

## Plugin System

Agent Shepherd includes a robust plugin system for extending functionality without modifying core code:

### Plugin Architecture

The plugin system supports:
- **Dynamic Loading**: Automatic discovery and loading from `.agent-shepherd/plugins/`
- **Command Registration**: Plugins can add new CLI commands
- **Isolated Execution**: Plugins run in their own context
- **Simple Structure**: Minimal boilerplate for plugin development

### Current Plugin Extensions

- **Agent Providers**: Custom AI agent integrations
- **Workflow Phases**: Additional processing steps
- **Monitoring Rules**: Custom supervision logic
- **UI Components**: ReactFlow visualization extensions
- **Integration Tools**: External system connectors (e.g., OpenSpec)

For detailed plugin development information, see [docs/plugin-system.md](../docs/plugin-system.md).

## Future Extensions

### Advanced Orchestration

- Parallel phase execution
- **Conditional branching** (implemented - see [Enhanced Transitions](./enhanced-transitions.md))
- Dynamic policy selection
- ML-based agent selection

### Integration APIs

- REST API for external tools
- Webhook notifications
- Event streaming
- GraphQL interface

## Deployment Patterns

### Single Instance

Simple setup for individual developers:
- Local Beads instance
- Direct OpenCode connection
- SQLite for persistence

### Multi-Instance

Scalable deployment for teams:
- Shared Beads server
- Load-balanced workers
- Distributed SQLite or PostgreSQL

### Cloud Deployment

Enterprise-grade deployment:
- Kubernetes orchestration
- Cloud databases
- Service mesh integration
- Monitoring dashboards