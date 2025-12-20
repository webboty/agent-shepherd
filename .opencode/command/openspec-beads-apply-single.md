---
agent: build
description: Implement an approved OpenSpec change using Beads for task management.
---
The user has requested to implement the following change proposal. Find the change proposal and follow the instructions below. If you're not sure or if ambiguous, ask for clarification from the user.
<UserRequest>
$ARGUMENTS
</UserRequest>
<!-- OPENSPEC:START -->
**Guardrails**
- Favor straightforward, minimal implementations first and add complexity only when it is requested or clearly required.
- Keep changes tightly scoped to the requested outcome.
- Refer to `openspec/AGENTS.md` (located inside the `openspec/` directory—run `ls openspec` or `openspec update` if you don't see it) if you need additional OpenSpec conventions or clarifications.

## **CRITICAL SINGLE-TASK CONSTRAINT**
- **ONE TASK ONLY**: You must work on exactly ONE ready task and then STOP
- **NO CONTINUATION**: Do not proceed to additional tasks, even if more exist
- **REPORT AND END**: After completing one task, report completion and end the session

**Execution Steps**
1. Read `openspec/changes/$ARGUMENTS/proposal.md` to understand the overall scope.
2. Find the Beads epic by matching the proposal title using `bd list --json`.
3. Find the FIRST ready task under this epic (status 'open', ID starts with `<epic-id>.`).
4. If no ready tasks found, report "No open tasks available for this proposal" and stop.
5. Work on THIS ONE TASK ONLY using `bd show <id>`, making focused changes.
6. Mark the task complete with `bd update <id> --status closed`.
7. Report that the task is complete and stop - do not look for or work on additional tasks.

**Reference**
- **Single Task Enforcement**: Process exactly one task per execution
- Use `openspec show $ARGUMENTS --json --deltas-only` for proposal context
- Use `bd list --json` to find the first ready task under the epic
- Use `bd show <id>` for task details, `bd update <id> --status closed` to complete
- **MANDATORY STOP**: End session after one task completion
<!-- OPENSPEC:END -->