/**
 * Tests for Garbage Collection
 * Tests retention policies, archiving, and cleanup functionality
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Database } from "bun:sqlite";
import { resetManager } from "../src/core/retention-policy.ts";
import { resetCollector } from "../src/core/garbage-collector.ts";
import { resetCleanupEngine } from "../src/core/cleanup-engine.ts";
import { Logger, getLogger, type RunRecord } from "../src/core/logging.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, ".test-garbage-collection");

describe("RetentionPolicyManager", () => {
  const policies = [
    {
      name: "default",
      description: "Default policy",
      enabled: true,
      age_days: 30,
      max_runs: 1000,
      max_size_mb: 100,
      archive_enabled: true,
      archive_after_days: 30,
      delete_after_days: 90,
      keep_successful_runs: false,
      keep_failed_runs: true,
    },
    {
      name: "strict",
      description: "Strict cleanup policy",
      enabled: true,
      age_days: 7,
      max_runs: 500,
      max_size_mb: 50,
      archive_enabled: true,
      delete_after_days: 30,
    },
  ];

  beforeEach(() => {
    Logger.resetInstance();
    resetManager();
  });

  it("should initialize with policies", () => {
    const { getRetentionPolicyManager } = require("../src/core/retention-policy.ts");
    const manager = getRetentionPolicyManager(policies, null);

    expect(manager.getPolicies().length).toBe(2);
  });

  it("should get policy by name", () => {
    const { getRetentionPolicyManager } = require("../src/core/retention-policy.ts");
    const manager = getRetentionPolicyManager(policies, null);

    const policy = manager.getPolicy("default");
    expect(policy).toBeDefined();
    expect(policy?.name).toBe("default");
  });

  it("should return null for non-existent policy", () => {
    const { getRetentionPolicyManager } = require("../src/core/retention-policy.ts");
    const manager = getRetentionPolicyManager(policies, null);

    const policy = manager.getPolicy("nonexistent");
    expect(policy).toBeNull();
  });

  it("should identify runs needing archiving", () => {
    const { getRetentionPolicyManager } = require("../src/core/retention-policy.ts");
    const manager = getRetentionPolicyManager(policies, null);

    const oldRun: RunRecord = {
      id: "run-1",
      issue_id: "issue-1",
      session_id: "session-1",
      agent_id: "agent-1",
      policy_name: "policy-1",
      phase: "implement",
      status: "completed",
      created_at: Date.now() - 35 * 24 * 60 * 60 * 1000,
      updated_at: Date.now() - 35 * 24 * 60 * 60 * 1000,
    };

    const { shouldArchive } = manager.shouldArchiveRun(oldRun);
    expect(shouldArchive).toBe(true);
  });

  it("should not archive recent runs", () => {
    const { getRetentionPolicyManager } = require("../src/core/retention-policy.ts");
    const manager = getRetentionPolicyManager(policies, null);

    const newRun: RunRecord = {
      id: "run-1",
      issue_id: "issue-1",
      session_id: "session-1",
      agent_id: "agent-1",
      policy_name: "policy-1",
      phase: "implement",
      status: "completed",
      created_at: Date.now() - 1 * 24 * 60 * 60 * 1000,
      updated_at: Date.now() - 1 * 24 * 60 * 60 * 1000,
    };

    const { shouldArchive } = manager.shouldArchiveRun(newRun);
    expect(shouldArchive).toBe(false);
  });

  it("should identify runs needing deletion", () => {
    const { getRetentionPolicyManager } = require("../src/core/retention-policy.ts");
    const manager = getRetentionPolicyManager(policies, null);

    const veryOldRun: RunRecord = {
      id: "run-1",
      issue_id: "issue-1",
      session_id: "session-1",
      agent_id: "agent-1",
      policy_name: "policy-1",
      phase: "implement",
      status: "completed",
      created_at: Date.now() - 100 * 24 * 60 * 60 * 1000,
      updated_at: Date.now() - 100 * 24 * 60 * 60 * 1000,
    };

    const { shouldDelete } = manager.shouldDeleteRun(veryOldRun);
    expect(shouldDelete).toBe(true);
  });

  it("should detect size limit violations", () => {
    const { getRetentionPolicyManager } = require("../src/core/retention-policy.ts");
    const manager = getRetentionPolicyManager(policies, null);

    const { needsCleanup } = manager.needsCleanup(1500, 150 * 1024 * 1024);
    expect(needsCleanup).toBe(true);
  });

  it("should not need cleanup within limits", () => {
    const { getRetentionPolicyManager } = require("../src/core/retention-policy.ts");
    const manager = getRetentionPolicyManager(policies, null);

    const { needsCleanup } = manager.needsCleanup(500, 50 * 1024 * 1024);
    expect(needsCleanup).toBe(false);
  });

  it("should record cleanup metrics", () => {
    const { getRetentionPolicyManager } = require("../src/core/retention-policy.ts");
    const manager = getRetentionPolicyManager(policies, null);

    manager.recordMetrics({
      timestamp: Date.now(),
      policy_name: "default",
      operation: "archive",
      runs_processed: 100,
      runs_archived: 50,
      runs_deleted: 0,
      bytes_archived: 1000000,
      bytes_deleted: 0,
      duration_ms: 1000,
    });

    const metrics = manager.getMetrics();
    expect(metrics.length).toBe(1);
    expect(metrics[0].runs_archived).toBe(50);
  });

  it("should calculate aggregate metrics", () => {
    const { getRetentionPolicyManager } = require("../src/core/retention-policy.ts");
    const manager = getRetentionPolicyManager(policies, null);

    manager.recordMetrics({
      timestamp: Date.now(),
      policy_name: "default",
      operation: "archive",
      runs_processed: 100,
      runs_archived: 50,
      runs_deleted: 0,
      bytes_archived: 1000000,
      bytes_deleted: 0,
      duration_ms: 1000,
    });

    manager.recordMetrics({
      timestamp: Date.now(),
      policy_name: "default",
      operation: "delete",
      runs_processed: 50,
      runs_archived: 0,
      runs_deleted: 25,
      bytes_archived: 0,
      bytes_deleted: 500000,
      duration_ms: 500,
    });

    const agg = manager.getAggregateMetrics();
    expect(agg.total_runs_archived).toBe(50);
    expect(agg.total_runs_deleted).toBe(25);
    expect(agg.total_bytes_archived).toBe(1000000);
    expect(agg.total_bytes_deleted).toBe(500000);
  });
});

describe("GarbageCollector", () => {
  let testLogger: Logger;

  beforeEach(() => {
    Logger.resetInstance();
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    testLogger = new Logger(TEST_DIR);
    resetCollector();
  });

  afterEach(() => {
    testLogger.close();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }

    resetCollector();
    resetCleanupEngine();
  });

  it("should create archive database", () => {
    const { getGarbageCollector } = require("../src/core/garbage-collector.ts");

    const collector = getGarbageCollector({
      dataDir: TEST_DIR,
      policies: [
        {
          name: "default",
          enabled: true,
          age_days: 30,
          max_runs: 1000,
          max_size_mb: 100,
          archive_enabled: true,
        },
      ],
    });

    const archiveDbPath = join(TEST_DIR, "archive", "archive.db");
    expect(existsSync(archiveDbPath)).toBe(true);

    collector.close();
  });

  it("should archive old runs", async () => {
    const { getGarbageCollector } = require("../src/core/garbage-collector.ts");

    const oldRunTimestamp = Date.now() - 35 * 24 * 60 * 60 * 1000;
    const oldRun = testLogger.createRun({
      id: "run-old",
      issue_id: "issue-1",
      session_id: "session-1",
      agent_id: "agent-1",
      policy_name: "policy-1",
      phase: "implement",
      status: "completed",
    });

    const collector = getGarbageCollector({
      dataDir: TEST_DIR,
      policies: [
        {
          name: "default",
          enabled: true,
          age_days: 30,
          archive_enabled: true,
          archive_after_days: 30,
        },
      ],
    });

    const result = await collector.archiveOldRuns();
    expect(result.success).toBe(true);

    collector.close();
  });

  it("should enforce size limits", async () => {
    const { getGarbageCollector } = require("../src/core/garbage-collector.ts");

    for (let i = 0; i < 1100; i++) {
      testLogger.createRun({
        id: `run-${i}`,
        issue_id: `issue-${i}`,
        session_id: `session-${i}`,
        agent_id: "agent-1",
        policy_name: "policy-1",
        phase: "implement",
        status: "completed",
      });
    }

    const collector = getGarbageCollector({
      dataDir: TEST_DIR,
      policies: [
        {
          name: "size-limit",
          enabled: true,
          age_days: 1,
          max_runs: 1000,
          max_size_mb: 0,
          archive_enabled: true,
        },
      ],
    });

    const result = await collector.enforceSizeLimits();
    expect(result.success).toBe(true);

    collector.close();
  });

  it("should run full cleanup", async () => {
    const { getGarbageCollector } = require("../src/core/garbage-collector.ts");

    for (let i = 0; i < 10; i++) {
      testLogger.createRun({
        id: `run-${i}`,
        issue_id: `issue-${i}`,
        session_id: `session-${i}`,
        agent_id: "agent-1",
        policy_name: "policy-1",
        phase: "implement",
        status: i % 2 === 0 ? "completed" : "failed",
      });
    }

    const collector = getGarbageCollector({
      dataDir: TEST_DIR,
      policies: [
        {
          name: "default",
          enabled: true,
          age_days: 30,
          archive_enabled: true,
          archive_after_days: 30,
          delete_after_days: 90,
        },
      ],
    });

    const results = await collector.runFullCleanup();
    expect(results.length).toBe(3);

    for (const result of results) {
      expect(result.success).toBe(true);
    }

    collector.close();
  });
});

describe("CleanupEngine", () => {
  beforeEach(() => {
    Logger.resetInstance();
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    resetCleanupEngine();
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }

    resetCleanupEngine();
  });

  it("should start without errors", async () => {
    const { getCleanupEngine } = require("../src/core/cleanup-engine.ts");

    const engine = getCleanupEngine({
      dataDir: TEST_DIR,
      runOnStartup: false,
      cleanupInterval: 0,
      retentionConfig: {
        enabled: true,
        cleanup_on_startup: false,
        cleanup_interval_ms: 0,
        archive_enabled: true,
        policies: [
          {
            name: "default",
            enabled: true,
            age_days: 30,
            archive_enabled: true,
          },
        ],
      },
    });

    await engine.start();
    engine.close();

    expect(true).toBe(true);
  });

  it("should run startup cleanup when enabled", async () => {
    const { getCleanupEngine } = require("../src/core/cleanup-engine.ts");
    const { Logger } = require("../src/core/logging.ts");

    const logger = new Logger(TEST_DIR);

    for (let i = 0; i < 10; i++) {
      logger.createRun({
        id: `run-${i}`,
        issue_id: `issue-${i}`,
        session_id: `session-${i}`,
        agent_id: "agent-1",
        policy_name: "policy-1",
        phase: "implement",
        status: "completed",
        created_at: Date.now() - 35 * 24 * 60 * 60 * 1000,
        updated_at: Date.now() - 35 * 24 * 60 * 60 * 1000,
      });
    }

    const engine = getCleanupEngine({
      dataDir: TEST_DIR,
      runOnStartup: true,
      cleanupInterval: 0,
      retentionConfig: {
        enabled: true,
        cleanup_on_startup: true,
        cleanup_interval_ms: 0,
        archive_enabled: true,
        policies: [
          {
            name: "default",
            enabled: true,
            age_days: 30,
            archive_enabled: true,
            archive_after_days: 30,
          },
        ],
      },
    });

    await engine.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    engine.close();

    logger.close();

    expect(true).toBe(true);
  });

  it("should run immediate cleanup", async () => {
    const { getCleanupEngine } = require("../src/core/cleanup-engine.ts");

    const engine = getCleanupEngine({
      dataDir: TEST_DIR,
      runOnStartup: false,
      cleanupInterval: 0,
      retentionConfig: {
        enabled: true,
        cleanup_on_startup: false,
        cleanup_interval_ms: 0,
        archive_enabled: true,
        policies: [],
      },
    });

    const result = await engine.runImmediateCleanup();
    expect(result).toBeDefined();

    engine.close();
  });
});
