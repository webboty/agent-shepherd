# PHASE TRANSITION FLOW - Agent Shepherd
═══════════════════════════════════════

                            ┌──────────────────────────────────┐
                            │         BEADS ISSUE POOL         │
                            │  (Status: open, no blockers)    │
                            └────────────┬─────────────────────┘
                                         │
                                         ▼
                            ┌──────────────────────────────────┐
                            │      ISSUE PICKER MODE          │
                            │  • Simple: Priority-based       │
                            │  • Smart: Dependency-aware      │
                            │           + Epic affinity       │
                            │           + Coordination checks │
                            └────────────┬─────────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
         ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
         │  SIMPLE PICKER     │  │  SMART PICKER      │  │  COORDINATION     │
         │  • Priority sort   │  │  • Build dep graph │  │  • Check lease    │
         │  • No dep checks   │  │  • Topological sort│  │  • Check heartbeat│
         │                    │  │  • Epic affinity   │  │  • assigned_worker│
         └─────────┬──────────┘  └─────────┬──────────┘  └─────────┬──────────┘
                   │                       │                       │
                   └───────────────────────┼───────────────────────┘
                                           │
                                           ▼
                            ┌──────────────────────────────────┐
                            │       ELIGIBLE ISSUES          │
                            │  • Excluded label check        │
                            │  • Ready issues from Beads     │
                            │  • No coordination conflicts   │
                            └────────────┬─────────────────────┘
                                         │
                                         ▼
                            ┌──────────────────────────────────┐
                            │      PHASE DETECTION          │
                            │  • Check ashep-phase:<phase>   │
                            │  • Resume or start first?      │
                            └────────────┬─────────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
         ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
         │  POLICY MATCHING   │  │  POLICY MATCHING   │  │  POLICY MATCHING   │
         │  (Explicit Label) │  │  (Issue Type)     │  │  (Default)        │
         │  ashep-workflow:  │  │  Highest priority │  │  fallback         │
         └─────────┬──────────┘  └─────────┬──────────┘  └─────────┬──────────┘
                   │                       │                       │
                   └───────────────────────┼───────────────────────┘
                                           │
                                           ▼
                            ┌──────────────────────────────────┐
                            │        PHASE CONFIG            │
                            │  • capabilities []            │
                            │  • timeout_multiplier         │
                            │  • require_approval          │
                            │  • max_visits                │
                            │  • transitions (optional)     │
                            └────────────┬─────────────────────┘
                                         │
                                         ▼
                            ┌──────────────────────────────────┐
                            │      AGENT SELECTION            │
                            │  • Filter active agents         │
                            │  • Match capabilities          │
                            │  • Sort by priority           │
                            │  • Apply constraints           │
                            │  • Fallback cascading (5 levels):│
                            │    1. Phase level              │
                            │    2. Policy mapping           │
                            │    3. Policy default           │
                            │    4. Config mapping           │
                            │    5. Config default           │
                            └────────────┬─────────────────────┘
                                         │
                                     ▼
                            ┌──────────────────────────────────┐
                            │    CREATE RUN LOG RECORD         │
                            │  (logger.createRun())           │
                            │  • runs.jsonl (append-only)    │
                            │  • runs.db (indexed cache)     │
                            │  • status: pending            │
                            │  • attempt_number              │
                            │  • retry_count                 │
                            │  • phase_total_duration_ms     │
                            └────────────┬─────────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
         ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
         │  DECISION LOG      │  │  ISSUE → IN_PROG  │  │ RECEIVE MESSAGES  │
         │  (decisions.jsonl)│  │  • Beads status   │  │  (Phase Messenger)│
         │  • agent_selection│  │  • assigned_worker│  │  • Pending msgs   │
         │                    │  │  • session_id     │  │                   │
         └────────────────────┘  └────────────────────┘  └─────────┬──────────┘
                                                                 │
                                                                 ▼
                            ┌──────────────────────────────────┐
                            │     MODEL RESOLUTION            │
                            │  Priority:                     │
                            │  1. Phase-level override       │
                            │  2. Agent-level config         │
                            │  3. OpenCode agent default     │
                            └────────────┬─────────────────────┘
                                         │
                                         ▼
                            ┌──────────────────────────────────┐
                            │       AGENT EXECUTION           │
                            │  • OpenCode CLI                │
                            │  • Phase instructions           │
                            │  • Wall-clock timing           │
                            │  • Session tracking            │
                            └────────────┬─────────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
         ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
         │  MONITOR ENGINE   │  │  REPOSITORY       │  │  TIMEOUT CHECK    │
         │  • SDK heartbeat  │  │  CHANGES          │  │  • Policy timeout │
         │    polling        │  │  • Files created  │  │  • Phase multiplier│
         │  • Liveness       │  │  • Code modified  │  │  • Wall-clock     │
         │    broadcast      │  │                   │  │                   │
         │  • Crash detect   │  │                   │  │                   │
         │  • Stall detect   │  │                   │  │                   │
         │  • HITL detect    │  │                   │  │                   │
         └────────────────────┘  └────────────────────┘  └─────────┬──────────┘
                                                                     │
                            ┌────────────────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────────────┐
            │        OUTCOME PROCESSING            │
            │  • Parse RunOutcome                 │
            │  • Success/failure                  │
            │  • requires_approval?              │
            │  • result_type? (enhanced)         │
            │    - success                        │
            │    - failure                        │
            │    - partial_success (NEW)          │
            │    - unclear (NEW)                  │
            └─────────────┬─────────────────────┘
                          │
                    ┌─────┴─────┐
                    │  Worker   │
                    │ Assistant │
                    │ Triggered?│
                    └─────┬─────┘
              ┌──────────┼──────────┐
              │ YES                 │ NO
              ▼                     │
  ┌──────────────────┐              │
  │ WORKER ASSISTANT │              │
  │ • AI analysis    │              │
  │ • Context review │              │
  │ • Directive:     │              │
  │   ADVANCE/RETRY/ │              │
  │   BLOCK          │              │
  └─────────┬────────┘              │
            │                       │
            └───────────────────────┘
                          │
                    ┌─────┴─────┐
                    │  Custom   │
                    │ Transitions│
                    │   Block?  │
                    └─────┬─────┘
              ┌──────────┼──────────┐
              │ YES                 │ NO
              ▼                    │
  ┌──────────────────┐              │
  │ TRANSITION LOOKUP│              │
  │ • on_success     │              │
  │ • on_failure     │              │
  │ • on_partial_   │              │
  │   success (NEW)  │              │
  │ • on_unclear     │              │
  │   (NEW)          │              │
  └─────────┬────────┘              │
            │                       │
    ┌───────┴───────┐               │
    │               │               │
    ▼               ▼               │
 STRING         OBJECT              │
 (Direct)      (AI Routing)        │
    │               │               │
    │           ┌───┴────┐         │
    │           │        │         │
    │           ▼        │         │
    │    ┌──────────┐   │         │
    │    │DYNAMIC   │   │         │
    │    │DECISION  │   │         │
    │    │AGENT     │   │         │
    │    └────┬────┘   │         │
    │         │        │         │
    │         └────────┴─────────┘
    │                  │
    │                  ▼
    │    ┌───────────────────────────┐
    │    │   LOOP PREVENTION         │
    │    │  • Phase visit limits     │
    │    │  • Transition limits      │
    │    │  • Cycle detection        │
    │    │    (oscillating patterns) │
    │    └───────────┬───────────────┘
    │                │
    │                ▼
    │    ┌───────────────────────────────┐
    │    │     TRANSITION LOGIC         │
    │    │  determineTransition()       │
    │    └───────────┬─────────────────┘
    │                │
    ▼                │
