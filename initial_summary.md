# Agent Shepherd — System Design Document  
*(Complete Architectural Narrative with Structured Sections)*  

---

## 1. Introduction and Purpose

Agent Shepherd is a lightweight but powerful orchestration layer designed to autonomously coordinate AI coding agents across real software projects, using Beads as a coordination substrate and OpenCode as the execution environment. Its mission is simple:  
**Allow a developer to hand off entire software features, bugs, refactorings, and maintenance tasks to autonomous agents — safely, predictably, and explainably — while retaining the ability to intervene at any time.**

The core challenge is that AI coding agents today are powerful individually, but lack effective cross-step orchestration. They can code, test, debug, and refine — but they cannot reliably coordinate **workflow**, **policy**, **dependencies**, **timeouts**, **human approvals**, or **multi-step development cycles**. Shepherd fills this gap.

At its heart, Agent Shepherd acts as a **control plane**. It reads work from Beads issues, decides which agent should act next, launches that agent inside OpenCode, supervises its execution, handles structured outputs, and transitions the issue to the next phase — or into human review when needed. It remembers everything through durable run logs and ensures that no work becomes stuck or forgotten.

The developer may step in at any time — continuing work in the OpenCode session created by Shepherd — without breaking anything. Shepherd is flexible, resilient, and customizable. It is designed to be open source, cleanly structured, and easy for users to adapt.

---

## 2. Core Philosophy and Guiding Principles

The entire design follows several key principles:

### **2.1 Keep Orchestration and Coordination Separate**
Shepherd is not a task tracker.  
Beads is not a workflow engine.  
They complement each other:

- **Beads** = issues, dependencies, coordination
- **Shepherd** = policy, workflow, orchestration
- **OpenCode** = execution environment for coding agents

This separation keeps the system composable and robust.

### **2.2 Don’t Hide State Transitions**
Humans should always understand what Shepherd is doing:
- Which phase an issue is in  
- Which agent Shepherd selected  
- Why it chose that agent  
- What outcome it received  
- Why an issue advanced, repeated, or paused  

Everything must be visible, explainable, and logged.

### **2.3 Don't Guess — Require Structured Agent Outputs**
Agents should not “implicitly complete tasks.”  
Shepherd needs reliable machine-readable signals.  
Therefore, each agent run ends with a **RunOutcome JSON** block that explicitly describes:
- Result (success/partial/failure)
- Suggested next action (advance phase/repeat/need human)
- Summary
- Any new issues created
- Context pointers (spec files, delta specs, docs)

### **2.4 Always Allow Human Intervention**
Humans may:
- Jump into an OpenCode session
- Continue coding manually
- Answer questions the agent asked
- Override the agent's choices
- Approve or reject changes

Shepherd must detect and respect this.

### **2.5 Everything Must Be Configurable**
Users may customize:
- Policy definitions  
- Phases  
- Agent capabilities  
- Agent selection rules  
- Timeout behavior  
- How many Shepherds run per repo  
- UI port and display settings  

Autonomy without rigidity.

---

## 3. High-Level Architecture Overview

Agent Shepherd is structured into three main layers:

### **3.1 Coordination Layer (Beads)**
Beads is the source of truth for:
- Work items (“issues”)
- Dependencies and blockers
- Their lifecycle (`open`, `in_progress`, `blocked`, `closed`)
- Lightweight metadata (labels)

Shepherd never replaces Beads.  
Beads never performs orchestration.

Shepherd respects and updates Beads state, but all orchestration logic remains inside Shepherd.

---

### **3.2 Execution Layer (OpenCode)**
OpenCode is the environment where agents:
- Read/write code
- Run commands
- Execute tests
- Produce diffs and commits
- Operate in persistent sessions

OpenCode sessions are **not** equivalent to Shepherd runs.  
Sessions may persist across multiple runs, agents, and phases.

Shepherd uses OpenCode’s:
- Session creation API
- Message sending API
- Message listing API
- Metadata storage
- Model/provider selection

Agents may use different LLMs:
- Cloud (OpenAI, Anthropic)
- Local models (Ollama, LM Studio)
- Slow/cheap vs fast/expensive

Timeouts and supervision must take this into account.

---

### **3.3 Orchestration Layer (Agent Shepherd)**
Shepherd interprets:
- Policies  
- Phases  
- Agent capabilities  
- Results & structured outcomes  
- Beads labels & status  
- Timeouts  
- Human-in-the-loop rules  

