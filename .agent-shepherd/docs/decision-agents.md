# Decision Agents

Decision agents are specialized AI agents that analyze workflow outcomes and make intelligent routing decisions. They enable dynamic, adaptive workflows by determining the appropriate next phase based on context, results, and configured constraints.

## Overview

In enhanced transitions, instead of always advancing to the next phase, a decision agent evaluates the situation and selects from valid options:

```
Traditional:   Phase A → Phase B → Phase C
Decision Agent: Phase A → [Agent Analyzes] → Phase B or Phase C or Phase D
```

**Key Features**:
- **Context-aware decisions**: Analyze issue, outcome, phase history
- **Constrained routing**: Select from `allowed_destinations` only
- **Confidence-based automation**: Auto-advance or request approval
- **Template-based prompts**: Consistent, structured decision making
- **Analytics tracking**: Learn from decision patterns

## Decision Agent Capabilities

Decision agents are defined by **capabilities** in `agents.yaml`:

```yaml
agents:
  - id: test-decision-agent
    capabilities: [test-decision, qa-routing]
    # ... agent config
```

These capabilities map to transition configurations:

```yaml
phases:
  - name: test
    transitions:
      on_success:
        capability: test-decision  # Maps to agent capability
        allowed_destinations: [deploy, fix-bugs, review]
```

## Decision Process

### 1. Trigger

A decision is triggered when a phase completes and the transition configuration uses a decision object:

```yaml
on_success:
  capability: test-decision
  # ... other config
```

### 2. Context Collection

System gathers context for the decision:

```typescript
context = {
  issue: { id, title, description, issue_type, priority, labels, ... },
  outcome: { success, message, error, warnings, artifacts, metrics, ... },
  current_phase: "test",
  custom_instructions: "Analyze test results...",
  allowed_destinations: ["deploy", "fix-bugs", "review"],
  recent_decisions: [ ... ],           // Last 5 decisions for this issue
  phase_history: [ ... ],               // Phase visit history
  performance_context: {                  // Performance metrics
    average_duration_ms: 12500,
    total_duration_ms: 87500,
    phase_visit_count: 5
  }
}
```

### 3. Prompt Generation

System generates a structured prompt for the decision agent, using either:
- **Custom prompt** from transition config
- **Template prompt** from `decision-prompts.yaml`

### 4. Agent Execution

Decision agent runs with the prompt and returns a structured response:

```json
{
  "decision": "advance_to_deploy",
  "reasoning": "All critical tests passed, 0 failures, coverage meets threshold",
  "confidence": 0.95,
  "recommendations": ["Monitor production metrics", "Prepare rollback plan"]
}
```

### 5. Validation

System validates the response:
- Required fields present (`decision`, `reasoning`, `confidence`)
- `decision` format valid (`advance_to_X`, `jump_to_X`, `require_approval`)
- Target phase in `allowed_destinations`
- `confidence` in valid range (0.0-1.0)

### 6. Confidence Check

Based on confidence thresholds:

```yaml
confidence_thresholds:
  auto_advance: 0.8      # High confidence: auto-proceed
  require_approval: 0.6    # Medium: request human review
```

- `confidence >= 0.8`: Automatically advance to selected phase
- `0.6 <= confidence < 0.8`: Request human approval via HITL
- `confidence < 0.6`: Escalate to human intervention

### 7. Transition Execution

System executes the transition based on decision:
- **Advance**: Move to selected next phase
- **Jump Back**: Return to previous phase
- **Block**: Loop prevention blocked transition
- **HITL**: Request human approval

## Decision Response Format

### Required Fields

```json
{
  "decision": "advance_to_deploy",   // Required
  "reasoning": "Tests passed",       // Required
  "confidence": 0.95                // Required (0.0-1.0)
}
```

### Optional Fields

```json
{
  "recommendations": ["Monitor metrics", "Prepare rollback"]  // Optional
}
```

### Decision Actions

Valid `decision` values:

| Action Format | Example | Behavior |
|--------------|----------|----------|
| `advance_to_<phase>` | `advance_to_deploy` | Forward to specified phase |
| `jump_to_<phase>` | `jump_to_implementation` | Back to previous phase |
| `require_approval` | `require_approval` | Request human approval |

**Validation**: Target phase must be in `allowed_destinations`.

## Prompt Templates

### Template Configuration (`decision-prompts.yaml`)