┌─────────────────┐  │
│ RUN STATUS      │  │
│ UPDATE         │  │
│ • completed    │  │
│   /failed      │  │
│ • completed_at │  │
│ • outcome      │  │
└───────┬─────────┘  │
        │            │
        └────────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │  6 TRANSITION TYPES  │
          └──────────┬───────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
    ▼                ▼                ▼
┌──────────┐   ┌──────────┐   ┌──────────┐
│ ADVANCE   │   │  RETRY   │   │  BLOCK   │
│          │   │          │   │          │
│ • Next   │   │ • Same   │   │ • HITL   │
│   phase  │   │   phase  │   │   label  │
│ • Clear  │   │ • Clear  │   │ • Status │
│   HITL   │   │   HITL   │   │   blocked│
│ • Status │   │ • Status │   │ • Note   │
│   open   │   │   open   │   │          │
└─────┬────┘   └─────┬────┘   └─────┬────┘
      │              │              │
      └──────────────┼──────────────┘
                     │
      ┌──────────────┼──────────────┐
      │              │              │
      ▼              ▼              ▼
┌──────────┐   ┌──────────┐   ┌──────────┐
│ JUMP_BACK│   │  CLOSE   │   │ DYNAMIC  │
│          │   │          │   │DECISION  │
│ • Jump to│   │ • Final  │   │ (AI-made)│
│   earlier│   │   phase  │   │ • Action │
│   phase  │   │ • Remove │   │ • Phase  │
│ • Enables│   │   labels │   │   target│
│   rework │   │ • Status │   │ • Reason │
│ • Clear  │   │   closed │   │ • jump_to│
│   HITL   │   │          │   │   =back  │
│ • Status │   │          │   │ • advance│
│   open   │   │          │   │   _to=   │
│ • Target │   │          │   │   advance│
│   must   │   │          │   └─────┬────┘
│   exist  │   │          │         │
└──────────┘   └──────────┘         │
                              ┌───────┴────────┐
                              │                │
                              ▼                ▼
                        ┌──────────┐    ┌──────────┐
                        │ ADVANCE  │    │  BLOCK   │
                        │          │    │          │
                        │ • Follow │    │ • HITL   │
                        │   AI     │    │   label │
                        │   route │    │ • Status │
                        │          │    │   blocked│
                        └──────────┘    └──────────┘
                                    │
                                    │ (Optional)
                                    ▼
                      ┌──────────────────────────┐
                      │   SEND RESULT MESSAGE    │
                      │   (Phase Messenger)     │
                      │  • From: current_phase   │
                      │  • To: next_phase        │
                      │  • Type: result         │
                      │  • Content, metadata    │
                      └───────────┬────────────┘
                                  │
                                  ▼
                      ┌──────────────────────────┐
                      │   DECISION LOG UPDATE    │
                      │  • phase_transition      │
                      │  • reasoning             │
                      │  • from_phase, to_phase  │
                      │  • metadata              │
                      └──────────────────────────┘


