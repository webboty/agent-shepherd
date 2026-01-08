# Message Types Definition

## Message Types

### context
Contextual information for the next phase.

**Purpose**: Provide background information, requirements, or design docs.

**Typical Use Cases**:
- Design specifications from plan → implement
- Requirements from review → plan
- User stories from analyze → plan

**Content Format**: Plain text or structured JSON

**Example**:
```json
{
  "type": "context",
  "content": "Implement user authentication with JWT tokens. Follow OAuth 2.0 standard.",
  "metadata": {
    "priority": "high",
    "estimated_effort": "2 days"
  }
}
```

---

### result
Results or outcomes from a completed phase.

**Purpose**: Report phase completion status and deliverables.

**Typical Use Cases**:
- Implementation results from implement → test
- Test results from test → review
- Review decision from review → close

**Content Format**: Plain text summary or structured JSON with details

**Example**:
```json
{
  "type": "result",
  "content": "Authentication implementation completed. 15 files created, 500 lines of code.",
  "metadata": {
    "files_modified": ["src/auth.ts", "src/middleware.ts"],
    "test_coverage": "85%",
    "status": "completed"
  }
}
```

---

### decision
Decision made during a phase that affects subsequent phases.

**Purpose**: Document important decisions and trade-offs.

**Typical Use Cases**:
- Architecture choice from plan → implement
- Library selection from implement → test
- Approval decision from review → implement

**Content Format**: Plain text or structured JSON with reasoning

**Example**:
```json
{
  "type": "decision",
  "content": "Chose JWT over session-based auth for better scalability.",
  "metadata": {
    "alternatives_considered": ["session-based", "OAuth 2.0"],
    "rationale": "Stateless, scales horizontally, mobile-friendly",
    "impact": "Medium"
  }
}
```

---

### data
Arbitrary data payload or artifacts.

**Purpose**: Pass structured data, metrics, or references.

**Typical Use Cases**:
- Performance metrics from test → implement
- Artifact references from implement → review
- Configuration data from plan → implement

**Content Format**: JSON object with structured data

**Example**:
```json
{
  "type": "data",
  "content": {
    "metrics": {
      "latency_ms": 45,
      "throughput_rps": 1000,
      "error_rate": 0.01
    },
    "artifacts": [
      { "path": "build/bundle.js", "size": 2048576 },
      { "path": "test-results.json", "size": 1234 }
    ]
  },
  "metadata": {
    "collection_time": 1736328000000
  }
}
```

---

## Message Metadata Schema

Optional metadata field structure:

```typescript
interface MessageMetadata {
  sender?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  run_id?: string;
  agent_id?: string;
  estimated_effort?: string;
  status?: string;
  alternatives_considered?: string[];
  rationale?: string;
  impact?: "low" | "medium" | "high";
  collection_time?: number;
  files_modified?: string[];
  test_coverage?: string;
  artifacts?: Array<{ path: string; size: number }>;
  [key: string]: unknown;
}
```

## Message Priority Levels

- **low**: Informational messages
- **medium**: Default priority
- **high**: Requires attention
- **urgent**: Critical information requiring immediate action

## Content Guidelines

### Context Messages
- Keep concise and relevant
- Include links to external docs if needed
- Focus on actionable information

### Result Messages
- Include quantitative metrics
- List deliverables
- Note any caveats or known issues

### Decision Messages
- Clearly state the decision
- Document alternatives considered
- Provide rationale for the choice
- Note any assumptions made

### Data Messages
- Use structured JSON for data payload
- Include units for numeric values
- Document data source and collection time
- Consider size limits (10KB max)
