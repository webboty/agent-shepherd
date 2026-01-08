# Agent Shepherd Integration Guides

This guide provides detailed instructions for integrating Agent Shepherd into various development workflows and systems.

## Table of Contents

- [Getting Started](#getting-started)
- [Integrating with Existing Projects](#integrating-with-existing-projects)
- [Policy Configuration](#policy-configuration)
- [Decision Agent Integration](#decision-agent-integration)
- [Retention Policy Setup](#retention-policy-setup)
- [Phase Messenger Integration](#phase-messenger-integration)
- [Advanced Patterns](#advanced-patterns)

---

## Getting Started

### Prerequisites

Before integrating Agent Shepherd, ensure you have:

1. **Bun Runtime** (>= 1.0.0)
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Beads** (Issue Tracking System)
   ```bash
   npm install -g @beads/cli
   bd init
   ```

3. **OpenCode** (AI Agent Platform)
   - Configure OpenCode credentials
   - Set up agent registry

4. **Agent Shepherd**
   ```bash
   cd /path/to/your/project
   ashep init
   ```

---

### Initial Setup

1. **Initialize Configuration**
   ```bash
   ashep init
   ```

   This creates the `.agent-shepherd/` directory with:
   - `config/config.yaml` - Main system configuration
   - `config/policies.yaml` - Workflow policies
   - `config/agents.yaml` - Agent registry
   - `config/decision-prompts.yaml` - Decision prompts
   - `config/phase-messenger.yaml` - Phase messaging config

2. **Validate Configuration**
   ```bash
   ashep validate-policy-chain
   ```

3. **Sync Agents from OpenCode**
   ```bash
   ashep sync-agents
   ```

---

## Integrating with Existing Projects

### Project Types

#### Node.js/TypeScript Projects

**Installation:**
```bash
# Using installer (recommended)
curl -fsSL https://raw.githubusercontent.com/USER/agent-shepherd/main/.agent-shepherd/install.sh | bash

# Or manual
npm install agent-shepherd
```

**Configuration:**
```bash
cd /path/to/project
ashep init
```

**Integrating with CI/CD:**

`.github/workflows/agent-shepherd.yml`:
```yaml
name: Agent Shepherd

on:
  issues:
    types: [opened, labeled]

jobs:
  process-issue:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install Agent Shepherd
        run: |
          curl -fsSL https://raw.githubusercontent.com/USER/agent-shepherd/main/.agent-shepherd/install.sh | bash

      - name: Process Issue
        run: ashep work ${{ github.event.issue.id }}
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
```

---

#### Python Projects

**Installation:**
```bash
# Use hybrid mode (shared binary)
curl -fsSL https://raw.githubusercontent.com/USER/agent-shepherd/main/.agent-shepherd/install.sh | bash

# Respond with 'H' for hybrid mode during installation
```

**Configuration:**
```bash
cd /path/to/python-project
ashep init
```

**Integrating with Python Scripts:**

`scripts/agent_shepherd_bridge.py`:
```python
import subprocess
import json

def trigger_agent_shepherd(issue_id: str) -> dict:
    """Trigger Agent Shepherd to process an issue"""
    result = subprocess.run(
        ['ashep', 'work', issue_id, '--output', 'json'],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        raise Exception(f"Agent Shepherd failed: {result.stderr}")

    return json.loads(result.stdout)

# Example usage
if __name__ == "__main__":
    issue_id = "issue-123"
    result = trigger_agent_shepherd(issue_id)
    print(f"Status: {result['status']}")
    print(f"Phase: {result['phase']}")
```

---

#### Go Projects

**Installation:**
```bash
# Use local mode (per-project)
curl -fsSL https://raw.githubusercontent.com/USER/agent-shepherd/main/.agent-shepherd/install.sh | bash

# Respond with 'L' for local mode during installation
```

**Configuration:**
```bash
cd /path/to/go-project
ashep init
```

**Integrating with Go Programs:**

`cmd/agentshepherd/main.go`:
```go
package main

import (
    "encoding/json"
    "os/exec"
    "fmt"
)

type ShepherdResult struct {
    Status string `json:"status"`
    Phase  string `json:"phase"`
    Error  string `json:"error,omitempty"`
}

func triggerShepherd(issueID string) (*ShepherdResult, error) {
    cmd := exec.Command("ashep", "work", issueID, "--output", "json")
    output, err := cmd.Output()
    if err != nil {
        return nil, fmt.Errorf("command failed: %w", err)
    }

    var result ShepherdResult
    if err := json.Unmarshal(output, &result); err != nil {
        return nil, fmt.Errorf("parse failed: %w", err)
    }

    return &result, nil
}

func main() {
    result, err := triggerShepherd("issue-123")
    if err != nil {
        fmt.Printf("Error: %v\n", err)
        return
    }
    fmt.Printf("Status: %s, Phase: %s\n", result.Status, result.Phase)
}
```

---

## Policy Configuration

### Creating Custom Policies

#### Basic Linear Workflow

`config/policies.yaml`:
```yaml
policies:
  simple-development:
    name: Simple Development
    description: Basic development workflow
    issue_types: ["bug", "task"]
    priority: 50

    phases:
      - name: plan
        description: Planning phase
        capabilities: [planning]
        timeout_multiplier: 1.0

      - name: implement
        description: Implementation phase
        capabilities: [coding]
        timeout_multiplier: 2.0

      - name: test
        description: Testing phase
        capabilities: [testing]
        timeout_multiplier: 1.5

      - name: review
        description: Review phase
        capabilities: [review]
        require_approval: true

    retry:
      max_attempts: 3
      backoff_strategy: exponential
      initial_delay_ms: 5000
      max_delay_ms: 300000

    timeout_base_ms: 300000
    stall_threshold_ms: 60000

default_policy: simple-development
```

---

#### Complex Workflow with Transitions

`config/policies.yaml`:
```yaml
policies:
  advanced-development:
    name: Advanced Development
    description: Development with AI-driven transitions

    phases:
      - name: plan
        description: Planning phase
        capabilities: [planning]

      - name: implement
        description: Implementation phase
        capabilities: [coding]
        transitions:
          on_success: test
          on_failure:
            capability: failure-analysis
            prompt: Analyze the failure and decide whether to retry, plan, or block
            allowed_destinations: [plan, implement, fix]
            confidence_thresholds:
              auto_advance: 0.85
              require_approval: 0.60

      - name: test
        description: Testing phase
        capabilities: [testing]
        transitions:
          on_success: review
          on_failure:
            capability: test-failure-decision
            prompt: Analyze test failures and recommend next action
            allowed_destinations: [implement, fix, review]
          on_partial_success:
            capability: partial-success-analysis
            prompt: Determine how to handle partial test success
            allowed_destinations: [test, fix, review]
          on_unclear:
            capability: unclear-outcome-decision
            prompt: Clarify the next steps when outcome is unclear
            allowed_destinations: [test, review]

      - name: review
        description: Code review phase
        capabilities: [review]
        require_approval: true
        max_visits: 5

    retry:
      max_attempts: 3
      backoff_strategy: exponential

default_policy: advanced-development
```

---

#### Multiple Policies with Priority

`config/policies.yaml`:
```yaml
policies:
  bugfix-workflow:
    name: Bugfix Workflow
    description: Optimized for bug fixes
    issue_types: ["bug"]
    priority: 80
    phases:
      - name: analyze
        capabilities: [debugging, analysis]
      - name: fix
        capabilities: [coding, debugging]
      - name: verify
        capabilities: [testing]
      - name: validate
        capabilities: [validation, qa]
    timeout_base_ms: 180000

  feature-workflow:
    name: Feature Workflow
    description: Optimized for new features
    issue_types: ["feature", "enhancement"]
    priority: 70
    phases:
      - name: design
        capabilities: [architecture, planning]
      - name: implement
        capabilities: [coding]
      - name: test
        capabilities: [testing]
      - name: review
        capabilities: [review]
        require_approval: true
    timeout_base_ms: 300000

  default-workflow:
    name: Default Workflow
    description: Generic workflow for all issues
    priority: 50
    phases:
      - name: plan
      - name: implement
      - name: test
    timeout_base_ms: 300000

default_policy: default-workflow
```

---

### Label-Based Workflow Selection

Using Beads labels to select workflows:

```bash
# Assign specific workflow
bd update issue-123 --labels ashep-workflow:feature-workflow

# Agent Shepherd will use feature-workflow instead of matching issue_type
```

---

## Decision Agent Integration

### Creating Decision Prompts

`config/decision-prompts.yaml`:
```yaml
version: "1.0"

templates:
  failure-analysis:
    name: failure-analysis
    description: Analyze failures and recommend next steps
    system_prompt: |
      You are a failure analysis expert. Review the error and determine
      the best course of action: retry the current phase, go back to
      planning, or block for human intervention.
    prompt_template: |
      Issue: {{issue.title}}
      Description: {{issue.description}}
      Current phase: {{current_phase}}

      Error:
      {{outcome.error}}

      Previous attempts: {{outcome.retry_count}}

      {{#if outcome.warnings}}
      Warnings:
      {{#each outcome.warnings}}
      - {{this}}
      {{/each}}
      {{/if}}

      Allowed destinations: {{#each allowed_destinations}}
      - **{{this}}**
      {{/each}}

      Analyze the error and provide:
      1. Your decision (advance_to_X, jump_to_Y, or require_approval)
      2. Your reasoning
      3. Confidence (0.0-1.0)
      4. Any recommendations

  test-failure-decision:
    name: test-failure-decision
    description: Analyze test failures specifically
    system_prompt: |
      You are a test failure analyst. Review test results and determine
      whether to fix implementation, adjust tests, or request review.
    prompt_template: |
      Test failed for issue {{issue.id}}

      Phase: {{current_phase}}
      Outcome: {{outcome.message}}
      {{#if outcome.error}}
      Error: {{outcome.error}}
      {{/if}}

      {{#if phase_history}}
      Recent phase history:
      {{#each phase_history}}
      - {{phase}} (Attempt {{attempt_number}}): {{status}} ({{duration_ms}}ms)
      {{/each}}
      {{/if}}

      Allowed destinations: {{#each allowed_destinations}}
      - **{{this}}**
      {{/each}}

      Decision options:
      - advance_to_fix: Fix the implementation
      - advance_to_review: Request code review
      - require_approval: Ask for human help

  partial-success-analysis:
    name: partial-success-analysis
    description: Handle partial test success
    system_prompt: |
      You analyze partial success outcomes. Some tests passed, some failed.
      Determine if we should fix specific issues, retry tests, or review.
    prompt_template: |
      Partial success in {{current_phase}} phase

      Issue: {{issue.title}}
      Outcome: {{outcome.message}}

      {{#if outcome.warnings}}
      Warnings:
      {{#each outcome.warnings}}
      - {{this}}
      {{/each}}
      {{/if}}

      Allowed destinations: {{#each allowed_destinations}}
      - **{{this}}**
      {{/each}}

      Analyze and recommend the next step.

default_template: failure-analysis
```

---

### Testing Decision Agents

```typescript
import { getDecisionPromptBuilder } from './src/core/decision-builder.js';

const builder = getDecisionPromptBuilder();

// Test prompt generation
const prompt = builder.buildDecisionInstructions(
  {
    id: 'issue-123',
    title: 'Fix authentication bug',
    description: 'Users cannot login',
    status: 'open',
    issue_type: 'bug',
    priority: 2
  },
  'failure-analysis',
  {
    success: false,
    error: 'Authentication failed: Invalid credentials',
    retry_count: 1
  },
  'implement',
  'Analyze the failure',
  ['plan', 'implement', 'fix']
);

console.log('Generated prompt:');
console.log(prompt);
```

---

## Retention Policy Setup

### Basic Retention Configuration

`config/retention.yaml`:
```yaml
policies:
  standard:
    name: Standard Retention
    enabled: true
    age_days: 90
    max_runs: 1000
    max_size_mb: 500
    archive_enabled: true
    archive_after_days: 60
    delete_after_days: 365
    keep_successful_runs: false
    keep_failed_runs: true

  aggressive:
    name: Aggressive Cleanup
    enabled: false
    age_days: 7
    max_runs: 100
    max_size_mb: 50
    archive_enabled: false

  keep-success:
    name: Keep Successful
    enabled: false
    age_days: 365
    max_runs: 5000
    max_size_mb: 2000
    archive_enabled: true
    keep_successful_runs: true
    keep_failed_runs: true
```

---

### Environment-Specific Policies

#### Development Environment

```yaml
policies:
  dev:
    name: Development
    enabled: true
    age_days: 7
    max_runs: 50
    max_size_mb: 25
    archive_enabled: false
    keep_failed_runs: false
```

#### Staging Environment

```yaml
policies:
  staging:
    name: Staging
    enabled: true
    age_days: 30
    max_runs: 500
    max_size_mb: 200
    archive_enabled: true
    archive_after_days: 14
    delete_after_days: 90
    keep_successful_runs: false
```

#### Production Environment

```yaml
policies:
  production:
    name: Production
    enabled: true
    age_days: 180
    max_runs: 10000
    max_size_mb: 5000
    archive_enabled: true
    archive_after_days: 90
    delete_after_days: 730
    keep_successful_runs: true
    keep_failed_runs: true
```

---

### Automated Cleanup Integration

Add to `.agent-shepherd/config.yaml`:
```yaml
retention:
  enabled: true
  cleanup_interval_hours: 24
  policies_file: config/retention.yaml

  # Automatic cleanup triggers
  triggers:
    on_startup: false
    on_issue_complete: false
    on_schedule: true
    schedule: "0 2 * * *"  # Daily at 2 AM
```

---

## Phase Messenger Integration

### Basic Configuration

`config/phase-messenger.yaml`:
```yaml
size_limits:
  max_content_length: 10000
  max_metadata_length: 5000
  max_messages_per_issue_phase: 100
  max_messages_per_issue: 500

cleanup:
  default_max_age_days: 90
  keep_last_n_per_phase: 10
  keep_last_n_runs: 1

storage:
  data_dir: .agent-shepherd
  database_file: messages.db
  jsonl_file: messages.jsonl
```

---

### Enabling Phase Messaging

Add to policy phases:

```yaml
phases:
  - name: implement
    transitions:
      on_success: test
      messaging: true  # Enable phase messenger

  - name: test
    transitions:
      on_success: review
      on_failure:
        capability: test-failure
        prompt: Analyze test results
        allowed_destinations: [implement, fix, review]
        messaging: true  # Enable for complex routing
```

---

### Custom Message Handlers

```typescript
import { getPhaseMessenger } from './src/core/phase-messenger.js';

class CustomMessageHandler {
  constructor() {
    this.messenger = getPhaseMessenger();
  }

  async handleIncomingMessage(message) {
    console.log(`Received ${message.message_type} from ${message.from_phase}`);

    switch (message.message_type) {
      case 'context':
        await this.handleContextMessage(message);
        break;
      case 'result':
        await this.handleResultMessage(message);
        break;
      case 'decision':
        await this.handleDecisionMessage(message);
        break;
      case 'data':
        await this.handleDataMessage(message);
        break;
    }
  }

  async handleContextMessage(message) {
    // Store context for current phase
    console.log('Context:', message.content);
    if (message.metadata) {
      console.log('Metadata:', message.metadata);
    }
  }

  async handleResultMessage(message) {
    // Process result from previous phase
    console.log('Result:', message.content);
    const metrics = message.metadata || {};
    console.log('Files changed:', metrics.files_changed);
  }

  async handleDecisionMessage(message) {
    // Process AI decision
    const decision = JSON.parse(message.content);
    console.log('Decision:', decision.action);
    console.log('Target:', decision.target_phase);
  }

  async handleDataMessage(message) {
    // Handle arbitrary data
    console.log('Data:', message.content);
  }
}

// Usage
const handler = new CustomMessageHandler();
const messages = handler.messenger.receiveMessages('issue-123', 'test');
for (const msg of messages) {
  await handler.handleIncomingMessage(msg);
}
```

---

## Advanced Patterns

### Custom Loop Prevention

Configure per-phase limits:

```yaml
phases:
  - name: test
    max_visits: 5  # Allow max 5 visits to test phase

  - name: fix
    max_visits: 3  # Limit fix attempts

  - name: review
    max_visits: 2  # Max 2 review iterations
```

Global configuration (`.agent-shepherd/config.yaml`):
```yaml
loop_prevention:
  enabled: true
  max_visits_default: 10
  max_transitions_default: 5
  cycle_detection_enabled: true
  cycle_detection_length: 3
```

---

### Fallback Agent Configuration

Policy-level fallback:

```yaml
policies:
  my-policy:
    fallback_enabled: true
    fallback_agent: "summary"
    fallback_mappings:
      review: "summary"
      test: "diagnostics"
```

Phase-level override:

```yaml
phases:
  - name: review
    fallback_agent: "code-reviewer"
    fallback_enabled: true
```

Global configuration (`.agent-shepherd/config.yaml`):
```yaml
fallback:
  enabled: true
  default_agent: "summary"
  max_retries: 3
  timeout_ms: 300000
```

---

### HITL (Human-in-the-Loop) Integration

Enable HITL in policy:

```yaml
policies:
  my-policy:
    require_hitl: true
```

HITL configuration (`.agent-shepherd/config.yaml`):
```yaml
hitl:
  enabled: true
  allowed_reasons:
    predefined: ["complex", "security", "performance"]
    allow_custom: true
    custom_validation: "alphanumeric-dash-underscore"
```

Adding HITL reason via Beads:

```bash
bd update issue-123 --labels ashep-hitl:complex
```

---

### Model Overrides

Phase-level model selection:

```yaml
phases:
  - name: plan
    model: claude-sonnet-4-20250514

  - name: implement
    model: claude-opus-4-20250514

  - name: test
    model: claude-haiku-4-20250514
```

---

### Multi-Tenant Configuration

For organizations managing multiple projects:

```bash
# Create tenant-specific config
mkdir -p .agent-shepherd/tenants/acme-corp
cat > .agent-shepherd/tenants/acme-corp/config.yaml <<EOF
tenant: acme-corp
worker:
  polling_interval_ms: 5000
  concurrency: 3
EOF

# Use tenant config
ashep worker --config .agent-shepherd/tenants/acme-corp/config.yaml
```

---

## Troubleshooting

For common issues and solutions, see [Troubleshooting Guide](./troubleshooting.md).

---

## Additional Resources

- [API Documentation](./api-reference.md)
- [Integration Examples](./integration-examples.md)
- [Architecture Documentation](./architecture.md)
- [Policy Configuration Guide](./policies-config.md)
