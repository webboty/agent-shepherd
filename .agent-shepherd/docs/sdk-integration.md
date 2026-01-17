# OpenCode SDK Integration

Agent Shepherd uses the **OpenCode SDK** for reliable agent execution, providing robust session management and better error handling compared to the legacy CLI mode.

## Overview

The OpenCode SDK integration offers:

- **Robust Session Management**: Programmatic control over session lifecycle
- **Preserved Debugging Sessions**: Sessions kept after phase completion for debugging
- **Selective Cleanup**: Only test sessions are deleted; production sessions preserved
- **Better Reliability**: Direct API integration with proper error handling
- **Progress Tracking**: Real-time monitoring of execution status
- **Clean Separation**: SDK logic isolated from CLI code

## Why SDK Mode is Better

### Session Management

**SDK Mode (Recommended):**
- Sessions preserved for debugging after phase completion
- Selective cleanup: only test sessions deleted
- Session lifecycle: create → prompt → monitor → selective cleanup
- Context continuity across phases
- Better for debugging complex issues

**CLI Mode (Deprecated):**
- Sessions auto-deleted after phase completion
- No session preservation for debugging
- Context lost between phases
- Difficult to debug failures

### Reliability

**SDK Mode:**
- Direct API communication with OpenCode
- Structured error handling with detailed error messages
- Proper timeout management
- Automatic retry on transient failures
- Production-ready error recovery

**CLI Mode:**
- Shell command execution
- Fragile parsing of CLI output
- Limited error visibility
- No automatic retry
- Prone to parsing failures

### Monitoring

**SDK Mode:**
- Real-time progress tracking
- Detailed session status information
- Token usage monitoring
- Activity heartbeat detection
- Better observability

**CLI Mode:**
- Limited visibility during execution
- No progress feedback
- Session status unknown until completion
- No activity monitoring

## Configuration

### Enabling SDK Mode

SDK mode is the default and recommended execution mode. Configure in `.agent-shepherd/config/config.yaml`:

```yaml
worker:
  execution:
    mode: sdk  # Use OpenCode SDK (recommended)
    sdk_base_url: http://localhost:4096  # OpenCode server URL
```

### Switching from CLI to SDK Mode

If you have an existing installation using CLI mode:

1. **Update Configuration:**
```yaml
worker:
  execution:
    mode: sdk  # Change from 'cli' to 'sdk'
```

2. **Verify SDK Availability:**
- Ensure OpenCode server is running at the configured URL
- Check that `@opencode-ai/sdk` package is installed
- Test connectivity: `curl http://localhost:4096/health`

3. **Test SDK Mode:**
- Process a simple test issue
- Verify session preservation works
- Check logs for SDK-specific messages

4. **Monitor Performance:**
- Compare reliability with previous CLI mode
- Verify session preservation improves debugging
- Confirm progress tracking works

5. **Rollback (if needed):**
```yaml
worker:
  execution:
    mode: cli  # Temporary rollback if issues occur
```

### Configuration Options

| Option | Type | Default | Description |
|---------|-------|----------|-------------|
| `mode` | string | `sdk` | Execution mode: `sdk` (recommended) or `cli` (deprecated) |
| `sdk_base_url` | string | `http://localhost:4096` | OpenCode server URL for SDK communication |

### Remote OpenCode Servers

If OpenCode is running on a remote server or different port:

```yaml
worker:
  execution:
    mode: sdk
    sdk_base_url: https://opencode.example.com  # Remote server
```

## Session Lifecycle

### SDK Session Management

The SDK follows a clean session lifecycle:

```
1. Create Session
   ├─ Title based on issue and phase
   ├─ Agent configured for session
   └─ Session ID recorded for tracking

2. Execute Agent
   ├─ Send prompt to OpenCode API
   ├─ Monitor execution status
   ├─ Poll for completion
   └─ Handle errors and retries

3. Monitor Progress
   ├─ Track session messages
   ├─ Monitor token usage
   ├─ Detect activity heartbeat
   └─ Update run status

4. Phase Completion
   ├─ Retrieve execution results
   ├─ Store outcome metadata
   ├─ Preserve session for debugging
   └─ Update issue state

5. Selective Cleanup
   ├─ Keep production sessions (default)
   ├─ Delete only test sessions
   └─ Archive old sessions based on retention policy
```

### Session Preservation

**Production Sessions:**
- Automatically preserved after phase completion
- Available for debugging and review
- Used for context continuation across phases
- Deleted based on retention policy (default: 90 days)

**Test Sessions:**
- Marked as test when created
- Automatically deleted after phase completion
- Not used for context continuation
- Prevents test session bloat

**How Sessions Are Preserved:**
1. Agent completes phase successfully
2. Session ID stored in run outcome
3. Session marked as preserved (not test)
4. Session remains available in OpenCode
5. Available for `ashep list-sessions` command
6. Cleaned up by retention policy when old

## Troubleshooting

### Common Issues

#### SDK Not Available

**Symptoms:**
- Error: "Cannot find module '@opencode-ai/sdk'"
- Agent execution fails immediately
- Logs show SDK import errors

**Solutions:**
1. Verify SDK installation:
```bash
bun install @opencode-ai/sdk
```

2. Check package.json includes SDK:
```json
{
  "dependencies": {
    "@opencode-ai/sdk": "^1.0.0"
  }
}
```

3. Rebuild Agent Shepherd:
```bash
bun run build
```

#### OpenCode Connection Failed

