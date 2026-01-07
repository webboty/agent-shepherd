/**
 * Retention Policy Manager
 * Manages data retention policies for garbage collection
 */

import { getLogger } from "./logging.ts";

export interface RetentionPolicy {
  name: string;
  description?: string;
  enabled: boolean;

  age_days: number;
  max_runs: number;
  max_size_mb: number;

  archive_enabled: boolean;
  archive_after_days?: number;

  delete_after_days?: number;

  status_filter?: string[];
  phase_filter?: string[];

  keep_successful_runs?: boolean;
  keep_failed_runs?: boolean;
}

export interface CleanupMetrics {
  timestamp: number;
  policy_name: string;
  operation: "archive" | "delete" | "cleanup";

  runs_processed: number;
  runs_archived: number;
  runs_deleted: number;

  bytes_archived: number;
  bytes_deleted: number;

  duration_ms: number;

  error?: string;
}

export interface ArchiveRecord {
  id: string;
  original_run_id: string;
  archived_at: number;
  retention_policy: string;

  run_data: string;
  outcome_data?: string;
  decision_data?: string;

  compressed_size?: number;
  scheduled_delete_at?: number;
}

/**
 * Retention Policy Manager
 */
export class RetentionPolicyManager {
  private policies: Map<string, RetentionPolicy> = new Map();
  private metrics: CleanupMetrics[] = [];
  private maxMetricsHistory: number = 1000;
  private logger: ReturnType<typeof getLogger>;

  constructor(policies: RetentionPolicy[], logger?: ReturnType<typeof getLogger>) {
    this.logger = logger || getLogger();

    for (const policy of policies) {
      if (policy.enabled) {
        this.policies.set(policy.name, policy);
      }
    }
  }

  /**
   * Get all enabled policies
   */
  getPolicies(): RetentionPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Get a specific policy by name
   */
  getPolicy(name: string): RetentionPolicy | null {
    return this.policies.get(name) || null;
  }

  /**
   * Check if a run should be archived based on retention policies
   */
  shouldArchiveRun(
    runData: any,
    outcome?: any
  ): { shouldArchive: boolean; policy?: RetentionPolicy } {
    const now = Date.now();
    const ageMs = now - runData.created_at;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    for (const policy of this.policies.values()) {
      if (!policy.archive_enabled) {
        continue;
      }

      const archiveAfterDays = policy.archive_after_days || policy.age_days;

      if (ageDays >= archiveAfterDays) {
        if (this.matchesPolicy(runData, outcome, policy)) {
          return { shouldArchive: true, policy };
        }
      }
    }

    return { shouldArchive: false };
  }

  /**
   * Check if a run should be deleted based on retention policies
   */
  shouldDeleteRun(
    runData: any,
    outcome?: any
  ): { shouldDelete: boolean; policy?: RetentionPolicy } {
    const now = Date.now();
    const ageMs = now - runData.created_at;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    for (const policy of this.policies.values()) {
      if (policy.delete_after_days && ageDays >= policy.delete_after_days) {
        if (this.matchesPolicy(runData, outcome, policy)) {
          return { shouldDelete: true, policy };
        }
      }
    }

    return { shouldDelete: false };
  }

  /**
   * Check if a run matches a retention policy
   */
  private matchesPolicy(
    runData: any,
    outcome: any,
    policy: RetentionPolicy
  ): boolean {
    if (policy.status_filter && policy.status_filter.length > 0) {
      if (!policy.status_filter.includes(runData.status)) {
        return false;
      }
    }

    if (policy.phase_filter && policy.phase_filter.length > 0) {
      if (!policy.phase_filter.includes(runData.phase)) {
        return false;
      }
    }

    if (policy.keep_successful_runs === true && outcome && outcome.success) {
      return false;
    }

    if (policy.keep_failed_runs === false && outcome && !outcome.success) {
      return true;
    }

    return true;
  }