BACKGROUND SYSTEMS
═════════════════════════════════════════════════════════════════

┌────────────────────────────────────────────────────────────────┐
│                   MONITOR ENGINE (Background)                  │
│  • Polls for running runs every N seconds                    │
│  • SDK heartbeat monitoring:                                 │
│    - Queries OpenCode SDK for session activity              │
│    - Identifies stale heartbeats (no activity threshold)     │
│    - Works independently of lease-based coordination         │
│  • Liveness broadcasting:                                    │
│    - Updates last_heartbeat in Beads state for healthy runs  │
│    - Enables other workers to see active work               │
│  • Detects stalls (no activity)                              │
│  • Detects timeouts (exceeds policy timeout)                  │
│  • Detects HITL requirements                                 │
│  • Handles human takeover detection                           │
│  • Updates Beads issue status on events                       │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│              HEARTBEAT CHECKER (Background Daemon)             │
│  • Runs independently from monitor engine                     │
│  • Polls OpenCode SDK for session heartbeats                 │
│  • Configurable poll interval (default: 30s)                 │
│  • Stale threshold for crash detection (default: 5 min)      │
│  • Updates Beads coordination state:                          │
│    - last_heartbeat timestamp                                 │
│    - session liveness indicator                              │
│  • Enables heartbeat and hybrid coordination modes           │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│              CRASH DETECTOR (Background Service)               │
│  • Identifies abandoned sessions based on:                    │
│    - Stale heartbeats (SDK-based)                            │
│    - Expired leases (time-based)                             │
│    - Hybrid: combination of both                             │
│  • Automatic recovery workflow:                              │
│    1. Detect abandoned session (heartbeat or lease)          │
│    2. Clear coordination state (assigned_worker, session_id)  │
│    3. Set issue status to open (re-queue for pickup)         │
│    4. Log crash event for analytics                          │
│  • Configurable detection thresholds                          │
│  • Works with all coordination modes (lease/heartbeat/hybrid) │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                 GARBAGE COLLECTOR (Scheduled)                  │
│  • Archive old runs based on retention policies               │
│  • Delete ancient data from archive                          │
│  • Enforce size limits (max_runs, max_size_mb)               │
│  • Dual storage:                                             │
│    - runs.db (main, indexed cache)                            │
│    - archive.db (archived data)                               │
│    - runs.jsonl / archive.jsonl (append-only source of truth) │
│  • Tracks cleanup metrics                                    │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│               PHASE MESSENGER (Inter-Phase Comm)             │
│  • Sends messages between phases (context, result, decision) │
│  • Pending messages queue per issue/phase                     │
│  • Size limits:                                             │
│    - max_messages_per_issue_phase                             │
│    - max_messages_per_issue                                  │
│  • Cleanup: archive and delete old messages                  │
│  • Dual storage:                                             │
│    - messages.db (indexed cache)                              │
│    - messages.jsonl (append-only)                            │
│  • Optional plugin (disabled if not available)               │
└────────────────────────────────────────────────────────────────┘


STATE CHANGES SUMMARY
═════════════════════════════════════════════════════════════════

BEADS ISSUE:
──────────────────────────────────────────────────────────────────
Status Changes:
  • open → in_progress (when agent starts)
  • in_progress → open (on advance, retry, jump_back)
  • in_progress → blocked (on block, timeout, stall)
  • in_progress → closed (on close)

Label Changes:
  • ashep-phase:<old> → ashep-phase:<new> (phase transitions)
  • ashep-hitl:<reason> added (HITL required)
  • ashep-hitl:<reason> cleared (advance, retry, jump_back)
  • All tracking labels removed (on close)

Coordination State (Beads state):
  • assigned_worker: Worker ID owning this epic/issue
  • session_id: Active OpenCode session ID
  • lease_expires_at: Lease expiration timestamp
  • last_heartbeat: SDK-reported heartbeat timestamp

Notes:
  • HITL notifications added when blocked


LOGGER (runs.jsonl / runs.db):
──────────────────────────────────────────────────────────────────
Run Status:
  • pending → running → completed / failed / blocked

Run Fields:
  • id, issue_id, session_id, agent_id
  • policy_name, phase
  • status (pending/running/completed/failed/blocked)
  • created_at, updated_at, completed_at
  • outcome (success, message, error, metrics)
  • metadata:
    - attempt_number, retry_count
    - phase_total_duration_ms
    - session_id


LOGGER (decisions.jsonl):
──────────────────────────────────────────────────────────────────
Decision Types:
  • agent_selection
  • message_receipt
  • message_send
  • phase_transition
  • timeout
  • dynamic_decision

Decision Fields:
  • id, run_id, timestamp
  • type, decision, reasoning
  • metadata (structured context)


