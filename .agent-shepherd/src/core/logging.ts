/**
 * Logging System
 * Dual storage: JSONL as source of truth, SQLite for fast queries
 */

import { Database } from "bun:sqlite";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";

export interface RunRecord {
  id: string;
  issue_id: string;
  session_id: string;
  agent_id: string;
  policy_name: string;
  phase: string;
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  created_at: number;
  updated_at: number;
  completed_at?: number;
  outcome?: RunOutcome;
  metadata?: {
    [key: string]: unknown;
  };
}

export interface Artifact {
  path: string;
  operation: "created" | "modified" | "deleted";
  size?: number;
  type?: "file" | "directory";
}

export interface ErrorDetails {
  type?: string;
  message?: string;
  stack_trace?: string;
  file_path?: string;
  line_number?: number;
}

export interface ToolCall {
  name: string;
  inputs: any;
  outputs?: string;
  duration_ms?: number;
  status: "completed" | "error" | "cancelled";
}

export interface RunOutcome {
  success: boolean;
  message?: string;
  artifacts?: string[] | Artifact[];
  requires_approval?: boolean;
  error?: string;
  error_details?: ErrorDetails;
  warnings?: string[];
  tool_calls?: ToolCall[];
  metrics?: {
    duration_ms?: number;
    tokens_used?: number;
    cost?: number;
    start_time_ms?: number;
    end_time_ms?: number;
    api_calls_count?: number;
    model_name?: string;
  };
}

export interface DecisionRecord {
  id: string;
  run_id: string;
  timestamp: number;
  type: "agent_selection" | "phase_transition" | "retry" | "hitl" | "timeout";
  decision: string;
  reasoning?: string;
  metadata?: {
    [key: string]: unknown;
  };
}

export interface RunQuery {
  issue_id?: string;
  agent_id?: string;
  status?: string;
  phase?: string;
  limit?: number;
  offset?: number;
}

/**
 * Logging system with JSONL and SQLite dual storage
 */
export class Logger {
  private db: Database;
  private jsonlPath: string;
  private decisionsPath: string;

  constructor(dataDir?: string) {
    const dir = dataDir || join(process.cwd(), ".agent-shepherd");

    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.jsonlPath = join(dir, "runs.jsonl");
    this.decisionsPath = join(dir, "decisions.jsonl");
    const dbPath = join(dir, "runs.db");

    // Initialize SQLite database
    this.db = new Database(dbPath);
    this.initializeSchema();

    // Load existing JSONL records into SQLite if database is new
    this.syncFromJSONL();
  }