  /**
   * Check if cleanup is needed based on size limits
   */
  needsCleanup(
    totalRuns: number,
    totalSizeBytes: number
  ): { needsCleanup: boolean; reason?: string; policy?: RetentionPolicy } {
    const totalSizeMB = totalSizeBytes / (1024 * 1024);

    for (const policy of this.policies.values()) {
      if (policy.max_runs && totalRuns > policy.max_runs) {
        return {
          needsCleanup: true,
          reason: `Exceeds max_runs limit (${totalRuns} > ${policy.max_runs})`,
          policy,
        };
      }

      if (policy.max_size_mb && totalSizeMB > policy.max_size_mb) {
        return {
          needsCleanup: true,
          reason: `Exceeds max_size_mb limit (${totalSizeMB.toFixed(2)}MB > ${policy.max_size_mb}MB)`,
          policy,
        };
      }
    }

    return { needsCleanup: false };
  }

  /**
   * Record cleanup metrics
   */
  recordMetrics(metrics: CleanupMetrics): void {
    this.metrics.push(metrics);

    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics.shift();
    }

    this.logger.logDecision({
      run_id: "system",
      type: "dynamic_decision",
      decision: "retention_policy_executed",
      reasoning: `Cleanup completed: ${metrics.operation} - ${metrics.runs_archived} archived, ${metrics.runs_deleted} deleted`,
      metadata: {
        metrics,
      },
    });
  }

  /**
   * Get cleanup metrics
   */
  getMetrics(options?: {
    policy_name?: string;
    operation?: string;
    since?: number;
    limit?: number;
  }): CleanupMetrics[] {
    let filtered = this.metrics;

    if (options?.policy_name) {
      filtered = filtered.filter((m) => m.policy_name === options.policy_name);
    }

    if (options?.operation) {
      filtered = filtered.filter((m) => m.operation === options.operation);
    }

    if (options && "since" in options) {
      const since = options.since;
      if (since !== undefined) {
        filtered = filtered.filter((m) => m.timestamp >= since);
      }
    }

    filtered.sort((a, b) => b.timestamp - a.timestamp);

    if (options?.limit) {
      return filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * Get aggregate metrics
   */
  getAggregateMetrics(): {
    total_runs_processed: number;
    total_runs_archived: number;
    total_runs_deleted: number;
    total_bytes_archived: number;
    total_bytes_deleted: number;
    last_cleanup: number | null;
    average_duration_ms: number;
  } {
    if (this.metrics.length === 0) {
      return {
        total_runs_processed: 0,
        total_runs_archived: 0,
        total_runs_deleted: 0,
        total_bytes_archived: 0,
        total_bytes_deleted: 0,
        last_cleanup: null,
        average_duration_ms: 0,
      };
    }

    const totalRunsProcessed = this.metrics.reduce(
      (sum, m) => sum + m.runs_processed,
      0
    );
    const totalRunsArchived = this.metrics.reduce(
      (sum, m) => sum + m.runs_archived,
      0
    );
    const totalRunsDeleted = this.metrics.reduce(
      (sum, m) => sum + m.runs_deleted,
      0
    );
    const totalBytesArchived = this.metrics.reduce(
      (sum, m) => sum + m.bytes_archived,
      0
    );
    const totalBytesDeleted = this.metrics.reduce(
      (sum, m) => sum + m.bytes_deleted,
      0
    );
    const averageDuration =
      this.metrics.reduce((sum, m) => sum + m.duration_ms, 0) /
      this.metrics.length;

    return {
      total_runs_processed: totalRunsProcessed,
      total_runs_archived: totalRunsArchived,
      total_runs_deleted: totalRunsDeleted,
      total_bytes_archived: totalBytesArchived,
      total_bytes_deleted: totalBytesDeleted,
      last_cleanup: Math.max(...this.metrics.map((m) => m.timestamp)),
      average_duration_ms: Math.round(averageDuration),
    };
  }
}

let defaultManager: RetentionPolicyManager | null = null;

export function getRetentionPolicyManager(
  policies: RetentionPolicy[],
  logger?: ReturnType<typeof getLogger>
): RetentionPolicyManager {
  if (!defaultManager) {
    defaultManager = new RetentionPolicyManager(policies, logger);
  }
  return defaultManager;
}

export function resetManager(): void {
  defaultManager = null;
}
