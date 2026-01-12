/**
 * Crash Detection & Recovery Module
 * Detects abandoned tasks via heartbeat/lease and handles recovery
 */

import { getLastHeartbeat, getLeaseExpires, getAssignedWorker, setAssignedWorker, setLeaseExpires, type BeadsIssue, getIssue, listIssues } from "./beads.ts";
import { getPolicyEngine, type PhaseTransition, type PolicyEngine } from "./policy.ts";
import { getLogger, type RunOutcome } from "./logging.ts";

// Test mock storage - used by crash-detector.test.ts
const testMocks: {
  getLastHeartbeat: any;
  getLeaseExpires: any;
  getAssignedWorker: any;
  setAssignedWorker: any;
  setLeaseExpires: any;
  getIssue: any;
  listIssues: any;
} = {
  getLastHeartbeat: null,
  getLeaseExpires: null,
  getAssignedWorker: null,
  setAssignedWorker: null,
  setLeaseExpires: null,
  getIssue: null,
  listIssues: null,
};

// Export for tests to set mocks
export function setCrashDetectorTestMocks(mocks: Partial<typeof testMocks>): void {
  Object.assign(testMocks, mocks);
}

export function clearCrashDetectorTestMocks(): void {
  testMocks.getLastHeartbeat = null;
  testMocks.getLeaseExpires = null;
  testMocks.getAssignedWorker = null;
  testMocks.setAssignedWorker = null;
  testMocks.setLeaseExpires = null;
  testMocks.getIssue = null;
  testMocks.listIssues = null;
}

// Helper to use mock functions if set, otherwise call real function
async function mockableGetLastHeartbeat(epicId: string): Promise<number | null> {
  if (testMocks.getLastHeartbeat) return testMocks.getLastHeartbeat(epicId);
  return getLastHeartbeat(epicId);
}

async function mockableGetLeaseExpires(epicId: string): Promise<number | null> {
  if (testMocks.getLeaseExpires) return testMocks.getLeaseExpires(epicId);
  return getLeaseExpires(epicId);
}

async function mockableGetAssignedWorker(epicId: string): Promise<string | null> {
  if (testMocks.getAssignedWorker) return testMocks.getAssignedWorker(epicId);
  return getAssignedWorker(epicId);
}

async function mockableSetAssignedWorker(_epicId: string, _workerId: string): Promise<void> {
  if (testMocks.setAssignedWorker) return testMocks.setAssignedWorker(_epicId, _workerId);
  return setAssignedWorker(_epicId, _workerId);
}

async function mockableSetLeaseExpires(_epicId: string, _expiresAt: number): Promise<void> {
  if (testMocks.setLeaseExpires) return testMocks.setLeaseExpires(_epicId, _expiresAt);
  return setLeaseExpires(_epicId, _expiresAt);
}

async function mockableGetIssue(_issueId: string): Promise<any> {
  if (testMocks.getIssue) return testMocks.getIssue(_issueId);
  return getIssue(_issueId);
}

async function mockableListIssues(): Promise<any[]> {
  if (testMocks.listIssues) return testMocks.listIssues();
  return listIssues();
}

export interface CrashDetectionConfig {
  heartbeat_threshold_ms?: number;
  lease_duration_ms?: number;
  fallback_to_lease?: boolean;
}

export interface AbandonmentStatus {
  abandoned: boolean;
  reason?: string;
  heartbeatAge?: number | null;
  leaseExpired?: boolean;
  detectedMethod: "heartbeat" | "lease" | "both";
}

export interface RecoveryResult {
  recovered: boolean;
  action: "recovered" | "blocked" | "no_action";
  transition?: PhaseTransition;
  issueId: string;
  reason?: string;
}

/**
 * Crash Detection & Recovery System
 */
export class CrashDetector {
  private config: Required<CrashDetectionConfig>;
  private policyEngine: PolicyEngine;
  private logger: ReturnType<typeof getLogger>;
  private workerId: string;

  constructor(config?: CrashDetectionConfig) {
    this.config = {
      heartbeat_threshold_ms: config?.heartbeat_threshold_ms || 5 * 60 * 1000, // 5 minutes default
      lease_duration_ms: config?.lease_duration_ms || 30 * 60 * 1000, // 30 minutes default
      fallback_to_lease: config?.fallback_to_lease !== false,
    };

    this.policyEngine = getPolicyEngine();
    this.logger = getLogger();
    this.workerId = process.env.ASHEP_WORKER_ID || "default";
  }