**Symptoms:**
- Error: "Failed to connect to OpenCode SDK server"
- Timeout when executing agents
- Network connectivity issues

**Solutions:**
1. Verify OpenCode is running:
```bash
curl http://localhost:4096/health
```

2. Check configuration URL:
```yaml
worker:
  execution:
    mode: sdk
    sdk_base_url: http://localhost:4096  # Verify this is correct
```

3. Test network connectivity:
```bash
ping localhost  # Or remote host
telnet localhost 4096  # Test port accessibility
```

4. Check firewall rules:
- Ensure port 4096 (or configured port) is not blocked
- Verify inbound/outbound connections allowed

#### Session Not Preserved

**Symptoms:**
- Sessions disappear after phase completion
- Cannot review sessions with `ashep list-sessions`
- Debugging context lost

**Solutions:**
1. Verify SDK mode is enabled:
```yaml
worker:
  execution:
    mode: sdk  # Must be 'sdk', not 'cli'
```

2. Check retention policy:
```yaml
retention:
  policies:
    - name: default
      delete_after_days: 90  # Ensure not too aggressive
      keep_successful_runs: false  # Set to true to keep all
```

3. Verify no test session deletion:
- Logs should show "Session preserved for debugging"
- Check OpenCode directly to see if sessions exist

#### Progress Not Tracking

**Symptoms:**
- No progress feedback during execution
- Stuck on "Agent working..." message
- No real-time updates

**Solutions:**
1. Verify SDK mode is active (CLI mode has limited progress)
2. Check monitoring configuration:
```yaml
monitor:
  poll_interval_ms: 10000  # Ensure monitoring is enabled
```

3. Enable debug logging:
```bash
DEBUG=agent-shepherd ashep worker
```

4. Check OpenCode SDK logs:
- Look for session activity
- Verify API calls are succeeding

### Migration from CLI Mode

If you're experiencing issues after migrating from CLI to SDK mode:

**Issue: Different Output Format**

CLI mode and SDK mode may produce slightly different log formats. This is expected and not an error.

**Issue: Session Persistence Confusion**

After switching to SDK mode, sessions are now preserved. This is intentional and beneficial for debugging. Adjust retention policy if needed to manage storage.

**Issue: Performance Differences**

SDK mode may have different performance characteristics:
- First execution may be slower (session creation overhead)
- Subsequent executions faster (session reuse)
- Overall reliability should improve

## Best Practices

### Production Setup

1. **Use SDK Mode:**
```yaml
worker:
  execution:
    mode: sdk
```

2. **Configure Retention Policy:**
```yaml
retention:
  policies:
    - name: production
      age_days: 90
      delete_after_days: 90
      keep_successful_runs: true  # Keep for audit trail
```

3. **Monitor Session Usage:**
```bash
ashep session-list           # List globally active sessions
ashep list-sessions ISSUE-123  # Check session usage for specific issue
```

4. **Set Appropriate Heartbeat Thresholds:**
```yaml
worker:
  crash_detection:
    heartbeat_threshold_ms: 300000  # 5 minutes
```

### Development Setup

1. **Use Test Sessions:**
- Mark test sessions explicitly when creating
- Sessions auto-deleted after completion
- Prevents test session bloat

2. **Enable Debug Logging:**
```bash
DEBUG=agent-shepherd ashep worker
```

3. **Use Selective Cleanup:**
- Clean up test sessions manually if needed
- Archive old sessions for reference

### Performance Tuning

1. **Polling Frequency:**
```yaml
worker:
  poll_interval_ms: 30000  # Balance responsiveness vs. resource usage
```

2. **Session Continuation:**
```yaml
session_continuation:
  default_max_context_tokens: 130000  # Optimize token usage
```

3. **Monitor Thresholds:**
```yaml
monitor:
  stall_threshold_ms: 60000  # Appropriate for your workflow
```

## FAQs

**Q: Why is CLI mode deprecated?**

A: CLI mode is less reliable because it depends on shell command execution and fragile output parsing. SDK mode provides direct API integration with better error handling, session management, and monitoring.

**Q: Will CLI mode be removed?**

A: Yes, CLI mode will be removed in a future version. We recommend migrating to SDK mode as soon as possible.

**Q: Can I run SDK and CLI modes side-by-side?**

A: No, you must choose one mode in the configuration. However, you can switch modes by updating the config and restarting the worker.

**Q: Are sessions stored indefinitely in SDK mode?**

A: No, sessions are subject to retention policies. Production sessions are preserved for debugging but eventually deleted based on age, size, or count limits configured in your retention policy.

**Q: How do I verify SDK mode is working?**

A: Check logs for SDK-specific messages like "Using SDK for agent execution" and "Session preserved for debugging". You should also be able to see sessions with `ashep list-sessions`.

**Q: Can I use a remote OpenCode server with SDK mode?**

A: Yes, configure `sdk_base_url` in your config to point to your remote OpenCode server. Ensure network connectivity and authentication are properly configured.

**Q: What happens to existing issues when switching modes?**

A: Issues are unaffected. The only difference is how new agent executions are performed. Existing runs and sessions remain in their current state.

## Related Documentation

- [Main Configuration](config-config.md) - Execution configuration details
- [CLI Reference](cli-reference.md) - Command-line interface documentation
- [Troubleshooting](troubleshooting.md) - Common issues and solutions
- [Session Continuation](phase-messenger.md) - Inter-phase communication system
