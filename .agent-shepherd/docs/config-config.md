# Main Configuration Reference

The `config.yaml` file contains core system settings for Agent Shepherd, controlling worker behavior, monitoring, and UI configuration.

## File Location

```
.agent-shepherd/config/config.yaml
```

## Structure

```yaml
version: "1.0"
worker:
  poll_interval_ms: 30000
  max_concurrent_runs: 3

monitor:
  poll_interval_ms: 10000
  stall_threshold_ms: 60000
  timeout_multiplier: 1.0

ui:
  port: 3000
  host: localhost

workflow:
  invalid_label_strategy: "error"

hitl:
  allowed_reasons:
    predefined:
      - approval
      - manual-intervention
      - timeout
      - error
      - review-request
    allow_custom: true
    custom_validation: "alphanumeric-dash-underscore"

fallback:
  enabled: true
  default_agent: build
  mappings:
    review: summary
    architecture: plan
    documentation: summary
    testing: general
```

## Field Reference

### `version` (string)
**Required**: Yes  
**Purpose**: Configuration format version  
**Impact**: Ensures compatibility with future config changes  
**Values**: Currently "1.0"

### `worker` (object)
**Required**: Yes  
**Purpose**: Controls the autonomous worker process  
**Impact**: Determines how aggressively the system processes issues

#### `poll_interval_ms` (number)
**Required**: Yes (default: 30000)  
**Purpose**: How often to check for new work (milliseconds)  
**Impact**:
- **Lower values** (5000-10000): More responsive, higher resource usage
- **Higher values** (30000+): Less responsive, lower resource usage
- **System load**: Directly affects CPU and API usage
- **Real-time needs**: Use lower for urgent workflows

**Values**: 5000-300000 (5 seconds to 5 minutes)  
**Examples**:
- `5000`: Real-time processing (high resource usage)
- `30000`: Standard monitoring (recommended)
- `120000`: Batch processing (low resource usage)

#### `max_concurrent_runs` (number)
**Required**: Yes (default: 3)  
**Purpose**: Maximum simultaneous issue processing jobs  
**Impact**:
- **Higher values**: More parallel processing, higher resource usage
- **Lower values**: Sequential processing, lower resource usage
- **API limits**: Must stay within provider rate limits
- **System stability**: Too high can cause resource exhaustion

**Values**: 1-10  
**Examples**:
- `1`: Sequential processing (safest)
- `3`: Balanced parallelism (recommended)
- `5-10`: High throughput (requires strong system)

### `monitor` (object)
**Required**: Yes  
**Purpose**: Controls the supervision and monitoring system  
**Impact**: Ensures runs complete properly and detects issues

#### `poll_interval_ms` (number)
**Required**: Yes (default: 10000)  
**Purpose**: How often to check running processes (milliseconds)  
**Impact**:
- **Monitoring frequency**: More frequent = better oversight
- **Resource overhead**: Each check consumes some resources
- **Failure detection**: Affects how quickly stalled runs are detected

**Values**: 1000-60000 (1 second to 1 minute)  
**Examples**:
- `1000`: Intensive monitoring (development/debugging)
- `10000`: Standard monitoring (recommended)
- `30000`: Lightweight monitoring (production)

#### `stall_threshold_ms` (number)
**Required**: Yes (default: 60000)  
**Purpose**: Maximum time without progress before marking as stalled (milliseconds)  
**Impact**:
- **Run timeout**: Determines when to intervene in stuck processes
- **False positives**: Too low may interrupt legitimate long-running tasks
- **Recovery speed**: Affects how quickly failed runs are cleaned up

**Values**: 30000-3600000 (30 seconds to 1 hour)  
**Examples**:
- `30000`: Quick failure detection (fast-moving tasks)
- `60000`: Standard timeout (recommended)
- `300000`: Long-running tasks (complex analysis)

### `ui` (object)
**Required**: Yes  
**Purpose**: Web interface configuration  
**Impact**: Controls how users interact with the system

