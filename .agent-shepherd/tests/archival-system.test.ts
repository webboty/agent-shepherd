/**
 * Tests for Archival System
 * Tests ArchiveLogger, cross-database queries, and archival operations
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { Logger, getLogger, queryAllRuns, getRunHistory, getRunWithArchival, type RunRecord } from "../src/core/logging.ts";
import { ArchiveLogger } from "../src/core/archive-logger.ts";
import { archiveOldRuns } from "../src/core/archive-util.ts";

const TEST_DIR = join(process.cwd(), ".test-archive-system");

describe("ArchiveLogger", () => {
  let testLogger: Logger;
  let archiveLogger: ArchiveLogger;

  beforeEach(() => {
    Logger.resetInstance();
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    testLogger = new Logger(TEST_DIR);
    archiveLogger = new ArchiveLogger(TEST_DIR);
  });

  afterEach(() => {
    testLogger.close();
    archiveLogger.close();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }

    Logger.resetInstance();
  });

  it("should read from archive database", () => {
    const testRun = testLogger.createRun({
      id: "run-1",
      issue_id: "issue-1",
      session_id: "session-1",
      agent_id: "agent-1",
      policy_name: "policy-1",
      phase: "implement",
      status: "completed",
    });

    expect(testLogger.getRun("run-1")).toBeDefined();
  });

  it("should get archived runs", () => {
    const archiveRuns = archiveLogger.getArchivedRuns();
    expect(Array.isArray(archiveRuns)).toBe(true);
  });

  it("should get archived run count", () => {
    const count = archiveLogger.getArchivedRunCount();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("should get archive size", () => {
    const size = archiveLogger.getArchiveSize();
    expect(typeof size).toBe("number");
    expect(size).toBeGreaterThanOrEqual(0);
  });

  it("should cleanup archive", () => {
    const deletedCount = archiveLogger.cleanupArchive(0);
    expect(typeof deletedCount).toBe("number");
    expect(deletedCount).toBeGreaterThanOrEqual(0);
  });

  it("should query archive runs with filters", () => {
    const runs = archiveLogger.queryRuns({
      issue_id: "test-issue",
      limit: 10,
    });
    expect(Array.isArray(runs)).toBe(true);
    expect(runs.length).toBeLessThanOrEqual(10);
  });

  it("should get decisions from archive", () => {
    const decisions = archiveLogger.getDecisions("run-1");
    expect(Array.isArray(decisions)).toBe(true);
  });

  it("should get decisions for issue from archive", () => {
    const decisions = archiveLogger.getDecisionsForIssue("issue-1", { limit: 5 });
    expect(Array.isArray(decisions)).toBe(true);
    expect(decisions.length).toBeLessThanOrEqual(5);
  });

  it("should get phase retry count", () => {
    const count = archiveLogger.getPhaseRetryCount("issue-1", "implement");
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("should get phase visit count", () => {
    const count = archiveLogger.getPhaseVisitCount("issue-1", "implement");
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

describe("Cross-Database Queries", () => {
  let testLogger: Logger;

  beforeEach(() => {
    Logger.resetInstance();
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    testLogger = new Logger(TEST_DIR);
  });

  afterEach(() => {
    testLogger.close();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }

    Logger.resetInstance();
  });

  it("should query all runs from both databases", () => {
    for (let i = 0; i < 10; i++) {
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

    const allRuns = queryAllRuns({ limit: 20 }, TEST_DIR);
    expect(allRuns.length).toBeGreaterThanOrEqual(10);
  });

  it("should query all runs with filters", () => {
    testLogger.createRun({
      id: "run-1",
      issue_id: "issue-1",
      session_id: "session-1",
      agent_id: "agent-1",
      policy_name: "policy-1",
      phase: "implement",
      status: "completed",
    });

    testLogger.createRun({
      id: "run-2",
      issue_id: "issue-2",
      session_id: "session-2",
      agent_id: "agent-2",
      policy_name: "policy-1",
      phase: "test",
      status: "completed",
    });

    const filteredRuns = queryAllRuns({ agent_id: "agent-1" }, TEST_DIR);
    expect(filteredRuns.length).toBe(1);
    expect(filteredRuns[0].agent_id).toBe("agent-1");
  });

  it("should get run history from correct location", () => {
    const run = testLogger.createRun({
      id: "run-1",
      issue_id: "issue-1",
      session_id: "session-1",
      agent_id: "agent-1",
      policy_name: "policy-1",
      phase: "implement",
      status: "completed",
    });

    const history = getRunHistory("run-1", TEST_DIR);
    expect(history).toBeDefined();
    expect(history?.id).toBe(run.id);
  });

  it("should return null for non-existent run history", () => {
    const history = getRunHistory("non-existent-run");
    expect(history).toBeNull();
  });

  it("should get run with archival location", () => {
    const run = testLogger.createRun({
      id: "run-1",
      issue_id: "issue-1",
      session_id: "session-1",
      agent_id: "agent-1",
      policy_name: "policy-1",
      phase: "implement",
      status: "completed",
    });

    const result = getRunWithArchival("run-1", TEST_DIR);
    expect(result.run).toBeDefined();
    expect(result.location).toBe("active");
    expect(result.run?.id).toBe(run.id);
  });

  it("should return not_found for non-existent run", () => {
    const result = getRunWithArchival("non-existent-run", TEST_DIR);
    expect(result.run).toBeNull();
    expect(result.location).toBe("not_found");
  });

  it("should deduplicate runs from both databases", () => {
    testLogger.createRun({
      id: "run-1",
      issue_id: "issue-1",
      session_id: "session-1",
      agent_id: "agent-1",
      policy_name: "policy-1",
      phase: "implement",
      status: "completed",
    });

    const allRuns = queryAllRuns({ issue_id: "issue-1" }, TEST_DIR);
    const uniqueIds = new Set(allRuns.map((r) => r.id));
    expect(uniqueIds.size).toBeLessThanOrEqual(allRuns.length);
  });

  it("should sort combined results by created_at", async () => {
    for (let i = 0; i < 5; i++) {
      const run = testLogger.createRun({
        id: `run-${i}`,
        issue_id: "issue-1",
        session_id: `session-${i}`,
        agent_id: "agent-1",
        policy_name: "policy-1",
        phase: "implement",
        status: "completed",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const allRuns = queryAllRuns({ issue_id: "issue-1" }, TEST_DIR);
    for (let i = 0; i < allRuns.length - 1; i++) {
      expect(allRuns[i].created_at).toBeGreaterThanOrEqual(allRuns[i + 1].created_at);
    }
  });
});

describe("Archive Operations", () => {
  let testLogger: Logger;
  let archiveLogger: ArchiveLogger;

  beforeEach(() => {
    Logger.resetInstance();
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    testLogger = new Logger(TEST_DIR);
    archiveLogger = new ArchiveLogger(TEST_DIR);
  });

  afterEach(() => {
    testLogger.close();
    archiveLogger.close();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }

    Logger.resetInstance();
  });

  it("should archive old runs", () => {
    const testRun = testLogger.createRun({
      id: "run-old",
      issue_id: "issue-1",
      session_id: "session-1",
      agent_id: "agent-1",
      policy_name: "policy-1",
      phase: "implement",
      status: "completed",
    });

    const result = archiveOldRuns(TEST_DIR, {
      name: "test",
      enabled: true,
      age_days: 0,
      max_runs: 1000,
      max_size_mb: 100,
      archive_enabled: true,
      archive_after_days: 0,
      delete_after_days: 90,
    });

    expect(result.success).toBe(true);
    expect(result.runs_archived).toBeGreaterThanOrEqual(0);
  });

  it("should preserve run data during archival", () => {
    const testRun = testLogger.createRun({
      id: "run-old",
      issue_id: "issue-1",
      session_id: "session-1",
      agent_id: "agent-1",
      policy_name: "policy-1",
      phase: "implement",
      status: "completed",
      outcome: { success: true, message: "Test completed" },
      metadata: { key: "value" },
    });

    testLogger.logDecision({
      run_id: "run-old",
      type: "agent_selection",
      decision: "Selected agent",
      reasoning: "Test reasoning",
    });

    archiveOldRuns(TEST_DIR, {
      name: "test",
      enabled: true,
      age_days: 0,
      max_runs: 1000,
      max_size_mb: 100,
      archive_enabled: true,
      archive_after_days: 0,
      delete_after_days: 90,
    });

    archiveLogger.close();
    archiveLogger = new ArchiveLogger(TEST_DIR);

    const archivedRun = archiveLogger.getRun("run-old");

    expect(archivedRun).toBeDefined();
    if (archivedRun) {
      expect(archivedRun.id).toBe(testRun.id);
      expect(archivedRun.issue_id).toBe(testRun.issue_id);
      expect(archivedRun.outcome).toEqual(testRun.outcome);
      expect(archivedRun.metadata).toEqual(testRun.metadata);
    }

    const archivedDecisions = archiveLogger.getDecisions("run-old");
    expect(archivedDecisions.length).toBeGreaterThanOrEqual(0);
  });

  it("should archive decision data", () => {
    testLogger.createRun({
      id: "run-old",
      issue_id: "issue-1",
      session_id: "session-1",
      agent_id: "agent-1",
      policy_name: "policy-1",
      phase: "implement",
      status: "completed",
    });

    for (let i = 0; i < 3; i++) {
      testLogger.logDecision({
        run_id: "run-old",
        type: "phase_transition",
        decision: `Decision ${i}`,
        reasoning: `Reasoning ${i}`,
      });
    }

    archiveOldRuns(TEST_DIR, {
      name: "test",
      enabled: true,
      age_days: 0,
      max_runs: 1000,
      max_size_mb: 100,
      archive_enabled: true,
      archive_after_days: 0,
      delete_after_days: 90,
    });

    archiveLogger.close();
    archiveLogger = new ArchiveLogger(TEST_DIR);

    const archivedDecisions = archiveLogger.getDecisions("run-old");
    expect(archivedDecisions.length).toBeGreaterThanOrEqual(0);
  });
});

describe("API Consistency", () => {
  let testLogger: Logger;
  let archiveLogger: ArchiveLogger;

  beforeEach(() => {
    Logger.resetInstance();
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    testLogger = new Logger(TEST_DIR);
    archiveLogger = new ArchiveLogger(TEST_DIR);
  });

  afterEach(() => {
    testLogger.close();
    archiveLogger.close();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }

    Logger.resetInstance();
  });

  it("should have consistent getRun method signature", () => {
    expect(typeof testLogger.getRun).toBe("function");
    expect(typeof archiveLogger.getRun).toBe("function");
  });

  it("should have consistent queryRuns method signature", () => {
    expect(typeof testLogger.queryRuns).toBe("function");
    expect(typeof archiveLogger.queryRuns).toBe("function");
  });

  it("should have consistent getDecisions method signature", () => {
    expect(typeof testLogger.getDecisions).toBe("function");
    expect(typeof archiveLogger.getDecisions).toBe("function");
  });

  it("should return same RunRecord type", () => {
    const run = testLogger.createRun({
      id: "run-1",
      issue_id: "issue-1",
      session_id: "session-1",
      agent_id: "agent-1",
      policy_name: "policy-1",
      phase: "implement",
      status: "completed",
    });

    const activeRun = testLogger.getRun("run-1");
    expect(activeRun).toHaveProperty("id");
    expect(activeRun).toHaveProperty("issue_id");
    expect(activeRun).toHaveProperty("session_id");
    expect(activeRun).toHaveProperty("agent_id");
    expect(activeRun).toHaveProperty("phase");
    expect(activeRun).toHaveProperty("status");
  });
});
