# Message Storage Schema Design

## Database Schema (messages.db)

### Table: messages

```sql
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL,
  from_phase TEXT NOT NULL,
  to_phase TEXT NOT NULL,
  run_counter INTEGER NOT NULL DEFAULT 1,
  message_type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  read BOOLEAN NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
```

### Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_messages_issue_id ON messages(issue_id);
CREATE INDEX IF NOT EXISTS idx_messages_to_phase ON messages(to_phase);
CREATE INDEX IF NOT EXISTS idx_messages_from_phase ON messages(from_phase);
CREATE INDEX IF NOT EXISTS idx_messages_issue_phase ON messages(issue_id, to_phase);
CREATE INDEX IF NOT EXISTS idx_messages_issue_unread ON messages(issue_id, to_phase, read);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_run_counter ON messages(issue_id, run_counter);
```

## JSONL File (messages.jsonl)

Each line is a JSON object representing a message:

```json
{
  "id": "msg-<timestamp>-<random>",
  "issue_id": "agent-shepherd-alg8.1",
  "from_phase": "plan",
  "to_phase": "implement",
  "run_counter": 1,
  "message_type": "context",
  "content": "Task context and requirements",
  "metadata": {
    "sender": "agent-id",
    "priority": "high"
  },
  "read": false,
  "created_at": 1736328000000,
  "read_at": null
}
```

## Design Rationale

### Fields

- **id**: Unique message identifier (timestamp + random)
- **issue_id**: Links to Beads issue for tracking
- **from_phase**: Source phase (sender)
- **to_phase**: Target phase (receiver)
- **run_counter**: Tracks workflow execution number (allows multiple iterations)
- **message_type**: Type classification (context, result, decision, data)
- **content**: Flexible text or JSON content
- **metadata**: Optional additional data (structured JSON)
- **read**: Boolean flag for message acknowledgment
- **created_at**: Unix timestamp (milliseconds)
- **read_at**: Unix timestamp when message was read (null if unread)

### Message Types

- **context**: Contextual information for next phase (e.g., design docs, requirements)
- **result**: Results from completed phase (e.g., implementation status, test results)
- **decision**: Decision made during phase (e.g., architecture choice, trade-offs)
- **data**: Arbitrary data payload (e.g., metrics, artifacts, references)

### Index Strategy

1. **idx_messages_issue_id**: Fast query by issue
2. **idx_messages_to_phase**: Fast query by target phase
3. **idx_messages_from_phase**: Fast query by source phase
4. **idx_messages_issue_phase**: Composite index for issue+phase queries
5. **idx_messages_issue_unread**: Fast unread queries (common operation)
6. **idx_messages_created_at**: Time-based queries (cleanup, analytics)
7. **idx_messages_run_counter**: Track messages across workflow iterations

### Dual Storage Design

- **JSONL**: Append-only source of truth (audit trail)
- **SQLite**: Indexed cache for fast queries
- Sync on load: JSONL → SQLite on initialization
- Write: Both JSONL (append) and SQLite (upsert)

## Size Limits

Default limits (configurable in `.agent-shepherd/config/phase-messenger.yaml`):

- Maximum message content length: 10,000 characters
- Maximum messages per issue-phase: 100
- Maximum total messages per issue: 500
- Maximum metadata size: 5,000 characters (JSON string)

When limits are exceeded, oldest messages are automatically archived based on:
1. Read status (unread preserved)
2. Created timestamp (oldest first)
3. Message type (data messages before context)
