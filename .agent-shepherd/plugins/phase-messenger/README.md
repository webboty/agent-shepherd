# Phase Messenger Plugin

Inter-phase communication plugin for Agent Shepherd that enables message passing between workflow phases.

## Overview

The Phase Messenger Plugin allows different phases of a workflow to communicate with each other through structured messages. This enables:
- Passing context from plan → implement
- Reporting results from implement → test
- Communicating decisions that affect subsequent phases
- Sharing data payloads (metrics, artifacts, references)

**Important**: The plugin only works for **inter-phase transitions** (e.g., plan → implement, implement → test). It does **not** send messages to "close" or other terminal transitions, as those are not phases but issue lifecycle events.

## Installation

The plugin is installed in `.agent-shepherd/plugins/phase-messenger/`.

## Commands

### Send a Message

```bash
ashep phase-msg-send <issue-id> <from-phase> <to-phase> <message-type> <content> [metadata-json]
```

**Parameters:**
- `issue-id`: Beads issue identifier
- `from-phase`: Source phase (sender)
- `to-phase`: Target phase (receiver)
- `message-type`: Type of message (context, result, decision, data)
- `content`: Message content (text or JSON string)
- `metadata-json`: Optional JSON metadata (priority, status, etc.)

**Example:**
```bash
# Send context message
ashep phase-msg-send agent-shepherd-alg8.1 plan implement context "Implement user authentication with JWT"

# Send result with metadata
ashep phase-msg-send agent-shepherd-alg8.1 implement test result '{"status": "completed", "tests_passed": 15}' '{"priority": "high"}'

# Send data payload
ashep phase-msg-send agent-shepherd-alg8.1 test implement data '{"metrics": {"latency_ms": 45, "throughput_rps": 1000}}'
```

### Receive Messages

```bash
ashep phase-msg-receive <issue-id> <phase> [--keep-unread]
```

**Parameters:**
- `issue-id`: Beads issue identifier
- `phase`: Target phase to receive messages for
- `--keep-unread`: Optional flag to keep messages as unread

**Example:**
```bash
# Receive and mark as read
ashep phase-msg-receive agent-shepherd-alg8.1 implement

# Receive but keep unread status
ashep phase-msg-receive agent-shepherd-alg8.1 implement --keep-unread
```

### List Messages

```bash
ashep phase-msg-list <issue-id> [phase] [message-type]
```

**Parameters:**
- `issue-id`: Beads issue identifier
- `phase`: Optional filter by target phase
- `message-type`: Optional filter by message type

**Example:**
```bash
# List all messages for issue
ashep phase-msg-list agent-shepherd-alg8.1

# List messages for specific phase
ashep phase-msg-list agent-shepherd-alg8.1 implement

# List specific message type
ashep phase-msg-list agent-shepherd-alg8.1 implement result
```

## Message Types

### context
Contextual information for the next phase.

**Use Case:** Design specs, requirements, documentation
```bash
ashep phase-msg-send agent-shepherd-alg8.1 plan implement context "Implement OAuth 2.0 authentication flow"
```

### result
Results or outcomes from a completed phase.

**Use Case:** Implementation status, test results, completion reports
```bash
ashep phase-msg-send agent-shepherd-alg8.1 implement test result '{"status": "completed", "files": 15}'
```

### decision
Decision made during a phase that affects subsequent phases.

**Use Case:** Architecture choices, library selection, trade-off documentation
```bash
ashep phase-msg-send agent-shepherd-alg8.1 plan implement decision 'Chose JWT over session-based auth for scalability'
```

### data
Arbitrary data payload or artifacts.

**Use Case:** Performance metrics, artifact references, configuration data
```bash
ashep phase-msg-send agent-shepherd-alg8.1 test implement data '{"latency_ms": 45, "throughput_rps": 1000}'
```

## Integration with Worker Engine

The phase messenger provides optional integration with Worker Engine for automatic inter-phase communication.

### Optional Plugin Architecture

The plugin is designed to be **truly optional**:

- **Plugin Directory** (`plugins/phase-messenger/`): CLI commands - fully removable
- **Core Integration** (`src/core/phase-messenger.ts`): Worker Engine integration - optional
- **Worker Engine**: Gracefully degrades when PhaseMessenger is unavailable

### How Worker Engine Uses PhaseMessenger

Worker Engine automatically:
1. **Receives pending messages** before starting a phase
2. **Sends result messages** when a phase completes successfully and advances

If PhaseMessenger is not available, Worker Engine continues working normally - messaging is simply skipped.

### Manual Integration

You can also manually use PhaseMessenger in your code:

