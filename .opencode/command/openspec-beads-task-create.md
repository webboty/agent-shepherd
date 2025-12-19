---
agent: build
description: Create Beads epic and subtasks from an OpenSpec proposal.
---
The user wants to create Beads tasks from an OpenSpec proposal. Read the proposal and tasks files, then create the Beads structure manually.

Arguments: $ARGUMENTS

**Steps**
1. Read `openspec/changes/$ARGUMENTS/proposal.md` to get the title and description.
2. Read `openspec/changes/$ARGUMENTS/tasks.md` to understand the hierarchical task structure (## sections as tasks, - [ ] as sub-tasks).
3. Create a Beads epic using `bd create "<title>" --description "<description>"`.
4. For each ## section in tasks.md, create a Beads task using `bd create "<section title>"` and link it to the epic with `bd dep add <task-id> <epic-id> --type parent-child`.
5. For each - [ ] item under a section, create a Beads sub-task using `bd create "<item text>"` and link it to the section task with `bd dep add <subtask-id> <task-id> --type parent-child`.
6. Preserve the numbering in task titles for order reference.