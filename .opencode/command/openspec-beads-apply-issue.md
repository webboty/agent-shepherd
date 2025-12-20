---
agent: build
description: Implement a specific Beads issue from an approved OpenSpec change.
---
The user has requested to implement a specific Beads issue. Work on that exact issue if it's open and belongs to the proposal's epic.

<UserRequest>
  $ARGUMENTS
</UserRequest>
<!-- OPENSPEC:START -->
**Guardrails**
- Favor straightforward, minimal implementations first and add complexity only when it is requested or clearly required.
- Keep changes tightly scoped to the requested outcome.
- Refer to `openspec/AGENTS.md` (located inside the `openspec/` directory—run `ls openspec` or `openspec update` if you don't see it) if you need additional OpenSpec conventions or clarifications.

# 🚨 CRITICAL: IMMEDIATE VALIDATION REQUIRED 🚨
**BEFORE ANYTHING ELSE**: Arguments must be `<proposal-id> <specific-issue-id>`.
1. Run `bd list --json` to get all issue details
2. Find the specific issue by ID and check its 'status' field
3. **HIERARCHY-AWARE VALIDATION**:
   - If status is 'open': Continue with execution (can work on this issue)
   - If status is 'closed', 'blocked', or 'in-progress':
     - Check if this issue has children (issues with IDs starting with `<issue-id>.`)
     - If children exist: Check if any children have status 'open'
       - If at least one child is 'open': Continue (will work on child later)
       - If no children are 'open': Output "Cannot proceed - issue is [status] and no open children" and STOP
     - If no children exist: Output "Cannot proceed - issue is [status]" and STOP
**STOP only if issue is invalid AND no open children exist.**

## **Execution Steps**
**Step 1: Validate Arguments**
- Must have exactly 2 arguments: proposal-id and issue-id
- Issue ID must be a valid Beads ID

**Step 2: Validate Proposal**
- Read `openspec/changes/<proposal-id>/proposal.md` to confirm the proposal exists

**Step 3: Validate Issue Membership**
- Find epic matching proposal title
- Confirm issue ID starts with `<epic-id>.`
- If not a member, report error and stop

**Step 4: Handle Hierarchy (if applicable)**
- If requested issue has children (ID like `epic.x` with `epic.x.y` children):
  - Check status of all child issues
  - Find first child with status 'open'
  - If found: Work on that child instead
  - If no open children: Check if all children are 'closed'
    - If yes: Close the parent issue and report completion
    - If no: Report "Parent issue has incomplete children" and stop

**Step 5: Execute Task**
- Use `bd show <target-issue-id>` for details
- Make minimal, focused changes to complete the task

**Step 6: Mark Complete**
- Run `bd update <target-issue-id> --status closed`

**Step 7: Report Completion**
- Confirm the issue has been completed

## **Command Reference**
- **Arguments**: `<proposal-id> <specific-issue-id>`
- **Hierarchy Support**: Automatically works on child issues if parent requested
- **Validation**: Strict status and membership checking
- **Single Issue Focus**: Works on exactly one issue (or its next ready child)
<!-- OPENSPEC:END -->