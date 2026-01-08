# Agent Shepherd API Documentation

This document provides comprehensive API documentation for Agent Shepherd's core systems, including transition management, decision handling, retention policies, and phase messaging.

## Table of Contents

- [Policy Engine API](#policy-engine-api)
- [Decision Builder API](#decision-builder-api)
- [Retention Policy Manager API](#retention-policy-manager-api)
- [Phase Messenger API](#phase-messenger-api)

---

## Policy Engine API

The Policy Engine manages workflow phases, transitions, and routing logic.

### Classes

#### `PolicyEngine`

Main class for managing workflow policies and determining phase transitions.

##### Constructor

```typescript
constructor(configPath?: string)
```

**Parameters:**
- `configPath` (optional): Path to policies YAML configuration file

---

##### Methods

###### `loadPolicies(filePath: string): void`

Load policies from a YAML configuration file.

**Parameters:**
- `filePath`: Path to the policies YAML file

**Throws:**
- Error if file is invalid or missing required fields

---

###### `getPolicy(name?: string): PolicyConfig | null`

Retrieve a policy configuration by name.

**Parameters:**
- `name` (optional): Policy name, defaults to default policy

**Returns:** Policy configuration or null if not found

---

###### `getPolicyNames(): string[]`

Get all available policy names.

**Returns:** Array of policy name strings

---

###### `getDefaultPolicyName(): string`

Get the default policy name.

**Returns:** Default policy name string

---

###### `matchPolicy(issue: BeadsIssue): string`

Match an issue to a policy based on labels and issue type.

**Priority Order:**
1. Explicit workflow label (`ashep-workflow:<name>`)
2. Issue type matching (highest priority first)
3. Default policy

**Parameters:**
- `issue`: BeadsIssue object to match

**Returns:** Name of matched policy

---

###### `getPhaseSequence(policyName?: string): string[]`

Get the ordered list of phases for a policy.

**Parameters:**
- `policyName` (optional): Policy name

**Returns:** Array of phase names in order

---

###### `getPhaseConfig(policyName: string, phaseName: string): PhaseConfig | null`

Get configuration for a specific phase.

**Parameters:**
- `policyName`: Name of the policy
- `phaseName`: Name of the phase

**Returns:** Phase configuration or null if not found

---

###### `getNextPhase(policyName: string, currentPhase: string): string | null`

Get the next phase in the sequence.

**Parameters:**
- `policyName`: Name of the policy
- `currentPhase`: Current phase name

**Returns:** Next phase name or null if at end of sequence

---

###### `determineTransition(...)`

Determine the appropriate transition based on run outcome.

```typescript
async determineTransition(
  policyName: string,
  currentPhase: string,
  outcome: {
    success: boolean;
    retry_count?: number;
    requires_approval?: boolean;
    result_type?: 'success' | 'failure' | 'partial_success' | 'unclear';
  },
  issueId?: string
): Promise<PhaseTransition>
```

**Parameters:**
- `policyName`: Name of the policy
- `currentPhase`: Current phase name
- `outcome`: Run outcome information
- `issueId` (optional): Issue ID for loop prevention checks

**Returns:** PhaseTransition object with type and routing information

**Transition Types:**
- `advance`: Move to next phase
- `retry`: Retry current phase
- `block`: Block progress (requires approval or hit limit)
- `close`: Close the workflow (all phases complete)
- `jump_back`: Jump to a previous phase
- `dynamic_decision`: Use AI agent to determine transition

---

###### `calculateRetryDelay(policyName: string, attemptNumber: number): number`

Calculate retry delay based on policy configuration.

**Parameters:**
- `policyName`: Name of the policy
- `attemptNumber`: Current attempt number (0-indexed)

**Returns:** Delay in milliseconds

**Backoff Strategies:**
- `exponential`: delay = initial * 2^attempt
- `linear`: delay = initial * (attempt + 1)
- `fixed`: delay = initial

---

###### `calculateTimeout(policyName: string, phaseName: string): number`

Calculate timeout for a phase.

**Parameters:**
- `policyName`: Name of the policy
- `phaseName`: Name of the phase

**Returns:** Timeout in milliseconds

---

###### `getStallThreshold(policyName: string): number`

Get the stall detection threshold for a policy.

**Parameters:**
- `policyName`: Name of the policy

**Returns:** Stall threshold in milliseconds

---

###### `requiresHITL(policyName: string): boolean`

Check if policy requires human-in-the-loop approval.

**Parameters:**
- `policyName`: Name of the policy

**Returns:** True if HITL is required

---

###### `validatePhaseLimits(...)`

Check if phase has exceeded maximum visit count.

```typescript
async validatePhaseLimits(
  policyName: string,
  issueId: string,
  phaseName: string
): Promise<{ valid: boolean; reason?: string }>
```

**Parameters:**
- `policyName`: Name of the policy
- `issueId`: Issue ID
- `phaseName`: Phase name

**Returns:** Validation result with validity flag and optional reason

---

###### `validateTransitionLimits(...)`

Check if a specific transition pattern has exceeded limits.

```typescript
async validateTransitionLimits(
  issueId: string,
  fromPhase: string,
  toPhase: string,
  maxTransitions?: number
): Promise<{ valid: boolean; reason?: string }>
```

**Parameters:**
- `issueId`: Issue ID
- `fromPhase`: Source phase name
- `toPhase`: Destination phase name
- `maxTransitions` (optional): Maximum allowed transitions

**Returns:** Validation result with validity flag and optional reason

---

###### `detectCycles(...)`

Detect oscillating patterns in recent transitions.

```typescript
async detectCycles(
  issueId: string,
  cycleLength?: number
): Promise<{ detected: boolean; reason?: string }>
```

**Parameters:**
- `issueId`: Issue ID
- `cycleLength` (optional): Length of cycle to detect (default from config)

**Returns:** Detection result with detected flag and optional reason

---

###### `buildDecisionInstructions(...)`

Build comprehensive prompt for decision agents.

```typescript
buildDecisionInstructions(
  issue: BeadsIssue,
  transitionConfig: TransitionConfig,
  previousOutcome: RunOutcome,
  currentPhase: string,
  context?: Partial<TemplateContext>
): string
```

**Parameters:**
- `issue`: BeadsIssue object
- `transitionConfig`: Transition configuration
- `previousOutcome`: Previous run outcome
- `currentPhase`: Current phase name
- `context` (optional): Additional context for template

**Returns:** Formatted prompt string

---

###### `parseDecisionResponse(...)`

Parse and validate AI decision responses.

```typescript
parseDecisionResponse(
  response: string,
  transitionConfig: TransitionConfig
): DecisionResult
```

**Parameters:**
- `response`: Raw AI response string
- `transitionConfig`: Transition configuration with allowed destinations

**Returns:** Parsed decision result with action, reasoning, confidence

---

### Helper Functions

#### `getPolicyEngine(configPath?: string): PolicyEngine`

Get or create the singleton Policy Engine instance.

**Parameters:**
- `configPath` (optional): Path to policies configuration

**Returns:** Policy Engine instance

---

#### `validateHITLReason(reason: string, config?: HITLConfig): boolean`

Validate HITL reason against predefined list and custom rules.

**Parameters:**
- `reason`: Reason string to validate
- `config` (optional): HITL configuration

**Returns:** True if reason is valid

---

## Decision Builder API

The Decision Builder handles prompt templates and response parsing for AI decision agents.

### Classes

#### `DecisionPromptBuilder`

Main class for building decision prompts and parsing AI responses.

##### Constructor

```typescript
constructor(configPath?: string)
```

**Parameters:**
- `configPath` (optional): Path to decision prompts YAML file

---

##### Methods

###### `reloadConfig(): void`

Reload the decision prompts configuration from file.

---

###### `buildPrompt(...)`

Build a prompt using a named template.

```typescript
buildPrompt(
  templateName: string,
  context: TemplateContext
): { system_prompt: string; user_prompt: string } | null
```

**Parameters:**
- `templateName`: Name of the template to use
- `context`: Template context with issue data, outcome, etc.

**Returns:** Object with system and user prompts, or null if template not found

---

###### `getTemplate(templateName?: string): Template | null`

Get a template by name or fallback.

**Parameters:**
- `templateName` (optional): Template name

**Returns:** Template object or null

---

###### `getAvailableTemplates(): string[]`

Get list of available template names.

**Returns:** Array of template name strings

---

###### `sanitizeResponse(response: string): string`

Sanitize AI response before parsing.

**Parameters:**
- `response`: Raw AI response string

**Returns:** Sanitized response string

---

###### `validateResponse(...)`

Validate decision response structure and content.

```typescript
validateResponse(
  response: string,
  allowedDestinations: string[],
  confidenceThresholds?: { auto_advance: number; require_approval: number }
): DecisionValidationResult
```

**Parameters:**
- `response`: Raw AI response string
- `allowedDestinations`: Valid destination phases
- `confidenceThresholds` (optional): Confidence threshold values

**Returns:** Validation result with valid flag, errors, warnings, and parsed response

---

###### `parseDecisionResponse(...)`

Parse decision response with validation.

```typescript
parseDecisionResponse(
  response: string,
  allowedDestinations: string[],
  confidenceThresholds?: { auto_advance: number; require_approval: number }
): DecisionResponse | null
```

**Parameters:**
- `response`: Raw AI response string
- `allowedDestinations`: Valid destination phases
- `confidenceThresholds` (optional): Confidence threshold values

**Returns:** Parsed decision response or null if invalid

---

###### `getAnalytics(): DecisionAnalytics`

Get accumulated decision analytics.

**Returns:** Analytics object with decision statistics

---

###### `resetAnalytics(): void`

Reset accumulated analytics to zero.

---

###### `buildDecisionInstructions(...)`

Build enhanced decision instructions with template.

```typescript
buildDecisionInstructions(
  issue: BeadsIssue,
  capability: string,
  previousOutcome: RunOutcome,
  currentPhase: string,
  customInstructions: string,
  allowedDestinations: string[],
  context?: Partial<TemplateContext>
): string
```

**Parameters:**
- `issue`: BeadsIssue object
- `capability`: Decision agent capability (template name)
- `previousOutcome`: Previous run outcome
- `currentPhase`: Current phase name
- `customInstructions`: Custom instructions from transition config
- `allowedDestinations`: Valid destination phases
- `context` (optional): Additional template context

**Returns:** Formatted prompt string

---

###### `getSystemPrompt(capability: string): string`

Get system prompt for a specific capability.

**Parameters:**
- `capability`: Decision agent capability name

**Returns:** System prompt string

---

### Helper Functions

#### `getDecisionPromptBuilder(configPath?: string): DecisionPromptBuilder`

Get or create the singleton Decision Prompt Builder instance.

**Parameters:**
- `configPath` (optional): Path to decision prompts configuration

**Returns:** Decision Prompt Builder instance

---

## Retention Policy Manager API

The Retention Policy Manager manages data retention, archival, and cleanup operations.

### Classes

#### `RetentionPolicyManager`

Main class for managing retention policies and executing cleanup operations.

##### Constructor

```typescript
constructor(policies: RetentionPolicy[], logger?: ReturnType<typeof getLogger>)
```

**Parameters:**
- `policies`: Array of retention policy configurations
- `logger` (optional): Logger instance

---

##### Methods

###### `getPolicies(): RetentionPolicy[]`

Get all enabled retention policies.

**Returns:** Array of retention policies

---

###### `getPolicy(name: string): RetentionPolicy | null`

Get a specific retention policy by name.

**Parameters:**
- `name`: Policy name

**Returns:** Retention policy or null if not found

---

###### `shouldArchiveRun(...)`

Check if a run should be archived based on retention policies.

```typescript
shouldArchiveRun(
  runData: any,
  outcome?: any
): { shouldArchive: boolean; policy?: RetentionPolicy }
```

**Parameters:**
- `runData`: Run data object
- `outcome` (optional): Run outcome object

**Returns:** Object with shouldArchive flag and matching policy

---

###### `shouldDeleteRun(...)`

Check if a run should be deleted based on retention policies.

```typescript
shouldDeleteRun(
  runData: any,
  outcome?: any
): { shouldDelete: boolean; policy?: RetentionPolicy }
```

**Parameters:**
- `runData`: Run data object
- `outcome` (optional): Run outcome object

**Returns:** Object with shouldDelete flag and matching policy

---

###### `needsCleanup(...)`

Check if cleanup is needed based on size limits.

```typescript
needsCleanup(
  totalRuns: number,
  totalSizeBytes: number
): { needsCleanup: boolean; reason?: string; policy?: RetentionPolicy }
```

**Parameters:**
- `totalRuns`: Total number of runs in storage
- `totalSizeBytes`: Total storage size in bytes

**Returns:** Object with needsCleanup flag, reason, and triggering policy

---

###### `recordMetrics(metrics: CleanupMetrics): void`

Record cleanup operation metrics.

**Parameters:**
- `metrics`: Cleanup metrics object

---

###### `getMetrics(options?: {...}): CleanupMetrics[]`

Get cleanup metrics with optional filtering.

```typescript
getMetrics(options?: {
  policy_name?: string;
  operation?: string;
  since?: number;
  limit?: number;
}): CleanupMetrics[]
```

**Parameters:**
- `options` (optional): Filter options
  - `policy_name`: Filter by policy name
  - `operation`: Filter by operation type
  - `since`: Filter by timestamp (milliseconds)
  - `limit`: Limit number of results

**Returns:** Array of cleanup metrics, sorted by timestamp (newest first)

---

###### `getAggregateMetrics(): AggregateMetrics`

Get aggregate statistics for all cleanup operations.

**Returns:** Object with aggregated metrics:
- `total_runs_processed`: Total runs processed
- `total_runs_archived`: Total runs archived
- `total_runs_deleted`: Total runs deleted
- `total_bytes_archived`: Total bytes archived
- `total_bytes_deleted`: Total bytes deleted
- `last_cleanup`: Timestamp of last cleanup (or null)
- `average_duration_ms`: Average operation duration

---

### Helper Functions

#### `getRetentionPolicyManager(...)`

Get or create the singleton Retention Policy Manager instance.

```typescript
getRetentionPolicyManager(
  policies: RetentionPolicy[],
  logger?: ReturnType<typeof getLogger>
): RetentionPolicyManager
```

**Parameters:**
- `policies`: Array of retention policy configurations
- `logger` (optional): Logger instance

**Returns:** Retention Policy Manager instance

---

#### `resetManager(): void`

Reset the singleton Retention Policy Manager instance.

---

## Phase Messenger API

The Phase Messenger handles inter-phase communication through a message passing system.

### Classes

#### `PhaseMessenger`

Main class for sending and receiving messages between workflow phases.

##### Constructor

```typescript
constructor(dataDir?: string)
```

**Parameters:**
- `dataDir` (optional): Data directory path (defaults to .agent-shepherd)

---

##### Methods

###### `sendMessage(input: CreateMessageInput): PhaseMessage`

Send a message from one phase to another.

**Parameters:**
- `input`: Message creation object
  - `issue_id`: Associated issue ID
  - `from_phase`: Sending phase name
  - `to_phase`: Receiving phase name
  - `message_type`: Type ("context", "result", "decision", "data")
  - `content`: Message content string
  - `run_counter` (optional): Run iteration number
  - `metadata` (optional): Additional metadata object

**Returns:** Created phase message object

**Throws:**
- Error if validation fails or limits exceeded

---

###### `receiveMessages(...)`

Receive unread messages for a specific phase.

```typescript
receiveMessages(
  issueId: string,
  phase: string,
  markAsRead = true
): PhaseMessage[]
```

**Parameters:**
- `issueId`: Issue ID
- `phase`: Phase name
- `markAsRead`: Whether to mark messages as read (default: true)

**Returns:** Array of phase messages

---

###### `listMessages(query?: MessageQuery): PhaseMessage[]`

List messages with optional filtering.

**Parameters:**
- `query` (optional): Query filters
  - `issue_id`: Filter by issue ID
  - `from_phase`: Filter by sender phase
  - `to_phase`: Filter by recipient phase
  - `message_type`: Filter by message type
  - `read`: Filter by read status
  - `run_counter`: Filter by run counter
  - `limit`: Maximum number of results

**Returns:** Array of phase messages, sorted by created_at (newest first)

---

###### `getUnreadCount(issueId: string, phase: string): number`

Get count of unread messages for a specific phase.

**Parameters:**
- `issueId`: Issue ID
- `phase`: Phase name

**Returns:** Number of unread messages

---

###### `deleteIssueMessages(issueId: string): void`

Delete all messages associated with an issue.

**Parameters:**
- `issueId`: Issue ID

---

###### `archiveMessagesForIssue(...)`

Archive messages for an issue to external storage.

```typescript
archiveMessagesForIssue(
  issueId: string,
  reason: string = "cleanup"
): { archived: number }
```

**Parameters:**
- `issueId`: Issue ID
- `reason`: Reason for archival (default: "cleanup")

**Returns:** Object with count of archived messages

---

###### `cleanupPhaseMessages(...)`

Clean up and archive messages for an issue.

```typescript
cleanupPhaseMessages(
  issueId: string,
  reason: string = "manual"
): {
  archived: number;
  deleted: number;
  db_size_before: number;
  db_size_after: number;
}
```

**Parameters:**
- `issueId`: Issue ID
- `reason`: Reason for cleanup (default: "manual")

**Returns:** Object with archival and deletion counts and database size metrics

---

###### `getCleanupMetrics(issueId?: string): any[]`

Get cleanup metrics for specific issue or all issues.

**Parameters:**
- `issueId` (optional): Filter by issue ID

**Returns:** Array of cleanup metric objects, sorted by timestamp

---

###### `getMessageStats(issueId?: string): MessageStats`

Get message statistics for specific issue or all messages.

**Parameters:**
- `issueId` (optional): Filter by issue ID

**Returns:** Object with message statistics:
- `total_messages`: Total message count
- `unread_messages`: Unread message count
- `read_messages`: Read message count
- `by_issue`: Object with counts per issue
- `db_size_mb`: Database size in MB

---

###### `close(): void`

Close the database connection and release resources.

---

### Helper Functions

#### `getPhaseMessenger(dataDir?: string): PhaseMessenger`

Get or create the singleton Phase Messenger instance.

**Parameters:**
- `dataDir` (optional): Data directory path

**Returns:** Phase Messenger instance

---

## Type Definitions

### Core Types

#### `PhaseConfig`

```typescript
interface PhaseConfig {
  name: string;
  description?: string;
  capabilities?: string[];
  agent?: string;
  model?: string;
  timeout_multiplier?: number;
  require_approval?: boolean;
  fallback_agent?: string;
  fallback_enabled?: boolean;
  transitions?: TransitionBlock;
  max_visits?: number;
}
```

---

#### `TransitionConfig`

```typescript
interface TransitionConfig {
  capability: string;
  prompt: string;
  allowed_destinations: string[];
  messaging?: boolean;
  confidence_thresholds?: {
    auto_advance: number;
    require_approval: number;
  };
}
```

---

#### `TransitionBlock`

```typescript
interface TransitionBlock {
  on_success?: string | TransitionConfig;
  on_failure?: string | TransitionConfig;
  on_partial_success?: TransitionConfig;
  on_unclear?: TransitionConfig;
}
```

---

#### `PhaseTransition`

```typescript
type PhaseTransition = {
  type: "advance" | "retry" | "block" | "close" | "jump_back" | "dynamic_decision";
  next_phase?: string;
  reason?: string;
  jump_target_phase?: string;
  dynamic_agent?: string;
  decision_config?: any;
};
```

---

#### `DecisionResult`

```typescript
interface DecisionResult {
  action: string;
  target_phase?: string;
  reasoning: string;
  confidence: number;
  requires_approval: boolean;
  recommendations?: string[];
}
```

---

#### `RetentionPolicy`

```typescript
interface RetentionPolicy {
  name: string;
  description?: string;
  enabled: boolean;
  age_days: number;
  max_runs: number;
  max_size_mb: number;
  archive_enabled: boolean;
  archive_after_days?: number;
  delete_after_days?: number;
  status_filter?: string[];
  phase_filter?: string[];
  keep_successful_runs?: boolean;
  keep_failed_runs?: boolean;
}
```

---

#### `PhaseMessage`

```typescript
interface PhaseMessage {
  id: string;
  issue_id: string;
  from_phase: string;
  to_phase: string;
  run_counter: number;
  message_type: "context" | "result" | "decision" | "data";
  content: string;
  metadata?: { [key: unknown] } | null;
  read: boolean;
  created_at: number;
  read_at?: number | null;
}
```

---

## Error Handling

All API methods may throw errors in the following situations:

### Policy Engine
- Invalid configuration file
- Policy not found
- Phase not found
- Transition validation failure
- Loop prevention trigger

### Decision Builder
- Template not found
- Invalid response format
- Response validation failure
- Missing required fields

### Retention Policy Manager
- Policy not found
- Storage access failure
- Archive failure

### Phase Messenger
- Invalid message format
- Size limit exceeded
- Database access failure
- Metadata size exceeded

---

## Schema References

For complete schema definitions, refer to:

- `schemas/transition.schema.json` - Transition system schemas
- `schemas/decision.schema.json` - Decision system schemas
- `schemas/retention.schema.json` - Retention policy schemas
- `schemas/message.schema.json` - Phase messenger schemas

---

## Usage Examples

See [Integration Examples](./docs/integration-examples.md) for detailed usage patterns.
