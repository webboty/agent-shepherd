# Issue Container Handling - API Documentation

This document provides technical details about Smart Issue Container Handling System implementation, including issue container detection algorithms, ordering logic, and validation integration.

## Overview

## What is an Issue Container?

An **issue container** is an organizational issue in Beads that:

- **Groups related work items**: Contains subtasks that represent actual implementation work
- **Has no direct function**: The container itself doesn't require coding or implementation
- **Tracks progress**: Represents collective completion of grouped subtasks
- **Common types**: Epics, milestones, phases, or parent tasks

**Example Structure:**

```
EPIC-123 (Issue Container)
  ├── TASK-123.1 (Implementation task - requires coding)
  ├── TASK-123.2 (Implementation task - requires coding)
  └── TASK-123.3 (Implementation task - requires coding)
```

The issue container (EPIC-123) is automatically marked as complete when all its subtasks finish. It doesn't have its own implementation work - it's purely an organizational wrapper.

**Important:** This documentation refers to "issue containers" - organizational issues in Beads that contain subtasks. This is **not** related to Docker containers or software containerization.

The issue container handling system is implemented across multiple components:

- **Config Schema** - Configuration validation and defaults
- **Config Module** (`src/core/config.ts`) - TypeScript interfaces
- **Worker Engine** (`src/core/worker-engine.ts`) - Core implementation
- **Issue Picker** (`src/core/issue-picker.ts`) - Smart ordering
- **Beads Integration** (`src/core/beads.ts`) - Issue tracking interface

## What is an Issue Container?

An **issue container** is an organizational issue in Beads system that:

- **Groups related work items**: Contains subtasks that represent actual implementation work
- **Has no direct function**: The container itself doesn't require coding or implementation
- **Tracks progress**: Represents collective completion of grouped subtasks
- **Common types**: Epics, milestones, phases, or parent tasks

**Example Structure:**
```
EPIC-123 (Issue Container)
  ├── TASK-123.1 (Implementation task - requires coding)
  ├── TASK-123.2 (Implementation task - requires coding)
  └── TASK-123.3 (Implementation task - requires coding)
```

The issue container (EPIC-123) is automatically marked as complete when all its subtasks finish. It doesn't have its own implementation work - it's purely an organizational wrapper.

**Important:** This documentation refers to "issue containers" - organizational issues in Beads that contain subtasks. This is **not** related to Docker containers or software containerization.

## Configuration API

### Interfaces

#### ContainerHandlingConfig

Main configuration interface for container handling system.

```typescript
interface ContainerHandlingConfig {
  enabled: boolean;
  default_mode: ContainerHandlingMode;
  level_policies?: Record<string, LevelPolicy>;
  ordering?: ContainerOrderingConfig;
  container_detection?: ContainerDetectionConfig;
}
```

#### ContainerHandlingMode

Enum-like string union for handling modes.

```typescript
type ContainerHandlingMode = "auto-close" | "hitl" | "validate";
```

**Values:**
- `auto-close` - Automatically close containers when all children complete
- `hitl` - Require human validation before closing
- `validate` - Use AI validation with potential workflow triggering

#### LevelPolicy

Per-level handling policy configuration.

```typescript
interface LevelPolicy {
  mode: ContainerHandlingMode;
  workflow_override?: string;
}
```

**Properties:**
- `mode` - Handling mode for this hierarchy level
- `workflow_override` - Optional specific workflow to trigger (only used with `validate` mode)

#### ContainerOrderingConfig

Smart ordering configuration.

```typescript
interface ContainerOrderingConfig {
  strategy: "dependency" | "hierarchy" | "hybrid";
  prefer_depth: number;
  dependency_weight: number;
}
```

