# Issue Container Handling - Troubleshooting Guide
This guide helps you diagnose and resolve common issues with the Smart Container Handling System.

## Quick Diagnostics

## What is an Issue Container?

An **issue container** is an organizational issue in Beads that:

- **Groups related work items**: Contains subtasks that represent actual implementation work
- **Has no direct function**: The container itself doesn't require coding or implementation
- **Tracks progress**: Represents collective completion of grouped subtasks
- **Common types**: Epics, milestones, phases, or parent tasks

**Important:** This guide refers to "issue containers" - organizational issues in Beads that contain subtasks. This is **not** related to Docker containers or software containerization.


### Check Container Handling Status

```bash
# Verify issue container handling is enabled
grep -A 3 "container_handling:" .agent-shepherd/config/config.yaml

# Check config validity
ashep validate-config

# View worker logs for issue container handling
tail -f .agent-shepherd/data/logs/worker.log | grep -i container
```

### Inspect a Specific Issue Container

```bash
# View issue container details
bd show EPIC-123

# Check issue container labels
bd show EPIC-123 | grep ashep

# View issue container children
bd dep list EPIC-123

# Check if issue container is managed
ashep list-active | grep EPIC-123
```

## Common Issues

### Issue: Issue Containers Not Detected

**Symptoms:**
- Epics/parent tasks not being handled as issue containers
- Auto-close not triggering
- No issue container-related labels appearing

**Diagnosis:**

```bash
# Check if issue container handling is enabled
grep "enabled:" .agent-shepherd/config/config.yaml | grep -A 1 "container_handling"

# Check detection configuration
grep -A 10 "container_detection:" .agent-shepherd/config/config.yaml

# Check worker logs for detection attempts
grep "Checking issue container" .agent-shepherd/data/logs/worker.log
```

**Possible Causes:**

1. **Issue container handling disabled**
   - Fix: Set `enabled: true` in config

2. **Detection thresholds too high**
   - Fix: Lower `min_children` value

3. **Issue type not recognized**
   - Fix: Check issue type is `epic`, `milestone`, `phase`, or `group`

4. **No parent-child dependencies**
   - Fix: Add parent-child dependencies between issue container and children

**Solutions:**

```yaml
# Solution 1: Enable issue container handling
container_handling:
  enabled: true

# Solution 2: Lower detection threshold
container_handling:
  container_detection:
    min_children: 1  # Reduced from 2 or higher

# Solution 3: Enable all detection factors
container_handling:
  container_detection:
    check_children: true
    check_description: true
    check_dependencies: true
```

### Issue: False Positives - Regular Tasks Detected as Issue Containers

**Symptoms:**
- Regular tasks being treated as issue containers
- Auto-close triggering unexpectedly
- Validation being requested for non-containers

**Diagnosis:**

```bash
# Check detection confidence in logs
grep "confidence" .agent-shepherd/data/logs/worker.log

# Check issue types being detected
grep "Issue container type" .agent-shepherd/data/logs/worker.log

# Review issue container children for false positives
bd dep list TASK-456  # Should be empty for non-containers
```

**Possible Causes:**

1. **`min_children` threshold too low**
   - Fix: Increase `min_children` value

2. **Description pattern matching too aggressive**
   - Fix: Disable `check_description`

3. **Dependency structure misidentified**
   - Fix: Review and fix parent-child dependencies

**Solutions:**

```yaml
# Solution 1: Increase min_children threshold
container_handling:
  container_detection:
    min_children: 5  # Require more children

# Solution 2: Disable description matching
container_handling:
  container_detection:
    check_description: false  # Skip pattern matching

# Solution 3: Disable dependency structure check
container_handling:
  container_detection:
    check_dependencies: false  # Only use type and children
```

### Issue: Issue Containers Not Closing Automatically

**Symptoms:**
- All children closed but issue container remains open
- No auto-close triggering
- Issue container stuck in `open` status

**Diagnosis:**

```bash
# Check children status
bd dep list EPIC-123

# Check issue container status
bd show EPIC-123

# Check worker logs for close attempts
grep "ready_to_close" .agent-shepherd/data/logs/worker.log

# Check if HITL validation is pending
bd show EPIC-123 | grep ashep-hitl
```