```yaml
version: "1.0"
templates:
  test-decision:
    name: "Test Outcome Analyzer"
    description: "Analyzes test results and recommends deployment path"
    system_prompt: |
      You are a quality gate decision agent. Analyze test outcomes and recommend
      the appropriate next phase based on test results, coverage, and failure severity.
    prompt_template: |
      # Issue
      Issue ID: {{issue.id}}
      Title: {{issue.title}}
      Type: {{issue.issue_type}}
      Priority: {{issue.priority}}

      # Current Phase
      Phase: {{current_phase}}

      # Test Outcome
      Success: {{outcome.success}}
      Message: {{outcome.message}}
      Error: {{outcome.error}}

      # Performance
      Duration: {{outcome.metrics.duration_ms}}ms

      {{#if outcome.warnings}}
      # Warnings
      {{#each outcome.warnings}}
      - {{this}}
      {{/each}}
      {{/if}}

      # Allowed Next Phases
      {{#each allowed_destinations}}
      - **{{this}}**
      {{/each}}

      {{#if performance_context}}
      # Phase Performance
      - Average duration: {{performance_context.average_duration_ms}}ms
      - Total time spent: {{performance_context.total_duration_ms}}ms
      - Visits to this phase: {{performance_context.phase_visit_count}}
      {{/if}}

      # Instructions
      {{custom_instructions}}

      Analyze the test outcome and decide:
      1. Select the most appropriate next phase from allowed destinations
      2. Provide clear reasoning for your choice
      3. Rate your confidence (0.0-1.0)

      Respond in JSON format:
      {
        "decision": "advance_to_<phase>" or "jump_to_<phase>" or "require_approval",
        "reasoning": "Your detailed reasoning",
        "confidence": 0.0 to 1.0,
        "recommendations": ["Optional recommendation 1", "Optional recommendation 2"]
      }

default_template: "fallback-template"
```

### Template Variables

Available variables in prompt templates:

| Variable | Type | Example |
|----------|------|---------|
| `{{issue.id}}` | string | `ISSUE-123` |
| `{{issue.title}}` | string | `Fix login bug` |
| `{{issue.description}}` | string | `Users cannot log in...` |
| `{{issue.issue_type}}` | string | `bug` |
| `{{issue.priority}}` | number | `2` |
| `{{issue.status}}` | string | `in_progress` |
| `{{issue.labels}}` | array | `["bug", "critical"]` |
| `{{current_phase}}` | string | `test` |
| `{{outcome.success}}` | boolean | `true` |
| `{{outcome.message}}` | string | `Tests passed` |
| `{{outcome.error}}` | string | `null` or error message |
| `{{outcome.metrics.duration_ms}}` | number | `12345` |
| `{{outcome.warnings}}` | array | `["Flaky test detected"]` |
| `{{custom_instructions}}` | string | User-provided instructions |
| `{{allowed_destinations}}` | array | `["deploy", "fix-bugs"]` |
| `{{recent_decisions}}` | array | Last 5 decisions |
| `{{phase_history}}` | array | Phase visit history |
| `{{performance_context.average_duration_ms}}` | number | Average phase duration |
| `{{performance_context.total_duration_ms}}` | number | Total time in phase |
| `{{performance_context.phase_visit_count}}` | number | Number of phase visits |

### Template Conditionals

Use Handlebars-style conditionals:

```yaml
{{#if condition}}
  Content if true
{{else}}
  Content if false
{{/if}}

{{#each array}}
  - {{this}}
{{/each}}
```

## Custom Prompts

Override templates with custom prompts in transition config:

```yaml
phases:
  - name: test
    transitions:
      on_success:
        capability: test-decision
        prompt: "Review test results. If < 5 failures and coverage > 80%, deploy. Otherwise, fix-bugs."
        allowed_destinations: [deploy, fix-bugs]
```

**Priority**:
1. Custom prompt in transition config (highest)
2. Template from `decision-prompts.yaml`
3. Fallback template (lowest)

## Confidence Thresholds

### Configuration

```yaml
phases:
  - name: test
    transitions:
      on_success:
        capability: test-decision
        allowed_destinations: [deploy, fix-bugs]
        confidence_thresholds:
          auto_advance: 0.8      # High confidence
          require_approval: 0.6    # Medium confidence
```

### Behavior

| Confidence | Action |
|------------|--------|
| ≥ auto_advance (0.8) | Auto-advance to selected phase |
| ≥ require_approval (0.6) and < auto_advance | Request human approval |
| < require_approval (0.6) | Escalate to human intervention |

### Examples

**High Confidence (Auto-Advance)**:
```json
{
  "decision": "advance_to_deploy",
  "reasoning": "All tests passed (500/500), coverage 95%, no critical issues",
  "confidence": 0.92
}
```
**Result**: Automatically deploy to production.

**Medium Confidence (Request Approval)**:
```json
{
  "decision": "advance_to_deploy",
  "reasoning": "Tests passed but 3 flaky tests detected, coverage 82%",
  "confidence": 0.75
}
```
**Result**: Add `ashep-hitl:approval` label, wait for human.

**Low Confidence (Escalate)**:
```json
{
  "decision": "require_approval",
  "reasoning": "Unable to determine appropriate path - ambiguous test results",
  "confidence": 0.45
}
```
**Result**: Add `ashep-hitl:manual-intervention` label.

## Decision Analytics

### Tracking Decisions

All decisions are logged and tracked for analytics:

```typescript
analytics = {
  total_decisions: 1250,
  decisions_by_type: {
    "advance": 800,
    "jump": 350,
    "approval": 100
  },
  confidence_distribution: {
    high: 750,    // 0.8-1.0
    medium: 400,   // 0.5-0.8
    low: 100       // 0.0-0.5
  },
  most_common_targets: [
    { target: "deploy", count: 500 },
    { target: "fix-bugs", count: 300 },
    { target: "review", count: 150 }
  ],
  approval_rate_by_confidence: {
    high_approved: 700,    // High conf, approved
    high_total: 750,
    medium_approved: 200,   // Medium conf, approved
    medium_total: 400,
    low_approved: 10,       // Low conf, approved
    low_total: 100
  }
}
```

