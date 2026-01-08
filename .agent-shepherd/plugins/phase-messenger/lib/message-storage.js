const { existsSync, readFileSync, appendFileSync, mkdirSync, unlinkSync } = require('fs');
const { join } = require('path');
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

function validateMessage(message, config) {
  if (!message.issue_id || !message.from_phase || !message.to_phase || !message.message_type || !message.content) {
    throw new Error('Missing required fields: issue_id, from_phase, to_phase, message_type, content');
  }

  if (!['context', 'result', 'decision', 'data'].includes(message.message_type)) {
    throw new Error('Invalid message_type. Must be one of: context, result, decision, data');
  }

  const maxContent = config.size_limits.max_content_length;
  const maxMetadata = config.size_limits.max_metadata_length;

  if (message.content.length > maxContent) {
    throw new Error(`Content exceeds maximum length of ${maxContent} characters`);
  }

  if (message.metadata && JSON.stringify(message.metadata).length > maxMetadata) {
    throw new Error(`Metadata exceeds maximum length of ${maxMetadata} characters`);
  }

  return true;
}

function generateMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function appendToJSONL(jsonlPath, message) {
  appendFileSync(jsonlPath, JSON.stringify(message) + '\n');
}

function parseJSONL(jsonlPath) {
  if (!existsSync(jsonlPath)) {
    return [];
  }

  const content = readFileSync(jsonlPath, 'utf-8');
  const lines = content.trim().split('\n');
  const messages = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      messages.push(JSON.parse(line));
    } catch (error) {
      console.error('Failed to parse JSONL line:', error);
    }
  }

  return messages;
}

function filterMessages(messages, query) {
  let result = messages;

  if (query.issue_id) {
    result = result.filter(m => m.issue_id === query.issue_id);
  }

  if (query.to_phase) {
    result = result.filter(m => m.to_phase === query.to_phase);
  }

  if (query.from_phase) {
    result = result.filter(m => m.from_phase === query.from_phase);
  }

  if (query.message_type) {
    result = result.filter(m => m.message_type === query.message_type);
  }

  if (query.read !== undefined) {
    result = result.filter(m => m.read === query.read);
  }

  if (query.run_counter !== undefined) {
    result = result.filter(m => m.run_counter === query.run_counter);
  }

  result.sort((a, b) => b.created_at - a.created_at);

  if (query.limit) {
    result = result.slice(0, query.limit);
  }

  return result;
}

function enforceSizeLimits(messages, issueId, toPhase, config) {
  const phaseMessages = messages.filter(m => 
    m.issue_id === issueId && m.to_phase === toPhase
  );

  const maxIssuePhase = config.size_limits.max_messages_per_issue_phase;
  if (phaseMessages.length >= maxIssuePhase) {
    const oldestRead = phaseMessages
      .filter(m => m.read)
      .sort((a, b) => a.created_at - b.created_at)[0];
    
    if (oldestRead) {
      const index = messages.findIndex(m => m.id === oldestRead.id);
      if (index !== -1) {
        messages.splice(index, 1);
      }
    }
  }

  const issueMessages = messages.filter(m => m.issue_id === issueId);
  const maxTotal = config.size_limits.max_messages_per_issue;
  
  if (issueMessages.length >= maxTotal) {
    const oldestRead = issueMessages
      .filter(m => m.read)
      .sort((a, b) => a.created_at - b.created_at)[0];
    
    if (oldestRead) {
      const index = messages.findIndex(m => m.id === oldestRead.id);
      if (index !== -1) {
        messages.splice(index, 1);
      }
    }
  }
}

class MessageStorage {
  constructor(dataDir) {
    this.config = loadConfig(dataDir);
    this.dataDir = dataDir || join(process.cwd(), this.config.storage.data_dir);
    this.jsonlPath = join(this.dataDir, this.config.storage.jsonl_file);

    this.ensureDirectory();
    this.syncFromJSONL();
  }

