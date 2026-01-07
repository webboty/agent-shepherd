/**
 * Cleanup Engine
 * Handles startup cleanup and scheduled garbage collection
 */

import { loadConfig } from "./config.ts";
import {
  getGarbageCollector,
  resetCollector,
} from "./garbage-collector.ts";

export interface CleanupEngineConfig {
  dataDir?: string;
  runOnStartup?: boolean;
  cleanupInterval?: number;
  retentionConfig?: {
    enabled: boolean;
    cleanup_on_startup: boolean;
    cleanup_interval_ms: number;
    archive_enabled: boolean;
    policies: any[];
  };
}

/**
 * Cleanup Engine for scheduled garbage collection
 */
export class CleanupEngine {
  private config: CleanupEngineConfig;
  private collector: ReturnType<typeof getGarbageCollector> | null = null;
  private isRunning = false;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private lastCleanupTime: number = 0;

  constructor(config?: CleanupEngineConfig) {
    const fullConfig = loadConfig();

    this.config = {
      dataDir: config?.dataDir,
      runOnStartup:
        config?.runOnStartup ??
        fullConfig.retention?.cleanup_on_startup ??
        false,
      cleanupInterval:
        config?.cleanupInterval ??
        fullConfig.retention?.cleanup_interval_ms ??
        3600000,
      retentionConfig: fullConfig.retention
        ? {
            enabled: fullConfig.retention.enabled,
            cleanup_on_startup: fullConfig.retention.cleanup_on_startup,
            cleanup_interval_ms: fullConfig.retention.cleanup_interval_ms,
            archive_enabled: fullConfig.retention.archive_enabled,
            policies: fullConfig.retention.policies || [],
          }
        : undefined,
      ...config,
    };

    if (
      this.config.retentionConfig?.enabled &&
      this.config.retentionConfig.policies.length > 0
    ) {
      this.collector = getGarbageCollector({
        dataDir: this.config.dataDir,
        policies: this.config.retentionConfig.policies,
        archiveEnabled: this.config.retentionConfig.archive_enabled,
      });
    }
  }

  /**
   * Start cleanup engine
   */
  async start(): Promise<void> {
    if (!this.config.retentionConfig?.enabled) {
      console.log("Cleanup Engine: retention policies disabled, skipping startup");
      return;
    }

    if (!this.collector) {
      console.warn("Cleanup Engine: no garbage collector initialized");
      return;
    }

    this.isRunning = true;
    console.log("Cleanup Engine started");

    if (this.config.runOnStartup) {
      await this.runStartupCleanup();
    }

    this.startScheduledCleanup();
  }

  /**
   * Stop cleanup engine
   */
  stop(): void {
    this.isRunning = false;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    console.log("Cleanup Engine stopped");
  }

  /**
   * Run startup cleanup
   */
  async runStartupCleanup(): Promise<void> {
    if (!this.collector) {
      console.warn("Startup cleanup: no garbage collector available");
      return;
    }

    console.log("Running startup cleanup...");
    const startTime = Date.now();

    try {
      const results = await this.collector.runFullCleanup();

      for (const result of results) {
        if (result.success) {
          console.log(
            `Startup cleanup ${result.metrics.operation} completed: ${result.metrics.runs_archived} archived, ${result.metrics.runs_deleted} deleted (${result.metrics.duration_ms}ms)`
          );
        } else {
          console.error(
            `Startup cleanup ${result.metrics.operation} failed: ${result.error}`
          );
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Startup cleanup completed in ${duration}ms`);

      this.lastCleanupTime = Date.now();
    } catch (error) {
      console.error("Startup cleanup error:", error);
    }
  }

  /**
   * Start scheduled cleanup
   */
  private startScheduledCleanup(): void {
    if (!this.config.cleanupInterval || this.config.cleanupInterval <= 0) {
      console.log("Scheduled cleanup: disabled (no interval set)");
      return;
    }

    console.log(
      `Scheduled cleanup: running every ${this.config.cleanupInterval}ms`
    );

    this.cleanupInterval = setInterval(async () => {
      if (!this.isRunning) {
        return;
      }

      await this.runScheduledCleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Run scheduled cleanup
   */
  async runScheduledCleanup(): Promise<void> {
    if (!this.collector) {
      console.warn("Scheduled cleanup: no garbage collector available");
      return;
    }

    const now = Date.now();
    const timeSinceLastCleanup = now - this.lastCleanupTime;
    const minCleanupInterval = Math.max(this.config.cleanupInterval || 0, 60000);

    if (timeSinceLastCleanup < minCleanupInterval) {
      console.log(
        `Scheduled cleanup skipped: last run was ${timeSinceLastCleanup}ms ago (minimum: ${minCleanupInterval}ms)`
      );
      return;
    }

    console.log("Running scheduled cleanup...");
    const startTime = Date.now();

    try {
      const results = await this.collector.runFullCleanup();

      for (const result of results) {
        if (result.success) {
          console.log(
            `Scheduled cleanup ${result.metrics.operation} completed: ${result.metrics.runs_archived} archived, ${result.metrics.runs_deleted} deleted (${result.metrics.duration_ms}ms)`
          );
        } else {
          console.error(
            `Scheduled cleanup ${result.metrics.operation} failed: ${result.error}`
          );
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Scheduled cleanup completed in ${duration}ms`);

      this.lastCleanupTime = Date.now();
    } catch (error) {
      console.error("Scheduled cleanup error:", error);
    }
  }

  /**
   * Run immediate cleanup (manual trigger)
   */
  async runImmediateCleanup(): Promise<{
    success: boolean;
    results: any[];
    duration: number;
  }> {
    if (!this.collector) {
      return {
        success: false,
        results: [],
        duration: 0,
      };
    }

    const startTime = Date.now();

    try {
      const results = await this.collector.runFullCleanup();
      return {
        success: true,
        results,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error("Immediate cleanup error:", error);
      return {
        success: false,
        results: [],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Get cleanup metrics
   */
  getMetrics(options?: {
    policy_name?: string;
    operation?: string;
    since?: number;
    limit?: number;
  }): any[] {
    if (!this.collector) {
      return [];
    }

    const policyManager = (this.collector as any).policyManager;
    return policyManager.getMetrics(options);
  }

  /**
   * Get aggregate cleanup metrics
   */
  getAggregateMetrics(): any {
    if (!this.collector) {
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

    const policyManager = (this.collector as any).policyManager;
    return policyManager.getAggregateMetrics();
  }

  /**
   * Close resources
   */
  close(): void {
    this.stop();

    if (this.collector) {
      this.collector.close();
      resetCollector();
    }
  }
}

let defaultEngine: CleanupEngine | null = null;

export function getCleanupEngine(config?: CleanupEngineConfig): CleanupEngine {
  if (!defaultEngine) {
    defaultEngine = new CleanupEngine(config);
  }
  return defaultEngine;
}

export function resetCleanupEngine(): void {
  if (defaultEngine) {
    defaultEngine.close();
    defaultEngine = null;
  }
}