**Possible Causes:**

1. **Issue container in HITL mode awaiting review**
   - Fix: Approve issue container validation

2. **Default mode is not `auto-close`**
   - Fix: Set `default_mode: auto-close` or level policy

3. **Children not actually closed**
   - Fix: Verify all children have status `closed`

4. **Worker not running**
   - Fix: Start worker engine

**Solutions:**

```bash
# Solution 1: Approve HITL validation
bd update EPIC-123 --remove-label "ashep-hitl:container-validation"

# Solution 2: Close issue container manually
bd close EPIC-123

# Solution 3: Verify children are closed
for child in $(bd dep list EPIC-123 --json | jq -r '.[].dependent_id'); do
  bd show $child | grep "Status:"
done

# Solution 4: Check worker status
ps aux | grep "ashep worker"
```

### Issue: Issue Containers Stuck in Validation

**Symptoms:**
- Issue container has `ashep-hitl:container-validation` label
- No progress despite all children being closed
- Validation not completing

**Diagnosis:**

```bash
# Check validation status
bd show EPIC-123 | grep ashep-hitl

# Check worker logs for validation attempts
grep "Validating issue container" .agent-shepherd/data/logs/worker.log

# Check for validation errors
grep "validation" .agent-shepherd/data/logs/worker.log | grep -i error

# Verify validation agent exists
grep "container-validation" .agent-shepherd/config/agents.yaml
```

**Possible Causes:**

1. **No agent with `container-validation` capability**
   - Fix: Add or enable validation agent

2. **Agent with validation capability not active**
   - Fix: Set `active: true` in agents.yaml

3. **Decision agent timeout**
   - Fix: Increase timeout or check agent health

4. **Validation outcome unclear (UNCLEAR)**
   - Fix: Provide manual review or improve context

**Solutions:**

```yaml
# Solution 1: Add validation agent
agents:
  - id: epic-validator
    name: "Epic Validator"
    capabilities:
      - container-validation
      - analysis
    active: true  # Must be active
```

```bash
# Solution 2: Manual approval
bd update EPIC-123 --remove-label "ashep-hitl:container-validation"
bd close EPIC-123

# Solution 3: Check agent status
ashep list-agents | grep container-validation

# Solution 4: Increase timeout
# In config.yaml
worker_assistant:
  timeoutMs: 30000  # Increased from default 10000
```

### Issue: Invalid Validation Outcome

**Symptoms:**
- Worker logs show "Invalid issue container validation outcome"
- Validation rejected without clear reason
- Issue container not proceeding

**Diagnosis:**

```bash
# Check validation logs
grep "Invalid issue container validation outcome" .agent-shepherd/data/logs/worker.log

# Review recent validation attempts
grep "validation" .agent-shepherd/data/logs/worker.log | tail -20

# Check decision agent configuration
cat .agent-shepherd/config/decision-prompts.yaml | grep -A 20 container
```

**Possible Causes:**

1. **Invalid outcome from validation agent**
   - Fix: Update agent to return valid outcomes

2. **Decision prompt malformed**
   - Fix: Review and fix decision prompt template

3. **Agent not returning expected format**
   - Fix: Ensure agent returns one-word outcome

**Valid Outcomes:**
- `DONE` - Issue container complete and ready to close
- `NEEDS_WORK` - Issue container needs more work
- `UNCLEAR` - Cannot determine (triggers HITL)

**Solutions:**

```yaml
# Solution 1: Update decision prompt
# In decision-prompts.yaml
prompts:
  container_validation:
    prompt: |
      You are evaluating whether an issue container is complete.

      Return one word only:
      - DONE: Issue container is complete and ready to close
      - NEEDS_WORK: Issue container needs more work
      - UNCLEAR: Cannot determine

      Issue Container: {container_id}
      Type: {container_type}
      Children: {children_completed}/{total_children}
```
```bash

# Solution 2: Test validation manually
ashep work              # Auto-pick next issue
ashep work EPIC-123      # Or test specific epic

# Solution 3: Review decision agent logs
grep "decision-agent" .agent-shepherd/data/logs/worker.log
```

