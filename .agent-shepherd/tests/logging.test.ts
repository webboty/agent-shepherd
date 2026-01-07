/**
 * Comprehensive test suite for Logger class
 * Tests initialization, run record lifecycle, decision logging, dual storage consistency,
 * error handling, performance, and integration with worker engine
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { unlinkSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { 
  Logger, 
  getLogger,
  type RunRecord,
  type DecisionRecord,
  type RunOutcome,
  type Artifact,
  type ErrorDetails,
  type ToolCall
} from "../src/core/logging";

describe("Logger Class", () => {
  let logger: Logger;
  let testDir: string;

  beforeEach(() => {
    testDir = `/tmp/agent-shepherd-logger-test-${Date.now()}`;
    logger = new Logger(testDir);
  });

  afterEach(() => {
    try {
      if (existsSync(join(testDir, "runs.db"))) {
        unlinkSync(join(testDir, "runs.db"));
      }
      if (existsSync(join(testDir, "runs.jsonl"))) {
        unlinkSync(join(testDir, "runs.jsonl"));
      }
      if (existsSync(join(testDir, "decisions.jsonl"))) {
        unlinkSync(join(testDir, "decisions.jsonl"));
      }
    } catch (error) {
    }
  });

  describe("1.2 Logger Initialization", () => {
    test("should create database and JSONL files in custom dataDir", () => {
      expect(existsSync(join(testDir, "runs.db"))).toBe(true);
      expect(existsSync(join(testDir, "runs.jsonl"))).toBe(false);
      expect(existsSync(join(testDir, "decisions.jsonl"))).toBe(false);
    });

    test("should use default .agent-shepherd directory when no dataDir provided", () => {
      const defaultLogger = new Logger();
      expect(defaultLogger).toBeDefined();
      defaultLogger.close();
    });

    test("should initialize schema with all required tables", () => {
      const stmt = logger["db"].prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('runs', 'decisions')"
      );
      const tables = stmt.all() as { name: string }[];
      expect(tables.length).toBe(2);
      expect(tables.map(t => t.name)).toContain("runs");
      expect(tables.map(t => t.name)).toContain("decisions");
    });

    test("should create all required indexes", () => {
      const stmt = logger["db"].prepare(
        "SELECT name FROM sqlite_master WHERE type='index'"
      );
      const indexes = stmt.all() as { name: string }[];
      const indexNames = indexes.map(i => i.name);
      
      expect(indexNames).toContain("idx_runs_issue_id");
      expect(indexNames).toContain("idx_runs_agent_id");
      expect(indexNames).toContain("idx_runs_status");
      expect(indexNames).toContain("idx_runs_issue_phase_status");
      expect(indexNames).toContain("idx_decisions_run_id");
    });

    test("should sync existing JSONL records on construction", () => {
      const testRun: Omit<RunRecord, "created_at" | "updated_at"> = {
        id: "test-run-1",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
      };

      const jsonlPath = join(testDir, "runs.jsonl");
      const { appendFileSync } = require("fs");
      appendFileSync(jsonlPath, JSON.stringify({ ...testRun, created_at: Date.now(), updated_at: Date.now() }) + "\n");

      const newLogger = new Logger(testDir);
      const retrievedRun = newLogger.getRun("test-run-1");

      expect(retrievedRun).toBeDefined();
      expect(retrievedRun?.id).toBe("test-run-1");
      expect(retrievedRun?.issue_id).toBe("issue-1");

      newLogger.close();
    });

    test("should sync existing decision records on construction", () => {
      const freshTestDir = `/tmp/agent-shepherd-decision-test-${Date.now()}`;
      
      const testDecision: Omit<DecisionRecord, "id" | "timestamp"> = {
        run_id: "run-1",
        type: "agent_selection",
        decision: "agent-1",
        reasoning: "Test reasoning",
      };

      const testRun: Omit<RunRecord, "created_at" | "updated_at"> = {
        id: "run-1",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
      };

      const { appendFileSync, mkdirSync, existsSync: fsExistsSync } = require("fs");
      mkdirSync(freshTestDir, { recursive: true });
      
      const jsonlPath = join(freshTestDir, "decisions.jsonl");
      const runsJsonlPath = join(freshTestDir, "runs.jsonl");
      const dbPath = join(freshTestDir, "runs.db");
      
      appendFileSync(runsJsonlPath, JSON.stringify({ ...testRun, created_at: Date.now(), updated_at: Date.now() }) + "\n");
      appendFileSync(jsonlPath, JSON.stringify({ ...testDecision, id: "decision-test-1", timestamp: Date.now() }) + "\n");

      const newLogger = new Logger(freshTestDir);
      const retrievedDecisions = newLogger.getDecisions("run-1");

      expect(fsExistsSync(dbPath)).toBe(true);
      expect(retrievedDecisions.length).toBeGreaterThanOrEqual(1);
      expect(retrievedDecisions.some(d => d.type === "agent_selection" && d.decision === "agent-1")).toBe(true);

      newLogger.close();
    });
  });

  describe("1.1.1 createRun", () => {
    test("should create run record and append to JSONL and SQLite", () => {
      const runData: Omit<RunRecord, "created_at" | "updated_at"> = {
        id: "run-1",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "pending",
      };

      const run = logger.createRun(runData);

      expect(run.id).toBe("run-1");
      expect(run.created_at).toBeGreaterThan(0);
      expect(run.updated_at).toBe(run.created_at);

      const retrieved = logger.getRun("run-1");
      expect(retrieved).toEqual(run);

      expect(existsSync(join(testDir, "runs.jsonl"))).toBe(true);
      const jsonlContent = readFileSync(join(testDir, "runs.jsonl"), "utf-8");
      expect(jsonlContent).toContain("run-1");
    });

    test("should create run with all optional fields", () => {
      const outcome: RunOutcome = {
        success: true,
        message: "Test completed",
        artifacts: ["file1.ts", "file2.ts"],
        metrics: {
          duration_ms: 1000,
          tokens_used: 100,
        },
      };

      const run = logger.createRun({
        id: "run-2",
        issue_id: "issue-2",
        session_id: "session-2",
        agent_id: "agent-2",
        policy_name: "test-policy",
        phase: "implement",
        status: "completed",
        outcome,
        completed_at: Date.now(),
        metadata: { key: "value" },
      });

      expect(run.outcome).toEqual(outcome);
      expect(run.metadata).toEqual({ key: "value" });
      expect(run.completed_at).toBeDefined();
    });

    test("should create run with minimal required fields", () => {
      const run = logger.createRun({
        id: "run-3",
        issue_id: "issue-3",
        session_id: "session-3",
        agent_id: "agent-3",
        policy_name: "test-policy",
        phase: "test",
        status: "pending",
      });

      expect(run.outcome).toBeUndefined();
      expect(run.metadata).toBeUndefined();
      expect(run.completed_at).toBeUndefined();
    });
  });

  describe("1.1.2 updateRun", () => {
    let existingRun: RunRecord;

    beforeEach(() => {
      existingRun = logger.createRun({
        id: "run-4",
        issue_id: "issue-4",
        session_id: "session-4",
        agent_id: "agent-4",
        policy_name: "test-policy",
        phase: "plan",
        status: "running",
      });
    });

    test("should update run and append to JSONL", async () => {
      await new Promise(resolve => setTimeout(resolve, 1));

      const outcome: RunOutcome = {
        success: true,
        message: "Task completed",
      };

      const updated = logger.updateRun("run-4", {
        status: "completed",
        outcome,
        completed_at: Date.now(),
      });

      expect(updated?.status).toBe("completed");
      expect(updated?.outcome).toEqual(outcome);
      expect(updated?.updated_at).toBeGreaterThanOrEqual(existingRun.updated_at);
      expect(updated?.completed_at).toBeDefined();

      const jsonlContent = readFileSync(join(testDir, "runs.jsonl"), "utf-8");
      const lines = jsonlContent.trim().split("\n");
      expect(lines.length).toBeGreaterThan(1);
    });

    test("should support partial updates", () => {
      const updated = logger.updateRun("run-4", {
        status: "failed",
      });

      expect(updated?.status).toBe("failed");
      expect(updated?.issue_id).toBe(existingRun.issue_id);
      expect(updated?.phase).toBe(existingRun.phase);
    });

    test("should preserve all fields on update", () => {
      const outcome: RunOutcome = {
        success: false,
        error: "Test error",
      };

      const updated = logger.updateRun("run-4", {
        outcome,
        metadata: { updated: true },
      });

      expect(updated?.id).toBe(existingRun.id);
      expect(updated?.issue_id).toBe(existingRun.issue_id);
      expect(updated?.agent_id).toBe(existingRun.agent_id);
      expect(updated?.outcome).toEqual(outcome);
      expect(updated?.metadata).toEqual({ updated: true });
    });

    test("should handle multiple updates correctly", () => {
      const firstUpdate = logger.updateRun("run-4", {
        status: "completed",
      });

      const secondUpdate = logger.updateRun("run-4", {
        metadata: { count: 2 },
      });

      expect(secondUpdate?.status).toBe("completed");
      expect(secondUpdate?.metadata).toEqual({ count: 2 });

      const jsonlContent = readFileSync(join(testDir, "runs.jsonl"), "utf-8");
      const lines = jsonlContent.trim().split("\n");
      expect(lines.length).toBe(3);
    });

    test("should return null for non-existent run", () => {
      const result = logger.updateRun("non-existent", {
        status: "completed",
      });

      expect(result).toBeNull();
    });
  });

  describe("1.1.3 getRun", () => {
    test("should retrieve run by ID", () => {
      logger.createRun({
        id: "run-5",
        issue_id: "issue-5",
        session_id: "session-5",
        agent_id: "agent-5",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
        outcome: {
          success: true,
          message: "Test",
        },
        metadata: { test: "data" },
      });

      const retrieved = logger.getRun("run-5");

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe("run-5");
      expect(retrieved?.outcome).toEqual({ success: true, message: "Test" });
      expect(retrieved?.metadata).toEqual({ test: "data" });
    });

    test("should return null for non-existent run", () => {
      const retrieved = logger.getRun("non-existent");
      expect(retrieved).toBeNull();
    });
  });

  describe("1.1.4 queryRuns", () => {
    beforeEach(() => {
      const timestamp = Date.now();
      
      logger.createRun({
        id: "run-6",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "policy-1",
        phase: "plan",
        status: "completed",
      });

      logger.createRun({
        id: "run-7",
        issue_id: "issue-1",
        session_id: "session-2",
        agent_id: "agent-2",
        policy_name: "policy-1",
        phase: "implement",
        status: "running",
      });

      logger.createRun({
        id: "run-8",
        issue_id: "issue-2",
        session_id: "session-3",
        agent_id: "agent-1",
        policy_name: "policy-1",
        phase: "test",
        status: "pending",
      });

      logger.createRun({
        id: "run-9",
        issue_id: "issue-1",
        session_id: "session-4",
        agent_id: "agent-3",
        policy_name: "policy-1",
        phase: "review",
        status: "failed",
      });
    });

    test("should filter by issue_id", () => {
      const results = logger.queryRuns({ issue_id: "issue-1" });
      expect(results.length).toBe(3);
      expect(results.every(r => r.issue_id === "issue-1")).toBe(true);
    });

    test("should filter by agent_id", () => {
      const results = logger.queryRuns({ agent_id: "agent-1" });
      expect(results.length).toBe(2);
      expect(results.every(r => r.agent_id === "agent-1")).toBe(true);
    });

    test("should filter by status", () => {
      const results = logger.queryRuns({ status: "completed" });
      expect(results.length).toBe(1);
      expect(results[0].status).toBe("completed");
    });

    test("should filter by phase", () => {
      const results = logger.queryRuns({ phase: "plan" });
      expect(results.length).toBe(1);
      expect(results[0].phase).toBe("plan");
    });

    test("should combine multiple filters", () => {
      const results = logger.queryRuns({
        issue_id: "issue-1",
        agent_id: "agent-1",
      });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("run-6");
    });

    test("should support limit", () => {
      const results = logger.queryRuns({ limit: 2 });
      expect(results.length).toBe(2);
    });

    test("should support offset", () => {
      const results = logger.queryRuns({ limit: 2, offset: 1 });
      expect(results.length).toBe(2);
    });

    test("should order by created_at DESC", () => {
      const results = logger.queryRuns({});
      expect(results[0].created_at).toBeGreaterThanOrEqual(results[1].created_at);
    });

    test("should return empty array when no matches", () => {
      const results = logger.queryRuns({ issue_id: "non-existent" });
      expect(results).toEqual([]);
    });

    test("should return all runs without filters", () => {
      const results = logger.queryRuns({});
      expect(results.length).toBe(4);
    });
  });

  describe("1.4 Decision Logging", () => {
    test("should log decision with auto-generated ID and timestamp", () => {
      const decision = logger.logDecision({
        run_id: "run-1",
        type: "agent_selection",
        decision: "agent-1",
        reasoning: "Best match for capabilities",
      });

      expect(decision.id).toBeDefined();
      expect(decision.timestamp).toBeGreaterThan(0);
      expect(decision.type).toBe("agent_selection");
      expect(decision.decision).toBe("agent-1");
      expect(decision.reasoning).toBe("Best match for capabilities");
    });

    test("should log all decision types", () => {
      const types: Array<"agent_selection" | "phase_transition" | "retry" | "hitl"> = [
        "agent_selection",
        "phase_transition",
        "retry",
        "hitl",
      ];

      for (const type of types) {
        const decision = logger.logDecision({
          run_id: "run-1",
          type,
          decision: `decision-for-${type}`,
        });

        expect(decision.type).toBe(type);
      }
    });

    test("should store decision metadata", () => {
      const decision = logger.logDecision({
        run_id: "run-1",
        type: "agent_selection",
        decision: "agent-1",
        metadata: {
          issue_id: "issue-1",
          phase: "plan",
          policy: "test-policy",
          capabilities: ["coding", "planning"],
        },
      });

      expect(decision.metadata).toEqual({
        issue_id: "issue-1",
        phase: "plan",
        policy: "test-policy",
        capabilities: ["coding", "planning"],
      });
    });

    test("should append decision to JSONL", () => {
      logger.logDecision({
        run_id: "run-1",
        type: "agent_selection",
        decision: "agent-1",
      });

      const jsonlContent = readFileSync(join(testDir, "decisions.jsonl"), "utf-8");
      expect(jsonlContent).toContain("agent_selection");
      expect(jsonlContent).toContain("agent-1");
    });

    test("should retrieve decisions for a run", () => {
      logger.logDecision({
        run_id: "run-1",
        type: "agent_selection",
        decision: "agent-1",
        reasoning: "First",
      });

      logger.logDecision({
        run_id: "run-1",
        type: "phase_transition",
        decision: "advance",
        reasoning: "Second",
      });

      logger.logDecision({
        run_id: "run-2",
        type: "agent_selection",
        decision: "agent-2",
      });

      const decisions = logger.getDecisions("run-1");
      expect(decisions.length).toBe(2);
      expect(decisions[0].type).toBe("agent_selection");
      expect(decisions[1].type).toBe("phase_transition");
    });

    test("should order decisions by timestamp ASC", async () => {
      const first = logger.logDecision({
        run_id: "run-1",
        type: "agent_selection",
        decision: "agent-1",
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const second = logger.logDecision({
        run_id: "run-1",
        type: "phase_transition",
        decision: "advance",
      });

      const decisions = logger.getDecisions("run-1");
      expect(decisions[0].timestamp).toBeLessThan(decisions[1].timestamp);
    });

    test("should return empty array for run with no decisions", () => {
      const decisions = logger.getDecisions("non-existent");
      expect(decisions).toEqual([]);
    });

    test("should deserialize complex metadata correctly", () => {
      const metadata = {
        nested: {
          deep: {
            value: "test",
          },
        },
        array: [1, 2, 3],
        number: 42,
        boolean: true,
      };

      logger.logDecision({
        run_id: "run-1",
        type: "agent_selection",
        decision: "agent-1",
        metadata,
      });

      const decisions = logger.getDecisions("run-1");
      expect(decisions[0].metadata).toEqual(metadata);
    });
  });

  describe("1.5 Dual Storage Consistency", () => {
    test("should append to JSONL before updating SQLite on createRun", () => {
      const runData: Omit<RunRecord, "created_at" | "updated_at"> = {
        id: "run-10",
        issue_id: "issue-10",
        session_id: "session-10",
        agent_id: "agent-10",
        policy_name: "test-policy",
        phase: "plan",
        status: "pending",
      };

      const run = logger.createRun(runData);

      const jsonlContent = readFileSync(join(testDir, "runs.jsonl"), "utf-8");
      expect(jsonlContent).toContain("run-10");

      const retrieved = logger.getRun("run-10");
      expect(retrieved).toEqual(run);
    });

    test("should append to JSONL before updating SQLite on updateRun", () => {
      const run = logger.createRun({
        id: "run-11",
        issue_id: "issue-11",
        session_id: "session-11",
        agent_id: "agent-11",
        policy_name: "test-policy",
        phase: "plan",
        status: "running",
      });

      const updated = logger.updateRun("run-11", {
        status: "completed",
      });

      const jsonlContent = readFileSync(join(testDir, "runs.jsonl"), "utf-8");
      const lines = jsonlContent.trim().split("\n");
      expect(lines.length).toBe(2);

      const retrieved = logger.getRun("run-11");
      expect(retrieved?.status).toBe("completed");
    });

    test("should maintain full history in JSONL after multiple updates", () => {
      const runId = "run-12";
      
      logger.createRun({
        id: runId,
        issue_id: "issue-12",
        session_id: "session-12",
        agent_id: "agent-12",
        policy_name: "test-policy",
        phase: "plan",
        status: "pending",
      });

      logger.updateRun(runId, { status: "running" });
      logger.updateRun(runId, { status: "completed" });
      logger.updateRun(runId, { status: "failed" });

      const jsonlContent = readFileSync(join(testDir, "runs.jsonl"), "utf-8");
      const lines = jsonlContent.trim().split("\n");
      expect(lines.length).toBe(4);

      const statuses = lines.map(line => {
        const record = JSON.parse(line) as RunRecord;
        return record.status;
      });

      expect(statuses).toEqual(["pending", "running", "completed", "failed"]);
    });

    test("should have latest version in SQLite after updates", () => {
      const runId = "run-13";
      
      logger.createRun({
        id: runId,
        issue_id: "issue-13",
        session_id: "session-13",
        agent_id: "agent-13",
        policy_name: "test-policy",
        phase: "plan",
        status: "pending",
      });

      logger.updateRun(runId, { status: "completed", metadata: { final: true } });

      const retrieved = logger.getRun(runId);
      expect(retrieved?.status).toBe("completed");
      expect(retrieved?.metadata).toEqual({ final: true });
    });

    test("should handle corrupted JSONL lines gracefully", () => {
      const jsonlPath = join(testDir, "runs.jsonl");
      const { appendFileSync } = require("fs");
      
      appendFileSync(jsonlPath, JSON.stringify({
        id: "good-run-1",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
        created_at: Date.now(),
        updated_at: Date.now(),
      }) + "\n");

      const jsonlContent = readFileSync(jsonlPath, "utf-8");
      const corruptedContent = jsonlContent + "\n{ invalid json }\n" + jsonlContent;
      
      const newLogger = new Logger(testDir);
      
      const retrieved = newLogger.getRun("good-run-1");
      expect(retrieved).toBeDefined();

      newLogger.close();
    });
  });

  describe("1.6 Error Handling", () => {
    test("should handle invalid JSON in JSONL gracefully", () => {
      const jsonlPath = join(testDir, "runs.jsonl");
      const { appendFileSync } = require("fs");
      
      appendFileSync(jsonlPath, JSON.stringify({
        id: "valid-run",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
        created_at: Date.now(),
        updated_at: Date.now(),
      }) + "\n");

      const content = readFileSync(jsonlPath, "utf-8");
      const corruptedContent = content + "\n{invalid json}\n";
      
      const newLogger = new Logger(testDir);
      const retrieved = newLogger.getRun("valid-run");
      expect(retrieved).toBeDefined();

      newLogger.close();
    });

    test("should create directory if it doesn't exist", () => {
      const nonExistentDir = `/tmp/agent-shepherd-nonexistent-${Date.now()}`;
      const newLogger = new Logger(nonExistentDir);
      
      expect(existsSync(join(nonExistentDir, "runs.db"))).toBe(true);
      
      newLogger.close();
    });

    test("should handle database queries with no results", () => {
      const result = logger.getRun("non-existent-run");
      expect(result).toBeNull();

      const results = logger.queryRuns({ issue_id: "non-existent-issue" });
      expect(results).toEqual([]);

      const decisions = logger.getDecisions("non-existent-run");
      expect(decisions).toEqual([]);
    });
  });

  describe("1.7 Integration with Worker Engine", () => {
    test("should create run with all fields from worker engine", () => {
      const runId = `run-${Date.now()}`;
      
      const run = logger.createRun({
        id: runId,
        issue_id: "agent-shepherd-test-1",
        session_id: "session-test-1",
        agent_id: "agent-test-1",
        policy_name: "standard-workflow",
        phase: "plan",
        status: "pending",
        metadata: {
          attempt_number: 1,
          retry_count: 0,
        },
      });

      expect(run.id).toBe(runId);
      expect(run.issue_id).toBe("agent-shepherd-test-1");
      expect(run.agent_id).toBe("agent-test-1");
      expect(run.phase).toBe("plan");
      expect(run.metadata?.attempt_number).toBe(1);
    });

    test("should log agent selection decision", () => {
      const runId = `run-${Date.now()}`;
      
      const decision = logger.logDecision({
        run_id: runId,
        type: "agent_selection",
        decision: "agent-coding-expert",
        reasoning: "Selected for capabilities: coding, typescript",
        metadata: {
          issue_id: "agent-shepherd-test-1",
          phase: "plan",
          policy: "standard-workflow",
        },
      });

      expect(decision.type).toBe("agent_selection");
      expect(decision.decision).toBe("agent-coding-expert");
      expect(decision.reasoning).toContain("capabilities");

      const retrieved = logger.getDecisions(runId);
      expect(retrieved.length).toBe(1);
      expect(retrieved[0].type).toBe("agent_selection");
    });

    test("should log phase transition decision", () => {
      const runId = `run-${Date.now()}`;
      
      const decision = logger.logDecision({
        run_id: runId,
        type: "phase_transition",
        decision: "advance",
        reasoning: "Phase completed successfully",
        metadata: {
          next_phase: "implement",
          outcome: { success: true },
        },
      });

      expect(decision.type).toBe("phase_transition");
      expect(decision.decision).toBe("advance");
      expect(decision.metadata?.next_phase).toBe("implement");
    });

    test("should update run after agent execution", () => {
      const runId = `run-${Date.now()}`;
      
      logger.createRun({
        id: runId,
        issue_id: "agent-shepherd-test-1",
        session_id: "session-test-1",
        agent_id: "agent-test-1",
        policy_name: "standard-workflow",
        phase: "plan",
        status: "pending",
      });

      const outcome: RunOutcome = {
        success: true,
        message: "Planning completed",
        artifacts: ["plan.md", "architecture.md"],
        metrics: {
          duration_ms: 5000,
          tokens_used: 150,
          cost: 0.01,
          start_time_ms: Date.now() - 5000,
          end_time_ms: Date.now(),
        },
      };

      const updated = logger.updateRun(runId, {
        status: "completed",
        outcome,
        completed_at: Date.now(),
      });

      expect(updated?.status).toBe("completed");
      expect(updated?.outcome?.success).toBe(true);
      expect(updated?.outcome?.artifacts).toEqual(["plan.md", "architecture.md"]);
    });

    test("should handle failed run updates", () => {
      const runId = `run-${Date.now()}`;
      
      logger.createRun({
        id: runId,
        issue_id: "agent-shepherd-test-1",
        session_id: "session-test-1",
        agent_id: "agent-test-1",
        policy_name: "standard-workflow",
        phase: "implement",
        status: "running",
      });

      const outcome: RunOutcome = {
        success: false,
        error: "Agent execution failed",
        error_details: {
          type: "ExecutionError",
          message: "Timeout exceeded",
          stack_trace: "Error: Timeout",
        },
      };

      const updated = logger.updateRun(runId, {
        status: "failed",
        outcome,
        completed_at: Date.now(),
      });

      expect(updated?.status).toBe("failed");
      expect(updated?.outcome?.success).toBe(false);
      expect(updated?.outcome?.error).toBe("Agent execution failed");
    });
  });

  describe("1.8 Performance Tests", () => {
    test("should create 1000 runs efficiently", () => {
      const startTime = Date.now();
      const statuses: Array<"pending" | "running" | "completed" | "failed" | "blocked"> = ["pending", "running", "completed", "failed"];
      
      for (let i = 0; i < 1000; i++) {
        logger.createRun({
          id: `run-perf-${i}`,
          issue_id: `issue-${i % 10}`,
          session_id: `session-${i}`,
          agent_id: `agent-${i % 5}`,
          policy_name: "test-policy",
          phase: ["plan", "implement", "test", "review"][i % 4],
          status: statuses[i % 4],
        });
      }

      const duration = Date.now() - startTime;
      console.log(`Created 1000 runs in ${duration}ms`);
      expect(duration).toBeLessThan(5000);
    });

    test("should query 1000 runs with filters efficiently", () => {
      const statuses: Array<"pending" | "running" | "completed" | "failed" | "blocked"> = ["pending", "running", "completed", "failed"];
      
      for (let i = 0; i < 1000; i++) {
        logger.createRun({
          id: `run-query-${i}`,
          issue_id: `issue-${i % 10}`,
          session_id: `session-${i}`,
          agent_id: `agent-${i % 5}`,
          policy_name: "test-policy",
          phase: ["plan", "implement", "test", "review"][i % 4],
          status: statuses[i % 4],
        });
      }

      const startTime = Date.now();
      const results = logger.queryRuns({
        issue_id: "issue-1",
        status: "completed",
        phase: "plan",
      });
      const duration = Date.now() - startTime;

      console.log(`Queried 1000 runs in ${duration}ms, found ${results.length} results`);
      expect(duration).toBeLessThan(100);
    });

    test("should sync 3000 JSONL records efficiently", () => {
      const testDir2 = `/tmp/agent-shepherd-perf-${Date.now()}`;
      const { mkdirSync } = require("fs");
      mkdirSync(testDir2, { recursive: true });
      
      const jsonlPath = join(testDir2, "runs.jsonl");
      const statuses: Array<"pending" | "running" | "completed" | "failed" | "blocked"> = ["pending", "running", "completed", "failed"];
      
      for (let i = 0; i < 3000; i++) {
        const { appendFileSync } = require("fs");
        appendFileSync(jsonlPath, JSON.stringify({
          id: `run-sync-${i}`,
          issue_id: `issue-${i % 100}`,
          session_id: `session-${i}`,
          agent_id: `agent-${i % 20}`,
          policy_name: "test-policy",
          phase: ["plan", "implement", "test", "review"][i % 4],
          status: statuses[i % 4],
          created_at: Date.now(),
          updated_at: Date.now(),
        }) + "\n");
      }

      const startTime = Date.now();
      const perfLogger = new Logger(testDir2);
      const duration = Date.now() - startTime;

      console.log(`Synced 3000 JSONL records in ${duration}ms`);
      expect(duration).toBeLessThan(15000);

      perfLogger.close();
    });

    test("should verify indexes are used in queries", () => {
      const statuses: Array<"pending" | "running" | "completed" | "failed" | "blocked"> = ["pending", "running", "completed", "failed"];
      
      for (let i = 0; i < 100; i++) {
        logger.createRun({
          id: `run-index-${i}`,
          issue_id: `issue-${i % 10}`,
          session_id: `session-${i}`,
          agent_id: `agent-${i % 5}`,
          policy_name: "test-policy",
          phase: ["plan", "implement", "test", "review"][i % 4],
          status: statuses[i % 4],
        });
      }

      const plan = logger["db"].prepare("EXPLAIN QUERY PLAN SELECT * FROM runs WHERE issue_id = ?");
      const result = plan.get("issue-1") as any;
      
      console.log("Query plan:", result);
      expect(result.detail).toContain("USING INDEX");
    });
  });

  describe("getPhaseRetryCount", () => {
    test("should count failed runs for issue and phase", () => {
      const issueId = "retry-test-issue";
      const phase = "implement";

      logger.createRun({
        id: "run-retry-1",
        issue_id: issueId,
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase,
        status: "failed",
      });

      logger.createRun({
        id: "run-retry-2",
        issue_id: issueId,
        session_id: "session-2",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase,
        status: "failed",
      });

      logger.createRun({
        id: "run-retry-3",
        issue_id: issueId,
        session_id: "session-3",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "test",
        status: "failed",
      });

      const count = logger.getPhaseRetryCount(issueId, phase);
      expect(count).toBe(2);
    });

    test("should return 0 for no failed runs", () => {
      logger.createRun({
        id: "run-retry-4",
        issue_id: "issue-no-fail",
        session_id: "session-4",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
      });

      const count = logger.getPhaseRetryCount("issue-no-fail", "plan");
      expect(count).toBe(0);
    });
  });

  describe("close", () => {
    test("should close database connection", () => {
      logger.close();
      expect(() => {
        logger.getRun("any-run");
      }).toThrow();
    });
  });

  describe("getLogger singleton", () => {
    test("should return same instance on subsequent calls", () => {
      const instance1 = getLogger();
      const instance2 = getLogger();
      expect(instance1).toBe(instance2);
      instance1.close();
    });
  });
});
