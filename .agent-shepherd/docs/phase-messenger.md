# Phase Messenger

Phase messenger enables inter-phase communication, allowing phases to exchange data, context, and results. This system supports complex workflows where downstream phases need information from upstream phases, or where phases need to coordinate with each other.

## Overview

In traditional sequential workflows, each phase operates in isolation:

```
Phase A (execute) → Phase B (execute) → Phase C (execute)
```

Phase messenger adds communication:

```
Phase A (send result) → [Message Queue] → Phase B (receive) → Phase B (send result) → [Message Queue] → Phase C (receive)
```

**Key Features**:
- **Message passing**: Send structured data between phases
- **Automatic delivery**: Messages delivered when phase starts
- **Context preservation**: Keep important information across phase boundaries
- **Size management**: Automatic cleanup of old messages
- **Persistence**: Dual storage (JSONL + SQLite) for performance and reliability

## Message Types

### Context Messages

Provide context to upcoming phases:

```typescript
{
  id: "msg-123",
  issue_id: "ISSUE-001",
  from_phase: "plan",
  to_phase: "implement",
  run_counter: 1,
  message_type: "context",
  content: "Architecture decisions: Use microservices pattern, choose PostgreSQL for data layer",
  metadata: {
    architecture: "microservices",
    database: "postgresql"
  },
  read: false,
  created_at: 1704067200000
}
```

**Use Cases**:
- Architectural decisions from planning phase
- Requirements clarifications
- Technical constraints
- Design documents

### Result Messages

Report phase completion results:

```typescript
{
  id: "msg-124",
  issue_id: "ISSUE-001",
  from_phase: "test",
  to_phase: "deploy",
  run_counter: 1,
  message_type: "result",
  content: "All 500 tests passed (100% success rate)",
  metadata: {
    status: "completed",
    test_count: 500,
    failures: 0,
    coverage: 0.95
  },
  read: false,
  created_at: 1704067300000
}
```

**Use Cases**:
- Test results for deployment decisions
- Performance metrics for optimization
- Error details for debugging phases

### Decision Messages

Share AI decision reasoning:

```typescript
{
  id: "msg-125",
  issue_id: "ISSUE-001",
  from_phase: "test",
  to_phase: "deploy",
  run_counter: 1,
  message_type: "decision",
  content: "Decision agent selected 'deploy' based on test results",
  metadata: {
    decision: "advance_to_deploy",
    confidence: 0.92,
    reasoning: "All critical tests passed"
  },
  read: false,
  created_at: 1704067400000
}
```

**Use Cases**:
- AI decision explanations for human review
- Confidence scores for risk assessment
- Decision audit trail

### Data Messages

Pass arbitrary structured data:

```typescript
{
  id: "msg-126",
  issue_id: "ISSUE-001",
  from_phase: "implement",
  to_phase: "test",
  run_counter: 1,
  message_type: "data",
  content: "Implementation artifacts generated",
  metadata: {
    files_modified: 15,
    lines_added: 1250,
    lines_removed: 320,
    tests_added: 25
  },
  read: false,
  created_at: 1704067500000
}
```

**Use Cases**:
- Implementation metrics for test planning
- Code statistics for analysis
- Build artifacts for deployment

## Architecture

### Dual Storage

Phase messenger uses both JSONL (append-only) and SQLite (indexed):

**JSONL (Source of Truth)**
- File: `.agent-shepherd/messages.jsonl`
- Append-only log of all messages
- Immutable audit trail
- Easy backup and restore

**SQLite (Fast Queries)**
- File: `.agent-shepherd/messages.db`
- Indexed for fast lookups
- Efficient querying
- Used for runtime operations

**Synchronization**:
- Startup: Load JSONL into SQLite
- Write: Append to JSONL, upsert to SQLite
- Read: Query from SQLite (fast)
- Cleanup: Remove from both

### Message Lifecycle

```
1. Create Message
   ↓
2. Append to JSONL (immutable)
   ↓
3. Upsert to SQLite (indexed)
   ↓
4. Mark as read when received
   ↓
5. Automatic cleanup when limits reached
   ↓
6. Archive or delete based on retention policy
```

### Schema

