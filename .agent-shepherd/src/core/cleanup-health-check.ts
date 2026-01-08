/**
 * Health Check System
 * Verifies cleanup operations worked correctly and didn't corrupt data
 */

import { Database } from "bun:sqlite";
import { existsSync, statSync } from "fs";
import { join } from "path";
import { getLogger } from "./logging.ts";

export interface HealthCheckResult {
  check_name: string;
  passed: boolean;
  message: string;
  details?: {
    [key: string]: unknown;
  };
  timestamp: number;
}

export interface CleanupHealthReport {
  timestamp: number;
  overall_health: "healthy" | "warning" | "critical";
  checks: HealthCheckResult[];
  summary: {
    total_checks: number;
    passed_checks: number;
    failed_checks: number;
    warning_checks: number;
  };
}

export interface HealthCheckConfig {
  dataDir?: string;
  run_vacuum?: boolean;
  check_integrity?: boolean;
  check_queries?: boolean;
  check_archive?: boolean;
}

/**
 * Health Check for cleanup operations
 */
export class CleanupHealthChecker {
  private dataDir: string;
  private logger: ReturnType<typeof getLogger>;
  private config: HealthCheckConfig;

  constructor(config: HealthCheckConfig = {}) {
    this.dataDir = config.dataDir || join(process.cwd(), ".agent-shepherd");
    this.logger = getLogger(this.dataDir);
    this.config = {
      run_vacuum: config.run_vacuum ?? true,
      check_integrity: config.check_integrity ?? true,
      check_queries: config.check_queries ?? true,
      check_archive: config.check_archive ?? true,
      ...config,
    };
  }

  /**
   * Run all health checks
   */
  async runHealthChecks(): Promise<CleanupHealthReport> {
    const checks: HealthCheckResult[] = [];

    if (this.config.check_integrity) {
      checks.push(await this.checkDatabaseIntegrity());
    }

    if (this.config.check_queries) {
      checks.push(await this.checkQueryFunctionality());
    }

    if (this.config.check_archive) {
      checks.push(await this.checkArchiveAccessibility());
      checks.push(await this.checkArchiveConsistency());
    }

    checks.push(await this.checkSizeReduction());
    checks.push(await this.checkIndexHealth());

    if (this.config.run_vacuum) {
      checks.push(await this.runVacuumOptimization());
    }

    const passedChecks = checks.filter((c) => c.passed).length;
    const failedChecksCount = checks.filter((c) => !c.passed && c.message.includes("Critical")).length;
    const warningChecksCount = checks.filter((c) => !c.passed && !c.message.includes("Critical")).length;

    let overallHealth: "healthy" | "warning" | "critical" = "healthy";

    if (failedChecksCount > 0) {
      overallHealth = "critical";
    } else if (warningChecksCount > 0) {
      overallHealth = "warning";
    }

    const report: CleanupHealthReport = {
      timestamp: Date.now(),
      overall_health: overallHealth,
      checks,
      summary: {
        total_checks: checks.length,
        passed_checks: passedChecks,
        failed_checks: failedChecksCount,
        warning_checks: warningChecksCount,
      },
    };

    return report;
  }