PHASE MESSENGER (messages.jsonl / messages.db):
──────────────────────────────────────────────────────────────────
Message Flow:
  • Created: sendMessage() after phase completes
  • Received: receiveMessages() before phase starts
  • Types: context, result, decision, data

Message Fields:
  • id, issue_id, from_phase, to_phase
  • run_counter, message_type
  • content, metadata
  • read, created_at, read_at


REPOSITORY:
──────────────────────────────────────────────────────────────────
Changes by Phase:
  • Files created, modified, deleted
  • Changes visible to next phase agents
  • Work directory preserved across phases


ENHANCED FEATURES DETAIL
═════════════════════════════════════════════════════════════════

1. LOOP PREVENTION
──────────────────────────────────────────────────────────────────
Phase Visit Limits:
  • max_visits per phase (default: 10)
  • Checked before transition
  • Blocks if exceeded

Transition Limits:
  • max_transitions for A→B pattern (default: 5)
  • Tracks specific phase transitions
  • Blocks if exceeded

Cycle Detection:
  • Detects oscillating patterns (e.g., A→B→A→B)
  • Configurable detection length (default: 3)
  • Blocks if cycle detected


2. DYNAMIC DECISION AGENTS
──────────────────────────────────────────────────────────────────
When Triggered:
  • Custom transitions block defines AI routing
  • Example: on_failure with capability + prompt

How It Works:
  1. Decision agent builds prompt from:
     - Issue data
     - Previous outcome
     - Current phase
     - Allowed destinations
     - Recent decisions
     - Phase history
     - Performance context
  2. Agent responds with:
     - action: jump_to_X / advance_to_X / require_approval
     - reasoning
     - confidence (0.0-1.0)
     - recommendations (optional)
  3. Confidence thresholds determine:
     - Auto-advance (≥ auto_advance, e.g., 0.8)
     - Require approval (< require_approval, e.g., 0.6)

Retry Logic:
  • Up to 2 retries if parsing fails
  • Escalates to HITL if all retries fail


3. POLICY MATCHING (Priority Order)
──────────────────────────────────────────────────────────────────
1. Explicit workflow label (ashep-workflow:<name>)
   • Highest priority
   • Must match existing policy
   • Invalid label strategy: error | warning | ignore

2. Issue type matching
   • Policy.issue_types includes issue.issue_type
   • Multiple policies may match
   • Ties broken by:
     - policy.priority (higher wins)
     - Config order (earlier wins)

3. Default policy
   • Fallback if no match found
   • Configurable default_policy name


4. TRANSITION TYPES
──────────────────────────────────────────────────────────────────
ADVANCE:
  • Move to next phase in sequence
  • Clear HITL labels
  • Set issue status to open
  • Send result message (optional)

RETRY:
  • Retry current phase
  • Clear HITL labels
  • Set issue status to open
  • Respect retry_count < max_attempts

BLOCK:
  • Require human intervention
  • Set ashep-hitl:<reason> label
  • Set issue status to blocked
  • Generate approval note

CLOSE:
  • Issue completed
  • Remove all tracking labels
  • Set issue status to closed

JUMP_BACK:
  • Jump to earlier phase (backward jump)
  • Enables rework when issues discovered later
  • Set specific phase label (ashep-phase:<target>)
  • Clear HITL labels
  • Set issue status to open
  • Validates target phase exists in policy
  • Common use: test → implement (fix bugs)

DYNAMIC_DECISION:
  • Execute AI decision agent
  • Agent determines final action
  • Can jump backward to earlier phases
  • Allowed destinations constrain AI choices
  • Resolves to advance, jump_back, block, or close
  • Logs full decision context
  • Decision format:
    - `jump_to_X` → Converted to jump_back transition (backward)
    - `advance_to_X` → Converted to advance transition (sequential)
  • Examples:
    - test failure → jump_to_implement (rework)
    - review passed → advance_to_deploy (next in sequence)
    - unclear outcome → require_approval (human review)


5. MODEL RESOLUTION HIERARCHY
──────────────────────────────────────────────────────────────────
Priority:
  1. Phase-level override (phase.model)
     - Highest priority
     - Per-phase customization

  2. Agent-level config (agent.provider_id + agent.model_id)
     - Agent-specific override
     - Falls back to OpenCode defaults if not specified

  3. OpenCode agent default
     - Fallback if no override
     - Uses agent's default model


6. RETENTION POLICIES & GARBAGE COLLECTION
──────────────────────────────────────────────────────────────────
Archive Triggers:
  • Age-based: delete_after_days
  • Status-based: success/failure/blocked policies
  • Size limits: max_runs, max_size_mb

Archive Process:
  1. Identify eligible runs
  2. Copy to archive.db and archive.jsonl
  3. Delete from main runs.db
  4. Update JSONL files
  5. Track metrics

Delete Triggers:
  • Scheduled deletion from archive
  • Immediate deletion if disabled archiving
  • Based on retention policy rules

Cleanup Metrics:
  • runs_processed, runs_archived, runs_deleted
  • bytes_archived, bytes_deleted
  • duration_ms
  • error (if any)