#### `port` (number)
**Required**: Yes (default: 3000)  
**Purpose**: Port number for the web server  
**Impact**:
- **Network access**: Must be available and not conflict with other services
- **Security**: Consider firewall rules for exposed ports
- **Development**: Use non-standard ports to avoid conflicts

**Values**: 1024-65535  
**Examples**:
- `3000`: Standard development port
- `8080`: Alternative web port
- `8443`: HTTPS port (requires SSL setup)

#### `host` (string)
**Required**: Yes (default: "localhost")  
**Purpose**: Hostname/IP address to bind the server to  
**Impact**:
- **Network access**: "localhost" = local only, "0.0.0.0" = all interfaces
- **Security**: "localhost" restricts to local machine only
- **Remote access**: Use specific IP or "0.0.0.0" for network access

**Values**: Hostname, IP address, or "0.0.0.0"  
**Examples**:
- `"localhost"`: Local development (secure)
- `"127.0.0.1"`: Explicit local binding
- `"0.0.0.0"`: All network interfaces (less secure)

## Workflow Configuration

The workflow configuration controls how Agent Shepherd handles workflow triggers and label management.

### `workflow` (object)
**Required**: No  
**Purpose**: Workflow trigger and label management settings  
**Impact**: Controls policy selection behavior when using labels

#### `invalid_label_strategy` (string)
**Required**: No (default: "error")  
**Purpose**: How to handle invalid workflow labels  
**Impact**: Determines system behavior when encountering invalid `ashep-workflow:<name>` labels

**Values**:
- `"error"`: Fail processing with error message (default, safest)
- `"warning"`: Log warning and continue with default policy
- `"ignore"`: Silently ignore and continue with default policy

**Examples**:

```yaml
workflow:
  invalid_label_strategy: "error"  # Strict mode (recommended for production)
```

```yaml
workflow:
  invalid_label_strategy: "warning"  # Forgiving mode (good for development)
```

```yaml
workflow:
  invalid_label_strategy: "ignore"  # Silent mode (not recommended)
```

### When to Use Each Strategy

**`error`** (recommended for production):
- Prevents silent failures
- Ensures workflow labels are valid
- Fails fast with clear error messages

**`warning`** (good for development):
- Allows workflow to continue
- Alerts to potential misconfigurations
- Good for testing new workflows

**`ignore`** (rarely used):
- Silently falls back to default policy
- Useful for completely automated systems
- Not recommended (can hide issues)

## Human-in-the-Loop (HITL) Configuration

The HITL configuration controls human intervention points in workflows.

### `hitl` (object)
**Required**: No  
**Purpose**: Human-in-the-loop approval and intervention settings  
**Impact**: Controls when and how human approval is required

#### `allowed_reasons` (object)
**Required**: Yes (if `hitl` is specified)  
**Purpose**: Allowed HITL reasons and validation rules  
**Impact**: Controls which HITL labels are valid

##### `predefined` (array of strings)
**Required**: Yes  
**Purpose**: Predefined HITL reasons that are always allowed  
**Impact**: Standardizes human intervention reasons  
**Default**: `["approval", "manual-intervention", "timeout", "error", "review-request"]`

**Values**: Lowercase, alphanumeric with dashes/underscores

##### `allow_custom` (boolean)
**Required**: No (default: true)  
**Purpose**: Whether custom HITL reasons are allowed  
**Impact**: Flexibility in human intervention labeling

##### `custom_validation` (string)
**Required**: No (default: "alphanumeric-dash-underscore")  
**Purpose**: Validation pattern for custom reasons  
**Impact**: Controls format of custom HITL reasons

**Values**:
- `"none"`: Allow any custom reason (not recommended)
- `"alphanumeric"`: Letters and numbers only
- `"alphanumeric-dash-underscore"`: Letters, numbers, dashes, underscores (default)

**Examples**:

```yaml
hitl:
  allowed_reasons:
    predefined:
      - approval
      - manual-intervention
      - timeout
      - error
      - review-request
    allow_custom: true
    custom_validation: "alphanumeric-dash-underscore"
```

