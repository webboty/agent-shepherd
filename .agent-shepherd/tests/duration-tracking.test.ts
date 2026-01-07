/**
 * Duration Tracking Test Suite
 * Tests duration metrics storage, calculation, and querying
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { unlinkSync, existsSync } from "fs";
import { join } from "path";
import { 
  Logger, 
  type RunRecord,
  type RunOutcome,
} from "../src/core/logging";

describe("Duration Tracking", () => {
  let logger: Logger;
  let testDir: string;

  beforeEach(() => {
    testDir = `/tmp/agent-shepherd-duration-test-${Date.now()}`;
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

  describe("1.4.1 Timestamp Tracking in Worker Engine", () => {
    test("should store start_time_ms in outcome metrics", () => {
      const startTime = Date.now();
      const endTime = startTime + 5000;

      const outcome: RunOutcome = {
        success: true,
        message: "Test completed",
        metrics: {
          duration_ms: endTime - startTime,
          start_time_ms: startTime,
          end_time_ms: endTime,
        },
      };

      logger.createRun({
        id: "run-1",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
        outcome,
        completed_at: endTime,
      });

      const retrieved = logger.getRun("run-1");
      expect(retrieved?.outcome?.metrics?.start_time_ms).toBe(startTime);
    });

    test("should store end_time_ms in outcome metrics", () => {
      const startTime = Date.now();
      const endTime = startTime + 5000;

      const outcome: RunOutcome = {
        success: true,
        message: "Test completed",
        metrics: {
          duration_ms: endTime - startTime,
          start_time_ms: startTime,
          end_time_ms: endTime,
        },
      };

      logger.createRun({
        id: "run-2",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
        outcome,
        completed_at: endTime,
      });

      const retrieved = logger.getRun("run-2");
      expect(retrieved?.outcome?.metrics?.end_time_ms).toBe(endTime);
    });

    test("should calculate duration_ms from start and end times", () => {
      const startTime = Date.now();
      const endTime = startTime + 5000;
      const calculatedDuration = endTime - startTime;

      const outcome: RunOutcome = {
        success: true,
        message: "Test completed",
        metrics: {
          duration_ms: calculatedDuration,
          start_time_ms: startTime,
          end_time_ms: endTime,
        },
      };

      logger.createRun({
        id: "run-3",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
        outcome,
        completed_at: endTime,
      });

      const retrieved = logger.getRun("run-3");
      expect(retrieved?.outcome?.metrics?.duration_ms).toBe(calculatedDuration);
      expect(retrieved?.outcome?.metrics?.end_time_ms! - retrieved?.outcome?.metrics?.start_time_ms!).toBe(calculatedDuration);
    });

    test("should handle runs without duration metrics", () => {
      logger.createRun({
        id: "run-4",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "pending",
      });

      const retrieved = logger.getRun("run-4");
      expect(retrieved?.outcome?.metrics?.duration_ms).toBeUndefined();
    });

    test("should persist duration metrics across updates", () => {
      const startTime = Date.now();
      const endTime = startTime + 5000;

      logger.createRun({
        id: "run-5",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "running",
      });

      const outcome: RunOutcome = {
        success: true,
        message: "Test completed",
        metrics: {
          duration_ms: endTime - startTime,
          start_time_ms: startTime,
          end_time_ms: endTime,
        },
      };

      logger.updateRun("run-5", {
        status: "completed",
        outcome,
        completed_at: endTime,
      });

      const retrieved = logger.getRun("run-5");
      expect(retrieved?.outcome?.metrics?.duration_ms).toBe(endTime - startTime);
      expect(retrieved?.outcome?.metrics?.start_time_ms).toBe(startTime);
      expect(retrieved?.outcome?.metrics?.end_time_ms).toBe(endTime);
    });
  });

  describe("1.4.2 Store Duration in RunOutcome", () => {
    test("should store duration_ms in completed run outcome", () => {
      const duration = 10000;

      const outcome: RunOutcome = {
        success: true,
        message: "Task completed",
        metrics: {
          duration_ms: duration,
        },
      };

      logger.createRun({
        id: "run-6",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "implement",
        status: "completed",
        outcome,
        completed_at: Date.now(),
      });

      const retrieved = logger.getRun("run-6");
      expect(retrieved?.outcome?.metrics?.duration_ms).toBe(duration);
    });

    test("should store duration in failed run outcome", () => {
      const duration = 15000;

      const outcome: RunOutcome = {
        success: false,
        error: "Task failed",
        metrics: {
          duration_ms: duration,
        },
      };

      logger.createRun({
        id: "run-7",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "test",
        status: "failed",
        outcome,
        completed_at: Date.now(),
      });

      const retrieved = logger.getRun("run-7");
      expect(retrieved?.outcome?.metrics?.duration_ms).toBe(duration);
    });

    test("should store duration alongside other metrics", () => {
      const outcome: RunOutcome = {
        success: true,
        message: "Task completed",
        metrics: {
          duration_ms: 20000,
          tokens_used: 1000,
          cost: 0.05,
          api_calls_count: 5,
        },
      };

      logger.createRun({
        id: "run-8",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "review",
        status: "completed",
        outcome,
        completed_at: Date.now(),
      });

      const retrieved = logger.getRun("run-8");
      expect(retrieved?.outcome?.metrics?.duration_ms).toBe(20000);
      expect(retrieved?.outcome?.metrics?.tokens_used).toBe(1000);
      expect(retrieved?.outcome?.metrics?.cost).toBe(0.05);
      expect(retrieved?.outcome?.metrics?.api_calls_count).toBe(5);
    });

    test("should serialize and deserialize duration from JSONL", () => {
      const outcome: RunOutcome = {
        success: true,
        message: "Test",
        metrics: {
          duration_ms: 30000,
          start_time_ms: Date.now() - 30000,
          end_time_ms: Date.now(),
        },
      };

      logger.createRun({
        id: "run-9",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
        outcome,
        completed_at: Date.now(),
      });

      const newLogger = new Logger(testDir);
      const retrieved = newLogger.getRun("run-9");

      expect(retrieved?.outcome?.metrics?.duration_ms).toBe(30000);
      newLogger.close();
    });
  });

  describe("1.4.3 Phase Duration Tracking", () => {
    test("should track duration per phase for an issue", () => {
      const planDuration = 5000;
      const implementDuration = 15000;
      const testDuration = 10000;

      logger.createRun({
        id: "run-plan",
        issue_id: "issue-phase-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
        outcome: { success: true, metrics: { duration_ms: planDuration } },
        completed_at: Date.now(),
      });

      logger.createRun({
        id: "run-implement",
        issue_id: "issue-phase-1",
        session_id: "session-2",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "implement",
        status: "completed",
        outcome: { success: true, metrics: { duration_ms: implementDuration } },
        completed_at: Date.now(),
      });

      logger.createRun({
        id: "run-test",
        issue_id: "issue-phase-1",
        session_id: "session-3",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "test",
        status: "completed",
        outcome: { success: true, metrics: { duration_ms: testDuration } },
        completed_at: Date.now(),
      });

      const planTotal = logger.getPhaseTotalDuration("issue-phase-1", "plan");
      const implementTotal = logger.getPhaseTotalDuration("issue-phase-1", "implement");
      const testTotal = logger.getPhaseTotalDuration("issue-phase-1", "test");

      expect(planTotal).toBe(planDuration);
      expect(implementTotal).toBe(implementDuration);
      expect(testTotal).toBe(testDuration);
    });

    test("should track cumulative duration across multiple runs of same phase", () => {
      const issueId = "issue-multiple-1";
      const phase = "implement";
      const durations = [10000, 15000, 20000];

      for (let i = 0; i < durations.length; i++) {
        logger.createRun({
          id: `run-${i}`,
          issue_id: issueId,
          session_id: `session-${i}`,
          agent_id: "agent-1",
          policy_name: "test-policy",
          phase,
          status: i === 0 ? "completed" : "failed",
          outcome: { 
            success: i === 0, 
            metrics: { duration_ms: durations[i] },
          },
          completed_at: Date.now(),
        });
      }

      const totalDuration = logger.getPhaseTotalDuration(issueId, phase);
      const expectedTotal = durations.reduce((a, b) => a + b, 0);

      expect(totalDuration).toBe(expectedTotal);
    });

    test("should calculate average duration per phase", () => {
      const issueId = "issue-average-1";
      const phase = "plan";
      const durations = [5000, 10000, 15000];

      for (let i = 0; i < durations.length; i++) {
        logger.createRun({
          id: `run-avg-${i}`,
          issue_id: issueId,
          session_id: `session-${i}`,
          agent_id: "agent-1",
          policy_name: "test-policy",
          phase,
          status: "completed",
          outcome: { success: true, metrics: { duration_ms: durations[i] } },
          completed_at: Date.now(),
        });
      }

      const avgDuration = logger.getPhaseAverageDuration(issueId, phase);
      const expectedAvg = durations.reduce((a, b) => a + b, 0) / durations.length;

      expect(avgDuration).toBe(expectedAvg);
    });

    test("should store phase_total_duration_ms metadata", () => {
      const issueId = "issue-cumulative-1";
      const phase = "plan";
      const durations = [5000, 10000];

      const firstRun = logger.createRun({
        id: "run-cumulative-1",
        issue_id: issueId,
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase,
        status: "completed",
        outcome: { success: true, metrics: { duration_ms: durations[0] } },
        completed_at: Date.now(),
        metadata: {
          phase_total_duration_ms: 0,
        },
      });

      expect((firstRun.metadata as any).phase_total_duration_ms).toBe(0);

      const secondRun = logger.createRun({
        id: "run-cumulative-2",
        issue_id: issueId,
        session_id: "session-2",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase,
        status: "completed",
        outcome: { success: true, metrics: { duration_ms: durations[1] } },
        completed_at: Date.now(),
        metadata: {
          phase_total_duration_ms: 5000,
        },
      });

      expect((secondRun.metadata as any).phase_total_duration_ms).toBe(5000);
    });

    test("should handle phases with no runs", () => {
      const total = logger.getPhaseTotalDuration("nonexistent-issue", "plan");
      const avg = logger.getPhaseAverageDuration("nonexistent-issue", "plan");

      expect(total).toBe(0);
      expect(avg).toBe(0);
    });
  });

  describe("1.4.4 Timeout Detection", () => {
    test("should detect when run exceeds timeout threshold", () => {
      const timeout = 10000;
      const actualDuration = 15000;

      const outcome: RunOutcome = {
        success: true,
        message: "Task completed",
        metrics: {
          duration_ms: actualDuration,
        },
      };

      logger.createRun({
        id: "run-timeout-1",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
        outcome,
        completed_at: Date.now(),
      });

      const retrieved = logger.getRun("run-timeout-1");
      const isTimedOut = (retrieved?.outcome?.metrics?.duration_ms || 0) > timeout;

      expect(isTimedOut).toBe(true);
      expect(retrieved?.outcome?.metrics?.duration_ms).toBeGreaterThan(timeout);
    });

    test("should detect when run is within timeout threshold", () => {
      const timeout = 10000;
      const actualDuration = 5000;

      const outcome: RunOutcome = {
        success: true,
        message: "Task completed",
        metrics: {
          duration_ms: actualDuration,
        },
      };

      logger.createRun({
        id: "run-timeout-2",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
        outcome,
        completed_at: Date.now(),
      });

      const retrieved = logger.getRun("run-timeout-2");
      const isTimedOut = (retrieved?.outcome?.metrics?.duration_ms || 0) > timeout;

      expect(isTimedOut).toBe(false);
      expect(retrieved?.outcome?.metrics?.duration_ms).toBeLessThan(timeout);
    });

    test("should store timeout reason in outcome", () => {
      const timeoutReason = "Execution exceeded timeout of 10000ms (actual: 15000ms)";

      const outcome: RunOutcome = {
        success: false,
        error: timeoutReason,
        metrics: {
          duration_ms: 15000,
        },
      };

      logger.createRun({
        id: "run-timeout-3",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "failed",
        outcome,
        completed_at: Date.now(),
      });

      const retrieved = logger.getRun("run-timeout-3");
      expect(retrieved?.outcome?.error).toContain("exceeded timeout");
    });

    test("should log timeout decision with correct type", () => {
      const runId = "run-timeout-decision";
      
      logger.createRun({
        id: runId,
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "pending",
      });

      const timeoutReason = "Execution exceeded timeout of 10000ms (actual: 15000ms)";
      
      logger.logDecision({
        run_id: runId,
        type: "timeout",
        decision: "timeout_exceeded",
        reasoning: timeoutReason,
        metadata: {
          timeout_threshold_ms: 10000,
          actual_duration_ms: 15000,
          phase: "plan",
        },
      });

      const decisions = logger.getDecisions(runId);
      expect(decisions.length).toBe(1);
      expect(decisions[0].type).toBe("timeout");
      expect(decisions[0].decision).toBe("timeout_exceeded");
      expect(decisions[0].reasoning).toContain("exceeded timeout");
      expect((decisions[0].metadata as any).timeout_threshold_ms).toBe(10000);
      expect((decisions[0].metadata as any).actual_duration_ms).toBe(15000);
    });
  });

  describe("1.4.5 Duration Queries to Logger", () => {
    beforeEach(() => {
      const durations = [5000, 10000, 15000, 20000, 25000];

      for (let i = 0; i < durations.length; i++) {
        logger.createRun({
          id: `run-query-${i}`,
          issue_id: i % 2 === 0 ? "issue-query-1" : "issue-query-2",
          session_id: `session-${i}`,
          agent_id: i % 3 === 0 ? "agent-1" : "agent-2",
          policy_name: "test-policy",
          phase: ["plan", "implement", "test"][i % 3],
          status: i === 4 ? "failed" : "completed",
          outcome: { 
            success: i !== 4, 
            metrics: { duration_ms: durations[i] },
          },
          completed_at: Date.now(),
        });
      }
    });

    test("should calculate total duration for all runs", () => {
      const total = logger.getTotalDuration({});
      expect(total).toBe(75000);
    });

    test("should calculate total duration filtered by issue_id", () => {
      const totalIssue1 = logger.getTotalDuration({ issue_id: "issue-query-1" });
      const totalIssue2 = logger.getTotalDuration({ issue_id: "issue-query-2" });
      
      expect(totalIssue1).toBe(45000);
      expect(totalIssue2).toBe(30000);
    });

    test("should calculate total duration filtered by agent_id", () => {
      const totalAgent1 = logger.getTotalDuration({ agent_id: "agent-1" });
      const totalAgent2 = logger.getTotalDuration({ agent_id: "agent-2" });
      
      expect(totalAgent1).toBe(25000);
      expect(totalAgent2).toBe(50000);
    });

    test("should calculate total duration filtered by phase", () => {
      const totalPlan = logger.getTotalDuration({ phase: "plan" });
      const totalImplement = logger.getTotalDuration({ phase: "implement" });
      const totalTest = logger.getTotalDuration({ phase: "test" });
      
      expect(totalPlan).toBe(25000);
      expect(totalImplement).toBe(35000);
      expect(totalTest).toBe(15000);
    });

    test("should calculate total duration filtered by status", () => {
      const totalCompleted = logger.getTotalDuration({ status: "completed" });
      const totalFailed = logger.getTotalDuration({ status: "failed" });
      
      expect(totalCompleted).toBe(50000);
      expect(totalFailed).toBe(25000);
    });

    test("should calculate average duration for all runs", () => {
      const avg = logger.getAverageDuration({});
      expect(avg).toBe(15000);
    });

    test("should calculate average duration filtered by issue_id", () => {
      const avgIssue1 = logger.getAverageDuration({ issue_id: "issue-query-1" });
      const avgIssue2 = logger.getAverageDuration({ issue_id: "issue-query-2" });
      
      expect(avgIssue1).toBe(15000);
      expect(avgIssue2).toBe(15000);
    });

    test("should calculate minimum duration", () => {
      const min = logger.getMinDuration({});
      expect(min).toBe(5000);
    });

    test("should calculate maximum duration", () => {
      const max = logger.getMaxDuration({});
      expect(max).toBe(25000);
    });

    test("should return null for min/max when no runs with duration", () => {
      const min = logger.getMinDuration({ issue_id: "nonexistent" });
      const max = logger.getMaxDuration({ issue_id: "nonexistent" });
      
      expect(min).toBeNull();
      expect(max).toBeNull();
    });
  });

  describe("Duration Statistics", () => {
    test("should return comprehensive duration statistics", () => {
      const durations = [5000, 10000, 15000, 20000];

      for (let i = 0; i < durations.length; i++) {
        logger.createRun({
          id: `run-stats-${i}`,
          issue_id: "issue-stats-1",
          session_id: `session-${i}`,
          agent_id: "agent-1",
          policy_name: "test-policy",
          phase: "plan",
          status: "completed",
          outcome: { success: true, metrics: { duration_ms: durations[i] } },
          completed_at: Date.now(),
        });
      }

      const stats = logger.getDurationStats({ issue_id: "issue-stats-1" });

      expect(stats.total).toBe(50000);
      expect(stats.average).toBe(12500);
      expect(stats.min).toBe(5000);
      expect(stats.max).toBe(20000);
      expect(stats.count).toBe(4);
    });

    test("should return empty stats when no runs match query", () => {
      const stats = logger.getDurationStats({ issue_id: "nonexistent" });

      expect(stats.total).toBe(0);
      expect(stats.average).toBe(0);
      expect(stats.min).toBeNull();
      expect(stats.max).toBeNull();
      expect(stats.count).toBe(0);
    });

    test("should calculate stats with combined filters", () => {
      logger.createRun({
        id: "run-combined-1",
        issue_id: "issue-combined",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
        outcome: { success: true, metrics: { duration_ms: 10000 } },
        completed_at: Date.now(),
      });

      logger.createRun({
        id: "run-combined-2",
        issue_id: "issue-combined",
        session_id: "session-2",
        agent_id: "agent-2",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
        outcome: { success: true, metrics: { duration_ms: 20000 } },
        completed_at: Date.now(),
      });

      const stats = logger.getDurationStats({ 
        issue_id: "issue-combined",
        agent_id: "agent-1",
        phase: "plan",
      });

      expect(stats.total).toBe(10000);
      expect(stats.average).toBe(10000);
      expect(stats.count).toBe(1);
    });
  });

  describe("Integration with Worker Engine Patterns", () => {
    test("should handle typical worker engine run lifecycle", () => {
      const runId = `run-worker-${Date.now()}`;
      const startTime = Date.now();

      logger.createRun({
        id: runId,
        issue_id: "agent-shepherd-1",
        session_id: "session-worker-1",
        agent_id: "agent-coding",
        policy_name: "standard-workflow",
        phase: "plan",
        status: "pending",
      });

      const endTime = startTime + 30000;
      const outcome: RunOutcome = {
        success: true,
        message: "Planning completed successfully",
        artifacts: ["plan.md"],
        metrics: {
          duration_ms: endTime - startTime,
          start_time_ms: startTime,
          end_time_ms: endTime,
          tokens_used: 500,
          cost: 0.01,
          api_calls_count: 3,
        },
      };

      logger.updateRun(runId, {
        status: "completed",
        outcome,
        completed_at: endTime,
      });

      const retrieved = logger.getRun(runId);
      expect(retrieved?.status).toBe("completed");
      expect(retrieved?.outcome?.success).toBe(true);
      expect(retrieved?.outcome?.metrics?.duration_ms).toBe(endTime - startTime);
      expect(retrieved?.outcome?.metrics?.start_time_ms).toBe(startTime);
      expect(retrieved?.outcome?.metrics?.end_time_ms).toBe(endTime);
    });

    test("should handle failed runs with duration tracking", () => {
      const runId = `run-failed-${Date.now()}`;
      const startTime = Date.now();

      logger.createRun({
        id: runId,
        issue_id: "agent-shepherd-2",
        session_id: "session-failed-1",
        agent_id: "agent-coding",
        policy_name: "standard-workflow",
        phase: "implement",
        status: "running",
      });

      const endTime = startTime + 45000;
      const outcome: RunOutcome = {
        success: false,
        error: "Execution exceeded timeout of 30000ms (actual: 45000ms)",
        error_details: {
          type: "TimeoutError",
          message: "Agent execution took too long",
        },
        metrics: {
          duration_ms: endTime - startTime,
          start_time_ms: startTime,
          end_time_ms: endTime,
        },
      };

      logger.updateRun(runId, {
        status: "failed",
        outcome,
        completed_at: endTime,
      });

      const retrieved = logger.getRun(runId);
      expect(retrieved?.status).toBe("failed");
      expect(retrieved?.outcome?.success).toBe(false);
      expect(retrieved?.outcome?.error).toContain("exceeded timeout");
      expect(retrieved?.outcome?.metrics?.duration_ms).toBe(45000);
    });
  });

  describe("Async Duration Query Methods", () => {
    beforeEach(() => {
      const issueId = "issue-async-1";
      
      logger.createRun({
        id: "async-run-1",
        issue_id: issueId,
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
        outcome: { success: true, metrics: { duration_ms: 5000 } },
        completed_at: Date.now(),
      });

      logger.createRun({
        id: "async-run-2",
        issue_id: issueId,
        session_id: "session-2",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "plan",
        status: "completed",
        outcome: { success: true, metrics: { duration_ms: 10000 } },
        completed_at: Date.now(),
      });

      logger.createRun({
        id: "async-run-3",
        issue_id: issueId,
        session_id: "session-3",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "implement",
        status: "completed",
        outcome: { success: true, metrics: { duration_ms: 15000 } },
        completed_at: Date.now(),
      });

      logger.createRun({
        id: "async-run-4",
        issue_id: issueId,
        session_id: "session-4",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "implement",
        status: "completed",
        outcome: { success: true, metrics: { duration_ms: 25000 } },
        completed_at: Date.now(),
      });

      logger.createRun({
        id: "async-run-5",
        issue_id: issueId,
        session_id: "session-5",
        agent_id: "agent-1",
        policy_name: "test-policy",
        phase: "test",
        status: "completed",
        outcome: { success: true, metrics: { duration_ms: 20000 } },
        completed_at: Date.now(),
      });
    });

    test("getAveragePhaseDuration should return Promise<number>", async () => {
      const avgDuration = await logger.getAveragePhaseDuration("issue-async-1", "plan");
      expect(avgDuration).toBe(7500);
      expect(typeof avgDuration).toBe("number");
    });

    test("getTotalIssueDuration should calculate total for all phases", async () => {
      const totalDuration = await logger.getTotalIssueDuration("issue-async-1");
      expect(totalDuration).toBe(75000);
    });

    test("getSlowestPhases should return phases sorted by duration (descending)", async () => {
      const slowest = await logger.getSlowestPhases("issue-async-1");
      
      expect(slowest).toHaveLength(3);
      expect(slowest[0].phase).toBe("implement");
      expect(slowest[0].avg_duration_ms).toBe(20000);
      expect(slowest[1].phase).toBe("test");
      expect(slowest[1].avg_duration_ms).toBe(20000);
      expect(slowest[2].phase).toBe("plan");
      expect(slowest[2].avg_duration_ms).toBe(7500);
    });

    test("getSlowestPhases should respect limit parameter", async () => {
      const slowest = await logger.getSlowestPhases("issue-async-1", 2);
      
      expect(slowest).toHaveLength(2);
      expect(slowest[0].phase).toBe("implement");
      expect(slowest[1].phase).toBe("test");
    });

    test("getSlowestPhases should return empty array for non-existent issue", async () => {
      const slowest = await logger.getSlowestPhases("nonexistent-issue");
      expect(slowest).toEqual([]);
    });

    test("getAveragePhaseDuration should return 0 for non-existent phase", async () => {
      const avg = await logger.getAveragePhaseDuration("issue-async-1", "nonexistent");
      expect(avg).toBe(0);
    });

    test("getTotalIssueDuration should return 0 for non-existent issue", async () => {
      const total = await logger.getTotalIssueDuration("nonexistent-issue");
      expect(total).toBe(0);
    });
  });
});
