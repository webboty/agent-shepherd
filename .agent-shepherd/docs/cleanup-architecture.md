# Cleanup System Architecture

## Overview

The Agent Shepherd cleanup system has been designed with a CLI-based architecture rather than Logger-based integration. This document explains the architectural decisions, how to use the system, and the design rationale.

## Architecture

### Original vs. Implemented Design

**Original Specification (3.4.1):**
- Call `performStartupCleanup()` in Logger constructor
- Timer started in Logger constructor
- Cleanup runs automatically whenever Logger is instantiated

**Implemented Design:**
- Cleanup engine initialized and started from CLI commands (`worker`, `monitor`)
- Cleanup runs when long-running processes are active
- No automatic cleanup when Logger is created

### Why CLI-Based Architecture?

The cleanup system was moved from Logger to CLI level to solve several critical issues:

#### 1. Race Condition Prevention

**Problem:** Logger constructor creates SQLite databases synchronously. If CleanupEngine tried to access those databases during the same initialization sequence, it could cause:
- Database locked errors
- Inconsistent state
- Undefined behavior due to concurrent access

**Solution:** By starting cleanup from CLI worker/monitor commands (which run after initialization), we ensure:
- Logger databases are fully initialized
- No concurrent access during database creation
- Clear initialization order: Logger → Worker/Monitor → Cleanup

#### 2. Lifecycle Alignment

**Problem:** Logger is a utility class used throughout the codebase (short-lived instances for queries, logging, etc.). Cleanup is a long-running background process.

**Solution:** Cleanup aligns with long-running processes:
- `worker` command: Runs autonomous agent execution loop (long-lived)
- `monitor` command: Runs supervision loop (long-lived)
- `cleanup`: Started by both, runs during active processing

This matches the intended lifecycle: cleanup while system is actively working, not on every Logger instantiation.

#### 3. Resource Management

**Problem:** Each Logger instance would start its own cleanup timer if initialized in constructor, leading to:
- Multiple concurrent cleanup operations
- Resource waste
- Potential conflicts

**Solution:** Single cleanup engine instance started once per long-running process (worker/monitor), ensuring:
- One active cleanup operation at a time
- Efficient resource usage
- No duplicate timers

## How to Use Cleanup System

### Automatic Cleanup

Cleanup runs automatically in two scenarios:

#### 1. Worker Process
```bash
ashep worker
```
The worker command:
1. Starts the autonomous worker loop
2. Initializes and starts CleanupEngine
3. Runs startup cleanup (if `cleanup.run_on_startup: true`)
4. Starts scheduled cleanup timer (every `cleanup.schedule_interval_hours`)
5. Automatically runs health checks after each cleanup

#### 2. Monitor Process
```bash
ashep monitor
```
The monitor command:
1. Starts the supervision loop
2. Initializes and starts CleanupEngine
3. Runs startup cleanup (if `cleanup.run_on_startup: true`)
4. Starts scheduled cleanup timer
5. Automatically runs health checks after each cleanup

#### 3. Size Monitoring
When database sizes approach limits, cleanup is triggered automatically:
- **90% threshold**: Warning logged
- **100% threshold**: Critical cleanup triggered
- **110% threshold**: Emergency cleanup triggered

SizeMonitor runs automatically when worker/monitor is active and checks database sizes periodically.

### Manual Cleanup Commands

For on-demand cleanup operations, use:

```bash
# Run immediate cleanup manually
ashep work <issue-id>
# Cleanup runs as part of worker processing

# View cleanup metrics
ashep cleanup-metrics

# View cleanup system status and health
ashep cleanup-status
```

### Cleanup Configuration

Configure cleanup behavior in `config/config.yaml`:

```yaml
cleanup:
  enabled: true                      # Enable/disable cleanup system
  run_on_startup: true               # Run cleanup on worker/monitor start
  archive_on_startup: true            # Archive old runs on startup
  delete_on_startup: false             # Delete old runs on startup
  schedule_interval_hours: 24          # How often to run scheduled cleanup

retention:
  enabled: true
  policies:
    - name: "default"
      enabled: true
      age_days: 30
      max_runs: 1000
      max_size_mb: 500
      archive_enabled: true
      archive_after_days: 7
      delete_after_days: 90
      keep_successful_runs: false
      keep_failed_runs: true
      status_filters: []
      phase_filters: []
```