**Table: `messages`**
```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL,
  from_phase TEXT NOT NULL,
  to_phase TEXT NOT NULL,
  run_counter INTEGER NOT NULL DEFAULT 1,
  message_type TEXT NOT NULL,           -- 'context', 'result', 'decision', 'data'
  content TEXT NOT NULL,
  metadata TEXT,                         -- JSON string
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);

-- Indexes for fast queries
CREATE INDEX idx_messages_issue_id ON messages(issue_id);
CREATE INDEX idx_messages_to_phase ON messages(to_phase);
CREATE INDEX idx_messages_from_phase ON messages(from_phase);
CREATE INDEX idx_messages_issue_phase ON messages(issue_id, to_phase);
CREATE INDEX idx_messages_issue_unread ON messages(issue_id, to_phase, read);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_messages_run_counter ON messages(issue_id, run_counter);
```

## Configuration

### Size Limits (`config/phase-messenger.yaml`)

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

### Size Management

When limits are reached, oldest **read** messages are automatically deleted:

**Per-Phase Limit** (`max_messages_per_issue_phase: 100`):
- Delete oldest read messages for that (issue, phase)
- Unread messages never deleted
- Ensures downstream phases receive messages

**Per-Issue Limit** (`max_messages_per_issue: 500`):
- Delete oldest read messages for that issue
- Unread messages preserved
- Prevents unbounded growth

**Example**:
```
Issue-123 phase "test" has 150 messages (exceeds limit: 100)
↓ Delete oldest READ message (created_at oldest, read: true)
↓ Now has 149 messages
↓ Delete next oldest READ message
↓ Repeat until ≤ 100 messages
```

## Using Phase Messenger

### Enabling Phase Messaging

Enable in transition configuration:

```yaml
phases:
  - name: test
    transitions:
      on_success:
        capability: test-decision
        allowed_destinations: [deploy, fix-bugs]
        messaging: true  # Enable phase messenger
```

**Effect**:
- Phase automatically sends result messages on successful completion
- Downstream phases receive messages before starting
- Automatic cleanup of old messages

### Sending Messages (Manual)

```typescript
const messenger = getPhaseMessenger();

const message = messenger.sendMessage({
  issue_id: "ISSUE-001",
  from_phase: "plan",
  to_phase: "implement",
  message_type: "context",
  content: "Architecture decisions: Use microservices pattern",
  metadata: {
    architecture: "microservices"
  }
});

console.log(`Sent message: ${message.id}`);
```

### Receiving Messages

```typescript
const messenger = getPhaseMessenger();

// Get unread messages for phase
const messages = messenger.receiveMessages("ISSUE-001", "test");

console.log(`Received ${messages.length} messages:`);
for (const msg of messages) {
  console.log(`- ${msg.from_phase}: ${msg.content}`);
  console.log(`  Metadata:`, msg.metadata);
}
```

**Behavior**:
- Retrieves all unread messages for that phase
- Marks messages as read automatically
- Returns empty array if no messages

### Listing Messages

```typescript
const messenger = getPhaseMessenger();

// Query all messages for issue
const allMessages = messenger.listMessages({
  issue_id: "ISSUE-001",
  limit: 50
});

// Query specific phase
const phaseMessages = messenger.listMessages({
  issue_id: "ISSUE-001",
  to_phase: "test"
});

// Query unread only
const unreadMessages = messenger.listMessages({
  issue_id: "ISSUE-001",
  to_phase: "test",
  read: false
});

// Query specific message type
const contextMessages = messenger.listMessages({
  issue_id: "ISSUE-001",
  message_type: "context"
});
```

### Message Statistics

```typescript
const messenger = getPhaseMessenger();

// Get stats for issue
const stats = messenger.getMessageStats("ISSUE-001");

console.log(`Total messages: ${stats.total_messages}`);
console.log(`Unread: ${stats.unread_messages}`);
console.log(`Read: ${stats.read_messages}`);
console.log(`Database size: ${stats.db_size_mb}MB`);

// Get global stats
const globalStats = messenger.getMessageStats();
console.log(`Total issues: ${Object.keys(globalStats.by_issue).length}`);
```

## Automatic Integration

### Result Messages (Automatic)

When `messaging: true` in transition config, result messages are sent automatically:

```yaml
phases:
  - name: test
    transitions:
      on_success:
        capability: test-decision
        allowed_destinations: [deploy, fix-bugs]
        messaging: true  # Auto-send result messages
```