  ensureDirectory() {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  syncFromJSONL() {
    this.messages = parseJSONL(this.jsonlPath);
  }

  createMessage(message) {
    validateMessage(message, this.config);
    
    enforceSizeLimits(this.messages, message.issue_id, message.to_phase, this.config);

    const fullMessage = {
      id: generateMessageId(),
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

    this.messages.push(fullMessage);
    appendToJSONL(this.jsonlPath, fullMessage);

    return fullMessage;
  }

  getMessage(messageId) {
    return this.messages.find(m => m.id === messageId) || null;
  }

  listMessages(query = {}) {
    return filterMessages(this.messages, query);
  }

  markAsRead(messageId) {
    const message = this.getMessage(messageId);
    if (!message || message.read) {
      return message;
    }

    const updated = {
      ...message,
      read: true,
      read_at: Date.now()
    };

    const index = this.messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      this.messages[index] = updated;
    }

    appendToJSONL(this.jsonlPath, updated);
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
    const index = this.messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      this.messages.splice(index, 1);
    }
  }

  deleteIssueMessages(issueId) {
    this.messages = this.messages.filter(m => m.issue_id !== issueId);
  }

  getUnreadCount(issueId, phase) {
    return this.messages.filter(m => 
      m.issue_id === issueId && m.to_phase === phase && !m.read
    ).length;
  }

  close() {
  }

  getCleanupStats() {
    const totalMessages = this.messages.length;
    const unreadMessages = this.messages.filter(m => !m.read).length;
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const oldMessages = this.messages.filter(m => m.created_at < ninetyDaysAgo).length;

    const byIssue = {};
    this.messages.forEach(m => {
      byIssue[m.issue_id] = (byIssue[m.issue_id] || 0) + 1;
    });

    const topIssues = Object.entries(byIssue)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => ({ issue_id: id, count }));

    return {
      total: totalMessages,
      unread: unreadMessages,
      old90Days: oldMessages,
      topIssues
    };
  }

  archiveMessagesForIssue(issueId, reason = 'cleanup') {
    const messages = this.listMessages({ issue_id: issueId });

    if (messages.length === 0) {
      return { archived: 0 };
    }

    const archiveDir = join(this.jsonlPath, '..', 'messages_archive');

    if (!existsSync(archiveDir)) {
      mkdirSync(archiveDir, { recursive: true });
    }

    const archivePath = join(archiveDir, `${issueId}.jsonl`);
    const timestamp = Date.now();

    messages.forEach(message => {
      const archivedMessage = {
        ...message,
        archived_at: timestamp,
        archive_reason: reason,
        original_id: message.id
      };

      appendToJSONL(archivePath, archivedMessage);
    });

    return { archived: messages.length };
  }

  cleanupOldMessages(options = {}) {
    const maxAgeDays = options.maxAgeDays || this.config.cleanup.default_max_age_days;
    const keepUnread = options.keepUnread !== false;
    const dryRun = options.dryRun || false;

    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

    const toDelete = this.messages.filter(m => {
      if (keepUnread && !m.read) return false;
      return m.created_at < cutoffTime;
    });

    if (dryRun) {
      return { deleted: 0, wouldDelete: toDelete.length, dryRun: true };
    }

    toDelete.forEach(msg => {
      this.deleteMessage(msg.id);
    });

    return { deleted: toDelete.length, dryRun: false };
  }

  cleanupByRunCounter(issueId, keepLastNRuns) {
    keepLastNRuns = keepLastNRuns || this.config.cleanup.keep_last_n_runs;

    const issueMessages = this.messages.filter(m => m.issue_id === issueId);
    const maxRunCounter = Math.max(...issueMessages.map(m => m.run_counter || 0));

    if (maxRunCounter === 0) {
      return { deleted: 0 };
    }

    const cutoffRun = maxRunCounter - keepLastNRuns;
    const toDelete = issueMessages.filter(m => {
      if (!m.read) return false;
      return m.run_counter <= cutoffRun;
    });

    toDelete.forEach(msg => {
      this.deleteMessage(msg.id);
    });

    return { deleted: toDelete.length };
  }

  cleanupReadMessages(issueId, toPhase, keepLastN) {
    keepLastN = keepLastN || this.config.cleanup.keep_last_n_per_phase;

    const phaseMessages = this.messages.filter(m => 
      m.issue_id === issueId && m.to_phase === toPhase
    );

    if (phaseMessages.length <= keepLastN) {
      return { deleted: 0 };
    }

    const messagesToDelete = phaseMessages.length - keepLastN;

    const readMessages = phaseMessages
      .filter(m => m.read)
      .sort((a, b) => a.created_at - b.created_at)
      .slice(0, messagesToDelete);

    readMessages.forEach(msg => {
      this.deleteMessage(msg.id);
    });

    return { deleted: readMessages.length };
  }
}

module.exports = { MessageStorage, validateMessage, generateMessageId };
