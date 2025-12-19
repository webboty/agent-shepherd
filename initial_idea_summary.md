# Agent Shepherd — Planning Summary (Ready for Technical Implementation)

This document captures the **full “Agent Shepherd” design** we agreed on: the architecture, decisions, and the reasoning behind them. It’s written as a **handoff artifact** so the next session can go straight into technical implementation planning (schemas, CLI/API calls, storage layout, policies, and agent integration).

---

## 0) Project context and intent

### Your situation (brownfield reality)

* You have a **3+ year** production app: **Laravel + Backpack + Livewire** + additional libraries, multiple domains/modules (inventory management + click tracking and more).
* You want to **hand off coding fully to AI**:

    * You participate mostly in planning/definition.
    * Agents plan, implement, test, validate, bugfix, create tasks, and commit autonomously.
* You already have:

    * **OpenCode** as the execution environment (multiple agents, selectable).
    * **Beads** as a task tracker (with the important constraint that **Beads is not long-term history**, because closed issues get cleaned periodically).
    * Existing **AGENTS*.md** knowledge docs (project conventions, domain rules, architecture notes, etc.). These are not “agents”—they’re your **project knowledge base** that agents can load JIT.

### Overall design goal

Create a “KISS but powerful” orchestration system that:

* Orchestrates multi-step flows (plan → dev → test → review loops).
* Handles failures (agents stuck, timeouts).
* Keeps context lean (JIT info loading).
* Uses Beads for WIP coordination but stores durable history elsewhere.
* Can evolve later to parallel swarms (Agent Mail in the future).

---

## 1) Core philosophy: separate “coordination” from “orchestration”

We decided not to turn Beads into a workflow engine.

### Why

* **Beads is intentionally lightweight** and optimized for: policy-free issue tracking, dependency graphs, “ready work” queries, and cleanup.
* You need a **control plane** that:

    * understands policy
    * supervises work execution
    * handles timeouts and recovery
    * chooses which agent to run next

**Conclusion:** Beads is the “coordination layer.” We add a small control plane on top: **Agent Shepherd**.

---

## 2) Layered architecture: the three layers

### A) Coordination Layer — Beads

Beads is the source of truth for:

* What work exists right now (WIP).
* Work relationships (dependencies/hierarchy).
* The action queue (`bd ready` style).
* Lightweight metadata (labels).
* Status (`open`, `in_progress`, `blocked`, `closed`).

**Beads is NOT** your long-term history or memory, because issues get cleaned.

### B) Execution Layer — OpenCode / Claude Code (and similar)

This is where agents actually run:

* They read/write code (depending on permissions).
* They run tests and scripts.
* They commit.
* They may operate inside persistent OpenCode sessions.

Important correction we locked in:

* **OpenCode session ≠ work run.**

    * Sessions can exist even when no agent is actively working.
    * Multiple agents and multiple “runs” can occur inside one session.
    * An epic might involve multiple sessions.

### C) Policy + Control Layer — Agent Shepherd

Agent Shepherd is the central brain:

* Owns policy interpretation.
* Owns phase transitions and orchestration.
* Dispatches the correct agent for the next step.
* Supervises runs for timeouts/stalls.
* Ensures everything stays deterministic and auditable.
* Records durable logs outside Beads.

**Key rule:** Agents do work. **Shepherd decides what happens next.**

---

## 3) Beads: status, dependencies, and how we use them

### Beads status semantics (as coordination locks)

We aligned on these meanings:

* `open`: Eligible for next action (not “new”; just “available”).
* `in_progress`: Claimed/locked by Shepherd for an active run.
* `blocked`: Explicit pause (e.g., waiting for human input / HITL, or external waiting).
* `closed`: Terminal; can be cleaned later.

### Dependencies are separate from status

Beads has typed dependencies, and **only `blocks` affects ready-work detection**:

* `blocks`: hard blocker (affects readiness)
* `related`: soft link
* `parent-child`: hierarchy
* `discovered-from`: discovered while working; keeps work in same repo context

This distinction matters because:

