/* eslint-disable */
/**
 * Size Monitor
 * Periodically checks database and file sizes, alerts on threshold violations
 */

import { existsSync, statSync } from "fs";
import { join } from "path";
import { getLogger } from "./logging.ts";
import { getCleanupEngine } from "./cleanup-engine.ts";

export interface SizeMetrics {
  active_db_size_bytes: number;
  archive_db_size_bytes: number;
  jsonl_size_bytes: number;
  archive_jsonl_size_bytes: number;
  total_size_bytes: number;
  total_size_mb: number;
  run_count: number;
  archive_run_count: number;
  timestamp: number;
}

export interface SizeAlert {
  severity: "warning" | "critical" | "emergency";
  type: "size_limit" | "file_size";
  message: string;
  current_value: number;
  threshold: number;
  unit: string;
  timestamp: number;
}

export interface SizeMonitorConfig {
  dataDir?: string;
  check_interval_ms?: number;
  warning_threshold_percent?: number;
  critical_threshold_percent?: number;
  emergency_threshold_percent?: number;
  max_size_mb?: number;
  max_file_size_mb?: number;
  alert_callback?: (alert: SizeAlert) => void;
}

/**
 * Size Monitor for database and file size tracking
 */
export class SizeMonitor {
  private config: Required<Omit<SizeMonitorConfig, "alert_callback">> & { alert_callback?: (alert: SizeAlert) => void };
  private logger: ReturnType<typeof getLogger>;
  private cleanupEngine: ReturnType<typeof getCleanupEngine>;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private sizeHistory: SizeMetrics[] = [];
  private maxHistoryLength = 100;

  constructor(config: SizeMonitorConfig = {}) {
    this.logger = getLogger(config.dataDir);
    this.cleanupEngine = getCleanupEngine({ dataDir: config.dataDir });

    const fullConfig = {
      dataDir: config.dataDir || join(process.cwd(), ".agent-shepherd"),
      check_interval_ms: config.check_interval_ms || 3600000,
      warning_threshold_percent: config.warning_threshold_percent || 90,
      critical_threshold_percent: config.critical_threshold_percent || 100,
      emergency_threshold_percent: config.emergency_threshold_percent || 110,
      max_size_mb: config.max_size_mb || 100,
      max_file_size_mb: config.max_file_size_mb || 50,
      alert_callback: config.alert_callback,
    };

    this.config = fullConfig as Required<Omit<SizeMonitorConfig, "alert_callback">> & { alert_callback?: (alert: SizeAlert) => void };
  }

  /**
   * Start size monitoring
   */
  start(): void {
    if (this.isRunning) {
      console.warn("Size Monitor: already running");
      return;
    }

    this.isRunning = true;
    console.log("Size Monitor started");

    this.checkSizes();

    this.checkInterval = setInterval(() => {
      if (!this.isRunning) {
        return;
      }

      this.checkSizes();
    }, this.config.check_interval_ms);
  }

  /**
   * Stop size monitoring
   */
  stop(): void {
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    console.log("Size Monitor stopped");
  }

  /**
   * Check current sizes and generate alerts
   */
  async checkSizes(): Promise<SizeMetrics> {
    const metrics = await this.collectSizeMetrics();
    this.sizeHistory.push(metrics);

    if (this.sizeHistory.length > this.maxHistoryLength) {
      this.sizeHistory.shift();
    }

    await this.checkThresholds(metrics);

    return metrics;
  }

