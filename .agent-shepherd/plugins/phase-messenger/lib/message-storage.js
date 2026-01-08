const { existsSync, readFileSync, appendFileSync, mkdirSync, unlinkSync } = require('fs');
const { join } = require('path');
const Database = require('better-sqlite3');
const YAML = require('yaml');

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
    data_dir: '.agent-shepherd',
    database_file: 'messages.db',
    jsonl_file: 'messages.jsonl'
  }
};

function loadConfig(dataDir) {
  const configPath = join(dataDir || process.cwd(), '.agent-shepherd', 'config', 'phase-messenger.yaml');

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const configContent = readFileSync(configPath, 'utf-8');
    const userConfig = YAML.parse(configContent);

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
    };
  } catch (error) {
    console.warn('Failed to load phase-messenger config, using defaults:', error.message);
    return DEFAULT_CONFIG;
  }
}

class MessageStorage {
  constructor(dataDir) {
    this.config = loadConfig(dataDir);
    this.dataDir = dataDir || join(process.cwd(), this.config.storage.data_dir);
    this.jsonlPath = join(this.dataDir, this.config.storage.jsonl_file);
    this.dbPath = join(this.dataDir, this.config.storage.database_file);

    this.ensureDirectory();
    this.db = new Database(this.dbPath);
    this.initializeSchema();
    this.syncFromJSONL();
  }

  ensureDirectory() {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  initializeSchema() {
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
      'CREATE INDEX IF NOT EXISTS idx_messages_issue_id ON messages(issue_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_to_phase ON messages(to_phase)',
      'CREATE INDEX IF NOT EXISTS idx_messages_from_phase ON messages(from_phase)',
      'CREATE INDEX IF NOT EXISTS idx_messages_issue_phase ON messages(issue_id, to_phase)',
      'CREATE INDEX IF NOT EXISTS idx_messages_issue_unread ON messages(issue_id, to_phase, read)',
      'CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_messages_run_counter ON messages(issue_id, run_counter)'
    ];

    indexes.forEach(idx => this.db.exec(idx));
  }

