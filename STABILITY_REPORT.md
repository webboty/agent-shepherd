# Agent Shepherd Status Report & Future Work

## Recent Accomplishments (Stability & Robustness)

### 1. SDK & Execution Stability
- **Fixed Silent Failures:** Corrected `opencode_sdk.ts` to send prompt payloads as structured `parts` arrays instead of plain strings, ensuring OpenCode server receives and executes instructions.
- **Added Retry Logic:** Implemented exponential backoff for prompt submission to handle transient server glitches.
- **Protocol Safety:** Added detection for raw protocol leakage (e.g., `<|channel|>`) in agent output to warn about model template mismatches.

### 2. Concurrency & Loop Prevention
- **Strict Concurrency Enforcement:** Updated `WorkerEngine` to check *global* active sessions in OpenCode before picking new work. This prevents the worker from exceeding `max_concurrent_runs` even after restarts.
- **Smart Session Reattachment:** If the worker finds an orphaned active session for the current task, it reattaches to it instead of spawning a duplicate.
- **Infinite Loop Fix:** Fixed `setPhaseLabel` in `beads.ts` to remove old phase labels before adding new ones, preventing "implement -> implement" logic loops.
- **Double-Pick Prevention:** `IssuePicker` now strictly filters out `in_progress` issues, ensuring multiple workers (or restarts) never clash on the same task.

### 3. CLI Enhancements
- **`ashep session-list`:** Lists currently active OpenCode sessions (smart filtered). Supports `--all` for history.
- **`ashep session-stop <id>`:** Allows manual abortion of runaway or stuck sessions.
- **Log Cleanup:** Removed misleading logs about CLI mode when running in SDK mode.

---

## Known Issues & Limitations

1. **"Weird Output" (`<|channel|>` tokens)**
   - **Symptom:** Some sessions output raw internal tokens like `<|channel|>commentary`.
   - **Cause:** Likely a mismatch between the OpenCode server's prompt template and the specific model (Claude 3.5 Sonnet) being used.
   - **Mitigation:** We added warning logs. Permanent fix requires OpenCode server-side config adjustment.

2. **Session Status Latency**
   - **Symptom:** `session-list` might briefly show "No active sessions" if OpenCode hasn't updated the timestamp in the last few seconds.
   - **Workaround:** Use `session-list --all` or wait a moment.

---

## Future Work Roadmap

### Immediate Term
- [ ] **Automated Orphan Cleanup:** Implement a "garbage collector" that auto-aborts sessions that have been orphaned for >1 hour with no worker attached.
- [ ] **Enhanced Monitor:** Update the Monitor Engine to use the new SDK `listSessions` capability for deeper health checks.

### Medium Term
- [ ] **Resume Capability:** Fully implement "Pause & Resume" where a worker can pick up the *context* of a previous session even if the session process died (by reloading history).
- [ ] **Multi-Worker Coordination:** Enhance the "Lease" system to use Redis or a shared lock file for robust multi-machine coordination.

---

## Testing Verification

### New Tests Added
- `tests/opencode-sdk-timeout.test.ts`: Verifies that SDK correctly reports timeouts and waiting status.
- `tests/beads-state-integration.test.ts`: Verifies correct parsing of beads CLI output (fixing the "0 eligible issues" bug).

### Manual Verification Steps
1. **Concurrency Check:**
   - Run `ashep worker`.
   - Stop it.
   - Run it again.
   - Verify log says "Global concurrency limit reached" instead of picking a new issue.

2. **Session Control:**
   - Run `ashep session-list` to see the active job.
   - Run `ashep session-stop <id>` to kill it.
   - Verify `ashep worker` now picks up a new task (since slot is freed).
