# Enhanced Transitions

Enhanced transitions enable sophisticated workflow routing with AI-driven decision making, conditional branching, and complex outcome handling. This system allows policies to go beyond simple sequential phases and implement intelligent, adaptive workflows.

## Overview

Traditional workflows follow a linear progression: Phase A → Phase B → Phase C. Enhanced transitions introduce:

- **AI-based routing**: Decision agents analyze outcomes and determine next steps
- **Conditional branching**: Different paths based on success, failure, partial success, or unclear outcomes
- **Jump capabilities**: Forward progress (advance) or backward movement (jump_back)
- **Phase messaging**: Data exchange between phases for context preservation
- **Confidence thresholds**: Automatic progression vs. human-in-the-loop decisions

## Transition Types

### String Transitions (Simple)

Direct string transitions work like the original sequential system:

```yaml
phases:
  - name: plan
    transitions:
      on_success: implement  # String: direct jump to next phase
```

**Behavior**: On success, go directly to the named phase. Simple, predictable, no AI involvement.

### Decision Transitions (Advanced)

Decision transitions use AI to determine routing:

```yaml
phases:
  - name: test
    transitions:
      on_success:
        capability: test-decision
        prompt: "Analyze test results and decide next phase"
        allowed_destinations: [deploy, fix-bugs, manual-review]
        confidence_thresholds:
          auto_advance: 0.8
          require_approval: 0.6
        messaging: true
```

**Behavior**: On completion, an AI decision agent analyzes the outcome and selects the appropriate next phase from `allowed_destinations`.

## Transition Blocks

Each phase can define transitions for different outcome types:

### `on_success` (Required)

Triggered when phase completes successfully.

```yaml
phases:
  - name: implement
    transitions:
      on_success: test  # Simple string
```

```yaml
phases:
  - name: test
    transitions:
      on_success:
        capability: deployment-decision
        allowed_destinations: [staging, production, rollback]
```

### `on_failure` (Optional)

Triggered when phase fails (non-success outcome).

```yaml
phases:
  - name: integration
    transitions:
      on_failure: rollback  # Rollback on failure
```

```yaml
phases:
  - name: test
    transitions:
      on_failure:
        capability: failure-analysis
        allowed_destinations: [debug, retry, escalate]
```

### `on_partial_success` (Optional - Decision Only)

Triggered when phase completes with partial success (some goals met, others not). **Must be a decision configuration (object), not a string**.

```yaml
phases:
  - name: integration
    transitions:
      on_partial_success:
        capability: partial-success-handler
        prompt: "Evaluate partial integration results"
        allowed_destinations: [retry-integration, proceed-with-caution, rollback]
```

**Use Cases**:
- Tests mostly pass but some flaky failures
- Partial deployment succeeded
- Code review with minor issues

### `on_unclear` (Optional - Decision Only)

Triggered when outcome is ambiguous or uncertain. **Must be a decision configuration (object), not a string**.

```yaml
phases:
  - name: analyze
    transitions:
      on_unclear:
        capability: uncertainty-resolver
        prompt: "Clarify analysis results"
        allowed_destinations: [manual-intervention, gather-more-data, proceed-with-best-effort]
```

**Use Cases**:
- Agent returns unclear results
- Conflicting signals in outcomes
- Ambiguous error messages

## Decision Configuration

### `capability` (Required)

The agent capability to use for decision making. Maps to agents in `agents.yaml`.

```yaml
capability: test-decision
```

### `prompt` (Required)

Custom instructions for the decision agent. This overrides template-based prompts.

```yaml
prompt: "Analyze test results and decide between deploy, fix-bugs, or manual-review based on failure count and severity"
```

### `allowed_destinations` (Required)

Safety constraint list of valid phase names the AI can select.

```yaml
allowed_destinations: [deploy, fix-bugs, manual-review]
```

**Purpose**: Prevents AI from jumping to inappropriate phases or creating infinite loops.

### `messaging` (Optional, Default: false)

Enable phase messenger for complex data exchange between phases.

```yaml
messaging: true
```

**Effect**:
- Previous phase sends result messages to destination phase
- Destination phase receives context before starting
- Automatic cleanup of old messages

### `confidence_thresholds` (Optional)

Control automatic vs. human-in-the-loop decisions based on AI confidence.

```yaml
confidence_thresholds:
  auto_advance: 0.8      # High confidence: auto-proceed
  require_approval: 0.6    # Medium: request human review
```

**Behavior**:
- `confidence >= 0.8`: Automatically advance to selected phase
- `0.6 <= confidence < 0.8`: Request human approval
- `confidence < 0.6`: Escalate to human intervention

## Outcome Types

Run outcomes have a `result_type` field that triggers specific transitions:

| Result Type | Triggered Transition | Use Case |
|-------------|---------------------|-----------|
| `success` | `on_success` | Phase completed successfully |
| `failure` | `on_failure` | Phase failed with error |
| `partial_success` | `on_partial_success` | Mixed success/failure results |
| `unclear` | `on_unclear` | Ambiguous or uncertain outcome |

**Note**: If `result_type` is not set, system falls back to `outcome.success` boolean:
- `success: true` → `on_success`
- `success: false` → `on_failure`

## Transition Actions

When a transition executes, it produces an action:

### `advance`

Move forward to the next phase in sequence.

```json
{
  "type": "advance",
  "next_phase": "deploy"
}
```

### `jump_back`

Return to a previous phase for rework or correction.

```json
{
  "type": "jump_back",
  "jump_target_phase": "implement"
}
```

### `retry`

Retry the current phase with same or different agent.

```json
{
  "type": "retry",
  "reason": "Transient failure, retrying"
}
```

### `block`

