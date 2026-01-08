/**
 * Archive Utility
 * Functions to archive data from active database to archive database
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { getLogger, type RunRecord } from "./logging.ts";
import type { RetentionPolicy } from "./retention-policy.ts";

export interface ArchiveResult {
  success: boolean;
  runs_archived: number;
  bytes_archived: number;
  error?: string;
}

export function archiveOldRuns(
  dataDir?: string,
  policy?: RetentionPolicy
): ArchiveResult {
  const logger = getLogger(dataDir);
  const dir = dataDir || join(process.cwd(), ".agent-shepherd");

  const archiveDir = join(dir, "archive");
  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true });
  }

  const archiveDbPath = join(archiveDir, "archive.db");
  const archiveDb = new Database(archiveDbPath);
  initializeArchiveSchema(archiveDb);

  const result: ArchiveResult = {
    success: true,
    runs_archived: 0,
    bytes_archived: 0,
  };

  try {
    const runs = logger.queryRuns({});
    const now = Date.now();
    const retentionDays = policy?.delete_after_days || 90;
    const scheduledDeleteAt = policy?.delete_after_days
      ? now + retentionDays * 24 * 60 * 60 * 1000
      : null;

    for (const run of runs) {
      const ageMs = now - run.created_at;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const archiveAfterDays = policy?.archive_after_days || policy?.age_days || 30;

      if (ageDays >= archiveAfterDays) {
        const success = archiveRunToArchiveDb(
          archiveDb,
          run,
          policy?.name || "default",
          scheduledDeleteAt
        );

        if (success) {
          result.runs_archived++;
          result.bytes_archived += calculateRunSize(run);

          deleteRunFromActive(run.id, dir);
        }
      }
    }

    archiveDb.run("VACUUM");
  } catch (error) {
    result.success = false;
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    archiveDb.close();
  }

  return result;
}

function initializeArchiveSchema(archiveDb: Database): void {
  archiveDb.run(`
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

  archiveDb.run(`
    CREATE INDEX IF NOT EXISTS idx_runs_archive_issue_id ON runs_archive(issue_id)
  `);

  archiveDb.run(`
    CREATE INDEX IF NOT EXISTS idx_runs_archive_agent_id ON runs_archive(agent_id)
  `);

  archiveDb.run(`
    CREATE INDEX IF NOT EXISTS idx_runs_archive_status ON runs_archive(status)
  `);

  archiveDb.run(`
    CREATE INDEX IF NOT EXISTS idx_runs_archive_issue_phase_status ON runs_archive(issue_id, phase, status)
  `);

  archiveDb.run(`
    CREATE INDEX IF NOT EXISTS idx_runs_archive_phase_completed ON runs_archive(phase, completed_at)
  `);

  archiveDb.run(`
    CREATE INDEX IF NOT EXISTS idx_runs_archive_issue_phase ON runs_archive(issue_id, phase)
  `);

  archiveDb.run(`
    CREATE INDEX IF NOT EXISTS idx_runs_archive_archived_at ON runs_archive(archived_at)
  `);

  archiveDb.run(`
    CREATE INDEX IF NOT EXISTS idx_runs_archive_scheduled_delete ON runs_archive(scheduled_delete_at)
  `);

  archiveDb.run(`
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

  archiveDb.run(`
    CREATE INDEX IF NOT EXISTS idx_decisions_archive_run_id ON decisions_archive(run_id)
  `);

  archiveDb.run(`
    CREATE INDEX IF NOT EXISTS idx_decisions_archive_type ON decisions_archive(type)
  `);
}

function archiveRunToArchiveDb(
  archiveDb: Database,
  run: RunRecord,
  retentionPolicy: string,
  scheduledDeleteAt: number | null
): boolean {
  try {
    archiveDb.run(
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
        retentionPolicy,
        scheduledDeleteAt,
      ]
    );

    const decisions = getLogger().getDecisions(run.id);
    for (const decision of decisions) {
      archiveDb.run(
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

    return true;
  } catch (error) {
    console.error(`Failed to archive run ${run.id}:`, error);
    return false;
  }
}

function deleteRunFromActive(runId: string, dataDir: string): void {
  const dbPath = join(dataDir, "runs.db");
  const db = new Database(dbPath);

  try {
    db.run("DELETE FROM runs WHERE id = ?", [runId]);
    db.run("DELETE FROM decisions WHERE run_id = ?", [runId]);
  } catch (error) {
    console.error(`Failed to delete run ${runId} from active database:`, error);
  } finally {
    db.close();
  }
}

function calculateRunSize(run: RunRecord): number {
  return JSON.stringify(run).length * 2;
}
