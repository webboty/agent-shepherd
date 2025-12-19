# Change: Integrate Beads Task Sync

## Why

OpenSpec manages change proposals with tasks in markdown files, but Beads provides issue tracking with epics and subtasks. To use both effectively, we need a synchronization mechanism to convert OpenSpec proposals into Beads epics with subtasks and sync task completion status back to OpenSpec.

## What Changes

- Add a converter to transform OpenSpec proposal tasks into Beads epics and subtasks, maintaining the order and hierarchy.

- Implement bidirectional sync to update Beads task status from OpenSpec and vice versa.

- Create new OpenSpec commands for applying changes with Beads integration (openspec-beads-apply, keeping original openspec-apply functionality) and for creating/syncing Beads tasks.

- Optionally, develop a plugin to facilitate easier integration.

## Impact

- Affected specs: New beads-integration capability

- Affected code: New sync utilities, command files, and potentially a plugin

- Users can now manage OpenSpec proposals using Beads for task tracking while retaining OpenSpec for design and implementation.