Block progress due to loop prevention or safety constraints.

```json
{
  "type": "block",
  "reason": "Oscillating cycle detected: develop→test→develop→test"
}
```

### `close`

Complete the workflow and close the issue.

```json
{
  "type": "close",
  "reason": "Workflow completed successfully"
}
```

### `dynamic_decision`

AI-driven decision with confidence-based routing.

```json
{
  "type": "dynamic_decision",
  "decision_config": { ... }
}
```

## Examples

### Simple Sequential Workflow

```yaml
phases:
  - name: plan
    transitions:
      on_success: implement

  - name: implement
    transitions:
      on_success: test
      on_failure: plan

  - name: test
    transitions:
      on_success: deploy
```

**Flow**: plan → implement → test → deploy (on success)
**Backtrack**: implement → plan (on implement failure)

### AI-Based Quality Gate

```yaml
phases:
  - name: test
    transitions:
      on_success:
        capability: quality-decision
        prompt: "Evaluate test results and recommend next step"
        allowed_destinations: [staging, fix-critical, fix-minor]
        confidence_thresholds:
          auto_advance: 0.85
          require_approval: 0.7
        messaging: true

  - name: staging
  - name: fix-critical
  - name: fix-minor
```

**Flow**:
1. Test completes
2. AI analyzes results
3. High confidence (≥0.85): Auto-advance to selected phase
4. Medium confidence (0.7-0.85): Request human approval
5. Low confidence (<0.7): Escalate to human

### Partial Success Handling

```yaml
phases:
  - name: integration
    transitions:
      on_success: deploy
      on_failure: rollback
      on_partial_success:
        capability: integration-handler
        prompt: "Assess partial integration results"
        allowed_destinations: [retry-integration, proceed-partial, rollback]
```

**Flow**:
- Full success → deploy
- Total failure → rollback
- Partial success (some services working) → AI decides

### Multiple Outcome Types

```yaml
phases:
  - name: analyze
    transitions:
      on_success: implement
      on_failure:
        capability: failure-investigator
        allowed_destinations: [debug, escalate, close]
      on_unclear:
        capability: uncertainty-resolver
        allowed_destinations: [manual-review, gather-data, proceed]
```

## Migration from Simple to Enhanced

### Before (Simple)

```yaml
phases:
  - name: plan
  - name: implement
  - name: test
  - name: deploy
```

**Behavior**: Sequential, always advances to next phase on success.

### After (Enhanced)

```yaml
phases:
  - name: plan
    transitions:
      on_success: implement

  - name: implement
    transitions:
      on_success:
        capability: implementation-check
        allowed_destinations: [test, review]
      on_failure: plan

  - name: test
    transitions:
      on_success:
        capability: deployment-decision
        allowed_destinations: [deploy, fix-bugs]
        confidence_thresholds:
          auto_advance: 0.8

  - name: deploy
  - name: review
  - name: fix-bugs
```

**Benefits**:
- Smart routing based on AI analysis
- Conditional branching
- Confidence-based automation
- Partial success handling

## Best Practices

### 1. Use `allowed_destinations` for Safety

Always constrain AI decisions to valid phases:

```yaml
allowed_destinations: [phase-a, phase-b, phase-c]  # Good
# allowed_destinations: *  # BAD: Unsafe
```

### 2. Set Appropriate Confidence Thresholds

Match thresholds to risk tolerance:

```yaml
# Low-risk workflows (e.g., internal testing)
confidence_thresholds:
  auto_advance: 0.6      # More automation

# High-risk workflows (e.g., production deployment)
confidence_thresholds:
  auto_advance: 0.9      # More human oversight
  require_approval: 0.8
```

### 3. Enable Messaging for Complex Workflows

Use phase messaging when downstream phases need context:

```yaml
phases:
  - name: test
    transitions:
      on_success:
        capability: test-decision
        allowed_destinations: [deploy, fix]
        messaging: true  # Send test results to next phase
```

### 4. Handle All Outcome Types

Consider what happens in each scenario:

```yaml
phases:
  - name: critical-phase
    transitions:
      on_success: next-phase          # Happy path
      on_failure: rollback           # Error path
      on_partial_success: retry      # Mixed path
      on_unclear: manual-review      # Ambiguous path
```

### 5. Use Descriptive Phase Names

Clear names make transitions easier to understand:

```yaml
- name: test                    # Good: clear purpose
- name: check-deployment-status # Good: specific
- name: step3                  # Bad: meaningless
```

## Troubleshooting

### Transition Not Firing

**Problem**: Phase completes but transition doesn't execute.

**Check**:
- Outcome `result_type` matches transition key
- `on_success` requires `result_type: "success"` or `success: true`
- `on_partial_success` requires `result_type: "partial_success"` (object only)

### AI Selects Invalid Phase

**Problem**: AI tries to jump to phase not in `allowed_destinations`.

**Solution**: This should fail validation. Check:
- Phase name spelling in `allowed_destinations`
- Decision agent response format

### Confidence Thresholds Not Working

**Problem**: AI always auto-advances regardless of confidence.

**Check**:
- `confidence_thresholds` configured in transition
- Decision agent returns `confidence` field (0.0-1.0)
- Threshold values are valid numbers

### Phase Messenger Not Working

**Problem**: Messages not arriving in destination phase.

**Check**:
- `messaging: true` in transition config
- Phase messenger plugin enabled
- Run counter matches between messages

## Related Documentation

- [Loop Prevention](./loop-prevention.md) - Preventing infinite workflows
- [Decision Agents](./decision-agents.md) - AI decision making system
- [Phase Messenger](./phase-messenger.md) - Inter-phase communication
- [Policies Configuration](./policies-config.md) - Complete policy reference
