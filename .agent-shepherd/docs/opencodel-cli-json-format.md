# OpenCode CLI JSON Output Format

This document describes the JSON output format from the OpenCode CLI when run with `--format json`.

## Overview

OpenCode CLI outputs JSONL (JSON Lines) format with one JSON object per line. Each line represents an event emitted during the agent execution.

## Event Types

### 1. Session Events

#### `session.created`
Indicates a new session was created.

```json
{
  "type": "session.created",
  "properties": {
    "info": {
      "id": "session-id",
      "projectID": "project-id",
      "directory": "/path/to/directory",
      "parentID": "parent-session-id",
      "title": "Session Title",
      "version": "1.0.0",
      "time": {
        "created": 1736236800000,
        "updated": 1736236800000
      },
      "summary": {
        "additions": 10,
        "deletions": 5,
        "files": 3
      },
      "share": {
        "url": "https://share.url"
      }
    }
  }
}
```

#### `session.updated`
Emitted when session information is updated.

Same structure as `session.created`.

#### `session.status`
Emitted when session status changes.

```json
{
  "type": "session.status",
  "properties": {
    "sessionID": "session-id",
    "status": {
      "type": "idle" | "busy" | "retry",
      "attempt": 1,
      "message": "Retry message",
      "next": 1736236800000
    }
  }
}
```

#### `session.error`
Emitted when an error occurs during session execution.

```json
{
  "type": "session.error",
  "properties": {
    "sessionID": "session-id",
    "error": {
      "name": "ErrorName",
      "message": "Error message"
    }
  }
}
```

#### `session.idle`
Emitted when session becomes idle.

```json
{
  "type": "session.idle",
  "properties": {
    "sessionID": "session-id"
  }
}
```

### 2. Message Events

#### `message.updated`
Emitted when a message is created or updated.

```json
{
  "type": "message.updated",
  "properties": {
    "info": {
      "id": "message-id",
      "sessionID": "session-id",
      "role": "assistant",
      "time": {
        "created": 1736236800000,
        "completed": 1736236860000
      },
      "parentID": "parent-message-id",
      "modelID": "claude-sonnet",
      "providerID": "anthropic",
      "mode": "chat",
      "path": {
        "cwd": "/current/working/directory",
        "root": "/project/root"
      },
      "cost": 0.01,
      "tokens": {
        "input": 1000,
        "output": 500,
        "reasoning": 0,
        "cache": {
          "read": 0,
          "write": 100
        }
      },
      "finish": "stop",
      "error": {
        "name": "ApiError",
        "data": {
          "message": "Error message",
          "statusCode": 500,
          "isRetryable": true
        }
      }
    }
  }
}
```

User message structure:

```json
{
  "id": "message-id",
  "sessionID": "session-id",
  "role": "user",
  "time": {
    "created": 1736236800000
  },
  "agent": "agent-name",
  "model": {
    "providerID": "anthropic",
    "modelID": "claude-sonnet"
  },
  "system": "System prompt",
  "tools": {
    "tool-name": true
  },
  "summary": {
    "title": "Summary title",
    "body": "Summary body",
    "diffs": [
      {
        "file": "path/to/file",
        "before": "old content",
        "after": "new content",
        "additions": 10,
        "deletions": 5
      }
    ]
  }
}
```

### 3. Message Part Events

#### `message.part.updated`
Emitted when a part of a message is created or updated.

##### Tool Part

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "part-id",
      "sessionID": "session-id",
      "messageID": "message-id",
      "type": "tool",
      "callID": "call-id",
      "tool": "tool-name",
      "state": {
        "status": "completed",
        "input": {
          "param1": "value1",
          "param2": "value2"
        },
        "output": "Tool output",
        "title": "Tool call title",
        "metadata": {
          "key": "value"
        },
        "time": {
          "start": 1736236800000,
          "end": 1736236810000
        }
      }
    }
  }
}
```

Tool state variations:

**Pending:**
```json
{
  "status": "pending",
  "input": { ... },
  "raw": "raw input string"
}
```

**Running:**
```json
{
  "status": "running",
  "input": { ... },
  "title": "Tool call title",
  "metadata": { ... },
  "time": {
    "start": 1736236800000
  }
}
```

**Error:**
```json
{
  "status": "error",
  "input": { ... },
  "error": "Error message",
  "metadata": { ... },
  "time": {
    "start": 1736236800000,
    "end": 1736236810000
  }
}
```

##### File Part

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "part-id",
      "sessionID": "session-id",
      "messageID": "message-id",
      "type": "file",
      "mime": "text/plain",
      "filename": "filename.txt",
      "url": "file:///path/to/file",
      "source": {
        "type": "file",
        "path": "/path/to/file",
        "text": {
          "value": "file content",
          "start": 0,
          "end": 100
        }
      }
    }
  }
}
```