```yaml
hitl:
  allowed_reasons:
    predefined:
      - approval
      - security-review
    allow_custom: false  # Only allow predefined reasons
```

### HITL Label Format

HITL labels follow this format: `ashep-hitl:<reason>`

**Examples**:
- `ashep-hitl:approval`
- `ashep-hitl:security-review`
- `ashep-hitl:manual-intervention`
- `ashep-hitl:custom-reason-123`

### HITL Validation

When a HITL label is set, Agent Shepherd validates:
1. Is the reason in the predefined list? → **Allowed**
2. Is custom reason allowed? → **Validate with pattern**
3. Does custom reason match validation pattern? → **Allowed or rejected**

**Validation Examples**:

```bash
# Predefined reason (always allowed)
bd update ISSUE-123 --labels "ashep-hitl:approval"

# Custom reason (if allow_custom: true)
bd update ISSUE-123 --labels "ashep-hitl:security-review"

# Custom reason (if allow_custom: false)
bd update ISSUE-123 --labels "ashep-hitl:custom-review"
# Result: Rejected - custom reasons not allowed

# Custom reason with invalid format
bd update ISSUE-123 --labels "ashep-hitl:Invalid Reason!"
# Result: Rejected - doesn't match "alphanumeric-dash-underscore"
```

### HITL in Workflow Transitions

Agent Shepherd automatically manages HITL labels during workflow transitions:

**Phase Completion → Block (approval required)**:
```yaml
phases:
  - name: security-review
    require_approval: true
```
Result: Sets `ashep-hitl:approval` label

**Manual HITL Trigger**:
```bash
bd update ISSUE-123 --labels "ashep-hitl:manual-intervention"
```
Result: Worker pauses issue processing

**HITL Resolution**:
When human addresses HITL requirement, label is cleared automatically:
- Removes `ashep-hitl:<reason>` label
- Resumes phase processing

## Loop Prevention Configuration

The loop prevention system prevents infinite loops in dynamic workflows through phase visit tracking, transition limits, and cycle detection. This is critical for AI-powered workflows that can create complex, non-linear paths through phases.

### `loop_prevention` (object)
**Required**: No  
**Purpose**: Prevent infinite loops in dynamic workflows  
**Impact**: Detects and blocks workflows from getting stuck in repeating patterns

#### `enabled` (boolean)
**Required**: No (default: true)  
**Purpose**: Master switch for loop prevention system  
**Impact**: When false, all loop prevention checks are disabled (not recommended)

**Values**: true/false

**Examples**:
```yaml
loop_prevention:
  enabled: true  # Enable all loop prevention (recommended)
```

```yaml
loop_prevention:
  enabled: false  # Disable all loop prevention (not recommended)
```

#### `max_visits_default` (number)
**Required**: No (default: 10)  
**Purpose**: Default maximum number of times a phase can be visited before being blocked  
**Impact**: Prevents phases from repeating indefinitely

**Values**: 1-100

**How it works**:
- Each time a phase executes, a visit is counted
- When visit count ≥ max_visits, the phase is blocked
- Can be overridden per-phase using the `max_visits` field in phase config

**Examples**:
```yaml
loop_prevention:
  max_visits_default: 10  # Standard limit (recommended)
```

```yaml
loop_prevention:
  max_visits_default: 3  # Strict limit for quick-fail workflows
```

```yaml
loop_prevention:
  max_visits_default: 50  # Permissive limit for iterative development
```

#### `max_transitions_default` (number)
**Required**: No (default: 5)  
**Purpose**: Default maximum number of times a specific phase→phase transition can occur before being blocked  
**Impact**: Prevents problematic transition patterns from repeating

**Values**: 1-50

**How it works**:
- Tracks specific phase→phase transitions (e.g., develop→test)
- When transition count ≥ max_transitions, that specific jump is blocked
- More granular than phase visits - targets specific problematic patterns
- Useful for catching systemic issues like "tests keep failing, go back to develop"

**Examples**:
```yaml
loop_prevention:
  max_transitions_default: 5  # Standard limit (recommended)
```