### Issue: Hierarchy Level Calculation Incorrect

**Symptoms:**
- Wrong level policy applied to issue containers
- Level 1 epics treated as level 2
- Unexpected workflow overrides

**Diagnosis:**

```bash
# Check issue ID structure
bd show EPIC-123 | grep "^ID:"

# Check applied policy in logs
grep "hierarchy level" .agent-shepherd/data/logs/worker.log

# Verify level policies in config
grep -A 10 "level_policies:" .agent-shepherd/config/config.yaml
```

**Possible Causes:**

1. **Beads ID format not following dot notation**
   - Fix: Use standard Beads ID format (PROJECT-1, PROJECT-1.1, etc.)

2. **Level policy configuration error**
   - Fix: Ensure level keys are strings (e.g., "1", not 1)

3. **Level calculation bug**
   - Fix: Report as bug with examples

**Examples of Correct Level Calculation:**

```
EPIC-1          → Level 1
EPIC-1.1        → Level 2
EPIC-1.1.1      → Level 3
EPIC-1.1.1.1    → Level 4
```

**Solutions:**

```yaml
# Solution 1: Verify level policy keys (must be strings)
container_handling:
  level_policies:
    "1":  # Correct: string key
      mode: validate
    1:    # Incorrect: numeric key
      mode: validate
```

```bash
# Solution 2: Manually check level
EPIC_ID="EPIC-123.4.5"
LEVEL=$(echo $EPIC_ID | tr '.' '\n' | wc -l)
echo "Level: $LEVEL"
```

### Issue: Ordering Not Respecting Dependencies

**Symptoms:**
- Issues processed out of dependency order
- Child tasks before parent tasks
- Dependencies being ignored

**Diagnosis:**

```bash
# Check ordering strategy
grep "strategy:" .agent-shepherd/config/config.yaml | grep -A 1 "ordering"

# Check dependency completeness
grep "Dependency completeness" .agent-shepherd/data/logs/worker.log

# Verify dependencies exist
bd dep list TASK-456

# Check for ordering fallback
grep "fallback" .agent-shepherd/data/logs/worker.log | grep -i order
```

**Possible Causes:**

1. **Ordering strategy is `hierarchy` (ignores dependencies)**
   - Fix: Use `hybrid` or `dependency` strategy

2. **Dependencies missing or incomplete**
   - Fix: Add missing dependencies

3. **Circular dependencies**
   - Fix: Break circular dependencies

4. **Hybrid mode falling back to hierarchy**
   - Fix: Increase `dependency_weight` or fix dependencies

**Solutions:**

```yaml
# Solution 1: Use hybrid strategy (recommended)
container_handling:
  ordering:
    strategy: hybrid
    dependency_weight: 0.7  # High dependency preference
```

```bash
# Solution 2: Verify dependencies
bd dep list EPIC-123

# Solution 3: Check for circular dependencies
# (Requires manual inspection or external tools)
```

### Issue: Ordering Performance Issues

**Symptoms:**
- Worker slow to pick issues
- High CPU usage during ordering
- Long delays in issue processing

**Diagnosis:**

```bash
# Check ordering duration in logs
grep "Ordered issues" .agent-shepherd/data/logs/worker.log

# Check number of issues being ordered
ashep list-ready | wc -l

# Monitor worker resource usage
top -p $(pgrep -f "ashep worker")
```

**Possible Causes:**

1. **Large number of issues to order**
   - Fix: Reduce batch size or filter issues

2. **Complex dependency graph**
   - Fix: Simplify dependencies or use hierarchy strategy

3. **Circular dependencies causing loops**
   - Fix: Break circular dependencies

**Solutions:**

```yaml
# Solution 1: Reduce batch size
worker:
  picking:
    max_issues: 3  # Reduced from higher value
```

```yaml
# Solution 2: Use hierarchy ordering (faster)
container_handling:
  ordering:
    strategy: hierarchy  # O(n log n) instead of O(V + E)
    prefer_depth: 1
```

```bash
# Solution 3: Profile ordering performance
# Add debug logging or use profiling tools
```