Shepherd is the "brain" coordinating everything.

This layer also:
- Enforces deterministic workflows  
- Supervises agent execution  
- Handles run logging  
- Maintains durable state  
- Creates UI data for flow visualization  
- Monitors for stuck agents or waiting-for-human states  
- Supports human takeover detection  

This is where the majority of the complexity lives — but it stays modular and clean.

---

## 4. Beads Integration and Issue Semantics

Beads is the coordination nucleus.  
Shepherd must understand and manipulate issues through Beads commands.

### **4.1 Issue Statuses**
We standardize Beads issue statuses as follows:

- `open`: Shepherd can pick it up for next action.  
- `in_progress`: Shepherd is working on it now.  
- `blocked`: Waiting — usually due to HITL.  
- `closed`: Work done.

### **4.2 Exclusion Mechanism**
To prevent Shepherd from touching certain issues, we introduce a label:

```

ashep:excluded

```

Any issue with this label is ignored by Shepherd’s autonomous worker.

This allows:
- Manual-only tasks  
- Experiments  
- Incomplete tasks  
- “Don’t touch” items  

### **4.3 Dependencies**
Beads supports several dependency types:

- `blocks` (hard blocker)
- `parent-child`
- `related`
- `discovered-from`

Only `blocks` affects readiness.  
Shepherd respects this but does not alter its semantics.

---

## 5. Policies, Phases, and Capabilities

### **5.1 Policies**
Policies define:

- Which phases an issue must pass through  
- Which capabilities each phase requires  
- How retries work  
- How timeouts work  
- Whether human approval is required  
- How to handle human takeover  

Examples:
- `default`  
- `hotfix`  
- `refactor`  
- `minimal`  

Stored in `.agent-shepherd/policies.yaml`.

---

### **5.2 Phases**
Phases define the workflow lifecycle.  
Default phases include:

- `plan`
- `implement`
- `test`
- `review`
- `human_review`

Each phase corresponds to one or more capabilities.

The currently active phase appears as a Beads label:
```

phase:implement
phase:test

````

Execution agents NEVER change phases.  
Only Shepherd does.

---

### **5.3 Capabilities**
Capabilities are verbs describing what an agent can do.

Examples:
- `plan`
- `implement`
- `code`
- `test`
- `review`
- `debug`
- `analyze`
- `doc`
- `human_review`
- `browsertest`

Capabilities allow Shepherd to select the right agent for each phase.

---

### **5.4 Agent Registry**
Agents are described in `.agent-shepherd/agents.yaml`.

Each entry includes:
- id  
- capabilities  
- read/write permissions  
- tags for selection  
- runner definition  
- provider/model for OpenCode  
- priority ordering  
- performance characteristics (latency hints)  

This makes Shepherd fully extensible.

---

## 6. The Run Model — The Atom of Execution

A **Run** is a single execution of one agent on one issue under one phase.

It contains:
- issue id  
- agent id  
- phase  
- capability  
- attempt index  
- OpenCode session info  
- timestamps  
- structured outcome  

Logged in `.agent-shepherd/runs.jsonl` or SQLite.

Runs separate:
- orchestration  
- supervision  
- OpenCode session lifetime  

This makes failures safely recoverable.

---

## 7. Structured Run Outcomes

Agents must produce a final outcome in JSON:

```json
{
  "result": "success",
  "next_action": "advance_phase",
  "summary": "Implemented feature and added tests.",
  "suggested_next_phase": "test",
  "needs_human": false,
  "created_issues": [],
  "pointers": []
}
````

If not produced:

* Shepherd uses a fallback “outcome sniffer agent”
* Or tries a follow-up prompt

Agents must remain deterministic.

---

## 8. Worker Loop — Autonomous Work Execution

The worker is the beating heart of Shepherd.

### **8.1 Workflow**

1. Acquire a repository lock
2. Query `bd ready --json`
3. Filter:

   * status must be `open`
   * must NOT have `ashep:excluded`
4. Resolve policy
5. Determine active phase
6. Select appropriate agent
7. Create a new RunRecord
8. Transition issue to `in_progress`
9. Launch agent in OpenCode
10. Wait for structured outcome
11. Update run record
12. Transition issue accordingly:

    * Advance phase
    * Repeat phase
    * Enter HITL
    * Close issue
