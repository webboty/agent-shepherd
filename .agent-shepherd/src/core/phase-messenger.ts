import { Database } from "bun:sqlite";
import { existsSync, readFileSync, appendFileSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import YAML from "yaml";

const DEFAULT_CONFIG = {
  size_limits: {
    max_content_length: 10000,
    max_metadata_length: 5000,
    max_messages_per_issue_phase: 100,
    max_messages_per_issue: 500
  },
  cleanup: {
    default_max_age_days: 90,
    keep_last_n_per_phase: 10,
    keep_last_n_runs: 1
  },
  storage: {
    data_dir: ".agent-shepherd",
    database_file: "messages.db",
    jsonl_file: "messages.jsonl"
  }
};

interface PhaseMessengerConfig {
  size_limits: {
    max_content_length: number;
    max_metadata_length: number;
    max_messages_per_issue_phase: number;
    max_messages_per_issue: number;
  };
  cleanup: {
    default_max_age_days: number;
    keep_last_n_per_phase: number;
    keep_last_n_runs: number;
  };
  storage: {
    data_dir: string;
    database_file: string;
    jsonl_file: string;
  };
}

function loadConfig(dataDir?: string): PhaseMessengerConfig {
  const configPath = join(
    dataDir || process.cwd(),
    ".agent-shepherd",
    "config",
    "phase-messenger.yaml"
  );

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG as PhaseMessengerConfig;
  }

  try {
    const configContent = readFileSync(configPath, "utf-8");
    const userConfig = YAML.parse(configContent) as Partial<PhaseMessengerConfig>;

    return {
      size_limits: {
        ...DEFAULT_CONFIG.size_limits,
        ...(userConfig.size_limits || {})
      },
      cleanup: {
        ...DEFAULT_CONFIG.cleanup,
        ...(userConfig.cleanup || {})
      },
      storage: {
        ...DEFAULT_CONFIG.storage,
        ...(userConfig.storage || {})
      }
    } as PhaseMessengerConfig;
  } catch (error) {
    console.warn("Failed to load phase-messenger config, using defaults:", error);
    return DEFAULT_CONFIG as PhaseMessengerConfig;
  }
}

export interface PhaseMessage {
  id: string;
  issue_id: string;
  from_phase: string;
  to_phase: string;
  run_counter: number;
  message_type: "context" | "result" | "decision" | "data";
  content: string;
  metadata?: {
    [key: string]: unknown;
  } | null;
  read: boolean;
  created_at: number;
  read_at?: number | null;
}

export interface MessageQuery {
  issue_id?: string;
  from_phase?: string;
  to_phase?: string;
  message_type?: string;
  read?: boolean;
  run_counter?: number;
  limit?: number;
}

export interface CreateMessageInput {
  issue_id: string;
  from_phase: string;
  to_phase: string;
  message_type: "context" | "result" | "decision" | "data";
  content: string;
  run_counter?: number;
  metadata?: {
    [key: string]: unknown;
  };
}

export class PhaseMessenger {
  private db: Database;
  private jsonlPath: string;
  private config: PhaseMessengerConfig;

  constructor(dataDir?: string) {
    this.config = loadConfig(dataDir);
    const dir = dataDir || join(process.cwd(), this.config.storage.data_dir);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.jsonlPath = join(dir, this.config.storage.jsonl_file);
    const dbPath = join(dir, this.config.storage.database_file);

    this.db = new Database(dbPath);
    this.initializeSchema();
    this.syncFromJSONL();
  }

