/**
 * Worker Engine
 * Handles autonomous issue processing, agent selection, and run execution
 */

import {
  updateIssue,
  type BeadsIssue,
  setPhaseLabel,
  removePhaseLabels,
  setHITLLabel,
  clearHITLLabels,
  getCurrentPhase,
  getIssue,
  setAshepManagedLabel,
  removeAshepManagedLabel,
  hasAshepManagedLabel,
  setContainerValidationLabel,
  clearContainerValidationLabels,
} from "./beads.ts";
import { getIssuePicker, type PickerConfig } from "./issue-picker.ts";
import { getOpenCodeClient } from "./opencode.ts";
import { loadConfig, type ContainerHandlingMode, type LevelPolicy } from "./config";
import {
  getPolicyEngine,
  validateHITLReason,
  type PhaseTransition,
  type PolicyConfig,
  type PhaseConfig,
} from "./policy.ts";
import { getAgentRegistry } from "./agent-registry.ts";
import { getLogger, type RunOutcome } from "./logging.ts";
import type { CrashDetectionConfig } from "./crash-detector";

export interface WorkerConfig {
  poll_interval_ms?: number;
  max_concurrent_runs?: number;
  worker_id?: string;
  picking?: {
    mode?: "simple" | "smart";
    max_issues?: number;
    prefer_epic_affinity?: boolean;
  };
  crash_detection?: CrashDetectionConfig;
}

export interface ProcessResult {
  issue_id: string;
  run_id: string;
  success: boolean;
  message?: string;
  next_phase?: string;
  container_validation?: {
    outcome: "DONE" | "NEEDS_WORK" | "UNCLEAR";
    confidence: number;
    reasoning: string;
  };
}

/**
 * Worker Engine for autonomous issue processing
 */
export class WorkerEngine {
  private config: WorkerConfig;
  private policyEngine = getPolicyEngine();
  private agentRegistry = getAgentRegistry();
  private opencode: any; // Type will be resolved in constructor
  private logger = getLogger(process.env.ASHEP_DIR);
  private isRunning = false;
  private currentRunId: string | null = null;
  private currentPhase: string | null = null;
  private workerId: string;

  constructor(config?: WorkerConfig) {
    const systemConfig = loadConfig();
    const workerConfig = systemConfig.worker || {};
    
    // Initialize OpenCode client with config
    const sdkUrl = systemConfig.execution?.sdk_base_url || process.env.OPENCODE_URL || 'http://localhost:4321';
    console.log(`Initializing Worker with OpenCode URL: ${sdkUrl}`);
    
    this.opencode = getOpenCodeClient({
      serverUrl: sdkUrl
    });

    this.config = {
      poll_interval_ms: workerConfig.poll_interval_ms || 30000,
      max_concurrent_runs: workerConfig.max_concurrent_runs || 3,
      worker_id: workerConfig.worker_id,
      picking: {
        mode: workerConfig.picking?.mode || "simple",
        max_issues: workerConfig.picking?.max_issues || 3,
        prefer_epic_affinity: workerConfig.picking?.prefer_epic_affinity ?? true,
      },
      crash_detection: workerConfig.crash_detection,
      ...config,
    };
    
    this.workerId = this.config.worker_id || process.env.ASHEP_WORKER_ID || "default";
    
    if (!process.env.ASHEP_WORKER_ID) {
      process.env.ASHEP_WORKER_ID = this.workerId;
    }
  }

