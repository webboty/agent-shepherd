/**
 * OpenCode SDK Module Tests
 * Tests for SDK client mocking and message timestamp extraction
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { OpenCodeSDKClient, getSDKClient, resetSDKClient } from "../src/core/opencode_sdk";

// Mock SDK client
const mockClient = {
  session: {
    messages: async (options: any) => {
      return {
        data: [
          {
            info: {
              time: {
                created: 1000000,
              },
            },
          },
        ],
      };
    },
  },
};

// Mock createOpencodeClient function
let mockCreateOpencodeClient: any;

function mockSDK(messages: any[] = []) {
  mockCreateOpencodeClient = (config: any) => {
    return {
      session: {
        messages: async (options: any) => {
          return {
            data: messages,
          };
        },
      },
    };
  };
}

describe("OpenCodeSDKClient", () => {
  afterEach(() => {
    resetSDKClient();
  });

  describe("getLastSessionActivity", () => {
    test("returns last activity timestamp from session messages", async () => {
      const messages = [
        { info: { time: { created: 1000000 } } },
        { info: { time: { created: 2000000 } } },
        { info: { time: { created: 3000000 } } },
      ];

      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      // Replace the internal client with mock
      (client as any).client = {
        session: {
          messages: async () => ({ data: messages }),
        },
      };

      const result = await client.getLastSessionActivity("session-123");

      expect(result).toBe(3000000);
    });

    test("returns null when session has no messages", async () => {
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      (client as any).client = {
        session: {
          messages: async () => ({ data: [] }),
        },
      };

      const result = await client.getLastSessionActivity("session-123");

      expect(result).toBeNull();
    });

    test("returns null when session data is not available", async () => {
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      (client as any).client = {
        session: {
          messages: async () => ({ data: undefined }),
        },
      };

      const result = await client.getLastSessionActivity("session-123");

      expect(result).toBeNull();
    });

    test("handles messages without timestamps gracefully", async () => {
      const messages = [
        { info: {} },
        { info: { time: {} } },
        { info: { time: { created: 1000000 } } },
      ];

      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      (client as any).client = {
        session: {
          messages: async () => ({ data: messages }),
        },
      };

      const result = await client.getLastSessionActivity("session-123");

      expect(result).toBe(1000000);
    });

    test("handles SDK errors gracefully", async () => {
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      (client as any).client = {
        session: {
          messages: async () => {
            throw new Error("SDK error");
          },
        },
      };

      const result = await client.getLastSessionActivity("session-123");

      expect(result).toBeNull();
    });
  });

  describe("getSessionActivity", () => {
    test("returns session activity information", async () => {
      const messages = [{ info: { time: { created: Date.now() - 60000 } } }];
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      (client as any).client = {
        session: {
          messages: async () => ({ data: messages }),
        },
      };

      const result = await client.getSessionActivity("session-123");

      expect(result.sessionId).toBe("session-123");
      expect(result.lastActivityTimestamp).toBeTruthy();
      expect(result.isActive).toBe(true);
    });

    test("marks session as inactive if no recent activity", async () => {
      const messages = [{ info: { time: { created: Date.now() - 20 * 60 * 1000 } } }];
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      (client as any).client = {
        session: {
          messages: async () => ({ data: messages }),
        },
      };

      const result = await client.getSessionActivity("session-123");

      expect(result.isActive).toBe(false);
    });

    test("handles errors gracefully", async () => {
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      (client as any).client = {
        session: {
          messages: async () => {
            throw new Error("SDK error");
          },
        },
      };

      const result = await client.getSessionActivity("session-123");

      expect(result.isActive).toBe(false);
      expect(result.lastActivityTimestamp).toBeNull();
    });
  });

  describe("checkSessionHeartbeat", () => {
    test("returns alive for recent activity", async () => {
      const recentTime = Date.now() - 60000; // 1 minute ago
      const messages = [{ info: { time: { created: recentTime } } }];
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      (client as any).client = {
        session: {
          messages: async () => ({ data: messages }),
        },
      };

      const result = await client.checkSessionHeartbeat("session-123");

      expect(result.alive).toBe(true);
      expect(result.lastActivity).toBe(recentTime);
      expect(result.lastActivityAge).toBeGreaterThan(0);
      expect(result.stale).toBe(false);
    });

    test("returns stale for old activity", async () => {
      const oldTime = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      const messages = [{ info: { time: { created: oldTime } } }];
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      (client as any).client = {
        session: {
          messages: async () => ({ data: messages }),
        },
      };

      const result = await client.checkSessionHeartbeat("session-123", 5 * 60 * 1000);

      expect(result.alive).toBe(false);
      expect(result.lastActivity).toBe(oldTime);
      expect(result.stale).toBe(true);
    });

    test("uses custom stale threshold", async () => {
      const recentTime = Date.now() - 60000; // 1 minute ago
      const messages = [{ info: { time: { created: recentTime } } }];
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      (client as any).client = {
        session: {
          messages: async () => ({ data: messages }),
        },
      };

      const result = await client.checkSessionHeartbeat("session-123", 30000); // 30 seconds threshold

      expect(result.stale).toBe(true);
    });

    test("handles no activity gracefully", async () => {
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      (client as any).client = {
        session: {
          messages: async () => ({ data: [] }),
        },
      };

      const result = await client.checkSessionHeartbeat("session-123");

      expect(result.alive).toBe(false);
      expect(result.lastActivity).toBeNull();
      expect(result.stale).toBe(true);
    });
  });

  describe("getSDKClient", () => {
    test("returns singleton instance", () => {
      const client1 = getSDKClient();
      const client2 = getSDKClient();

      expect(client1).toBe(client2);
    });

    test("creates instance with custom config", () => {
      const client = getSDKClient({ baseUrl: "http://custom:9999" });

      expect(client).toBeDefined();
      expect(client.getBaseUrl()).toBe("http://custom:9999");
    });
  });

  describe("resetSDKClient", () => {
    test("resets singleton instance", () => {
      const client1 = getSDKClient();
      resetSDKClient();
      const client2 = getSDKClient();

      expect(client1).not.toBe(client2);
    });
  });
});
