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

**Steps**
Track these steps as TODOs and complete them one by one.
1. Read `openspec/changes/$ARGUMENTS/proposal.md` and `design.md` (if present) to confirm scope and acceptance criteria.
2. Find the Beads epic by matching the proposal title using `bd list --json`.
3. Get ready tasks that belong to this epic (IDs starting with epic-id.).
4. Work through all ready tasks under this epic sequentially using `bd show <id>`, keeping edits minimal and focused on the requested change.
5. Confirm completion before updating Beads statuses—make sure every item is finished.
6. Reference `openspec list` or `openspec show <item>` when additional context is required.

**Reference**
- Use `openspec show $ARGUMENTS --json --deltas-only` if you need additional context from the proposal while implementing.
- Use `bd ready` to find available tasks, but filter to only those under the specified epic.
- Use `bd show <id>` for details, `bd update <id> --status closed` to complete tasks.
- Tasks are assumed to already exist in Beads; sync back to OpenSpec tasks.md is handled manually.
<!-- OPENSPEC:END -->