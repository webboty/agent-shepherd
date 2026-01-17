/**
 * Monitor Engine
 * Handles supervision, stall detection, timeout enforcement, and HITL handling
 */

import { getLogger, type RunRecord } from "./logging.ts";
import { getPolicyEngine } from "./policy.ts";
import { updateIssue, setLastHeartbeat } from "./beads.ts";

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
  // eslint-disable-next-line no-unused-vars
  private async detectStall(run: RunRecord): Promise<boolean> {
    if (!run.session_id) {
      // If no session ID, we can't check activity.
      // If it's been in "running" state for too long without a session ID, it's definitely stalled/crashed.
      const now = Date.now();
      const runDuration = now - run.created_at;
      // Allow some buffer for session creation (e.g. 5 minutes)
      return runDuration > 5 * 60 * 1000;
    }

    try {
      const { getSDKClient } = await import("./opencode_sdk.ts");
      const sdkClient = getSDKClient();
      
      const threshold = this.config.stall_threshold_ms || 60000;
      const result = await sdkClient.checkSessionHeartbeat(run.session_id, threshold);
      
      if (result.stale) {
        console.log(`Stall detected for run ${run.id} (session ${run.session_id}): No activity for ${Math.round((result.lastActivityAge || 0) / 1000)}s (threshold: ${threshold}ms)`);
      } else {
        // Run is alive - broadcast heartbeat to Beads for distributed coordination
        const epicId = this.extractEpicId(run.issue_id);
        if (epicId) {
          try {
            await setLastHeartbeat(epicId, Date.now());
          } catch (error) {
            console.warn(`Failed to update heartbeat for epic ${epicId}: ${error}`);
          }
        }
      }
      
      return result.stale;
    } catch (error) {
      console.warn(`Failed to check stall status for run ${run.id}: ${error}`);
      return false; // Fail safe
    }
  }

  /**
   * Extract epic ID from issue ID
   */
  private extractEpicId(issueId: string): string | null {
    if (!issueId) return null;
    // If issue ID is an epic (no dot notation), return as-is
    if (!issueId.includes(".")) return issueId;
    // Extract epic ID from nested task ID (e.g., "agent-shepherd-123.1" -> "agent-shepherd-123")
    const parts = issueId.split(".");
    // Assume epic is everything except the last part if it's a number? 
    // Or just the first part if standard format?
    // Let's stick to the previous logic: first part if format is Project-123.1
    if (parts.length >= 2) {
        return parts[0];
    }
    return parts[0]; 
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

    // CLI execution doesn't support real-time human intervention detection
    // For now, return false
    return false;
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

    // No session to abort with CLI execution

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

    // No session to abort with CLI execution

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
