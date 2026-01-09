# Policy Configuration Reference

The `policies.yaml` file defines workflow policies that govern how Agent Shepherd processes issues, from initial assessment through completion. Policies orchestrate agent selection, task breakdown, and quality control.

## File Location

```
.agent-shepherd/config/policies.yaml
```

## Validation

Agent Shepherd includes comprehensive validation tools to ensure policy-capability-agent relationships are healthy:

### Chain Validation

Run validation to check the complete policy → capability → agent chain:

```bash
ashep validate-policy-chain
```

### Visual Inspection

View the relationship tree to understand policy structure and identify issues:

```bash
ashep show-policy-tree
```

The tree shows:
- **Status Indicators**: ✅ valid, ⚠️ warning, ❌ error, ⚪ inactive
- **Dead End Detection**: Identifies capabilities without agents
- **Single Points of Failure**: Warns about capabilities with only one agent
- **Health Summary**: Overview statistics and issue counts

## Fallback Agent Configuration

The fallback system allows policies to specify alternative agents for capabilities that don't have dedicated agents. This enables:

- **Getting started quickly** with default agents before adding specialized ones
- **Testing workflows** with limited agent pool before expanding
- **Flexible configuration** to match capabilities with available agents

### Policy-Level Fallback Fields

Add to policy definitions in `policies.yaml`:

```yaml
my-policy:
  fallback_enabled: true       # Enable fallback for this policy (inherits from global)
  fallback_agent: summary     # Use summary agent as default for this policy
  fallback_mappings:         # Capability-specific mappings
    testing: general       # Testing uses general agent
    architecture: plan     # Architecture uses planning agent
    documentation: summary   # Documentation uses summary agent
```

### Phase-Level Fallback Fields

Add to phase definitions:

```yaml
my-policy:
  phases:
    - name: test
      fallback_enabled: false    # Disable fallback for this phase (must have real testing agent)
    - name: review
      fallback_agent: summary   # Use summary agent for reviews instead of default
```

### Disabling Fallback

Set `fallback_enabled: false` at any level to disable fallback:

```yaml
# Global disable
fallback:
  enabled: false

# Policy disable
policies:
  my-policy:
    fallback_enabled: false

# Phase disable
policies:
  my-policy:
    phases:
      - name: test
        fallback_enabled: false
```

