# Issue Container Handling - User Guide

The Smart Issue Container Handling System provides intelligent management of epics and parent tasks, automatically detecting issue containers and applying appropriate handling policies based on hierarchy level and configuration.

## Overview

**Issue Container Handling** automatically manages organizational issues that contain subtasks but don't have their own implementation work. An **issue container** is an epic, milestone, or parent task that groups related work items together.

The system:

- **Detects issue containers** using multi-factor analysis (type, children, description, structure)
- **Applies policies** based on hierarchy depth (level 1 epics, level 2 sub-epics, etc.)
- **Handles closure** automatically or with human/AI validation
- **Orders tasks** intelligently using dependency and hierarchy information

## What is an Issue Container?

An **issue container** is an organizational issue that:

- **Groups related work**: Contains subtasks that represent actual implementation work
- **Has no direct function**: The container itself doesn't require implementation work
- **Tracks progress**: Represents completion of grouped subtasks
- **Common types**: Epics, milestones, phases, or parent tasks

**Example:**
```
EPIC-123 (Issue Container)
  ├── TASK-123.1 (Implementation task)
  ├── TASK-123.2 (Implementation task)
  └── TASK-123.3 (Implementation task)
```

The **EPIC-123** issue container doesn't require coding work itself - it's complete when all its subtasks (TASK-123.1, 123.2, 123.3) are completed.

**Note:** This is **not** related to Docker containers or software containers. "Container" refers to an issue that contains (wraps) other issues.

## Quick Start

### Basic Configuration

Add the `container_handling` section to your `config/config.yaml`:

```yaml
container_handling:
  enabled: true
  default_mode: auto-close
  level_policies:
    "1":
      mode: auto-close
  ordering:
    strategy: hybrid
```

### Enable Issue Container Handling

The system is disabled by default. Set `enabled: true` to activate:

```yaml
container_handling:
  enabled: true
```

## Configuration

### Master Switch

```yaml
container_handling:
  enabled: true  # Enable or disable the entire system
```

### Default Handling Mode

```yaml
container_handling:
  default_mode: auto-close  # "auto-close" | "hitl" | "validate"
```

The default mode applies to all issue containers that don't have a level-specific policy override.

## Handling Modes

### Auto-Close Mode

Automatically closes containers when all subtasks are complete.

```yaml
container_handling:
  default_mode: auto-close
```

**When to use:**
- Simple task hierarchies
- Trusted automated workflows
- When subtask completion guarantees container completion

**Behavior:**
1. Detects when all children are closed
2. Automatically closes the issue container
3. No human intervention required

### HITL Mode

Requires human validation before closing containers.

```yaml
container_handling:
  default_mode: hitl
```

**When to use:**
- Critical business workflows
- Compliance requirements
- Complex decision points
- When containers need manual review

**Behavior:**
1. Detects when all children are complete
2. Sets `ashep-hitl:container-validation` label
3. Waits for human review
4. Issue container only closes after manual approval

### Validate Mode

Uses AI to validate container completion, potentially triggering additional workflows.

```yaml
container_handling:
  default_mode: validate
  level_policies:
    "1":
      mode: validate
      workflow_override: epic-review  # Optional specific workflow
```

**When to use:**
- High-value containers
- When automated validation is preferred
- When containers might need additional work
- Complex technical epics

**Behavior:**
1. Detects when all children are complete
2. Uses AI agent with `container-validation` capability
3. AI evaluates if issue container is truly complete
4. Possible outcomes:
   - **DONE**: Issue container closes automatically
   - **NEEDS_WORK**: Triggers specified workflow on container
   - **UNCLEAR**: Escalates to HITL

## Hierarchy-Level Policies

Configure different handling for different hierarchy depths:

```yaml
container_handling:
  level_policies:
    "1":
      mode: validate
      workflow_override: epic-review  # For top-level epics
    "2":
      mode: hitl  # For sub-epics
    "3":
      mode: auto-close  # For deep subtasks
```

### Hierarchy Levels

Hierarchy levels are determined by Beads ID structure:

```
project-1            # Level 1 (top-level epic)
project-1.1          # Level 2 (sub-epic)
project-1.1.1        # Level 3 (sub-subtask)
project-1.1.1.1      # Level 4
```

### Workflow Overrides

When using `validate` mode, you can specify a custom workflow to trigger if validation fails:

```yaml
container_handling:
  level_policies:
    "1":
      mode: validate
      workflow_override: critical-epic-review  # Custom workflow
```

If validation determines the container needs more work, the system will:
1. Start the `critical-epic-review` workflow on the container
2. Process the container as a regular task
3. Resume validation after the workflow completes

## Smart Ordering

Configure how the system orders issues within containers:

```yaml
container_handling:
  ordering:
    strategy: hybrid  # "dependency" | "hierarchy" | "hybrid"
    prefer_depth: 1
    dependency_weight: 0.7
```

### Ordering Strategies

#### Dependency Strategy

Orders issues based solely on dependency relationships:

```yaml
ordering:
  strategy: dependency
```

**Behavior:**
- Performs topological sort
- Respects all dependency constraints
- May fail with circular dependencies

**When to use:**
- Well-defined dependency graphs
- Strict ordering requirements
- Minimal hierarchy depth

#### Hierarchy Strategy

Orders issues based on hierarchy depth:

```yaml
ordering:
  strategy: hierarchy
  prefer_depth: 1  # Prefer deeper issues
```

**Behavior:**
- Processes deeper issues first
- Ignores dependencies
- Consistent ordering even with missing dependencies

**When to use:**
- Sparse or incomplete dependencies
- Deep hierarchies
- When depth is more important than dependencies

#### Hybrid Strategy (Recommended)

Combines dependency and hierarchy ordering:

```yaml
ordering:
  strategy: hybrid
  prefer_depth: 1
  dependency_weight: 0.7  # 70% dependency, 30% hierarchy
```

**Behavior:**
- Primary: Topological sort using dependencies
- Fallback: Depth-based ordering when dependencies incomplete
- Weighted scoring to break ties
- Most reliable for real-world scenarios

**When to use:**
- Most production environments
- Mixed dependency coverage
- Need for robustness

### Ordering Parameters

#### prefer_depth

How much to prioritize depth when breaking ties (1-10):

```yaml
ordering:
  prefer_depth: 3  # Higher = stronger preference for deeper issues
```

#### dependency_weight

Weight for dependency ordering in hybrid mode (0.0-1.0):

```yaml
ordering:
  dependency_weight: 0.5  # Equal weight for dependency and hierarchy
```

## Issue Container Detection

Configure how the system identifies containers:

```yaml
container_handling:
  container_detection:
    check_children: true
    check_description: true
    check_dependencies: true
    min_children: 2
```

### Detection Factors

The system uses four factors to detect containers:

1. **Issue Type** - Strong indicator (40% confidence)
   - Types: `epic`, `milestone`, `phase`, `group`

2. **Children Count** - Strong indicator (30% confidence)
   - Must meet `min_children` threshold
   - Uses parent-child dependencies

3. **Description Language** - Medium indicator (20% confidence)
   - Pattern: "subtasks", "components", "tasks"
   - Phrases: "includes", "contains", "comprises"

4. **Dependency Structure** - Medium indicator (10% confidence)
   - Parent-child dependency patterns
   - Container-like relationship structure

### Confidence Threshold

An issue is considered a container if confidence >= 0.5 (50%).

### Minimizing False Positives

```yaml
container_detection:
  min_children: 3  # Require more children to be considered
  check_description: false  # Skip language matching
```

## Configuration Examples

### Simple Auto-Close Setup

Perfect for straightforward project hierarchies:

```yaml
container_handling:
  enabled: true
  default_mode: auto-close
  ordering:
    strategy: hybrid
```

### Critical Workflows with HITL

For high-value epics requiring human review:

```yaml
container_handling:
  enabled: true
  default_mode: auto-close
  level_policies:
    "1":
      mode: hitl  # Top-level epics need human review
    "2":
      mode: auto-close  # Sub-epics auto-close
```

### AI-Validated Epics

Use AI intelligence to validate complex containers:

```yaml
container_handling:
  enabled: true
  default_mode: validate
  level_policies:
    "1":
      mode: validate
      workflow_override: epic-completion-review
    "2":
      mode: validate  # Sub-epics also validated
  ordering:
    strategy: hybrid
    dependency_weight: 0.8  # Strong dependency preference
```

### Multi-Tier Organization

Different policies for different organizational levels:

```yaml
container_handling:
  enabled: true
  default_mode: auto-close
  level_policies:
    "1":
      mode: validate
      workflow_override: strategic-epic-review
    "2":
      mode: hitl
    "3":
      mode: auto-close
  container_detection:
    min_children: 2
  ordering:
    strategy: hybrid
    prefer_depth: 2  # Prefer deeper work
    dependency_weight: 0.6
```

### Conservative Setup

Minimize false positives and require explicit control:

```yaml
container_handling:
  enabled: true
  default_mode: hitl  # Require human approval for all
  container_detection:
    min_children: 5  # High threshold
    check_description: false  # Skip pattern matching
    check_dependencies: false  # Only use children
  ordering:
    strategy: dependency  # Strict dependency ordering only
```

## Workflow Integration

### Container Validation Phase

When using `validate` mode, ensure you have a phase with `container-validation` capability in your policies:

```yaml
policies:
  epic-completion:
    triggers:
      - label: "ashep-workflow:epic-completion"
    phases:
      - name: validate-epic
        capabilities:
          - container-validation
        timeout: 300000
```

### Agent Requirements

For `validate` mode, ensure your `agents.yaml` includes agents with `container-validation` capability:

```yaml
agents:
  - id: epic-validator
    name: "Epic Validator"
    capabilities:
      - container-validation
      - analysis
    priority: 10
    active: true
```

## Labels and State

### System Labels

The system uses these labels to track container state:

- `ashep-hitl:container-validation` - Container waiting for human review
- `ashep-phase:<phase-name>` - Current workflow phase
- `ashep-workflow:<workflow-name>` - Assigned workflow

### Monitoring Container Status

```bash
# See all containers waiting for validation
ashep list-hitl | grep container-validation

# Check if an epic is managed
bd show EPIC-123 | grep ashep-managed

# View container children
bd dep list EPIC-123
```

## Best Practices

### Start Simple

Begin with `auto-close` mode and basic configuration:

```yaml
container_handling:
  enabled: true
  default_mode: auto-close
  ordering:
    strategy: hybrid
```

### Gradual Enhancement

Add complexity gradually:

1. Start with `auto-close` for all levels
2. Add HITL for level 1 epics
3. Enable validation for critical workflows
4. Fine-tune detection thresholds

### Use Level Policies

Match policies to organizational structure:

```yaml
level_policies:
  "1":  # Strategic level
    mode: validate
    workflow_override: strategic-review
  "2":  # Tactical level
    mode: hitl
  "3":  # Execution level
    mode: auto-close
```

### Monitor Confidence Scores

If issue containers are misidentified, adjust detection:

```yaml
container_detection:
  min_children: 3  # Increase to reduce false positives
  check_description: false  # Disable if language matching is noisy
```

### Test Ordering Strategies

Experiment with ordering in development:

```yaml
ordering:
  strategy: dependency  # Test if dependencies are complete
  # Later switch to:
  # strategy: hybrid  # More robust for production
```

### Validate Configuration

Test your configuration before production:

```bash
# Validate config
ashep validate-config

# Check container detection
ashep inspect-container EPIC-123
```

## Common Use Cases

### Sprint Epics

Auto-close when all sprint tasks complete:

```yaml
container_handling:
  default_mode: auto-close
  level_policies:
    "1":  # Sprint epics
      mode: auto-close
```

### Feature Releases

Validate that all requirements are met:

```yaml
container_handling:
  default_mode: validate
  level_policies:
    "1":
      mode: validate
      workflow_override: release-readiness-check
```

### Critical Infrastructure

Require human approval for production changes:

```yaml
container_handling:
  default_mode: hitl
  level_policies:
    "1":
      mode: hitl  # Infrastructure changes need approval
    "2":
      mode: hitl  # Sub-components also need review
```

### Multi-Team Coordination

Auto-close sub-team work, validate integration:

```yaml
container_handling:
  level_policies:
    "1":  # Program level
      mode: validate
      workflow_override: integration-review
    "2":  # Team level
      mode: auto-close
    "3":  # Task level
      mode: auto-close
```

## Troubleshooting

See [Troubleshooting Guide](./container-handling-troubleshooting.md) for detailed debugging information.

## Related Documentation

- [Configuration Reference](./config-config.md) - Complete config reference
- [API Documentation](./container-handling-api.md) - Technical implementation details
- [Architecture](./architecture.md) - System architecture overview
