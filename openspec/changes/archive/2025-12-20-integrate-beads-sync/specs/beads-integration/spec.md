## ADDED Requirements

### Requirement: Beads Epic Creation from OpenSpec Proposal

The system SHALL provide a converter to create a Beads epic from an OpenSpec proposal, with tasks from ## sections and sub-tasks from - [ ] items, preserving numbering for order and dependencies.

#### Scenario: Successful Epic Creation

- **WHEN** user runs the beads task create command with a proposal ID
- **THEN** a Beads epic is created with the proposal name, tasks from ## sections (e.g., bd-a3f8.1), and sub-tasks from - [ ] items (e.g., bd-a3f8.1.1), maintaining the specified order

### Requirement: Bidirectional Status Sync

The system SHALL sync task completion status between OpenSpec and Beads.

#### Scenario: Sync from Beads to OpenSpec

- **WHEN** a Beads task is marked complete
- **THEN** the corresponding OpenSpec task is marked as completed in tasks.md

#### Scenario: Sync from OpenSpec to Beads

- **WHEN** an OpenSpec task is marked complete
- **THEN** the corresponding Beads subtask is updated to complete

### Requirement: Integration Commands

The system SHALL provide commands for managing the integration.

#### Scenario: Apply with Beads

- **WHEN** user runs openspec-beads-apply
- **THEN** the proposal is applied using OpenSpec files but tasks are managed via Beads

#### Scenario: Create Beads Tasks

- **WHEN** user runs openspec-beads-task-create
- **THEN** Beads epic and subtasks are created for the specified proposal

#### Scenario: Sync Tasks

- **WHEN** user runs openspec-beads-task-sync
- **THEN** status is synchronized between OpenSpec and Beads