See [Main Configuration](../config-config.md#fallback-agent-configuration) for global settings.

## Structure

### `version` (string)
**Required**: Yes  
**Purpose**: Policy format version for compatibility  
**Impact**: Ensures proper parsing of policy definitions  
**Values**: Currently "1.0"

### `policies` (array)
**Required**: Yes  
**Purpose**: List of all workflow policies  
**Impact**: Defines available processing strategies for different issue types

### Policy Object Fields

#### `id` (string)
**Required**: Yes  
**Purpose**: Unique identifier for the policy  
**Impact**: Referenced in issue processing to select workflow  
**Values**: Letters, numbers, underscores, hyphens

#### `name` (string)
**Required**: Yes  
**Purpose**: Human-readable policy name  
**Impact**: Displayed in UI and logs for policy identification

#### `description` (string)
**Required**: No  
**Purpose**: Detailed explanation of policy purpose and scope  
**Impact**: Helps users understand when to apply each policy

#### `issue_types` (array of strings)
**Required**: No  
**Purpose**: Issue types that trigger this policy (e.g., `['bug', 'feature']`)  
**Impact**: Automatic policy selection based on issue type matching  
**Values**: Beads issue types (lowercase, alphanumeric, dashes, underscores)

#### `priority` (number)
**Required**: No (default: 50)  
**Purpose**: Policy selection priority when multiple policies match an issue type  
**Impact**: Higher priority policies take precedence  
**Values**: 1-100 (higher = more preferred)  
**Note**: When multiple policies match the same issue type, priority determines selection. Ties are broken by order in the config file.

### Trigger System

Agent Shepherd uses a label-based trigger system to automatically select policies for issues:

#### Priority Order

1. **Explicit Workflow Label** (highest priority)
   - Label format: `ashep-workflow:<policy-name>`
   - Example: `ashep-workflow:security-audit`
   - Override all other triggers when present
   - **Invalid label handling**: Controlled by `workflow.invalid_label_strategy` in config.yaml
     - `error`: Fail with error message (default)
     - `warning`: Log warning and fall back to default policy
     - `ignore`: Silently ignore and fall back to default policy

2. **Issue Type Matching** (automatic)
   - Matches issue type to policy `issue_types` array
   - Multiple policies can match same issue type
   - Policy with highest `priority` wins
   - Config order breaks priority ties (earlier in file wins)

3. **Default Policy** (fallback)
   - Policy specified in `default_policy` field
   - Used when no explicit label or issue type match

#### Label Naming Conventions

- `ashep-workflow:<name>`: Explicit workflow assignment
- `ashep-phase:<name>`: Current workflow phase (auto-managed)
- `ashep-hitl:<reason>`: Human-in-the-loop state (auto-managed)
- `ashep-excluded`: Exclude issue from processing

#### Example Usage

```bash
# Explicit workflow assignment
bd update ISSUE-123 --labels "ashep-workflow:security-audit"

# Issue type matching (automatic)
bd create --type bug --title "Fix login bug"
# Policies with issue_types: ['bug'] will match

# Exclude from processing
bd update ISSUE-123 --labels "ashep-excluded"
```

### Trigger Examples

#### Explicit Workflow Label
```yaml
# policies.yaml
security-audit:
  name: "Security Audit Workflow"
  phases:
    - name: threat-modeling
      capabilities: [security, analysis]
    - name: implementation
      capabilities: [coding, security]
```

```bash
# Force use of security-audit workflow
bd update ISSUE-123 --labels "ashep-workflow:security-audit"
```

#### Issue Type Matching
```yaml
# policies.yaml
quick-fixes:
  name: "Quick Bug Fixes"
  issue_types: [bug, quick-fix]
  priority: 80
  phases:
    - name: triage
      capabilities: [analysis]

detailed-investigation:
  name: "Detailed Investigation"
  issue_types: [bug]
  priority: 60
  phases:
    - name: deep-analysis
      capabilities: [architecture, analysis]
```

```bash
# Both policies match 'bug' type
# quick-fixes wins due to higher priority (80 > 60)
bd create --type bug --title "Fix critical bug"
```

#### Invalid Workflow Label Handling
```yaml
# config.yaml
workflow:
  invalid_label_strategy: "warning"  # or "error" or "ignore"
```

```bash
# Invalid workflow label (policy doesn't exist)
bd update ISSUE-123 --labels "ashep-workflow:nonexistent"

# With strategy "error": Processing fails with error
# With strategy "warning": Warning logged, falls back to default
# With strategy "ignore": Silently falls back to default
```

### Migration from Deprecated Fields

**Deprecated** (removed in v2.0):
- `trigger.type` field (automatic label-based triggering now)
- `trigger.patterns` field (use `issue_types` instead)

**New approach**:
- Labels: Add `ashep-workflow:<name>` label to issue
- Issue types: Configure `issue_types` array in policy
- Priority: Configure `priority` field in policy

#### `phases` (array)
**Required**: Yes  
**Purpose**: Sequential workflow steps  
**Impact**: Defines the complete processing pipeline

### Phase Object Fields

#### `name` (string)
**Required**: Yes  
**Purpose**: Unique identifier for the phase within the policy  
**Impact**: Referenced in dependencies and logging

#### `description` (string)
**Required**: No  
**Purpose**: Human-readable phase explanation  
**Impact**: Helps understand phase purpose

#### `capabilities` (array of strings)
**Required**: Yes  
**Purpose**: Required agent capabilities for this phase  
**Impact**: Drives agent selection from the agent registry  
**Values**: Must match capabilities defined in `agents.yaml`

#### `agent` (string)
**Required**: No (auto-selected if omitted)  
**Purpose**: Specific agent to use for this phase  
**Impact**: Overrides automatic agent selection  
**Values**: Must match an `id` from `agents.yaml`

#### `model` (string)
**Required**: No (uses agent or OpenCode default)  
**Purpose**: Model override for this specific phase  
**Impact**: Provides fine-grained control over AI model selection per task  
**Values**: Format `"provider/model"` (e.g., `"anthropic/claude-3-5-sonnet-20241022"`)  
**Priority**: Phase model > Agent model > OpenCode agent default

#### `model` (string)
**Required**: No (uses agent's default)  
**Purpose**: Override the model for this specific phase  
**Impact**: Allows fine-tuning model selection per task type  
**Values**: Format `"provider/model-id"` (e.g., `"anthropic/claude-3-5-sonnet-20241022"`)

#### `depends_on` (array of strings)
**Required**: No  
**Purpose**: Phase names that must complete before this phase  
**Impact**: Enforces workflow sequencing and dependencies  
**Values**: Names of other phases in the same policy

#### `max_iterations` (number)
**Required**: No (default: 3)  
**Purpose**: Maximum attempts allowed for this phase  
**Impact**: Prevents infinite loops and controls resource usage  
**Values**: 1-10 (higher allows more complex tasks)

#### `success_criteria` (array of strings)
**Required**: No  
**Purpose**: Conditions that indicate successful completion  
**Impact**: Automated validation of phase completion  
**Values**: Descriptive criteria like "code compiles", "tests pass"

#### `timeout_ms` (number)
**Required**: No (uses system default)  
**Purpose**: Maximum execution time for the phase  
**Impact**: Prevents runaway processes and ensures timely completion  
**Values**: Time in milliseconds

#### `retry_policy` (object)
**Required**: No  
**Purpose**: Rules for handling phase failures  
**Impact**: Improves resilience and error recovery

##### `backoff` (string)
**Required**: No (default: "exponential")  
**Purpose**: Delay strategy between retries  
**Impact**: Controls retry frequency to avoid overwhelming systems  
**Values**: `"fixed"`, `"linear"`, `"exponential"`

##### `max_delay_ms` (number)
**Required**: No (default: 300000)  
**Purpose**: Maximum delay between retry attempts  
**Impact**: Caps exponential backoff growth  
**Values**: Time in milliseconds

#### `custom_prompt` (string)
**Required**: No  
**Purpose**: Custom prompt template for this phase  
**Impact**: Allows per-phase tailored instructions for agents  
**Fallback**: Uses generic template if not specified

**Supported Variables**:
- `{{issue.title}}` - Issue title
- `{{issue.description}}` - Issue description
- `{{issue.id}}` - Issue identifier
- `{{issue.type}}` - Issue type (e.g., bug, feature)
- `{{phase}}` - Current phase name
- `{{capabilities}}` - Comma-separated list of required capabilities

**Example**:
```yaml
phases:
  - name: plan
    custom_prompt: "Create a detailed plan for {{issue.title}} (Issue ID: {{issue.id}}). Type: {{issue.type}}. Use capabilities: {{capabilities}}. Focus on architectural decisions."
  - name: implement
    custom_prompt: "Implement the {{issue.title}} feature based on the plan. Use these capabilities: {{capabilities}}. Follow best practices and include tests."
  - name: test
    capabilities: [testing]
```

**Notes**:
- Optional field - if not specified, generic prompt template is used
- Variable substitution happens at runtime with actual issue data
- Invalid variables are left unchanged (no errors thrown)
- Empty custom_prompt falls back to generic template
- Works with `require_approval` - approval warning is appended to custom prompts

## Policy Execution Flow

1. **Trigger Matching**: Issue labels and type matched against policies
   - Explicit `ashep-workflow:<name>` label (highest priority)
   - Issue type matching with priority ordering
   - Default policy as fallback
2. **Phase Resumption**: If `ashep-phase:<name>` label exists, resume from that phase
3. **Phase Sequencing**: Phases executed in order, respecting dependencies
4. **Agent Selection**: Best agent chosen based on capabilities and constraints
5. **Model Resolution**: Model determined by priority hierarchy (Phase > Agent > OpenCode)
6. **Iteration Control**: Phases can iterate until success or max_iterations reached
7. **Dependency Resolution**: Dependent phases wait for prerequisites
8. **Transition Handling**: Phase labels updated on transitions (`ashep-phase:<name>`, `ashep-hitl:<reason>`)

## Model Priority Hierarchy

Agent Shepherd resolves models using this priority order:

### 1. **Phase-Level Override** (Highest Priority)
```yaml
phases:
  - name: complex-analysis
    agent: plan
    model: anthropic/claude-3-5-sonnet-20241022  # Explicit phase override
```

### 2. **Agent-Level Configuration**
```yaml
agents:
  - id: plan
    name: "Planning Agent"
    model_id: claude-3-5-haiku-20241022  # Agent default
    provider_id: anthropic
```

### 3. **OpenCode Agent Default** (Fallback)
- Uses whatever model is configured in OpenCode for that agent
- No override specified in Agent Shepherd configuration

### Priority Benefits

- **Task-Specific Optimization**: Use expensive models only where needed
- **Cost Control**: Match model cost to task complexity
- **Performance Tuning**: Balance speed vs. capability per phase
- **Flexibility**: Override models without changing agent definitions

## Advanced Examples

### Complex Multi-Agent Workflow
```yaml
- id: "full-stack-feature"
  name: "Full Stack Feature Development"
  issue_types: ["feature", "full-stack"]
  priority: 70
  phases:
    - name: "architecture-review"
      description: "Review system architecture implications"
      capabilities: ["architecture", "planning"]
      agent: "architect"
      max_iterations: 2
    - name: "backend-api"
      description: "Implement backend API changes"
      capabilities: ["coding", "api-design"]
      depends_on: ["architecture-review"]
      max_iterations: 5
    - name: "frontend-ui"
      description: "Implement frontend UI changes"
      capabilities: ["coding", "ui-development"]
      depends_on: ["backend-api"]
      max_iterations: 4
    - name: "integration-testing"
      description: "Test full system integration"
      capabilities: ["testing", "integration"]
      depends_on: ["backend-api", "frontend-ui"]
      max_iterations: 3
```

### Quality Assurance Pipeline
```yaml
- id: "security-audit"
  name: "Security-Focused Development"
  issue_types: ["security", "audit"]
  priority: 90
  phases:
    - name: "threat-modeling"
      capabilities: ["security", "analysis"]
      agent: "security-analyst"
      model: "anthropic/claude-3-5-sonnet-20241022"  # High reasoning for security
    - name: "implementation"
      capabilities: ["coding", "security"]
      depends_on: ["threat-modeling"]
      agent: "secure-coder"
    - name: "security-review"
      capabilities: ["review", "security"]
      depends_on: ["implementation"]
      agent: "security-auditor"
      success_criteria: ["no critical vulnerabilities", "secure coding practices"]
```

### Performance-Optimized Workflow
```yaml
- id: "quick-fixes"
  name: "Fast Bug Fixes"
  issue_types: ["bug", "quick-fix"]
  priority: 80
  phases:
    - name: "triage"
      capabilities: ["analysis"]
      agent: "fast-analyst"
      model: "anthropic/claude-3-5-haiku-20241022"  # Fast model for quick analysis
      timeout_ms: 60000  # 1 minute limit
    - name: "fix"
      capabilities: ["coding"]
      depends_on: ["triage"]
      agent: "fast-coder"
      # No model specified - uses agent default or OpenCode default
      max_iterations: 2
      success_criteria: ["code compiles", "basic functionality works"]
```

### Model Override Priority Example
```yaml
- id: "complex-development"
  name: "Complex Feature Development"
  issue_types: ["feature", "complex"]
  priority: 60
  phases:
    - name: "analysis"
      description: "Analyze requirements"
      capabilities: ["analysis", "planning"]
      agent: "plan"
      model: "anthropic/claude-3-5-haiku-20241022"  # Fast analysis (phase override)
    - name: "implementation"
      description: "Implement complex feature"
      capabilities: ["coding", "architecture"]
      agent: "build"
      model: "anthropic/claude-3-5-sonnet-20241022"  # High capability for complex work
    - name: "review"
      description: "Review implementation"
      capabilities: ["review"]
      agent: "code-reviewer"
      # Uses agent-configured model (if specified) or OpenCode default
```

## Policy Selection Logic

When processing an issue:

1. **Match triggers** against issue labels/tags
2. **Rank policies** by priority and pattern specificity
3. **Select highest-ranked** matching policy
4. **Execute phases** in dependency order
5. **Handle failures** according to retry policies

## Resource Management

### Cost Optimization
- Use cheaper/faster models for analysis and planning phases
- Reserve expensive models for complex implementation tasks
- Balance quality vs. speed based on phase requirements

### Time Management
- Set appropriate timeouts for different phase types
- Use iteration limits to prevent excessive resource usage
- Configure retry policies to handle transient failures

### Agent Utilization
- Match agent capabilities to phase requirements
- Consider agent performance tiers for cost/speed trade-offs
- Use specialized agents for domain-specific tasks

## Monitoring and Metrics

Policies generate metrics on:
- Phase completion rates
- Agent performance by task type
- Resource usage patterns
- Success/failure rates per policy type

Use this data to optimize policy configurations over time.

## Enhanced Transitions

### Overview

Enhanced transitions enable AI-driven workflow routing with conditional branching. For detailed information, see [Enhanced Transitions Documentation](./enhanced-transitions.md).

### Transition Blocks

Each phase can define transitions for different outcome types using a `transitions` block:

```yaml
phases:
  - name: test
    transitions:
      on_success: deploy                    # Simple string transition
      on_failure:
        capability: test-decision             # Decision transition (object)
        prompt: "Analyze test failures"
        allowed_destinations: [debug, retry]
      on_partial_success:
        capability: partial-handler            # Decision transition (object only)
        allowed_destinations: [proceed, retry]
      on_unclear:
        capability: unclear-handler            # Decision transition (object only)
        allowed_destinations: [manual-review]
```

**Transition Types**:
- **String Transitions**: Direct jumps to named phases
- **Decision Transitions**: AI-based routing with confidence scoring

**Outcome Triggers**:
- `on_success`: Triggered on successful completion
- `on_failure`: Triggered on phase failure
- `on_partial_success`: Triggered on mixed results (object only)
- `on_unclear`: Triggered on ambiguous outcomes (object only)

### Decision Transition Configuration

```yaml
phases:
  - name: test
    transitions:
      on_success:
        capability: test-decision                    # Required: Agent capability
        prompt: "Evaluate test results"                 # Required: Custom instructions
        allowed_destinations: [deploy, fix-bugs, review]  # Required: Safety constraint
        messaging: true                                  # Optional: Enable phase messenger
        confidence_thresholds:                           # Optional: Automation levels
          auto_advance: 0.8                             # High confidence: auto-proceed
          require_approval: 0.6                           # Medium: request human
```

### Phase-Level Loop Prevention

Override global loop prevention settings per phase:

```yaml
phases:
  - name: test
    max_visits: 5                    # Limit test phase to 5 visits

  - name: deploy
    max_visits: 2                    # Stricter limit for production
```

For complete loop prevention configuration, see [Loop Prevention Documentation](./loop-prevention.md).

## Loop Prevention

### Global Configuration

Loop prevention settings in `config.yaml` apply across all policies:

```yaml
loop_prevention:
  enabled: true                      # Master switch
  max_visits_default: 10             # Global phase visit limit
  max_transitions_default: 5          # Global transition limit
  cycle_detection_enabled: true        # Enable pattern detection
  cycle_detection_length: 3            # Cycle detection sensitivity (2-5)
  trigger_hitl: true                 # Escalate to human
```

### Protection Mechanisms

1. **Phase Visit Limits**: Maximum visits per phase (prevents infinite re-execution)
2. **Transition Limits**: Maximum repetitions of specific A→B transitions
3. **Cycle Detection**: Detects oscillating patterns (e.g., A→B→A→B)
4. **HITL Escalation**: Automatically adds `ashep-hitl:loop-prevention` label when blocked

### Phase-Level Overrides

Configure per-phase limits in policy definitions:

```yaml
phases:
  - name: test
    max_visits: 5                     # Override global default

  - name: deploy
    max_visits: 3                     # Stricter limit for production
```

For detailed loop prevention information, see [Loop Prevention Documentation](./loop-prevention.md).

## Decision Agents

### Decision Prompts Configuration

Decision agents use template-based prompts defined in `decision-prompts.yaml`:

```yaml
version: "1.0"
templates:
  test-decision:
    name: "Test Outcome Analyzer"
    description: "Analyzes test results and recommends deployment path"
    system_prompt: |
      You are a quality gate decision agent. Analyze test outcomes and recommend
      appropriate next phase based on test results, coverage, and failure severity.
    prompt_template: |
      # Issue
      Issue ID: {{issue.id}}
      Title: {{issue.title}}
      Type: {{issue.issue_type}}

      # Test Outcome
      Success: {{outcome.success}}
      Message: {{outcome.message}}
      Error: {{outcome.error}}

      # Allowed Next Phases
      {{#each allowed_destinations}}
      - **{{this}}**
      {{/each}}

      # Instructions
      {{custom_instructions}}

      Analyze test outcome and decide:
      1. Select most appropriate next phase from allowed destinations
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
- `{{issue.id}}`, `{{issue.title}}`, `{{issue.description}}`, etc.
- `{{outcome.success}}`, `{{outcome.message}}`, `{{outcome.error}}`, etc.
- `{{current_phase}}`
- `{{custom_instructions}}`
- `{{allowed_destinations}}`
- `{{recent_decisions}}` (last 5 decisions)
- `{{phase_history}}` (phase visit history)
- `{{performance_context}}` (performance metrics)

### Custom Prompts

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

For complete decision agent information, see [Decision Agents Documentation](./decision-agents.md).

## Garbage Collection

### Retention Policies Configuration

Configure data retention policies in `config.yaml`:

```yaml
retention_policies:
  - name: "standard-90-day"
    enabled: true
    age_days: 90
    max_runs: 1000
    max_size_mb: 500
    archive_enabled: true
    archive_after_days: 30
    delete_after_days: 365

  - name: "aggressive-cleanup"
    enabled: false
    age_days: 30
    max_runs: 500
    max_size_mb: 200
    archive_enabled: false
```

### Cleanup Configuration

```yaml
cleanup:
  enabled: true
  schedule_interval_hours: 24    # Run cleanup every 24 hours
  max_runtime_minutes: 30        # Limit cleanup duration
```

For complete garbage collection information, see [Garbage Collection Documentation](./garbage-collection.md).

## Phase Messenger

### Configuration

Phase messenger configuration in `phase-messenger.yaml`:

```yaml
size_limits:
  max_content_length: 10000           # Max message content length
  max_metadata_length: 5000            # Max metadata JSON length
  max_messages_per_issue_phase: 100   # Max messages per (issue, phase) pair
  max_messages_per_issue: 500         # Max messages per issue

cleanup:
  default_max_age_days: 90           # Default age for cleanup
  keep_last_n_per_phase: 10          # Keep last N messages per phase
  keep_last_n_runs: 1               # Keep last N runs

storage:
  data_dir: ".agent-shepherd"
  database_file: "messages.db"
  jsonl_file: "messages.jsonl"
```

### Enabling Phase Messaging

Enable automatic messaging in transition configuration:

```yaml
phases:
  - name: test
    transitions:
      on_success:
        capability: test-decision
        allowed_destinations: [deploy, fix-bugs]
        messaging: true  # Enable phase messenger
```

For complete phase messenger information, see [Phase Messenger Documentation](./phase-messenger.md).