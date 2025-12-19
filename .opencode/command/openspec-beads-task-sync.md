---
agent: build
description: Sync task statuses between OpenSpec and Beads.
---
The user wants to sync task completion statuses between OpenSpec tasks.md and Beads issues.

Arguments: $ARGUMENTS

**Steps**
1. Read `openspec/changes/$ARGUMENTS/proposal.md` to get the proposal title.
2. Find the corresponding Beads epic using `bd list --json` and matching the title.
3. Get all descendant tasks/subtasks of the epic.
4. For each Beads task that is closed, find the matching line in `tasks.md` (by title) and change `- [ ] ` to `- [x] `.
5. For each OpenSpec task that is marked `- [x] `, find the matching Beads task and run `bd update <id> --status closed` if not already closed.
6. Handle any conflicts or missing matches gracefully.