/**
 * Worker Engine
 * Handles autonomous issue processing, agent selection, and run execution
 */

import {
  getReadyIssues,
  updateIssue,
  type BeadsIssue,
  setPhaseLabel,
  removePhaseLabels,
  setHITLLabel,
  clearHITLLabels,
  getCurrentPhase,
  hasExcludedLabel,
  getIssue,
} from "./beads.ts";
import { getOpenCodeClient } from "./opencode.ts";
import {
  getPolicyEngine,
  validateHITLReason,
  type PhaseTransition,
} from "./policy.ts";
import { getAgentRegistry } from "./agent-registry.ts";
import { getLogger, type RunOutcome } from "./logging.ts";
import { loadConfig } from "./config.ts";

export interface WorkerConfig {
  poll_interval_ms?: number;
  max_concurrent_runs?: number;
}

export interface ProcessResult {
  issue_id: string;
  run_id: string;
  success: boolean;
  message?: string;
  next_phase?: string;
}

/**
 * Worker Engine for autonomous issue processing
 */
export class WorkerEngine {
  private config: WorkerConfig;
  private policyEngine = getPolicyEngine();
  private agentRegistry = getAgentRegistry();
  private opencode = getOpenCodeClient();
  private logger = getLogger();
  private isRunning = false;
  private currentRunId: string | null = null;
  private currentPhase: string | null = null;

  constructor(config?: WorkerConfig) {
    this.config = {
      poll_interval_ms: 30000, // 30 seconds default
      max_concurrent_runs: 3,
      ...config,
    };
  }

  /**
   * Start the worker loop
   */
  async start(): Promise<void> {
    this.isRunning = true;
    console.log("Worker Engine started");

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
    const issues = await this.getEligibleIssues();

    console.log(`Found ${issues.length} eligible issues`);

    // Process each issue (could be parallelized with max_concurrent_runs)
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
  private async getEligibleIssues(): Promise<BeadsIssue[]> {
    const readyIssues = await getReadyIssues();

    // Filter out excluded issues by label
    const eligibleIssues: BeadsIssue[] = [];
    for (const issue of readyIssues) {
      const isExcluded = await hasExcludedLabel(issue.id);
      if (!isExcluded) {
        eligibleIssues.push(issue);
      } else {
        console.log(`Skipping excluded issue: ${issue.id} - ${issue.title}`);
      }
    }
    
    return eligibleIssues;
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

    console.log(`Using policy '${policy}' at phase '${phase}'`);

    // 2. Select appropriate agent
    const phaseConfig = this.policyEngine.getPhaseConfig(policy, phase);
    const agent = this.agentRegistry.selectAgent({
      required_capabilities: phaseConfig?.capabilities || [],
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

    // 5. Launch agent in OpenCode
    let outcome: RunOutcome;
    let sessionId: string | undefined;
    try {
      const launchResult = await this.launchAgent(run.id, issue, agent.id, phase, policy);
      outcome = launchResult.outcome;
      sessionId = launchResult.sessionId;

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
        };
      } else {
        updateData.metadata = {
          ...run.metadata,
          phase_total_duration_ms: currentPhaseTotal + currentDuration,
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
    const transition = await this.policyEngine.determineTransition(policy, phase, {
      success: outcome.success,
      retry_count: retryCount,
      requires_approval: outcome.requires_approval,
    }, issue.id);

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

    // 7. Update Beads state based on transition
    await this.applyTransition(issue.id, transition);

    return {
      issue_id: issue.id,
      run_id: run.id,
      success: outcome.success,
      message: transition.reason,
      next_phase: transition.next_phase,
    };
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
  ): Promise<{ outcome: RunOutcome; sessionId?: string }> {
    const startTimestamp = Date.now();

    const agent = this.agentRegistry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found in registry`);
    }

    const phaseConfig = this.policyEngine.getPhaseConfig(policy, phase);

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

    console.log(`Running agent ${agentId} with OpenCode CLI...`);

    const result = await this.opencode.runAgentCLI({
      directory: process.cwd(),
      title: `${issue.id}: ${issue.title}`,
      agent: agentId,
      model: modelToUse,
      message: instructions,
    });

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
      },
    };

    return {
      outcome,
      sessionId: parsedOutcome.session_id || result.sessionId,
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

    return `
# Task: ${issue.title}

## Issue Details
- ID: ${issue.id}
- Type: ${issue.issue_type}
- Priority: P${issue.priority}
- Status: ${issue.status}

## Description
${issue.description}

## Current Phase
**${phase}** ${phaseConfig?.description ? `- ${phaseConfig.description}` : ""}

## Required Capabilities
${phaseConfig?.capabilities?.map((cap) => `- ${cap}`).join("\n") || "None specified"}

## Instructions
Please complete the ${phase} phase for this issue. When done, provide a summary of your work.

${phaseConfig?.require_approval ? "\n⚠️ This phase requires human approval before proceeding.\n" : ""}
`.trim();
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
        await removePhaseLabels(issueId);
        await clearHITLLabels(issueId);
        console.log(`Closed issue: ${transition.reason}`);
        break;

      case "jump_back": {
        await updateIssue(issueId, { status: "open" });
        const targetPhase = transition.jump_target_phase || transition.next_phase;
        if (targetPhase) {
          await setPhaseLabel(issueId, targetPhase);
          await clearHITLLabels(issueId);
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
