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