  /**
   * Initialize SQLite schema
   */
  private initializeSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS runs (
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
        metadata TEXT
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_issue_id ON runs(issue_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_agent_id ON runs(agent_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_issue_phase_status ON runs(issue_id, phase, status)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_runs_phase_completed ON runs(phase, completed_at)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        decision TEXT NOT NULL,
        reasoning TEXT,
        metadata TEXT,
        FOREIGN KEY (run_id) REFERENCES runs(id)
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_decisions_run_id ON decisions(run_id)
    `);
  }

  /**
   * Sync JSONL records into SQLite
   */
  private syncFromJSONL(): void {
    // Check if JSONL file exists
    if (!existsSync(this.jsonlPath)) {
      return;
    }

    // Read JSONL and insert into SQLite
    const content = readFileSync(this.jsonlPath, "utf-8");
    const lines = content.trim().split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const record = JSON.parse(line) as RunRecord;
        this.upsertToSQLite(record);
      } catch (error) {
        console.error("Failed to parse JSONL line:", error);
      }
    }

    // Sync decisions if file exists
    if (existsSync(this.decisionsPath)) {
      const decisionsContent = readFileSync(this.decisionsPath, "utf-8");
      const decisionLines = decisionsContent.trim().split("\n");

      for (const line of decisionLines) {
        if (!line.trim()) continue;

        try {
          const decision = JSON.parse(line) as DecisionRecord;
          this.upsertDecisionToSQLite(decision);
        } catch (error) {
          console.error("Failed to parse decision JSONL line:", error);
        }
      }
    }
  }

  /**
   * Upsert run record to SQLite
   */
  private upsertToSQLite(record: RunRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO runs (
        id, issue_id, session_id, agent_id, policy_name, phase,
        status, created_at, updated_at, completed_at, outcome, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      record.id,
      record.issue_id,
      record.session_id,
      record.agent_id,
      record.policy_name,
      record.phase,
      record.status,
      record.created_at,
      record.updated_at,
      record.completed_at || null,
      record.outcome ? JSON.stringify(record.outcome) : null,
      record.metadata ? JSON.stringify(record.metadata) : null
    );
  }

  /**
   * Upsert decision record to SQLite
   */
  private upsertDecisionToSQLite(decision: DecisionRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO decisions (
        id, run_id, timestamp, type, decision, reasoning, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      decision.id,
      decision.run_id,
      decision.timestamp,
      decision.type,
      decision.decision,
      decision.reasoning || null,
      decision.metadata ? JSON.stringify(decision.metadata) : null
    );
  }

  /**
   * Create a new run record
   */
  createRun(record: Omit<RunRecord, "created_at" | "updated_at">): RunRecord {
    const now = Date.now();
    const fullRecord: RunRecord = {
      ...record,
      created_at: now,
      updated_at: now,
    };

    // Append to JSONL (source of truth)
    appendFileSync(this.jsonlPath, JSON.stringify(fullRecord) + "\n");

    // Update SQLite cache
    this.upsertToSQLite(fullRecord);

    return fullRecord;
  }

  /**
   * Update an existing run record
   */
  updateRun(
    runId: string,
    updates: Partial<Omit<RunRecord, "id" | "created_at">>
  ): RunRecord | null {
    const existing = this.getRun(runId);
    if (!existing) {
      return null;
    }

    const updated: RunRecord = {
      ...existing,
      ...updates,
      updated_at: Date.now(),
    };

    // Append to JSONL
    appendFileSync(this.jsonlPath, JSON.stringify(updated) + "\n");

    // Update SQLite cache
    this.upsertToSQLite(updated);

    return updated;
  }

  /**
   * Get a run record by ID
   */
  getRun(runId: string): RunRecord | null {
    const stmt = this.db.prepare("SELECT * FROM runs WHERE id = ?");
    const row = stmt.get(runId) as any;

    if (!row) {
      return null;
    }

    return this.rowToRunRecord(row);
  }

  /**
   * Query run records
   */
  queryRuns(query: RunQuery): RunRecord[] {
    let sql = "SELECT * FROM runs WHERE 1=1";
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

  /**
   * Get retry count for a specific issue and phase
   * Counts failed attempts for the given issue and phase combination
   */
  getPhaseRetryCount(issueId: string, phaseName: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM runs
      WHERE issue_id = ? AND phase = ? AND status = 'failed'
    `);
    const result = stmt.get(issueId, phaseName) as any;
    return result?.count || 0;
  }

  /**
   * Get total duration for all runs matching a query
   */
  getTotalDuration(query: RunQuery): number {
    let sql = "SELECT SUM(CAST(json_extract(outcome, '$.metrics.duration_ms') AS INTEGER)) as total FROM runs WHERE 1=1";
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

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as any;
    return result?.total || 0;
  }

  /**
   * Get average duration for all runs matching a query
   */
  getAverageDuration(query: RunQuery): number {
    let sql = "SELECT AVG(CAST(json_extract(outcome, '$.metrics.duration_ms') AS INTEGER)) as avg FROM runs WHERE 1=1";
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

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as any;
    return result?.avg || 0;
  }

  /**
   * Get minimum duration for all runs matching a query
   */
  getMinDuration(query: RunQuery): number | null {
    let sql = "SELECT MIN(CAST(json_extract(outcome, '$.metrics.duration_ms') AS INTEGER)) as min FROM runs WHERE 1=1";
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

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as any;
    return result?.min || null;
  }

  /**
   * Get maximum duration for all runs matching a query
   */
  getMaxDuration(query: RunQuery): number | null {
    let sql = "SELECT MAX(CAST(json_extract(outcome, '$.metrics.duration_ms') AS INTEGER)) as max FROM runs WHERE 1=1";
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

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as any;
    return result?.max || null;
  }

  /**
   * Get duration statistics for all runs matching a query
   */
  getDurationStats(query: RunQuery): {
    total: number;
    average: number;
    min: number | null;
    max: number | null;
    count: number;
  } {
    let sql = `
      SELECT 
        SUM(CAST(json_extract(outcome, '$.metrics.duration_ms') AS INTEGER)) as total,
        AVG(CAST(json_extract(outcome, '$.metrics.duration_ms') AS INTEGER)) as avg,
        MIN(CAST(json_extract(outcome, '$.metrics.duration_ms') AS INTEGER)) as min,
        MAX(CAST(json_extract(outcome, '$.metrics.duration_ms') AS INTEGER)) as max,
        COUNT(*) as count
      FROM runs
      WHERE 1=1
    `;
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

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as any;

    return {
      total: result?.total || 0,
      average: result?.avg || 0,
      min: result?.min || null,
      max: result?.max || null,
      count: result?.count || 0,
    };
  }

  /**
   * Get cumulative duration for a specific issue and phase
   */
  getPhaseTotalDuration(issueId: string, phaseName: string): number {
    return this.getTotalDuration({ issue_id: issueId, phase: phaseName });
  }

  /**
   * Get average duration for a specific issue and phase
   */
  getPhaseAverageDuration(issueId: string, phaseName: string): number {
    return this.getAverageDuration({ issue_id: issueId, phase: phaseName });
  }

  /**
   * Get average phase duration (async wrapper for compatibility)
   */
  async getAveragePhaseDuration(issueId: string, phaseName: string): Promise<number> {
    return this.getAverageDuration({ issue_id: issueId, phase: phaseName });
  }

  /**
   * Get total duration for all phases of an issue
   */
  async getTotalIssueDuration(issueId: string): Promise<number> {
    const total = this.getTotalDuration({ issue_id: issueId });
    return total;
  }

  /**
   * Get slowest phases for an issue
   */
  async getSlowestPhases(
    issueId: string,
    limit: number = 10
  ): Promise<Array<{ phase: string; avg_duration_ms: number }>> {
    const stmt = this.db.prepare(`
      SELECT 
        phase,
        AVG(CAST(json_extract(outcome, '$.metrics.duration_ms') AS INTEGER)) as avg_duration_ms
      FROM runs
      WHERE issue_id = ? 
        AND outcome IS NOT NULL 
        AND json_extract(outcome, '$.metrics.duration_ms') IS NOT NULL
      GROUP BY phase
      ORDER BY avg_duration_ms DESC
      LIMIT ?
    `);

    const rows = stmt.all(issueId, limit) as any[];
    return rows.map((row) => ({
      phase: row.phase,
      avg_duration_ms: row.avg_duration_ms || 0,
    }));
  }

  /**
   * Log a decision record
   */
  logDecision(
    decision: Omit<DecisionRecord, "id" | "timestamp">
  ): DecisionRecord {
    const fullDecision: DecisionRecord = {
      ...decision,
      id: `decision-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      timestamp: Date.now(),
    };

    // Append to JSONL
    appendFileSync(this.decisionsPath, JSON.stringify(fullDecision) + "\n");

    // Update SQLite cache
    this.upsertDecisionToSQLite(fullDecision);

    return fullDecision;
  }

  /**
   * Get decisions for a run
   */
  getDecisions(runId: string): DecisionRecord[] {
    const stmt = this.db.prepare(
      "SELECT * FROM decisions WHERE run_id = ? ORDER BY timestamp ASC"
    );
    const rows = stmt.all(runId) as any[];

    return rows.map((row) => this.rowToDecisionRecord(row));
  }

  /**
   * Convert SQLite row to RunRecord
   */
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

  /**
   * Convert SQLite row to DecisionRecord
   */
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

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Create a singleton Logger instance
 */
let defaultLogger: Logger | null = null;

export function getLogger(dataDir?: string): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger(dataDir);
  }
  return defaultLogger;
}