  private initializeSchema(): void {
    const createTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL,
        from_phase TEXT NOT NULL,
        to_phase TEXT NOT NULL,
        run_counter INTEGER NOT NULL DEFAULT 1,
        message_type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        read INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        read_at INTEGER
      )
    `;
    this.db.exec(createTable);

    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_messages_issue_id ON messages(issue_id)",
      "CREATE INDEX IF NOT EXISTS idx_messages_to_phase ON messages(to_phase)",
      "CREATE INDEX IF NOT EXISTS idx_messages_from_phase ON messages(from_phase)",
      "CREATE INDEX IF NOT EXISTS idx_messages_issue_phase ON messages(issue_id, to_phase)",
      "CREATE INDEX IF NOT EXISTS idx_messages_issue_unread ON messages(issue_id, to_phase, read)",
      "CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)",
      "CREATE INDEX IF NOT EXISTS idx_messages_run_counter ON messages(issue_id, run_counter)"
    ];

    indexes.forEach((idx) => this.db.exec(idx));
  }

  private syncFromJSONL(): void {
    if (!existsSync(this.jsonlPath)) {
      return;
    }

    const content = readFileSync(this.jsonlPath, "utf-8");
    const lines = content.trim().split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line) as PhaseMessage;
        this.upsertToSQLite(message);
      } catch (error) {
        console.error("Failed to parse JSONL line:", error);
      }
    }
  }

  private upsertToSQLite(message: PhaseMessage): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (
        id, issue_id, from_phase, to_phase, run_counter,
        message_type, content, metadata, read, created_at, read_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.issue_id,
      message.from_phase,
      message.to_phase,
      message.run_counter,
      message.message_type,
      message.content,
      message.metadata ? JSON.stringify(message.metadata) : null,
      message.read ? 1 : 0,
      message.created_at,
      message.read_at || null
    );
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private validateMessage(input: CreateMessageInput): void {
    const validTypes = ["context", "result", "decision", "data"];

    if (!input.issue_id || !input.from_phase || !input.to_phase || !input.message_type || !input.content) {
      throw new Error("Missing required fields: issue_id, from_phase, to_phase, message_type, content");
    }

    if (!validTypes.includes(input.message_type)) {
      throw new Error(`Invalid message_type. Must be one of: ${validTypes.join(", ")}`);
    }

    const maxContent = this.config.size_limits.max_content_length;
    const maxMetadata = this.config.size_limits.max_metadata_length;

    if (input.content.length > maxContent) {
      throw new Error(`Content exceeds maximum length of ${maxContent} characters`);
    }

    if (input.metadata && JSON.stringify(input.metadata).length > maxMetadata) {
      throw new Error(`Metadata exceeds maximum length of ${maxMetadata} characters`);
    }
  }

  private enforceSizeLimits(issueId: string, toPhase: string): void {
    const maxIssuePhase = this.config.size_limits.max_messages_per_issue_phase;
    const maxTotal = this.config.size_limits.max_messages_per_issue;

    const issuePhaseCount = this.db
      .prepare("SELECT COUNT(*) as count FROM messages WHERE issue_id = ? AND to_phase = ?")
      .get(issueId, toPhase) as any;

    if (issuePhaseCount.count >= maxIssuePhase) {
      const oldestMessage = this.db
        .prepare("SELECT id FROM messages WHERE issue_id = ? AND to_phase = ? AND read = 1 ORDER BY created_at ASC LIMIT 1")
        .get(issueId, toPhase) as any;

      if (oldestMessage) {
        this.db.prepare("DELETE FROM messages WHERE id = ?").run(oldestMessage.id);
      }
    }

    const issueTotalCount = this.db
      .prepare("SELECT COUNT(*) as count FROM messages WHERE issue_id = ?")
      .get(issueId) as any;

    if (issueTotalCount.count >= maxTotal) {
      const oldestMessage = this.db
        .prepare("SELECT id FROM messages WHERE issue_id = ? AND read = 1 ORDER BY created_at ASC LIMIT 1")
        .get(issueId) as any;

      if (oldestMessage) {
        this.db.prepare("DELETE FROM messages WHERE id = ?").run(oldestMessage.id);
      }
    }
  }

  sendMessage(input: CreateMessageInput): PhaseMessage {
    this.validateMessage(input);
    this.enforceSizeLimits(input.issue_id, input.to_phase);

    const fullMessage: PhaseMessage = {
      id: this.generateMessageId(),
      issue_id: input.issue_id,
      from_phase: input.from_phase,
      to_phase: input.to_phase,
      run_counter: input.run_counter || 1,
      message_type: input.message_type,
      content: input.content,
      metadata: input.metadata || null,
      read: false,
      created_at: Date.now(),
      read_at: null
    };

    appendFileSync(this.jsonlPath, JSON.stringify(fullMessage) + "\n");
    this.upsertToSQLite(fullMessage);

    return fullMessage;
  }

  receiveMessages(issueId: string, phase: string, markAsRead = true): PhaseMessage[] {
    let sql = "SELECT * FROM messages WHERE issue_id = ? AND to_phase = ? AND read = 0";
    const messages = this.db.prepare(sql).all(issueId, phase) as any[];

    const result = messages.map((row) => this.rowToMessage(row));

    if (markAsRead) {
      result.forEach((msg) => {
        this.markAsRead(msg.id);
      });
    }

    return result;
  }

  listMessages(query: MessageQuery = {}): PhaseMessage[] {
    let sql = "SELECT * FROM messages WHERE 1=1";
    const params: any[] = [];

    if (query.issue_id) {
      sql += " AND issue_id = ?";
      params.push(query.issue_id);
    }

    if (query.to_phase) {
      sql += " AND to_phase = ?";
      params.push(query.to_phase);
    }

    if (query.from_phase) {
      sql += " AND from_phase = ?";
      params.push(query.from_phase);
    }

    if (query.message_type) {
      sql += " AND message_type = ?";
      params.push(query.message_type);
    }

    if (query.read !== undefined) {
      sql += " AND read = ?";
      params.push(query.read ? 1 : 0);
    }

    if (query.run_counter !== undefined) {
      sql += " AND run_counter = ?";
      params.push(query.run_counter);
    }

    sql += " ORDER BY created_at DESC";

    if (query.limit) {
      sql += " LIMIT ?";
      params.push(query.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => this.rowToMessage(row));
  }

  private markAsRead(messageId: string): void {
    const message = this.getMessage(messageId);
    if (!message || message.read) {
      return;
    }

    const updated: PhaseMessage = {
      ...message,
      read: true,
      read_at: Date.now()
    };

    appendFileSync(this.jsonlPath, JSON.stringify(updated) + "\n");
    this.upsertToSQLite(updated);
  }

  private getMessage(messageId: string): PhaseMessage | null {
    const row = this.db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as any;

    if (!row) {
      return null;
    }

    return this.rowToMessage(row);
  }

  getUnreadCount(issueId: string, phase: string): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE issue_id = ? AND to_phase = ? AND read = 0
    `).get(issueId, phase) as any;

    return result.count || 0;
  }

  deleteIssueMessages(issueId: string): void {
    this.db.prepare("DELETE FROM messages WHERE issue_id = ?").run(issueId);
  }

  close(): void {
    this.db.close();
  }

  private rowToMessage(row: any): PhaseMessage {
    return {
      id: row.id,
      issue_id: row.issue_id,
      from_phase: row.from_phase,
      to_phase: row.to_phase,
      run_counter: row.run_counter,
      message_type: row.message_type as any,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      read: row.read === 1,
      created_at: row.created_at,
      read_at: row.read_at || undefined
    };
  }

  private getArchivePath(issueId: string): string {
    const archiveDir = join(this.jsonlPath, "..", "messages_archive");
    
    if (!existsSync(archiveDir)) {
      mkdirSync(archiveDir, { recursive: true });
    }
    
    return join(archiveDir, `${issueId}.jsonl`);
  }

  archiveMessagesForIssue(issueId: string, reason: string = "cleanup"): { archived: number } {
    const messages = this.listMessages({ issue_id: issueId });

    if (messages.length === 0) {
      return { archived: 0 };
    }

    const archivePath = this.getArchivePath(issueId);
    const timestamp = Date.now();

    messages.forEach(message => {
      const archivedMessage = {
        ...message,
        archived_at: timestamp,
        archive_reason: reason,
        original_id: message.id
      };

      appendFileSync(archivePath, JSON.stringify(archivedMessage) + "\n");
    });

    return { archived: messages.length };
  }

  cleanupPhaseMessages(issueId: string, reason: string = "manual"): {
    archived: number;
    deleted: number;
    db_size_before: number;
    db_size_after: number;
  } {
    const dbPath = join(this.jsonlPath, "..", this.config.storage.database_file);
    
    const dbSizeBefore = this.getDatabaseSize(dbPath);

    const archiveResult = this.archiveMessagesForIssue(issueId, reason);

    this.deleteIssueMessages(issueId);

    const dbSizeAfter = this.getDatabaseSize(dbPath);

    this.recordCleanupMetric(issueId, reason, archiveResult.archived, archiveResult.archived, dbSizeBefore, dbSizeAfter);

    return {
      archived: archiveResult.archived,
      deleted: archiveResult.archived,
      db_size_before: dbSizeBefore,
      db_size_after: dbSizeAfter
    };
  }

  private getDatabaseSize(dbPath: string): number {
    if (existsSync(dbPath)) {
      const stats = statSync(dbPath);
      return stats.size;
    }
    return 0;
  }

  private recordCleanupMetric(issueId: string, reason: string, archived: number, deleted: number, sizeBefore: number, sizeAfter: number): void {
    const cleanupMetricsPath = join(this.jsonlPath, "..", "cleanup_metrics.jsonl");

    const metric = {
      timestamp: Date.now(),
      issue_id: issueId,
      reason: reason,
      messages_archived: archived,
      messages_deleted: deleted,
      db_size_before_bytes: sizeBefore,
      db_size_after_bytes: sizeAfter,
      db_size_before_mb: sizeBefore / (1024 * 1024),
      db_size_after_mb: sizeAfter / (1024 * 1024)
    };

    appendFileSync(cleanupMetricsPath, JSON.stringify(metric) + "\n");
  }

  getCleanupMetrics(issueId?: string): any[] {
    const { existsSync, readFileSync } = require("fs");
    const cleanupMetricsPath = join(this.jsonlPath, "..", "cleanup_metrics.jsonl");

    if (!existsSync(cleanupMetricsPath)) {
      return [];
    }

    const content = readFileSync(cleanupMetricsPath, "utf-8");
    const lines = content.trim().split("\n");
    const metrics: any[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const metric = JSON.parse(line);
        if (issueId === undefined || metric.issue_id === issueId) {
          metrics.push(metric);
        }
      } catch (error) {
        console.error("Failed to parse cleanup metric line:", error);
      }
    }

    return metrics.sort((a, b) => b.timestamp - a.timestamp);
  }

  getMessageStats(issueId?: string): {
    total_messages: number;
    unread_messages: number;
    read_messages: number;
    by_issue: Record<string, number>;
    db_size_mb: number;
  } {
    let messages: PhaseMessage[];

    if (issueId) {
      messages = this.listMessages({ issue_id: issueId });
    } else {
      messages = this.listMessages();
    }

    const total = messages.length;
    const unread = messages.filter(m => !m.read).length;
    const read = total - unread;

    const byIssue: Record<string, number> = {};
    if (!issueId) {
      messages.forEach(m => {
        byIssue[m.issue_id] = (byIssue[m.issue_id] || 0) + 1;
      });
    }

    const dbPath = join(this.jsonlPath, "..", this.config.storage.database_file);
    const dbSize = this.getDatabaseSize(dbPath) / (1024 * 1024);

    return {
      total_messages: total,
      unread_messages: unread,
      read_messages: read,
      by_issue: byIssue,
      db_size_mb: dbSize
    };
  }
}

let defaultMessenger: PhaseMessenger | null = null;

export function getPhaseMessenger(dataDir?: string): PhaseMessenger {
  if (!defaultMessenger) {
    defaultMessenger = new PhaseMessenger(dataDir);
  }
  return defaultMessenger;
}
