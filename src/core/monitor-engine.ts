/**
 * Monitor Engine
 * Handles supervision, stall detection, timeout enforcement, and HITL handling
 */

import { getLogger, type RunRecord } from "./logging.ts";
import { getOpenCodeClient } from "./opencode.ts";
import { getPolicyEngine } from "./policy.ts";
import { updateIssue } from "./beads.ts";

export interface MonitorConfig {
  poll_interval_ms?: number;
  stall_threshold_ms?: number;
  timeout_multiplier?: number;
}

export interface MonitorEvent {
  type: "stall" | "timeout" | "human_takeover" | "hitl" | "error";
  run_id: string;
  timestamp: number;
  details: string;
}

/**
 * Monitor Engine for supervising running agents
 */
export class MonitorEngine {
  private config: MonitorConfig;
  private logger = getLogger();
  private opencode = getOpenCodeClient();
  private policyEngine = getPolicyEngine();
  private isRunning = false;

  constructor(config?: MonitorConfig) {
    this.config = {
      poll_interval_ms: 10000, // 10 seconds default
      stall_threshold_ms: 60000, // 1 minute default
      timeout_multiplier: 1.0,
      ...config,
    };
  }

  /**
   * Start the monitor loop
   */
  async start(): Promise<void> {
    this.isRunning = true;
    console.log("Monitor Engine started");

    while (this.isRunning) {
      try {
        await this.monitorRunningRuns();
      } catch (error) {
        console.error("Error in monitor loop:", error);
      }

      // Wait before next check
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.poll_interval_ms)
      );
    }
  }

  /**
   * Stop the monitor loop
   */
  stop(): void {
    this.isRunning = false;
    console.log("Monitor Engine stopped");
  }

  /**
   * Monitor all running runs
   */
  private async monitorRunningRuns(): Promise<void> {
    const runningRuns = this.logger.queryRuns({ status: "running" });

    console.log(`Monitoring ${runningRuns.length} running runs`);

    for (const run of runningRuns) {
      try {
        await this.monitorRun(run);
      } catch (error) {
        console.error(`Error monitoring run ${run.id}:`, error);
      }
    }
  }

  /**
   * Monitor a single run
   */
  private async monitorRun(run: RunRecord): Promise<void> {
    // Check for stalls
    const isStalled = await this.detectStall(run);
    if (isStalled) {
      await this.handleStall(run);
      return;
    }

    // Check for timeouts
    const isTimedOut = await this.detectTimeout(run);
    if (isTimedOut) {
      await this.handleTimeout(run);
      return;
    }

    // Check for human takeover
    const hasTakeover = await this.detectHumanTakeover(run);
    if (hasTakeover) {
      await this.handleHumanTakeover(run);
      return;
    }

    // Check for HITL states
    const needsHITL = await this.detectHITL(run);
    if (needsHITL) {
      await this.handleHITL(run);
      return;
    }
  }

  /**
   * Detect if a run has stalled
   */
  private async detectStall(run: RunRecord): Promise<boolean> {
    if (!run.session_id) {
      return false;
    }

    try {
      const messages = await this.opencode.getMessages(run.session_id);
      if (messages.length === 0) {
        return false;
      }

      const lastMessage = messages[messages.length - 1];
      const now = Date.now();
      const lastMessageTime = lastMessage.time.created;

      const stallThreshold =
        this.policyEngine.getStallThreshold(run.policy_name) ||
        this.config.stall_threshold_ms!;

      return now - lastMessageTime > stallThreshold;
    } catch (error) {
      console.error(`Error detecting stall for run ${run.id}:`, error);
      return false;
    }
  }

  /**
   * Detect if a run has exceeded its timeout
   */
  private async detectTimeout(run: RunRecord): Promise<boolean> {
    const now = Date.now();
    const runDuration = now - run.created_at;

    const timeout =
      this.policyEngine.calculateTimeout(run.policy_name, run.phase) *
      this.config.timeout_multiplier!;

    return runDuration > timeout;
  }

  /**
   * Detect human takeover in session
   */
  private async detectHumanTakeover(run: RunRecord): Promise<boolean> {
    if (!run.session_id) {
      return false;
    }

    try {
      const messages = await this.opencode.getMessagesSince(
        run.session_id,
        run.updated_at
      );

      // Check if any messages are from humans
      return messages.some((msg) => this.opencode.isHumanMessage(msg));
    } catch (error) {
      console.error(`Error detecting takeover for run ${run.id}:`, error);
      return false;
    }
  }

  /**
   * Detect if run requires HITL
   */
  private async detectHITL(run: RunRecord): Promise<boolean> {
    // Check if run outcome indicates approval needed
    if (run.outcome?.requires_approval) {
      return true;
    }

    // Check if policy requires HITL
    return this.policyEngine.requiresHITL(run.policy_name);
  }

  /**
   * Handle stalled run
   */
  private async handleStall(run: RunRecord): Promise<void> {
    console.log(`Run ${run.id} has stalled`);

    this.logger.logDecision({
      run_id: run.id,
      type: "retry",
      decision: "stall_detected",
      reasoning: "No activity detected within stall threshold",
    });

    // Mark run as failed
    this.logger.updateRun(run.id, {
      status: "failed",
      outcome: {
        success: false,
        error: "Run stalled - no activity detected",
      },
      completed_at: Date.now(),
    });

    // Abort session if exists
    if (run.session_id) {
      try {
        await this.opencode.abortSession(run.session_id);
      } catch (error) {
        console.error(`Failed to abort session: ${error}`);
      }
    }

    // Update issue to open for retry
    await updateIssue(run.issue_id, { status: "open" });
  }

  /**
   * Handle timed out run
   */
  private async handleTimeout(run: RunRecord): Promise<void> {
    console.log(`Run ${run.id} has timed out`);

    this.logger.logDecision({
      run_id: run.id,
      type: "retry",
      decision: "timeout_exceeded",
      reasoning: "Run exceeded configured timeout",
    });

    // Mark run as failed
    this.logger.updateRun(run.id, {
      status: "failed",
      outcome: {
        success: false,
        error: "Run timed out",
      },
      completed_at: Date.now(),
    });

    // Abort session if exists
    if (run.session_id) {
      try {
        await this.opencode.abortSession(run.session_id);
      } catch (error) {
        console.error(`Failed to abort session: ${error}`);
      }
    }

    // Update issue to open for retry
    await updateIssue(run.issue_id, { status: "open" });
  }

  /**
   * Handle human takeover
   */
  private async handleHumanTakeover(run: RunRecord): Promise<void> {
    console.log(`Run ${run.id} has human takeover`);

    this.logger.logDecision({
      run_id: run.id,
      type: "hitl",
      decision: "human_takeover_detected",
      reasoning: "Human sent message in session",
    });

    // Mark run as blocked
    this.logger.updateRun(run.id, {
      status: "blocked",
    });

    // Update issue to blocked
    await updateIssue(run.issue_id, { status: "blocked" });
  }

  /**
   * Handle HITL requirement
   */
  private async handleHITL(run: RunRecord): Promise<void> {
    console.log(`Run ${run.id} requires HITL`);

    this.logger.logDecision({
      run_id: run.id,
      type: "hitl",
      decision: "hitl_required",
      reasoning: "Human approval required before proceeding",
    });

    // Mark run as blocked
    this.logger.updateRun(run.id, {
      status: "blocked",
    });

    // Update issue to blocked
    await updateIssue(run.issue_id, { status: "blocked" });
  }

  /**
   * Resume interrupted runs (called on startup)
   */
  async resumeInterruptedRuns(): Promise<void> {
    const runningRuns = this.logger.queryRuns({ status: "running" });

    console.log(`Found ${runningRuns.length} interrupted runs`);

    for (const run of runningRuns) {
      console.log(`Recovering run ${run.id}`);

      // Mark as failed and set issue back to open for retry
      this.logger.updateRun(run.id, {
        status: "failed",
        outcome: {
          success: false,
          error: "Run interrupted by system restart",
        },
        completed_at: Date.now(),
      });

      await updateIssue(run.issue_id, { status: "open" });
    }
  }
}

/**
 * Create a singleton Monitor Engine instance
 */
let defaultMonitorEngine: MonitorEngine | null = null;

export function getMonitorEngine(config?: MonitorConfig): MonitorEngine {
  if (!defaultMonitorEngine) {
    defaultMonitorEngine = new MonitorEngine(config);
  }
  return defaultMonitorEngine;
}