  /**
   * Check database integrity
   */
  private async checkDatabaseIntegrity(): Promise<HealthCheckResult> {
    const dbPath = join(this.dataDir, "runs.db");

    if (!existsSync(dbPath)) {
      return {
        check_name: "Database Integrity",
        passed: true,
        message: "Database file does not exist (not an error)",
        timestamp: Date.now(),
      };
    }

    const db = new Database(dbPath);

    try {
      const integrityResult = db.prepare("PRAGMA integrity_check").get() as any;

      db.close();

      const isOk = integrityResult.integrity_check === "ok";

      return {
        check_name: "Database Integrity",
        passed: isOk,
        message: isOk ? "Database integrity check passed" : `Database integrity check failed: ${JSON.stringify(integrityResult)}`,
        details: { integrity_result: integrityResult },
        timestamp: Date.now(),
      };
    } catch (error) {
      db.close();

      return {
        check_name: "Database Integrity",
        passed: false,
        message: `Critical: Database integrity check failed with error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Check query functionality
   */
  private async checkQueryFunctionality(): Promise<HealthCheckResult> {
    try {
      this.logger.queryRuns({ limit: 1 });
      this.logger.queryRuns({ status: "completed" });
      this.logger.queryRuns({ issue_id: "test-issue" });

      return {
        check_name: "Query Functionality",
        passed: true,
        message: "All test queries executed successfully",
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        check_name: "Query Functionality",
        passed: false,
        message: `Critical: Query functionality check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Check archive accessibility
   */
  private async checkArchiveAccessibility(): Promise<HealthCheckResult> {
    const { ArchiveLogger } = await import("./archive-logger.ts");

    try {
      const archiveLogger = new ArchiveLogger(this.dataDir);

      archiveLogger.queryRuns({ limit: 1 });
      const archivedRunCount = archiveLogger.getArchivedRunCount();
      const archiveSize = archiveLogger.getArchiveSize();

      archiveLogger.close();

      return {
        check_name: "Archive Accessibility",
        passed: true,
        message: "Archive database is accessible",
        details: {
          archived_run_count: archivedRunCount,
          archive_size_bytes: archiveSize,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        check_name: "Archive Accessibility",
        passed: false,
        message: `Critical: Archive accessibility check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Check archive consistency
   */
  private async checkArchiveConsistency(): Promise<HealthCheckResult> {
    const { ArchiveLogger } = await import("./archive-logger.ts");

    try {
      const archiveLogger = new ArchiveLogger(this.dataDir);

      const dbPath = join(this.dataDir, "archive", "archive.db");
      if (!existsSync(dbPath)) {
        archiveLogger.close();

        return {
          check_name: "Archive Consistency",
          passed: true,
          message: "Archive database does not exist (not an error)",
          timestamp: Date.now(),
        };
      }

      const db = new Database(dbPath);

      const integrityResult = db.prepare("PRAGMA integrity_check").get() as any;

      const foreignKeyCheck = db.prepare("PRAGMA foreign_key_check").get() as any;

      db.close();
      archiveLogger.close();

      const integrityOk = integrityResult.integrity_check === "ok";
      const foreignKeysOk = !Array.isArray(foreignKeyCheck) || foreignKeyCheck.length === 0;

      const passed = integrityOk && foreignKeysOk;

      return {
        check_name: "Archive Consistency",
        passed,
        message: passed ? "Archive database consistency check passed" : "Critical: Archive database consistency check failed",
        details: {
          integrity_ok: integrityOk,
          foreign_keys_ok: foreignKeysOk,
          integrity_result: integrityResult,
          foreign_key_result: foreignKeyCheck,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        check_name: "Archive Consistency",
        passed: false,
        message: `Critical: Archive consistency check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Check size reduction
   */
  private async checkSizeReduction(): Promise<HealthCheckResult> {
    const dbPath = join(this.dataDir, "runs.db");

    if (!existsSync(dbPath)) {
      return {
        check_name: "Size Reduction",
        passed: true,
        message: "Database file does not exist (not an error)",
        timestamp: Date.now(),
      };
    }

    try {
      const fileSize = statSync(dbPath).size;
      const fileSizeMb = fileSize / (1024 * 1024);

      const db = new Database(dbPath);

      const pageCountResult = db.prepare("PRAGMA page_count").get() as any;
      const pageSizeResult = db.prepare("PRAGMA page_size").get() as any;

      const pageCount = pageCountResult.page_count;
      const pageSize = pageSizeResult.page_size;
      const expectedSize = pageCount * pageSize;

      const sizeDifference = Math.abs(fileSize - expectedSize);
      const sizeDifferencePercent = (sizeDifference / fileSize) * 100;

      const freePagesResult = db.prepare("PRAGMA freelist_count").get() as any;
      const freePages = freePagesResult.freelist_count;
      const wastedSpace = freePages * pageSize;
      const wastedSpacePercent = (wastedSpace / fileSize) * 100;

      db.close();

      const passed = sizeDifferencePercent < 5;

      return {
        check_name: "Size Reduction",
        passed,
        message: passed
          ? `Database size is reasonable (${fileSizeMb.toFixed(2)}MB)`
          : `Warning: Database size difference is ${sizeDifferencePercent.toFixed(2)}% (${(sizeDifference / (1024 * 1024)).toFixed(2)}MB)`,
        details: {
          file_size_bytes: fileSize,
          file_size_mb: fileSizeMb.toFixed(2),
          expected_size_bytes: expectedSize,
          size_difference_bytes: sizeDifference,
          size_difference_percent: sizeDifferencePercent.toFixed(2),
          free_pages: freePages,
          wasted_space_bytes: wastedSpace,
          wasted_space_percent: wastedSpacePercent.toFixed(2),
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        check_name: "Size Reduction",
        passed: false,
        message: `Critical: Size reduction check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Check index health
   */
  private async checkIndexHealth(): Promise<HealthCheckResult> {
    const dbPath = join(this.dataDir, "runs.db");

    if (!existsSync(dbPath)) {
      return {
        check_name: "Index Health",
        passed: true,
        message: "Database file does not exist (not an error)",
        timestamp: Date.now(),
      };
    }

    try {
      const db = new Database(dbPath);

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'")
        .all() as any[];

      const indexStats: Array<{ name: string; size: number; scans: number }> = [];

      for (const index of indexes) {
        const stats = db.prepare(`PRAGMA index_xinfo(${index.name})`).all() as any[];
        const indexInfo = db.prepare(`PRAGMA index_info(${index.name})`).all() as any[];

        indexStats.push({
          name: index.name,
          size: stats.length,
          scans: indexInfo.length,
        });
      }

      db.close();

      return {
        check_name: "Index Health",
        passed: true,
        message: `All ${indexes.length} indexes are present and functional`,
        details: {
          index_count: indexes.length,
          indexes: indexStats,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        check_name: "Index Health",
        passed: false,
        message: `Critical: Index health check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Run vacuum optimization
   */
  private async runVacuumOptimization(): Promise<HealthCheckResult> {
    const dbPath = join(this.dataDir, "runs.db");

    if (!existsSync(dbPath)) {
      return {
        check_name: "Vacuum Optimization",
        passed: true,
        message: "Database file does not exist (not an error)",
        timestamp: Date.now(),
      };
    }

    try {
      const sizeBefore = statSync(dbPath).size;

      const db = new Database(dbPath);

      db.run("VACUUM");

      db.close();

      const sizeAfter = statSync(dbPath).size;
      const sizeSaved = sizeBefore - sizeAfter;
      const sizeSavedPercent = (sizeSaved / sizeBefore) * 100;

      return {
        check_name: "Vacuum Optimization",
        passed: true,
        message: `Vacuum completed: ${(sizeSaved / (1024 * 1024)).toFixed(2)}MB freed (${sizeSavedPercent.toFixed(2)}% reduction)`,
        details: {
          size_before_bytes: sizeBefore,
          size_after_bytes: sizeAfter,
          size_saved_bytes: sizeSaved,
          size_saved_percent: sizeSavedPercent.toFixed(2),
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        check_name: "Vacuum Optimization",
        passed: false,
        message: `Warning: Vacuum optimization failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      };
    }
  }
}

let defaultHealthChecker: CleanupHealthChecker | null = null;

export function getHealthChecker(config?: HealthCheckConfig): CleanupHealthChecker {
  if (!defaultHealthChecker) {
    defaultHealthChecker = new CleanupHealthChecker(config);
  }
  return defaultHealthChecker;
}

export function resetHealthChecker(): void {
  defaultHealthChecker = null;
}