7. FALLBACK AGENT CASCADING
──────────────────────────────────────────────────────────────────
Priority:
  1. Phase-level fallback (phase.fallback_agent)
     - Most specific override
     - Phase-specific alternative

  2. Policy-level mapping (policy.fallback_mappings[capability])
     - Per-policy capability fallback
     - Can map capabilities to specific agents

  3. Policy-level default (policy.fallback_agent)
     - Policy-wide fallback
     - Universal alternative for policy

  4. Config-level mapping (config.fallback.mappings[capability])
     - Global capability fallback
     - Cross-policy alternative

  5. Config-level default (config.fallback.default_agent)
     - Universal fallback
     - Last resort agent

All levels can be disabled via fallback_enabled: false


CONFIGURATION FILES
═════════════════════════════════════════════════════════════════

config/config.yaml:
──────────────────────────────────────────────────────────────────
Main Settings:
  • worker:
    - poll_interval_ms, max_concurrent_runs
    - picking:
      * mode: simple | smart
      * max_issues
      * prefer_epic_affinity
    - coordination:
      * mode: lease | heartbeat | hybrid
      * lease_duration_ms
    - checker:
      * enabled
      * poll_interval_ms
      * heartbeat_threshold_ms
      * stale_threshold_ms
  • worker_assistant:
    - enabled
    - agentCapability
    - timeoutMs
    - fallbackAction
  • monitor: poll_interval_ms, stall_threshold_ms
  • ui: port, host
  • workflow: invalid_label_strategy (error|warning|ignore)
  • hitl: allowed_reasons (predefined, allow_custom)
  • fallback: enabled, mappings, default_agent
  • loop_prevention:
    - max_visits_default
    - max_transitions_default
    - cycle_detection_enabled
    - cycle_detection_length

config/policies.yaml:
──────────────────────────────────────────────────────────────────
Policy Structure:
  policies:
    <name>:
      description: string
      issue_types: string[]
      priority: number
      require_hitl: boolean
      worker_assistant:
        enabled: boolean  # Per-policy opt-out
      phases:
        - name: string
          capabilities: string[]
          timeout_multiplier: number
          require_approval: boolean
          max_visits: number
          model: string
          fallback_agent: string
          worker_assistant:
            enabled: boolean  # Per-phase opt-out
          transitions:
            on_success: string | {capability, prompt, allowed_destinations, ...}
            on_failure: string | {capability, prompt, allowed_destinations, ...}
            on_partial_success: {capability, prompt, allowed_destinations, ...}  # NEW
            on_unclear: {capability, prompt, allowed_destinations, ...}           # NEW
      retry:
        max_attempts: number
        backoff_strategy: exponential|linear|fixed
        initial_delay_ms: number
        max_delay_ms: number
      timeout_base_ms: number
      fallback_enabled: boolean
      fallback_agent: string
      fallback_mappings: Record<capability, agent_id>

config/agents.yaml:
──────────────────────────────────────────────────────────────────
Agent Structure:
  agents:
    - id: string
      name: string
      description: string
      capabilities: string[]
      provider_id: string?         # Optional
      model_id: string?            # Optional
      priority: number
      active: boolean              # Defaults to true
      constraints:
        read_only: boolean
        max_file_size: number
        allowed_tags: string[]
        performance_tier: fast|balanced|slow

config/retention.yaml:
──────────────────────────────────────────────────────────────────
Retention Policies:
  policies:
    - name: string
      enabled: boolean
      conditions:
        status: success|failure|blocked
        min_age_days: number
      actions:
        archive: boolean
        archive_enabled: boolean
        delete_after_days: number?
      limits:
        max_runs: number?
        max_size_mb: number?

config/phase-messenger.yaml:
──────────────────────────────────────────────────────────────────
Messenger Config:
  size_limits:
    max_content_length: number
    max_metadata_length: number
    max_messages_per_issue_phase: number
    max_messages_per_issue: number
  cleanup:
    default_max_age_days: number
    keep_last_n_per_phase: number
    keep_last_n_runs: number

config/decision-prompts.yaml:
──────────────────────────────────────────────────────────────────
Decision Templates:
  version: string
  templates:
    <capability>:
      name: string
      description: string
      system_prompt: string
      prompt_template: string  # Variables: {{issue.*}}, {{outcome.*}}, etc.
  default_template: string


LABEL CONVENTIONS
═════════════════════════════════════════════════════════════════

System-Managed Labels:
  • ashep-phase:<phase-name> - Current workflow phase
  • ashep-hitl:<reason> - Human-in-the-loop state

User-Managed Labels:
  • ashep-workflow:<name> - Explicit workflow assignment (highest priority)
  • ashep-excluded - Exclude issue from processing

Label Priority for Policy Matching:
  1. ashep-workflow:<name> (explicit assignment)
  2. issue_type matching (policy.issue_types)
  3. Default policy fallback


KEY WORKFLOW FUNCTIONS
═════════════════════════════════════════════════════════════════

