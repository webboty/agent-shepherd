# PHASE TRANSITION FLOW - Agent Shepherd
═══════════════════════════════════════

                            ┌──────────────────────────────────┐
                            │         BEADS ISSUE POOL         │
                            │  (Status: open, no blockers)    │
                            └────────────┬─────────────────────┘
                                         │
                                         ▼
                            ┌──────────────────────────────────┐
                            │       ELIGIBLE ISSUES          │
                            │  • Excluded label check        │
                            │  • Ready issues from Beads     │
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
         │  • agent_selection│  │  • Ready for work │  │  • Pending msgs   │
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
         │  • Polling loop   │  │  CHANGES          │  │  • Policy timeout │
         │  • Stall detect   │  │  • Files created  │  │  • Phase multiplier│
         │  • HITL detect    │  │  • Code modified  │  │  • Wall-clock     │
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
│ • Target │   │ • Final  │   │ (AI-made)│
│   phase  │   │   phase  │   │ • Action │
│ • Clear  │   │ • Remove │   │ • Phase  │
│   HITL   │   │   labels │   │   target│
│ • Status │   │ • Status │   │ • Reason │
│   open   │   │   closed │   └─────┬────┘
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
│  • Detects stalls (no activity)                              │
│  • Detects timeouts (exceeds policy timeout)                  │
│  • Detects HITL requirements                                 │
│  • Handles human takeover detection                           │
│  • Updates Beads issue status on events                       │
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
  • Jump to earlier phase
  • Set specific phase label
  • Clear HITL labels
  • Set issue status to open
  • Validates target exists

DYNAMIC_DECISION:
  • Execute AI decision agent
  • Agent determines final action
  • Resolves to advance, block, or close
  • Logs full decision context


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
  • worker: poll_interval_ms, max_concurrent_runs
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
      phases:
        - name: string
          capabilities: string[]
          timeout_multiplier: number
          require_approval: boolean
          max_visits: number
          model: string
          fallback_agent: string
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
  1. Match policy to issue
  2. Detect/resume current phase
  3. Select agent (with fallback)
  4. Create run record
  5. Update issue to in_progress
  6. Receive pending messages (optional)
  7. Launch agent via OpenCode CLI
  8. Process outcome
  9. Determine transition
  10. Apply transition
  11. Send result message (optional)

PolicyEngine.determineTransition() - Transition logic
  • Validate phase limits (max_visits)
  • Check custom transitions block
  • Apply loop prevention (phase visits, transition limits, cycles)
  • Handle success/failure/partial_success/unclear outcomes
  • Respect retry_count and max_attempts

MonitorEngine.monitorRun() - Background supervision
  • Detect stalls (no activity within threshold)
  • Detect timeouts (exceed policy timeout)
  • Detect HITL requirements
  • Handle human takeover detection

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
