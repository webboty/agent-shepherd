# Future Work & Improvements

This document tracks planned improvements and known limitations for Agent Shepherd.

## High Priority

- [ ] **Verbose Logging System:** Implement a file-based verbose logging system that can be toggled via config (`logging.verbose: true`) or CLI flag (`--verbose`). This should dump detailed request/response payloads, decision logic, and internal state to a dedicated log file (`.agent-shepherd/logs/verbose.log`) for debugging complex issues.
- [ ] **Strict Concurrency Config Switch:** Add a configuration option to choose the concurrency enforcement strategy.
    - `enforcement_mode: "active_sessions"` (Default): Uses OpenCode SDK to count actually running sessions. Good for detecting orphans.
    - `enforcement_mode: "beads_status"`: Queries Beads for total number of `in_progress` issues assigned to this worker. Good for strict stateless enforcement.
- [ ] **Automated Orphan Cleanup:** Implement a background task to automatically abort OpenCode sessions that have been inactive for >1 hour and are not tracked by any active worker.

## Medium Priority

- [ ] **Resume Capability:** Enhance the worker to fully resume context from previous sessions even after a process crash, by reloading message history into memory.
- [ ] **Multi-Worker Coordination:** Improve the "Lease" system to support distributed locking (Redis/file-lock) for robust multi-machine setups.
- [ ] **Protocol Mismatch Handling:** Investigate and fix the `<|channel|>` token leakage issue by aligning OpenCode model templates with the specific LLM being used.

## CLI & UX

- [ ] **Session Management:** Add filters to `ashep session-list` (by user, by phase).
- [ ] **Interactive Mode:** Allow `ashep work` to prompt for clarifications during execution.