  /**
   * Start the worker loop
   */
  async start(): Promise<void> {
    this.isRunning = true;
    console.log("Worker Engine started");
    console.log(`Poll interval: ${this.config.poll_interval_ms}ms`);

    while (this.isRunning) {
      try {
        await this.processReadyIssues();
      } catch (error) {
        console.error("Error in worker loop:", error);
      }

      // Wait before next poll
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.poll_interval_ms)
      );
    }
  }

  /**
   * Stop the worker loop
   */
  stop(): void {
    this.isRunning = false;
    console.log("Worker Engine stopped");
  }

  /**
   * Process all ready issues
   */
  private async processReadyIssues(): Promise<void> {
    const config = loadConfig();
    const maxConcurrent = this.config.max_concurrent_runs || 1;
    const strategy = config.worker?.concurrency_strategy || "active_sessions";
    
    let activeCount = 0;

    try {
      if (strategy === "active_sessions" || strategy === "strict_both") {
        const sdkUrl = config.execution?.sdk_base_url || process.env.OPENCODE_URL || 'http://localhost:4321';
        // console.log(`Checking concurrency against ${sdkUrl}...`); 
        const sdkModule = await import('./opencode_sdk.ts');
        const sdkClient = sdkModule.getSDKClient({ baseUrl: sdkUrl });
        const sessions = await sdkClient.listSessions(true); // true = active only
        activeCount = sessions.length;
        // console.log(`Active sessions: ${activeCount}`);
        
        if (strategy === "strict_both") {
           // If using strict both, we will check beads next and take the MAX
        }
      }
      
      if (strategy === "beads_status" || strategy === "strict_both") {
        const { listIssues } = await import("./beads.ts");
        const inProgressIssues = await listIssues({ status: "in_progress" });
        const beadsCount = inProgressIssues.length;
        
        if (strategy === "strict_both") {
          activeCount = Math.max(activeCount, beadsCount);
        } else {
          activeCount = beadsCount;
        }
      }
    } catch (error) {
      console.warn(`Failed to check concurrency (${strategy}): ${error}`);
      // Fallback to safe assumption (blocked) if check fails? 
      // Or 0? Let's log and proceed cautiously.
    }

    if (activeCount >= maxConcurrent) {
      console.log(`Global concurrency limit reached (${activeCount}/${maxConcurrent} active via ${strategy}). Waiting...`);
      return;
    }

    const availableSlots = maxConcurrent - activeCount;
    
    // Limit issue picking to available slots
    const issues = await this.getEligibleIssues(availableSlots);

    console.log(`Found ${issues.length} eligible issues (Available slots: ${availableSlots})`);

    // Process each issue
    for (const issue of issues) {
      try {
        await this.processIssue(issue);
      } catch (error) {
        console.error(`Error processing issue ${issue.id}:`, error);
      }
    }
  }

  /**
   * Get eligible issues (ready and not excluded)
   */
  private async getEligibleIssues(limit?: number): Promise<BeadsIssue[]> {
    const config = loadConfig();
    const pickingConfig: PickerConfig = {
      mode: config.worker?.picking?.mode || "simple",
      max_issues: limit || config.worker?.picking?.max_issues || this.config.max_concurrent_runs,
      prefer_epic_affinity: config.worker?.picking?.prefer_epic_affinity || true,
      crash_detection: config.worker?.crash_detection,
    };

    const issuePicker = getIssuePicker(pickingConfig);
    return await issuePicker.pickNextIssues();
  }

  /**
   * Process a single issue
   */
  async processIssue(issue: BeadsIssue): Promise<ProcessResult> {
    console.log(`Processing issue: ${issue.id} - ${issue.title}`);

    // 1. Resolve policy and phase using matchPolicy
    const policy = this.policyEngine.matchPolicy(issue);
    const phases = this.policyEngine.getPhaseSequence(policy);

    // Check for existing phase label to resume from
    const currentPhaseLabel = await getCurrentPhase(issue.id);
    let phase: string;

    if (currentPhaseLabel && phases.includes(currentPhaseLabel)) {
      // Resume from existing phase
      phase = currentPhaseLabel;
      console.log(`Resuming issue from phase '${phase}'`);
    } else {
      // Start from first phase
      phase = phases[0] || "plan";
      // Set initial phase label
      await setPhaseLabel(issue.id, phase);
    }

    // Add ashep-managed label if not already present
    const hasManagedLabel = await hasAshepManagedLabel(issue.id);
    if (!hasManagedLabel) {
      await setAshepManagedLabel(issue.id);
      console.log(`Added ashep-managed label to issue ${issue.id}`);
    }

    console.log(`Using policy '${policy}' at phase '${phase}'`);

    // 2. Select appropriate agent
    const phaseConfig = this.policyEngine.getPhaseConfig(policy, phase);
    const agent = this.agentRegistry.selectAgent({
      required_capabilities: phaseConfig?.capabilities || [],
      capability_match_mode: phaseConfig?.capability_match_mode,
      tags: [issue.issue_type],
    });

    if (!agent) {
      console.error(`No suitable agent found for phase '${phase}'`);
      return {
        issue_id: issue.id,
        run_id: "",
        success: false,
        message: "No suitable agent available",
      };
    }

    console.log(`Selected agent: ${agent.name} (${agent.id})`);

    // Get retry count for this issue and phase
    const retryCount = this.logger.getPhaseRetryCount(issue.id, phase);

    // Log agent selection decision
    const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    this.currentRunId = runId;
    this.currentPhase = phase;

    this.logger.logDecision({
      run_id: runId,
      type: "agent_selection",
      decision: agent.id,
      reasoning: `Selected for capabilities: ${phaseConfig?.capabilities?.join(", ")}`,
      metadata: {
        issue_id: issue.id,
        phase,
        policy,
      },
    });

    // 3. Create run record
    const attemptNumber = retryCount + 1;

    // Get cumulative phase duration from previous runs
    const previousPhaseTotal = this.logger.getPhaseTotalDuration(issue.id, phase);

    const run = this.logger.createRun({
      id: runId,
      issue_id: issue.id,
      session_id: "",
      agent_id: agent.id,
      policy_name: policy,
      phase,
      status: "pending",
      metadata: {
        attempt_number: attemptNumber,
        retry_count: retryCount,
        phase_total_duration_ms: previousPhaseTotal,
      },
    });

    // 4. Update issue status to in_progress
    await updateIssue(issue.id, { status: "in_progress" });

    // 4.1 Mark run as running
    this.logger.updateRun(runId, {
      status: "running",
      metadata: {
        ...run.metadata,
        started_at: Date.now()
      }
    });

    // 4.5. Receive any pending messages for this phase (optional plugin)
    try {
      const { getPhaseMessenger } = await import("./phase-messenger.ts");
      const phaseMessenger = getPhaseMessenger();
      const pendingMessages = phaseMessenger.receiveMessages(issue.id, phase, true);
      if (pendingMessages.length > 0) {
        console.log(`Received ${pendingMessages.length} pending message(s) for phase '${phase}'`);
        this.logger.logDecision({
          run_id: runId,
          type: "message_receipt",
          decision: "messages_received",
          reasoning: `Received ${pendingMessages.length} message(s) for phase ${phase}`,
          metadata: {
            issue_id: issue.id,
            phase,
            message_count: pendingMessages.length
          }
        });
      }
    } catch (error) {
      console.debug(`Phase messenger not available: ${error}`);
    }

    // 5. Launch agent in OpenCode
    let outcome: RunOutcome;
    let sessionId: string | undefined;
    let isAutoClosed = false;
    try {
      const launchResult = await this.launchAgent(run.id, issue, agent.id, phase, policy);
      outcome = launchResult.outcome;
      sessionId = launchResult.sessionId;
      isAutoClosed = launchResult.metadata?.auto_closed === true;

      // Update run with outcome
      const updateData: any = {
        status: outcome.success ? "completed" : "failed",
        outcome,
        completed_at: Date.now(),
      };

      // Store session_id and update cumulative phase duration
      const currentPhaseTotal = (run.metadata as any)?.phase_total_duration_ms || 0;
      const currentDuration = outcome.metrics?.duration_ms || 0;

      if (sessionId) {
        updateData.metadata = {
          ...run.metadata,
          session_id: sessionId,
          phase_total_duration_ms: currentPhaseTotal + currentDuration,
          ...launchResult.metadata,
        };
      } else {
        updateData.metadata = {
          ...run.metadata,
          phase_total_duration_ms: currentPhaseTotal + currentDuration,
          ...launchResult.metadata,
        };
      }

      this.logger.updateRun(run.id, updateData);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      outcome = {
        success: false,
        error: errorMsg,
      };

      this.logger.updateRun(run.id, {
        status: "failed",
        outcome,
        completed_at: Date.now(),
      });
    }

    // 6. Determine transition based on outcome
    let transition: PhaseTransition;
    let containerValidation: {
      outcome: "DONE" | "NEEDS_WORK" | "UNCLEAR";
      confidence: number;
      reasoning: string;
    } | undefined;

    // Check if this is a container validation scenario
    const containerCheck = await this.isContainerEpic(issue);
    const isContainerValidationPhase = phaseConfig?.capabilities?.includes("container-validation");

    // 6.1. Handle container validation scenarios
    if (isContainerValidationPhase && containerCheck.is_container) {
      const validationDecision = await this.executeContainerValidation(issue, outcome, phase);

      containerValidation = {
        outcome: validationDecision.outcome,
        confidence: validationDecision.confidence,
        reasoning: validationDecision.reasoning
      };

      this.logger.logDecision({
        run_id: run.id,
        type: "container_validation",
        decision: validationDecision.outcome,
        reasoning: validationDecision.reasoning,
        metadata: {
          issue_id: issue.id,
          phase,
          container_confidence: containerCheck.confidence,
          container_mode: containerCheck.mode,
          validation_confidence: validationDecision.confidence,
          recommendations: validationDecision.recommendations
        }
      });

      switch (validationDecision.outcome) {
        case "DONE":
          await setContainerValidationLabel(issue.id, "DONE");
          transition = {
            type: "close",
            reason: `Container validation passed: ${validationDecision.reasoning}`
          };
          break;
        case "NEEDS_WORK":
          await setContainerValidationLabel(issue.id, "NEEDS_WORK");
          transition = {
            type: "advance",
            next_phase: "plan",
            reason: `Container needs work: ${validationDecision.reasoning}. Treating container as regular task.`
          };
          break;
        case "UNCLEAR":
          await setContainerValidationLabel(issue.id, "UNCLEAR");
          {
            const config = loadConfig();
            if (validateHITLReason("container-validation", config.hitl)) {
              await setHITLLabel(issue.id, "container-validation");
              await this.generateContainerValidationNote(issue.id, validationDecision);
            }
          }
          transition = {
            type: "block",
            reason: `Container validation unclear: ${validationDecision.reasoning}. Human review required.`
          };
          break;
        default:
          await setContainerValidationLabel(issue.id, "UNCLEAR");
          transition = {
            type: "block",
            reason: `Invalid container validation outcome: ${validationDecision.outcome}`
          };
      }

      await this.handleContainerSubWorkflow(issue, validationDecision, phase, policy);
    }
    // 6.2. Special handling for auto-closed container epics (non-validation scenarios)
    else if (isAutoClosed) {
      transition = {
        type: "close",
        reason: outcome.message || "Container epic auto-closed - all subtasks completed"
      };
    } else if (this.shouldTriggerWorkerAssistant(outcome, phase, policy)) {
      const directive = await this.executeWorkerAssistant(issue.id, outcome, phase);
      
      this.logger.logDecision({
        run_id: runId,
        type: "worker_assistant",
        decision: directive,
        reasoning: `Worker assistant directive based on outcome analysis`,
        metadata: {
          issue_id: issue.id,
          phase,
          outcome_summary: {
            success: outcome.success,
            warnings: outcome.warnings?.length,
            artifacts: outcome.artifacts?.length,
            has_error: !!outcome.error
          }
        }
      });
      
      switch (directive) {
        case "advance":
          transition = await this.policyEngine.determineTransition(policy, phase, {
            success: true,
            retry_count: retryCount,
            requires_approval: outcome.requires_approval,
          }, issue.id);
          break;
        case "retry":
          transition = { type: "retry", reason: "Assistant recommended retry" };
          break;
        case "block":
          transition = { type: "block", reason: "Assistant recommended human review" };
          break;
        default:
          transition = await this.policyEngine.determineTransition(policy, phase, {
            success: outcome.success,
            retry_count: retryCount,
            requires_approval: outcome.requires_approval,
          }, issue.id);
      }
    } else {
      transition = await this.policyEngine.determineTransition(policy, phase, {
        success: outcome.success,
        retry_count: retryCount,
        requires_approval: outcome.requires_approval,
      }, issue.id);
    }

    // Log transition decision
    this.logger.logDecision({
      run_id: run.id,
      type: "phase_transition",
      decision: transition.type,
      reasoning: transition.reason,
      metadata: {
        from_phase: phase,
        to_phase: transition.next_phase,
        next_phase: transition.next_phase,
        outcome,
      },
    });

    // 6.5. Send result message to next phase on successful completion and advance (optional plugin)
    if (outcome.success && transition.type === "advance" && transition.next_phase && transition.next_phase !== phase) {
      try {
        const { getPhaseMessenger } = await import("./phase-messenger.ts");
        const phaseMessenger = getPhaseMessenger();
        
        // Construct rich summary
        const summaryParts = [outcome.message || "Phase completed successfully"];
        
        if (outcome.artifacts && outcome.artifacts.length > 0) {
          summaryParts.push("\n**Modified Files:**");
          const artifacts = outcome.artifacts.slice(0, 10); // Limit to top 10
          artifacts.forEach(path => summaryParts.push(`- ${path}`));
          if (outcome.artifacts.length > 10) {
            summaryParts.push(`...and ${outcome.artifacts.length - 10} more`);
          }
        }
        
        if (outcome.metrics?.duration_ms) {
          summaryParts.push(`\n**Metrics:**`);
          summaryParts.push(`- Duration: ${(outcome.metrics.duration_ms / 1000).toFixed(1)}s`);
          if (outcome.metrics.tokens_used) {
            summaryParts.push(`- Tokens: ${outcome.metrics.tokens_used}`);
          }
        }

        const resultMessage = phaseMessenger.sendMessage({
          issue_id: issue.id,
          from_phase: phase,
          to_phase: transition.next_phase,
          message_type: "result",
          content: summaryParts.join("\n"),
          metadata: {
            status: "completed",
            artifacts: outcome.artifacts?.length || 0,
            duration_ms: outcome.metrics?.duration_ms
          }
        });
        console.log(`Sent result message from '${phase}' to '${transition.next_phase}': ${resultMessage.id}`);
        this.logger.logDecision({
          run_id: runId,
          type: "message_send",
          decision: "result_message_sent",
          reasoning: `Sent result message from ${phase} to ${transition.next_phase}`,
          metadata: {
            message_id: resultMessage.id,
            from_phase: phase,
            to_phase: transition.next_phase
          }
        });
      } catch (error) {
        console.warn(`Failed to send phase message: ${error}`);
      }
    }

    // 7. Update Beads state based on transition
    await this.applyTransition(issue.id, transition);

    return {
      issue_id: issue.id,
      run_id: run.id,
      success: outcome.success,
      message: transition.reason,
      next_phase: transition.next_phase,
      container_validation: containerValidation
    };
  }

   /**
      * Check if an issue is a container epic and should be handled accordingly
      */
    private async isContainerEpic(issue: BeadsIssue): Promise<{
      is_container: boolean;
      mode: ContainerHandlingMode;
      workflow_override?: string;
      confidence: number;
      ready_to_close: boolean;
    }> {
      const config = loadConfig();
      const containerConfig = config.container_handling;

      if (!containerConfig?.enabled) {
        return {
          is_container: false,
          mode: "auto-close",
          confidence: 0,
          ready_to_close: false
       };
      }

      // Multi-factor container detection
      const hasChildren = await this.hasContainerChildren(issue);
      const hasContainerType = this.isContainerType(issue);
      const hasContainerLanguage = this.hasContainerLanguage(issue);
      const hasContainerStructure = await this.hasContainerStructure(issue);

      // Calculate confidence score based on factor matches
      const confidence = this.calculateContainerConfidence(
        hasChildren,
        hasContainerType,
        hasContainerLanguage,
        hasContainerStructure
      );

      const isContainer = confidence >= 0.5;

      // Check if container is ready to close (all children complete)
      const readyToClose = isContainer && await this.areAllChildrenComplete(issue);

      // Get policy based on hierarchy level
      const level = this.calculateHierarchicalLevel(issue.id);
      let policy: LevelPolicy | undefined;
      if (containerConfig.level_policies) {
        policy = containerConfig.level_policies[level.toString()];
      }

      const mode: ContainerHandlingMode = policy?.mode || containerConfig.default_mode || "auto-close";

      return {
        is_container: isContainer,
        mode,
        workflow_override: policy?.workflow_override,
        confidence,
        ready_to_close: readyToClose
      };
    }

   /**
      * Check if issue has container children (parent-child dependencies)
      */
    private async hasContainerChildren(issue: BeadsIssue): Promise<boolean> {
      try {
        const { execBeadsCommand } = await import("./beads.ts");
        const output = await execBeadsCommand(["dep", "list", issue.id, "--json"]);
        const deps = JSON.parse(output);

        if (!Array.isArray(deps)) {
          return false;
        }

        const minChildren = loadConfig().container_handling?.container_detection?.min_children || 2;
        const childCount = deps.filter((dep: any) => dep.dependency_type === "parent-child").length;

        return childCount >= minChildren;
      } catch (error) {
        console.warn(`Failed to check container children for ${issue.id}: ${error}`);
        return false;
      }
    }

   /**
      * Check if issue type indicates a container
      */
    private isContainerType(issue: BeadsIssue): boolean {
      const containerTypes = ["epic", "milestone", "phase", "group"];
      return containerTypes.includes(issue.issue_type?.toLowerCase() || "");
    }

   /**
      * Check if issue has container-like structure (dependencies pattern)
      */
    private async hasContainerStructure(issue: BeadsIssue): Promise<boolean> {
      try {
        const { execBeadsCommand } = await import("./beads.ts");
        const output = await execBeadsCommand(["dep", "list", issue.id, "--json"]);
        const deps = JSON.parse(output);

        if (!Array.isArray(deps)) {
          return false;
        }

        // Check for mix of parent-child and other dependency types
        const hasParentChild = deps.some((dep: any) => dep.dependency_type === "parent-child");

        // Container epics typically have parent-child dependencies
        return hasParentChild;
      } catch (error) {
        console.warn(`Failed to check container structure for ${issue.id}: ${error}`);
        return false;
      }
    }

   /**
      * Calculate confidence score for container detection
      */
    private calculateContainerConfidence(
      hasChildren: boolean,
      hasContainerType: boolean,
      hasContainerLanguage: boolean,
      hasContainerStructure: boolean
    ): number {
      let score = 0;
      let factors = 0;

      // Factor 1: Container type (strong indicator)
      if (hasContainerType) {
        score += 0.4;
        factors++;
      }

      // Factor 2: Has children (strong indicator)
      if (hasChildren) {
        score += 0.3;
        factors++;
      }

      // Factor 3: Container language (medium indicator)
      if (hasContainerLanguage) {
        score += 0.2;
        factors++;
      }

      // Factor 4: Container structure (medium indicator)
      if (hasContainerStructure) {
        score += 0.1;
        factors++;
      }

      // Adjust based on factor count
      // If multiple factors agree, boost confidence
      if (factors >= 3) {
        score = Math.min(1.0, score + 0.2);
      } else if (factors === 2) {
        score = Math.min(1.0, score + 0.1);
      }

      return Math.round(score * 100) / 100;
    }

   /**
     * Check if all container children are complete
     */
   private async areAllChildrenComplete(issue: BeadsIssue): Promise<boolean> {
     try {
       const { execBeadsCommand } = await import("./beads.ts");
       const output = await execBeadsCommand(["dep", "list", issue.id, "--json"]);
       const deps = JSON.parse(output);

       if (!Array.isArray(deps)) {
         return true;
       }

       // Get status of each child
       for (const dep of deps) {
         if (dep.dependency_type !== "parent-child") {
           continue;
         }

         try {
           const childOutput = await execBeadsCommand(["show", dep.id, "--json"]);
           const childIssue = JSON.parse(childOutput);

           if (childIssue.status !== "closed") {
             return false;
           }
         } catch (error) {
           console.warn(`Failed to get child status for ${dep.id}: ${error}`);
         }
       }

       return true;
     } catch (error) {
       console.warn(`Failed to check children completion for ${issue.id}: ${error}`);
       return false;
     }
   }

   /**
     * Check if issue description contains container language
     */
   private hasContainerLanguage(issue: BeadsIssue): boolean {
     const config = loadConfig();

     if (!config.container_handling?.container_detection?.check_description) {
       return true; // Skip check if disabled
     }

     const containerIndicators = [
       "contains", "phase", "group", "subtasks", "children",
       "when assigned this epic", "select the next available child",
       "this epic contains", "work in this epic"
     ];

     const description = (issue.description || "").toLowerCase();
     return containerIndicators.some(indicator =>
       description.includes(indicator)
     );
   }

   /**
     * Calculate hierarchical level from issue ID
     */
   private calculateHierarchicalLevel(issueId: string): number {
     const parts = issueId.split(".");
     let level = 0;

     for (const part of parts.slice(1)) {
       if (/^\d+$/.test(part)) {
         level++;
       }
     }

      return level;
    }

   /**
     * Launch agent using OpenCode CLI
     */
   private async launchAgent(
     runId: string,
     issue: BeadsIssue,
     agentId: string,
     phase: string,
     policy: string
   ): Promise<{ outcome: RunOutcome; sessionId?: string; metadata?: any }> {
     const startTimestamp = Date.now();

       // Check if this is a container epic that should be handled specially
       const containerCheck = await this.isContainerEpic(issue);

       if (containerCheck.is_container && containerCheck.ready_to_close && containerCheck.mode === "auto-close") {
         console.log(
           `Detected container epic ${issue.id} in auto-close mode - closing since all subtasks are complete`
         );
         return {
           outcome: {
             success: true,
             message: "Container epic auto-closed - all subtasks completed",
             artifacts: [],
             metrics: {
               duration_ms: Date.now() - startTimestamp,
               tokens_used: 0,
               cost: 0
             }
           },
           metadata: {
             auto_closed: true,
             reason: "container_epic_completed",
             handling_mode: containerCheck.mode
           }
         };
       }

     const agent = this.agentRegistry.getAgent(agentId);
     if (!agent) {
       throw new Error(`Agent ${agentId} not found in registry`);
     }

    const phaseConfig = this.policyEngine.getPhaseConfig(policy, phase);
    const policyConfig = this.policyEngine.getPolicyConfig(policy);

    let modelToUse: string | undefined;
    if (phaseConfig?.model) {
      modelToUse = phaseConfig.model;
      console.log(`Using phase-specified model: ${modelToUse}`);
    } else if (agent.model_id) {
      modelToUse = agent.provider_id ? `${agent.provider_id}/${agent.model_id}` : agent.model_id;
      console.log(`Using agent-configured model: ${modelToUse}`);
    } else {
      console.log(`Using OpenCode agent default model`);
    }

    const instructions = this.buildInstructions(issue, phase, policy);

    const initialPrompt = instructions;

    // Check for session reuse
    let sessionIdToUse: string | undefined;
    if (phaseConfig?.reuse_session_from_phase && policyConfig) {
      const resolvedTarget = this.resolveReuseTarget(
        phase,
        phaseConfig.reuse_session_from_phase,
        policyConfig
      );

      if (resolvedTarget) {
        const reuseConfig = await this.findReusableSession(issue.id, resolvedTarget);

        if (reuseConfig.shouldReuse && reuseConfig.sessionId) {
          sessionIdToUse = reuseConfig.sessionId;
          console.log(`Reusing session ${sessionIdToUse} from target '${resolvedTarget}'`);
        } else if (reuseConfig.sessionId && !reuseConfig.shouldReuse) {
          console.log(`Session ${reuseConfig.sessionId} exists but exceeds token threshold, creating new session`);
        }
      }
    }

    // Execute agent with or without session reuse
    let result;
    const config = loadConfig();
    const executionMode = config.execution?.mode || "sdk";

    // Check for existing active session for this issue/phase to prevent duplicates
    let skipPrompt = false;
    if (!sessionIdToUse && executionMode === "sdk") {
      try {
        const sessionList = await this.opencode.listSessionsForIssue(issue.id);
        // listSessionsForIssue returns sorted by created time (oldest to newest)
        
        // Find the most recent session for this phase
        const activeSession = sessionList.reverse().find(s => s.phase === phase);
        
        if (activeSession) {
          // Check if session is actually active in OpenCode (not just in our DB)
          const sdkModule = await import('./opencode_sdk.ts');
          const sdkClient = sdkModule.getSDKClient({ baseUrl: config.execution?.sdk_base_url });
          const activity = await sdkClient.getSessionActivity(activeSession.sessionId);
          
          if (activity && activity.isActive) {
            console.log(`Found active background session ${activeSession.sessionId} for phase '${phase}'. Attaching...`);
            sessionIdToUse = activeSession.sessionId;
            skipPrompt = true;
          }
        }
      } catch (error) {
        console.warn(`Failed to check for active background sessions: ${error}`);
      }
    }

    try {
      if (executionMode === "sdk") {
        result = await this.opencode.runAgentSDK({
          directory: process.cwd(),
          title: `${issue.id}: ${issue.title}`,
          agent: agent.opencode_agent || agentId,
          model: modelToUse,
          message: instructions,
          sessionId: sessionIdToUse,
          skipPrompt,
        }, (message) => {
          console.log(`[SDK Progress] ${message}`);
        });
      } else {
        console.log(`Executing agent using CLI mode`);
        result = await this.opencode.runAgentCLI({
          directory: process.cwd(),
          title: `${issue.id}: ${issue.title}`,
          agent: agent.opencode_agent || agentId,
          model: modelToUse,
          message: instructions,
          sessionId: sessionIdToUse,
        });
      }
    } catch (error) {
      // Fallback to new session if reuse fails
      if (sessionIdToUse) {
        console.warn(`Session reuse failed, falling back to new session: ${error}`);
        
        if (executionMode === "sdk") {
          result = await this.opencode.runAgentSDK({
            directory: process.cwd(),
            title: `${issue.id}: ${issue.title}`,
            agent: agent.opencode_agent || agentId,
            model: modelToUse,
            message: instructions,
          }, (message) => {
            console.log(`[SDK Progress] ${message}`);
          });
        } else {
          result = await this.opencode.runAgentCLI({
            directory: process.cwd(),
            title: `${issue.id}: ${issue.title}`,
            agent: agent.opencode_agent || agentId,
            model: modelToUse,
            message: instructions,
          });
        }
      } else {
        throw error;
      }
    }

    const endTimestamp = Date.now();
    const wallClockDurationMs = endTimestamp - startTimestamp;

    if (!result.success) {
      console.error(`Agent execution failed: ${result.error}`);
      return {
        outcome: {
          success: false,
          error: result.error || "Agent execution failed",
          metrics: {
            duration_ms: wallClockDurationMs,
            start_time_ms: startTimestamp,
            end_time_ms: endTimestamp,
          },
        },
        sessionId: result.sessionId,
      };
    }

    console.log(`Agent execution completed successfully`);

    const parsedOutcome = this.opencode.parseRunOutput(result.output, result.error || "");

    if (!parsedOutcome.success) {
      console.error(`Agent execution reported failure: ${parsedOutcome.error}`);
    }

    const policyTimeout = this.policyEngine.calculateTimeout(policy, phase);
    const actualDuration = parsedOutcome.metrics?.duration_ms || wallClockDurationMs;

    let timeoutReason: string | undefined;
    if (actualDuration > policyTimeout) {
      timeoutReason = `Execution exceeded timeout of ${policyTimeout}ms (actual: ${actualDuration}ms)`;
      console.warn(timeoutReason);
      parsedOutcome.success = false;
      parsedOutcome.error = timeoutReason;

      this.logger.logDecision({
        run_id: runId,
        type: "timeout",
        decision: "timeout_exceeded",
        reasoning: timeoutReason,
        metadata: {
          timeout_threshold_ms: policyTimeout,
          actual_duration_ms: actualDuration,
          phase,
        },
      });
    }

    const outcome: RunOutcome = {
      success: parsedOutcome.success,
      message: parsedOutcome.message || "Task completed by agent",
      artifacts: parsedOutcome.artifacts?.map((a) => a.path) || [],
      error: parsedOutcome.error,
      error_details: parsedOutcome.error_details,
      warnings: parsedOutcome.warnings,
      tool_calls: parsedOutcome.tool_calls,
      metrics: {
        ...parsedOutcome.metrics,
        duration_ms: actualDuration,
        start_time_ms: parsedOutcome.metrics?.start_time_ms || startTimestamp,
        end_time_ms: parsedOutcome.metrics?.end_time_ms || endTimestamp,
        tool_calls_count: parsedOutcome.tool_calls?.length || 0,
      },
    };

    const metadata: any = {
      initial_prompt: initialPrompt,
    };

    if (sessionIdToUse) {
      metadata.session_reuse = {
        reused_session_id: sessionIdToUse,
        fallback_to_new: result.sessionId !== sessionIdToUse
      };
    }

    return {
      outcome,
      sessionId: parsedOutcome.session_id || result.sessionId,
      metadata,
    };
  }

  /**
   * Build instructions for the agent
   */
  private buildInstructions(
    issue: BeadsIssue,
    phase: string,
    policy: string
  ): string {
    const phaseConfig = this.policyEngine.getPhaseConfig(policy, phase);

    if (phaseConfig?.custom_prompt && phaseConfig.custom_prompt.trim()) {
      let customPrompt = this.substituteVariables(phaseConfig.custom_prompt, issue, phase, phaseConfig.capabilities);

      if (phaseConfig?.require_approval) {
        customPrompt += "\n\n⚠️ This phase requires human approval before proceeding.\n";
      }

      return customPrompt.trim();
    }

    return `
# Role & Context
You are an autonomous agent working on the **${phase}** phase of a multi-step workflow.
Your goal is to complete ONLY the objectives for this specific phase, preparing the state for subsequent phases if any.

## Phase Objective
${phaseConfig?.description || "Complete the objectives for this phase."}

# Task Information
**Issue**: ${issue.title} (${issue.id})
**Type**: ${issue.issue_type}
**Priority**: P${issue.priority}

## Description
${issue.description}

# Previous Context
Use the Phase Messenger to access results, decisions, or data passed down from previous phases.
To list available messages: \`ashep phase-msg-list ${issue.id} --phase ${phase} --json\`
To read message details: \`ashep phase-msg-read <message-id> --json\`

# Instructions
1. Review the task description and phase objective.
2. Check for phase messages to understand context from previous phases.
3. Execute the necessary actions to complete this phase.
4. When finished, provide a summary of your work.

${phaseConfig?.require_approval ? "\n⚠️ This phase requires human approval before proceeding.\n" : ""}
`.trim();
  }

  /**
   * Substitute variables in custom prompt template
   */
  private substituteVariables(
    template: string,
    issue: BeadsIssue,
    phase: string,
    capabilities?: string[]
  ): string {
    const capabilitiesList = capabilities?.join(", ") || "None specified";

    let result = template;

    result = result.replace(/\{\{issue\.title\}\}/g, issue.title || "");
    result = result.replace(/\{\{issue\.description\}\}/g, issue.description || "");
    result = result.replace(/\{\{issue\.id\}\}/g, issue.id || "");
    result = result.replace(/\{\{issue\.type\}\}/g, issue.issue_type || "");
    result = result.replace(/\{\{phase\}\}/g, phase || "");
    result = result.replace(/\{\{capabilities\}\}/g, capabilitiesList);

    return result;
  }

   /**
    * Apply phase transition to issue
    */
   private async applyTransition(
     issueId: string,
     transition: PhaseTransition
   ): Promise<void> {
     switch (transition.type) {
       case "advance":
         await updateIssue(issueId, { status: "open" });
         // Update phase label to next phase
         if (transition.next_phase) {
           await setPhaseLabel(issueId, transition.next_phase);
           // Clear HITL labels when advancing
           await clearHITLLabels(issueId);
           // Clear container validation labels when advancing to new phase
           await clearContainerValidationLabels(issueId);
         }
         console.log(
           `Advanced to next phase: ${transition.next_phase || "unknown"}`
         );
         break;

       case "retry":
         await updateIssue(issueId, { status: "open" });
         // Keep existing phase label on retry
         // Clear HITL labels when retrying
         await clearHITLLabels(issueId);
         // Clear container validation labels when retrying
         await clearContainerValidationLabels(issueId);
         console.log(`Retrying phase: ${transition.reason}`);
         break;

       case "block":
         await updateIssue(issueId, { status: "blocked" });
         // Set HITL label for approval required
         if (transition.reason?.includes("approval") || transition.reason?.includes("Human approval")) {
           const config = loadConfig();
           const hitlReason = transition.reason?.toLowerCase().includes("approval")
             ? "approval"
             : "manual-intervention";

           if (validateHITLReason(hitlReason, config.hitl)) {
             await setHITLLabel(issueId, hitlReason);
             // Generate approval note
             await this.generateApprovalNote(issueId, hitlReason, transition.reason);
           }
         }
         console.log(`Blocked issue: ${transition.reason}`);
         break;

       case "close":
         await updateIssue(issueId, { status: "closed" });
         // Remove all tracking labels on close
         await removeAshepManagedLabel(issueId);
         await removePhaseLabels(issueId);
         await clearHITLLabels(issueId);
         // Clear container validation labels on close
         await clearContainerValidationLabels(issueId);
         console.log(`Closed issue: ${transition.reason}`);
         break;

       case "jump_back": {
         await updateIssue(issueId, { status: "open" });
         const targetPhase = transition.jump_target_phase || transition.next_phase;
         if (targetPhase) {
           await setPhaseLabel(issueId, targetPhase);
           await clearHITLLabels(issueId);
           // Clear container validation labels when jumping back
           await clearContainerValidationLabels(issueId);
           console.log(`Jumped back to phase: ${targetPhase}`);
         }
         break;
       }

       case "dynamic_decision": {
         try {
           const finalTransition = await this.executeDecisionAgent(issueId, transition);
           await this.applyTransition(issueId, finalTransition);
           console.log(`Dynamic decision resulted in: ${finalTransition.type}`);
         } catch (error) {
           console.error(`Dynamic decision failed: ${error}`);
           const errorMsg = error instanceof Error ? error.message : String(error);
           await updateIssue(issueId, { status: "blocked" });
           if (validateHITLReason("manual-intervention", loadConfig().hitl)) {
             await setHITLLabel(issueId, "manual-intervention");
             await this.generateApprovalNote(issueId, "manual-intervention", `Dynamic decision failed: ${errorMsg}`);
           }
         }
         break;
       }
     }
   }

  /**
   * Check if worker assistant should be triggered based on outcome and phase
   */
  private shouldTriggerWorkerAssistant(outcome: RunOutcome, phase: string, policy: string): boolean {
    const config = loadConfig();
    const workerAssistant = config.worker_assistant;
    
    if (!workerAssistant?.enabled) {
      return false;
    }
    
    const policyConfig = this.policyEngine.getPolicyConfig(policy);
    const phaseConfig = this.policyEngine.getPhaseConfig(policy, phase);
    
    const policyOptOut = policyConfig?.worker_assistant?.enabled === false;
    const phaseOptOut = phaseConfig?.worker_assistant?.enabled === false;
    
    if (policyOptOut || phaseOptOut) {
      return false;
    }
    
    let triggerCount = 0;
    
    if (outcome.success) {
      if (outcome.warnings && outcome.warnings.length > 0) {
        triggerCount++;
      }
      
      if (outcome.artifacts && outcome.artifacts.length > 5) {
        triggerCount++;
      }
      
      if (outcome.message && (
        outcome.message.includes("unclear") ||
        outcome.message.includes("partial") ||
        outcome.message.includes("ambiguous") ||
        outcome.message.includes("review")
      )) {
        triggerCount++;
      }
    } else {
      if (outcome.error_details && Object.keys(outcome.error_details).length > 0) {
        triggerCount++;
      }
      
      if (outcome.message && (
        outcome.message.includes("timeout") ||
        outcome.message.includes("incomplete") ||
        outcome.message.includes("partial")
      )) {
        triggerCount++;
      }
    }
    
    return triggerCount > 0;
  }
  
   /**
    * Execute container validation decision agent
    */
   private async executeContainerValidation(
     issue: BeadsIssue,
     outcome: RunOutcome,
     phase: string
   ): Promise<{
     outcome: "DONE" | "NEEDS_WORK" | "UNCLEAR";
     confidence: number;
     reasoning: string;
     recommendations?: string[];
   }> {
     const config = loadConfig();

     if (!config.worker_assistant?.enabled) {
       console.log(`Worker assistant disabled, returning default container decision: UNCLEAR`);
       this.logger.logDecision({
         run_id: this.currentRunId || "",
         type: "container_validation_fallback",
         decision: "worker_assistant_disabled",
         reasoning: "Worker assistant disabled, defaulting to UNCLEAR",
         metadata: {
           issue_id: issue.id,
           phase
         }
       });
       return {
         outcome: "UNCLEAR",
         confidence: 0.5,
         reasoning: "Worker assistant disabled, defaulting to UNCLEAR"
       };
     }

     let containerCheck;
     try {
       containerCheck = await this.isContainerEpic(issue);
     } catch (error) {
       const errorMsg = error instanceof Error ? error.message : String(error);
       console.error(`Failed to check container status for ${issue.id}: ${errorMsg}`);
       this.logger.logDecision({
         run_id: this.currentRunId || "",
         type: "container_validation_error",
         decision: "container_check_failed",
         reasoning: `Container check failed: ${errorMsg}`,
         metadata: {
           issue_id: issue.id,
           phase,
           error: errorMsg
         }
       });

       return {
         outcome: "UNCLEAR",
         confidence: 0.3,
         reasoning: `Container check failed: ${errorMsg}. HITL escalation required.`
       };
     }

     const agent = this.agentRegistry.selectAgent({
       required_capabilities: ["container-validation", "worker-assistant"]
     });

     if (!agent) {
       console.warn(`No container validation agent found, using fallback logic`);
       this.logger.logDecision({
         run_id: this.currentRunId || "",
         type: "container_validation_fallback",
         decision: "no_validation_agent",
         reasoning: "No validation agent available, using default logic",
         metadata: {
           issue_id: issue.id,
           phase,
           container_mode: containerCheck.mode
         }
       });

       return {
         outcome: containerCheck.ready_to_close ? "DONE" : "NEEDS_WORK",
         confidence: 0.8,
         reasoning: "No validation agent available, using default logic"
       };
     }

     const decisionBuilder = await import("./decision-builder.ts").then(m => m.getDecisionPromptBuilder());

     let containerChildren;
     try {
       containerChildren = await this.getContainerChildrenInfo(issue);
     } catch (error) {
       const errorMsg = error instanceof Error ? error.message : String(error);
       console.warn(`Failed to get container children for ${issue.id}: ${errorMsg}`);
       this.logger.logDecision({
         run_id: this.currentRunId || "",
         type: "container_validation_warning",
         decision: "children_check_failed",
         reasoning: `Children check failed: ${errorMsg}`,
         metadata: {
           issue_id: issue.id,
           phase,
           error: errorMsg
         }
       });

       containerChildren = { total: 0, completed: 0 };
     }

     const allowedDestinations = ["DONE", "NEEDS_WORK", "UNCLEAR"];

     const context = {
       issue,
       outcome,
       current_phase: phase,
       custom_instructions: "Evaluate if this container epic is complete or requires further work.",
       allowed_destinations: allowedDestinations,
       container_children: {
         child_count: containerChildren.total,
         completed_count: containerChildren.completed,
         pending_count: containerChildren.total - containerChildren.completed
       },
       container_status: {
         all_children_complete: containerCheck.ready_to_close,
         container_confidence: containerCheck.confidence,
         container_mode: containerCheck.mode
       }
     };

     let promptData;
     try {
       promptData = decisionBuilder.buildPrompt("container-validation", context);
     } catch (error) {
       const errorMsg = error instanceof Error ? error.message : String(error);
       console.error(`Failed to build container validation prompt: ${errorMsg}`);
      this.logger.logDecision({
         run_id: this.currentRunId || "",
         type: "container_validation_error",
         decision: "prompt_build_failed",
         reasoning: `Prompt build failed: ${errorMsg}`,
         metadata: {
           issue_id: issue.id,
           phase,
           error: errorMsg
         }
       });

      return {
         outcome: containerCheck.ready_to_close ? "DONE" : "NEEDS_WORK",
         confidence: 0.7,
         reasoning: "Failed to build validation prompt, using fallback logic"
       };
    }

     if (!promptData) {
       console.warn(`Failed to build container validation prompt, using fallback`);
       this.logger.logDecision({
         run_id: this.currentRunId || "",
         type: "container_validation_fallback",
         decision: "prompt_data_null",
         reasoning: "Prompt data is null, using fallback logic",
         metadata: {
           issue_id: issue.id,
           phase
         }
       });

       return {
         outcome: containerCheck.ready_to_close ? "DONE" : "NEEDS_WORK",
         confidence: 0.7,
         reasoning: "Failed to build validation prompt, using fallback logic"
       };
     }

     const prompt = `${promptData.system_prompt}\n\n${promptData.user_prompt}`;

     const timeoutPromise = new Promise<never>((_, reject) => {
       setTimeout(() => reject(new Error("Container validation timeout")), config.worker_assistant?.timeoutMs || 10000);
     });

     try {
       const result = await Promise.race([
         this.opencode.runAgentCLI({
           directory: process.cwd(),
           title: `Container Validation: ${issue.id}`,
           agent: agent.id,
           message: prompt
         }),
         timeoutPromise
       ]) as any;

       if (!result.success) {
         console.warn(`Container validation execution failed: ${result.error}`);
         this.logger.logDecision({
           run_id: this.currentRunId || "",
           type: "container_validation_error",
           decision: "agent_execution_failed",
           reasoning: `Validation agent failed: ${result.error}`,
           metadata: {
             issue_id: issue.id,
             phase,
             error: result.error
           }
         });

         return {
           outcome: containerCheck.ready_to_close ? "DONE" : "NEEDS_WORK",
           confidence: 0.6,
           reasoning: `Validation agent failed: ${result.error}`
         };
       }

       let validation;
       try {
         validation = this.parseContainerValidationResponse(result.output);
       } catch (error) {
         const errorMsg = error instanceof Error ? error.message : String(error);
         console.error(`Failed to parse container validation response: ${errorMsg}`);
         this.logger.logDecision({
           run_id: this.currentRunId || "",
           type: "container_validation_error",
           decision: "response_parse_failed",
           reasoning: `Response parse failed: ${errorMsg}`,
           metadata: {
             issue_id: issue.id,
             phase,
             error: errorMsg,
             raw_output: result.output.substring(0, 500)
           }
         });

         return {
           outcome: containerCheck.ready_to_close ? "DONE" : "NEEDS_WORK",
           confidence: 0.4,
           reasoning: `Failed to parse validation response: ${errorMsg}`
         };
       }

       console.log(`Container validation decision: ${validation.outcome} (confidence: ${validation.confidence})`);
       return validation;
     } catch (error) {
       const errorMsg = error instanceof Error ? error.message : String(error);
       console.warn(`Container validation error: ${errorMsg}`);

       this.logger.logDecision({
         run_id: this.currentRunId || "",
         type: "container_validation_error",
         decision: "validation_failed",
         reasoning: `Validation error: ${errorMsg}`,
         metadata: {
           issue_id: issue.id,
           phase,
           error: errorMsg
         }
       });

       return {
         outcome: containerCheck.ready_to_close ? "DONE" : "NEEDS_WORK",
         confidence: 0.5,
         reasoning: `Validation error: ${errorMsg}`
       };
     }
   }

  /**
   * Get container children information
   */
  private async getContainerChildrenInfo(issue: BeadsIssue): Promise<{
    total: number;
    completed: number;
  }> {
    try {
      const { execBeadsCommand } = await import("./beads.ts");
      const output = await execBeadsCommand(["dep", "list", issue.id, "--json"]);
      const deps = JSON.parse(output);

      if (!Array.isArray(deps)) {
        return { total: 0, completed: 0 };
      }

      const children = deps.filter((dep: any) => dep.dependency_type === "parent-child");
      let completed = 0;

      for (const dep of children) {
        try {
          const childOutput = await execBeadsCommand(["show", dep.id, "--json"]);
          const childIssue = JSON.parse(childOutput);

          if (childIssue.status === "closed") {
            completed++;
          }
        } catch (error) {
          console.warn(`Failed to get child status for ${dep.id}: ${error}`);
        }
      }

      return { total: children.length, completed };
    } catch (error) {
      console.warn(`Failed to get container children info for ${issue.id}: ${error}`);
      return { total: 0, completed: 0 };
    }
  }

  /**
   * Parse container validation response
   */
  private parseContainerValidationResponse(response: string): {
    outcome: "DONE" | "NEEDS_WORK" | "UNCLEAR";
    confidence: number;
    reasoning: string;
    recommendations?: string[];
  } {
    let sanitized = response.trim();
    sanitized = sanitized.replace(/^```json\s*/, "");
    sanitized = sanitized.replace(/^```\s*/, "");
    sanitized = sanitized.replace(/\s*```$/, "");

    let parsed: any;
    try {
      parsed = JSON.parse(sanitized);
    } catch (error) {
      console.warn(`Failed to parse container validation response: ${error}`);
      return {
        outcome: "UNCLEAR",
        confidence: 0.3,
        reasoning: "Failed to parse validation response"
      };
    }

    const outcome = parsed.decision || "UNCLEAR";
    const validOutcomes = ["DONE", "NEEDS_WORK", "UNCLEAR"];

    if (!validOutcomes.includes(outcome)) {
      console.warn(`Invalid container validation outcome: ${outcome}`);
      return {
        outcome: "UNCLEAR",
        confidence: 0.3,
        reasoning: `Invalid outcome in response: ${outcome}`
      };
    }

    return {
      outcome: outcome as "DONE" | "NEEDS_WORK" | "UNCLEAR",
      confidence: parsed.confidence || 0.5,
      reasoning: parsed.reasoning || "No reasoning provided",
      recommendations: parsed.recommendations
    };
  }

  /**
   * Execute worker assistant to determine next action
   */
  private async executeWorkerAssistant(
    issueId: string,
    outcome: RunOutcome,
    phase: string
  ): Promise<"advance" | "retry" | "block"> {
    const config = loadConfig();
    const workerAssistant = config.worker_assistant;
    
    if (!workerAssistant?.enabled) {
      console.log(`Worker assistant disabled, returning fallback action: ${workerAssistant?.fallbackAction || "block"}`);
      return workerAssistant?.fallbackAction || "block";
    }
    
    const agent = this.agentRegistry.selectAgent({
      required_capabilities: [workerAssistant.agentCapability || "worker-assistant"]
    });
    
    if (!agent) {
      console.warn(`No worker assistant agent found with capability: ${workerAssistant.agentCapability || "worker-assistant"}`);
      return workerAssistant.fallbackAction || "block";
    }
    
    const issue = await getIssue(issueId);
    if (!issue) {
      console.warn(`Issue ${issueId} not found`);
      return workerAssistant.fallbackAction || "block";
    }
    
    const prompt = this.buildWorkerAssistantPrompt(issue, phase, outcome);
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Worker assistant timeout")), workerAssistant.timeoutMs);
    });
    
    try {
      const result = await Promise.race([
        this.opencode.runAgentCLI({
          directory: process.cwd(),
          title: `Worker Assistant: ${issue.id}`,
          agent: agent.id,
          message: prompt
        }),
        timeoutPromise
      ]) as any;
      
      if (!result.success) {
        console.warn(`Worker assistant execution failed: ${result.error}`);
        return workerAssistant.fallbackAction || "block";
      }
      
      const directive = this.parseWorkerAssistantResponse(result.output);
      
      console.log(`Worker assistant directive: ${directive}`);
      
      return directive;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`Worker assistant error: ${errorMsg}`);
      return workerAssistant.fallbackAction || "block";
    }
  }
  
  /**
   * Build prompt for worker assistant
   */
  private buildWorkerAssistantPrompt(
    issue: BeadsIssue,
    phase: string,
    outcome: RunOutcome
  ): string {
    const outcomeSummary = {
      success: outcome.success,
      message: outcome.message,
      warnings: outcome.warnings?.length || 0,
      artifacts: outcome.artifacts?.length || 0,
      error: outcome.error
    };
    
    return `
You are a Worker Assistant. Analyze the agent execution outcome and determine the next action.

# Issue Context
- ID: ${issue.id}
- Title: ${issue.title}
- Type: ${issue.issue_type}
- Current Phase: ${phase}

# Agent Outcome
${JSON.stringify(outcomeSummary, null, 2)}

${outcome.error_details ? `\n# Error Details\n${JSON.stringify(outcome.error_details, null, 2)}` : ""}

# Your Task
Based on the agent outcome, determine the best next action:

- ADVANCE: Move to the next phase (outcome is acceptable, minor issues only)
- RETRY: Retry the current phase (fixable issues detected)
- BLOCK: Block for human review (unclear outcome, complex problems, or serious issues)

# Response Format
Respond with ONLY one word: ADVANCE, RETRY, or BLOCK
`.trim();
  }
  
  /**
   * Parse worker assistant response
   */
  private parseWorkerAssistantResponse(response: string): "advance" | "retry" | "block" {
    const normalized = response.toUpperCase().trim();
    
    if (normalized.includes("ADVANCE")) {
      return "advance";
    } else if (normalized.includes("RETRY")) {
      return "retry";
    } else if (normalized.includes("BLOCK")) {
      return "block";
    }
    
    console.warn(`Could not parse worker assistant response: ${response}`);
    const config = loadConfig();
    return config.worker_assistant?.fallbackAction || "block";
  }

  /**
   * Handle sub-workflow triggering for containers
   */
  private async handleContainerSubWorkflow(
    issue: BeadsIssue,
    validationDecision: {
      outcome: "DONE" | "NEEDS_WORK" | "UNCLEAR";
      confidence: number;
      reasoning: string;
    },
    phase: string,
    policy: string
  ): Promise<void> {
    if (validationDecision.outcome !== "NEEDS_WORK") {
      return;
    }

    const containerCheck = await this.isContainerEpic(issue);

    if (!containerCheck.workflow_override) {
      console.log(`Container ${issue.id} needs work but no workflow override configured, using default policy`);
      return;
    }

    console.log(`Triggering sub-workflow '${containerCheck.workflow_override}' for container ${issue.id}`);

    this.logger.logDecision({
      run_id: this.currentRunId || "",
      type: "sub_workflow_trigger",
      decision: containerCheck.workflow_override,
      reasoning: `Container validation returned NEEDS_WORK, triggering configured sub-workflow`,
      metadata: {
        issue_id: issue.id,
        phase,
        policy,
        workflow_override: containerCheck.workflow_override,
        validation_outcome: validationDecision.outcome
      }
    });

    await this.startSubWorkflow(issue, containerCheck.workflow_override);
  }

  /**
   * Start a sub-workflow on a container
   */
  private async startSubWorkflow(issue: BeadsIssue, workflowName: string): Promise<void> {
    try {
      const { setPhaseLabel, hasAshepManagedLabel, updateIssue, setAshepManagedLabel } = await import("./beads.ts");

      const phases = this.policyEngine.getPhaseSequence(workflowName);
      if (!phases || phases.length === 0) {
        console.warn(`Workflow '${workflowName}' has no phases defined`);
        return;
      }

      const firstPhase = phases[0];
      
      await setPhaseLabel(issue.id, firstPhase);
      
      if (!await hasAshepManagedLabel(issue.id)) {
        await setAshepManagedLabel(issue.id);
      }

      await updateIssue(issue.id, { status: "open" });

      console.log(`Started sub-workflow '${workflowName}' on container ${issue.id} with phase '${firstPhase}'`);

      this.logger.logDecision({
        run_id: this.currentRunId || "",
        type: "sub_workflow_started",
        decision: firstPhase,
        reasoning: `Sub-workflow '${workflowName}' started, advancing to first phase`,
        metadata: {
          issue_id: issue.id,
          workflow: workflowName,
          first_phase: firstPhase
        }
      });
    } catch (error) {
      console.error(`Failed to start sub-workflow '${workflowName}' on container ${issue.id}: ${error}`);
      this.logger.logDecision({
        run_id: this.currentRunId || "",
        type: "sub_workflow_failed",
        decision: "failed",
        reasoning: `Failed to start sub-workflow: ${error instanceof Error ? error.message : String(error)}`,
        metadata: {
          issue_id: issue.id,
          workflow: workflowName,
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * Execute AI decision agent to determine transition
   */
  private async executeDecisionAgent(
    issueId: string,
    transition: PhaseTransition
  ): Promise<PhaseTransition> {
    console.log(`Executing decision agent ${transition.dynamic_agent} for issue ${issueId}`);

    const agent = this.agentRegistry.selectAgent({
      required_capabilities: [transition.dynamic_agent || ''],
      tags: ['decision']
    });

    if (!agent) {
      throw new Error(`No decision agent found with capability: ${transition.dynamic_agent}`);
    }

    const issue = await getIssue(issueId);
    if (!issue) {
      throw new Error(`Issue ${issueId} not found`);
    }

    const run = this.logger.getRun(this.currentRunId || '');
    if (!run || !run.outcome) {
      throw new Error(`No run found with ID ${this.currentRunId}`);
    }

    const maxRetries = 2;
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let instructions = this.policyEngine.buildDecisionInstructions(
        issue,
        transition.decision_config!,
        run.outcome,
        this.currentPhase || ''
      );

      if (attempt > 0) {
        console.log(`Retry attempt ${attempt}/${maxRetries} for decision agent`);
        instructions = instructions + `\n\nNote: Previous attempts failed. Please provide a clearer, more explicit decision following the required format.`;
      }

      const result = await this.opencode.runAgentCLI({
        directory: process.cwd(),
        title: `Decision: ${transition.dynamic_agent}${attempt > 0 ? ` (Attempt ${attempt})` : ''}`,
        agent: agent.id,
        message: instructions,
      });

      if (!result.success) {
        lastError = `Decision agent execution failed: ${result.error}`;
        console.error(lastError);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        
        throw new Error(lastError);
      }

      const decision = this.policyEngine.parseDecisionResponse(
        result.output,
        transition.decision_config!
      );

      if (!decision) {
        lastError = `Failed to parse decision response`;
        console.error(lastError);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        
        return {
          type: 'block',
          reason: `Decision requires approval: Failed to parse AI response after ${attempt + 1} attempts. Last error: ${lastError}`
        };
      }

      this.logger.logDecision({
        run_id: this.currentRunId || '',
        type: 'dynamic_decision',
        decision: decision.action,
        reasoning: decision.reasoning,
        metadata: {
          decision_agent_id: agent.id,
          capability: transition.dynamic_agent,
          prompt: transition.decision_config!.prompt,
          allowed_destinations: transition.decision_config!.allowed_destinations,
          confidence_thresholds: transition.decision_config!.confidence_thresholds,
          confidence: decision.confidence,
          target_phase: decision.target_phase,
          requires_approval: decision.requires_approval,
          issue_id: issue.id,
          from_phase: this.currentPhase,
          raw_response: result.output,
          parsed_decision: decision,
          attempt_number: attempt + 1,
          max_attempts: maxRetries + 1
        }
      });

      if (decision.requires_approval) {
        return {
          type: 'block',
          reason: `Decision requires approval: ${decision.reasoning}`
        };
      } else if (decision.target_phase) {
        return {
          type: decision.action.startsWith('jump_to_') ? 'jump_back' : 'advance',
          next_phase: decision.target_phase,
          reason: decision.reasoning
        };
      } else {
        return {
          type: 'close',
          reason: decision.reasoning
        };
      }
    }

    throw new Error(`Decision agent failed after ${maxRetries + 1} attempts: ${lastError}`);
  }

   /**
    * Generate approval note when HITL is triggered
    */
   private async generateApprovalNote(
     issueId: string,
     reason: string,
     details: string
   ): Promise<void> {
     const note = `🔔 HITL Required: ${reason}\n\n${details}\n\nPlease review and provide approval to proceed.`;
     await updateIssue(issueId, { notes: note });
   }

   /**
    * Generate container validation note when validation requires HITL
    */
   private async generateContainerValidationNote(
     issueId: string,
     validationDecision: {
       outcome: "DONE" | "NEEDS_WORK" | "UNCLEAR";
       confidence: number;
       reasoning: string;
       recommendations?: string[];
     }
   ): Promise<void> {
     const confidencePercent = Math.round(validationDecision.confidence * 100);

     let recommendationsText = "";
     if (validationDecision.recommendations && validationDecision.recommendations.length > 0) {
       recommendationsText = "\n\n## Recommendations\n" +
         validationDecision.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join("\n");
     }

     const note = `🔔 Container Validation Requires Human Review

## Validation Outcome: UNCLEAR

## Confidence
${confidencePercent}%

## Reasoning
${validationDecision.reasoning}${recommendationsText}

## Instructions
Please review the container epic and determine if it is complete or needs additional work. After review, choose one of the following actions:

1. **Close the issue** - If the container is complete and all work is done
2. **Remove HITL label and unblock** - If the container needs more work (it will be treated as a regular task)
3. **Add new subtasks** - If additional work is identified that wasn't captured

To override this HITL decision, remove the \`ashep-hitl:container-validation\` label and set the status to \`open\`.
`;
     await updateIssue(issueId, { notes: note });
   }

  /**
   * Resolve session reuse target from keyword or phase name
   */
  private resolveReuseTarget(
    phaseName: string,
    keyword: string,
    policy: PolicyConfig
  ): string | null {
    switch (keyword) {
      case "@shared":
        return policy.shared_session ? "@shared" : null;
      case "@previous":
        return this.getPreviousPhase(phaseName, policy);
      case "@self":
        return phaseName;
      case "@first":
        return policy.phases[0]?.name || null;
      default:
        return keyword;
    }
  }

  /**
   * Get previous phase in sequence
   */
  private getPreviousPhase(phaseName: string, policy: PolicyConfig): string | null {
    const phases = policy.phases.map((p) => p.name);
    const currentIndex = phases.indexOf(phaseName);
    if (currentIndex <= 0) {
      return null;
    }
    return phases[currentIndex - 1] || null;
  }

  /**
   * Find reusable session based on target and threshold
   */
  private async findReusableSession(
    issueId: string,
    target: string
  ): Promise<{ sessionId: string | null; shouldReuse: boolean }> {
    const runs =
      target === "@shared"
        ? this.logger.queryRuns({ issue_id: issueId, limit: 1 })
        : this.logger.queryRuns({
            issue_id: issueId,
            phase: target,
            status: "completed",
            limit: 1,
          });

    if (runs.length === 0) {
      return { sessionId: null, shouldReuse: false };
    }

    const sessionId = runs[0].session_id;
    if (!sessionId) {
      return { sessionId: null, shouldReuse: false };
    }

    const totalTokens = this.sumTokensForSession(sessionId, issueId);
    const maxTokens = this.getMaxTokens();
    const threshold = this.getThreshold();
    const shouldReuse = totalTokens < maxTokens * threshold;

    return { sessionId, shouldReuse };
  }

  /**
   * Sum all tokens for a specific session
   */
  private sumTokensForSession(sessionId: string, issueId: string): number {
    const runs = this.logger.queryRuns({ issue_id: issueId });
    let totalTokens = 0;

    for (const run of runs) {
      if (run.session_id === sessionId && run.outcome?.metrics?.tokens_used) {
        totalTokens += run.outcome.metrics.tokens_used;
      }
    }

    return totalTokens;
  }

  /**
   * Get max context tokens from config
   */
  private getMaxTokens(): number {
    const config = loadConfig();
    return config.session_continuation?.default_max_context_tokens || 130000;
  }

  /**
   * Get context window threshold from config
   */
  private getThreshold(phaseConfig?: PhaseConfig): number {
    if (phaseConfig?.context_window_threshold !== undefined) {
      return phaseConfig.context_window_threshold;
    }
    const config = loadConfig();
    return config.session_continuation?.default_threshold || 0.8;
  }
}

/**
 * Create a singleton Worker Engine instance
 */
let defaultWorkerEngine: WorkerEngine | null = null;

export function getWorkerEngine(config?: WorkerConfig): WorkerEngine {
  if (!defaultWorkerEngine) {
    defaultWorkerEngine = new WorkerEngine(config);
  }
  return defaultWorkerEngine;
}