## Cleanup Types

### 1. Startup Cleanup

**When:** Worker/monitor starts (if `cleanup.run_on_startup: true`)

**What it does:**
- Archives old runs based on retention policies
- Deletes ancient data past delete threshold
- Enforces size limits if exceeded

**Health checks:** Runs automatic health validation after cleanup

### 2. Scheduled Cleanup

**When:** Every `cleanup.schedule_interval_hours` while worker/monitor running

**What it does:**
- Archives runs exceeding age thresholds
- Deletes runs past deletion window
- Enforces size limits
- Prevents overlapping runs (minimum 60 second interval)

**Health checks:** Runs automatic health validation after cleanup

### 3. Size-Triggered Cleanup

**When:** Database sizes approach limits (90%, 100%, 110%)

**What it does:**
- At 90%: Logs warning (no action)
- At 100%: Triggers critical cleanup (aggressive)
- At 110%: Triggers emergency cleanup (maximum aggression)

**Health checks:** Runs automatic health validation after cleanup

### 4. Manual Cleanup

**When:** Via `ashep cleanup-metrics` or `ashep cleanup-status`

**What it does:**
- Displays current cleanup metrics and statistics
- Shows system health status
- Runs health checks for current state

## Health Checks

### Automatic Health Checks

After every cleanup operation (startup, scheduled, critical, emergency), the system automatically runs health checks:

1. **Database Integrity**: Verifies SQLite database is not corrupted
2. **Query Functionality**: Tests that basic queries work
3. **Archive Accessibility**: Ensures archive database is accessible
4. **Size Reduction Validation**: Confirms cleanup actually reduced storage

Health check results are logged:
- ✅ All checks passed: "Health checks passed after [type] cleanup"
- ⚠️ Some checks failed: Detailed warnings for each failed check

### Manual Health Checks

Run health checks manually via status command:

```bash
ashep cleanup-status
```

This shows:
- Cleanup engine status (running/stopped)
- Last cleanup time
- Current size metrics (active DB, archive DB, JSONL files)
- Detailed health check results for each component
- Overall health status

## When Cleanup Does NOT Run

Cleanup only runs when:
1. **Worker or monitor is active**: `ashep worker` or `ashep monitor`
2. **Cleanup is enabled**: `cleanup.enabled: true` in config
3. **Retention policies exist**: `retention.policies` array is not empty
4. **Retention is enabled**: `retention.enabled: true` in config

**Scenarios where cleanup does NOT run:**
- Importing Logger in a script (no CLI command)
- Using Logger for queries in tests
- `cleanup.enabled: false`
- `retention.enabled: false` or no policies defined
- Running short-lived commands like `ashep work` without background process

This is intentional: cleanup is a background maintenance task for long-running processes, not a side effect of using Logger.

## Testing the Cleanup System

The test suite validates cleanup system components:

```bash
cd .agent-shepherd
bun test tests/cleanup-system.test.ts
```

Tests cover:
- Startup cleanup behavior
- Scheduled cleanup timing
- Size monitoring and alerts
- Emergency cleanup procedures
- Health check validation
- Metrics collection

## CLI Commands Reference

### cleanup-metrics

Display cleanup statistics and performance metrics.

```bash
ashep cleanup-metrics
```

Output:
- Total runs processed
- Total runs archived
- Total runs deleted
- Total bytes archived/deleted (in MB)
- Last cleanup time
- Average cleanup duration

### cleanup-status

Show current cleanup system status and health.

```bash
ashep cleanup-status
```

Output:
- Cleanup engine status (running/stopped)
- Last cleanup time
- Current size metrics (active DB, archive DB, JSONL, total)
- Run counts (active, archive)
- Detailed health check results for each component
- Overall health status

## Summary

The CLI-based architecture provides:
- ✅ Race condition prevention (clear initialization order)
- ✅ Lifecycle alignment (cleanup with long-running processes)
- ✅ Resource efficiency (single cleanup instance)
- ✅ Automatic cleanup when worker/monitor active
- ✅ Manual cleanup via CLI commands
- ✅ Automatic health checks after all cleanup operations
- ✅ Size monitoring with automatic cleanup triggering
- ✅ Comprehensive metrics and status reporting

The system maintains all required functionality while solving initialization concurrency issues through architectural improvements.
