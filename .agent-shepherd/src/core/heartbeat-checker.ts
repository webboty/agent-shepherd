/**
 * Heartbeat Checker Process
 * Background daemon monitoring active sessions and updating Beads state
 * 
 * This process:
 * - Polls the logging system for active runs
 * - Checks session activity via OpenCode SDK
 * - Updates Beads state with last heartbeat timestamp
 * - Emits events for monitoring and debugging
 */

import { EventEmitter } from "events";
import { getSDKClient } from "./opencode_sdk.js";
import { getLogger } from "./logging.js";
import { execBeadsCommand } from "./beads.js";

export interface HeartbeatCheckerConfig {
  pollIntervalMs?: number;
  staleThresholdMs?: number;
}

export interface HeartbeatUpdate {
  epicId: string;
  sessionId: string;
  timestamp: number;
  alive: boolean;
  stale: boolean;
}

export interface HeartbeatStats {
  totalChecked: number;
  aliveSessions: number;
  staleSessions: number;
  errorCount: number;
}

/**
 * Heartbeat Checker Daemon
 * Monitors active sessions and updates Beads state
 */
export class HeartbeatChecker extends EventEmitter {
  private config: Required<HeartbeatCheckerConfig>;
  private sdkClient: ReturnType<typeof getSDKClient>;
  private logger: ReturnType<typeof getLogger>;
  private intervalId: NodeJS.Timeout | null;
  private isRunning: boolean;
  private stats: HeartbeatStats;

  constructor(config?: HeartbeatCheckerConfig) {
    super();

    this.config = {
      pollIntervalMs: config?.pollIntervalMs || 30000, // 30 seconds default
      staleThresholdMs: config?.staleThresholdMs || 5 * 60 * 1000, // 5 minutes default
    };

    this.sdkClient = getSDKClient();
    this.logger = getLogger();
    this.intervalId = null;
    this.isRunning = false;
    this.stats = {
      totalChecked: 0,
      aliveSessions: 0,
      staleSessions: 0,
      errorCount: 0,
    };
  }

  /**
   * Start the heartbeat checker daemon
   */
  start(): void {
    if (this.isRunning) {
      console.warn("Heartbeat checker is already running");
      return;
    }

    this.isRunning = true;
    this.emit("started", this.config);

    // Perform initial check
    this.checkHeartbeats();

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkHeartbeats();
    }, this.config.pollIntervalMs);

    console.log(`Heartbeat checker started (polling every ${this.config.pollIntervalMs}ms)`);
  }

  /**
   * Stop the heartbeat checker daemon
   */
  stop(): void {
    if (!this.isRunning) {
      console.warn("Heartbeat checker is not running");
      return;
    }

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.emit("stopped");
    console.log("Heartbeat checker stopped");
  }

  /**
   * Check if the heartbeat checker is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get current statistics
   */
  getStats(): HeartbeatStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalChecked: 0,
      aliveSessions: 0,
      staleSessions: 0,
      errorCount: 0,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): Required<HeartbeatCheckerConfig> {
    return { ...this.config };
  }

  /**
   * Perform heartbeat check for all active runs
   */
  private async checkHeartbeats(): Promise<void> {
    try {
      this.emit("check-started");

      // Get all active runs from logging system
      const activeRuns = this.logger.queryRuns({ status: "in_progress" });

      this.stats.totalChecked += activeRuns.length;

      for (const run of activeRuns) {
        await this.checkRunHeartbeat(run);
      }

      this.emit("check-completed", {
        runCount: activeRuns.length,
        stats: this.getStats(),
      });
    } catch (error) {
      this.stats.errorCount++;
      this.emit("error", error);
      console.error("Heartbeat check failed:", error);
    }
  }

  /**
   * Check heartbeat for a specific run
   */
  private async checkRunHeartbeat(run: any): Promise<void> {
    try {
      const epicId = this.extractEpicId(run.issue_id);
      const sessionId = run.session_id;

      if (!epicId || !sessionId) {
        console.debug(`Skipping run with missing epic_id or session_id:`, run);
        return;
      }

      // Check session heartbeat via SDK
      const heartbeatResult = await this.sdkClient.checkSessionHeartbeat(
        sessionId,
        this.config.staleThresholdMs
      );

      const update: HeartbeatUpdate = {
        epicId,
        sessionId,
        timestamp: Date.now(),
        alive: heartbeatResult.alive,
        stale: heartbeatResult.stale,
      };

      // Update Beads state with last heartbeat
      await this.updateEpicHeartbeatState(epicId, heartbeatResult.lastActivity);

      // Update statistics
      if (heartbeatResult.alive) {
        this.stats.aliveSessions++;
      } else {
        this.stats.staleSessions++;
      }

      // Emit event for each heartbeat update
      this.emit("heartbeat-updated", update);
      this.emit(`heartbeat:${epicId}`, update);

      console.debug(
        `Heartbeat check for ${epicId} (${sessionId}): alive=${heartbeatResult.alive}, stale=${heartbeatResult.stale}`
      );
    } catch (error) {
      this.stats.errorCount++;
      this.emit("error", error);
      console.error(`Failed to check heartbeat for run:`, error);
    }
  }

  /**
   * Update Beads state with last heartbeat timestamp
   */
  private async updateEpicHeartbeatState(epicId: string, lastActivity: number | null): Promise<void> {
    try {
      const timestamp = lastActivity || Date.now();
      const timestampMs = Math.floor(timestamp);

      await execBeadsCommand([
        "set-state",
        epicId,
        `last-heartbeat=${timestampMs}`,
      ]);

      console.debug(`Updated heartbeat state for ${epicId}: ${timestampMs}`);
    } catch (error) {
      console.error(`Failed to update heartbeat state for ${epicId}:`, error);
      throw error;
    }
  }

  /**
   * Extract epic ID from issue ID
   * Handles both direct epic IDs and nested task IDs
   */
  private extractEpicId(issueId: string): string | null {
    if (!issueId) {
      return null;
    }

    // If issue ID is an epic (no dot notation), return as-is
    if (!issueId.includes(".")) {
      return issueId;
    }

    // Extract epic ID from nested task ID (e.g., "agent-shepherd-123.1" -> "agent-shepherd-123")
    const parts = issueId.split(".");
    return parts[0];
  }
}

/**
 * Global singleton instance for convenience
 */
let defaultHeartbeatChecker: HeartbeatChecker | null = null;

export function getHeartbeatChecker(config?: HeartbeatCheckerConfig): HeartbeatChecker {
  if (!defaultHeartbeatChecker) {
    defaultHeartbeatChecker = new HeartbeatChecker(config);
  }
  return defaultHeartbeatChecker;
}

/**
 * Reset singleton instance (mainly for testing)
 */
export function resetHeartbeatChecker(): void {
  if (defaultHeartbeatChecker) {
    defaultHeartbeatChecker.stop();
    defaultHeartbeatChecker = null;
  }
}