  syncFromJSONL() {
    if (!existsSync(this.jsonlPath)) {
      return;
    }

    const content = readFileSync(this.jsonlPath, 'utf8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        this.upsertToSQLite(message);
      } catch (error) {
        console.error('Failed to parse JSONL line:', error);
      }
    }
  }

  upsertToSQLite(message) {
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

  validateMessage(message) {
    if (!message.issue_id || !message.from_phase || !message.to_phase || !message.message_type || !message.content) {
      throw new Error('Missing required fields: issue_id, from_phase, to_phase, message_type, content');
    }

    if (!['context', 'result', 'decision', 'data'].includes(message.message_type)) {
      throw new Error('Invalid message_type. Must be one of: context, result, decision, data');
    }

    const maxContent = this.config.size_limits.max_content_length;
    const maxMetadata = this.config.size_limits.max_metadata_length;

    if (message.content.length > maxContent) {
      throw new Error(`Content exceeds maximum length of ${maxContent} characters`);
    }

    if (message.metadata && JSON.stringify(message.metadata).length > maxMetadata) {
      throw new Error(`Metadata exceeds maximum length of ${maxMetadata} characters`);
    }

    return true;
  }

  enforceSizeLimits(issueId, toPhase) {
    const maxIssuePhase = this.config.size_limits.max_messages_per_issue_phase;
    const maxTotal = this.config.size_limits.max_messages_per_issue;

    const issuePhaseCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE issue_id = ? AND to_phase = ?
    `).get(issueId, toPhase);

    if (issuePhaseCount.count >= maxIssuePhase) {
      const oldestMessage = this.db.prepare(`
        SELECT id FROM messages
        WHERE issue_id = ? AND to_phase = ? AND read = 1
        ORDER BY created_at ASC
        LIMIT 1
      `).get(issueId, toPhase);

      if (oldestMessage) {
        this.deleteMessage(oldestMessage.id);
      }
    }

    const issueTotalCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE issue_id = ?
    `).get(issueId);

    if (issueTotalCount.count >= maxTotal) {
      const oldestMessage = this.db.prepare(`
        SELECT id FROM messages
        WHERE issue_id = ? AND read = 1
        ORDER BY created_at ASC
        LIMIT 1
      `).get(issueId);

      if (oldestMessage) {
        this.deleteMessage(oldestMessage.id);
      }
    }
  }

  generateMessageId() {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  createMessage(message) {
    this.validateMessage(message);
    this.enforceSizeLimits(message.issue_id, message.to_phase);

    const fullMessage = {
      id: this.generateMessageId(),
      issue_id: message.issue_id,
      from_phase: message.from_phase,
      to_phase: message.to_phase,
      run_counter: message.run_counter || 1,
      message_type: message.message_type,
      content: message.content,
      metadata: message.metadata || null,
      read: false,
      created_at: Date.now(),
      read_at: null
    };

    appendFileSync(this.jsonlPath, JSON.stringify(fullMessage) + '\n');
    this.upsertToSQLite(fullMessage);

    return fullMessage;
  }

  getMessage(messageId) {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);

    if (!row) {
      return null;
    }

    return this.rowToMessage(row);
  }

  listMessages(query = {}) {
    let sql = 'SELECT * FROM messages WHERE 1=1';
    const params = [];

    if (query.issue_id) {
      sql += ' AND issue_id = ?';
      params.push(query.issue_id);
    }

    if (query.to_phase) {
      sql += ' AND to_phase = ?';
      params.push(query.to_phase);
    }

    if (query.from_phase) {
      sql += ' AND from_phase = ?';
      params.push(query.from_phase);
    }

    if (query.message_type) {
      sql += ' AND message_type = ?';
      params.push(query.message_type);
    }

    if (query.read !== undefined) {
      sql += ' AND read = ?';
      params.push(query.read ? 1 : 0);
    }

    if (query.run_counter !== undefined) {
      sql += ' AND run_counter = ?';
      params.push(query.run_counter);
    }

    sql += ' ORDER BY created_at DESC';

    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);

    return rows.map(row => this.rowToMessage(row));
  }

  markAsRead(messageId) {
    const message = this.getMessage(messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    if (message.read) {
      return message;
    }

    const updated = {
      ...message,
      read: true,
      read_at: Date.now()
    };

    appendFileSync(this.jsonlPath, JSON.stringify(updated) + '\n');
    this.upsertToSQLite(updated);

    return updated;
  }

  markPhaseMessagesAsRead(issueId, phase) {
    const unreadMessages = this.listMessages({ issue_id: issueId, to_phase: phase, read: false });

    unreadMessages.forEach(msg => {
      this.markAsRead(msg.id);
    });

    return unreadMessages.length;
  }

  deleteMessage(messageId) {
    this.db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
  }

  deleteIssueMessages(issueId) {
    this.db.prepare('DELETE FROM messages WHERE issue_id = ?').run(issueId);
  }

  getUnreadCount(issueId, phase) {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE issue_id = ? AND to_phase = ? AND read = 0
    `).get(issueId, phase);

    return result.count;
  }

  cleanupOldMessages(options = {}) {
    const maxAgeDays = options.maxAgeDays || this.config.cleanup.default_max_age_days;
    const keepUnread = options.keepUnread !== false;
    const dryRun = options.dryRun || false;

    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

    let sql = 'DELETE FROM messages WHERE created_at < ?';
    const params = [cutoffTime];

    if (keepUnread) {
      sql += ' AND read = 1';
    }

    if (dryRun) {
      const countQuery = sql.replace('DELETE', 'SELECT COUNT(*) as count');
      const result = this.db.prepare(countQuery).get(...params);
      return { deleted: 0, wouldDelete: result.count, dryRun: true };
    }

    const result = this.db.prepare(sql).run(...params);
    return { deleted: result.changes, dryRun: false };
  }

  cleanupByRunCounter(issueId, keepLastNRuns) {
    keepLastNRuns = keepLastNRuns || this.config.cleanup.keep_last_n_runs;

    const maxRunCounter = this.db.prepare(`
      SELECT MAX(run_counter) as max_counter FROM messages WHERE issue_id = ?
    `).get(issueId);

    if (!maxRunCounter || !maxRunCounter.max_counter) {
      return { deleted: 0 };
    }

    const cutoffRun = maxRunCounter.max_counter - keepLastNRuns;

    const result = this.db.prepare(`
      DELETE FROM messages
      WHERE issue_id = ? AND run_counter <= ? AND read = 1
    `).run(issueId, cutoffRun);

    return { deleted: result.changes };
  }

  cleanupReadMessages(issueId, toPhase, keepLastN) {
    keepLastN = keepLastN || this.config.cleanup.keep_last_n_per_phase;

    const totalMessages = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE issue_id = ? AND to_phase = ?
    `).get(issueId, toPhase);

    if (totalMessages.count <= keepLastN) {
      return { deleted: 0 };
    }

    const messagesToDelete = totalMessages.count - keepLastN;

    const deleteStmt = this.db.prepare(`
      DELETE FROM messages
      WHERE id IN (
        SELECT id FROM messages
        WHERE issue_id = ? AND to_phase = ? AND read = 1
        ORDER BY created_at ASC
        LIMIT ?
      )
    `);

    const result = deleteStmt.run(issueId, toPhase, messagesToDelete);
    return { deleted: result.changes };
  }

  getCleanupStats() {
    const totalMessages = this.db.prepare('SELECT COUNT(*) as count FROM messages').get();
    const unreadMessages = this.db.prepare('SELECT COUNT(*) as count FROM messages WHERE read = 0').get();
    const oldMessages = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE created_at < ?
    `).get(Date.now() - (90 * 24 * 60 * 60 * 1000));

    const byIssue = this.db.prepare(`
      SELECT issue_id, COUNT(*) as count
      FROM messages
      GROUP BY issue_id
      ORDER BY count DESC
      LIMIT 10
    `).all();

    return {
      total: totalMessages.count,
      unread: unreadMessages.count,
      old90Days: oldMessages.count,
      topIssues: byIssue
    };
  }

  close() {
    this.db.close();
  }

  rowToMessage(row) {
    return {
      id: row.id,
      issue_id: row.issue_id,
      from_phase: row.from_phase,
      to_phase: row.to_phase,
      run_counter: row.run_counter,
      message_type: row.message_type,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      read: row.read === 1,
      created_at: row.created_at,
      read_at: row.read_at
    };
  }
}

module.exports = { MessageStorage };
