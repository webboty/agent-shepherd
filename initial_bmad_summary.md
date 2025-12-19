# Agent Shepherd — BMAD-Optimized Design Specification

## 1. Purpose
Agent Shepherd is an orchestration layer for autonomous coding workflows.  
It coordinates Beads (issues + dependencies), OpenCode (agent execution), and policies (workflow rules).

Shepherd is responsible for:
- Selecting agents
- Executing multi-phase workflows
- Handling human-in-the-loop (HITL)
- Supervising runs and timeouts
- Logging durable execution records
- Ensuring determinism and reproducibility

It is NOT responsible for:
- Code editing (agents do that)
- Coordination state (Beads does that)
- Execution environment (OpenCode does that)

---

## 2. Architecture Overview

### 2.1 Layers
**Beads (Coordination Layer)**  
- Issues, dependencies, labels, statuses  
- Shepherd reads/writes via CLI wrappers  

**OpenCode (Execution Layer)**  
- Agent execution  
- Sessions, messages, diffs, tests  

**Shepherd (Orchestration Layer)**  
- Worker loop  
- Monitor loop  
- Policy engine  
- Agent selection engine  
- Run logging  
- UI server (optional)

---

## 3. Issue Semantics (Beads)

### 3.1 Statuses
- `open`: Shepherd may pick up this issue  
- `in_progress`: Shepherd is currently working  
- `blocked`: Waiting for HITL or other gating  
- `closed`: Finished  

### 3.2 Exclusion Label
Issues with label `ashep:excluded` are ignored by autonomous workers.

### 3.3 Dependencies
Shepherd respects:
- `blocks`
- `parent-child`
- `related`
- `discovered-from`

Only `blocks` determines readiness.

---

## 4. Workflow Model

### 4.1 Policy Definition
Policies define:
- Phases
- Required capabilities per phase
- Retries per phase
- Timeout rules
- HITL rules
- Human takeover rules

Example phases:
- plan
- implement
- test
- review
- human_review

### 4.2 Phases
Each issue has exactly one active phase, represented via Beads label: `phase:<name>`.

### 4.3 Capabilities
Capabilities describe agent skills:
- plan, implement, test, review, debug, doc, analyze, code, browsertest, human_review

---

## 5. Runs and Outcomes

### 5.1 Run
Atomic execution unit:
- issue_id
- agent_id
- phase
- capability
- attempt_index
- timestamps
- session info
- structured outcome

Stored in `.agent-shepherd/runs.jsonl` or SQLite.

### 5.2 Structured Outcome
Mandatory JSON:
- result: success | partial | failed
- next_action: advance_phase | repeat_phase | need_human | none
- summary
- suggested_next_phase
- needs_human
- created_issues
- pointers

If missing → fallback extraction agent or recovery prompt.

---

## 6. Worker Engine

### Responsibilities
- Query `bd ready --json`
- Filter eligible issues (`open`, not excluded)
- Resolve policy and active phase
- Select agent
- Create RunRecord
- Mark issue `in_progress`
- Start OpenCode session
- Send agent instructions and wait for RunOutcome
- Update RunRecord
- Transition issue state based on outcome
- Release issue back to `open` or `blocked`

### Concurrency
`max_concurrent_runs` limits parallel runs.

---

## 7. Monitor Engine

### Responsibilities
- Scan runs in `running` state
- Fetch session messages
- Track:
  - last agent message timestamp
  - last human message timestamp

### Stall Detection
If inactivity > stall_threshold:
- fail run  
- retry  
- or invoke diagnostic agent  

### Human Takeover Detection
If human messages appear:
- Follow policy:
  - pause
  - treat as review
  - resume after idle cooldown

---

## 8. Agent Registry

### Agent Definition Fields
- id  
- capabilities (array)  
- read_write: read | write  
- tags (optional)  
- runner: type, agent_slug, provider, model, session_strategy  
- performance: speed, timeout_multiplier  
- priority (number)  
- is_human (bool)

### Agent Selection
Determined by:
- Required capability  
- Read/write constraints  
- Tags  
- Provider/model  
- Priority  
- Performance profile  

---

## 9. Policy Engine

### Responsibilities
- Load policies.yaml  
- Validate phases  
- Determine next phase  
- Apply retries  
- Apply timeout rules  
- Trigger HITL states:
  - set `phase:human_review`
  - set status=blocked
  - add `needs:human_approval`

### Human Approval Workflow
Human adds either:
- `human:approved`  
- `human:changes_requested`  

Shepherd resumes accordingly.

---

## 10. OpenCode Integration

### Required Functions
- Create session  
- Reuse session by policy  
- Send messages  
- List messages  
- Extract timestamps  
- Detect human messages  
- Attach metadata to sessions  

### Use Cases
- Starting agent runs  
- Querying stalls  
- HITL message detection  

---

## 11. Beads Integration

### Required Commands
- `bd ready --json`
- `bd show <issue>`
- `bd label add|rm|set`
- `bd comment`
- `bd log`

### Wrapper Module
Provide high-level helpers:
- getReadyIssues()
- getIssue()
- setStatus(issue, status)
- setPhase(issue, phase)
- addLabel/removeLabel
- postComment

---

## 12. Logging and Durability

### Run Logging
Append-only JSONL:
- one line per run
- includes outcome
- includes decision trace id
- includes error information

### Optional SQLite
Used for UI visualization or advanced queries.

---

## 13. UI Server

Provides:
- `/issues`
- `/issues/:id/runs`
- `/runs/:id`

And serves a ReactFlow UI:
- nodes = runs
- edges = run sequence
- colored by state
- link to OpenCode session

---

## 14. Housekeeping Commands

### `ashep init`
Create:
- .agent-shepherd/config.yaml  
- default policies  
- default agents  

### `ashep sync-agents`
Import agents from OpenCode environment.

### `ashep install`
Check dependencies:
- beads
- bun
- opencode server config

---

## 15. Extensibility

Users may extend:
- capabilities  
- phases  
- agents  
- policies  
- timeout rules  
- diagnostic agents  
- UI visualizations  

No hardcoded assumptions.

---

## 16. Key Guarantees

- Deterministic workflows  
- Human override supported  
- No silent failures  
- Autonomous but controlled  
- Durable logs  
- Fully explainable decisions  
- Modular architecture  
- Works with cloud or local LLMs  

---

## 17. Deliverables for BMAD

### Required Code Modules
- src/cli/ashep.ts (CLI dispatcher)
- src/core/worker-engine.ts
- src/core/monitor-engine.ts
- src/core/opencode.ts
- src/core/beads.ts
- src/core/agent-registry.ts
- src/core/policy-registry.ts
- src/core/types.ts
- src/core/config.ts
- src/core/run-logger.ts
- ui/* (placeholder)

### Required Files
- .agent-shepherd/config.yaml
- .agent-shepherd/policies.yaml
- .agent-shepherd/agents.yaml
- package.json
- tsconfig.json
- docs/*
- schemas/*

This concludes the BMAD-optimized specification.