### Issue: Workflow Override Not Triggering

**Symptoms:**
- Validation fails but workflow not started
- Issue container treated as DONE despite NEEDS_WORK
- Workflow override configuration ignored

**Diagnosis:**

```bash
# Check workflow override in config
grep "workflow_override" .agent-shepherd/config/config.yaml

# Check validation result in logs
grep "Validation result:" .agent-shepherd/data/logs/worker.log

# Verify workflow exists
grep "epic-review" .agent-shepherd/config/policies.yaml

# Check if mode is 'validate'
grep "mode:" .agent-shepherd/config/config.yaml | grep -A 1 container
```

**Possible Causes:**

1. **Workflow override not set**
   - Fix: Add `workflow_override` to level policy

2. **Workflow doesn't exist**
   - Fix: Create workflow in policies.yaml

3. **Mode is not `validate`**
   - Fix: Set mode to `validate` for level with override

**Solutions:**

```yaml
# Solution 1: Add workflow override
container_handling:
  level_policies:
    "1":
      mode: validate  # Must be validate
      workflow_override: epic-completion-review  # Must exist
```

```yaml
# Solution 2: Create workflow
policies:
  epic-completion-review:
    triggers:
      - label: "ashep-workflow:epic-completion-review"
    phases:
      - name: review
        capabilities:
          - code-review
        timeout: 600000
```

### Issue: Missing Dependencies Cause Issues

**Symptoms:**
- Hybrid strategy falls back to hierarchy too often
- Dependency ordering fails
- Inconsistent processing order

**Diagnosis:**

```bash
# Check dependency completeness in logs
grep "Dependency completeness" .agent-shepherd/data/logs/worker.log

# Verify dependencies exist
bd dep list EPIC-123

# Check for missing dependencies
# (Requires manual inspection)
```

**Possible Causes:**

1. **Dependencies not defined in Beads**
   - Fix: Add dependencies via `bd dep add`

2. **Dependencies incomplete for some issues**
   - Fix: Complete dependency graph

3. **Circular dependencies**
   - Fix: Break circular dependencies

**Solutions:**

```bash
# Solution 1: Add missing dependencies
bd dep add CHILD-1 --blocks PARENT-1
bd dep add PARENT-1 --blocks CHILD-1 --type parent-child

# Solution 2: Use dependency analyzer
# (Custom script or external tool)

# Solution 3: Switch to hierarchy ordering
container_handling:
  ordering:
    strategy: hierarchy  # Works without dependencies
```

## Debug Commands

### Inspect Issue Container State

```bash
# Show issue container details including children
ashep inspect-container EPIC-123

# Check if issue is an issue container (manual check)
bd show EPIC-123
bd dep list EPIC-123

# View issue container detection confidence
grep "EPIC-123.*confidence" .agent-shepherd/data/logs/worker.log
```

### Test Issue Container Detection

```bash
# Manually test detection logic
# (Requires running detection function)
# See API documentation for details

# Check all detected issue containers
grep "identified as issue container" .agent-shepherd/data/logs/worker.log
```

### Validate Configuration

```bash
# Validate config file
ashep validate-config

# Check issue container handling config
cat .agent-shepherd/config/config.yaml | grep -A 30 "container_handling"

# Validate agents configuration
ashep validate-agent-config
```

### Monitor Ordering Performance

```bash
# Watch ordering logs in real-time
tail -f .agent-shepherd/data/logs/worker.log | grep "Ordering"

# Check ordering strategy used
grep "ordering strategy" .agent-shepherd/data/logs/worker.log

# Measure ordering time
grep "Ordered issues in" .agent-shepherd/data/logs/worker.log
```

## Log Analysis

### Issue Container Detection Logs

```bash
# Find all issue container detection attempts
grep "Checking issue container status" .agent-shepherd/data/logs/worker.log

# Filter by issue container detection results
grep "identified as issue container" .agent-shepherd/data/logs/worker.log

# Check confidence scores
grep "confidence" .agent-shepherd/data/logs/worker.log | grep container
```

### Validation Logs