**Properties:**
- `strategy` - Ordering strategy (see [Ordering Strategies](#ordering-strategies))
- `prefer_depth` - Depth preference for tie-breaking (1-10, higher = more depth preference)
- `dependency_weight` - Weight for dependency ordering in hybrid mode (0.0-1.0)

#### ContainerDetectionConfig

Container detection heuristics configuration.

```typescript
interface ContainerDetectionConfig {
  check_children: boolean;
  check_description: boolean;
  check_dependencies: boolean;
  min_children: number;
}
```

**Properties:**
- `check_children` - Enable child count in detection
- `check_description` - Enable description pattern matching
- `check_dependencies` - Enable dependency pattern analysis
- `min_children` - Minimum children to consider as container

## Issue Container Detection API

### isContainerEpic

Main detection method that determines if an issue is a container and retrieves its handling policy.

```typescript
private async isContainerEpic(issue: BeadsIssue): Promise<{
  is_container: boolean;
  mode: ContainerHandlingMode;
  workflow_override?: string;
  confidence: number;
  ready_to_close: boolean;
}>
```

**Location:** `src/core/worker-engine.ts:529`

**Parameters:**
- `issue` - Beads issue to evaluate

**Returns:**
- `is_container` - Whether the issue is a container (confidence >= 0.5)
- `mode` - Handling mode to apply
- `workflow_override` - Optional workflow override
- `confidence` - Detection confidence score (0.0-1.0)
- `ready_to_close` - Whether all children are complete

**Detection Flow:**

1. Check if container handling is enabled
2. Execute multi-factor detection:
   - `hasContainerChildren()` - Check parent-child dependencies
   - `isContainerType()` - Check issue type
   - `hasContainerLanguage()` - Check description patterns
   - `hasContainerStructure()` - Check dependency patterns
3. Calculate confidence score
4. Determine if container (confidence >= 0.5)
5. Check if ready to close (all children complete)
6. Lookup level-specific policy
7. Return complete detection result

### Detection Factors

#### hasContainerChildren

Checks if issue has sufficient parent-child dependencies.

```typescript
private async hasContainerChildren(issue: BeadsIssue): Promise<boolean>
```

**Location:** `src/core/worker-engine.ts:588`

**Process:**
1. List all dependencies for issue via `bd dep list <issue-id> --json`
2. Filter dependencies by type `parent-child`
3. Compare count to `min_children` threshold
4. Return true if count >= threshold

**Example:**
```typescript
// Issue with 3 parent-child dependencies
// min_children: 2
// Returns: true
```

#### isContainerType

Checks if issue type indicates a container.

```typescript
private isContainerType(issue: BeadsIssue): boolean
```

**Location:** `src/core/worker-engine.ts:611`

**Container Types:**
- `epic`
- `milestone`
- `phase`
- `group`

**Process:**
1. Extract issue type (case-insensitive)
2. Check if in container types list
3. Return boolean

**Example:**
```typescript
// Issue type: "Epic"
// Returns: true
```

#### hasContainerLanguage

Checks if issue description contains container-like language.

```typescript
private hasContainerLanguage(issue: BeadsIssue): boolean
```

**Location:** `src/core/worker-engine.ts` (implementation details vary)

**Patterns:**
- "subtasks"
- "tasks"
- "components"
- "includes"
- "contains"
- "comprises"

**Process:**
1. Extract issue description
2. Search for container-related keywords
3. Return boolean if patterns found

**Example:**
```typescript
// Description: "This epic includes the following subtasks..."
// Returns: true
```

#### hasContainerStructure

Checks if issue has container-like dependency structure.

```typescript
private async hasContainerStructure(issue: BeadsIssue): Promise<boolean>
```

**Location:** `src/core/worker-engine.ts:619`

**Process:**
1. List all dependencies for issue
2. Check for presence of `parent-child` dependency type
3. Return true if parent-child dependencies exist

**Example:**
```typescript
// Dependencies: [{type: "parent-child", ...}, {type: "blocks", ...}]
// Returns: true
```

### Confidence Scoring

#### calculateContainerConfidence

Computes confidence score based on detection factor matches.

```typescript
private calculateContainerConfidence(
  hasChildren: boolean,
  hasContainerType: boolean,
  hasContainerLanguage: boolean,
  hasContainerStructure: boolean
): number
```

**Location:** `src/core/worker-engine.ts:643`

**Weighting:**

| Factor | Weight | Strength |
|--------|--------|----------|
| Container Type | 0.4 | Strong |
| Has Children | 0.3 | Strong |
| Container Language | 0.2 | Medium |
| Container Structure | 0.1 | Medium |

**Formula:**

```typescript
score = 0
if (hasContainerType) score += 0.4
if (hasChildren) score += 0.3
if (hasContainerLanguage) score += 0.2
if (hasContainerStructure) score += 0.1

// Normalize by number of factors matched
score = score / factors
```

**Threshold:**
- Container if `confidence >= 0.5`

**Examples:**

```typescript
// Type: epic, Children: 5, Language: yes, Structure: yes
// Score: 1.0 (all factors match)

// Type: task, Children: 3, Language: no, Structure: yes
// Score: 0.7 (2 strong + 1 medium)

// Type: task, Children: 0, Language: no, Structure: yes
// Score: 0.1 (only structure matches)
```

### Hierarchy Level Calculation

#### calculateHierarchicalLevel

Computes hierarchy depth from Beads ID structure.

```typescript
private calculateHierarchicalLevel(issueId: string): number
```

**Location:** `src/core/worker-engine.ts` (implementation varies)

**Algorithm:**
1. Split issue ID by dots (`.`)
2. Count segments
3. Return count as level

**Examples:**

```typescript
calculateHierarchicalLevel("EPIC-1")          // Returns: 1
calculateHierarchicalLevel("EPIC-1.1")        // Returns: 2
calculateHierarchicalLevel("EPIC-1.1.1")      // Returns: 3
calculateHierarchicalLevel("EPIC-1.1.1.1")    // Returns: 4
```

### Child Completion Check

#### areAllChildrenComplete

Checks if all children of a container are closed.

```typescript
private async areAllChildrenComplete(issue: BeadsIssue): Promise<boolean>
```

**Location:** `src/core/worker-engine.ts` (implementation varies)

**Process:**
1. List all parent-child dependencies
2. For each child issue:
   - Fetch issue status
   - Check if status is `closed`
3. Return true if all children are closed

## Ordering Algorithm API

### Ordering Strategies

The system supports three ordering strategies with different algorithms:

#### 1. Dependency Strategy

**Method:** Topological sort based on dependency relationships

**Configuration:**
```yaml
ordering:
  strategy: dependency
```

**Algorithm:**
1. Build dependency graph from all issues
2. Perform topological sort
3. Respect all dependency constraints
4. Return ordered list

**Characteristics:**
- Strictly respects dependencies
- May fail with circular dependencies
- Ignores hierarchy depth
- Fast when graph is acyclic

**Complexity:**
- Time: O(V + E) where V = issues, E = dependencies
- Space: O(V + E)

#### 2. Hierarchy Strategy

**Method:** Depth-based ordering, ignoring dependencies

**Configuration:**
```yaml
ordering:
  strategy: hierarchy
  prefer_depth: 1
```

**Algorithm:**
1. Calculate hierarchy level for each issue
2. Sort by level (descending = deeper first)
3. Break ties by `prefer_depth` setting
4. Return ordered list

**Characteristics:**
- Processes deeper issues first
- Ignores dependencies completely
- Always succeeds (no cycles)
- Works with sparse dependencies

**Complexity:**
- Time: O(n log n) for sorting
- Space: O(n) for level storage

#### 3. Hybrid Strategy (Recommended)

**Method:** Dependency primary, hierarchy fallback

**Configuration:**
```yaml
ordering:
  strategy: hybrid
  prefer_depth: 1
  dependency_weight: 0.7
```

**Algorithm:**

1. **Dependency Ordering (Primary):**
   - Build dependency graph
   - Perform topological sort
   - Calculate dependency completeness score

2. **Hierarchical Fallback:**
   - If dependencies incomplete, use hierarchy ordering
   - Calculate hierarchy depth score

3. **Weighted Scoring:**
   ```
   score = (dependency_score * dependency_weight) +
          (hierarchy_score * (1 - dependency_weight))
   ```

4. **Tie-Breaking:**
   - Use `prefer_depth` to prioritize deeper issues
   - Higher `prefer_depth` = stronger depth preference

5. **Return ordered list**

**Characteristics:**
- Best of both strategies
- Robust to incomplete dependencies
- Reliable ordering in production
- Configurable balance

**Complexity:**
- Time: O(V + E + n log n)
- Space: O(V + E + n)

### Ordering Parameters

#### prefer_depth

Depth preference for tie-breaking (1-10).

```yaml
ordering:
  prefer_depth: 3
```

**Impact:**
- Lower values: Minimize depth preference
- Higher values: Strongly prioritize deeper issues
- Default: 1 (mild preference)

**Usage in Hybrid Strategy:**

```typescript
hierarchy_score += issue_level * prefer_depth
```

#### dependency_weight

Weight for dependency ordering in hybrid mode (0.0-1.0).

```yaml
ordering:
  dependency_weight: 0.7
```

**Impact:**
- 0.0: Pure hierarchy ordering
- 0.5: Equal weight for both strategies
- 0.7: Dependency priority (recommended default)
- 1.0: Pure dependency ordering

**Usage in Hybrid Strategy:**

```typescript
final_score = (dependency_score * dependency_weight) +
              (hierarchy_score * (1 - dependency_weight))
```

## Validation Integration API

### Container Validation Flow

When using `validate` mode, the system integrates with the worker engine and decision agent system.

#### Validation Trigger

Triggered when container completes children:

```typescript
// Location: src/core/worker-engine.ts:342
const containerCheck = await this.isContainerEpic(issue);
const isContainerValidationPhase = phaseConfig?.capabilities?.includes("container-validation");

if (isContainerValidationPhase && containerCheck.is_container) {
  // Trigger validation
}
```

#### Validation Context

Builds context for AI validation:

```typescript
containerValidation: {
  container_id: string;
  container_type: string;
  children_completed: number;
  total_children: number;
  container_confidence: number;
  container_mode: string;
  workflow_override?: string;
}
```

**Fields:**
- `container_id` - Beads ID of container
- `container_type` - Issue type (epic, milestone, etc.)
- `children_completed` - Number of closed children
- `total_children` - Total children count
- `container_confidence` - Detection confidence score
- `container_mode` - Handling mode being used
- `workflow_override` - Optional workflow to trigger

#### Validation Outcomes

AI validation returns one of three outcomes:

##### DONE

Container is complete and can close.

**Action:**
```typescript
await closeContainer(containerCheck.container_id);
```

**Behavior:**
- Set container status to `closed`
- Remove `ashep-managed` label
- Log validation success

##### NEEDS_WORK

Container needs additional work.

**Action:**
```typescript
// Trigger workflow override or default workflow
const workflow = containerCheck.workflow_override || determineDefaultWorkflow();
await triggerWorkflow(containerCheck.container_id, workflow);
```

**Behavior:**
- Treat container as regular task
- Start specified workflow on container
- Container processes through workflow phases
- Re-evaluate on next completion

##### UNCLEAR

Validation result is ambiguous.

**Action:**
```typescript
await setHITLLabel(issue.id, "container-validation");
```

**Behavior:**
- Set `ashep-hitl:container-validation` label
- Wait for human review
- Human decides: close, continue, or reject

#### Decision Agent Integration

Validation uses the decision agent system:

**Prompt Template:**
```
You are evaluating whether a container epic is complete.

Container: {container_id}
Type: {container_type}
Mode: {container_mode}

Children Completed: {children_completed}/{total_children}

Review the following context and determine if the container is truly complete:

{context}

Return one word:
- DONE: Container is complete and ready to close
- NEEDS_WORK: Container needs more work (explain in reasoning)
- UNCLEAR: Cannot determine (explain in reasoning)
```

**Capability Required:**
- Agent must have `container-validation` capability

**Configuration:**
```yaml
agents:
  - id: epic-validator
    capabilities:
      - container-validation
    active: true
```

## State Management API

### Issue Container State Labels

The system tracks issue container state using Beads labels:

#### ashep-managed

Indicates issue is managed by container handling.

```typescript
// Set when container detected
await addLabel(issueId, "ashep-managed");

// Removed when container closes
await removeLabel(issueId, "ashep-managed");
```

#### ashep-hitl:container-validation

Container waiting for human validation.

```typescript
// Set when validation is unclear
await addLabel(issueId, "ashep-hitl:container-validation");

// Removed after human review
await removeLabel(issueId, "ashep-hitl:container-validation");
```

### State Transitions

Container lifecycle states:

```
OPEN → READY_TO_CLOSE → VALIDATING → CLOSED
                ↓               ↓
              HITL           NEEDS_WORK
                ↓               ↓
              CLOSED         OPEN (as task)
```

## Error Handling

### Detection Errors

Graceful degradation on detection failures:

```typescript
private async hasContainerChildren(issue: BeadsIssue): Promise<boolean> {
  try {
    const output = await execBeadsCommand(["dep", "list", issue.id, "--json"]);
    // ... detection logic
  } catch (error) {
    console.warn(`Failed to check container children for ${issue.id}: ${error}`);
    return false;  // Conservative: not a container
  }
}
```

### Validation Errors

Fallback on validation failures:

```typescript
try {
  const validationDecision = await this.invokeDecisionAgent(/* ... */);
  // Process validation
} catch (error) {
  console.error(`Container validation failed: ${error}`);
  // Fallback to HITL
  await setHITLLabel(issueId, "container-validation");
}
```

### Ordering Errors

Robust handling of ordering failures:

```typescript
try {
  const orderedIssues = await this.orderIssues(issues);
  return orderedIssues;
} catch (error) {
  console.warn(`Dependency ordering failed: ${error}`);
  // Fallback to hierarchy ordering
  return this.orderByHierarchy(issues);
}
```

## Performance Considerations

### Caching Strategies

**Issue Container Detection Cache:**
- Cache container detection results for issue lifecycle
- Invalidate on issue status changes
- Typical cache time: 5 minutes

**Dependency Graph Cache:**
- Cache dependency graphs between ordering operations
- Invalidate on dependency changes
- Typical cache time: 10 minutes

### Optimization Tips

**Reduce Beads API Calls:**
- Batch dependency queries where possible
- Use `--json` flag for structured output
- Cache results for repeated queries

**Optimize Detection:**
- Disable unused detection factors
- Adjust `min_children` to reduce checks
- Cache container type lookups

**Optimize Ordering:**
- Use `hybrid` strategy for best performance
- Tune `dependency_weight` for your data
- Avoid deep hierarchies (>10 levels)

## Monitoring and Observability

### Metrics Tracked

**Detection Metrics:**
- `container_detection_total` - Total detection attempts
- `container_detected_count` - Containers found
- `container_detection_false_positive` - Misidentified containers

**Validation Metrics:**
- `container_validation_total` - Validation attempts
- `container_validation_done` - Containers approved
- `container_validation_needs_work` - Containers needing work
- `container_validation_unclear` - Ambiguous validations

**Ordering Metrics:**
- `ordering_duration_ms` - Time to order issues
- `ordering_strategy_used` - Strategy used
- `ordering_fallback_count` - Fallbacks from dependency to hierarchy

### Logging

**Detection Logs:**
```
[INFO] Checking container status for EPIC-123
[DEBUG] Container detection: type=true, children=true, language=false, structure=true
[INFO] EPIC-123 identified as container (confidence: 1.0)
```

**Validation Logs:**
```
[INFO] Validating container EPIC-123
[DEBUG] Children completed: 5/5
[INFO] Validation result: DONE
[INFO] Container EPIC-123 closed
```

**Ordering Logs:**
```
[INFO] Ordering 10 issues using hybrid strategy
[DEBUG] Dependency completeness: 0.8
[INFO] Ordered issues in 23ms
```

## Testing

### Unit Tests

**Detection Tests:**
```typescript
describe('Issue Container Detection', () => {
  it('detects epic with children', async () => {
    const issue = createMockIssue({ type: 'epic', children: 5 });
    const result = await isContainerEpic(issue);
    expect(result.is_container).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('does not detect simple task', async () => {
    const issue = createMockIssue({ type: 'task', children: 0 });
    const result = await isContainerEpic(issue);
    expect(result.is_container).toBe(false);
  });
});
```

**Ordering Tests:**
```typescript
describe('Ordering', () => {
  it('orders by dependencies', () => {
    const issues = createTestIssues();
    const ordered = orderByDependencies(issues);
    expect(verifyDependencies(ordered)).toBe(true);
  });

  it('falls back to hierarchy', () => {
    const issues = createCircularDependencyIssues();
    const ordered = orderByHybrid(issues);
    expect(ordered.length).toBe(issues.length);
  });
});
```

### Integration Tests

**End-to-End Container Flow:**
```typescript
describe('Container Lifecycle', () => {
  it('auto-closes container when children complete', async () => {
    const epic = await createIssue({ type: 'epic' });
    const children = await createChildren(epic.id, 3);

    await closeAllChildren(children);
    await waitForContainerProcessing();

    const updated = await getIssue(epic.id);
    expect(updated.status).toBe('closed');
  });
});
```

## Related Documentation

- [User Guide](./container-handling-user-guide.md) - User-facing documentation
- [Troubleshooting Guide](./container-handling-troubleshooting.md) - Debug and fix issues
- [Configuration Reference](./config-config.md) - Complete config schema