  /**
   * Check if an epic's task has been abandoned
   * Uses heartbeat detection first, falls back to lease expiry
   */
  async checkAbandonment(epicId: string): Promise<AbandonmentStatus> {
    const now = Date.now();
    let heartbeatAge: number | null = null;
    let heartbeatStale: boolean | null = null;
    let leaseExpired: boolean | null = null;

    try {
      const lastHeartbeat = await mockableGetLastHeartbeat(epicId);

        if (lastHeartbeat !== null) {
          heartbeatAge = now - lastHeartbeat;
          heartbeatStale = heartbeatAge > this.config.heartbeat_threshold_ms;
        }

      // Check lease as backup/secondary check
      const leaseExpires = await mockableGetLeaseExpires(epicId);
      leaseExpired = leaseExpires === null || now > leaseExpires;
    } catch (error) {
      console.warn(`Failed to check abandonment for ${epicId}:`, error);
      
      if (this.config.fallback_to_lease) {
        leaseExpired = await this.checkLeaseExpiryOnly(epicId);
        heartbeatStale = null;
      }
    }

    // Determine abandonment status
    if (heartbeatStale !== null) {
      if (heartbeatStale) {
        return {
          abandoned: true,
          reason: `Heartbeat stale (${heartbeatAge !== null ? this.formatDuration(heartbeatAge) : 'unknown'} > ${this.formatDuration(this.config.heartbeat_threshold_ms)})`,
          heartbeatAge: heartbeatAge ?? undefined,
          leaseExpired: leaseExpired ?? undefined,
          detectedMethod: leaseExpired ?? false ? "both" : "heartbeat",
        };
      }

      // Heartbeat is alive, not abandoned
      return {
        abandoned: false,
        heartbeatAge: heartbeatAge ?? undefined,
        leaseExpired: leaseExpired ?? undefined,
        detectedMethod: "heartbeat",
      };
    }

    // Fallback to lease-only detection
    if (leaseExpired) {
      return {
        abandoned: true,
        reason: `Lease expired without heartbeat data`,
        leaseExpired: true,
        detectedMethod: "lease",
      };
    }

    return {
      abandoned: false,
      detectedMethod: "lease",
    };
  }

  /**
   * Check lease expiry only (fallback when heartbeat unavailable)
   */
  private async checkLeaseExpiryOnly(epicId: string): Promise<boolean> {
    const now = Date.now();
    const leaseExpires = await mockableGetLeaseExpires(epicId);
    return leaseExpires === null || now > leaseExpires;
  }

  /**
   * Recover an abandoned task
   * Marks run as failed and applies policy transition
   */
  async recoverAbandonedTask(
    _epicId: string,
    issueId: string,
    _sessionId: string,
    currentPhase: string,
    abandonmentReason: string
  ): Promise<RecoveryResult> {
    console.log(`Recovering abandoned task: ${issueId} - ${abandonmentReason}`);

    // Find active run for this issue/session
    const activeRuns = this.logger.queryRuns({
      issue_id: issueId,
      status: "in_progress",
      limit: 1,
    });

    if (activeRuns.length === 0) {
      console.warn(`No active run found for issue ${issueId}, skipping recovery`);
      return {
        recovered: false,
        action: "no_action",
        issueId,
        reason: "No active run to recover",
      };
    }

    const run = activeRuns[0];

    // Mark run as failed with crash context
    const crashOutcome: RunOutcome = {
      success: false,
      error: `Task abandoned: ${abandonmentReason}`,
      error_details: {
        type: "crash",
        message: abandonmentReason,
      },
      metrics: {
        duration_ms: Date.now() - run.created_at,
        start_time_ms: run.created_at,
        end_time_ms: Date.now(),
      },
    };

    this.logger.updateRun(run.id, {
      status: "failed",
      outcome: crashOutcome,
      completed_at: Date.now(),
    });

    // Get policy for this issue
    const issue = await mockableGetIssue(issueId);
    if (!issue) {
      console.error(`Issue ${issueId} not found, cannot recover`);
      return {
        recovered: false,
        action: "no_action",
        issueId,
        reason: "Issue not found",
      };
    }

    const policy = this.policyEngine.matchPolicy(issue);

    // Determine transition with constraints (never close, prefer retry/block)
    const transition = await this.determineRecoveryTransition(
      policy,
      currentPhase,
      issueId,
      crashOutcome
    );

    // Log recovery decision
    this.logger.logDecision({
      run_id: run.id,
      type: "phase_transition",
      decision: transition.type,
      reasoning: `Crash recovery: ${abandonmentReason}`,
      metadata: {
        from_phase: currentPhase,
        to_phase: transition.next_phase,
        crash_context: {
          abandonment_reason: abandonmentReason,
          recovered_by: this.workerId,
        },
      },
    });

    // Apply transition
    await this.applyRecoveryTransition(issueId, transition);

    return {
      recovered: true,
      action: "recovered",
      transition,
      issueId,
      reason: abandonmentReason,
    };
  }