WorkerEngine.processIssue() - Main orchestration
  1. Pick issue (simple or smart mode)
  2. Check coordination state (lease/heartbeat)
  3. Match policy to issue
  4. Detect/resume current phase
  5. Select agent (with fallback)
  6. Create run record
  7. Update issue to in_progress
  8. Update coordination state (assigned_worker, session_id, lease)
  9. Receive pending messages (optional)
  10. Launch agent via OpenCode CLI
  11. Process outcome
  12. Worker assistant (if triggered)
  13. Determine transition
  14. Apply transition
  15. Send result message (optional)
  16. Clear coordination state (if advancing/completing)

PolicyEngine.determineTransition() - Transition logic
  • Validate phase limits (max_visits)
  • Check custom transitions block
  • Apply loop prevention (phase visits, transition limits, cycles)
  • Handle success/failure/partial_success/unclear outcomes
  • Respect retry_count and max_attempts

MonitorEngine.monitorRun() - Background supervision
  • SDK heartbeat monitoring (query session activity)
  • Liveness broadcasting (update last_heartbeat in Beads)
  • Detect stalls (no activity within threshold)
  • Detect timeouts (exceed policy timeout)
  • Detect HITL requirements
  • Handle human takeover detection

IssuePicker.pickIssues() - Issue selection
  • Simple mode: Priority-based selection
  • Smart mode:
    1. Build dependency graph from Beads
    2. Topological sort respecting dependencies
    3. Filter by epic affinity (maintain worker ownership)
    4. Check coordination state (lease/heartbeat)
    5. Return eligible issues without conflicts

HeartbeatChecker.checkHeartbeats() - Session monitoring
  • Poll OpenCode SDK for session heartbeats
  • Update Beads state with last_heartbeat timestamp
  • Identify stale sessions (exceeds threshold)
  • Enable heartbeat and hybrid coordination modes

CrashDetector.detectCrashes() - Abandonment detection
  • Detect abandoned sessions:
    - Stale heartbeats (SDK-based)
    - Expired leases (time-based)
    - Hybrid: combination of both
  • Automatic recovery:
    1. Clear coordination state
    2. Set issue to open (re-queue)
    3. Log crash event

GarbageCollector.runFullCleanup() - Data lifecycle
  • Archive old runs (age-based, status-based)
  • Delete ancient data from archive
  • Enforce size limits (runs count, storage size)

PhaseMessenger.sendMessage() - Inter-phase communication
  • Validate message size and metadata
  • Enforce per-issue/per-phase limits
  • Append to JSONL and SQLite
  • Return message with ID

PhaseMessenger.receiveMessages() - Message retrieval
  • Query pending messages for issue/phase
  • Mark as read (optional)
  • Return message array


VALIDATION RULES
═════════════════════════════════════════════════════════════════

Policy Validation:
  • Must have at least one phase
  • Phase names must be unique within policy
  • Transition destinations must be valid phases or "close"
  • on_partial_success and on_unclear must be objects (not strings)
  • Confidence thresholds must be 0.0-1.0

Agent Selection Validation:
  • All capabilities must be matched
  • Agents must be active (active !== false)
  • Respects constraints (read_only, performance_tier, allowed_tags)
  • Fallback cascades through all levels before failing

Decision Validation:
  • Must have decision, reasoning, confidence fields
  • Confidence must be 0.0-1.0
  • Decision action must be valid format
  • Target phase must be in allowed_destinations
  • Parses JSON with sanitization

HITL Validation:
  • Reason must be in predefined list OR
  • Must match custom_validation pattern:
    - none: any string allowed
    - alphanumeric: [a-z0-9]+ only
    - alphanumeric-dash-underscore: [a-z][a-z0-9_-]* only


MULTI-WORKER COORDINATION
═════════════════════════════════════════════════════════════════

COORDINATION MODES
──────────────────────────────────────────────────────────────────
1. Lease Mode (Time-based):
  • Worker claims epic with time-based lease
  • Lease stored in Beads state: lease_expires_at
  • Other workers skip issues with active leases
  • Auto-recovery when lease expires
  • Works offline (no SDK required)

2. Heartbeat Mode (SDK-based):
  • Heartbeat checker polls OpenCode SDK
  • Updates last_heartbeat in Beads state
  • Crash detector identifies stale sessions
  • Requires SDK access and session ID
  • More accurate crash detection

3. Hybrid Mode (Recommended):
  • Combines lease + heartbeat
  • Lease prevents immediate conflicts
  • Heartbeat enables fast crash detection
  • Best of both approaches

COORDINATION STATE (Beads)
──────────────────────────────────────────────────────────────────
Fields stored in Beads issue state:
  • assigned_worker: Worker ID that owns epic/issue
  • session_id: Active OpenCode session ID
  • lease_expires_at: Lease expiration timestamp (ISO 8601)
  • last_heartbeat: SDK-reported heartbeat (ISO 8601)

Lifecycle:
  1. Issue picked → Set assigned_worker, session_id, lease
  2. Monitor runs → Update last_heartbeat periodically
  3. Phase completes → Clear state (or keep for next phase)
  4. Crash detected → Clear state, re-queue issue
  5. Worker shutdown → Leases expire naturally