* We can use `status=blocked` for HITL without necessarily creating “fake blocker issues”.
* We use `blocks` dependencies for genuine “can’t start until X is done” constraints.

**Open research note** (implementation phase): confirm how `bd ready` interacts with `status=blocked` in the exact version you run. Our design works either way, but it affects whether we rely on status or edges to remove work from readiness.

---

## 4) Policy model: assigned via label, resolved by Shepherd

### Policy assignment in Beads

We chose **Option A**:

* Assign policy via a single label on the issue:

    * `policy:feature`
    * `policy:hotfix`
    * `policy:refactor`
    * etc.
* If no policy label exists, Shepherd applies a **default policy**, possibly with inference from other labels (e.g., `type:bug`, `domain:*`).

### Why this is the right approach

* Beads stays simple.
* Policies can evolve without rewriting every issue.
* Policies can be swapped without renaming agents.
* Shepherd has a single place where policy meaning is defined.

### Policy responsibility

* Only Shepherd (and optionally BMAD at creation time, or humans) sets policy labels.
* Execution agents do **not** modify policy.

---

## 5) Phase model: visible, simple, Shepherd-owned

We decided to track workflow steps via a **phase label** that is:

* visible in Beads,
* updated only by Shepherd.

Examples:

* `phase:plan`
* `phase:implement`
* `phase:test`
* `phase:review`
* `phase:human_review` (HITL)

### Why phases exist

* Debuggability: humans can see where work is.
* Deterministic orchestration: Shepherd doesn’t infer “what’s next” from random agent text.
* Easy policy enforcement: a policy can define which phases are allowed/required.

### Critical rule

Execution agents do **not** change phases.
They only do work and report results.

---

## 6) Capability-based dispatch: maintainable agent selection

You have many agents and they will change over time. Hardcoding agent names into policies would rot.

### Decision: Shepherd dispatches by **capability**, not agent name

We define a small stable set of capabilities (verbs), e.g.:

* `plan`
* `implement`
* `test`
* `review`
* `debug`
* `doc`
* `analyze`

Policies refer to phases/capabilities, not concrete agents.

### Agent registry

Shepherd maintains (or derives) an **Agent Registry** mapping:

* capability → list of agents that can perform it

### How Shepherd chooses among multiple agents per capability

Selection is deterministic and KISS:

1. Filter by required capability.
2. Apply constraints:

    * mutability (read-only vs write)
    * frameworks (Laravel/Livewire)
    * domain tags (inventory, click tracking)
    * tooling needs (playwright, browser test)
3. Tie-break by `priority`.

### Why this is maintainable

* Agents can be added/removed/upgraded without changing policies.
* Policies remain stable.
* The selection logic is explainable.

---

## 7) Runs (the missing primitive) and why sessions are not enough

### Key correction we made

OpenCode “sessions” are persistent containers; they do not equal “active work”.

So we introduced:

### **Run = atomic unit of work**

A **Run** is:

* “Agent X performed capability Y on Beads issue Z under policy P, using session S (optional).”

Runs solve:

* multiple agents on one issue
* multiple sessions per issue
* run-level timeout detection
* durable logging even after Beads cleanup

### Run registry

Shepherd stores runs outside Beads in:

* JSONL (append-only)
* and/or a lightweight SQLite DB

Goal: same spirit as Beads (json + light sql).

---

## 8) Structured run results: the one area still being refined

We agreed this is the last major tuning area.

### The problem

Shepherd cannot rely on:

* free-form agent last messages
* “reading between the lines”
* inconsistent completion signals

Shepherd needs deterministic, machine-readable run outcomes.

### Three options we identified

#### A) Wrapper (Shepherd-runner)

A wrapper launches agents and enforces an outcome contract.

* Strongest guarantees, but might be tricky depending on OpenCode APIs/CLI.

#### B) Agent emits structured JSON outcome

Agent outputs JSON at end of run:

* either as the last message in a strict delimiter block
* or writes a file (if it has write permission)

#### C) Shepherd “sniffer” fallback

If outcome missing:

* Shepherd sends a follow-up request in the same session: “Produce the run outcome JSON now.”
* Or uses a separate lightweight LLM to extract—but only as a fallback.

### Constraints we must respect

* Not all agents can write files (some are read-only by design).
* Wrapper feasibility depends on OpenCode integration details (CLI / API).

### Current direction (agreed)

* Use **B** as the easiest initial path:

    * JSON outcome in a strict delimited block OR file (when allowed).
* Use **C** as a recovery mechanism.
* Research wrapper feasibility (A) during implementation planning.

---

## 9) Human-in-the-loop (HITL)

We decided HITL should be represented as:

* A **capability** (conceptually: “human_review / human_approval”), and
* A **Beads label** to make it explicit, plus status handling.

### Proposed HITL representation

* Shepherd sets:

    * `phase:human_review`
    * `status:blocked`
    * label: `needs:human_approval` (or similar)
    * comment with exact instructions: “Add `human:approved` or `human:changes_requested`”

Human responds by labels:

* `human:approved`
* `human:changes_requested`

Shepherd detects these and resumes:

* clears human labels
* moves phase forward based on policy
* sets status back to `open`

### Open question we flagged

* Confirm whether Beads expects `blocked` status to imply a graph blocker (we believe status and dependency edges are distinct; docs show blocks edges affect readiness, but status semantics require code confirmation in your version). We’ll verify in the tech planning session.

---

## 10) Failure, stuck agents, timeouts: supervision (KISS)

Agents can stall. Sessions can remain open forever. So Shepherd supervises runs.

### What we supervise

* Runs, not sessions.

### Timeout model (conceptual)

* When a run starts, Shepherd records `started_at`.
* Shepherd watches for:

    * lack of progress signals (heartbeat approach is optional)
    * exceeded time budget for the run type (policy-driven timeouts)

If a run is stale:

* mark run failed in registry
* release issue (`status=open`) or set `status=blocked` depending on policy
* optionally trigger structured outcome request (sniffer)
* optionally re-dispatch with a fallback agent (policy-driven retry strategy)

---

## 11) Durable history: where information lives when Beads is cleaned

Because Beads is ephemeral, we need a durable trail.

### Durable sources of truth

* Git commits + branch history
* Specs stored in repo (`/specs/...`)
* Shepherd run logs (`.shepherd/runs.jsonl` / SQLite)
* Optional memory layer later (BasicMemory) for summaries/pointers, not raw content

### Spec storage conventions

* BMAD outputs: `/specs/bmad/...`
* OpenSpec deltas: `/specs/openspec/...`

Beads issues reference these via pointers while they exist.

---

## 12) Context management: keep it lean (JIT)

We explicitly want to avoid blowing context before work even begins.

### Decision

* The system uses pointers and just-in-time loading.
* Do not preload all AGENTS*.md or all specs.

Suggested pattern (implementation phase detail):

* A lightweight “Doc Router” step to load only:

    * relevant domain docs
    * relevant spec/delta docs
    * relevant code context
      for the current run.

---

## 13) How BMAD and OpenSpec fit (layered cleanly)

### BMAD

* Used as a high-level planner (plan capability).
* Best for big planned work: breaking down features into tasks and specs.
* Can coexist with OpenSpec for hotfixes.
* BMAD tasks are not “the truth”; Beads is WIP truth, specs are durable truth.

### OpenSpec

* Used for precise deltas in brownfield code, hotfixes, incremental changes.
* Fits naturally as an “implement” provider (capability) with a specific style.

### Integration rule

* No direct “tell BMAD / tell OpenSpec”.
* Synchronization happens through:

    * code
    * specs
    * Beads (WIP)
    * Shepherd run history (durable)

---

## 14) Agent Mail (future parallel swarms)

We decided Agent Mail is primarily a parallelism/swarms enabler:

* multi-agent coordination
* messaging/negotiation
* avoiding conflicts

We are not using it yet, but we will **not design ourselves into a corner**:

* Shepherd stays the single authority for policy + phase
* Later, multiple workers can operate in parallel on different issues (and eventually on child issues of an epic)
* Agent Mail can slot in without rewriting the control plane

---

## 15) Implementation-phase “known research” items

These are explicitly deferred to the next session (tech planning):

1. **Beads exact semantics check**

    * Confirm with source/behavior:

        * how `status=blocked` interacts with `bd ready`
        * whether any invariants exist linking `blocked` status to `blocks` deps in the implementation

2. **OpenCode integration**

    * Determine which is best:

        * CLI invocation patterns
        * session management patterns
        * whether a wrapper is feasible/reliable
        * whether we can programmatically send follow-up prompts to request structured outcome JSON

3. **Structured outcome contract**

    * Standardize a minimal run outcome schema
    * Ensure it works for read-only agents (no file writing)
    * Define the sniffer fallback protocol

4. **Shepherd storage**

    * JSONL and/or SQLite schema
    * “runs”, “decisions”, “agent registry”, “policies”

5. **Policies**

    * Define initial set: `default`, `feature`, `hotfix`, `refactor`
    * Map each to required phases and gating rules
    * Define retry/timeout behavior per policy

---

## 16) What you might have missed (important additions)

### A) Separate “issue lifecycle” from “run lifecycle”

* Issue can remain open and go through multiple phases.
* Each phase corresponds to one or more runs.
* Shepherd’s run logs are the durable record that ties everything together.

### B) Explainability log (“why did Shepherd do that?”)

To keep autonomy debuggable, Shepherd should record:

* policy resolved
* phase transitions
* agent selected and why (capability + filters + tie-break)
* outcomes and follow-up actions

This is critical once autonomy grows.

### C) Compatibility with “epic → child tasks” when needed

You don’t want to overuse hierarchy, but for large work or future parallelism:

* Epic issue can create child issues.
* Shepherd can work on children in parallel later.
* Beads’ dependency types support this cleanly.

---

## 17) Links / resources referenced in this planning phase

(Placed here as a ready-to-use reference list.)

```text
BMAD Method
- https://github.com/bmad-code-org/BMAD-METHOD
- BMAD agents: https://github.com/bmad-code-org/BMAD-METHOD/tree/main/src/modules/bmm
- BMAD agent definitions: https://github.com/bmad-code-org/BMAD-METHOD/tree/main/src/modules/bmm/agents
- BMAD + OpenCode docs: https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/ide-info/opencode.md

Agent OS
- https://buildermethods.com/agent-os

Spec Kitty
- https://github.com/Priivacy-ai/spec-kitty

OpenCode
- https://opencode.ai/
- OpenCode CLI docs: https://opencode.ai/docs/cli/

Beads
- https://github.com/steveyegge/beads
- Agent Mail quickstart: https://github.com/steveyegge/beads/blob/main/docs/AGENT_MAIL_QUICKSTART.md
- Agent Mail details: https://github.com/steveyegge/beads/blob/main/docs/AGENT_MAIL.md
- MCP Agent Mail helper: https://github.com/Dicklesworthstone/mcp_agent_mail

BasicMemory (optional memory layer)
- https://docs.basicmemory.com/
```

---

## 18) Where we start next session (technical planning agenda)

In the next session we will:

1. Confirm Beads semantics from source behavior (blocked + ready).
2. Draft a minimal Shepherd policy DSL.
3. Define “phase” + “capability” mapping.
4. Define the agent manifest format (capabilities, constraints, priority).
5. Define run registry schema (JSONL + optional SQLite).
6. Define structured run outcome schema + fallback sniffer protocol.
7. Choose OpenCode integration style (CLI/API; wrapper feasibility).
8. Define HITL mechanism (labels + blocked + human action conventions).
9. Outline first working MVP flow:

    * create Beads issue
    * Shepherd claims it
    * dispatch plan/implement/test loop
    * log run outcomes
    * finalize/close

---

**This concludes the initial planning phase for Agent Shepherd.**
Next session: we move into **technical implementation planning** (schemas, state transitions, CLI/API calls, file layout, and the first MVP workflow).
