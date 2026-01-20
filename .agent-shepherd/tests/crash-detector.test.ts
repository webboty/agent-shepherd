/**
 * Crash Detector Tests
 * Tests for crash detection, abandonment recovery, and epic claiming
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { CrashDetector, resetCrashDetector, type CrashDetectionConfig, getCrashDetector, setCrashDetectorTestMocks, clearCrashDetectorTestMocks } from "../src/core/crash-detector";
import { Logger, getLogger, resetLogger } from "../src/core/logging";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, rmSync, existsSync } from "fs";
import { setupBeadsIsolation, cleanupBeadsEnv, type BeadsTestEnv } from "./helpers/beads-test-isolation";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = join(__dirname, '..', 'tmp_test');

describe("CrashDetector", () => {
  let detector: CrashDetector;
  let logger: Logger;
  let testDataDir: string;
  let beadsTestEnv: BeadsTestEnv;

  beforeEach(async () => {
    // Set up isolated Beads database first
    beadsTestEnv = setupBeadsIsolation();
    await beadsTestEnv.initialize();

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testDataDir = join(TEMP_DIR, `.test-crash-detector-${timestamp}-${random}`);
    mkdirSync(testDataDir, { recursive: true });

    process.env.ASHEP_DIR = testDataDir;
    process.env.ASHEP_WORKER_ID = "test-worker-1";
    // Set Beads environment variables for isolated testing
    process.env.BEADS_DIR = beadsTestEnv.beadsDir;
    process.env.BD_NO_DAEMON = "true";
    process.env.BD_SANDBOX = "true";

    resetLogger();
    resetCrashDetector();

    logger = getLogger(testDataDir);
    detector = new CrashDetector({
      heartbeat_threshold_ms: 300000,
      lease_duration_ms: 1800000,
      fallback_to_lease: true,
    });

    // Create test issues in isolated database
    await beadsTestEnv.exec(["create", "--type", "epic", "--title", "Test Epic", "--id", "test-epic-1"]);
    await beadsTestEnv.exec(["create", "--type", "task", "--title", "Test Task 1", "--id", "test-epic-1.1"]);
    await beadsTestEnv.exec(["create", "--type", "task", "--title", "Test Task 2", "--id", "test-epic-1.2"]);
    await beadsTestEnv.exec(["create", "--type", "task", "--title", "Test Issue", "--id", "test-issue-1"]);

    // Note: Hierarchical issue IDs (test-epic-1.1, test-epic-1.2) automatically create parent-child relationships
  });

  afterEach(async () => {
    try {
      resetCrashDetector();
    } catch {
      // Ignore
    }
    clearCrashDetectorTestMocks();
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    await beadsTestEnv.cleanup();
    cleanupBeadsEnv();
    delete process.env.ASHEP_WORKER_ID;
  });

  describe("constructor and configuration", () => {
    test("uses default configuration when no config provided", () => {
      const defaultDetector = new CrashDetector();
      const config = defaultDetector.getConfig();

      expect(config.heartbeat_threshold_ms).toBe(300000);
      expect(config.lease_duration_ms).toBe(1800000);
      expect(config.fallback_to_lease).toBe(true);
    });

    test("uses custom configuration", () => {
      const customConfig: CrashDetectionConfig = {
        heartbeat_threshold_ms: 60000,
        lease_duration_ms: 900000,
        fallback_to_lease: false,
      };

      const customDetector = new CrashDetector(customConfig);
      const config = customDetector.getConfig();

      expect(config.heartbeat_threshold_ms).toBe(60000);
      expect(config.lease_duration_ms).toBe(900000);
      expect(config.fallback_to_lease).toBe(false);
    });

    test("updateConfig modifies configuration", () => {
      detector.updateConfig({
        heartbeat_threshold_ms: 120000,
      });

      const config = detector.getConfig();
      expect(config.heartbeat_threshold_ms).toBe(120000);
      expect(config.lease_duration_ms).toBe(1800000);
    });
  });

  describe("checkAbandonment", () => {
    test("returns not abandoned when heartbeat is fresh", async () => {
      setCrashDetectorTestMocks({
        getLastHeartbeat: async () => Date.now() - 60000,
        getLeaseExpires: async () => Date.now() + 1800000,
      });

      resetCrashDetector();
      const testDetector = new CrashDetector();

      const result = await testDetector.checkAbandonment("test-epic-1");
      expect(result.abandoned).toBe(false);
      expect(result.detectedMethod).toBe("heartbeat");
      expect(result.heartbeatAge).toBeDefined();
      expect(result.heartbeatAge! < 120000).toBe(true);
    });

    test("detects abandonment when heartbeat is stale", async () => {
      setCrashDetectorTestMocks({
        getLastHeartbeat: async () => Date.now() - 600000,
        getLeaseExpires: async () => Date.now() + 1800000,
      });

      resetCrashDetector();
      const testDetector = new CrashDetector({
        heartbeat_threshold_ms: 300000,
      });

      const result = await testDetector.checkAbandonment("test-epic-1");
      expect(result.abandoned).toBe(true);
      expect(result.detectedMethod).toBe("heartbeat");
      expect(result.reason).toContain("Heartbeat stale");
      expect(result.heartbeatAge).toBeGreaterThan(500000);
    });

    test("detects abandonment when lease is expired", async () => {
      setCrashDetectorTestMocks({
        getLastHeartbeat: async () => null,
        getLeaseExpires: async () => Date.now() - 600000,
      });

      resetCrashDetector();
      const testDetector = new CrashDetector({
        fallback_to_lease: true,
      });

      const result = await testDetector.checkAbandonment("test-epic-1");
      expect(result.abandoned).toBe(true);
      expect(result.detectedMethod).toBe("lease");
      expect(result.reason).toContain("Lease expired");
    });

    test("detects abandonment via both methods when both are stale", async () => {
      setCrashDetectorTestMocks({
        getLastHeartbeat: async () => Date.now() - 600000,
        getLeaseExpires: async () => Date.now() - 600000,
      });

      resetCrashDetector();
      const testDetector = new CrashDetector();

      const result = await testDetector.checkAbandonment("test-epic-1");
      expect(result.abandoned).toBe(true);
      expect(result.detectedMethod).toBe("both");
      expect(result.heartbeatAge).toBeDefined();
      expect(result.leaseExpired).toBe(true);
    });

    test("falls back to lease when heartbeat fails and fallback is enabled", async () => {
      setCrashDetectorTestMocks({
        getLastHeartbeat: async () => {
          throw new Error("TEST_SCENARIO: Simulating heartbeat service unavailable - testing fallback to lease checking");
        },
        getLeaseExpires: async () => Date.now() - 600000,
      });

      resetCrashDetector();
      const testDetector = new CrashDetector({
        fallback_to_lease: true,
      });

      const result = await testDetector.checkAbandonment("test-epic-1");
      expect(result.abandoned).toBe(true);
      expect(result.detectedMethod).toBe("lease");
    });

    test("returns not abandoned when lease is valid", async () => {
      setCrashDetectorTestMocks({
        getLastHeartbeat: async () => null,
        getLeaseExpires: async () => Date.now() + 1800000,
      });

      resetCrashDetector();
      const testDetector = new CrashDetector({
        fallback_to_lease: true,
      });

      const result = await testDetector.checkAbandonment("test-epic-1");
      expect(result.abandoned).toBe(false);
      expect(result.detectedMethod).toBe("lease");
    });
  });

  describe("formatDuration helpers", () => {
    test("handles seconds in heartbeat age", async () => {
      setCrashDetectorTestMocks({
        getLastHeartbeat: async () => Date.now() - 30000,
        getLeaseExpires: async () => Date.now() + 1800000,
      });

      resetCrashDetector();
      const testDetector = new CrashDetector();

      const result = await testDetector.checkAbandonment("test-epic-1");
      expect(result.heartbeatAge).toBeDefined();
      expect(result.heartbeatAge! < 60000).toBe(true);
    });

    test("handles minutes in heartbeat age", async () => {
      setCrashDetectorTestMocks({
        getLastHeartbeat: async () => Date.now() - 180000,
        getLeaseExpires: async () => Date.now() + 1800000,
      });

      resetCrashDetector();
      const testDetector = new CrashDetector();

      const result = await testDetector.checkAbandonment("test-epic-1");
      expect(result.heartbeatAge).toBeDefined();
      expect(result.heartbeatAge! > 120000).toBe(true);
      expect(result.heartbeatAge! < 300000).toBe(true);
    });

    test("handles hours in heartbeat age", async () => {
      setCrashDetectorTestMocks({
        getLastHeartbeat: async () => Date.now() - 7200000,
        getLeaseExpires: async () => Date.now() + 1800000,
      });

      resetCrashDetector();
      const testDetector = new CrashDetector();

      const result = await testDetector.checkAbandonment("test-epic-1");
      expect(result.heartbeatAge).toBeDefined();
      expect(result.heartbeatAge! > 6000000).toBe(true);
    });
  });

  describe("claimEpic", () => {
    test("claims epic when not owned", async () => {
      setCrashDetectorTestMocks({
        getAssignedWorker: async () => null,
        setAssignedWorker: async () => {},
        setLeaseExpires: async () => {},
      });

      resetCrashDetector();
      const testDetector = new CrashDetector();

      const result = await testDetector.claimEpic("test-epic-1", []);
      expect(result.claimed).toBe(true);
      expect(result.reason).toContain("Successfully claimed epic");
    });

    test("does not claim epic when owned by another worker with active task", async () => {
      setCrashDetectorTestMocks({
        getAssignedWorker: async () => "other-worker",
        getLastHeartbeat: async () => Date.now() - 60000,
      });

      resetCrashDetector();
      const testDetector = new CrashDetector();

      const result = await testDetector.claimEpic("test-epic-1", []);
      expect(result.claimed).toBe(false);
      expect(result.reason).toContain("Owned by other-worker");
    });

    test("handles errors during claim", async () => {
      setCrashDetectorTestMocks({
        getAssignedWorker: async () => {
          throw new Error("TEST_SCENARIO: Simulating worker assignment service failure - testing error handling in epic claiming");
        },
      });

      resetCrashDetector();
      const testDetector = new CrashDetector();

      const result = await testDetector.claimEpic("test-epic-1", []);
      expect(result.claimed).toBe(false);
      expect(result.reason).toContain("Claim failed");
    });
  });

  describe("recoverAbandonedTask", () => {
    test("returns no_action when no active run found", async () => {
      setCrashDetectorTestMocks({
        getIssue: async () => ({
          id: "test-test-issue-1",
          title: "Test Issue",
          description: "",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });

      resetCrashDetector();
      const testDetector = new CrashDetector();

      const result = await testDetector.recoverAbandonedTask(
        "test-epic-1",
        "test-test-issue-1",
        "session-1",
        "implement",
        "Task abandoned"
      );

      expect(result.recovered).toBe(false);
      expect(result.action).toBe("no_action");
      expect(result.reason).toContain("No active run to recover");
    });

    test("returns no_action when issue is found but no matching status", async () => {
      const issueId = "test-issue-status";
      logger.createRun({
        id: "run-status-test",
        issue_id: issueId,
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "simple",
        phase: "implement",
        status: "running",
        outcome: { success: true },
      });

      setCrashDetectorTestMocks({
        getIssue: async () => null,
      });

      resetCrashDetector();
      const testDetector = new CrashDetector();

      const result = await testDetector.recoverAbandonedTask(
        "test-epic-1",
        issueId,
        "session-1",
        "implement",
        "Task abandoned"
      );

      expect(result.recovered).toBe(false);
      expect(result.reason).toContain("No active run to recover");
    });

    test("returns no_action when issue not found", async () => {
      setCrashDetectorTestMocks({
        getIssue: async () => null,
      });

      resetCrashDetector();
      const testDetector = new CrashDetector();

      const result = await testDetector.recoverAbandonedTask(
        "test-epic-1",
        "nonexistent-issue",
        "session-1",
        "implement",
        "Task abandoned"
      );

      expect(result.recovered).toBe(false);
      expect(result.reason).toContain("No active run to recover");
    });
  });

  describe("getEpicSubtree", () => {
    test("returns empty array when no issues found", async () => {
      setCrashDetectorTestMocks({
        listIssues: async () => [],
      });

      resetCrashDetector();
      const testDetector = new CrashDetector();

      const result = await testDetector.getEpicSubtree("test-epic-1");
      expect(result).toEqual([]);
    });

    test("returns matching issues under epic", async () => {
      setCrashDetectorTestMocks({
        listIssues: async () => [
          { id: "test-epic-1", title: "Epic", status: "open", priority: 1, issue_type: "epic", created_at: "", updated_at: "" },
          { id: "test-epic-1.1", title: "Task 1", status: "open", priority: 1, issue_type: "task", created_at: "", updated_at: "" },
          { id: "test-epic-1.2", title: "Task 2", status: "open", priority: 1, issue_type: "task", created_at: "", updated_at: "" },
          { id: "other-epic", title: "Other", status: "open", priority: 1, issue_type: "epic", created_at: "", updated_at: "" },
        ],
      });

      resetCrashDetector();
      const testDetector = new CrashDetector();

      const result = await testDetector.getEpicSubtree("test-epic-1");
      expect(result.length).toBe(2);
      expect(result.map((i: any) => i.id)).toEqual(["test-epic-1.1", "test-epic-1.2"]);
    });
  });

  describe("singleton behavior", () => {
    test("getCrashDetector returns same instance", () => {
      const instance1 = getCrashDetector();
      const instance2 = getCrashDetector();
      expect(instance1).toBe(instance2);
    });

    test("resetCrashDetector clears singleton", () => {
      const instance1 = getCrashDetector();
      resetCrashDetector();
      const instance2 = getCrashDetector();
      expect(instance1).not.toBe(instance2);
    });
  });
});
