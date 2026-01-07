# Duration Metrics Implementation - Verification Summary

## Issue: agent-shepherd-alg8.2 - 1.4 Implement Duration Metrics Calculation

### Tasks Completed

#### ✅ agent-shepherd-alg8.2.1 - 1.4.2 Store Duration in RunOutcome
**Status:** PASS

**Implementation:**
- Duration stored in `RunOutcome.metrics.duration_ms` (src/core/logging.ts:60)
- Start time stored in `RunOutcome.metrics.start_time_ms` (src/core/logging.ts:63)
- End time stored in `RunOutcome.metrics.end_time_ms` (src/core/logging.ts:64)

**Evidence:**
- Worker engine calculates and stores duration (worker-engine.ts:364-369)
- Schema validation in run-outcome.schema.json (lines 312-316, 327-335)

---

#### ✅ agent-shepherd-alg8.2.2 - 1.4.1 Add Timestamp Tracking to Worker Engine
**Status:** PASS

**Implementation:**
- `startTimestamp` captured at line 286
- `endTimestamp` captured at line 318
- `wallClockDurationMs` calculated at line 319
- Duration stored in outcome metrics at lines 364-369

**Evidence:**
```typescript
const startTimestamp = Date.now();  // Line 286
const endTimestamp = Date.now();    // Line 318
const wallClockDurationMs = endTimestamp - startTimestamp;  // Line 319
```

---

#### ✅ agent-shepherd-alg8.2.3 - 1.4.4 Add Timeout Detection
**Status:** PASS

**Implementation:**
- Timeout threshold calculated from policy at line 345
- Actual duration compared against threshold at line 346
- Timeout decision logged with type="timeout" at lines 349-366

**Evidence:**
```typescript
const policyTimeout = this.policyEngine.calculateTimeout(policy, phase);  // Line 345
const actualDuration = parsedOutcome.metrics?.duration_ms || wallClockDurationMs;  // Line 346

if (actualDuration > policyTimeout) {
  timeoutReason = `Execution exceeded timeout of ${policyTimeout}ms (actual: ${actualDuration}ms)`;
  this.logger.logDecision({
    run_id: runId,
    type: "timeout",
    decision: "timeout_exceeded",
    reasoning: timeoutReason,
    metadata: {
      timeout_threshold_ms: policyTimeout,
      actual_duration_ms: actualDuration,
      phase,
    },
  });
}
```

---

#### ✅ agent-shepherd-alg8.2.5 - 1.4.3 Add Phase Duration Tracking
**Status:** PASS

**Implementation:**
- Cumulative phase duration tracked in `phase_total_duration_ms` metadata
- Previous phase total retrieved before creating new run (line 197)
- Cumulative total stored in run metadata (lines 198-200)
- Updated after run completion (lines 230-238)

**Evidence:**
```typescript
// Get cumulative phase duration from previous runs
const previousPhaseTotal = this.logger.getPhaseTotalDuration(issue.id, phase);

const run = this.logger.createRun({
  id: runId,
  issue_id: issue.id,
  session_id: "",
  agent_id: agent.id,
  policy_name: policy,
  phase,
  status: "pending",
  metadata: {
    attempt_number: attemptNumber,
    retry_count: retryCount,
    phase_total_duration_ms: previousPhaseTotal,
  },
});

// Update after run completion
updateData.metadata = {
  ...run.metadata,
  phase_total_duration_ms: currentPhaseTotal + currentDuration,
};
```

**Query Methods:**
- `getPhaseTotalDuration(issueId, phaseName): number` - Gets cumulative duration for a phase
- `getPhaseAverageDuration(issueId, phaseName): number` - Gets average duration for a phase

---

#### ✅ agent-shepherd-alg8.2.6 - 1.4.5 Add Duration Queries to Logger
**Status:** PASS

**Implementation:**

**Query Methods (all implemented):**

1. **Synchronous Methods:**
   - `getTotalDuration(query): number` - Total duration for filtered runs
   - `getAverageDuration(query): number` - Average duration for filtered runs
   - `getMinDuration(query): number | null` - Minimum duration
   - `getMaxDuration(query): number | null` - Maximum duration
   - `getDurationStats(query): DurationStats` - Comprehensive statistics

2. **Async Methods (as required):**
   - `getAveragePhaseDuration(issueId, phaseName): Promise<number>` ✅
   - `getTotalIssueDuration(issueId): Promise<number>` ✅
   - `getSlowestPhases(issueId, limit?): Promise<Array<{phase, avg_duration_ms}>>` ✅

3. **Database Index:**
   - `idx_runs_phase_completed` created at line 157 ✅

**Evidence:**
```typescript
async getAveragePhaseDuration(issueId: string, phaseName: string): Promise<number> {
  return this.getAverageDuration({ issue_id: issueId, phase: phaseName });
}

async getTotalIssueDuration(issueId: string): Promise<number> {
  const total = this.getTotalDuration({ issue_id: issueId });
  return total;
}

async getSlowestPhases(
  issueId: string,
  limit: number = 10
): Promise<Array<{ phase: string; avg_duration_ms: number }>> {
  const stmt = this.db.prepare(`
    SELECT phase, AVG(CAST(json_extract(outcome, '$.metrics.duration_ms') AS INTEGER)) as avg_duration_ms
    FROM runs
    WHERE issue_id = ? AND outcome IS NOT NULL AND json_extract(outcome, '$.metrics.duration_ms') IS NOT NULL
    GROUP BY phase
    ORDER BY avg_duration_ms DESC
    LIMIT ?
  `);
  // ...
}
```

---