SMART ISSUE PICKING
──────────────────────────────────────────────────────────────────
Dependency-Aware Selection:
  1. Query Beads for ready issues (open, no blockers)
  2. Build dependency graph from issue relationships
  3. Topological sort to respect dependencies
  4. Filter by epic affinity:
     - If worker owns epic → prefer its subtasks
     - If epic owned by other → skip its subtasks
     - If epic unowned → can claim
  5. Check coordination state:
     - Skip if assigned_worker != this worker
     - Skip if lease active and not expired
     - Skip if heartbeat recent (< threshold)
  6. Return eligible issues

Epic Affinity Rules:
  • Workers maintain ownership of epic subtrees
  • Prevents multiple workers splitting epics
  • Enables focused, coherent work
  • Reduces context switching

CRASH DETECTION & RECOVERY
──────────────────────────────────────────────────────────────────
Detection Methods:
  1. Heartbeat-based:
     - last_heartbeat older than threshold (default: 5 min)
     - SDK reports session inactive/completed
     - Crash detector identifies stale session

  2. Lease-based:
     - lease_expires_at in the past
     - No heartbeat updates before expiry
     - Crash detector clears expired lease

  3. Hybrid (both):
     - Checks both heartbeat AND lease
     - Faster detection (uses best signal)
     - Most robust approach

Recovery Workflow:
  1. Crash detector identifies abandoned session
  2. Clear coordination state:
     - assigned_worker → null
     - session_id → null
     - lease_expires_at → null
     - last_heartbeat → null
  3. Set issue status → open (re-queue)
  4. Log crash event with metadata
  5. Issue becomes available for next worker

WORKER ASSISTANT SYSTEM
═════════════════════════════════════════════════════════════════

TRIGGER CONDITIONS
──────────────────────────────────────────────────────────────────
Worker assistant AI analyzes outcome when:
  • Successful outcome WITH warnings
  • Successful outcome WITH many artifacts (>5)
  • Message contains keywords:
    - "unclear", "partial", "ambiguous", "review"
  • Failed outcome WITH structured error details
  • Failed outcome WITH timeout/incomplete keywords

DIRECTIVE TYPES
──────────────────────────────────────────────────────────────────
ADVANCE:
  • Minor issues, acceptable to proceed
  • Move to next phase
  • Clear HITL labels

RETRY:
  • Fixable issues, worth retrying
  • Retry current phase
  • Respect max_attempts limit

BLOCK:
  • Complex problems, unclear state
  • Require human review
  • Add ashep-hitl:worker-assistant label

WORKFLOW
──────────────────────────────────────────────────────────────────
1. Agent completes phase (outcome received)
2. Deterministic logic checks:
   - Clear success → ADVANCE
   - Clear failure → RETRY or BLOCK
3. If ambiguous → Trigger worker assistant:
   a. Build context (issue, outcome, phase, errors)
   b. Call AI agent with worker-assistant capability
   c. Parse directive (ADVANCE/RETRY/BLOCK)
   d. Log decision with reasoning
4. Convert directive to transition
5. Apply transition (advance/retry/block)

CONFIGURATION
──────────────────────────────────────────────────────────────────
Global (config.yaml):
  worker_assistant:
    enabled: true
    agentCapability: worker-assistant
    timeoutMs: 10000
    fallbackAction: block

Per-Policy Opt-Out (policies.yaml):
  policies:
    my-policy:
      worker_assistant:
        enabled: false  # Disable for entire policy

Per-Phase Opt-Out (policies.yaml):
  phases:
    - name: implement
      worker_assistant:
        enabled: false  # Disable for specific phase

BENEFITS
──────────────────────────────────────────────────────────────────
  • Handles ambiguous agent outputs
  • Keeps deterministic logic simple
  • Only triggered for uncertain cases (<5% of runs)
  • Graceful degradation (fallback if unavailable)
  • Full observability (all decisions logged)


PHASE JUMPING SYSTEM
═════════════════════════════════════════════════════════════════

OVERVIEW
──────────────────────────────────────────────────────────────────
Phase jumping allows workflows to move backward to earlier phases for rework, enabling:
  • Backward jumps for rework (test → implement)
  • AI-driven routing decisions
  • Flexible error recovery
  • Iterative fix-test loops

**NOTE**: The current implementation supports **backward jumping only**. There is no forward 
jumping/phase skipping feature. The `advance_to_X` decision format results in a sequential 
`advance` transition, not a skip.

JUMP TYPES
──────────────────────────────────────────────────────────────────

1. String Transitions (Static Jumps):
   • Configured in policy transitions
   • Direct jump to earlier phase
   • Examples:
     - on_failure: "implement"  # Jump back to implement on failure

2. JUMP_BACK Transition (Explicit Backward Jump):
   • Explicit backward jump transition type
   • Target phase specified in transition
   • Common for error recovery workflows
   • Example use:
     - Test phase fails → JUMP_BACK to implement
     - Review finds issues → JUMP_BACK to refactor

3. Dynamic Decision Jumps (AI-Driven):
   • AI agent selects target phase
   • Constrained by allowed_destinations
   • Decision format determines transition type:
     - `jump_to_<phase>` → Converted to `jump_back` transition (backward jump)
     - `advance_to_<phase>` → Converted to `advance` transition (sequential, not a skip)
   • Examples:
     - "jump_to_implement" (backward to implement)
     - "advance_to_test" (advance to next phase in sequence)

