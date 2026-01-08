/**
 * Garbage Collector
 * Handles archiving and deletion of old run data based on retention policies
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getLogger, type RunRecord } from "./logging.ts";
import {
  type RetentionPolicy,
  type CleanupMetrics,
  getRetentionPolicyManager,
} from "./retention-policy.ts";

export interface GarbageCollectorConfig {
  dataDir?: string;
  policies: RetentionPolicy[];
  archiveEnabled?: boolean;
}

export interface CleanupResult {
  success: boolean;
  metrics: CleanupMetrics;
  error?: string;
}

/**
 * Garbage Collector for run data management
 */
export class GarbageCollector {
  private logger = getLogger();
  private archiveDb: Database;
  private archiveJsonlPath: string;
  private dataDir: string;
  private policyManager: ReturnType<typeof getRetentionPolicyManager>;
  private isClosed = false;

  constructor(config: GarbageCollectorConfig) {
    this.dataDir = config.dataDir || join(process.cwd(), ".agent-shepherd");
    this.policyManager = getRetentionPolicyManager(config.policies);

    const archiveDir = join(this.dataDir, "archive");
    if (!existsSync(archiveDir)) {
      mkdirSync(archiveDir, { recursive: true });
    }

    const archiveDbPath = join(archiveDir, "archive.db");
    this.archiveDb = new Database(archiveDbPath);
    this.initializeArchiveSchema();

    this.archiveJsonlPath = join(archiveDir, "archive.jsonl");
  }

  /**
   * Initialize archive database schema
   */
  private initializeArchiveSchema(): void {
    this.archiveDb.run(`
      CREATE TABLE IF NOT EXISTS runs_archive (
        id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        policy_name TEXT NOT NULL,
        phase TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        outcome TEXT,
        metadata TEXT,
        archived_at INTEGER NOT NULL,
        retention_policy TEXT NOT NULL,
        scheduled_delete_at INTEGER
      )
    `);

    this.archiveDb.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_issue_id ON runs_archive(issue_id)
    `);

    this.archiveDb.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_agent_id ON runs_archive(agent_id)
    `);

