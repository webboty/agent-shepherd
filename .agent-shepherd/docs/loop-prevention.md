# Loop Prevention

Loop prevention is a critical safeguard that prevents Agent Shepherd workflows from entering infinite cycles or getting stuck in repetitive patterns. The system uses multiple complementary mechanisms to detect and block problematic transitions.

## Overview

With enhanced transitions enabling AI-based routing and phase jumps, workflows can potentially:
- Revisit phases repeatedly (e.g., fix → test → fix → test)
- Oscillate between phases (e.g., A→B→A→B)
- Exceed reasonable iteration counts

Loop prevention ensures workflows remain bounded, efficient, and safe.

## Protection Mechanisms

Agent Shepherd implements **four layers of loop protection**:

1. **Phase Visit Limits** - Maximum visits per phase
2. **Transition Limits** - Maximum repetitions of specific transitions
3. **Cycle Detection** - Pattern detection for oscillating transitions
4. **HITL Escalation** - Human intervention when limits are reached

### 1. Phase Visit Limits

**Purpose**: Prevent phases from being visited excessive times

Each phase tracks how many times it has been executed for a specific issue. When the limit is reached, the phase is blocked.

**Configuration**:
```yaml
# Global default (config.yaml)
loop_prevention:
  max_visits_default: 10

# Phase override (policies.yaml)
phases:
  - name: test
    max_visits: 5  # Test phase limited to 5 visits
```

**Behavior**:
- On phase entry: Check visit count
- If `visits >= max_visits`: Block transition with error
- Log reason: `Phase 'test' exceeded max_visits (5) with 5 visits`

**Use Cases**:
- Test phases with flaky failures (limit iterations)
- Debug phases (prevents infinite debugging loops)
- Review phases (limit rework cycles)

**Example**:
```
Issue-123 workflow execution:
 1. implement (visit 1/10) ✓
 2. test (visit 1/5) ✓
 3. test (visit 2/5) - failure, retry
 4. test (visit 3/5) - failure, retry
 5. test (visit 4/5) - failure, retry
 6. test (visit 5/5) - failure, retry
 7. test (visit 6/5) ✗ BLOCKED: Exceeded max_visits
```

### 2. Transition Limits

**Purpose**: Prevent specific phase-to-phase transitions from repeating

Each transition pair (A→B) is tracked for an issue. When the limit is reached, that specific transition is blocked.

**Configuration**:
```yaml
# Global default (config.yaml)
loop_prevention:
  max_transitions_default: 5

# No per-transition override - uses global default
```

**Behavior**:
- Before transition A→B: Check transition count
- If `count >= max_transitions`: Block with error
- Log reason: `Transition fix→test exceeded max_transitions (5) with 5 occurrences`

**Use Cases**:
- Fix-test cycles (prevent endless debugging)
- Review-rework loops (limit rework attempts)
- Deploy-rollback cycles (prevents thrashing)

**Example**:
```
Issue-456 transition history:
 1. implement→test (count 1/5)
 2. test→fix (count 1/5)
 3. fix→test (count 1/5)
 4. test→fix (count 2/5)
 5. fix→test (count 2/5)
 6. test→fix (count 3/5)
 7. fix→test (count 3/5)
 8. test→fix (count 4/5)
 9. fix→test (count 4/5)
10. test→fix (count 5/5)
11. fix→test (count 5/5) ✗ BLOCKED: Exceeded max_transitions
```

### 3. Cycle Detection

**Purpose**: Detect oscillating patterns in recent transitions

Identifies when a workflow bounces back and forth between phases in a repeating pattern.

**Configuration**:
```yaml
# Global settings (config.yaml)
loop_prevention:
  cycle_detection_enabled: true
  cycle_detection_length: 3  # Detect 3-phase oscillations
```

**Behavior**:
- After each transition: Analyze last 10 transitions
- Look for palindromic patterns (A→B→C→C→B→A)
- If oscillation detected: Block transition
- Log reason: `Oscillating cycle detected: fix→test→fix→test`

