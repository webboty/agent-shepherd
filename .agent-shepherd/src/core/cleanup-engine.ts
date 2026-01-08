/**
 * Cleanup Engine
 * Handles startup cleanup and scheduled garbage collection
 */

import { loadConfig } from "./config.ts";
import {
  getGarbageCollector,
  resetCollector,
} from "./garbage-collector.ts";
import {
  type CleanupConfig,
  type RetentionConfig,
} from "./config.ts";
import { getHealthChecker } from "./cleanup-health-check.ts";
import { join } from "path";

export interface CleanupEngineConfig {
  dataDir?: string;
  runOnStartup?: boolean;
  cleanupInterval?: number;
  cleanupConfig?: CleanupConfig;
  retentionConfig?: RetentionConfig;
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
  private dataDir: string;

  constructor(config?: CleanupEngineConfig) {
    const fullConfig = loadConfig();

    const cleanupIntervalMs = fullConfig.cleanup?.schedule_interval_hours
      ? fullConfig.cleanup.schedule_interval_hours * 3600000
      : 3600000;

    this.config = {
      dataDir: config?.dataDir,
      runOnStartup:
        config?.runOnStartup ?? fullConfig.cleanup?.run_on_startup ?? false,
      cleanupInterval:
        config?.cleanupInterval ?? cleanupIntervalMs,
      cleanupConfig: fullConfig.cleanup
        ? {
            enabled: fullConfig.cleanup.enabled,
            run_on_startup: fullConfig.cleanup.run_on_startup,
            archive_on_startup: fullConfig.cleanup.archive_on_startup ?? false,
            delete_on_startup: fullConfig.cleanup.delete_on_startup ?? false,
            schedule_interval_hours: fullConfig.cleanup.schedule_interval_hours ?? 24,
          }
        : undefined,
      retentionConfig: fullConfig.retention
        ? {
            enabled: fullConfig.retention.enabled,
            policies: fullConfig.retention.policies || [],
          }
        : undefined,
      ...config,
    };

    this.dataDir = this.config.dataDir || join(process.cwd(), ".agent-shepherd");

    if (
      this.config.retentionConfig?.enabled &&
      this.config.retentionConfig.policies.length > 0
    ) {
      this.collector = getGarbageCollector({
        dataDir: this.config.dataDir,
        policies: this.config.retentionConfig.policies,
        archiveEnabled: this.config.retentionConfig.policies.some(p => p.archive_enabled) ?? false,
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
   * Run health checks after cleanup
   */
  private async runHealthChecks(cleanupType: string): Promise<void> {
    try {
      console.log("Running health checks after cleanup...");
      const healthChecker = getHealthChecker({ dataDir: this.dataDir });
      const report = await healthChecker.runHealthChecks();

      const allPassed = report.checks.every((check: any) => check.passed);

      if (allPassed) {
        console.log(`Health checks passed after ${cleanupType} cleanup`);
      } else {
        console.warn(`Health check warnings after ${cleanupType} cleanup:`);
        for (const check of report.checks) {
          if (!check.passed) {
            console.warn(`  - ${check.check_name}: ${check.message}`);
          }
        }
      }
    } catch (error) {
      console.warn("Health check failed:", error instanceof Error ? error.message : String(error));
    }
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

      await this.runHealthChecks("startup");
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

      await this.runHealthChecks("scheduled");
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

      await this.runHealthChecks("immediate");

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
   * Run critical cleanup (more aggressive)
   */
  async runCriticalCleanup(): Promise<{
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
      console.log("Running critical cleanup (aggressive mode)...");
      const results = await this.collector.runFullCleanup();

      await this.runHealthChecks("critical");

      const duration = Date.now() - startTime;
      console.log(`Critical cleanup completed in ${duration}ms`);

      return {
        success: true,
        results,
        duration,
      };
    } catch (error) {
      console.error("Critical cleanup error:", error);
      return {
        success: false,
        results: [],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Run emergency cleanup (most aggressive)
   */
  async runEmergencyCleanup(): Promise<{
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
      console.log("Running emergency cleanup (maximum aggression mode)...");
      const results = await this.collector.runFullCleanup();

      await this.runHealthChecks("emergency");

      const duration = Date.now() - startTime;
      console.log(`Emergency cleanup completed in ${duration}ms`);

      return {
        success: true,
        results,
        duration,
      };
    } catch (error) {
      console.error("Emergency cleanup error:", error);
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