CONFIGURATION EXAMPLES
──────────────────────────────────────────────────────────────────

Static String Jump (policies.yaml):
  phases:
    - name: test
      transitions:
        on_failure: "implement"  # Always jump back on failure

AI-Driven Jump (policies.yaml):
  phases:
    - name: test
      transitions:
        on_failure:
          capability: test-analyzer
          prompt: "Analyze test failure and route"
          allowed_destinations:
            - implement  # Can jump back to fix
            - refactor   # Or jump back to refactor
            - close      # Or give up

**NOTE**: AI can only select from allowed_destinations. Both `jump_to_implement` 
and `advance_to_implement` would result in transitions to the implement phase, 
but `jump_to_` results in a `jump_back` transition type while `advance_to_` 
results in an `advance` transition type.

VALIDATION RULES
──────────────────────────────────────────────────────────────────
Jump Target Validation:
  • Target phase MUST exist in policy phases list
  • For AI decisions: Target MUST be in allowed_destinations
  • Cannot jump to current phase (use RETRY instead)
  • Jump is subject to loop prevention:
    - Phase visit limits apply
    - Transition limits apply
    - Cycle detection applies

LOOP PREVENTION WITH JUMPS
──────────────────────────────────────────────────────────────────
Phase Visit Limits:
  • Each phase has max_visits limit (default: 10)
  • Jumping to a phase counts as a visit
  • Example: test → implement → test → implement
    - After 5 round-trips, test phase visit limit may block

Transition Limits:
  • Specific jump pairs have limits (default: 5)
  • Example: test→implement limited to 5 times
  • Prevents infinite fix-test loops

Cycle Detection:
  • Detects oscillating patterns
  • Example: A→B→A→B (detected after 3 cycles)
  • Blocks jump if pattern detected

COMMON JUMP PATTERNS
──────────────────────────────────────────────────────────────────

1. Fix-Test Loop (Backward Jump):
   implement → test → implement (on failure) → test → ...
   • Limited by transition count (e.g., 5 max)
   • Escalates to HITL when limit reached

2. Multi-Stage Rework (Backward Jumps):
   deploy → test (issue found) → implement (fix) → test → review → deploy
   • Multiple backward jumps allowed
   • Loop prevention ensures bounded behavior

3. Quality Gate Routing (AI Jump):
   test → (analyze) → implement (major issues)
              └─────→ refactor (minor issues)
              └─────→ close (critical failures)
   • AI analyzes test results
   • Routes backward to appropriate earlier phase

BEADS STATE DURING JUMPS
──────────────────────────────────────────────────────────────────
Phase Label Updates:
  • Current: ashep-phase:test
  • After jump: ashep-phase:implement
  • Phase history tracked in run logs

Issue Status:
  • Remains in_progress during jump execution
  • Returns to open after jump completes
  • Status: blocked if HITL escalation triggered

Coordination State:
  • assigned_worker maintained (same worker continues)
  • session_id cleared if new phase starts new session
  • Lease renewed for next phase

ANALYTICS & OBSERVABILITY
──────────────────────────────────────────────────────────────────
Jump Tracking:
  • All jumps logged in decisions.jsonl
  • Metadata includes:
    - from_phase
    - to_phase
    - jump_type (static, jump_back, dynamic)
    - reasoning (for AI jumps)
  • Phase history in run metadata

Jump Metrics:
  • Jump frequency per phase pair
  • Loop prevention blocks (by type)
  • Average jumps per issue
  • Jump success rate (completion after jump)




TRANSITION DECISION MATRIX
═════════════════════════════════════════════════════════════════

┌───────────────────┬──────────────┬─────────────┬───────────────┬────────────┐
│ Outcome           │ Custom       │ Retry Count │ Approval Req?  │ Transition│
│                   │ Transition?  │ < Max?     │               │           │
├───────────────────┼──────────────┼─────────────┼───────────────┼────────────┤
│ Success           │ No           │ N/A         │ No            │ Advance    │
│ Success           │ No           │ N/A         │ Yes           │ Block      │
│ Success           │ Yes (string) │ N/A         │ N/A           │ Jump to X  │
│ Success           │ Yes (object)  │ N/A         │ N/A           │ Dynamic    │
│ Failure           │ No           │ Yes         │ No            │ Retry      │
│ Failure           │ No           │ Yes         │ Yes           │ Block      │
│ Failure           │ No           │ No          │ N/A           │ Block      │
│ Failure           │ Yes (string) │ N/A         │ N/A           │ Jump to X  │
│ Failure           │ Yes (object)  │ N/A         │ N/A           │ Dynamic    │
│ Partial_success   │ N/A          │ N/A         │ N/A           │ Dynamic*   │
│ Unclear           │ N/A          │ N/A         │ N/A           │ Dynamic*   │
│ Timeout           │ No           │ N/A         │ N/A           │ Retry      │
│ Stall             │ No           │ N/A         │ N/A           │ Retry      │
└───────────────────┴──────────────┴─────────────┴───────────────┴────────────┘

* Partial_success and unclear outcomes MUST have object-based custom transitions
