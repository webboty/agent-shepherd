import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, rmSync, existsSync } from "fs";
import {
  OpenCodeSDKClient,
  getSDKClient,
  type OpenCodeSDKConfig,
} from "../src/core/opencode-sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = join(__dirname, "..", "tmp_test");

describe("OpenCodeSDKClient", () => {
  let testDataDir: string;
  let client: OpenCodeSDKClient;

  beforeAll(() => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testDataDir = join(TEMP_DIR, `.test-opencode-sdk-${timestamp}-${random}`);
    mkdirSync(testDataDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("Constructor", () => {
    it("should create client with default config", () => {
      client = new OpenCodeSDKClient();
      expect(client).toBeDefined();
    });

    it("should create client with custom config", () => {
      const config: OpenCodeSDKConfig = {
        baseUrl: "http://localhost:3000",
        timeoutMs: 60000,
      };
      client = new OpenCodeSDKClient(config);
      expect(client).toBeDefined();
    });
  });

  describe("testConnection", () => {
    it("should return false when OpenCode server is unavailable", async () => {
      client = new OpenCodeSDKClient({
        baseUrl: "http://localhost:9999",
      });
      const result = await client.testConnection();
      expect(result).toBe(false);
    });

    it("should handle connection errors gracefully", async () => {
      client = new OpenCodeSDKClient({
        baseUrl: "http://invalid-host-that-does-not-exist.local",
      });
      const result = await client.testConnection();
      expect(result).toBe(false);
    });
  });

  describe("getSDKClient singleton", () => {
    it("should return same instance across multiple calls", () => {
      const client1 = getSDKClient();
      const client2 = getSDKClient();
      expect(client1).toBe(client2);
    });

    it("should not create new instance after initial creation", () => {
      const client1 = getSDKClient();
      const client2 = getSDKClient({ baseUrl: "http://localhost:3000" });
      expect(client1).toBe(client2);
    });
  });

  describe("createSession", () => {
    it("should fail when OpenCode server is unavailable", async () => {
      client = new OpenCodeSDKClient({
        baseUrl: "http://localhost:9999",
      });

      await expect(client.createSession("Test Session")).rejects.toThrow();
    });
  });

  describe("executeAgent", () => {
    it("should return error result when OpenCode server is unavailable", async () => {
      client = new OpenCodeSDKClient({
        baseUrl: "http://localhost:9999",
      });

      const result = await client.executeAgent({
        agent: "test-agent",
        message: "test message",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.sessionId).toBeUndefined();
    });

    it("should handle session reuse with existing sessionId", async () => {
      client = new OpenCodeSDKClient({
        baseUrl: "http://localhost:9999",
      });

      const result = await client.executeAgent({
        agent: "test-agent",
        message: "test message",
        sessionId: "nonexistent-session-123",
      });

      expect(result.success).toBe(false);
      expect(result.sessionId).toBe("nonexistent-session-123");
    });
  });

  describe("getSessionStatus", () => {
    it("should return exists: false for nonexistent session", async () => {
      client = new OpenCodeSDKClient();

      const status = await client.getSessionStatus("nonexistent-session-123");

      expect(status.exists).toBe(false);
    });

    it("should throw when OpenCode server is unavailable", async () => {
      client = new OpenCodeSDKClient({
        baseUrl: "http://localhost:9999",
      });

      await expect(client.getSessionStatus("test-session-123")).rejects.toThrow();
    });
  });

  describe("cleanupSession", () => {
    it("should skip cleanup when force=false", async () => {
      client = new OpenCodeSDKClient();

      await expect(client.cleanupSession("test-session-123", false)).resolves.not.toThrow();
    });

    it("should handle deletion errors gracefully when force=true", async () => {
      client = new OpenCodeSDKClient({
        baseUrl: "http://localhost:9999",
      });

      await expect(client.cleanupSession("nonexistent-session-123", true)).resolves.not.toThrow();
    });
  });

  describe("listSessionsForIssue", () => {
    it("should return empty array when OpenCode server is unavailable", async () => {
      client = new OpenCodeSDKClient({
        baseUrl: "http://localhost:9999",
      });

      const sessions = await client.listSessionsForIssue("agent-shepherd-123");

      expect(sessions).toEqual([]);
    });
  });
});