13. Return issue to `open` or `blocked`

### **8.2 Cap on parallel work**

`max_concurrent_runs` controls how many runs the worker may start.

---

## 9. Monitor Loop — Supervision, Timeout Detection, HITL

The monitor ensures no run becomes stuck.

### **9.1 Checking Running Runs**

Periodically:

* Inspect all runs in `running` status
* Retrieve latest OpenCode session messages
* Detect:

  * last agent message time
  * last human message time

### **9.2 Stalled Runs**

If:

```
current_time - last_message_time > stall_threshold
```

Then:

* mark run failed
* or invoke diagnostic agent
* or retry depending on policy

### **9.3 Human Takeover Detection**

If a human sends messages into the session:

* Policies define how to respond:

  * treat human messages as review
  * pause and wait
  * resume when idle cooldown passes

### **9.4 Interrupted Runs**

If Shepherd crashes:

* Rerun monitor → resume or restart runs safely

---

## 10. Human-in-the-Loop (HITL) Design

When a run needs human input:

Shepherd:

* Sets `phase:human_review`
* Sets `status:blocked`
* Adds label `needs:human_approval`
* Posts instructions as Beads comment

Human responds by adding labels:

* `human:approved`
* `human:changes_requested`

Shepherd reacts accordingly.

---

## 11. Handling Human Takeover in OpenCode Sessions

A beautiful OpenCode feature:
**Humans can jump into the session and code manually.**

Shepherd must:

* Detect human-origin messages
* Freeze the run until humans finish
* Resume after an idle cooldown
* Attribute outcomes correctly

Shepherd never overwrites human contributions.

---

## 12. Agent Selection Logic

Agent selection is based on:

1. Required capability
2. Read/write requirements
3. Tags (e.g., `laravel`, `php`)
4. Provider/model preferences
5. Agent priority
6. Latency/timing hints for supervising slow models

All deterministic and explainable.

---

## 13. Configuration and Extensibility

Everything lives under `.agent-shepherd/`:

* config.yaml
* policies.yaml
* agents.yaml

Users can freely add:

* new agents
* new policies
* new phases
* new capabilities

Shepherd should never hardcode assumptions.

---

## 14. Multi-Project and Multi-Shepherd Operation

Shepherd can run:

* one worker per repo
* multiple different repos in parallel
* multiple workers on separate machines
* monitor per repo

Future parallelism within one repo (multiple agents per epic) will come via Agent Mail.

---

## 15. Housekeeping: Agent Syncer

Shepherd should provide a command to:

```
ashep sync-agents
```

Which:

* Reads installed OpenCode agents
* Adds them to `.agent-shepherd/agents.yaml`
* Or marks missing/obsolete agents

Keeps the environment consistent.

---

## 16. Installer and Init

Shepherd will offer:

```
ashep install
```

* Checks for Beads
* Suggests install if missing
* Creates `.agent-shepherd/` folder

and:

```
ashep init
```

* Writes default policies
* Writes default agents
* Validates environment

---

## 17. UI for Flow Visualization

A lightweight UI (ReactFlow, Rete.js, or GoJS) shows:

* Timeline of phases
* Each RunRecord as a node
* Edges representing sequence
* Click to open run details
* Links to OpenCode sessions

The UI runs via:

```
ashep ui
```

---

## 18. Performance and Timeout Strategy

Because OpenCode agents may use:

* giant cloud models
* slow local models

Timeouts adjust using:

* policy-defined timing
* agent.performance.timeout_multiplier

Slow agents (e.g., local 4B Q6) get more forgiving timeouts.

---

## 19. BasicMemory Integration (Optional)

BasicMemory is not required at MVP launch.
Eventually, it may be used to summarize:

* runs
* policies
* spec decisions

But Shepherd should not depend on it.

---

## 20. Summary and Closing View

Agent Shepherd is an extensible orchestration layer that transforms agents from “powerful coding copilots” into **autonomous developers** capable of:

* Planning
* Implementing
* Testing
* Reviewing
* Debugging
* Asking humans for help
* Adapting to policies
* Running safely in loops
* Coordinating multi-step workflows
* Never losing context

This design document captures the full architecture and reasoning required to build it.
BMAD can now take this specification and generate:

* The full TypeScript codebase
* CLI commands
* Worker/monitor modules
* OpenCode integration
* UI
* Installer and init commands
* Config and policy systems