```bash
# Find all validation attempts
grep "Validating issue container" .agent-shepherd/data/logs/worker.log

# Check validation outcomes
grep "Validation result:" .agent-shepherd/data/logs/worker.log

# Find validation errors
grep "validation" .agent-shepherd/data/logs/worker.log | grep -i error
```

### Ordering Logs

```bash
# Find ordering operations
grep "Ordering.*issues" .agent-shepherd/data/logs/worker.log

# Check ordering strategy used
grep "ordering strategy" .agent-shepherd/data/logs/worker.log

# Check fallback events
grep "fallback" .agent-shepherd/data/logs/worker.log | grep -i order
```

## Configuration Validation

### Validate Schema

```bash
# Check config against schema
ashep validate-config

# Manual schema validation (using ajv)
npx ajv validate -s schemas/config.schema.json -d config/config.yaml
```

### Check Required Settings

```yaml
# Minimal working configuration
container_handling:
  enabled: true
  default_mode: auto-close
  ordering:
    strategy: hybrid
  container_detection:
    check_children: true
    min_children: 2
```

### Validate Agent Configuration

```bash
# Check for container-validation capability
grep -A 10 "container-validation" .agent-shepherd/config/agents.yaml

# Verify agents are active
grep -B 5 "container-validation" .agent-shepherd/config/agents.yaml | grep "active: true"
```

## Performance Tuning

### Reduce Detection Overhead

```yaml
# Disable unnecessary detection factors
container_handling:
  container_detection:
    check_description: false  # Skip text analysis
    check_dependencies: false  # Skip dependency pattern check
    check_children: true  # Only use type and children
```

### Optimize Ordering

```yaml
# Use hierarchy ordering for large issue sets
container_handling:
  ordering:
    strategy: hierarchy  # O(n log n)
    prefer_depth: 1

# Reduce batch size
worker:
  picking:
    max_issues: 3
```

### Reduce Worker Polling

```yaml
# Increase polling interval (less frequent checks)
worker:
  poll_interval_ms: 60000  # 60 seconds instead of 30
```

## Known Limitations

1. **Detection Accuracy**
   - False positives/negatives possible with unusual issue structures
   - Confidence threshold (0.5) may not fit all use cases

2. **Ordering Complexity**
   - Hybrid strategy adds complexity
   - May still fall back to hierarchy with incomplete dependencies

3. **Validation Reliability**
   - Depends on AI agent quality
   - May produce UNCLEAR results requiring human review

4. **Performance**
   - Large hierarchies (>1000 issues) may be slow
   - Complex dependency graphs increase processing time

## Getting Help

### Collect Diagnostic Information

```bash
# Gather all relevant logs
tar -czf container-handling-debug.tar.gz \
  .agent-shepherd/config/config.yaml \
  .agent-shepherd/data/logs/worker.log \
  .agent-shepherd/data/decisions.jsonl

# Get issue container details
bd show EPIC-123 > epic-123-details.txt
bd dep list EPIC-123 > epic-123-dependencies.txt
```

### Report Issues

When reporting issues, include:

1. Configuration file (redact secrets)
2. Worker logs (relevant sections)
3. Issue IDs and types
4. Expected vs actual behavior
5. Steps to reproduce

### Community Resources

- Documentation: See [User Guide](./container-handling-user-guide.md)
- API Reference: See [API Documentation](./container-handling-api.md)
- General Troubleshooting: See [Troubleshooting Guide](./troubleshooting.md)

## Checklist

### Before Troubleshooting

- [ ] Issue container handling enabled in config
- [ ] Worker engine running
- [ ] Config file validated
- [ ] Logs reviewed for errors
- [ ] Dependencies verified

### Common Fixes Checklist

- [ ] Enable issue container handling
- [ ] Adjust detection thresholds
- [ ] Add parent-child dependencies
- [ ] Configure validation agent
- [ ] Set correct handling mode
- [ ] Fix circular dependencies
- [ ] Validate configuration

### Performance Checklist

- [ ] Reduce batch size
- [ ] Use hierarchy ordering
- [ ] Disable unused detection factors
- [ ] Increase polling interval
- [ ] Optimize dependency graph
