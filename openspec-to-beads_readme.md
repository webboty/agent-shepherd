# OpenSpec to Beads Integration

## Overview

This integration bridges OpenSpec (spec-driven development) and Beads (distributed issue tracking) to provide a seamless workflow for managing complex software projects. OpenSpec handles change proposals and specifications, while Beads manages the actual task execution and tracking.

## Why This Integration?

- **Unified Workflow**: Use OpenSpec for planning and specifications, Beads for execution
- **Hierarchical Task Management**: Convert flat OpenSpec tasks into proper epic/task/sub-task hierarchies
- **Bidirectional Sync**: Keep task completion status synchronized between both systems
- **Agent-Friendly**: Supports both automated scripts and manual agent-driven workflows
- **Git-Backed**: All data is versioned and merge-safe via Git

## What Was Accomplished

### ✅ Core Scripts
- `tools/openspec-beads-converter.js`: Converts OpenSpec proposals to Beads epics with hierarchical tasks
- `tools/openspec-beads-sync.js`: Synchronizes completion status bidirectionally

### ✅ Command Interfaces
- `openspec-beads-apply.md`: Apply changes using Beads for task management (batch mode)
- `openspec-beads-apply-single.md`: Apply one task at a time from Beads (incremental mode)
- `openspec-beads-task-create.md`: Manual task creation instructions
- `openspec-beads-task-create-script.md`: Automated task creation
- `openspec-beads-task-sync.md`: Manual sync instructions
- `openspec-beads-task-sync-script.md`: Automated sync

### ✅ Key Features
- **Hierarchical IDs**: Creates proper Beads structure (epic.task.sub-task)
- **Proposal Isolation**: Commands filter to only tasks from the specified proposal
- **Idempotent Operations**: Safe to rerun without duplicates
- **Priority Preservation**: Maintains task ordering from OpenSpec
- **Error Handling**: Robust error handling for Beads operations
- **JSON Integration**: Uses Beads' JSON API for reliable data access

## How to Use

### 1. Prerequisites
- OpenSpec project initialized (`openspec/project.md` exists)
- Beads installed and initialized (`bd init` run)
- Node.js available

### 2. Create a Change Proposal
Use the OpenSpec proposal command to scaffold the change:
```
/openspec-proposal my-feature
```

This creates the directory structure `openspec/changes/my-feature/` with `proposal.md`, `tasks.md`, and spec deltas. Edit these files to define your change scope, tasks, and requirements.

### 3. Convert to Beads Tasks
**Option A: Direct Script Execution (Recommended for large proposals)**
```bash
node tools/openspec-beads-converter.js my-feature
```
This runs directly in terminal, avoiding the 2-minute timeout limit of agent commands.

**Option B: Agent Command (Automated)**
```
/openspec-beads-task-create-script my-feature
```
Agent executes the converter script. May timeout on large proposals due to agent tool limits.

**Option C: Manual Agent Creation**
```
/openspec-beads-task-create my-feature
```
Agent reads the proposal files and manually creates Beads tasks using `bd create` commands, providing full control and understanding.

This creates:
- Epic: `bd-xxxx` (proposal title)
- Tasks: `bd-xxxx.1`, `bd-xxxx.2` (## sections)
- Sub-tasks: `bd-xxxx.1.1`, `bd-xxxx.1.2` (- [ ] items)

### 4. Work on Tasks
```bash
# View available tasks
bd ready

# Start working on a task
bd show <task-id>

# Mark task complete
bd update <task-id> --status closed
```

### 5. Sync Status Back (Optional)
**Option A: Direct Script Execution**
```bash
node tools/openspec-beads-sync.js my-feature
```
Runs directly in terminal for reliable execution.

**Option B: Agent Command (Automated)**
```
/openspec-beads-task-sync-script my-feature
```
Agent executes the sync script. May have timeout issues with agent tool limits.

**Option C: Manual Agent Sync**
```
/openspec-beads-task-sync my-feature
```
Agent manually checks Beads status and updates OpenSpec `tasks.md` with `- [x]` for completed tasks.

All options update `tasks.md` to reflect Beads task completion status.

### 6. Apply Changes
Choose between batch or incremental application:

**Batch Mode (all tasks at once):**
```
/openspec-beads-apply my-feature
```

**Incremental Mode (one task at a time):**
```
/openspec-beads-apply-single my-feature
# Works on next ready task, rerun for subsequent tasks

/openspec-beads-apply-single my-feature agent-shepherd-xyz.1
# Works on specific Beads issue ID
```

Both commands automatically filter to only work on tasks from the specified proposal's epic, ensuring focused execution. The single-task command accepts an optional second parameter for a specific Beads issue ID.

## Command Reference

| Command | Purpose | Method |
|---------|---------|--------|
| `openspec-beads-apply` | Apply changes with all Beads tasks (batch) | Agent |
| `openspec-beads-apply-single` | Apply one/specific Beads task (incremental) | Agent |
| `openspec-beads-task-create` | Manual task creation | Agent |
| `openspec-beads-task-create-script` | Automated task creation | Script |
| `openspec-beads-task-sync` | Manual status sync | Agent |
| `openspec-beads-task-sync-script` | Automated status sync | Script |

## Example Workflow

1. **Plan**: Create OpenSpec proposal with detailed tasks
2. **Convert**: `node tools/openspec-beads-converter.js my-feature`
3. **Execute**: Use `bd ready` and `bd show` to work through tasks
4. **Track**: Tasks auto-sync or use manual sync commands
5. **Complete**: All systems stay in sync

## Troubleshooting

- **Timeout Issues**: Run scripts directly in terminal (bypasses 2min agent limit)
- **Duplicate Tasks**: Scripts are idempotent - rerun safely
- **Missing Tasks**: Check OpenSpec `tasks.md` format (## sections, - [ ] items)
- **Sync Issues**: Ensure Beads epic exists before syncing

## Architecture Notes

- **Data Flow**: OpenSpec → Converter → Beads Hierarchy → Sync ↔ OpenSpec
- **ID Mapping**: Hierarchical IDs preserve OpenSpec task relationships
- **Proposal Isolation**: Commands filter Beads operations to specific epics by title/ID matching
- **Error Recovery**: Scripts check for existing items before creating
- **Performance**: Direct terminal execution for large proposals

This integration enables powerful agent-human collaboration workflows while maintaining the benefits of both specification-driven development and distributed issue tracking.</content>
<parameter name="filePath">openspec-to-beads_readme.md