## Context

OpenSpec is used for spec-driven development with change proposals, tasks in markdown. Beads is used for issue tracking with bd command for tasks, epics, etc. We want to integrate them so OpenSpec proposals can be managed as Beads epics.

OpenSpec tasks.md follows a hierarchical structure:
```
## 1. Project Setup
- [ ] 1.1 Create package.json...
- [ ] 1.2 Create tsconfig.json...
```

Beads uses a hierarchical ID system: bd-a3f8 (Epic), bd-a3f8.1 (Task), bd-a3f8.1.1 (Sub-task).

Mapping: OpenSpec proposal → Beads epic; ## sections → Beads tasks; - [ ] items → Beads sub-tasks, preserving numbering for order and dependencies.

## Goals / Non-Goals

- Goals: Sync OpenSpec tasks to Beads epics/subtasks, sync status back, use both systems together.

- Non-Goals: Replace either system, force all workflows through one tool.

## Decisions

- Use converter scripts to transform data between formats.

- Bidirectional sync to keep both in sync.

- New commands for the integration.

- Plugin as optional enhancement.

## Risks / Trade-offs

- Complexity of maintaining sync: Risk of desync, mitigation: clear error handling and manual sync options.

- Dependency on Beads commands: Risk if Beads changes, mitigation: abstract the interface.

## Migration Plan

- Existing OpenSpec proposals can opt-in to Beads sync.

- No breaking changes to current workflows.

## Open Questions

- How to handle task dependencies beyond sequential numbering.

- Plugin architecture details if implemented.