  /**
   * Collect current size metrics
   */
  private async collectSizeMetrics(): Promise<SizeMetrics> {
    const dataDir = this.config.dataDir;
    const activeDbPath = join(dataDir, "runs.db");
    const jsonlPath = join(dataDir, "runs.jsonl");
    const decisionsPath = join(dataDir, "decisions.jsonl");
    const archiveDbPath = join(dataDir, "archive", "archive.db");
    const archiveJsonlPath = join(dataDir, "archive", "archive.jsonl");

    const activeDbSize = existsSync(activeDbPath) ? statSync(activeDbPath).size : 0;
    const jsonlSize = existsSync(jsonlPath) ? statSync(jsonlPath).size : 0;
    const decisionsSize = existsSync(decisionsPath) ? statSync(decisionsPath).size : 0;
    const archiveDbSize = existsSync(archiveDbPath) ? statSync(archiveDbPath).size : 0;
    const archiveJsonlSize = existsSync(archiveJsonlPath) ? statSync(archiveJsonlPath).size : 0;

    const totalSizeBytes = activeDbSize + jsonlSize + decisionsSize + archiveDbSize + archiveJsonlSize;
    const runCount = this.logger.queryRuns({}).length;

    const { ArchiveLogger } = await import("./archive-logger.ts");
    const archiveLogger = new ArchiveLogger(this.config.dataDir);
    const archiveRunCount = archiveLogger.getArchivedRunCount();
    archiveLogger.close();

    return {
      active_db_size_bytes: activeDbSize,
      archive_db_size_bytes: archiveDbSize,
      jsonl_size_bytes: jsonlSize + decisionsSize,
      archive_jsonl_size_bytes: archiveJsonlSize,
      total_size_bytes: totalSizeBytes,
      total_size_mb: totalSizeBytes / (1024 * 1024),
      run_count: runCount,
      archive_run_count: archiveRunCount,
      timestamp: Date.now(),
    };
  }

  /**
   * Check size thresholds and generate alerts
   */
  private async checkThresholds(metrics: SizeMetrics): Promise<void> {
    const maxSizeBytes = this.config.max_size_mb * 1024 * 1024;
    const sizePercent = (metrics.total_size_bytes / maxSizeBytes) * 100;

    if (sizePercent >= this.config.emergency_threshold_percent) {
      const alert: SizeAlert = {
        severity: "emergency",
        type: "size_limit",
        message: `Emergency: Total database size (${metrics.total_size_mb.toFixed(2)}MB) exceeds ${this.config.emergency_threshold_percent}% of limit (${this.config.max_size_mb}MB)`,
        current_value: metrics.total_size_mb,
        threshold: this.config.max_size_mb,
        unit: "MB",
        timestamp: Date.now(),
      };

      this.alert(alert);

      console.error(`[EMERGENCY] ${alert.message}`);
      await this.triggerEmergencyCleanup();
    } else if (sizePercent >= this.config.critical_threshold_percent) {
      const alert: SizeAlert = {
        severity: "critical",
        type: "size_limit",
        message: `Critical: Total database size (${metrics.total_size_mb.toFixed(2)}MB) exceeds ${this.config.critical_threshold_percent}% of limit (${this.config.max_size_mb}MB)`,
        current_value: metrics.total_size_mb,
        threshold: this.config.max_size_mb,
        unit: "MB",
        timestamp: Date.now(),
      };

      this.alert(alert);

      console.warn(`[CRITICAL] ${alert.message}`);
      await this.triggerCriticalCleanup();
    } else if (sizePercent >= this.config.warning_threshold_percent) {
      const alert: SizeAlert = {
        severity: "warning",
        type: "size_limit",
        message: `Warning: Total database size (${metrics.total_size_mb.toFixed(2)}MB) exceeds ${this.config.warning_threshold_percent}% of limit (${this.config.max_size_mb}MB)`,
        current_value: metrics.total_size_mb,
        threshold: this.config.max_size_mb,
        unit: "MB",
        timestamp: Date.now(),
      };

      this.alert(alert);

      console.log(`[WARNING] ${alert.message}`);
      await this.triggerScheduledCleanup();
    }

    if (this.config.max_file_size_mb) {
      const maxFileSizeBytes = this.config.max_file_size_mb * 1024 * 1024;

      if (metrics.active_db_size_bytes > maxFileSizeBytes) {
        const alert: SizeAlert = {
          severity: "critical",
          type: "file_size",
          message: `Critical: Active database file size (${(metrics.active_db_size_bytes / (1024 * 1024)).toFixed(2)}MB) exceeds limit (${this.config.max_file_size_mb}MB)`,
          current_value: metrics.active_db_size_bytes / (1024 * 1024),
          threshold: this.config.max_file_size_mb,
          unit: "MB",
          timestamp: Date.now(),
        };

        this.alert(alert);
      }

      if (metrics.archive_db_size_bytes > maxFileSizeBytes) {
        const alert: SizeAlert = {
          severity: "critical",
          type: "file_size",
          message: `Critical: Archive database file size (${(metrics.archive_db_size_bytes / (1024 * 1024)).toFixed(2)}MB) exceeds limit (${this.config.max_file_size_mb}MB)`,
          current_value: metrics.archive_db_size_bytes / (1024 * 1024),
          threshold: this.config.max_file_size_mb,
          unit: "MB",
          timestamp: Date.now(),
        };

        this.alert(alert);
      }
    }
  }

