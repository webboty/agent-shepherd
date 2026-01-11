/**
 * Tests for Message Cleanup on Issue Completion
 * Tests cleanup triggers, archival, manual commands, and status reporting
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PhaseMessenger, type CreateMessageInput } from "../src/core/phase-messenger.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, ".test-message-cleanup");

describe("Message Cleanup on Issue Completion", () => {
  let messenger: PhaseMessenger;

  beforeEach(() => {
    messenger = new PhaseMessenger(TEST_DIR);
  });

  afterEach(() => {
    messenger.close();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("Archive Messages", () => {
    it("should archive messages for an issue", () => {
      const inputs: CreateMessageInput[] = [
        {
          issue_id: "test-issue-1",
          from_phase: "plan",
          to_phase: "implement",
          message_type: "context",
          content: "Context message 1"
        },
        {
          issue_id: "test-issue-1",
          from_phase: "implement",
          to_phase: "test",
          message_type: "result",
          content: "Result message 1"
        }
      ];

      inputs.forEach(input => messenger.sendMessage(input));

      const archiveResult = messenger.archiveMessagesForIssue("test-issue-1", "test_cleanup");

      expect(archiveResult.archived).toBe(2);
    });

    it("should create per-issue archive file", () => {
      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Test message"
      });

      messenger.archiveMessagesForIssue("test-issue-1", "test_cleanup");

      const archiveDir = join(TEST_DIR, "messages_archive");
      expect(existsSync(archiveDir)).toBe(true);

      const archivePath = join(archiveDir, "test-issue-1.jsonl");
      expect(existsSync(archivePath)).toBe(true);
    });

    it("should preserve message data in archive", () => {
      const originalMessage = messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "data",
        content: "Important data",
        metadata: { key: "value", count: 42 }
      });

      messenger.archiveMessagesForIssue("test-issue-1", "test_cleanup");

      const archivePath = join(TEST_DIR, "messages_archive", "test-issue-1.jsonl");
      const archiveContent = readFileSync(archivePath, "utf-8");
      const archivedMessages = archiveContent.trim().split("\n").map(line => JSON.parse(line));

      expect(archivedMessages).toHaveLength(1);
      expect(archivedMessages[0].id).toBe(originalMessage.id);
      expect(archivedMessages[0].issue_id).toBe(originalMessage.issue_id);
      expect(archivedMessages[0].content).toBe(originalMessage.content);
      expect(archivedMessages[0].metadata).toEqual(originalMessage.metadata);
      expect(archivedMessages[0].archived_at).toBeDefined();
      expect(archivedMessages[0].archive_reason).toBe("test_cleanup");
    });

    it("should return 0 archived when no messages exist", () => {
      const result = messenger.archiveMessagesForIssue("nonexistent-issue", "test_cleanup");

      expect(result.archived).toBe(0);
    });

    it("should archive only messages for specific issue", () => {
      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Issue 1 message"
      });

      messenger.sendMessage({
        issue_id: "test-issue-2",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Issue 2 message"
      });

      messenger.archiveMessagesForIssue("test-issue-1", "test_cleanup");

      const archivePath1 = join(TEST_DIR, "messages_archive", "test-issue-1.jsonl");
      const archivePath2 = join(TEST_DIR, "messages_archive", "test-issue-2.jsonl");

      expect(existsSync(archivePath1)).toBe(true);
      expect(existsSync(archivePath2)).toBe(false);

      const archiveContent = readFileSync(archivePath1, "utf-8");
      const archivedMessages = archiveContent.trim().split("\n").map(line => JSON.parse(line));

      expect(archivedMessages).toHaveLength(1);
      expect(archivedMessages[0].issue_id).toBe("test-issue-1");
    });
  });

  describe("Cleanup Phase Messages", () => {
    it("should archive and delete messages", () => {
      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Message to cleanup"
      });

      const cleanupResult = messenger.cleanupPhaseMessages("test-issue-1", "manual_cleanup");

      expect(cleanupResult.archived).toBe(1);
      expect(cleanupResult.deleted).toBe(1);
    });

    it("should remove messages from active database after cleanup", () => {
      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Message to cleanup"
      });

      const beforeCleanup = messenger.listMessages({ issue_id: "test-issue-1" });
      expect(beforeCleanup).toHaveLength(1);

      messenger.cleanupPhaseMessages("test-issue-1", "manual_cleanup");

      const afterCleanup = messenger.listMessages({ issue_id: "test-issue-1" });
      expect(afterCleanup).toHaveLength(0);
    });

    it("should track database size changes", () => {
      for (let i = 0; i < 5; i++) {
        messenger.sendMessage({
          issue_id: "test-issue-1",
          from_phase: "plan",
          to_phase: "implement",
          message_type: "context",
          content: `Message ${i}: ${"x".repeat(100)}`
        });
      }

      const result = messenger.cleanupPhaseMessages("test-issue-1", "manual_cleanup");

      expect(result.db_size_before).toBeGreaterThan(0);
      expect(result.db_size_after).toBeGreaterThanOrEqual(0);
    });

    it("should record cleanup metrics", () => {
      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Test message"
      });

      messenger.cleanupPhaseMessages("test-issue-1", "test_reason");

      const metrics = messenger.getCleanupMetrics("test-issue-1");

      expect(metrics).toHaveLength(1);
      expect(metrics[0].issue_id).toBe("test-issue-1");
      expect(metrics[0].reason).toBe("test_reason");
      expect(metrics[0].messages_archived).toBe(1);
      expect(metrics[0].messages_deleted).toBe(1);
      expect(metrics[0].timestamp).toBeDefined();
    });

    it("should handle multiple cleanup operations", () => {
      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "First message"
      });

      messenger.cleanupPhaseMessages("test-issue-1", "first_cleanup");

      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Second message"
      });

      messenger.cleanupPhaseMessages("test-issue-1", "second_cleanup");

      const metrics = messenger.getCleanupMetrics("test-issue-1");

      expect(metrics).toHaveLength(2);
      expect(metrics[0].reason).toBe("second_cleanup");
      expect(metrics[1].reason).toBe("first_cleanup");
    });
  });

  describe("Get Cleanup Metrics", () => {
    it("should return empty array when no cleanup metrics exist", () => {
      const metrics = messenger.getCleanupMetrics();

      expect(metrics).toEqual([]);
    });

    it("should return cleanup metrics for specific issue", () => {
      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Message"
      });

      messenger.cleanupPhaseMessages("test-issue-1", "test_cleanup");

      const issueMetrics = messenger.getCleanupMetrics("test-issue-1");
      const allMetrics = messenger.getCleanupMetrics();

      expect(issueMetrics).toHaveLength(1);
      expect(allMetrics).toHaveLength(1);
      expect(issueMetrics[0].issue_id).toBe("test-issue-1");
    });

    it("should filter metrics by issue ID", () => {
      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Message 1"
      });

      messenger.cleanupPhaseMessages("test-issue-1", "cleanup_1");

      messenger.sendMessage({
        issue_id: "test-issue-2",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Message 2"
      });

      messenger.cleanupPhaseMessages("test-issue-2", "cleanup_2");

      const issue1Metrics = messenger.getCleanupMetrics("test-issue-1");
      const issue2Metrics = messenger.getCleanupMetrics("test-issue-2");

      expect(issue1Metrics).toHaveLength(1);
      expect(issue2Metrics).toHaveLength(1);
      expect(issue1Metrics[0].issue_id).toBe("test-issue-1");
      expect(issue2Metrics[0].issue_id).toBe("test-issue-2");
    });

    it("should return metrics in descending timestamp order", () => {
      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Message"
      });

      messenger.cleanupPhaseMessages("test-issue-1", "first");

      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Message"
      });

      messenger.cleanupPhaseMessages("test-issue-1", "second");

      const metrics = messenger.getCleanupMetrics("test-issue-1");

      expect(metrics[0].reason).toBe("second");
      expect(metrics[1].reason).toBe("first");
    });
  });

  describe("Get Message Stats", () => {
    beforeEach(() => {
      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Unread message"
      });

      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "result",
        content: "Unread result"
      });

      messenger.sendMessage({
        issue_id: "test-issue-2",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Other issue message"
      });

      messenger.receiveMessages("test-issue-1", "implement", true);
    });

    it("should return overall stats when no issue ID specified", () => {
      const stats = messenger.getMessageStats();

      expect(stats.total_messages).toBe(3);
      expect(stats.read_messages).toBe(2);
      expect(stats.unread_messages).toBe(1);
      expect(stats.db_size_mb).toBeGreaterThan(0);
    });

    it("should return stats for specific issue", () => {
      const stats = messenger.getMessageStats("test-issue-1");

      expect(stats.total_messages).toBe(2);
      expect(stats.read_messages).toBe(2);
      expect(stats.unread_messages).toBe(0);
    });

    it("should include by_issue breakdown when no issue specified", () => {
      const stats = messenger.getMessageStats();

      expect(stats.by_issue).toBeDefined();
      expect(stats.by_issue["test-issue-1"]).toBe(2);
      expect(stats.by_issue["test-issue-2"]).toBe(1);
    });

    it("should not include by_issue when issue specified", () => {
      const stats = messenger.getMessageStats("test-issue-1");

      expect(stats.by_issue).toEqual({});
    });
  });

  describe("Cleanup Workflow Integration", () => {
    it("should simulate manual cleanup workflow", () => {
      const inputs: CreateMessageInput[] = [
        {
          issue_id: "agent-shepherd-alg8.1",
          from_phase: "plan",
          to_phase: "implement",
          message_type: "context",
          content: "Plan completed"
        },
        {
          issue_id: "agent-shepherd-alg8.1",
          from_phase: "implement",
          to_phase: "test",
          message_type: "result",
          content: "Implementation completed"
        },
        {
          issue_id: "agent-shepherd-alg8.1",
          from_phase: "test",
          to_phase: "review",
          message_type: "decision",
          content: "Tests passed"
        }
      ];

      inputs.forEach(input => messenger.sendMessage(input));

      const beforeCleanup = messenger.listMessages({ issue_id: "agent-shepherd-alg8.1" });
      expect(beforeCleanup).toHaveLength(3);

      const result = messenger.cleanupPhaseMessages("agent-shepherd-alg8.1", "manual");

      expect(result.archived).toBe(3);
      expect(result.deleted).toBe(3);

      const afterCleanup = messenger.listMessages({ issue_id: "agent-shepherd-alg8.1" });
      expect(afterCleanup).toHaveLength(0);

      const archivePath = join(TEST_DIR, "messages_archive", "agent-shepherd-alg8.1.jsonl");
      const archiveContent = readFileSync(archivePath, "utf-8");
      const archivedMessages = archiveContent.trim().split("\n").map(line => JSON.parse(line));

      expect(archivedMessages).toHaveLength(3);
      archivedMessages.forEach(msg => {
        expect(msg.archive_reason).toBe("manual");
      });
    });

    it("should handle issue exclusion workflow", () => {
      messenger.sendMessage({
        issue_id: "agent-shepherd-alg8.1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Message to exclude"
      });

      const result = messenger.cleanupPhaseMessages("agent-shepherd-alg8.1", "issue_excluded");

      expect(result.archived).toBe(1);
      expect(result.deleted).toBe(1);

      const metrics = messenger.getCleanupMetrics("agent-shepherd-alg8.1");
      expect(metrics[0].reason).toBe("issue_excluded");
    });
  });

  describe("Data Integrity", () => {
    it("should preserve all message fields during archival", () => {
      const original = messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "data",
        content: "Content",
        metadata: { complex: { nested: { data: [1, 2, 3] } } },
        run_counter: 5
      });

      messenger.cleanupPhaseMessages("test-issue-1", "integrity_test");

      const archivePath = join(TEST_DIR, "messages_archive", "test-issue-1.jsonl");
      const archiveContent = readFileSync(archivePath, "utf-8");
      const archived = JSON.parse(archiveContent.trim());

      expect(archived.id).toBe(original.id);
      expect(archived.issue_id).toBe(original.issue_id);
      expect(archived.from_phase).toBe(original.from_phase);
      expect(archived.to_phase).toBe(original.to_phase);
      expect(archived.run_counter).toBe(original.run_counter);
      expect(archived.message_type).toBe(original.message_type);
      expect(archived.content).toBe(original.content);
      expect(archived.metadata).toEqual(original.metadata);
      expect(archived.read).toBe(original.read);
      expect(archived.created_at).toBe(original.created_at);
    });

    it("should handle multiple cleanup operations for same issue", () => {
      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "First archive"
      });

      messenger.cleanupPhaseMessages("test-issue-1", "first");

      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Second archive"
      });

      messenger.cleanupPhaseMessages("test-issue-1", "second");

      const archivePath = join(TEST_DIR, "messages_archive", "test-issue-1.jsonl");
      const archiveContent = readFileSync(archivePath, "utf-8");
      const lines = archiveContent.trim().split("\n");

      expect(lines).toHaveLength(2);

      const archived1 = JSON.parse(lines[0]);
      const archived2 = JSON.parse(lines[1]);

      expect(archived1.archive_reason).toBe("first");
      expect(archived2.archive_reason).toBe("second");
    });
  });
});
