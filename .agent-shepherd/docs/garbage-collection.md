# Garbage Collection

Garbage collection manages the lifecycle of run data, ensuring optimal performance and storage efficiency. The system automatically archives old data and permanently deletes ancient records based on configurable retention policies.

## Overview

Agent Shepherd stores run data in two locations:
- **Active Database** (`runs.db`) - Current and recent runs for fast queries
- **Archive Database** (`archive/archive.db`) - Historical run data for audit trail

Over time, active database grows unbounded without cleanup. Garbage collection:
- Archives old runs from active to archive database
- Deletes ancient data beyond retention period
- Enforces size limits (run count, disk usage)
- Maintains audit trail with metadata

## Retention Policies

### Policy Structure

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
```

### Policy Fields

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| `name` | string | Yes | Unique policy identifier |
| `description` | string | No | Human-readable description |
| `enabled` | boolean | Yes | Whether policy is active |
| `age_days` | number | Yes | Age threshold for archiving (days) |
| `max_runs` | number | No | Maximum run count limit |
| `max_size_mb` | number | No | Maximum database size limit (MB) |
| `archive_enabled` | boolean | Yes | Whether to archive before delete |
| `archive_after_days` | number | No | When to archive (overrides `age_days`) |
| `delete_after_days` | number | No | When to permanently delete |
| `status_filter` | array | No | Filter by run status (e.g., `["completed"]`) |
| `phase_filter` | array | No | Filter by phase name (e.g., `["test"]`) |
| `keep_successful_runs` | boolean | No | Don't delete successful runs |
| `keep_failed_runs` | boolean | No | Don't delete failed runs |

## Cleanup Operations

### 1. Archive Old Runs

Moves old runs from active database to archive database.

**Trigger**: Runs older than `archive_after_days` or `age_days`

**Process**:
1. Query active database for old runs
2. For each run matching policy:
   - Copy to `archive.db`
   - Append to `archive.jsonl` (audit trail)
   - Delete from `runs.db`
3. Record metrics

**Configuration**:
```yaml
retention_policies:
  - name: "archive-after-30-days"
    enabled: true
    age_days: 90
    archive_enabled: true
    archive_after_days: 30  # Archive after 30 days
```

**Example**:
```
Active DB (runs.db):
  - run-001 (created 2024-01-01, age 365 days) → Archive
  - run-002 (created 2024-06-01, age 180 days) → Archive
  - run-003 (created 2024-09-01, age 90 days) → Archive
  - run-004 (created 2024-12-01, age 30 days) → Keep (active)
```

### 2. Delete Ancient Data

Permanently removes data beyond retention period.

**Trigger**: Runs older than `delete_after_days`

**Process**:
1. Query archive database for ancient runs
2. Delete from `archive.db`
3. Delete decision records
4. Record metrics

**Configuration**:
```yaml
retention_policies:
  - name: "delete-after-1-year"
    enabled: true
    delete_after_days: 365  # Delete after 1 year
```

**Example**:
```
Archive DB (archive/archive.db):
  - run-001 (archived 2024-01-01, age 365 days) → Delete
  - run-002 (archived 2024-06-01, age 180 days) → Keep
```

### 3. Enforce Size Limits

Removes oldest runs when database exceeds limits.

**Triggers**:
- Total runs > `max_runs`
- Database size > `max_size_mb`

**Process**:
1. Calculate total runs and size
2. If exceeds limits:
   - Sort by age (oldest first)
   - Archive or delete until within limits
3. Record metrics

**Configuration**:
```yaml
retention_policies:
  - name: "size-limits"
    enabled: true
    max_runs: 1000           # Maximum 1000 runs
    max_size_mb: 500          # Maximum 500MB
    archive_enabled: true       # Archive before delete
```

**Example**:
```
Active DB state:
  - 1200 runs (exceeds max_runs: 1000)
  - 600MB (exceeds max_size_mb: 500)

Cleanup:
  - Delete/archive 200 oldest runs
  - Result: 1000 runs, 450MB
