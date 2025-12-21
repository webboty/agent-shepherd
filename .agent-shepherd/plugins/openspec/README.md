# OpenSpec Plugin for Agent Shepherd

The OpenSpec plugin provides seamless integration between OpenSpec proposals and Beads issue tracking system. It enables automatic conversion of OpenSpec task specifications into Beads issues and bidirectional synchronization of task completion status.

## Overview

OpenSpec is a specification format for defining software development tasks and proposals. This plugin bridges the gap between OpenSpec's structured task definitions and Beads' hierarchical issue tracking, enabling teams to:

- Convert OpenSpec proposals to executable Beads issues
- Maintain task status synchronization
- Parse and validate OpenSpec task structures

## Installation

The OpenSpec plugin is included with Agent Shepherd by default. It will be automatically loaded when Agent Shepherd starts.

If you need to reinstall or update it:

```bash
# The plugin is pre-installed, but you can verify with:
ashep plugin-list
```

## Commands

### `ashep openspec-convert <proposal-id>`

Converts an OpenSpec proposal into Beads issues, creating a hierarchical task structure.

**Usage:**
```bash
ashep openspec-convert integrate-beads-sync
```

**What it does:**
1. Reads `openspec/changes/<proposal-id>/proposal.md`
2. Extracts proposal title and description
3. Parses `openspec/changes/<proposal-id>/tasks.md` for task structure
4. Creates an epic issue in Beads with proposal details
5. Creates subtasks for each section and subtask in the specification

**Example Output:**
```
Creating epic for proposal: Integrate Beads Task Sync
Created epic: EPIC-123
Creating section task: Implementation Phase
Created section task: EPIC-123.1
Creating sub-task: Add sync logic
Created sub-task: EPIC-123.1.1
Conversion complete
```

### `ashep openspec-sync <proposal-id>`

Synchronizes task completion status between OpenSpec tasks.md and Beads issues.

**Usage:**
```bash
ashep openspec-sync integrate-beads-sync
```

**What it does:**
1. Finds the corresponding Beads epic by proposal title
2. Compares task status in `tasks.md` with Beads issue status
3. Updates Beads issues to match OpenSpec completion status
4. Updates OpenSpec `tasks.md` with status from Beads

**Bidirectional Sync:**
- ✅ Tasks marked complete in OpenSpec → Closed in Beads
- ❌ Tasks reopened in Beads → Marked incomplete in OpenSpec

**Example Output:**
```
Closed Beads task: Implement sync logic
Closed Beads task: Add error handling
Updated tasks.md: marked 2 tasks as complete
Sync complete
```

### `ashep openspec-parse <proposal-id>`

Parses and validates an OpenSpec tasks.md file structure without creating issues.

**Usage:**
```bash
ashep openspec-parse integrate-beads-sync
```

**What it does:**
1. Reads and parses `openspec/changes/<proposal-id>/tasks.md`
2. Validates the markdown structure
3. Outputs the parsed task hierarchy
4. Generates Beads command equivalents (for reference)

**Example Output:**
```
Parsed tasks: [
  {
    "title": "Implementation Phase",
    "subtasks": [
      {
        "title": "Add sync logic",
        "completed": true
      },
      {
        "title": "Add error handling",
        "completed": false
      }
    ]
  }
]

Beads commands:
bd create "Integrate Beads Task Sync" -p 0
bd create "Implementation Phase" -p 0
bd create "Add sync logic" -p 0
bd create "Add error handling" -p 0
```

## OpenSpec Format

The plugin expects OpenSpec proposals in the following structure:

```
openspec/
├── changes/
│   └── <proposal-id>/
│       ├── proposal.md
│       └── tasks.md
```

### proposal.md Format

```markdown
# Change: Proposal Title

## Why
Reasoning for this change...

## What Changes
Description of changes...

## Implementation
Implementation details...
```

### tasks.md Format

```markdown
## Phase 1: Planning
- [ ] Task 1.1: Do something
- [x] Task 1.2: Already done
- [ ] Task 1.3: Another task

## Phase 2: Implementation
- [ ] Task 2.1: Implement feature
- [ ] Task 2.2: Write tests
```

**Supported Syntax:**
- `## Section Title` - Main task sections
- `- [ ] Task description` - Incomplete tasks
- `- [x] Task description` - Completed tasks
- Hierarchical structure with automatic Beads issue relationships

## Workflow Integration

The OpenSpec plugin fits into the Agent Shepherd workflow:

1. **Proposal Phase**: Use OpenSpec to define detailed task specifications
2. **Conversion**: Run `openspec-convert` to create executable Beads issues
3. **Development**: Work on issues through Agent Shepherd's orchestration
4. **Sync**: Use `openspec-sync` to keep specifications updated
5. **Completion**: Mark proposal complete when all Beads issues are closed

## Requirements

- **Beads**: Must be installed and accessible (`bd` command)
- **OpenSpec Structure**: Proposals must follow expected directory structure
- **Permissions**: Write access to Beads database and OpenSpec files

## Troubleshooting

### "Proposal or tasks file not found"

**Cause:** The proposal directory or files don't exist in the expected location.

**Solution:**
```bash
# Check if proposal exists
ls openspec/changes/<proposal-id>/

# Verify file names
ls openspec/changes/<proposal-id>/proposal.md
ls openspec/changes/<proposal-id>/tasks.md
```

### "Failed to create epic"

**Cause:** Beads command failed, possibly due to permissions or database issues.

**Solution:**
```bash
# Test Beads connectivity
bd list --json

# Check Beads status
bd status
```

### "Epic not found" (during sync)

**Cause:** The proposal hasn't been converted yet, or the epic was deleted.

**Solution:**
```bash
# Convert first
ashep openspec-convert <proposal-id>

# Or find existing epics
bd list | grep "<proposal-title>"
```

## Examples

### Complete Workflow

```bash
# 1. Convert proposal to issues
ashep openspec-convert feature-x

# 2. Process issues with Agent Shepherd
ashep worker

# 3. Sync status updates
ashep openspec-sync feature-x

# 4. Parse current structure
ashep openspec-parse feature-x
```

### Daily Sync

```bash
# Sync all active proposals
for proposal in proposal1 proposal2; do
  ashep openspec-sync $proposal
done
```

## Development

The OpenSpec plugin is implemented using existing tools:

- `tools/openspec-beads-converter.cjs` - Conversion logic
- `tools/openspec-beads-sync.cjs` - Synchronization logic
- `tools/openspec-beads-parser.cjs` - Parsing utilities

**Plugin Location:** `.agent-shepherd/plugins/openspec/`

**Source Code:** See `index.js` for command implementations and `manifest.json` for metadata.

## Related Documentation

- [Agent Shepherd Plugin System](../../docs/plugin-system.md) - Plugin architecture
- [Beads Documentation](https://github.com/steveyegge/beads) - Issue tracking system
- [OpenSpec Specification](https://github.com/your-org/openspec) - Task specification format