**Automatic Message Content**:
```typescript
{
  message_type: "result",
  content: outcome.message || "Phase completed successfully",
  metadata: {
    status: "completed",
    artifacts: outcome.artifacts?.length || 0,
    duration_ms: outcome.metrics?.duration_ms
  }
}
```

**Benefits**:
- No manual message sending required
- Consistent message format
- Automatic cleanup handling

### Message Receipt (Automatic)

When a phase starts, it automatically receives pending messages:

```typescript
// Worker engine (automatic)
const pendingMessages = phaseMessenger.receiveMessages(issue.id, phase, true);
if (pendingMessages.length > 0) {
  console.log(`Received ${pendingMessages.length} pending message(s)`);
  // Use messages in phase execution
}
```

**Automatic Processing**:
- Messages delivered before phase execution
- Marked as read automatically
- Logged in decision history

## CLI Tool

### Get Messages Command

View phase messages from the command line:

```bash
# Get all messages for an issue
ashep get-messages ISSUE-123

# Get messages for specific phase
ashep get-messages ISSUE-123 --phase implement

# Get only unread messages
ashep get-messages ISSUE-123 --unread

# Get unread messages for specific phase
ashep get-messages ISSUE-123 --phase test --unread
```

**Output Format:**
```
Messages (2):
┌─────────────────┬───────────┬───────────┬─────────────────────────────────────┬─────────┬──────────────┐
│ ID              │ Type      │ Read      │ Content                          │ From    │ To           │
├─────────────────┼───────────┼───────────┼─────────────────────────────────────┼─────────┼──────────────┤
│ msg-1234567890  │ context   │ ✓         │ Planning completed                │ plan     │ implement    │
│ msg-9876543210  │ result    │ ✗         │ Tests passed                   │ test     │ deploy      │
└─────────────────┴───────────┴───────────┴─────────────────────────────────────┴─────────┴──────────────┘
```

**Use Cases:**
- **Debug workflows**: Check what messages were sent between phases
- **Verify communication**: Ensure messages are being delivered correctly
- **Inspect context**: View what context/data was passed to a phase
- **Troubleshoot**: Identify why a phase didn't receive expected messages

**Tips:**
- Use `--phase` to filter messages for a specific workflow phase
- Use `--unread` to see only messages not yet consumed by agents
- The Read column shows ✓ for read messages and ✗ for unread

## Cleanup and Archival

### Manual Cleanup

```bash
# Archive messages for specific issue
ashep cleanup-messages --issue ISSUE-123 --archive

# Delete messages for specific issue
ashep cleanup-messages --issue ISSUE-123 --delete

# View cleanup metrics
ashep cleanup-messages --metrics
```

### Automatic Cleanup

Messages follow same retention policy as runs:

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

### Cleanup Metrics

```typescript
const messenger = getPhaseMessenger();

// Get cleanup metrics for issue
const metrics = messenger.getCleanupMetrics("ISSUE-123");

console.log(`Archived: ${metrics[0].messages_archived} messages`);
console.log(`Deleted: ${metrics[0].messages_deleted} messages`);
console.log(`DB size before: ${metrics[0].db_size_before_mb}MB`);
console.log(`DB size after: ${metrics[0].db_size_after_mb}MB`);
```

## Best Practices

### 1. Use Appropriate Message Types

Choose message type based on purpose:

```typescript
// Context: Planning decisions
message_type: "context"

// Result: Phase completion
message_type: "result"

// Decision: AI routing
message_type: "decision"

// Data: Arbitrary information
message_type: "data"
```

### 2. Keep Messages Concise

Respect size limits:

```typescript
// Good: Concise summary
content: "Architecture: microservices, DB: PostgreSQL"

// Bad: Entire design document
content: "Full architecture document with 50 pages..."
```

### 3. Use Metadata for Structured Data

Separate content from structured data:

```typescript
{
  content: "Test execution completed",
  metadata: {
    test_count: 500,
    failures: 0,
    coverage: 0.95,
    duration_ms: 12000
  }
}
```

### 4. Enable Automatic Messaging

Use `messaging: true` for consistent behavior:

```yaml
phases:
  - name: test
    transitions:
      on_success:
        capability: test-decision
        allowed_destinations: [deploy, fix-bugs]
        messaging: true  # Enable automatic messaging
```