##### Text Part

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "part-id",
      "sessionID": "session-id",
      "messageID": "message-id",
      "type": "text",
      "text": "Text content",
      "synthetic": false,
      "ignored": false,
      "time": {
        "start": 1736236800000,
        "end": 1736236810000
      },
      "metadata": {
        "key": "value"
      }
    }
  }
}
```

##### Reasoning Part

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "part-id",
      "sessionID": "session-id",
      "messageID": "message-id",
      "type": "reasoning",
      "text": "Reasoning content",
      "metadata": {
        "key": "value"
      },
      "time": {
        "start": 1736236800000,
        "end": 1736236810000
      }
    }
  }
}
```

### 4. File System Events

#### `file.edited`
Emitted when a file is edited.

```json
{
  "type": "file.edited",
  "properties": {
    "path": "/path/to/file",
    "diff": {
      "file": "path/to/file",
      "before": "old content",
      "after": "new content",
      "additions": 10,
      "deletions": 5
    }
  }
}
```

### 5. Command Execution Events

#### `command.executed`
Emitted when a command is executed.

```json
{
  "type": "command.executed",
  "properties": {
    "command": "command string",
    "exitCode": 0,
    "stdout": "standard output",
    "stderr": "standard error",
    "time": {
      "start": 1736236800000,
      "end": 1736236810000
    }
  }
}
```

### 6. Permission Events

#### `permission.updated`
Emitted when a permission request is created or updated.

```json
{
  "type": "permission.updated",
  "properties": {
    "id": "permission-id",
    "type": "permission-type",
    "pattern": "file-pattern",
    "sessionID": "session-id",
    "messageID": "message-id",
    "callID": "call-id",
    "title": "Permission request title",
    "metadata": {
      "key": "value"
    },
    "time": {
      "created": 1736236800000
    }
  }
}
```

#### `permission.replied`
Emitted when a permission request is responded to.

```json
{
  "type": "permission.replied",
  "properties": {
    "sessionID": "session-id",
    "permissionID": "permission-id",
    "response": "response text"
  }
}
```

## Mapping to RunOutcome Interface

### Current RunOutcome Fields

| OpenCode Field | RunOutcome Field | Notes |
|---------------|------------------|-------|
| Session.id | session_id | Session identifier |
| AssistantMessage.time.created | metrics.start_time_ms | Agent start time |
| AssistantMessage.time.completed | metrics.end_time_ms | Agent end time |
| AssistantMessage.tokens | metrics.tokens_used | Total tokens (input + output) |
| AssistantMessage.cost | metrics.cost | Cost in dollars |
| AssistantMessage.modelID + providerID | metrics.model_name | Model used (provider/model) |
| AssistantMessage.error | error_details | Error information |
| FilePart.filename/path | artifacts | Files created/modified |
| TextPart.text (last assistant message) | message | Final assistant response text |

### Metadata Fields

| Field | Type | Source | Notes |
|-------|------|--------|--------|
| session_id | string | Session.created/Session.updated | Session identifier (stored in metadata for tracking) |
| phase_total_duration_ms | number | Cumulative tracking | Total time spent on phase across retries |
| attempt_number | number | Retry counter | Current attempt number (1-based) |
| retry_count | number | Retry counter | Number of previous retries |
| initial_prompt | string | WorkerEngine.buildInstructions() | Initial prompt sent to agent for this phase |

### New RunOutcome Fields Needed

| Field | Type | Source |
|-------|------|--------|
| artifacts | Artifact[] | FilePart events with operation tracking |
| error_details | ErrorDetails | AssistantMessage.error or session.error |
| tool_calls | ToolCall[] | ToolPart events with state "completed" |
| warnings | string[] | Session status.retry, permission requests |
| metrics.api_calls_count | number | Count of ToolPart events |

### Artifact Structure

```typescript
interface Artifact {
  path: string;
  operation: 'created' | 'modified' | 'deleted';
  size?: number;
  type?: 'file' | 'directory';
}
```

### ErrorDetails Structure

```typescript
interface ErrorDetails {
  type?: string;
  message?: string;
  stack_trace?: string;
  file_path?: string;
  line_number?: number;
}
```

### ToolCall Structure