```

## Data Flow

### Archive Lifecycle

```
Active DB (runs.db)
  ↓ [age > archive_after_days]
Archive DB (archive/archive.db)
  ↓ [age > delete_after_days]
Deleted (permanently removed)
```

### Decision Records

Decisions are archived and deleted alongside their parent runs:

```
run-001 (archived)
  ├─ decision-001 (archived)
  ├─ decision-002 (archived)
  └─ decision-003 (archived)
  ↓ [run deleted]
All decisions deleted
```

## Configuration

### Retention Policies (config.yaml)

```yaml
retention_policies:
  - name: "standard-retention"
    description: "Standard 90-day retention with 1-year archive"
    enabled: true
    age_days: 90
    max_runs: 1000
    max_size_mb: 500
    archive_enabled: true
    archive_after_days: 30
    delete_after_days: 365

  - name: "aggressive-cleanup"
    description: "Aggressive cleanup for high-volume workflows"
    enabled: false  # Disabled by default
    age_days: 30
    max_runs: 500
    max_size_mb: 200
    archive_enabled: false  # Direct deletion, no archive

  - name: "keep-successful"
    description: "Archive failed runs only, keep successful"
    enabled: false
    age_days: 90
    archive_enabled: true
    keep_successful_runs: true  # Don't delete successful runs
    delete_after_days: 365

  - name: "test-phase-only"
    description: "Aggressively clean up test phase runs"
    enabled: false
    age_days: 7
    archive_enabled: false
    phase_filter: ["test", "staging-test"]
    delete_after_days: 30
```

## Cleanup Metrics

### Metrics Structure

```typescript
metrics = {
  timestamp: 1704067200000,
  policy_name: "standard-retention",
  operation: "archive",  // "archive", "delete", or "cleanup"
  runs_processed: 1500,
  runs_archived: 500,
  runs_deleted: 200,
  bytes_archived: 250000000,  // ~238MB
  bytes_deleted: 100000000,    // ~95MB
  duration_ms: 1250,
  error: null  // or error message
}
```

### Querying Metrics

```typescript
const gc = getGarbageCollector({ policies });

// Get all metrics
const allMetrics = gc.getMetrics();

// Get metrics for specific policy
const policyMetrics = gc.getMetrics({
  policy_name: "standard-retention"
});

// Get recent metrics (last 7 days)
const recentMetrics = gc.getMetrics({
  since: Date.now() - (7 * 24 * 60 * 60 * 1000)
});

// Get aggregate stats
const aggregate = gc.getMetrics().reduce((acc, m) => ({
  total_archived: acc.total_archived + m.runs_archived,
  total_deleted: acc.total_deleted + m.runs_deleted,
  bytes_freed: acc.bytes_freed + m.bytes_archived + m.bytes_deleted
}), { total_archived: 0, total_deleted: 0, bytes_freed: 0 });
```

### Viewing Metrics

Metrics are stored in `archive/archive.db`:

```sql
SELECT
  timestamp,
  policy_name,
  operation,
  runs_archived,
  runs_deleted,
  bytes_archived / 1024 / 1024 as mb_archived,
  bytes_deleted / 1024 / 1024 as mb_deleted,
  duration_ms,
  error
FROM cleanup_metrics
ORDER BY timestamp DESC
LIMIT 100;
```

## Running Cleanup

### Manual Cleanup

```bash
# Run full cleanup (archive + delete + size limits)
ashep cleanup

# Archive only (no deletion)
ashep cleanup --archive-only

# Delete only (no archiving)
ashep cleanup --delete-only

# Enforce size limits only
ashep cleanup --size-limits-only

# Verbose output
ashep cleanup --verbose
```

### Scheduled Cleanup

Use system scheduler for automated cleanup:

```bash
# Run daily cleanup at 2am
0 2 * * * cd /path/to/project && ashep cleanup

# Run weekly cleanup on Sunday at 3am
0 3 * * 0 cd /path/to/project && ashep cleanup
```

### Cleanup in Worker

Enable automatic cleanup in worker loop:

```yaml
# config.yaml
cleanup:
  enabled: true
  schedule_interval_hours: 24  # Run cleanup every 24 hours
  max_runtime_minutes: 30    # Limit cleanup duration
