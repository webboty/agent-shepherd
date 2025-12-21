# Main Configuration Reference

The `config.yaml` file contains the core system settings for Agent Shepherd, controlling worker behavior, monitoring, and UI configuration.

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
ui:
  port: 3000
  host: "localhost"
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
- `30000`: Balanced for most workflows
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

## Performance Tuning Guide

### Development Environment
```yaml
worker:
  poll_interval_ms: 5000      # Fast response
  max_concurrent_runs: 2      # Conservative parallelism
monitor:
  poll_interval_ms: 2000      # Intensive monitoring
  stall_threshold_ms: 30000   # Quick failure detection
ui:
  port: 3000
  host: "localhost"
```

### Production Environment
```yaml
worker:
  poll_interval_ms: 60000     # Balanced polling
  max_concurrent_runs: 5      # Higher throughput
monitor:
  poll_interval_ms: 30000     # Standard monitoring
  stall_threshold_ms: 300000  # Generous timeout
ui:
  port: 8080
  host: "0.0.0.0"
```

### High-Throughput Environment
```yaml
worker:
  poll_interval_ms: 10000     # Responsive
  max_concurrent_runs: 10     # Maximum parallelism
monitor:
  poll_interval_ms: 5000      # Frequent checks
  stall_threshold_ms: 120000  # Reasonable timeout
ui:
  port: 3000
  host: "localhost"
```

## Resource Impact

| Setting | Low Impact | Medium Impact | High Impact |
|---------|------------|---------------|-------------|
| `poll_interval_ms` | 60000+ | 10000-60000 | <10000 |
| `max_concurrent_runs` | 1-2 | 3-5 | 6+ |
| `stall_threshold_ms` | 300000+ | 60000-300000 | <60000 |

## Troubleshooting

### Worker Not Processing Issues
- Check `poll_interval_ms` - may be too high
- Verify `max_concurrent_runs` - may be at limit
- Check system resources (CPU, memory, API limits)

### Monitor Missing Failed Runs
- Check `poll_interval_ms` - may be too high
- Verify `stall_threshold_ms` - may be too generous
- Review logs for monitoring errors

### UI Not Accessible
- Check `port` - may conflict with other services
- Verify `host` - "localhost" restricts network access
- Check firewall rules for the specified port