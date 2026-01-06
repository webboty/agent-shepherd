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