```typescript
interface ToolCall {
  name: string;
  inputs: any;
  outputs?: string;
  duration_ms?: number;
  status: 'completed' | 'error' | 'cancelled';
}
```

## Parsing Strategy

1. Read all lines from stdout and stderr
2. Parse each line as JSON (skip malformed lines with warning)
3. Accumulate data from all events:
   - Session info from first `session.created` or `session.updated` event
   - Metrics from last `message.updated` event with role "assistant"
   - Artifacts from `file.edited` events
   - Tool calls from `message.part.updated` events with type "tool"
   - Message text from `message.part.updated` events with type "text" (last assistant message)
   - Error details from `session.error` or message error field
   - Warnings from `session.status` with type "retry" or `permission.updated` events
4. Calculate duration from session or message timestamps
5. Assemble final message from text parts of last assistant message
6. Return consolidated RunOutcome object

## Message Text Extraction

### Text Part Processing

The system extracts text content from assistant messages by processing `message.part.updated` events with `type: "text"`:

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "part-id",
      "messageID": "msg-id",
      "type": "text",
      "text": "Text content here"
    }
  }
}
```

**Extraction Logic:**
1. Track last assistant message ID during parsing
2. Collect all text parts associated with that message ID
3. Join multiple text parts with newlines
4. Trim and validate final result
5. Set `outcome.message` field

**Validation:**
- Skips empty or whitespace-only text parts
- Handles null/undefined text content gracefully
- Supports special characters, unicode, and code blocks
- Only extracts from assistant messages (not user messages)

### Minimal Logging Approach

To prevent database bloat from large sessions (200k+ tokens), the system uses a minimal logging strategy:

**Stored Data:**
- `outcome.message`: Final assistant response text
- `metadata.initial_prompt`: Initial prompt sent to agent
- `outcome.tool_calls`: Tool call summary (not full inputs/outputs)
- `outcome.metrics`: Basic metrics including `tool_calls_count`
- `session_id`: For tracking and archival

**Not Stored:**
- Full conversation history (`outcome.messages` array)
- Raw CLI output (`metadata.raw_cli_output`)
- Detailed tool call inputs/outputs
- Individual message parts

**Rationale:**
- Decision agents and phase messaging only need final conclusions
- Initial prompts enable performance analysis
- Metrics provide operational insights
- Reduces database size by ~90% for large sessions

## Error Handling

- Skip malformed JSON lines with warning
- Use default values for missing fields
- Gracefully handle partial data
- Log parsing warnings but continue processing
- Handle both stdout and stderr JSON streams

## Troubleshooting

### Message Extraction Issues

**Symptom:** Decision agents or phase messaging receive generic placeholder "Task completed by agent" instead of actual agent conclusions.

**Possible Causes:**
1. No `message.part.updated` events with `type: "text"` in output
2. Text parts belong to user messages instead of assistant
3. All text parts are empty or whitespace-only
4. Assistant message ID not tracked correctly

**Diagnosis Steps:**
1. Check run records in database for `outcome.message` field
2. Verify OpenCode CLI is emitting text part events
3. Check if agent only used tools without textual response
4. Review run logs for parsing errors or warnings

**Resolution:**
- If `outcome.message` is missing, agent may have only used tools (check `tool_calls` array)
- Verify OpenCode CLI version supports text part events
- Check if agent response was filtered out by validation (empty/whitespace)

### Special Character Issues

**Symptom:** Database corruption or JSON parsing errors when storing runs.

**Possible Causes:**
1. Unescaped quotes or backslashes in prompts/messages
2. Invalid unicode sequences
3. Malformed JSON in event payloads

**Diagnosis Steps:**
1. Check error logs for JSON parsing failures
2. Review run metadata for corrupted fields
3. Test with simple prompts to isolate character issues

**Resolution:**
- System uses `JSON.stringify()` for automatic escaping
- Special characters (quotes, newlines, unicode) are supported
- Check for malformed input data in event payloads
- Verify storage layer handles unicode correctly

### Database Bloat

**Symptom:** Runs database grows excessively large (100MB+ for typical usage).

**Possible Causes:**
1. Storing full conversation history in `messages` array
2. Saving raw CLI output in `raw_cli_output` field
3. Large tool call inputs/outputs not trimmed

**Diagnosis Steps:**
1. Check `metadata.messages` field size in run records
2. Verify `metadata.raw_cli_output` contains full CLI output
3. Monitor run metadata sizes over time

**Resolution:**
- System uses minimal logging approach (see above)
- Check for outdated code paths storing full data
- Verify logging system is updated to use minimal strategy
- Consider archival for old runs with large metadata