### Using Analytics

```typescript
const builder = getDecisionPromptBuilder();

// Get analytics
const stats = builder.getAnalytics();

console.log(`Total decisions: ${stats.total_decisions}`);
console.log(`Most common target: ${stats.most_common_targets[0].target}`);
console.log(`High confidence approval rate: ${stats.approval_rate_by_confidence.high_approved / stats.approval_rate_by_confidence.high_total}`);
```

**Use Cases**:
- Identify over- or under-confident agents
- Find common routing patterns
- Adjust confidence thresholds based on approval rates
- Optimize workflow paths

## Best Practices

### 1. Use Descriptive Reasoning

Provide clear, actionable reasoning:

```json
{
  "reasoning": "All 500 tests passed (100% success rate). Code coverage at 95% (target 80%). No critical or high-severity issues. Ready for production deployment."
}
```

### 2. Set Appropriate Confidence Thresholds

Match thresholds to risk tolerance:

```yaml
# Low-risk (internal staging)
confidence_thresholds:
  auto_advance: 0.6
  require_approval: 0.4

# High-risk (production deployment)
confidence_thresholds:
  auto_advance: 0.9
  require_approval: 0.8
```

### 3. Constrain Allowed Destinations

Always restrict AI to safe options:

```yaml
allowed_destinations: [deploy, fix-bugs, manual-review]  # Good
# allowed_destinations: *  # BAD: Unsafe
```

### 4. Include Performance Context

Provide phase history for better decisions:

```yaml
{{#if performance_context}}
# Phase Performance
- Average duration: {{performance_context.average_duration_ms}}ms
- Total time spent: {{performance_context.total_duration_ms}}ms
- Visits to this phase: {{performance_context.phase_visit_count}}
{{/if}}
```

### 5. Validate Response Format

Ensure JSON structure matches requirements:

```json
{
  "decision": "advance_to_deploy",
  "reasoning": "Clear explanation",
  "confidence": 0.95,
  "recommendations": ["Optional suggestions"]
}
```

## Troubleshooting

### Decision Agent Not Found

**Problem**: `Agent with capability 'X' not found`

**Solution**:
1. Check agent exists in `agents.yaml`
2. Verify agent has the required capability
3. Ensure agent is `active: true`

### Invalid Decision Response

**Problem**: `Failed to parse decision response`

**Solution**:
1. Check response is valid JSON
2. Verify required fields present
3. Ensure `decision` format is correct
4. Check `confidence` is number (0.0-1.0)

### Destination Not Allowed

**Problem**: `Target phase 'X' not in allowed destinations`

**Solution**:
1. Check `allowed_destinations` list
2. Verify phase name spelling
3. Ensure AI selects from valid options

### Confidence Not Working

**Problem**: Agent always auto-advances regardless of confidence

**Solution**:
1. Check `confidence_thresholds` configured
2. Verify agent returns `confidence` field
3. Ensure threshold values are valid numbers

## Examples

### Quality Gate Decision

```yaml
phases:
  - name: test
    transitions:
      on_success:
        capability: test-quality-gate
        prompt: "Evaluate test results against quality criteria"
        allowed_destinations: [staging, fix-critical, fix-minor]
        confidence_thresholds:
          auto_advance: 0.85
          require_approval: 0.7
```

**Decision Logic**:
- Zero failures, high coverage → staging (high confidence)
- Minor failures → fix-minor (medium confidence, approval)
- Critical failures → fix-critical (high confidence)

### Deployment Decision

```yaml
phases:
  - name: staging-test
    transitions:
      on_success:
        capability: deployment-decision
        prompt: "Assess staging results and deployment readiness"
        allowed_destinations: [production, rollback, hold-for-review]
        confidence_thresholds:
          auto_advance: 0.9
          require_approval: 0.8
```

**Decision Logic**:
- All checks pass → production (very high confidence)
- Issues found → rollback or hold (review required)
- Ambiguous results → hold-for-review (low confidence)

### Complex Routing Decision

```yaml
phases:
  - name: integration-test
    transitions:
      on_partial_success:
        capability: partial-success-handler
        prompt: "Evaluate partial integration success and recommend path"
        allowed_destinations: [retry-integration, proceed-partial, rollback, escalate]
        confidence_thresholds:
          auto_advance: 0.75
          require_approval: 0.6
```

**Decision Logic**:
- Mostly working → proceed-partial
- Transient failures → retry-integration
- Significant issues → rollback
- Unknown issues → escalate

## Related Documentation

- [Enhanced Transitions](./enhanced-transitions.md) - Transition system overview
- [Loop Prevention](./loop-prevention.md) - Preventing infinite workflows
- [Phase Messenger](./phase-messenger.md) - Inter-phase communication
- [Policies Configuration](./policies-config.md) - Complete policy reference