  /**
   * Alert callback
   */
  private alert(alert: SizeAlert): void {
    if (this.config.alert_callback) {
      this.config.alert_callback(alert);
    }
  }

  /**
   * Trigger scheduled cleanup
   */
  private async triggerScheduledCleanup(): Promise<void> {
    try {
      await this.cleanupEngine.runScheduledCleanup();
    } catch (error) {
      console.error("Scheduled cleanup triggered by size monitor failed:", error);
    }
  }

  /**
   * Trigger critical cleanup
   */
  private async triggerCriticalCleanup(): Promise<void> {
    try {
      await this.cleanupEngine.runCriticalCleanup();
    } catch (error) {
      console.error("Critical cleanup triggered by size monitor failed:", error);
    }
  }

  /**
   * Trigger emergency cleanup
   */
  private async triggerEmergencyCleanup(): Promise<void> {
    try {
      await this.cleanupEngine.runEmergencyCleanup();
    } catch (error) {
      console.error("Emergency cleanup triggered by size monitor failed:", error);
    }
  }

  /**
   * Get current size metrics
   */
  async getMetrics(): Promise<SizeMetrics> {
    return await this.collectSizeMetrics();
  }

  /**
   * Get size history
   */
  getHistory(limit?: number): SizeMetrics[] {
    let history = [...this.sizeHistory];

    if (limit) {
      history = history.slice(-limit);
    }

    return history;
  }

  /**
   * Get size trends
   */
  getTrends(hours: number = 24): {
    size_trend: "increasing" | "decreasing" | "stable";
    growth_rate_mb_per_hour: number;
    predicted_hours_to_limit: number | null;
  } {
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
    const recentMetrics = this.sizeHistory.filter((m) => m.timestamp >= cutoffTime);

    if (recentMetrics.length < 2) {
      return {
        size_trend: "stable",
        growth_rate_mb_per_hour: 0,
        predicted_hours_to_limit: null,
      };
    }

    const oldest = recentMetrics[0];
    const newest = recentMetrics[recentMetrics.length - 1];
    const timeDeltaHours = (newest.timestamp - oldest.timestamp) / (1000 * 60 * 60);
    const sizeDeltaMb = newest.total_size_mb - oldest.total_size_mb;

    const growthRate = timeDeltaHours > 0 ? sizeDeltaMb / timeDeltaHours : 0;

    let trend: "increasing" | "decreasing" | "stable" = "stable";

    if (growthRate > 1) {
      trend = "increasing";
    } else if (growthRate < -1) {
      trend = "decreasing";
    }

    let predictedHoursToLimit: number | null = null;

    if (growthRate > 0) {
      const remainingMb = this.config.max_size_mb - newest.total_size_mb;
      predictedHoursToLimit = growthRate > 0 ? remainingMb / growthRate : null;
    }

    return {
      size_trend: trend,
      growth_rate_mb_per_hour: growthRate,
      predicted_hours_to_limit: predictedHoursToLimit,
    };
  }
}

let defaultMonitor: SizeMonitor | null = null;

export function getSizeMonitor(config?: SizeMonitorConfig): SizeMonitor {
  if (!defaultMonitor) {
    defaultMonitor = new SizeMonitor(config);
  }
  return defaultMonitor;
}

export function resetSizeMonitor(): void {
  if (defaultMonitor) {
    defaultMonitor.stop();
    defaultMonitor = null;
  }
}