```

## Archive Database

### Schema

**Table: `runs_archive`**
```sql
CREATE TABLE runs_archive (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  policy_name TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  outcome TEXT,           -- JSON string
  metadata TEXT,           -- JSON string
  archived_at INTEGER NOT NULL,
  retention_policy TEXT NOT NULL,
  scheduled_delete_at INTEGER
);

-- Indexes for fast queries
CREATE INDEX idx_runs_archive_issue_id ON runs_archive(issue_id);
CREATE INDEX idx_runs_archive_agent_id ON runs_archive(agent_id);
CREATE INDEX idx_runs_archive_status ON runs_archive(status);
CREATE INDEX idx_runs_archive_archived_at ON runs_archive(archived_at);
CREATE INDEX idx_runs_archive_scheduled_delete ON runs_archive(scheduled_delete_at);
```

**Table: `decisions_archive`**
```sql
CREATE TABLE decisions_archive (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  decision TEXT NOT NULL,
  reasoning TEXT,
  metadata TEXT,
  FOREIGN KEY (run_id) REFERENCES runs_archive(id)
);

CREATE INDEX idx_decisions_archive_run_id ON decisions_archive(run_id);
CREATE INDEX idx_decisions_archive_type ON decisions_archive(type);
```

**Table: `cleanup_metrics`**
```sql
CREATE TABLE cleanup_metrics (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  policy_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  runs_processed INTEGER NOT NULL,
  runs_archived INTEGER NOT NULL,
  runs_deleted INTEGER NOT NULL,
  bytes_archived INTEGER NOT NULL,
  bytes_deleted INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  error TEXT
);

CREATE INDEX idx_cleanup_metrics_timestamp ON cleanup_metrics(timestamp);
CREATE INDEX idx_cleanup_metrics_policy ON cleanup_metrics(policy_name);
```

### Querying Archived Data

```sql
-- Find archived runs for an issue
SELECT * FROM runs_archive
WHERE issue_id = 'ISSUE-123'
ORDER BY archived_at DESC;

-- Find all archived runs from specific phase
SELECT * FROM runs_archive
WHERE phase = 'test'
AND archived_at > strftime('%s', 'now') - (7 * 24 * 3600)
ORDER BY archived_at DESC;

-- Find runs scheduled for deletion
SELECT * FROM runs_archive
WHERE scheduled_delete_at IS NOT NULL
AND scheduled_delete_at < strftime('%s', 'now')
ORDER BY scheduled_delete_at ASC;

-- View decisions for archived run
SELECT d.* FROM decisions_archive d
JOIN runs_archive r ON d.run_id = r.id
WHERE r.id = 'run-001';
```

## Message Cleanup

Messages follow the same retention policy as runs:

### Retention

Messages are cleaned up when their associated run is archived or deleted:

```yaml
retention_policies:
  - name: "standard-retention"
    age_days: 90
    archive_enabled: true
    archive_after_days: 30
    delete_after_days: 365
```

**Behavior**:
- Run archived → Messages archived to `messages_archive/ISSUE-ID.jsonl`
- Run deleted → Messages deleted permanently

### Manual Message Cleanup

```bash
# Archive messages for specific issue
ashep cleanup-messages --issue ISSUE-123 --archive

# Delete messages for specific issue
ashep cleanup-messages --issue ISSUE-123 --delete

# View message cleanup metrics
ashep cleanup-messages --metrics
```

## Best Practices

### 1. Always Archive Before Delete

```yaml
archive_enabled: true  # Enable audit trail
```

**Benefits**:
- Historical data available for debugging
- Compliance with audit requirements
- Ability to restore if needed

### 2. Set Appropriate Retention Periods

Match retention to business needs:

```yaml
# Compliance-heavy (long retention)
delete_after_days: 2555  # 7 years

# Development environment (short retention)
delete_after_days: 30      # 1 month

