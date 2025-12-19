---
agent: build
description: Implement one task from an approved OpenSpec change using Beads.
---

# 🚨 CRITICAL: IMMEDIATE VALIDATION REQUIRED 🚨
**IMMEDIATE ACTION REQUIRED**: If the arguments contain a specific Beads issue ID (second argument), you MUST:
1. Run `bd list --json` to get issue details
2. Check the 'status' field for that specific issue ID
3. ONLY if status is 'closed', 'blocked', or 'in-progress': Output "Cannot proceed - issue is [actual-status]" and STOP
4. If status is 'open': Continue with normal execution
5. If no specific issue ID provided: Continue with normal execution
**DO NOT output the stop message unless you have actually checked and confirmed the status is invalid.**

<UserRequest>
  $ARGUMENTS
</UserRequest>
<!-- OPENSPEC:START -->
**Guardrails**
- Favor straightforward, minimal implementations first and add complexity only when it is requested or clearly required.
- Keep changes tightly scoped to the requested outcome.
- Refer to `openspec/AGENTS.md` (located inside the `openspec/` directory—run `ls openspec` or `openspec update` if you don't see it) if you need additional OpenSpec conventions or clarifications.

## **MANDATORY VALIDATION - DO NOT PROCEED WITHOUT THIS**
### **REQUIRED: Check Issue Status First**
- If arguments include a specific issue ID, FIRST check its status using `bd list --json`
- Look for the issue with matching ID and examine its 'status' field
- **STOP CONDITION**: Only if status is 'closed', 'blocked', or 'in-progress' should you output "Cannot proceed - issue is [status]" and stop
- **CONTINUE CONDITION**: If status is 'open' OR no specific ID provided, proceed normally

## **Execution Steps**
**Step 1: Parse Arguments**
- Arguments format: `<proposal-id> [optional-specific-issue-id]`
- First argument: Always the proposal ID
- Second argument: Optional Beads issue ID (if provided, work on this exact issue)

**Step 2: ISSUE VALIDATION COMPLETE**
- If we reach this step, validation has passed
- Proceed with proposal validation

**Step 3: Validate Proposal**
- Read `openspec/changes/<proposal-id>/proposal.md` to confirm the proposal exists
- If proposal not found, stop and report error

**Step 4: Locate Beads Epic**
- Use `bd list --json` to find epic matching the proposal title
- Epic must exist for the proposal

**Step 5: Select Target Issue**
### **If Specific Issue ID Provided:**
- This should have been validated in Step 2 - if we reach here, the issue is confirmed 'open'
- **VERIFY MEMBERSHIP**: Confirm issue ID starts with `<epic-id>.`
- Work on this specific validated issue

### **If No Specific Issue ID:**
- Find first ready task under epic (status 'open', ID starts with `<epic-id>.`)
- If no ready tasks found, report "No open tasks available" and stop

**Step 6: Execute Task**
- Use `bd show <selected-issue-id>` for details
- Make minimal, focused changes to complete the task
- Update code/files as needed

**Step 7: Mark Complete**
- Run `bd update <selected-issue-id> --status closed`
- Confirm the update succeeded

**Step 8: Next Steps**
- If specific ID was provided: Task complete
- If no specific ID and more tasks remain: Inform user to rerun command for next task

## **Command Reference**
- **Arguments**: `<proposal-id> [optional-specific-issue-id]`
- **Proposal Context**: Use `openspec show <proposal-id> --json --deltas-only` for additional context
- **Status Verification**: Always use `bd list --json` to check issue status before proceeding
- **Epic Filtering**: Only work on issues where ID starts with `<epic-id>.`
- **Task Details**: Use `bd show <id>` to view issue information
- **Completion**: Use `bd update <id> --status closed` to mark tasks done
- **Error Handling**: Stop immediately if issue status prevents work
- **Single Task Focus**: Process one issue at a time, require reruns for additional tasks
<!-- OPENSPEC:END -->