**Pattern Detection**:
```typescript
// Example oscillation (length 2)
transitions = [fix→test, test→fix, fix→test, test→fix]
pattern = [fix→test, test→fix]  // Palindrome!
BLOCKED

// Example oscillation (length 3)
transitions = [A→B, B→C, C→B, B→A, A→B, B→C, C→B]
pattern = [A→B, B→C, C→B]  // Palindrome!
BLOCKED
```

**Use Cases**:
- Two-phase oscillation (develop→test→develop→test)
- Three-phase oscillation (plan→implement→review→plan)
- Complex repeating patterns

**Example**:
```
Issue-789 transition history:
 1. plan→implement
 2. implement→test
 3. test→fix
 4. fix→implement
 5. implement→test
 6. test→fix
 7. fix→implement
   ↓ Cycle detection analyzes last 7 transitions
   ↓ Pattern found: implement→test→fix→fix→test→implement
   ↓ Palindrome detected (3-phase oscillation)
BLOCKED: Oscillating cycle detected
```

### 4. HITL Escalation

**Purpose**: Bring humans into the loop when automation fails

When loop prevention blocks a transition, the system can automatically request human intervention.

**Configuration**:
```yaml
# Global settings (config.yaml)
loop_prevention:
  trigger_hitl: true  # Enable HITL escalation
```

**Behavior**:
- When blocked: Add `ashep-hitl:loop-prevention` label to issue
- Worker stops processing that issue
- Human reviews and decides next action
- Human removes HITL label when resolved

**Example**:
```
Issue-123 blocked:
  Label: ashep-hitl:loop-prevention
  Message: "Phase 'test' exceeded max_visits (5)"

Human actions:
  1. Investigate why tests keep failing
  2. Fix root cause or adjust test expectations
  3. Remove HITL label
  4. Worker resumes processing
```

## Configuration

### Global Loop Prevention (config.yaml)

```yaml
loop_prevention:
  enabled: true                    # Master switch
  max_visits_default: 10          # Global phase visit limit
  max_transitions_default: 5       # Global transition limit
  cycle_detection_enabled: true     # Enable pattern detection
  cycle_detection_length: 3         # Cycle detection sensitivity (2-5)
  trigger_hitl: true              # Escalate to human
```

### Phase-Level Overrides (policies.yaml)

```yaml
phases:
  - name: test
    max_visits: 5                 # Override global default

  - name: deploy
    max_visits: 3                 # Strict limit for production phases
```

## When Loop Prevention Activates

### Phase Visit Limit Reached

**Scenario**: Phase visited too many times

**Symptoms**:
- Error message: `Phase 'X' exceeded max_visits (N) with M visits`
- Workflow blocked
- HITL label added (if enabled)

**Resolution**:
1. Investigate why phase keeps repeating
2. Fix underlying issue (e.g., flaky tests, logic errors)
3. Adjust `max_visits` if limit too restrictive
4. Remove HITL label to resume

### Transition Limit Reached

**Scenario**: Same transition repeated too many times

**Symptoms**:
- Error message: `Transition A→B exceeded max_transitions (N) with M occurrences`
- Workflow blocked
- HITL label added (if enabled)

**Resolution**:
1. Analyze why same transition repeats
2. Check if workflow logic is correct
3. Consider alternative phases or paths
4. Adjust `max_transitions` if appropriate
5. Remove HITL label to resume

### Cycle Detected

**Scenario**: Oscillating pattern found

**Symptoms**:
- Error message: `Oscillating cycle detected: A→B→C→B→A`
- Workflow blocked
- HITL label added (if enabled)

**Resolution**:
1. Review transition history for pattern
2. Identify why phases bounce back and forth
3. Fix root cause (e.g., inadequate phase outcomes)
4. Adjust workflow logic to break cycle
5. Remove HITL label to resume

## Integration with Enhanced Transitions

Loop prevention works seamlessly with enhanced transitions:

### String Transitions

```yaml
phases:
  - name: test
    transitions:
      on_success: deploy
```

**Loop Prevention**:
- Tracks test→deploy transitions
- Blocks if limit exceeded
- Works like any other transition