#### ✅ agent-shepherd-alg8.2.7 - 1.4.6 Tests for Duration Tracking
**Status:** PASS

**Test Coverage:** 40 tests, all passing

**Test Categories:**

1. **Timestamp Tracking (5 tests)**
   - Store start_time_ms in outcome metrics
   - Store end_time_ms in outcome metrics
   - Calculate duration_ms from start and end times
   - Handle runs without duration metrics
   - Persist duration metrics across updates

2. **Duration Storage (4 tests)**
   - Store duration_ms in completed run outcome
   - Store duration in failed run outcome
   - Store duration alongside other metrics
   - Serialize and deserialize duration from JSONL

3. **Phase Duration Tracking (6 tests)**
   - Track duration per phase for an issue
   - Track cumulative duration across multiple runs
   - Calculate average duration per phase
   - Store phase_total_duration_ms metadata
   - Handle phases with no runs

4. **Timeout Detection (4 tests)**
   - Detect when run exceeds timeout threshold
   - Detect when run is within timeout threshold
   - Store timeout reason in outcome
   - Log timeout decision with correct type ✅

5. **Duration Queries (11 tests)**
   - Calculate total duration for all runs
   - Filter by issue_id, agent_id, phase, status
   - Calculate average duration
   - Calculate minimum and maximum duration
   - Duration statistics

6. **Integration Scenarios (2 tests)**
   - Typical worker engine run lifecycle
   - Failed runs with duration tracking

7. **Async Duration Query Methods (8 tests)** ✅
   - getAveragePhaseDuration returns Promise<number>
   - getTotalIssueDuration calculates total for all phases
   - getSlowestPhases returns phases sorted by duration
   - Respects limit parameter
   - Handles non-existent data

**Evidence:**
- Test file: `tests/duration-tracking.test.ts`
- 40 tests total
- All tests passing
- Covers all new functionality including async methods, timeout decisions, and metadata

---

## Database Schema Updates

### New Index
```sql
CREATE INDEX IF NOT EXISTS idx_runs_phase_completed ON runs(phase, completed_at)
```

**Location:** `src/core/logging.ts:157`

**Purpose:** Optimize queries for phase duration calculations

---

## Type System Updates

### DecisionRecord Type
```typescript
export interface DecisionRecord {
  id: string;
  run_id: string;
  timestamp: number;
  type: "agent_selection" | "phase_transition" | "retry" | "hitl" | "timeout"; // ✅ Added "timeout"
  decision: string;
  reasoning?: string;
  metadata?: {
    [key: string]: unknown;
  };
}
```

**Location:** `src/core/logging.ts:70-80`

---

## Worker Engine Updates

### Timeout Decision Logging
```typescript
if (actualDuration > policyTimeout) {
  timeoutReason = `Execution exceeded timeout of ${policyTimeout}ms (actual: ${actualDuration}ms)`;
  console.warn(timeoutReason);
  parsedOutcome.success = false;
  parsedOutcome.error = timeoutReason;

  // ✅ Added timeout decision logging
  this.logger.logDecision({
    run_id: runId,
    type: "timeout",
    decision: "timeout_exceeded",
    reasoning: timeoutReason,
    metadata: {
      timeout_threshold_ms: policyTimeout,
      actual_duration_ms: actualDuration,
      phase,
    },
  });
}
```

**Location:** `src/core/worker-engine.ts:349-366`

### Phase Duration Metadata Tracking
```typescript
// Get cumulative phase duration from previous runs
const previousPhaseTotal = this.logger.getPhaseTotalDuration(issue.id, phase);

const run = this.logger.createRun({
  // ...
  metadata: {
    attempt_number: attemptNumber,
    retry_count: retryCount,
    phase_total_duration_ms: previousPhaseTotal, // ✅ Cumulative tracking
  },
});

// Update after completion
const currentPhaseTotal = (run.metadata as any)?.phase_total_duration_ms || 0;
const currentDuration = outcome.metrics?.duration_ms || 0;

updateData.metadata = {
  ...run.metadata,
  phase_total_duration_ms: currentPhaseTotal + currentDuration, // ✅ Update cumulative
};
```

**Locations:**
- `src/core/worker-engine.ts:197-200` (initial metadata)
- `src/core/worker-engine.ts:230-238` (update metadata)

---

## Verification

### Test Results
```bash
$ bun test ./.agent-shepherd/tests/duration-tracking.test.ts
40 pass
0 fail
90 expect() calls
Ran 40 tests across 1 file.
```

### All Tests
```bash
$ bun test ./.agent-shepherd/tests/
285 pass
0 fail
675 expect() calls
Ran 285 tests across 18 files.
```

### Linting
```bash
$ cd .agent-shepherd && bun run lint
# No errors
```

### Type Checking
```bash
$ cd .agent-shepherd && bun run type-check
# No errors
```

---

## Summary

All requirements from the issue have been successfully implemented:

✅ **Timestamp Tracking** - Worker engine captures start/end timestamps and calculates duration
✅ **Duration Storage** - Duration metrics stored in RunOutcome
✅ **Phase Duration Tracking** - Cumulative tracking with `phase_total_duration_ms` metadata
✅ **Timeout Detection** - Compares against policy thresholds and logs timeout decisions
✅ **Timeout Decision Logging** - Logs decisions with type="timeout"
✅ **Duration Query Methods** - All required synchronous and async methods implemented
✅ **Database Index** - `idx_runs_phase_completed` index created for query optimization
✅ **Comprehensive Tests** - 40 tests covering all functionality
✅ **Code Quality** - No linting errors, no type errors, all tests passing

**Implementation Complete: YES**
