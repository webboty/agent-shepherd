/**
 * Archive Logger
 * Read-only access to archive database for historical data queries
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { RunRecord, RunQuery, DecisionRecord } from "./logging.ts";

export interface ArchiveRecord {
  id: string;
  original_run_id: string;
  archived_at: number;
  retention_policy: string;
}

export class ArchiveLogger {
  private db: Database;

  constructor(dataDir?: string) {
    const dir = dataDir || join(process.cwd(), ".agent-shepherd");
    const archiveDir = join(dir, "archive");

    if (!existsSync(archiveDir)) {
      mkdirSync(archiveDir, { recursive: true });
    }

    const archiveDbPath = join(archiveDir, "archive.db");

    this.db = new Database(archiveDbPath);
    this.initializeArchiveSchema();

    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA synchronous = NORMAL");
    this.db.run("PRAGMA cache_size = -2000");
    this.db.run("PRAGMA temp_store = MEMORY");
    this.db.run("PRAGMA mmap_size = 268435456");
  }

  private initializeArchiveSchema(): void {
    this.db.run(`
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

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_issue_id ON runs_archive(issue_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_agent_id ON runs_archive(agent_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_status ON runs_archive(status)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_issue_phase_status ON runs_archive(issue_id, phase, status)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_phase_completed ON runs_archive(phase, completed_at)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_issue_phase ON runs_archive(issue_id, phase)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_archived_at ON runs_archive(archived_at)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_archive_scheduled_delete ON runs_archive(scheduled_delete_at)
    `);

    this.db.run(`
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

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_decisions_archive_run_id ON decisions_archive(run_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_decisions_archive_type ON decisions_archive(type)
    `);
  }

  private rowToRunRecord(row: any): RunRecord {
    return {
      id: row.id,
      issue_id: row.issue_id,
      session_id: row.session_id,
      agent_id: row.agent_id,
      policy_name: row.policy_name,
      phase: row.phase,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at || undefined,
      outcome: row.outcome ? JSON.parse(row.outcome) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  private rowToDecisionRecord(row: any): DecisionRecord {
    return {
      id: row.id,
      run_id: row.run_id,
      timestamp: row.timestamp,
      type: row.type,
      decision: row.decision,
      reasoning: row.reasoning || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  getRun(runId: string): RunRecord | null {
    const stmt = this.db.prepare("SELECT * FROM runs_archive WHERE id = ?");
    const row = stmt.get(runId) as any;

    if (!row) {
      return null;
    }

    return this.rowToRunRecord(row);
  }

  queryRuns(query: RunQuery): RunRecord[] {
    let sql = "SELECT * FROM runs_archive WHERE 1=1";
    const params: any[] = [];

    if (query.issue_id) {
      sql += " AND issue_id = ?";
      params.push(query.issue_id);
    }

    if (query.agent_id) {
      sql += " AND agent_id = ?";
      params.push(query.agent_id);
    }

    if (query.status) {
      sql += " AND status = ?";
      params.push(query.status);
    }

    if (query.phase) {
      sql += " AND phase = ?";
      params.push(query.phase);
    }

    sql += " ORDER BY created_at DESC";

    if (query.limit) {
      sql += " LIMIT ?";
      params.push(query.limit);
    }

    if (query.offset) {
      sql += " OFFSET ?";
      params.push(query.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => this.rowToRunRecord(row));
  }

  getDecisions(runId: string): DecisionRecord[] {
    const stmt = this.db.prepare(
      "SELECT * FROM decisions_archive WHERE run_id = ? ORDER BY timestamp ASC"
    );
    const rows = stmt.all(runId) as any[];

    return rows.map((row) => this.rowToDecisionRecord(row));
  }

  getDecisionsForIssue(issueId: string, options?: { limit?: number }): DecisionRecord[] {
    let sql = `
      SELECT d.*
      FROM decisions_archive d
      INNER JOIN runs_archive r ON d.run_id = r.id
      WHERE r.issue_id = ?
      ORDER BY d.timestamp DESC
    `;
    const params: any[] = [issueId];

    if (options?.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => this.rowToDecisionRecord(row));
  }

  getPhaseRetryCount(issueId: string, phaseName: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM runs_archive
      WHERE issue_id = ? AND phase = ? AND status = 'failed'
    `);
    const result = stmt.get(issueId, phaseName) as any;
    return result?.count || 0;
  }

  getPhaseVisitCount(issueId: string, phaseName: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM runs_archive
      WHERE issue_id = ? AND phase = ?
    `);
    const result = stmt.get(issueId, phaseName) as any;
    return result?.count || 0;
  }

  getArchivedRuns(): RunRecord[] {
    const stmt = this.db.prepare("SELECT * FROM runs_archive ORDER BY archived_at DESC");
    const rows = stmt.all() as any[];
    return rows.map((row) => this.rowToRunRecord(row));
  }

  getArchivedRunCount(): number {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM runs_archive");
    const result = stmt.get() as any;
    return result?.count || 0;
  }

  getArchiveSize(): number {
    const stmt = this.db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()");
    const result = stmt.get() as any;
    return result?.size || 0;
  }

  cleanupArchive(retentionDays: number): number {
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    const stmt = this.db.prepare(`
      SELECT id FROM runs_archive
      WHERE scheduled_delete_at IS NOT NULL AND scheduled_delete_at <= ?
    `);
    const toDelete = stmt.all(cutoffTime) as any[];

    let deletedCount = 0;
    for (const row of toDelete) {
      this.db.run("DELETE FROM decisions_archive WHERE run_id = ?", [row.id]);
      this.db.run("DELETE FROM runs_archive WHERE id = ?", [row.id]);
      deletedCount++;
    }

    this.db.run("VACUUM");

    return deletedCount;
  }

  close(): void {
    this.db.close();
  }
}