### Decision Transitions

```yaml
phases:
  - name: test
    transitions:
      on_success:
        capability: test-decision
        allowed_destinations: [deploy, fix-bugs, review]
```

**Loop Prevention**:
- Tracks each destination transition separately
- test→deploy, test→fix-bugs, test→review all tracked
- Blocks individual transitions when limits hit
- Respects `allowed_destinations` for safety

## Best Practices

### 1. Set Appropriate Limits

Match limits to workflow complexity:

```yaml
# Simple workflows (few phases)
max_visits_default: 5
max_transitions_default: 3

# Complex workflows (many phases, debugging)
max_visits_default: 15
max_transitions_default: 8
```

### 2. Use Phase-Level Overrides for Critical Phases

Be stricter on production or expensive phases:

```yaml
phases:
  - name: deploy
    max_visits: 2  # Limit production deployments

  - name: test
    max_visits: 10  # Allow more test iterations
```

### 3. Enable Cycle Detection for AI Workflows

AI decision agents can create unexpected patterns:

```yaml
loop_prevention:
  cycle_detection_enabled: true
  cycle_detection_length: 3
```

**Tip**: Start with length 2-3, increase for more complex workflows.

### 4. Use HITL Escalation for Safety

Always enable human escalation in production:

```yaml
loop_prevention:
  trigger_hitl: true
```

**Benefits**:
- Human oversight of blocked workflows
- Prevents indefinite blocking
- Allows manual intervention

### 5. Monitor Loop Prevention Events

Check logs for blocked transitions:

```bash
# Find blocked workflows
grep "exceeded max_visits" logs/*.log
grep "exceeded max_transitions" logs/*.log
grep "Oscillating cycle detected" logs/*.log

# Check HITL escalations
bd list --labels "ashep-hitl:loop-prevention"
```

## Troubleshooting

### False Positives

**Problem**: Legitimate workflow blocked as loop

**Diagnose**:
1. Review transition history in logs
2. Check if workflow truly has a problem
3. Evaluate if limits are too restrictive

**Solutions**:
- Increase specific limits (phase-level overrides)
- Adjust global defaults
- Investigate workflow logic for inefficiencies

### Endless Blocking

**Problem**: Workflow stuck in loop prevention, can't progress

**Diagnose**:
1. Check HITL label status
2. Review loop prevention error
3. Identify root cause

**Solutions**:
- Human removes HITL label after fix
- Increase limits temporarily
- Redesign workflow to avoid repetitive patterns

### Cycle Detection Too Sensitive

**Problem**: Normal workflow flagged as oscillation

**Diagnose**:
1. Review detected pattern
2. Check if pattern is truly problematic
3. Evaluate cycle detection length

**Solutions**:
- Increase `cycle_detection_length` (3 → 4 or 5)
- Disable cycle detection for specific workflows
- Adjust workflow to reduce backtracking

## Advanced Configuration

### Selective Cycle Detection

Disable cycle detection for specific issue types:

```yaml
# In policy definition
phases:
  - name: iterate
    # Known to cycle intentionally (e.g., optimization loops)
```

**Solution**: Use higher `max_visits` instead of disabling cycle detection.

### Custom Loop Handling

Implement custom loop prevention logic in plugins:

```typescript
// Example: Check for specific loop patterns
if (phase === "optimize" && visitCount > 3) {
  // Check convergence metric
  if (!hasConverged()) {
    return { type: "close", reason: "Optimization failed to converge" };
  }
}
```

### Loop Prevention Metrics

Track loop prevention events:

```typescript
const metrics = {
  phase_visits_blocked: 12,
  transitions_blocked: 5,
  cycles_detected: 3,
  hitl_triggered: 20,
};
```

**Use**: Identify problematic workflows and adjust configurations.

## Related Documentation

- [Enhanced Transitions](./enhanced-transitions.md) - Transition system overview
- [Decision Agents](./decision-agents.md) - AI-driven routing
- [Policies Configuration](./policies-config.md) - Complete policy reference
- [Architecture](./architecture.md) - System design and data flow