```yaml
loop_prevention:
  max_transitions_default: 3  # Strict limit to catch issues quickly
```

#### `cycle_detection_enabled` (boolean)
**Required**: No (default: true)  
**Purpose**: Enable oscillating pattern detection  
**Impact**: Catches patterns that visit/transition limits might miss

**How it works**:
- Analyzes recent transition sequences (last 10 transitions)
- Looks for patterns that reverse themselves (oscillation)
- Detects patterns like: develop→test→develop→test
- Cycle length is configurable via `cycle_detection_length`

**Values**: true/false

**Examples**:
```yaml
loop_prevention:
  cycle_detection_enabled: true  # Enable cycle detection (recommended)
```

```yaml
loop_prevention:
  cycle_detection_enabled: false  # Disable cycle detection
```

#### `cycle_detection_length` (number)
**Required**: No (default: 3)  
**Purpose**: Sensitivity for cycle detection - length of transition sequence to analyze  
**Impact**: Controls how aggressive cycle detection is

**Values**: 2-10

**How it works**:
- Analyzes transition sequences of this length
- Looks for patterns that match their reverse (oscillation)
- Higher values: Detect longer cycles, may miss short oscillations
- Lower values: Catch short oscillations, more false positives

**Examples**:
```yaml
loop_prevention:
  cycle_detection_length: 3  # Detect develop→test→develop patterns (recommended)
```

```yaml
loop_prevention:
  cycle_detection_length: 4  # Detect longer patterns like dev→test→review→test→dev
```

```yaml
loop_prevention:
  cycle_detection_length: 2  # Very sensitive, catches any back-and-forth pattern
```

#### `trigger_hitl` (boolean)
**Required**: No (default: true)  
**Purpose**: Whether to trigger Human-in-the-loop (HITL) escalation when loop prevention limits are exceeded  
**Impact**: Controls whether loop prevention blocks or triggers human review

**Values**: true/false

**How it works**:
- When true: Sets `ashep-hitl:<reason>` label and blocks execution
- When false: Blocks execution but does not trigger HITL
- Human must manually review and unblock when HITL is triggered

**Examples**:
```yaml
loop_prevention:
  trigger_hitl: true  # Require human review on loops (recommended)
```

```yaml
loop_prevention:
  trigger_hitl: false  # Block without human intervention
```

## Per-Phase Configuration Override

Phases can override the default `max_visits` limit using the `max_visits` field in the phase configuration:

```yaml
phases:
  - name: develop
    capabilities: [coding]
    max_visits: 20  # Allow more iterations than default
  - name: test
    capabilities: [testing]
    max_visits: 5  # Limit test phase strictly
```

### When to Use Per-Phase Overrides

**Increase `max_visits`** (higher than default):
- Iterative development phases where repeated attempts are expected
- Debugging phases where multiple test cycles are normal
- Research/exploration phases with unknown requirements

**Decrease `max_visits`** (lower than default):
- Review phases that should complete quickly
- Phases prone to getting stuck
- Final validation phases that should be one-shot

## Loop Prevention in Action

### Scenario 1: Phase Visit Limit Exceeded

```yaml
# Config
loop_prevention:
  max_visits_default: 10

# Issue visits "develop" phase 10 times
# Result: "develop" phase blocked on 11th attempt
# Message: "Phase 'develop' exceeded max_visits (10) with 11 visits"
```

### Scenario 2: Transition Limit Exceeded

```yaml
# Config
loop_prevention:
  max_transitions_default: 5

# Workflow executes develop→test transition 5 times
# Result: develop→test jump blocked on 6th attempt
# Message: "Transition develop→test exceeded max_transitions (5) with 6 occurrences"
```

### Scenario 3: Oscillating Cycle Detected

```yaml
# Config
loop_prevention:
  cycle_detection_enabled: true
  cycle_detection_length: 3

# Workflow pattern: develop→test→develop→test→develop
# Result: Cycle detected, workflow blocked
# Message: "Oscillating cycle detected: develop→test→develop"
```

