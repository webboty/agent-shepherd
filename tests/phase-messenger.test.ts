import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rmSync } from "fs";
import { join } from "path";
import { PhaseMessenger, type CreateMessageInput } from "../.agent-shepherd/src/core/phase-messenger.ts";

describe("PhaseMessenger", () => {
  const testDataDir = join(process.cwd(), ".test-phase-messenger");
  let messenger: PhaseMessenger;

  beforeEach(() => {
    messenger = new PhaseMessenger(testDataDir);
  });

  afterEach(() => {
    messenger.close();
    try {
      rmSync(testDataDir, { recursive: true, force: true });
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  });

  describe("sendMessage", () => {
    it("should create and store a message", () => {
      const input: CreateMessageInput = {
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Test context message"
      };

      const message = messenger.sendMessage(input);

      expect(message).toBeDefined();
      expect(message.id).toBeDefined();
      expect(message.issue_id).toBe("test-issue-1");
      expect(message.from_phase).toBe("plan");
      expect(message.to_phase).toBe("implement");
      expect(message.message_type).toBe("context");
      expect(message.content).toBe("Test context message");
      expect(message.read).toBe(false);
      expect(message.created_at).toBeDefined();
    });

    it("should store message with metadata", () => {
      const input: CreateMessageInput = {
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "result",
        content: "Test result",
        metadata: { priority: "high", test_key: "test_value" }
      };

      const message = messenger.sendMessage(input);

      expect(message.metadata).toEqual({ priority: "high", test_key: "test_value" });
    });

    it("should assign default run_counter", () => {
      const input: CreateMessageInput = {
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Test"
      };

      const message = messenger.sendMessage(input);

      expect(message.run_counter).toBe(1);
    });

    it("should accept custom run_counter", () => {
      const input: CreateMessageInput = {
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Test",
        run_counter: 5
      };

      const message = messenger.sendMessage(input);

      expect(message.run_counter).toBe(5);
    });
  });

  describe("receiveMessages", () => {
    beforeEach(() => {
      const inputs: CreateMessageInput[] = [
        {
          issue_id: "test-issue-1",
          from_phase: "plan",
          to_phase: "implement",
          message_type: "context",
          content: "Message 1"
        },
        {
          issue_id: "test-issue-1",
          from_phase: "test",
          to_phase: "implement",
          message_type: "result",
          content: "Message 2"
        },
        {
          issue_id: "test-issue-2",
          from_phase: "plan",
          to_phase: "implement",
          message_type: "decision",
          content: "Message 3"
        }
      ];

      inputs.forEach(input => messenger.sendMessage(input));
    });

    it("should retrieve unread messages for specific issue and phase", () => {
      const messages = messenger.receiveMessages("test-issue-1", "implement", false);

      expect(messages).toHaveLength(2);
      expect(messages.every(m => m.issue_id === "test-issue-1")).toBe(true);
      expect(messages.every(m => m.to_phase === "implement")).toBe(true);
      expect(messages.every(m => !m.read)).toBe(true);
    });

    it("should mark messages as read when markAsRead is true", () => {
      const initialUnread = messenger.receiveMessages("test-issue-1", "implement", false);
      expect(initialUnread).toHaveLength(2);

      messenger.receiveMessages("test-issue-1", "implement", true);

      const afterMark = messenger.receiveMessages("test-issue-1", "implement", false);
      expect(afterMark).toHaveLength(0);
    });

    it("should not mark messages as read when markAsRead is false", () => {
      messenger.receiveMessages("test-issue-1", "implement", false);

      const afterMark = messenger.receiveMessages("test-issue-1", "implement", false);
      expect(afterMark).toHaveLength(2);
    });
  });

  describe("listMessages", () => {
    beforeEach(() => {
      const now = Date.now();
      const inputs: CreateMessageInput[] = [
        {
          issue_id: "test-issue-1",
          from_phase: "plan",
          to_phase: "implement",
          message_type: "context",
          content: "Message 1"
        },
        {
          issue_id: "test-issue-1",
          from_phase: "plan",
          to_phase: "test",
          message_type: "result",
          content: "Message 2"
        },
        {
          issue_id: "test-issue-2",
          from_phase: "plan",
          to_phase: "implement",
          message_type: "decision",
          content: "Message 3"
        }
      ];

      inputs.forEach(input => messenger.sendMessage(input));
    });

    it("should list all messages when no filters provided", () => {
      const messages = messenger.listMessages();

      expect(messages.length).toBeGreaterThanOrEqual(3);
    });

    it("should filter by issue_id", () => {
      const messages = messenger.listMessages({ issue_id: "test-issue-1" });

      expect(messages).toHaveLength(2);
      expect(messages.every(m => m.issue_id === "test-issue-1")).toBe(true);
    });

    it("should filter by to_phase", () => {
      const messages = messenger.listMessages({ to_phase: "implement" });

      expect(messages).toHaveLength(2);
      expect(messages.every(m => m.to_phase === "implement")).toBe(true);
    });

    it("should filter by from_phase", () => {
      const messages = messenger.listMessages({ from_phase: "plan" });

      expect(messages).toHaveLength(3);
      expect(messages.every(m => m.from_phase === "plan")).toBe(true);
    });

    it("should filter by message_type", () => {
      const messages = messenger.listMessages({ message_type: "context" });

      expect(messages).toHaveLength(1);
      expect(messages[0].message_type).toBe("context");
    });

    it("should filter by read status", () => {
      const initial = messenger.listMessages({ read: false });
      expect(initial.length).toBeGreaterThan(0);

      messenger.receiveMessages("test-issue-1", "implement", true);

      const afterRead = messenger.listMessages({ read: false });
      expect(afterRead.length).toBeLessThan(initial.length);
    });

    it("should apply multiple filters", () => {
      const messages = messenger.listMessages({
        issue_id: "test-issue-1",
        to_phase: "implement"
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].issue_id).toBe("test-issue-1");
      expect(messages[0].to_phase).toBe("implement");
    });

    it("should respect limit parameter", () => {
      const messages = messenger.listMessages({ limit: 1 });

      expect(messages).toHaveLength(1);
    });

    it("should return messages in descending created_at order", () => {
      const messages = messenger.listMessages({ issue_id: "test-issue-1" });

      for (let i = 1; i < messages.length; i++) {
        expect(messages[i].created_at).toBeLessThanOrEqual(messages[i - 1].created_at);
      }
    });
  });

  describe("getUnreadCount", () => {
    it("should return 0 when no unread messages exist", () => {
      const count = messenger.getUnreadCount("nonexistent", "phase");
      expect(count).toBe(0);
    });

    it("should count unread messages correctly", () => {
      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Message 1"
      });

      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "test",
        to_phase: "implement",
        message_type: "result",
        content: "Message 2"
      });

      const count = messenger.getUnreadCount("test-issue-1", "implement");
      expect(count).toBe(2);

      messenger.receiveMessages("test-issue-1", "implement", true);

      const countAfterRead = messenger.getUnreadCount("test-issue-1", "implement");
      expect(countAfterRead).toBe(0);
    });
  });

  describe("deleteIssueMessages", () => {
    it("should delete all messages for an issue", () => {
      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Message 1"
      });

      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "test",
        to_phase: "review",
        message_type: "result",
        content: "Message 2"
      });

      messenger.sendMessage({
        issue_id: "test-issue-2",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "decision",
        content: "Message 3"
      });

      const beforeDelete = messenger.listMessages({ issue_id: "test-issue-1" });
      expect(beforeDelete).toHaveLength(2);

      messenger.deleteIssueMessages("test-issue-1");

      const afterDelete = messenger.listMessages({ issue_id: "test-issue-1" });
      expect(afterDelete).toHaveLength(0);

      const otherIssue = messenger.listMessages({ issue_id: "test-issue-2" });
      expect(otherIssue).toHaveLength(1);
    });
  });

  describe("dual storage", () => {
    it("should persist messages across restarts", () => {
      messenger.sendMessage({
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Persistent message"
      });

      messenger.close();

      const newMessenger = new PhaseMessenger(testDataDir);
      const messages = newMessenger.listMessages({ issue_id: "test-issue-1" });

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("Persistent message");

      newMessenger.close();
    });
  });

  describe("integration tests", () => {
    it("should handle complete message workflow", () => {
      const input: CreateMessageInput = {
        issue_id: "test-issue-1",
        from_phase: "plan",
        to_phase: "implement",
        message_type: "context",
        content: "Design specs completed",
        metadata: { priority: "high" }
      };

      const sent = messenger.sendMessage(input);
      expect(sent.id).toBeDefined();

      const unread = messenger.getUnreadCount("test-issue-1", "implement");
      expect(unread).toBe(1);

      const received = messenger.receiveMessages("test-issue-1", "implement", false);
      expect(received).toHaveLength(1);
      expect(received[0].id).toBe(sent.id);
      expect(received[0].read).toBe(false);

      const afterMark = messenger.receiveMessages("test-issue-1", "implement", true);
      expect(afterMark).toHaveLength(1);

      const finalUnread = messenger.getUnreadCount("test-issue-1", "implement");
      expect(finalUnread).toBe(0);
    });

    it("should handle multiple phases for same issue", () => {
      const phases = ["plan", "implement", "test", "review"];

      phases.forEach((phase, index) => {
        messenger.sendMessage({
          issue_id: "test-issue-1",
          from_phase: phase,
          to_phase: phases[(index + 1) % phases.length] || phases[0],
          message_type: "result",
          content: `Phase ${phase} completed`
        });
      });

      const allMessages = messenger.listMessages({ issue_id: "test-issue-1" });
      expect(allMessages).toHaveLength(4);
    });
  });
});
