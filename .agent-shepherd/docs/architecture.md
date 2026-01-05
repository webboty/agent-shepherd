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
2. **Policy Resolution**: Policy Engine determines appropriate workflow
3. **Agent Selection**: Agent Registry finds best agent for current phase
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
7. **Visualization**: UI displays flow state and progress

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

### Capability-Based Matching

Agents are selected based on:
- Required capabilities for current phase
- Agent priority scores
- Performance tier preferences
- Availability status

### Chain Validation System

The Policy Capability Validator ensures workflow integrity by validating the complete policy → capability → agent relationship chain:

- **Dead End Detection**: Identifies capabilities without agents and policies without valid execution paths
- **Health Monitoring**: Tracks relationship health with status indicators (valid/warning/error)
- **Startup Validation**: Runs automatically during system startup to prevent broken configurations
- **Visual Diagnostics**: Tree visualization shows relationship status and identifies issues

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
- Conditional branching
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