```typescript
// Optional import with error handling
try {
  const { getPhaseMessenger } = await import("./phase-messenger.ts");
  const messenger = getPhaseMessenger();

  // Send a message
  const message = messenger.sendMessage({
    issue_id: "agent-shepherd-alg8.1",
    from_phase: "plan",
    to_phase: "implement",
    message_type: "context",
    content: "Design specs completed",
    metadata: { priority: "high" }
  });

  // Receive messages
  const messages = messenger.receiveMessages(
    "agent-shepherd-alg8.1",
    "implement",
    true  // mark as read
  );

  // List messages
  const allMessages = messenger.listMessages({
    issue_id: "agent-shepherd-alg8.1",
    to_phase: "implement"
  });

  // Get unread count
  const unreadCount = messenger.getUnreadCount(
    "agent-shepherd-alg8.1",
    "implement"
  );
} catch (error) {
  console.warn("Phase Messenger not available:", error);
}
```

### Removing the Plugin

To remove the plugin and disable all messaging functionality:

```bash
# Remove plugin directory (CLI commands)
rm -rf .agent-shepherd/plugins/phase-messenger

# Remove core integration (Worker Engine integration)
rm .agent-shepherd/src/core/phase-messenger.ts

# Worker Engine will continue working, just without messaging
```

## Storage

Messages are stored using dual storage:

- **JSONL** (`.agent-shepherd/messages.jsonl`): Append-only audit trail (source of truth)
- **SQLite** (`.agent-shepherd/messages.db`): Indexed cache for fast queries

### Configuration

Plugin settings are configured in `.agent-shepherd/config/phase-messenger.yaml`:

```yaml
size_limits:
  max_content_length: 10000              # Maximum message content length in characters
  max_metadata_length: 5000              # Maximum metadata size in characters (JSON string)
  max_messages_per_issue_phase: 100      # Maximum messages per issue-phase combination
  max_messages_per_issue: 500            # Maximum total messages per issue

cleanup:
  default_max_age_days: 90              # Age (in days) after which old read messages can be deleted
  keep_last_n_per_phase: 10             # Number of recent messages to keep per phase
  keep_last_n_runs: 1                   # Number of recent run iterations to keep

storage:
  data_dir: ".agent-shepherd"           # Data directory for message storage
  database_file: "messages.db"           # Database filename
  jsonl_file: "messages.jsonl"         # JSONL audit trail filename
```

### Default Size Limits

- Maximum message content: 10,000 characters
- Maximum metadata size: 5,000 characters (JSON string)
- Maximum messages per issue-phase: 100
- Maximum total messages per issue: 500

When limits are exceeded, oldest **read** messages are automatically deleted.

To customize these limits, edit `.agent-shepherd/config/phase-messenger.yaml`.

## Cleanup

Messages can be cleaned up manually using the MessageStorage class:

```javascript
const { MessageStorage } = require('./lib/message-storage.js');

const storage = new MessageStorage();

// Cleanup old messages (older than 90 days)
const result = storage.cleanupOldMessages({ maxAgeDays: 90 });
console.log(`Deleted ${result.deleted} old messages`);

// Cleanup messages from older run iterations
storage.cleanupByRunCounter("agent-shepherd-alg8.1", 1);

// Get cleanup statistics
const stats = storage.getCleanupStats();
console.log(stats);

storage.close();
```

## Best Practices

1. **Use Appropriate Message Types**
   - Use `context` for background information
   - Use `result` for phase outcomes
   - Use `decision` for important choices
   - Use `data` for structured payloads

2. **Keep Messages Concise**
   - Focus on actionable information
   - Use external references for large docs
   - Respect size limits (10KB content, 5KB metadata)

3. **Mark Messages as Read**
   - Read messages are eligible for cleanup
   - Use `--keep-unread` only when needed

4. **Use Metadata for Context**
   - Add priority levels for important messages
   - Include metadata for filtering and sorting
   - Document data sources and timestamps

## Example Workflow

```bash
# Plan phase sends context to implement
ashep phase-msg-send agent-shepherd-alg8.1 plan implement context "Implement REST API with /users endpoint"

# Implement phase sends result to test
ashep phase-msg-send agent-shepherd-alg8.1 implement test result '{"status": "completed", "endpoints": 5}'

# Test phase receives messages
ashep phase-msg-receive agent-shepherd-alg8.1 test

# Test phase sends metrics back to implement
ashep phase-msg-send agent-shepherd-alg8.1 test implement data '{"latency_ms": 45, "error_rate": 0.01}'

# List all messages for issue
ashep phase-msg-list agent-shepherd-alg8.1
```

## Troubleshooting

### Message Not Appearing
- Check that `messages.jsonl` and `messages.db` exist in `.agent-shepherd/`
- Verify issue_id, from_phase, and to_phase are correct
- Check SQLite database for corruption (recreate by deleting files)

### Size Limit Errors
- Reduce content or metadata size
- Consider storing large data externally and referencing via URL
- Use cleanup commands to free up space

### Old Messages Not Deleting
- Ensure messages are marked as read (old messages are only cleaned up if read)
- Check cleanup age thresholds (default: 90 days)
- Manually trigger cleanup using MessageStorage class

## Testing

Run the comprehensive test suite:

```bash
bun test tests/phase-messenger.test.ts
```

Tests cover:
- Message creation and storage
- Message retrieval (by issue, phase, type)
- Read/unread tracking
- Dual storage consistency
- Size limit enforcement
- Cleanup operations
- Integration workflows