  /**
   * Determine transition for recovery with constraints
   * Never closes issues, prefers retry or block
   */
  private async determineRecoveryTransition(
    policy: string,
    currentPhase: string,
    issueId: string,
    crashOutcome: RunOutcome
  ): Promise<PhaseTransition> {
    // Crash outcome is used for decision context but not directly for transition
    void crashOutcome;

    // Try normal transition first
    const transition = await this.policyEngine.determineTransition(policy, currentPhase, {
      success: false,
      retry_count: 0,
    }, issueId);

    // Constrain: never close on crash recovery
    if (transition.type === "close") {
      console.warn(`Transition attempted to close ${issueId} on crash, overriding to block`);
      return {
        type: "block",
        reason: `Crash recovery requires human review: ${transition.reason}`,
      };
    }

    // Prefer retry if possible (most common recovery action)
    if (transition.type === "retry") {
      return transition;
    }

    // If advance, block instead to ensure human review
    if (transition.type === "advance") {
      console.warn(`Crash recovery attempted to advance ${issueId}, overriding to block for review`);
      return {
        type: "block",
        reason: `Crash recovered but requires human review before advancing: ${transition.reason}`,
      };
    }

    // Return transition as-is for block, jump_back, or dynamic_decision
    return transition;
  }

  /**
   * Apply recovery transition to issue
   */
  private async applyRecoveryTransition(
    issueId: string,
    transition: PhaseTransition
  ): Promise<void> {
    const { updateIssue } = await import("./beads.ts");

    switch (transition.type) {
      case "retry":
        await updateIssue(issueId, { status: "open" });
        break;

      case "block":
        await updateIssue(issueId, { status: "blocked" });
        break;

      case "advance":
      case "jump_back":
        await updateIssue(issueId, { status: "open" });
        break;

      case "dynamic_decision":
        await updateIssue(issueId, { status: "blocked" });
        break;

      default:
        console.warn(`Unknown transition type: ${(transition as any).type}`);
    }
  }

  /**
   * Claim an epic with crash detection and recovery
   * Checks for active assignments, recovers abandoned tasks, sets coordination states
   */
  async claimEpic(
    epicId: string,
    subtreeIssues: BeadsIssue[]
  ): Promise<{ claimed: boolean; reason?: string; recoveredIssues?: string[] }> {
    const recoveredIssues: string[] = [];

    try {
      // Check for active assignment
      const assignedWorker = await mockableGetAssignedWorker(epicId);

      if (assignedWorker) {
        // Check if it's our assignment
        if (assignedWorker === this.workerId) {
          const expired = await this.checkLeaseExpiryOnly(epicId);

          if (!expired) {
            // We own it and lease is valid
            return {
              claimed: true,
              reason: "Already owned with valid lease",
            };
          }

          // Our lease expired, reclaim it
          console.log(`Reclaiming expired lease for ${epicId}`);
        } else {
          // Another worker owns it, check for abandonment
          const abandonment = await this.checkAbandonment(epicId);

          if (!abandonment.abandoned) {
            return {
              claimed: false,
              reason: `Owned by ${assignedWorker} with active task`,
            };
          }

          console.log(`Recovering abandoned epic from ${assignedWorker}: ${abandonment.reason}`);

          // Recover abandoned tasks in subtree
          for (const issue of subtreeIssues) {
            const recoveryResult = await this.recoverAbandonedTask(
              epicId,
              issue.id,
              "", // Session ID unknown
              await this.getCurrentPhase(issue.id),
              abandonment.reason || "Task abandoned"
            );

            if (recoveryResult.recovered) {
              recoveredIssues.push(issue.id);
            }
          }
        }
      }

      // Set coordination states
      await mockableSetAssignedWorker(epicId, this.workerId);
      const leaseExpires = Date.now() + this.config.lease_duration_ms;
      await mockableSetLeaseExpires(epicId, leaseExpires);

      console.log(
        `Claimed epic ${epicId} (lease expires: ${new Date(leaseExpires).toISOString()})`
      );

      return {
        claimed: true,
        reason: "Successfully claimed epic",
        recoveredIssues: recoveredIssues.length > 0 ? recoveredIssues : undefined,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Failed to claim epic ${epicId}:`, error);
      return {
        claimed: false,
        reason: `Claim failed: ${errorMsg}`,
      };
    }
  }

  /**
   * Get current phase for an issue
   */
  private async getCurrentPhase(issueId: string): Promise<string> {
    try {
      const { getCurrentPhase } = await import("./beads.ts");
      const phase = await getCurrentPhase(issueId);
      return phase || "unknown";
    } catch {
      return "unknown";
    }
  }

  /**
   * Format duration for human-readable output
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Get epic subtree issues
   * Returns all tasks under an epic
   */
  async getEpicSubtree(epicId: string): Promise<BeadsIssue[]> {
    const allIssues = await mockableListIssues();
    const subtree: BeadsIssue[] = [];

    for (const issue of allIssues) {
      if (issue.id.startsWith(epicId) && issue.id !== epicId) {
        subtree.push(issue);
      }
    }

    return subtree;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CrashDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<CrashDetectionConfig> {
    return { ...this.config };
  }
}

/**
 * Singleton instance
 */
let defaultCrashDetector: CrashDetector | null = null;

export function getCrashDetector(config?: CrashDetectionConfig): CrashDetector {
  if (!defaultCrashDetector) {
    defaultCrashDetector = new CrashDetector(config);
  }
  return defaultCrashDetector;
}

export function resetCrashDetector(): void {
  defaultCrashDetector = null;
}