    this.archiveDb.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_status ON runs_archive(status)
    `);

    this.archiveDb.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_issue_phase_status ON runs_archive(issue_id, phase, status)
    `);

    this.archiveDb.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_phase_completed ON runs_archive(phase, completed_at)
    `);

    this.archiveDb.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_issue_phase ON runs_archive(issue_id, phase)
    `);

    this.archiveDb.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_archived_at ON runs_archive(archived_at)
    `);

    this.archiveDb.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_scheduled_delete ON runs_archive(scheduled_delete_at)
    `);

    this.archiveDb.run(`
      CREATE TABLE IF NOT EXISTS decisions_archive (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        decision TEXT NOT NULL,
        reasoning TEXT,
        metadata TEXT,
        FOREIGN KEY (run_id) REFERENCES runs_archive(id)
      )
    `);

    this.archiveDb.run(`
      CREATE INDEX IF NOT EXISTS idx_decisions_archive_run_id ON decisions_archive(run_id)
    `);

    this.archiveDb.run(`
      CREATE INDEX IF NOT EXISTS idx_decisions_archive_type ON decisions_archive(type)
    `);

    this.archiveDb.run(`
      CREATE TABLE IF NOT EXISTS cleanup_metrics (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        policy_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        runs_processed INTEGER NOT NULL,
        runs_archived INTEGER NOT NULL,
        runs_deleted INTEGER NOT NULL,
        bytes_archived INTEGER NOT NULL,
        bytes_deleted INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        error TEXT
      )
    `);

    this.archiveDb.run(`
      CREATE INDEX IF NOT EXISTS idx_cleanup_metrics_timestamp ON cleanup_metrics(timestamp)
    `);

    this.archiveDb.run(`
      CREATE INDEX IF NOT EXISTS idx_cleanup_metrics_policy ON cleanup_metrics(policy_name)
    `);

    this.archiveDb.run(`
      CREATE INDEX IF NOT EXISTS idx_cleanup_metrics_operation ON cleanup_metrics(operation)
    `);
  }

  /**
   * Get all runs from the main database
   */
  private getAllRuns(): RunRecord[] {
    return this.logger.queryRuns({});
  }

  /**
   * Calculate size of run records in bytes
   */
  private calculateRunSize(run: any): number {
    return JSON.stringify(run).length * 2;
  }

  /**
   * Persist cleanup metrics to database
   */
  private persistMetrics(metrics: CleanupMetrics): void {
    try {
      if (this.isClosed) {
        console.warn("Cannot persist metrics: database is closed");
        return;
      }

      const id = `cleanup-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

      this.archiveDb.run(
        `
         INSERT INTO cleanup_metrics (
           id, timestamp, policy_name, operation,
           runs_processed, runs_archived, runs_deleted,
           bytes_archived, bytes_deleted, duration_ms, error
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       `,
        [
          id,
          metrics.timestamp,
          metrics.policy_name,
          metrics.operation,
          metrics.runs_processed,
          metrics.runs_archived,
          metrics.runs_deleted,
          metrics.bytes_archived,
          metrics.bytes_deleted,
          metrics.duration_ms,
          metrics.error || null,
        ]
      );
    } catch (error) {
      console.error("Failed to persist cleanup metrics:", error);
    }
  }

  /**
   * Archive old runs based on retention policies
   */
  async archiveOldRuns(): Promise<CleanupResult> {
    const startTime = Date.now();
    const metrics: CleanupMetrics = {
      timestamp: startTime,
      policy_name: "all",
      operation: "archive",
      runs_processed: 0,
      runs_archived: 0,
      runs_deleted: 0,
      bytes_archived: 0,
      bytes_deleted: 0,
      duration_ms: 0,
    };

    try {
      const runs = this.getAllRuns();
      metrics.runs_processed = runs.length;

      for (const run of runs) {
        const { shouldArchive, policy } = this.policyManager.shouldArchiveRun(
          run,
          run.outcome
        );

        if (shouldArchive && policy) {
          const success = await this.archiveRun(run, policy);
          if (success) {
            metrics.runs_archived++;
            metrics.bytes_archived += this.calculateRunSize(run);
          }
        }
      }

      metrics.duration_ms = Date.now() - startTime;
      this.persistMetrics(metrics);

      return { success: true, metrics };
    } catch (error) {
      const errorStr =
        error instanceof Error ? error.message : String(error);
      metrics.error = errorStr;
      metrics.duration_ms = Date.now() - startTime;

      this.persistMetrics(metrics);
      return { success: false, metrics, error: errorStr };
    }
  }

  /**
   * Archive a single run
   */
  private async archiveRun(
    run: RunRecord,
    policy: RetentionPolicy
  ): Promise<boolean> {
    try {
      this.archiveDb.run(
        `
        INSERT OR REPLACE INTO runs_archive (
          id, issue_id, session_id, agent_id, policy_name,
          phase, status, created_at, updated_at, completed_at,
          outcome, metadata, archived_at, retention_policy, scheduled_delete_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          run.id,
          run.issue_id,
          run.session_id,
          run.agent_id,
          run.policy_name,
          run.phase,
          run.status,
          run.created_at,
          run.updated_at,
          run.completed_at || null,
          run.outcome ? JSON.stringify(run.outcome) : null,
          run.metadata ? JSON.stringify(run.metadata) : null,
          Date.now(),
          policy.name,
          policy.delete_after_days
            ? Date.now() + policy.delete_after_days * 24 * 60 * 60 * 1000
            : null,
        ]
      );

      const decisions = this.logger.getDecisions(run.id);
      for (const decision of decisions) {
        this.archiveDb.run(
          `
          INSERT OR REPLACE INTO decisions_archive (
            id, run_id, timestamp, type, decision, reasoning, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
          [
            decision.id,
            decision.run_id,
            decision.timestamp,
            decision.type,
            decision.decision,
            decision.reasoning || null,
            decision.metadata ? JSON.stringify(decision.metadata) : null,
          ]
        );
      }

      const archiveRecord = {
        id: run.id,
        archived_at: Date.now(),
        retention_policy: policy.name,
      };

      const archiveLine = JSON.stringify(archiveRecord) + "\n";
      writeFileSync(this.archiveJsonlPath, archiveLine, { flag: "a" });

      this.deleteRunFromMain(run.id);

      return true;
    } catch (error) {
      console.error(`Failed to archive run ${run.id}:`, error);
      return false;
    }
  }

  /**
   * Delete ancient data from archive and main database
   */
  async deleteAncientData(): Promise<CleanupResult> {
    const startTime = Date.now();
    const metrics: CleanupMetrics = {
      timestamp: startTime,
      policy_name: "all",
      operation: "delete",
      runs_processed: 0,
      runs_archived: 0,
      runs_deleted: 0,
      bytes_archived: 0,
      bytes_deleted: 0,
      duration_ms: 0,
    };

    try {
      const now = Date.now();

      const archivedRunsStmt = this.archiveDb.prepare(
        "SELECT * FROM runs_archive WHERE scheduled_delete_at IS NOT NULL AND scheduled_delete_at <= ?"
      );
      const archivedRuns = archivedRunsStmt.all(now) as any[];

      for (const archivedRun of archivedRuns) {
        this.archiveDb.run("DELETE FROM runs_archive WHERE id = ?", [
          archivedRun.id,
        ]);
        this.archiveDb.run(
          "DELETE FROM decisions_archive WHERE run_id = ?",
          [archivedRun.id]
        );
        metrics.runs_deleted++;
        metrics.bytes_deleted += this.calculateRunSize(archivedRun);
      }

      const runs = this.getAllRuns();
      metrics.runs_processed = runs.length;

      for (const run of runs) {
        const { shouldDelete, policy } = this.policyManager.shouldDeleteRun(
          run,
          run.outcome
        );

        if (shouldDelete && policy) {
          this.deleteRunFromMain(run.id);
          metrics.runs_deleted++;
          metrics.bytes_deleted += this.calculateRunSize(run);
        }
      }

      metrics.duration_ms = Date.now() - startTime;
      this.persistMetrics(metrics);

      return { success: true, metrics };
    } catch (error) {
      const errorStr =
        error instanceof Error ? error.message : String(error);
      metrics.error = errorStr;
      metrics.duration_ms = Date.now() - startTime;

      this.persistMetrics(metrics);
      return { success: false, metrics, error: errorStr };
    }
  }

  /**
   * Delete a run from the main database
   */
  private deleteRunFromMain(runId: string): void {
    this.archiveDb.run("DELETE FROM runs WHERE id = ?", [runId]);

    const decisionsPath = join(this.dataDir, "decisions.jsonl");
    if (existsSync(decisionsPath)) {
      const content = readFileSync(decisionsPath, "utf-8");
      const lines = content.trim().split("\n");
      const filteredLines = lines.filter((line) => {
        if (!line.trim()) return true;
        try {
          const decision = JSON.parse(line);
          return decision.run_id !== runId;
        } catch {
          return true;
        }
      });
      writeFileSync(decisionsPath, filteredLines.join("\n") + "\n");
    }
  }

  /**
   * Enforce size limits
   */
  async enforceSizeLimits(): Promise<CleanupResult> {
    const startTime = Date.now();
    const metrics: CleanupMetrics = {
      timestamp: startTime,
      policy_name: "size_limits",
      operation: "cleanup",
      runs_processed: 0,
      runs_archived: 0,
      runs_deleted: 0,
      bytes_archived: 0,
      bytes_deleted: 0,
      duration_ms: 0,
    };

    try {
      const runs = this.getAllRuns();
      metrics.runs_processed = runs.length;

      let totalSize = 0;
      for (const run of runs) {
        totalSize += this.calculateRunSize(run);
      }

      const { needsCleanup, policy } = this.policyManager.needsCleanup(
        runs.length,
        totalSize
      );

      if (needsCleanup && policy) {
        if (policy.max_runs && runs.length > policy.max_runs) {
          const toRemove = runs.length - policy.max_runs;
          const sortedByAge = [...runs].sort((a, b) => a.created_at - b.created_at);

          for (let i = 0; i < toRemove; i++) {
            const run = sortedByAge[i];
            if (policy.archive_enabled) {
              const success = await this.archiveRun(run, policy);
              if (success) {
                metrics.runs_archived++;
                metrics.bytes_archived += this.calculateRunSize(run);
              }
            } else {
              this.deleteRunFromMain(run.id);
              metrics.runs_deleted++;
              metrics.bytes_deleted += this.calculateRunSize(run);
            }
          }
        }

        if (policy.max_size_mb) {
          const maxSizeBytes = policy.max_size_mb * 1024 * 1024;
          const sortedByAge = [...runs].sort((a, b) => a.created_at - b.created_at);
          let currentSize = totalSize;

          for (const run of sortedByAge) {
            if (currentSize <= maxSizeBytes) break;

            const runSize = this.calculateRunSize(run);
            if (policy.archive_enabled) {
              const success = await this.archiveRun(run, policy);
              if (success) {
                metrics.runs_archived++;
                metrics.bytes_archived += runSize;
                currentSize -= runSize;
              }
            } else {
              this.deleteRunFromMain(run.id);
              metrics.runs_deleted++;
              metrics.bytes_deleted += runSize;
              currentSize -= runSize;
            }
          }
        }
      }

      metrics.duration_ms = Date.now() - startTime;
      this.persistMetrics(metrics);

      return { success: true, metrics };
    } catch (error) {
      const errorStr =
        error instanceof Error ? error.message : String(error);
      metrics.error = errorStr;
      metrics.duration_ms = Date.now() - startTime;

      this.persistMetrics(metrics);
      return { success: false, metrics, error: errorStr };
    }
  }

  /**
   * Run all cleanup operations
   */
  async runFullCleanup(): Promise<CleanupResult[]> {
    const results: CleanupResult[] = [];

    if (this.policyManager.getPolicies().length === 0) {
      return results;
    }

    const archiveResult = await this.archiveOldRuns();
    results.push(archiveResult);

    const deleteResult = await this.deleteAncientData();
    results.push(deleteResult);

    const sizeResult = await this.enforceSizeLimits();
    results.push(sizeResult);

    return results;
  }

  /**
   * Close database connections
   */
  close(): void {
    if (!this.isClosed) {
      this.isClosed = true;
      this.archiveDb.close();
    }
  }
}

let defaultCollector: GarbageCollector | null = null;

export function getGarbageCollector(
  config: GarbageCollectorConfig
): GarbageCollector {
  if (!defaultCollector) {
    defaultCollector = new GarbageCollector(config);
  }
  return defaultCollector;
}

export function resetCollector(): void {
  if (defaultCollector) {
    defaultCollector.close();
    defaultCollector = null;
  }
}