# Production (moderate retention)
delete_after_days: 365     # 1 year
```

### 3. Use Filters for Selective Cleanup

```yaml
# Only clean up failed runs from test phase
retention_policies:
  - name: "test-failures-only"
    enabled: true
    status_filter: ["failed"]
    phase_filter: ["test"]
    delete_after_days: 7
```

### 4. Monitor Cleanup Metrics

Track cleanup performance:

```typescript
const metrics = getCleanupMetrics({
  policy_name: "standard-retention"
});

console.log(`Archived: ${metrics.runs_archived} runs`);
console.log(`Deleted: ${metrics.runs_deleted} runs`);
console.log(`Freed: ${metrics.bytes_deleted / 1024 / 1024}MB`);
```

### 5. Schedule Regular Cleanup

```bash
# Daily automated cleanup
0 2 * * * ashep cleanup --verbose | tee /var/log/ashep-cleanup.log
```

## Troubleshooting

### Cleanup Not Running

**Problem**: Garbage collection doesn't execute

**Diagnose**:
1. Check policies are `enabled: true`
2. Verify run age exceeds thresholds
3. Review logs for errors

**Solution**:
```bash
# Check policy configuration
cat .agent-shepherd/config/config.yaml | grep -A 20 retention_policies

# Check run ages
ashep query-runs --format json | jq '.[] | {id, created_at, age_days: (now - .created_at) / 86400}'

# Run cleanup with verbose output
ashep cleanup --verbose
```

### Archive Database Too Large

**Problem**: Archive database growing unbounded

**Solution**: Add deletion policy:

```yaml
retention_policies:
  - name: "cleanup-archive"
    enabled: true
    delete_after_days: 365  # Delete after 1 year
```

### Metrics Not Recording

**Problem**: Cleanup metrics not appearing in database

**Diagnose**:
1. Check write permissions to `archive/` directory
2. Verify `archive.db` is accessible
3. Review logs for database errors

**Solution**:
```bash
# Check permissions
ls -la .agent-shepherd/archive/

# Verify database accessible
sqlite3 .agent-shepherd/archive/archive.db "SELECT COUNT(*) FROM cleanup_metrics;"
```

### Performance Issues

**Problem**: Cleanup takes too long

**Diagnose**:
1. Check number of runs to process
2. Review cleanup duration metrics
3. Identify slow queries

**Solution**:
```yaml
# Limit cleanup runtime
cleanup:
  max_runtime_minutes: 30  # Stop after 30 minutes
```

Or adjust policies for more aggressive cleanup:
```yaml
# More frequent, smaller cleanups
age_days: 30  # Archive sooner
```

## Advanced Topics

### Custom Cleanup Logic

Implement custom cleanup plugins:

```typescript
// Example: Cleanup by agent performance
class AgentPerformanceCleanup {
  async cleanup(agentId: string): Promise<CleanupResult> {
    const poorPerformanceRuns = this.findPoorPerformanceRuns(agentId);
    for (const run of poorPerformanceRuns) {
      await this.archiveRun(run, "agent-performance");
    }
    return { success: true, metrics: ... };
  }
}
```

### Archive Restoration

Restore archived runs to active database:

```sql
-- Copy from archive to active
INSERT INTO runs (SELECT * FROM runs_archive WHERE id = 'run-001');

-- Restore associated decisions
INSERT INTO decisions (SELECT * FROM decisions_archive WHERE run_id = 'run-001');
```

**Use Case**: Debug historical issues or reproduce problems.

### Cross-Instance Archiving

Archive to central storage for distributed deployments:

```typescript
const gc = getGarbageCollector(config);

// Archive to remote storage
await gc.archiveToS3({
  bucket: 'ashep-archives',
  prefix: 'production/',
  retention_days: 365
});
```

## Related Documentation

- [Logging System](../architecture.md#logging-system) - Run data storage
- [Phase Messenger](./phase-messenger.md) - Message cleanup
- [Configuration Reference](./config-config.md) - Global cleanup settings
- [Policies Configuration](./policies-config.md) - Policy-level cleanup
