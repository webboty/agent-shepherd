/**
 * Worker Engine
 * Handles autonomous issue processing, agent selection, and run execution
 */

import { getReadyIssues, updateIssue, type BeadsIssue } from "./beads.ts";
import { getOpenCodeClient } from "./opencode.ts";
import { getPolicyEngine } from "./policy.ts";
import { getAgentRegistry } from "./agent-registry.ts";
import { getLogger, type RunOutcome } from "./logging.ts";

export interface WorkerConfig {
  poll_interval_ms?: number;
  max_concurrent_runs?: number;
  excluded_tags?: string[];
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

  constructor(config?: WorkerConfig) {
    this.config = {
      poll_interval_ms: 30000, // 30 seconds default
      max_concurrent_runs: 3,
      excluded_tags: ["ashep:excluded"],
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

    // Filter out excluded issues
    return readyIssues.filter((issue) => {
      // Check if issue has excluded tags in description or title
      const text = `${issue.title} ${issue.description}`.toLowerCase();
      return !this.config.excluded_tags!.some((tag) =>
        text.includes(tag.toLowerCase())
      );
    });
  }

  /**
   * Process a single issue
   */
  async processIssue(issue: BeadsIssue): Promise<ProcessResult> {
    console.log(`Processing issue: ${issue.id} - ${issue.title}`);

    // 1. Resolve policy and phase using matchPolicy
    const policy = this.policyEngine.matchPolicy(issue);
    const phases = this.policyEngine.getPhaseSequence(policy);
    const phase = phases[0] || "plan";

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

    // Log agent selection decision
    const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    
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
    const run = this.logger.createRun({
      id: runId,
      issue_id: issue.id,
      session_id: "",
      agent_id: agent.id,
      policy_name: policy,
      phase,
      status: "pending",
    });

    // 4. Update issue status to in_progress
    await updateIssue(issue.id, { status: "in_progress" });

    // 5. Launch agent in OpenCode
    let outcome: RunOutcome;
    try {
      outcome = await this.launchAgent(issue, agent.id, phase, policy);

      // Update run with outcome
      this.logger.updateRun(run.id, {
        status: outcome.success ? "completed" : "failed",
        outcome,
        completed_at: Date.now(),
      });
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
    const transition = this.policyEngine.determineTransition(policy, phase, {
      success: outcome.success,
      requires_approval: outcome.requires_approval,
    });

    // Log transition decision
    this.logger.logDecision({
      run_id: run.id,
      type: "phase_transition",
      decision: transition.type,
      reasoning: transition.reason,
      metadata: {
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
    issue: BeadsIssue,
    agentId: string,
    phase: string,
    policy: string
  ): Promise<RunOutcome> {
    // Get agent configuration
    const agent = this.agentRegistry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found in registry`);
    }

    // Get phase configuration to check for model override
    const phaseConfig = this.policyEngine.getPhaseConfig(policy, phase);

    // Determine model to use (priority: Phase > Agent > OpenCode default)
    let modelToUse: string | undefined;
    if (phaseConfig?.model) {
      // Phase-level model override (highest priority)
      modelToUse = phaseConfig.model;
      console.log(`Using phase-specified model: ${modelToUse}`);
    } else if (agent.model_id) {
      // Agent-level model configuration
      modelToUse = agent.provider_id ? `${agent.provider_id}/${agent.model_id}` : agent.model_id;
      console.log(`Using agent-configured model: ${modelToUse}`);
    } else {
      // OpenCode agent default (no override)
      console.log(`Using OpenCode agent default model`);
    }

    // Prepare instructions for the agent
    const instructions = this.buildInstructions(issue, phase, policy);

    console.log(`Running agent ${agentId} with OpenCode CLI...`);

    // Run agent using OpenCode CLI
    const result = await this.opencode.runAgentCLI({
      directory: process.cwd(),
      title: `${issue.id}: ${issue.title}`,
      agent: agentId,
      model: modelToUse,
      message: instructions,
    });

    if (!result.success) {
      console.error(`Agent execution failed: ${result.error}`);
      return {
        success: false,
        error: result.error || "Agent execution failed",
      };
    }

    console.log(`Agent execution completed successfully`);

    return {
      success: true,
      message: "Task completed by agent",
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
    transition: { type: string; next_phase?: string; reason?: string }
  ): Promise<void> {
    switch (transition.type) {
      case "advance":
        await updateIssue(issueId, { status: "open" });
        console.log(
          `Advanced to next phase: ${transition.next_phase || "unknown"}`
        );
        break;

      case "retry":
        await updateIssue(issueId, { status: "open" });
        console.log(`Retrying phase: ${transition.reason}`);
        break;

      case "block":
        await updateIssue(issueId, { status: "blocked" });
        console.log(`Blocked issue: ${transition.reason}`);
        break;

      case "close":
        await updateIssue(issueId, { status: "closed" });
        console.log(`Closed issue: ${transition.reason}`);
        break;
    }
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
