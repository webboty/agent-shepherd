/**
 * Loop Prevention Integration Tests
 * Tests phase visit limits, transition limits, and cycle detection
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { PolicyEngine } from "../src/core/policy.ts";
import { getLogger, Logger } from "../src/core/logging.ts";
import { loadConfig } from "../src/core/config.ts";
import { join } from "path";
import { mkdirSync, rmSync, existsSync } from "fs";

describe("Loop Prevention Integration Tests", () => {
  let policyEngine: PolicyEngine;
  let logger: Logger;
  let testDataDir: string;

  beforeEach(() => {
    testDataDir = join(process.cwd(), ".test-loop-prevention");

    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    mkdirSync(testDataDir, { recursive: true });

    Logger.resetInstance();
    policyEngine = new PolicyEngine();
    const policiesPath = join(process.cwd(), ".agent-shepherd", "config", "policies.yaml");
    policyEngine.loadPolicies(policiesPath);

    logger = getLogger(testDataDir);
  });

  describe("2.3.1 Phase Visit Tracking", () => {
    it("should count phase visits correctly", () => {
      const issueId = "test-issue-1";
      const phaseName = "implement";

      logger.createRun({
        id: "run-1",
        issue_id: issueId,
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "simple",
        phase: phaseName,
        status: "completed",
        outcome: { success: true },
      });

      logger.createRun({
        id: "run-2",
        issue_id: issueId,
        session_id: "session-2",
        agent_id: "agent-1",
        policy_name: "simple",
        phase: phaseName,
        status: "completed",
        outcome: { success: true },
      });

      const visitCount = logger.getPhaseVisitCount(issueId, phaseName);
      expect(visitCount).toBe(2);
    });

    it("should count visits across different phases separately", () => {
      const issueId = "test-issue-2";

      logger.createRun({
        id: "run-1",
        issue_id: issueId,
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "simple",
        phase: "implement",
        status: "completed",
        outcome: { success: true },
      });

      logger.createRun({
        id: "run-2",
        issue_id: issueId,
        session_id: "session-2",
        agent_id: "agent-1",
        policy_name: "simple",
        phase: "test",
        status: "completed",
        outcome: { success: true },
      });

      expect(logger.getPhaseVisitCount(issueId, "implement")).toBe(1);
      expect(logger.getPhaseVisitCount(issueId, "test")).toBe(1);
    });
  });

  describe("2.3.2 Phase Limit Validation", () => {
    it("should enforce max_visits limit", async () => {
      const issueId = "test-issue-3";
      const phaseName = "implement";

      for (let i = 0; i < 10; i++) {
        logger.createRun({
          id: `run-${i}`,
          issue_id: issueId,
          session_id: `session-${i}`,
          agent_id: "agent-1",
          policy_name: "simple",
          phase: phaseName,
          status: "completed",
          outcome: { success: true },
        });
      }

      const validation = await policyEngine.validatePhaseLimits(
        "simple",
        issueId,
        phaseName
      );

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain("exceeded max_visits");
    });

    it("should allow visits below max_visits limit", async () => {
      const issueId = "test-issue-4";
      const phaseName = "implement";

      for (let i = 0; i < 5; i++) {
        logger.createRun({
          id: `run-${i}`,
          issue_id: issueId,
          session_id: `session-${i}`,
          agent_id: "agent-1",
          policy_name: "simple",
          phase: phaseName,
          status: "completed",
          outcome: { success: true },
        });
      }

      const validation = await policyEngine.validatePhaseLimits(
        "simple",
        issueId,
        phaseName
      );

      expect(validation.valid).toBe(true);
    });
  });

  describe("2.3.3 Transition Limit Tracking", () => {
    it("should count specific transition patterns", () => {
      const issueId = "test-issue-5";

      for (let i = 0; i < 3; i++) {
        const runId = `run-${i}`;
        logger.createRun({
          id: runId,
          issue_id: issueId,
          session_id: `session-${i}`,
          agent_id: "agent-1",
          policy_name: "simple",
          phase: "implement",
          status: "completed",
          outcome: { success: true },
        });

        logger.logDecision({
          run_id: runId,
          type: "phase_transition",
          decision: "advance",
          reasoning: "Phase completed",
          metadata: {
            from_phase: "implement",
            to_phase: "test",
          },
        });
      }

      const transitionCount = logger.getTransitionCount(issueId, "implement", "test");
      expect(transitionCount).toBe(3);
    });

    it("should count different transition patterns separately", () => {
      const issueId = "test-issue-6";

      logger.createRun({
        id: "run-1",
        issue_id: issueId,
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "simple",
        phase: "implement",
        status: "completed",
        outcome: { success: true },
      });

      logger.logDecision({
        run_id: "run-1",
        type: "phase_transition",
        decision: "advance",
        reasoning: "Phase completed",
        metadata: {
          from_phase: "implement",
          to_phase: "test",
        },
      });

      logger.createRun({
        id: "run-2",
        issue_id: issueId,
        session_id: "session-2",
        agent_id: "agent-1",
        policy_name: "simple",
        phase: "test",
        status: "completed",
        outcome: { success: true },
      });

      logger.logDecision({
        run_id: "run-2",
        type: "phase_transition",
        decision: "advance",
        reasoning: "Phase completed",
        metadata: {
          from_phase: "test",
          to_phase: "validate",
        },
      });

      expect(logger.getTransitionCount(issueId, "implement", "test")).toBe(1);
      expect(logger.getTransitionCount(issueId, "test", "validate")).toBe(1);
      expect(logger.getTransitionCount(issueId, "implement", "validate")).toBe(0);
    });
  });

  describe("2.3.4 Transition Limit Validation", () => {
    it("should block transition exceeding max_transitions", async () => {
      const issueId = "test-issue-7";

      for (let i = 0; i < 5; i++) {
        const runId = `run-${i}`;
        logger.createRun({
          id: runId,
          issue_id: issueId,
          session_id: `session-${i}`,
          agent_id: "agent-1",
          policy_name: "simple",
          phase: "implement",
          status: "completed",
          outcome: { success: true },
        });

        logger.logDecision({
          run_id: runId,
          type: "phase_transition",
          decision: "advance",
          reasoning: "Phase completed",
          metadata: {
            from_phase: "implement",
            to_phase: "test",
          },
        });
      }

      const validation = await policyEngine.validateTransitionLimits(
        issueId,
        "implement",
        "test"
      );

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain("exceeded max_transitions");
    });

    it("should allow transition below max_transitions", async () => {
      const issueId = "test-issue-8";

      const runId = "run-1";
      logger.createRun({
        id: runId,
        issue_id: issueId,
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "simple",
        phase: "implement",
        status: "completed",
        outcome: { success: true },
      });

      logger.logDecision({
        run_id: runId,
        type: "phase_transition",
        decision: "advance",
        reasoning: "Phase completed",
        metadata: {
          from_phase: "implement",
          to_phase: "test",
        },
      });

      const validation = await policyEngine.validateTransitionLimits(
        issueId,
        "implement",
        "test"
      );

      expect(validation.valid).toBe(true);
    });
  });

  describe("2.3.5 Cycle Detection", () => {
    it("should detect oscillating implement→test→implement pattern", async () => {
      const issueId = "test-issue-9";

      for (let i = 0; i < 6; i++) {
        const runId = `run-${i}`;
        const phase = i % 2 === 0 ? "implement" : "test";

        logger.createRun({
          id: runId,
          issue_id: issueId,
          session_id: `session-${i}`,
          agent_id: "agent-1",
          policy_name: "simple",
          phase,
          status: "completed",
          outcome: { success: true },
        });

        const nextPhase = phase === "implement" ? "test" : "implement";
        logger.logDecision({
          run_id: runId,
          type: "phase_transition",
          decision: "advance",
          reasoning: "Phase completed",
          metadata: {
            from_phase: phase,
            to_phase: nextPhase,
          },
        });
      }

      const detection = await policyEngine.detectCycles(issueId);
      expect(detection.detected).toBe(true);
      expect(detection.reason).toContain("Oscillating cycle");
    });

    it("should not detect cycle in normal workflow progression", async () => {
      const issueId = "test-issue-10";

      const phases = ["implement", "test", "validate"];
      for (let i = 0; i < 3; i++) {
        const runId = `run-${i}`;
        const phase = phases[i];

        logger.createRun({
          id: runId,
          issue_id: issueId,
          session_id: `session-${i}`,
          agent_id: "agent-1",
          policy_name: "simple",
          phase,
          status: "completed",
          outcome: { success: true },
        });

        const nextPhase = phases[i + 1];
        if (nextPhase) {
          logger.logDecision({
            run_id: runId,
            type: "phase_transition",
            decision: "advance",
            reasoning: "Phase completed",
            metadata: {
              from_phase: phase,
              to_phase: nextPhase,
            },
          });
        }
      }

      const detection = await policyEngine.detectCycles(issueId);
      expect(detection.detected).toBe(false);
    });
  });

  describe("2.3.6 Loop Prevention Integration", () => {
    it("should block transition when phase limit exceeded", async () => {
      const issueId = "test-issue-11";

      for (let i = 0; i < 10; i++) {
        logger.createRun({
          id: `run-${i}`,
          issue_id: issueId,
          session_id: `session-${i}`,
          agent_id: "agent-1",
          policy_name: "simple",
          phase: "implement",
          status: "completed",
          outcome: { success: true },
        });
      }

      const transition = await policyEngine.determineTransition(
        "simple",
        "implement",
        { success: true },
        issueId
      );

      expect(transition.type).toBe("block");
      expect(transition.reason).toContain("exceeded max_visits");
    });

    it("should block transition when transition limit exceeded", async () => {
      const issueId = "test-issue-12";

      for (let i = 0; i < 5; i++) {
        const runId = `run-${i}`;
        logger.createRun({
          id: runId,
          issue_id: issueId,
          session_id: `session-${i}`,
          agent_id: "agent-1",
          policy_name: "simple",
          phase: "implement",
          status: "completed",
          outcome: { success: true },
        });

        logger.logDecision({
          run_id: runId,
          type: "phase_transition",
          decision: "advance",
          reasoning: "Phase completed",
          metadata: {
            from_phase: "implement",
            to_phase: "test",
          },
        });
      }

      const transition = await policyEngine.determineTransition(
        "simple",
        "implement",
        { success: true },
        issueId
      );

      expect(transition.type).toBe("block");
      expect(transition.reason).toContain("exceeded max_transitions");
    });

    it("should block transition when cycle detected", async () => {
      const issueId = "test-issue-13";

      for (let i = 0; i < 6; i++) {
        const runId = `run-${i}`;
        const phase = i % 2 === 0 ? "implement" : "test";

        logger.createRun({
          id: runId,
          issue_id: issueId,
          session_id: `session-${i}`,
          agent_id: "agent-1",
          policy_name: "simple",
          phase,
          status: "completed",
          outcome: { success: true },
        });

        const nextPhase = phase === "implement" ? "test" : "implement";
        logger.logDecision({
          run_id: runId,
          type: "phase_transition",
          decision: "advance",
          reasoning: "Phase completed",
          metadata: {
            from_phase: phase,
            to_phase: nextPhase,
          },
        });
      }

      const transition = await policyEngine.determineTransition(
        "simple",
        "implement",
        { success: true },
        issueId
      );

      expect(transition.type).toBe("block");
      expect(transition.reason).toContain("Oscillating cycle");
    });
  });

  describe("2.3.7 Configuration Support", () => {
    it("should use configured max_visits_default", () => {
      const config = loadConfig();
      expect(config.loop_prevention?.max_visits_default).toBeDefined();
      expect(typeof config.loop_prevention?.max_visits_default).toBe("number");
    });

    it("should use configured max_transitions_default", () => {
      const config = loadConfig();
      expect(config.loop_prevention?.max_transitions_default).toBeDefined();
      expect(typeof config.loop_prevention?.max_transitions_default).toBe("number");
    });

    it("should use configured cycle_detection_length", () => {
      const config = loadConfig();
      expect(config.loop_prevention?.cycle_detection_length).toBeDefined();
      expect(typeof config.loop_prevention?.cycle_detection_length).toBe("number");
    });

    it("should respect loop_prevention.enabled setting", () => {
      const config = loadConfig();
      expect(config.loop_prevention?.enabled).toBeDefined();
      expect(typeof config.loop_prevention?.enabled).toBe("boolean");
    });
  });
});