## Complete Loop Prevention Configuration Example

```yaml
loop_prevention:
  enabled: true
  max_visits_default: 10
  max_transitions_default: 5
  cycle_detection_enabled: true
  cycle_detection_length: 3
  trigger_hitl: true
```

With per-phase overrides:

```yaml
policies:
  enhanced-dev:
    phases:
      - name: develop
        capabilities: [coding]
        max_visits: 20  # Allow more iterations
      - name: test
        capabilities: [testing, qa]
        max_visits: 5  # Limit test phase strictly
```

## Troubleshooting Loop Prevention

### Workflows Getting Blocked Too Quickly

**Issue**: Phases are being blocked before completing their work

**Solutions**:
1. Increase `max_visits_default` for more permissive limits
2. Add per-phase `max_visits` overrides for phases that legitimately need many iterations
3. Check if cycles are false positives - adjust `cycle_detection_length`

### Workflows Not Blocked When They Should Be

**Issue**: Loop prevention is not catching infinite loops

**Solutions**:
1. Verify `loop_prevention.enabled` is true
2. Decrease `max_visits_default` and `max_transitions_default` for stricter limits
3. Adjust `cycle_detection_length` to catch different pattern lengths
4. Check logs to see which checks are failing to detect the loop

### HITL Labels Not Being Set

**Issue**: Loop prevention blocks but no HITL label appears

**Solutions**:
1. Verify `loop_prevention.trigger_hitl` is true
2. Check HITL configuration for valid reasons
3. Review logs for any validation errors

## Fallback Agent Configuration

The fallback system allows Agent Shepherd to use a default agent when a policy requires a capability that no agent has. This is useful for:
- Getting started immediately with default agents
- Testing workflows before adding specialized agents
- Working with a limited agent pool

### Basic Configuration

Add to `.agent-shepherd/config/config.yaml`:

```yaml
fallback:
  enabled: true
  default_agent: build
```

### Cascading Hierarchy

The fallback system works on three levels:

1. **Global Level** (`config.yaml`): System-wide default
2. **Policy Level** (`policies.yaml`): Policy-specific override
3. **Phase Level** (`policies.yaml`): Phase-specific override

Each level can override the levels above it.

### Advanced Configuration

Use capability-specific mappings for better agent matching:

```yaml
fallback:
  enabled: true
  default_agent: build
  mappings:
    review: summary
    architecture: plan
    documentation: summary
    testing: general
```

### Field Reference

| Field | Location | Type | Description |
|--------|----------|-----------|
| `fallback.enabled` | config.yaml | boolean | Master switch for fallback system. If false, no fallback anywhere. |
| `fallback.default_agent` | config.yaml | string | Default fallback agent ID for all capabilities. |
| `fallback.mappings` | config.yaml | object | Optional capability-specific fallback agent mappings. |
| `fallback_enabled` | policies.yaml (policy) | boolean | Whether fallback is enabled for this policy. Inherits from global if not set. |
| `fallback_agent` | policies.yaml (policy) | string | Fallback agent ID for this policy. Inherits from global if not set. |
| `fallback_mappings` | policies.yaml (policy) | object | Capability-specific fallback mappings for this policy. |
| `fallback_agent` | policies.yaml (phase) | string | Fallback agent ID override for this phase. |
| `fallback_enabled` | policies.yaml (phase) | boolean | Whether fallback is enabled for this phase. Overrides policy and global settings. |

### How Fallback Works

When a policy requires a capability:

1. Agent Shepherd checks for agents with that capability
2. If agents are found, the best one is selected (by priority)
3. If no agents are found, Agent Shepherd checks fallback hierarchy:
   - Phase level: Uses `phase.fallback_agent` if set
   - Policy level: Uses `policy.fallback_mappings[capability]` if set
   - Global level: Uses `config.fallback.mappings[capability]` if set
   - Default: Uses `policy.fallback_agent` or `config.fallback.default_agent`
4. Checks if fallback agent exists and is active
5. Logs which fallback agent is being used

### Troubleshooting
