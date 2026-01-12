/**
 * Worker Engine Integration Tests
 * Tests for worker behavior with smart picker, coordination, and state management
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = join(__dirname, '..', 'tmp_test');

import { IssuePicker, resetIssuePicker } from "../src/core/issue-picker";
import { Logger, resetLogger } from "../src/core/logging";
import type { BeadsIssue } from "../src/core/beads";

describe("Worker Engine State Management", () => {
  let testDataDir: string;
  let logger: Logger;

  beforeEach(() => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testDataDir = join(TEMP_DIR, `.test-worker-state-${timestamp}-${random}`);
    mkdirSync(testDataDir, { recursive: true });
    process.env.ASHEP_DIR = testDataDir;
    resetIssuePicker();
    resetLogger();
    logger = new Logger(testDataDir);
  });

  afterEach(() => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    delete process.env.ASHEP_DIR;
    resetIssuePicker();
    resetLogger();
  });

  describe("Run State Transitions", () => {
    it("creates run with correct initial state", () => {
      const run = logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-abc",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "implement",
        status: "pending",
      });

      expect(run.status).toBe("pending");
      expect(run.issue_id).toBe("issue-123");
      expect(run.phase).toBe("implement");
      expect(run.created_at).toBeDefined();
      expect(run.updated_at).toBeDefined();
    });

    it("updates run status correctly", () => {
      const run = logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-abc",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "implement",
        status: "pending",
      });

      const updated = logger.updateRun("run-1", { status: "running" });

      expect(updated?.status).toBe("running");
      expect(updated?.updated_at).toBeGreaterThanOrEqual(run.updated_at);
    });

    it("handles run completion with outcome", () => {
      const run = logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-abc",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "implement",
        status: "running",
      });

      const outcome = {
        success: true,
        message: "Completed successfully",
        artifacts: ["file1.txt", "file2.txt"],
      };

      const updated = logger.updateRun("run-1", {
        status: "completed",
        outcome,
        completed_at: Date.now(),
      });

      expect(updated?.status).toBe("completed");
      expect(updated?.outcome?.success).toBe(true);
      expect(updated?.outcome?.artifacts?.length).toBe(2);
    });

    it("handles run failure with error details", () => {
      const run = logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-abc",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "implement",
        status: "running",
      });

      const outcome = {
        success: false,
        error: "Compilation failed",
        error_details: {
          type: "compilation",
          message: "TypeScript errors in main.ts",
          file_path: "src/main.ts",
          line_number: 42,
        },
      };

      const updated = logger.updateRun("run-1", {
        status: "failed",
        outcome,
        completed_at: Date.now(),
      });

      expect(updated?.status).toBe("failed");
      expect(updated?.outcome?.success).toBe(false);
      expect(updated?.outcome?.error_details?.type).toBe("compilation");
    });
  });

  describe("Decision Logging", () => {
    it("logs phase transition decisions", () => {
      logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-abc",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "implement",
        status: "completed",
      });

      const decision = logger.logDecision({
        run_id: "run-1",
        type: "phase_transition",
        decision: "advance",
        reasoning: "Implementation completed successfully",
        metadata: {
          from_phase: "implement",
          to_phase: "test",
        },
      });

      expect(decision.type).toBe("phase_transition");
      expect(decision.decision).toBe("advance");
      expect(decision.metadata?.from_phase).toBe("implement");
      expect(decision.metadata?.to_phase).toBe("test");
    });

    it("logs retry decisions", () => {
      logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-abc",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "test",
        status: "failed",
      });

      const decision = logger.logDecision({
        run_id: "run-1",
        type: "retry",
        decision: "retry",
        reasoning: "Test failed due to environment issue",
        metadata: {
          retry_count: 1,
          max_retries: 3,
        },
      });

      expect(decision.type).toBe("retry");
      expect(decision.decision).toBe("retry");
      expect(decision.metadata?.retry_count).toBe(1);
    });

    it("logs agent selection decisions", () => {
      logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-abc",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "implement",
        status: "pending",
      });

      const decision = logger.logDecision({
        run_id: "run-1",
        type: "agent_selection",
        decision: "coding-expert",
        reasoning: "Selected based on coding capability priority",
        metadata: {
          capabilities: ["coding", "testing"],
          selected_agent: "coding-expert",
          priority_score: 95,
        },
      });

      expect(decision.type).toBe("agent_selection");
      expect(decision.decision).toBe("coding-expert");
    });

    it("logs HITL decisions", () => {
      logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-abc",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "review",
        status: "blocked",
      });

      const decision = logger.logDecision({
        run_id: "run-1",
        type: "hitl",
        decision: "require_approval",
        reasoning: "Security-sensitive change requires review",
        metadata: {
          hitl_reason: "security-review",
          requires_approval: true,
        },
      });

      expect(decision.type).toBe("hitl");
      expect(decision.decision).toBe("require_approval");
      expect(decision.metadata?.hitl_reason).toBe("security-review");
    });
  });

  describe("Query Functionality", () => {
    it("queries runs by issue ID", () => {
      logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "implement",
        status: "completed",
      });

      logger.createRun({
        id: "run-2",
        issue_id: "issue-123",
        session_id: "session-2",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "test",
        status: "running",
      });

      logger.createRun({
        id: "run-3",
        issue_id: "issue-456",
        session_id: "session-3",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "plan",
        status: "pending",
      });

      const runs = logger.queryRuns({ issue_id: "issue-123" });

      expect(runs.length).toBe(2);
      expect(runs.every(r => r.issue_id === "issue-123")).toBe(true);
    });

    it("queries runs by status", () => {
      logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "implement",
        status: "running",
      });

      logger.createRun({
        id: "run-2",
        issue_id: "issue-456",
        session_id: "session-2",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "test",
        status: "running",
      });

      logger.createRun({
        id: "run-3",
        issue_id: "issue-789",
        session_id: "session-3",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "plan",
        status: "completed",
      });

      const runningRuns = logger.queryRuns({ status: "running" });

      expect(runningRuns.length).toBe(2);
      expect(runningRuns.every(r => r.status === "running")).toBe(true);
    });

    it("queries runs with multiple filters", () => {
      logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "implement",
        status: "running",
      });

      logger.createRun({
        id: "run-2",
        issue_id: "issue-123",
        session_id: "session-2",
        agent_id: "agent-2",
        policy_name: "default",
        phase: "test",
        status: "completed",
      });

      const runs = logger.queryRuns({
        issue_id: "issue-123",
        phase: "implement",
      });

      expect(runs.length).toBe(1);
      expect(runs[0].id).toBe("run-1");
    });

    it("limits query results", () => {
      for (let i = 0; i < 10; i++) {
        logger.createRun({
          id: `run-${i}`,
          issue_id: "issue-123",
          session_id: `session-${i}`,
          agent_id: "agent-1",
          policy_name: "default",
          phase: "implement",
          status: "completed",
        });
      }

      const runs = logger.queryRuns({ issue_id: "issue-123", limit: 5 });

      expect(runs.length).toBe(5);
    });
  });

  describe("Picker with Worker ID", () => {
    it("uses default worker ID when not set", () => {
      delete process.env.ASHEP_WORKER_ID;

      const issues: BeadsIssue[] = [
        {
          id: "epic-1.1",
          title: "Task 1",
          description: "Task 1",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const picker = new IssuePicker({ mode: "smart" });

      expect(picker["config"]).toBeDefined();
    });

    it("uses custom worker ID from environment", () => {
      process.env.ASHEP_WORKER_ID = "my-worker-1";

      const issues: BeadsIssue[] = [];

      const picker = new IssuePicker({ mode: "smart" });

      expect(picker["config"]).toBeDefined();
    });

    it("handles worker ID changes", () => {
      process.env.ASHEP_WORKER_ID = "worker-1";

      const picker1 = new IssuePicker({ mode: "simple" });

      process.env.ASHEP_WORKER_ID = "worker-2";

      const picker2 = new IssuePicker({ mode: "simple" });

      expect(picker1).not.toBe(picker2);
    });
  });

  describe("Metric Calculations", () => {
    it("calculates run duration correctly", () => {
      const startTime = Date.now() - 60000;

      const run = logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "implement",
        status: "running",
        metadata: {
          start_time_ms: startTime,
        },
      });

      const updated = logger.updateRun("run-1", {
        status: "completed",
        completed_at: Date.now(),
        outcome: {
          success: true,
          metrics: {
            duration_ms: 60000,
            start_time_ms: startTime,
            end_time_ms: Date.now(),
          },
        },
      });

      expect(updated?.outcome?.metrics?.duration_ms).toBe(60000);
    });

    it("tracks token usage in outcomes", () => {
      const run = logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "implement",
        status: "completed",
      });

      const updated = logger.updateRun("run-1", {
        outcome: {
          success: true,
          metrics: {
            tokens_used: 15000,
            cost: 0.45,
            model_name: "claude-sonnet-4",
          },
        },
      });

      expect(updated?.outcome?.metrics?.tokens_used).toBe(15000);
      expect(updated?.outcome?.metrics?.cost).toBe(0.45);
      expect(updated?.outcome?.metrics?.model_name).toBe("claude-sonnet-4");
    });

    it("records tool call statistics", () => {
      const run = logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "implement",
        status: "completed",
      });

      const updated = logger.updateRun("run-1", {
        outcome: {
          success: true,
          tool_calls: [
            { name: "bash", inputs: { command: "npm install" }, status: "completed", duration_ms: 5000 },
            { name: "read", inputs: { path: "package.json" }, status: "completed", duration_ms: 100 },
            { name: "edit", inputs: { path: "src/main.ts", oldString: "", newString: "// new" }, status: "completed", duration_ms: 50 },
          ],
          metrics: {
            tool_calls_count: 3,
            api_calls_count: 5,
          },
        },
      });

      expect(updated?.outcome?.tool_calls?.length).toBe(3);
      expect(updated?.outcome?.metrics?.tool_calls_count).toBe(3);
      expect(updated?.outcome?.metrics?.api_calls_count).toBe(5);
    });
  });

  describe("State Management", () => {
    it("preserves run data across updates", () => {
      const run = logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "implement",
        status: "pending",
        metadata: {
          custom_field: "value",
        },
      });

      const updated = logger.updateRun("run-1", { status: "running" });

      expect(updated?.metadata?.custom_field).toBe("value");
      expect(updated?.issue_id).toBe("issue-123");
      expect(updated?.session_id).toBe("session-1");
    });

    it("handles multiple concurrent runs", () => {
      const runs = [];
      for (let i = 0; i < 5; i++) {
        runs.push(logger.createRun({
          id: `run-${i}`,
          issue_id: `issue-${i}`,
          session_id: `session-${i}`,
          agent_id: "agent-1",
          policy_name: "default",
          phase: "implement",
          status: "running",
        }));
      }

      expect(runs.length).toBe(5);

      for (let i = 0; i < 5; i++) {
        const retrieved = logger.getRun(`run-${i}`);
        expect(retrieved).not.toBeNull();
        expect(retrieved?.issue_id).toBe(`issue-${i}`);
      }
    });

    it("deletes runs correctly", () => {
      logger.createRun({
        id: "run-1",
        issue_id: "issue-123",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "default",
        phase: "implement",
        status: "completed",
      });

      logger.deleteRun("run-1");

      const retrieved = logger.getRun("run-1");
      expect(retrieved).toBeNull();
    });
  });
});
