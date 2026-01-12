# Agent Shepherd Integration Examples

This document provides practical examples for integrating with Agent Shepherd's core systems.

## Table of Contents

- [Policy Engine Examples](#policy-engine-examples)
- [Decision Builder Examples](#decision-builder-examples)
- [Retention Policy Examples](#retention-policy-examples)
- [Phase Messenger Examples](#phase-messenger-examples)
- [Complete Workflow Examples](#complete-workflow-examples)

---

## Policy Engine Examples

### Basic Policy Configuration

#### Creating a Simple Linear Workflow

```typescript
import { PolicyEngine } from './src/core/policy.js';

const engine = new PolicyEngine('./config/policies.yaml');

// Access policy configuration
const policy = engine.getPolicy('default');
console.log('Phases:', policy?.phases.map(p => p.name));
// Output: ['plan', 'implement', 'test', 'review']
```

---

#### Matching Policies to Issues

```typescript
import { getPolicyEngine } from './src/core/policy.js';
import { BeadsIssue } from './src/core/beads.js';

const engine = getPolicyEngine();

const issue: BeadsIssue = {
  id: 'issue-123',
  title: 'Fix authentication bug',
  description: 'Users cannot login',
  status: 'open',
  issue_type: 'bug',
  priority: 2,
  labels: ['bug', 'high-priority']
};

// Match policy based on issue type and labels
const matchedPolicy = engine.matchPolicy(issue);
console.log('Matched policy:', matchedPolicy);
// Output: 'bugfix-workflow'
```

---

#### Using Explicit Workflow Labels

```typescript
const issueWithWorkflowLabel: BeadsIssue = {
  id: 'issue-124',
  title: 'Add user dashboard',
  description: 'Create new dashboard for users',
  status: 'open',
  issue_type: 'feature',
  priority: 3,
  labels: ['ashep-workflow:feature-workflow', 'ui']
};

// Explicit workflow label takes priority
const matchedPolicy = engine.matchPolicy(issueWithWorkflowLabel);
console.log('Matched policy:', matchedPolicy);
// Output: 'feature-workflow'
```

---

### Transition Management

#### Determining Simple Transitions

```typescript
const outcome = {
  success: true,
  retry_count: 0,
  requires_approval: false
};

const transition = await engine.determineTransition(
  'default',
  'plan',
  outcome
);

console.log('Transition:', transition);
// Output: { type: 'advance', next_phase: 'implement', reason: 'Phase completed successfully' }
```

---

#### Handling Failures with Retry Logic

```typescript
const failedOutcome = {
  success: false,
  retry_count: 1,
  requires_approval: false
};

const transition = await engine.determineTransition(
  'default',
  'implement',
  failedOutcome,
  'issue-123'
);

console.log('Transition:', transition);
// Output: { type: 'retry', reason: 'Retry 2/3' }
```

---

#### Using AI-Based Transitions

```typescript
const partialSuccessOutcome = {
  success: false,
  retry_count: 0,
  requires_approval: false,
  result_type: 'partial_success'
};

const transition = await engine.determineTransition(
  'default',
  'test',
  partialSuccessOutcome,
  'issue-123'
);

console.log('Transition:', transition);
// Output: { type: 'dynamic_decision', dynamic_agent: 'test-decision', ... }
```

---

### Loop Prevention

#### Validating Phase Visit Limits

```typescript
const validation = await engine.validatePhaseLimits(
  'default',
  'issue-123',
  'test'
);

if (!validation.valid) {
  console.error('Phase limit exceeded:', validation.reason);
  // Output: "Phase 'test' exceeded max_visits (10) with 15 visits"
}
```

---

#### Checking Transition Limits

```typescript
const transitionValidation = await engine.validateTransitionLimits(
  'issue-123',
  'test',
  'implement',
  5
);

if (!transitionValidation.valid) {
  console.error('Transition limit exceeded:', transitionValidation.reason);
  // Output: "Transition test→implement exceeded max_transitions (5) with 7 occurrences"
}
```

---

#### Detecting Oscillating Cycles

```typescript
const cycleDetection = await engine.detectCycles(
  'issue-123',
  3
);

if (cycleDetection.detected) {
  console.error('Cycle detected:', cycleDetection.reason);
  // Output: "Oscillating cycle detected: implement → test → implement → test"
}
```

---

### Timeout and Stall Management

#### Calculating Timeouts

```typescript
const timeout = engine.calculateTimeout('default', 'implement');
console.log('Phase timeout:', timeout, 'ms');
// Output: 600000 ms (assuming base 300000 and multiplier 2.0)
```

---

#### Calculating Retry Delays

```typescript
const delay1 = engine.calculateRetryDelay('default', 0);
console.log('Retry delay 1:', delay1, 'ms');
// Output: 5000 ms (initial delay)

const delay2 = engine.calculateRetryDelay('default', 1);
console.log('Retry delay 2:', delay2, 'ms');
// Output: 10000 ms (exponential backoff: 5000 * 2^1)
```

---

## Decision Builder Examples

### Template Management

#### Getting Available Templates

```typescript
import { getDecisionPromptBuilder } from './src/core/decision-builder.js';

const builder = getDecisionPromptBuilder();

const templates = builder.getAvailableTemplates();
console.log('Available templates:', templates);
// Output: ['test-decision', 'failure-analysis', 'partial-success']
```

---

#### Accessing a Specific Template

```typescript
const template = builder.getTemplate('test-decision');
console.log('Template:', template);
// Output: { name: 'test-decision', description: '...', system_prompt: '...', ... }
```

---

### Building Decision Prompts

#### Building a Basic Decision Prompt

```typescript
import { BeadsIssue } from './src/core/beads.js';

const issue: BeadsIssue = {
  id: 'issue-123',
  title: 'Fix authentication bug',
  description: 'Users cannot login',
  status: 'open',
  issue_type: 'bug',
  priority: 2,
  labels: ['bug']
};

const outcome = {
  success: false,
  message: 'Test failed: Expected 200, got 401',
  error: 'Authentication error'
};

const prompt = builder.buildDecisionInstructions(
  issue,
  'test-decision',
  outcome,
  'test',
  'Determine if we should fix, retry, or review based on test results',
  ['fix', 'test', 'review']
);

console.log('Decision prompt:\n', prompt);
```

---

#### Building Prompts with Context

```typescript
const context = {
  recent_decisions: [
    {
      timestamp: Date.now() - 60000,
      decision: 'advance_to_test',
      reasoning: 'Implementation completed'
    }
  ],
  phase_history: [
    {
      phase: 'plan',
      attempt_number: 1,
      status: 'completed',
      duration_ms: 120000
    },
    {
      phase: 'implement',
      attempt_number: 1,
      status: 'completed',
      duration_ms: 300000
    }
  ],
  performance_context: {
    average_duration_ms: 210000,
    total_duration_ms: 420000,
    phase_visit_count: 1
  }
};

const promptWithContext = builder.buildDecisionInstructions(
  issue,
  'test-decision',
  outcome,
  'test',
  'Determine next phase',
  ['fix', 'test', 'review'],
  context
);
```

---

### Response Validation

#### Parsing AI Decision Responses

```typescript
const aiResponse = `{
  "decision": "advance_to_review",
  "reasoning": "All tests passed, code is ready for review",
  "confidence": 0.92,
  "recommendations": ["Check for edge cases", "Update documentation"]
}`;

const parsed = builder.parseDecisionResponse(
  aiResponse,
  ['fix', 'test', 'review']
);

console.log('Parsed decision:', parsed);
// Output: { action: 'advance_to_review', target_phase: 'review', reasoning: '...', confidence: 0.92, ... }
```

---

#### Validating Responses

```typescript
const validation = builder.validateResponse(
  aiResponse,
  ['fix', 'test', 'review'],
  {
    auto_advance: 0.85,
    require_approval: 0.6
  }
);

if (validation.valid) {
  console.log('Valid response:', validation.response);
} else {
  console.error('Validation errors:', validation.errors);
  console.warn('Validation warnings:', validation.warnings);
}
```

---

### Analytics

#### Getting Decision Analytics

```typescript
const analytics = builder.getAnalytics();

console.log('Total decisions:', analytics.total_decisions);
console.log('By type:', analytics.decisions_by_type);
console.log('Confidence distribution:', analytics.confidence_distribution);
console.log('Most common targets:', analytics.most_common_targets);

// Output:
// Total decisions: 150
// By type: { jump: 45, advance: 90, require_approval: 15 }
// Confidence distribution: { high: 80, medium: 50, low: 20 }
// Most common targets: [{ target: 'test', count: 60 }, ...]
```

---

#### Tracking Approval Rates

```typescript
const approvalRates = analytics.approval_rate_by_confidence;

console.log('High confidence approval rate:',
  approvalRates.high_approved / approvalRates.high_total * 100 + '%');
// Output: "93.75% (75/80)"

console.log('Medium confidence approval rate:',
  approvalRates.medium_approved / approvalRates.medium_total * 100 + '%');
// Output: "60.00% (30/50)"
```

---

## Retention Policy Examples

### Policy Configuration

#### Creating Retention Policies

```typescript
import { RetentionPolicy, getRetentionPolicyManager } from './src/core/retention-policy.js';
import { getLogger } from './src/core/logging.js';

const policies: RetentionPolicy[] = [
  {
    name: 'default',
    description: 'Default retention for most runs',
    enabled: true,
    age_days: 90,
    max_runs: 1000,
    max_size_mb: 500,
    archive_enabled: true,
    archive_after_days: 60,
    delete_after_days: 365,
    keep_successful_runs: false,
    keep_failed_runs: true
  },
  {
    name: 'aggressive',
    description: 'Aggressive cleanup for development',
    enabled: true,
    age_days: 7,
    max_runs: 100,
    max_size_mb: 50,
    archive_enabled: false,
    keep_failed_runs: false
  }
];

const manager = getRetentionPolicyManager(policies, getLogger());
```

---

### Run Evaluation

#### Checking if Run Should Be Archived

```typescript
const runData = {
  id: 'run-123',
  created_at: Date.now() - (91 * 24 * 60 * 60 * 1000), // 91 days ago
  status: 'closed',
  phase: 'review'
};

const outcome = {
  success: true,
  message: 'Review completed'
};

const archiveCheck = manager.shouldArchiveRun(runData, outcome);

console.log('Should archive:', archiveCheck.shouldArchive);
console.log('Matching policy:', archiveCheck.policy?.name);
// Output:
// Should archive: true
// Matching policy: "default"
```

---

#### Checking if Run Should Be Deleted

```typescript
const oldRunData = {
  id: 'run-124',
  created_at: Date.now() - (400 * 24 * 60 * 60 * 1000), // 400 days ago
  status: 'closed',
  phase: 'review'
};

const deleteCheck = manager.shouldDeleteRun(oldRunData, outcome);

console.log('Should delete:', deleteCheck.shouldDelete);
console.log('Matching policy:', deleteCheck.policy?.name);
// Output:
// Should delete: true
// Matching policy: "default"
```

---

### Cleanup Management

#### Checking if Cleanup is Needed

```typescript
const totalRuns = 1500;
const totalSizeBytes = 600 * 1024 * 1024; // 600 MB

const cleanupCheck = manager.needsCleanup(totalRuns, totalSizeBytes);

console.log('Needs cleanup:', cleanupCheck.needsCleanup);
console.log('Reason:', cleanupCheck.reason);
console.log('Triggering policy:', cleanupCheck.policy?.name);
// Output:
// Needs cleanup: true
// Reason: "Exceeds max_runs limit (1500 > 1000)"
// Triggering policy: "default"
```

---

#### Recording Cleanup Metrics

```typescript
import { CleanupMetrics } from './src/core/retention-policy.js';

const metrics: CleanupMetrics = {
  timestamp: Date.now(),
  policy_name: 'default',
  operation: 'cleanup',
  runs_processed: 1200,
  runs_archived: 200,
  runs_deleted: 50,
  bytes_archived: 10485760,
  bytes_deleted: 2097152,
  duration_ms: 15234
};

manager.recordMetrics(metrics);
```

---

#### Querying Cleanup Metrics

```typescript
// Get all metrics for a specific policy
const defaultMetrics = manager.getMetrics({
  policy_name: 'default',
  limit: 10
});

console.log('Recent default policy cleanups:', defaultMetrics.length);
// Output: 10

// Get metrics since a specific time
const recentMetrics = manager.getMetrics({
  since: Date.now() - (7 * 24 * 60 * 60 * 1000), // Last 7 days
  operation: 'archive'
});

console.log('Archives in last 7 days:', recentMetrics.length);
```

---

#### Getting Aggregate Metrics

```typescript
const aggregateMetrics = manager.getAggregateMetrics();

console.log('Total runs processed:', aggregateMetrics.total_runs_processed);
console.log('Total runs archived:', aggregateMetrics.total_runs_archived);
console.log('Total runs deleted:', aggregateMetrics.total_runs_deleted);
console.log('Average duration:', aggregateMetrics.average_duration_ms, 'ms');
console.log('Last cleanup:', aggregateMetrics.last_cleanup ? new Date(aggregateMetrics.last_cleanup).toISOString() : 'Never');

// Output:
// Total runs processed: 5000
// Total runs archived: 800
// Total runs deleted: 150
// Average duration: 12500 ms
// Last cleanup: 2024-01-01T00:00:00.000Z
```

---

## Phase Messenger Examples

### Basic Messaging

#### Sending a Context Message

```typescript
import { getPhaseMessenger } from './src/core/phase-messenger.js';

const messenger = getPhaseMessenger();

const message = messenger.sendMessage({
  issue_id: 'issue-123',
  from_phase: 'plan',
  to_phase: 'implement',
  message_type: 'context',
  content: 'Architecture decisions: Use REST API, PostgreSQL, and React frontend',
  run_counter: 1,
  metadata: {
    priority: 'high',
    related_issues: ['issue-124', 'issue-125']
  }
});

console.log('Message sent:', message.id);
// Output: msg-1704067200000-abc123def
```

---

#### Sending a Result Message

```typescript
const resultMessage = messenger.sendMessage({
  issue_id: 'issue-123',
  from_phase: 'implement',
  to_phase: 'test',
  message_type: 'result',
  content: 'Implementation completed. Features: login, registration, profile.',
  run_counter: 2,
  metadata: {
    files_changed: 15,
    tests_written: 30
  }
});

console.log('Result message sent:', resultMessage.id);
```

---

#### Sending a Decision Message

```typescript
const decisionMessage = messenger.sendMessage({
  issue_id: 'issue-123',
  from_phase: 'test',
  to_phase: 'fix',
  message_type: 'decision',
  content: 'Tests failed. Need to fix authentication logic before retrying.',
  run_counter: 2,
  metadata: {
    decision: 'jump_to_fix',
    confidence: 0.95,
    reason: 'Authentication tests failing'
  }
});
```

---

### Receiving Messages

#### Receiving Unread Messages

```typescript
const unreadMessages = messenger.receiveMessages(
  'issue-123',
  'implement',
  true // mark as read
);

console.log('Received', unreadMessages.length, 'unread messages');

unreadMessages.forEach(msg => {
  console.log(`[${msg.message_type}] ${msg.from_phase} → ${msg.to_phase}: ${msg.content}`);
});
```

---

#### Getting Unread Count

```typescript
const unreadCount = messenger.getUnreadCount('issue-123', 'test');

console.log('Unread messages for test phase:', unreadCount);
// Output: 3
```

---

### Querying Messages

#### Listing All Messages for an Issue

```typescript
const allMessages = messenger.listMessages({
  issue_id: 'issue-123'
});

console.log('Total messages:', allMessages.length);
```

---

#### Filtering by Message Type

```typescript
const resultMessages = messenger.listMessages({
  issue_id: 'issue-123',
  message_type: 'result',
  limit: 5
});

console.log('Recent result messages:', resultMessages.length);
```

---

#### Filtering by Phase

```typescript
const messagesForTest = messenger.listMessages({
  to_phase: 'test',
  read: false,
  limit: 10
});

console.log('Unread messages for test phase:', messagesForTest.length);
```

---

#### Filtering by Run Counter

```typescript
const run2Messages = messenger.listMessages({
  issue_id: 'issue-123',
  run_counter: 2
});

console.log('Messages from run 2:', run2Messages.length);
```

---

### Statistics and Cleanup

#### Getting Message Statistics

```typescript
const stats = messenger.getMessageStats('issue-123');

console.log('Total messages:', stats.total_messages);
console.log('Unread messages:', stats.unread_messages);
console.log('Read messages:', stats.read_messages);
console.log('Messages by phase:', stats.by_issue);
console.log('Database size:', stats.db_size_mb.toFixed(2), 'MB');

// Output:
// Total messages: 50
// Unread messages: 12
// Read messages: 38
// Messages by phase: { 'issue-123': 50 }
// Database size: 1.25 MB
```

---

#### Getting Global Statistics

```typescript
const globalStats = messenger.getMessageStats();

console.log('Global message stats:', globalStats);
// Output: { total_messages: 500, unread_messages: 85, ... }
```

---

#### Archiving Messages for an Issue

```typescript
const archiveResult = messenger.archiveMessagesForIssue(
  'issue-123',
  'issue-closed-cleanup'
);

console.log('Archived', archiveResult.archived, 'messages');
// Output: Archived 50 messages
```

---

#### Cleaning Up Messages

```typescript
const cleanupResult = messenger.cleanupPhaseMessages(
  'issue-123',
  'manual-cleanup'
);

console.log('Cleanup results:');
console.log('  Archived:', cleanupResult.archived);
console.log('  Deleted:', cleanupResult.deleted);
console.log('  DB size before:', (cleanupResult.db_size_before / 1024 / 1024).toFixed(2), 'MB');
console.log('  DB size after:', (cleanupResult.db_size_after / 1024 / 1024).toFixed(2), 'MB');

// Output:
// Cleanup results:
//   Archived: 50
//   Deleted: 50
//   DB size before: 1.25 MB
//   DB size after: 0.05 MB
```

---

#### Getting Cleanup Metrics

```typescript
const cleanupMetrics = messenger.getCleanupMetrics('issue-123');

console.log('Cleanup operations:', cleanupMetrics.length);

cleanupMetrics.forEach(metric => {
  console.log(`  ${new Date(metric.timestamp).toISOString()}: ${metric.reason}`);
  console.log(`    Messages archived: ${metric.messages_archived}`);
  console.log(`    Messages deleted: ${metric.messages_deleted}`);
});
```

---

## Complete Workflow Examples

### End-to-End Issue Processing

```typescript
import { getPolicyEngine } from './src/core/policy.js';
import { getDecisionPromptBuilder } from './src/core/decision-builder.js';
import { getPhaseMessenger } from './src/core/phase-messenger.js';

// Initialize systems
const policyEngine = getPolicyEngine();
const decisionBuilder = getDecisionPromptBuilder();
const messenger = getPhaseMessenger();

// Start processing an issue
async function processIssue(issueId: string) {
  // Match policy
  const policy = policyEngine.getPolicy();
  const phases = policyEngine.getPhaseSequence(policy?.name);

  console.log('Processing issue', issueId, 'with policy', policy?.name);
  console.log('Phases:', phases);

  for (const phaseName of phases) {
    console.log('Starting phase:', phaseName);

    // Check for unread messages
    const unreadCount = messenger.getUnreadCount(issueId, phaseName);
    if (unreadCount > 0) {
      const messages = messenger.receiveMessages(issueId, phaseName);
      console.log('Received', messages.length, 'messages');

      // Process messages...
    }

    // Execute phase work (simulated)
    const outcome = await executePhase(phaseName);

    // Determine transition
    const transition = await policyEngine.determineTransition(
      policy?.name || 'default',
      phaseName,
      outcome,
      issueId
    );

    console.log('Transition:', transition.type, transition.reason);

    // Handle dynamic decisions
    if (transition.type === 'dynamic_decision') {
      const prompt = policyEngine.buildDecisionInstructions(
        issue,
        transition.decision_config,
        outcome,
        phaseName
      );

      const decision = await callDecisionAgent(prompt);

      // Parse and validate
      const parsed = decisionBuilder.parseDecisionResponse(
        decision,
        transition.decision_config.allowed_destinations
      );

      console.log('AI decision:', parsed.action, parsed.target_phase);
    }

    // Send result message to next phase
    if (transition.next_phase) {
      messenger.sendMessage({
        issue_id: issueId,
        from_phase: phaseName,
        to_phase: transition.next_phase,
        message_type: 'result',
        content: `Phase ${phaseName} completed successfully`,
        run_counter: 1
      });
    }

    // Stop if blocking or closing
    if (transition.type === 'block' || transition.type === 'close') {
      break;
    }

    // Move to next phase
    if (transition.type === 'advance') {
      phaseName = transition.next_phase || '';
    }
  }
}

// Simulated phase execution
async function executePhase(phaseName: string) {
  console.log('Executing phase:', phaseName);
  // Simulate work...
  return {
    success: true,
    message: `${phaseName} completed`,
    retry_count: 0
  };
}

// Simulated AI agent call
async function callDecisionAgent(prompt: string): Promise<string> {
  console.log('Calling decision agent with prompt length:', prompt.length);
  // Simulate AI response...
  return `{
    "decision": "advance_to_test",
    "reasoning": "Phase completed successfully",
    "confidence": 0.95
  }`;
}

// Run the workflow
const issue = { id: 'issue-123', title: 'Fix bug', ... };
await processIssue(issue.id);
```

---

### Multi-Run Workflow with Loop Prevention

```typescript
async function processIssueWithRetry(issueId: string) {
  const policy = policyEngine.getPolicy();
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Attempt ${attempt}/${maxAttempts}`);

    const phaseName = 'implement';
    const outcome = await executePhase(phaseName);
    outcome.retry_count = attempt - 1;

    // Check phase visit limits
    const phaseValidation = await policyEngine.validatePhaseLimits(
      policy?.name || 'default',
      issueId,
      phaseName
    );

    if (!phaseValidation.valid) {
      console.error('Phase limit exceeded:', phaseValidation.reason);
      break;
    }

    // Determine transition
    const transition = await policyEngine.determineTransition(
      policy?.name || 'default',
      phaseName,
      outcome,
      issueId
    );

    console.log('Transition:', transition.type, transition.reason);

    if (transition.type === 'retry') {
      const delay = policyEngine.calculateRetryDelay(
        policy?.name || 'default',
        attempt - 1
      );
      console.log('Waiting', delay, 'ms before retry...');
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }

    if (transition.type === 'block') {
      console.error('Workflow blocked:', transition.reason);
      break;
    }

    // Success - send message and continue
    messenger.sendMessage({
      issue_id: issueId,
      from_phase: phaseName,
      to_phase: 'test',
      message_type: 'result',
      content: 'Implementation completed',
      run_counter: attempt
    });

    break;
  }
}
```

---

### Data Cleanup Workflow

```typescript
async function performDataCleanup() {
  const policyManager = getRetentionPolicyManager(
    policies,
    getLogger()
  );

  const stats = messenger.getMessageStats();

  console.log('Checking cleanup needs...');
  const cleanupCheck = policyManager.needsCleanup(
    stats.total_messages,
    stats.db_size_mb * 1024 * 1024
  );

  if (!cleanupCheck.needsCleanup) {
    console.log('No cleanup needed');
    return;
  }

  console.log('Cleanup needed:', cleanupCheck.reason);
  console.log('Triggering policy:', cleanupCheck.policy?.name);

  const startTime = Date.now();
  let totalArchived = 0;
  let totalDeleted = 0;

  // Find old messages by phase history
  const allMessages = messenger.listMessages();
  const messagesByIssue = new Map<string, any[]>();

  for (const msg of allMessages) {
    if (!messagesByIssue.has(msg.issue_id)) {
      messagesByIssue.set(msg.issue_id, []);
    }
    messagesByIssue.get(msg.issue_id)!.push(msg);
  }

  for (const [issueId, messages] of messagesByIssue) {
    const oldestMessage = messages.sort((a, b) => a.created_at - b.created_at)[0];
    const ageDays = (Date.now() - oldestMessage.created_at) / (24 * 60 * 60 * 1000);

    if (ageDays > 90) {
      const result = messenger.cleanupPhaseMessages(issueId, 'retention-policy-cleanup');
      totalArchived += result.archived;
      totalDeleted += result.deleted;
    }
  }

  const duration = Date.now() - startTime;

  const metrics: CleanupMetrics = {
    timestamp: Date.now(),
    policy_name: cleanupCheck.policy?.name || 'unknown',
    operation: 'cleanup',
    runs_processed: messagesByIssue.size,
    runs_archived: totalArchived,
    runs_deleted: totalDeleted,
    bytes_archived: 0,
    bytes_deleted: stats.db_size_mb * 1024 * 1024,
    duration_ms: duration
  };

  policyManager.recordMetrics(metrics);

  console.log('Cleanup completed:');
  console.log('  Issues processed:', metrics.runs_processed);
  console.log('  Messages archived:', totalArchived);
  console.log('  Messages deleted:', totalDeleted);
  console.log('  Duration:', duration, 'ms');
}
```

---

For more information, see:
- [API Documentation](./api-reference.md)
- [Integration Guides](./integration-guides.md)
- [Troubleshooting Guide](./troubleshooting.md)