### 5. Monitor Message Statistics

Track message usage:

```typescript
const stats = messenger.getMessageStats();

if (stats.unread_messages > 50) {
  console.warn("High message backlog - may indicate issue");
}
```

## Troubleshooting

### Messages Not Delivered

**Problem**: Phase doesn't receive expected messages

**Diagnose**:
1. Check `messaging: true` in transition config
2. Verify message sent with correct `to_phase`
3. Review message logs for errors

**Solution**:
```typescript
// Check for sent messages
const sent = messenger.listMessages({
  issue_id: "ISSUE-001",
  from_phase: "test",
  to_phase: "deploy"
});

console.log("Sent messages:", sent);

// Check for received messages
const received = messenger.listMessages({
  issue_id: "ISSUE-001",
  to_phase: "deploy"
});

console.log("Received messages:", received);
```

### Database Too Large

**Problem**: Messages database growing unbounded

**Solution**: Adjust cleanup configuration:

```yaml
size_limits:
  max_messages_per_issue_phase: 50  # Reduce from 100
  max_messages_per_issue: 200         # Reduce from 500

cleanup:
  default_max_age_days: 30  # More aggressive cleanup
```

### Size Limit Errors

**Problem**: Messages rejected due to size limits

**Solution**: Compress or truncate messages:

```typescript
// Split large content across multiple messages
const largeContent = "Very long content...";
const chunks = largeContent.match(/.{1,10000}/g);

for (let i = 0; i < chunks.length; i++) {
  messenger.sendMessage({
    issue_id: "ISSUE-001",
    from_phase: "source",
    to_phase: "dest",
    message_type: "data",
    content: chunks[i],
    metadata: { chunk_index: i, total_chunks: chunks.length }
  });
}
```

### Sync Issues Between JSONL and SQLite

**Problem**: Database inconsistency between JSONL and SQLite

**Solution**: Rebuild SQLite from JSONL:

```bash
# Backup current state
cp .agent-shepherd/messages.db .agent-shepherd/messages.db.backup
cp .agent-shepherd/messages.jsonl .agent-shepherd/messages.jsonl.backup

# Rebuild from scratch
rm .agent-shepherd/messages.db
# Restart Agent Shepherd - will rebuild from JSONL
```

## Advanced Topics

### Message Aggregation

Combine multiple messages for comprehensive context:

```typescript
const messages = messenger.receiveMessages("ISSUE-001", "phase-b");

// Aggregate by type
const byType = messages.reduce((acc, msg) => {
  acc[msg.message_type] = acc[msg.message_type] || [];
  acc[msg.message_type].push(msg);
  return acc;
}, {});

console.log("Context messages:", byType.context);
console.log("Result messages:", byType.result);
console.log("Decision messages:", byType.decision);
```

### Message Prioritization

Process messages in priority order:

```typescript
const messages = messenger.receiveMessages("ISSUE-001", "phase-b");

// Sort by type priority
const priority = { context: 1, decision: 2, result: 3, data: 4 };
messages.sort((a, b) => priority[a.message_type] - priority[b.message_type]);

console.log("Processing messages in priority order:");
for (const msg of messages) {
  console.log(`1. ${msg.message_type}: ${msg.content}`);
}
```

### Custom Message Handlers

Implement message processing logic:

```typescript
class MessageHandler {
  constructor(private messenger: PhaseMessenger) {}

  handlePhaseStart(issueId: string, phase: string): void {
    const messages = this.messenger.receiveMessages(issueId, phase);

    // Process context messages first
    const context = messages.filter(m => m.message_type === "context");
    this.applyContext(context);

    // Then process results
    const results = messages.filter(m => m.message_type === "result");
    this.analyzeResults(results);
  }

  private applyContext(context: PhaseMessage[]): void {
    // Apply planning decisions to implementation
  }

  private analyzeResults(results: PhaseMessage[]): void {
    // Analyze test results for deployment decisions
  }
}
```

## Related Documentation

- [Enhanced Transitions](./enhanced-transitions.md) - Enabling messaging in transitions
- [Garbage Collection](./garbage-collection.md) - Message cleanup and archival
- [Architecture](./architecture.md) - System design and data flow
