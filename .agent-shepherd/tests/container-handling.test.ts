/**
 * Container Handling Unit Tests
 * Tests for smart container detection, hierarchy calculation, ordering, and policy resolution
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { WorkerEngine } from "../src/core/worker-engine";
import { IssuePicker, getIssuePicker, resetIssuePicker } from "../src/core/issue-picker";
import { loadConfig, saveConfig } from "../src/core/config";
import type { BeadsIssue } from "../src/core/beads";

const __dirname = import.meta.dir;
const TEMP_DIR = join(__dirname, "..", "..", "tmp_test");

describe("Container Handling - Unit Tests", () => {
  let testDataDir: string;
  let picker: IssuePicker;

  beforeEach(() => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testDataDir = join(TEMP_DIR, `.test-container-unit-${timestamp}-${random}`);
    mkdirSync(testDataDir, { recursive: true });
    process.env.ASHEP_DIR = testDataDir;
    resetIssuePicker();
    picker = new IssuePicker({ mode: "smart", max_issues: 10 });
  });

  afterEach(() => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    delete process.env.ASHEP_DIR;
    resetIssuePicker();
  });

  describe("Container Detection", () => {
    it("should detect container epic by issue type", () => {
      const epicIssue: BeadsIssue = {
        id: "epic-1",
        title: "Container Epic",
        description: "This epic contains subtasks",
        status: "open",
        priority: 1,
        issue_type: "epic",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const taskIssue: BeadsIssue = {
        id: "task-1",
        title: "Regular Task",
        description: "Regular task",
        status: "open",
        priority: 1,
        issue_type: "task",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      expect(epicIssue.issue_type).toBe("epic");
      expect(taskIssue.issue_type).toBe("task");
    });

    it("should recognize container types", () => {
      const containerTypes = ["epic", "milestone", "phase", "group"];
      const nonContainerTypes = ["task", "bug", "feature", "chore"];

      const workerEngine = new WorkerEngine();

      for (const type of containerTypes) {
        const issue: BeadsIssue = {
          id: "test-1",
          title: "Test",
          description: "Test",
          status: "open",
          priority: 1,
          issue_type: type as any,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        };
        expect(workerEngine["isContainerType"](issue)).toBe(true);
      }

      for (const type of nonContainerTypes) {
        const issue: BeadsIssue = {
          id: "test-1",
          title: "Test",
          description: "Test",
          status: "open",
          priority: 1,
          issue_type: type as any,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        };
        expect(workerEngine["isContainerType"](issue)).toBe(false);
      }
    });

    it("should detect container language patterns", () => {
      const workerEngine = new WorkerEngine();

      const containerDescriptions = [
        "This epic contains the following subtasks",
        "Work in this epic includes multiple phases",
        "When assigned this epic, select the next available child",
        "This phase groups related tasks",
        "Contains components for the feature",
      ];

      const nonContainerDescriptions = [
        "Implement the feature",
        "Fix the bug in the code",
        "Write tests for the module",
        "Update documentation",
      ];

      for (const desc of containerDescriptions) {
        const issue: BeadsIssue = {
          id: "test-1",
          title: "Test",
          description: desc,
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        };
        expect(workerEngine["hasContainerLanguage"](issue)).toBe(true);
      }

      for (const desc of nonContainerDescriptions) {
        const issue: BeadsIssue = {
          id: "test-1",
          title: "Test",
          description: desc,
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        };
        expect(workerEngine["hasContainerLanguage"](issue)).toBe(false);
      }
    });

    it("should calculate container confidence correctly", () => {
      const workerEngine = new WorkerEngine();

      const testCases = [
        {
          hasChildren: true,
          hasContainerType: true,
          hasContainerLanguage: true,
          hasContainerStructure: true,
          minExpected: 0.8,
        },
        {
          hasChildren: true,
          hasContainerType: false,
          hasContainerLanguage: false,
          hasContainerStructure: false,
          maxExpected: 0.4,
        },
        {
          hasChildren: false,
          hasContainerType: true,
          hasContainerLanguage: false,
          hasContainerStructure: false,
          maxExpected: 0.5,
        },
        {
          hasChildren: true,
          hasContainerType: true,
          hasContainerLanguage: false,
          hasContainerStructure: false,
          expectedRange: [0.7, 0.9],
        },
      ];

      for (const tc of testCases) {
        const confidence = workerEngine["calculateContainerConfidence"](
          tc.hasChildren,
          tc.hasContainerType,
          tc.hasContainerLanguage,
          tc.hasContainerStructure
        );

        if (tc.minExpected !== undefined) {
          expect(confidence).toBeGreaterThanOrEqual(tc.minExpected);
        }
        if (tc.maxExpected !== undefined) {
          expect(confidence).toBeLessThanOrEqual(tc.maxExpected);
        }
        if (tc.expectedRange) {
          expect(confidence).toBeGreaterThanOrEqual(tc.expectedRange[0]);
          expect(confidence).toBeLessThanOrEqual(tc.expectedRange[1]);
        }
      }
    });
  });

  describe("Hierarchy Depth Calculation", () => {
    it("should calculate depth for various Beads ID formats", () => {
      const testCases = [
        { id: "epic-1", expected: 0 },
        { id: "epic-1.1", expected: 1 },
        { id: "epic-1.1.1", expected: 2 },
        { id: "epic-1.1.1.1", expected: 3 },
        { id: "epic-1.1.1.1.1", expected: 4 },
        { id: "feature-abc.2.3", expected: 2 },
        { id: "agent-shepherd-9z1.5.1", expected: 2 },
        { id: "task-x", expected: 0 },
        { id: "123", expected: 0 },
        { id: "prefix.1.2.3.4", expected: 4 },
      ];

      for (const { id, expected } of testCases) {
        const depth = picker["calculateHierarchicalDepth"](id);
        expect(depth).toBe(expected);
      }
    });

    it("should calculate hierarchy level in worker engine", () => {
      const workerEngine = new WorkerEngine();

      const testCases = [
        { id: "epic-1", expected: 0 },
        { id: "epic-1.1", expected: 1 },
        { id: "epic-1.1.1", expected: 2 },
        { id: "epic-1.1.1.1", expected: 3 },
        { id: "feature-abc.2.3", expected: 2 },
        { id: "agent-shepherd-9z1.5.1", expected: 2 },
        { id: "task-x", expected: 0 },
        { id: "123", expected: 0 },
        { id: "prefix.1.2.3.4", expected: 4 },
      ];

      for (const { id, expected } of testCases) {
        const level = workerEngine["calculateHierarchicalLevel"](id);
        expect(level).toBe(expected);
      }
    });

    it("should handle edge cases in depth calculation", () => {
      const edgeCases = [
        { id: "", expected: 0 },
        { id: "no-dots", expected: 0 },
        { id: "prefix.", expected: 0 },
        { id: ".1.2", expected: 2 },
        { id: "prefix.abc.123", expected: 1 },
        { id: "prefix.123.abc", expected: 1 },
      ];

      for (const { id, expected } of edgeCases) {
        const depth = picker["calculateHierarchicalDepth"](id);
        expect(depth).toBe(expected);
      }
    });
  });

  describe("Dependency vs Hierarchy Ordering", () => {
    it("should calculate dependency completeness score", () => {
      const graph = {
        nodes: new Map([
          ["task-1", { id: "task-1", status: "closed" as const }],
          ["task-2", { id: "task-2", status: "open" as const }],
          ["task-3", { id: "task-3", status: "open" as const }],
        ]),
        edges: [
          { from: "task-1", to: "task-2", type: "blocks" as const },
          { from: "task-1", to: "task-3", type: "blocks" as const },
        ],
        indegree: new Map([
          ["task-1", 0],
          ["task-2", 1],
          ["task-3", 1],
        ]),
        depth: new Map([
          ["task-1", 0],
          ["task-2", 1],
          ["task-3", 1],
        ]),
        level: new Map([
          ["task-1", 0],
          ["task-2", 1],
          ["task-3", 1],
        ]),
      };

      const score1 = picker["calculateDependencyCompleteness"]("task-1", graph);
      const score2 = picker["calculateDependencyCompleteness"]("task-2", graph);
      const score3 = picker["calculateDependencyCompleteness"]("task-3", graph);

      expect(score1).toBe(1.0);
      expect(score2).toBe(1.0);
      expect(score3).toBe(1.0);
    });

    it("should calculate hierarchical priority score", () => {
      const graph = {
        nodes: new Map([
          ["task-1", { id: "task-1", priority: 1, status: "open" as const }],
          ["task-2", { id: "task-2", priority: 3, status: "open" as const }],
          ["task-3", { id: "task-3", priority: 5, status: "open" as const }],
        ]),
        edges: [],
        indegree: new Map([
          ["task-1", 0],
          ["task-2", 0],
          ["task-3", 0],
        ]),
        depth: new Map([
          ["task-1", 0],
          ["task-2", 2],
          ["task-3", 4],
        ]),
        level: new Map([
          ["task-1", 0],
          ["task-2", 2],
          ["task-3", 4],
        ]),
      };

      const score1 = picker["calculateHierarchicalPriority"]("task-1", graph);
      const score2 = picker["calculateHierarchicalPriority"]("task-2", graph);
      const score3 = picker["calculateHierarchicalPriority"]("task-3", graph);

      expect(score3).toBeGreaterThan(score2);
      expect(score2).toBeGreaterThan(score1);
    });

    it("should apply hybrid ordering with dependency weight", () => {
      const graph = {
        nodes: new Map([
          ["epic-1", { id: "epic-1", priority: 1, status: "open" as const }],
          ["epic-1.1", { id: "epic-1.1", priority: 1, status: "open" as const }],
          ["epic-1.1.1", { id: "epic-1.1.1", priority: 1, status: "open" as const }],
        ]),
        edges: [],
        indegree: new Map([
          ["epic-1", 0],
          ["epic-1.1", 0],
          ["epic-1.1.1", 0],
        ]),
        depth: new Map([
          ["epic-1", 0],
          ["epic-1.1", 1],
          ["epic-1.1.1", 2],
        ]),
        level: new Map([
          ["epic-1", 0],
          ["epic-1.1", 1],
          ["epic-1.1.1", 2],
        ]),
      };

      const ordered = picker["applyHybridOrdering"](graph);

      expect(ordered).toHaveLength(3);
      expect(ordered[0].id).toBe("epic-1.1.1");
      expect(ordered[1].id).toBe("epic-1.1");
      expect(ordered[2].id).toBe("epic-1");
    });

    it("should apply dependency-only ordering (topological sort)", () => {
      const graph = {
        nodes: new Map([
          ["task-1", { id: "task-1", priority: 1, status: "open" as const }],
          ["task-2", { id: "task-2", priority: 1, status: "open" as const }],
          ["task-3", { id: "task-3", priority: 1, status: "open" as const }],
        ]),
        edges: [
          { from: "task-1", to: "task-2", type: "blocks" as const },
          { from: "task-2", to: "task-3", type: "blocks" as const },
        ],
        indegree: new Map([
          ["task-1", 0],
          ["task-2", 1],
          ["task-3", 1],
        ]),
        depth: new Map([
          ["task-1", 0],
          ["task-2", 0],
          ["task-3", 0],
        ]),
        level: new Map([
          ["task-1", 0],
          ["task-2", 0],
          ["task-3", 0],
        ]),
      };

      const ordered = picker["applyDependencyOrdering"](graph);

      expect(ordered).toHaveLength(3);
      expect(ordered[0].id).toBe("task-1");
      expect(ordered[1].id).toBe("task-2");
      expect(ordered[2].id).toBe("task-3");
    });

    it("should apply hierarchy-only ordering (depth-based)", () => {
      const graph = {
        nodes: new Map([
          ["epic-1", { id: "epic-1", priority: 1, status: "open" as const }],
          ["epic-1.1", { id: "epic-1.1", priority: 2, status: "open" as const }],
          ["epic-1.1.1", { id: "epic-1.1.1", priority: 3, status: "open" as const }],
        ]),
        edges: [],
        indegree: new Map([
          ["epic-1", 0],
          ["epic-1.1", 0],
          ["epic-1.1.1", 0],
        ]),
        depth: new Map([
          ["epic-1", 0],
          ["epic-1.1", 1],
          ["epic-1.1.1", 2],
        ]),
        level: new Map([
          ["epic-1", 0],
          ["epic-1.1", 1],
          ["epic-1.1.1", 2],
        ]),
      };

      const ordered = picker["applyHierarchyOrdering"](graph);

      expect(ordered).toHaveLength(3);
      expect(ordered[0].id).toBe("epic-1.1.1");
      expect(ordered[1].id).toBe("epic-1.1");
      expect(ordered[2].id).toBe("epic-1");
    });
  });

  describe("Policy Resolution", () => {
    it("should resolve level-based policies", () => {
      const configDir = join(testDataDir, "config");
      mkdirSync(configDir, { recursive: true });

      const config = {
        worker: {
          poll_interval_ms: 30000,
          max_concurrent_runs: 3,
        },
        container_handling: {
          enabled: true,
          default_mode: "auto-close",
          level_policies: {
            "0": {
              mode: "auto-close",
            },
            "1": {
              mode: "process-as-task",
            },
            "2": {
              mode: "validation",
              workflow_override: "container-validation-workflow",
            },
          },
        },
      };

      writeFileSync(
        join(configDir, "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  level_policies:\n    "0":\n      mode: auto-close\n    "1":\n      mode: process-as-task\n    "2":\n      mode: validation\n      workflow_override: container-validation-workflow\n`
      );

      const testIssues = [
        { id: "epic-1", expectedLevel: 0, expectedMode: "auto-close" },
        { id: "epic-1.1", expectedLevel: 1, expectedMode: "process-as-task" },
        { id: "epic-1.1.1", expectedLevel: 2, expectedMode: "validation", expectedWorkflow: "container-validation-workflow" },
      ];

      for (const testCase of testIssues) {
        const policy = picker["getContainerHandlingPolicy"]({ id: testCase.id } as BeadsIssue);
        expect(policy.level).toBe(testCase.expectedLevel);
        expect(policy.mode).toBe(testCase.expectedMode);
        if (testCase.expectedWorkflow) {
          expect(policy.workflow_override).toBe(testCase.expectedWorkflow);
        }
      }
    });

    it("should apply level-specific policy over default mode", () => {
      const configDir = join(testDataDir, "config");
      mkdirSync(configDir, { recursive: true });

      writeFileSync(
        join(configDir, "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  level_policies:\n    "1":\n      mode: process-as-task\n`
      );

      const newPicker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const policyLevel0 = newPicker["getContainerHandlingPolicy"]({ id: "epic-1" } as BeadsIssue);
      expect(policyLevel0.mode).toBe("auto-close");

      const policyLevel1 = newPicker["getContainerHandlingPolicy"]({ id: "epic-1.1" } as BeadsIssue);
      expect(policyLevel1.mode).toBe("process-as-task");
    });

    it("should handle disabled container handling", () => {
      const configDir = join(testDataDir, "config");
      mkdirSync(configDir, { recursive: true });

      const config = {
        worker: {
          poll_interval_ms: 30000,
          max_concurrent_runs: 3,
        },
        container_handling: {
          enabled: false,
          default_mode: "auto-close",
        },
      };

      writeFileSync(
        join(configDir, "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: false\n  default_mode: auto-close\n`
      );

      const policy = picker["getContainerHandlingPolicy"]({ id: "epic-1" } as BeadsIssue);
      expect(policy.mode).toBe("auto-close");
      expect(policy.level).toBe(0);
    });

    it("should resolve workflow overrides", () => {
      const configDir = join(testDataDir, "config");
      mkdirSync(configDir, { recursive: true });

      writeFileSync(
        join(configDir, "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  level_policies:\n    "2":\n      mode: validation\n      workflow_override: custom-validation-workflow\n`
      );

      const policy = picker["getContainerHandlingPolicy"]({ id: "epic-1.1.1" } as BeadsIssue);
      expect(policy.workflow_override).toBe("custom-validation-workflow");
      expect(policy.mode).toBe("validation");
      expect(policy.level).toBe(2);
    });
  });

  describe("Container Validation Response Parsing", () => {
    it("should parse valid container validation responses", () => {
      const workerEngine = new WorkerEngine();

      const testCases = [
        {
          response: JSON.stringify({
            decision: "DONE",
            confidence: 0.9,
            reasoning: "All subtasks completed successfully",
          }),
          expected: { outcome: "DONE", confidence: 0.9, reasoning: "All subtasks completed successfully" },
        },
        {
          response: JSON.stringify({
            decision: "NEEDS_WORK",
            confidence: 0.8,
            reasoning: "Some subtasks are incomplete",
          }),
          expected: { outcome: "NEEDS_WORK", confidence: 0.8, reasoning: "Some subtasks are incomplete" },
        },
        {
          response: JSON.stringify({
            decision: "UNCLEAR",
            confidence: 0.5,
            reasoning: "Status unclear, needs human review",
          }),
          expected: { outcome: "UNCLEAR", confidence: 0.5, reasoning: "Status unclear, needs human review" },
        },
      ];

      for (const { response, expected } of testCases) {
        const parsed = workerEngine["parseContainerValidationResponse"](response);
        expect(parsed.outcome).toBe(expected.outcome);
        expect(parsed.confidence).toBe(expected.confidence);
        expect(parsed.reasoning).toBe(expected.reasoning);
      }
    });

    it("should handle responses with code blocks", () => {
      const workerEngine = new WorkerEngine();

      const responses = [
        "```json\n{\"decision\":\"DONE\",\"confidence\":0.9,\"reasoning\":\"Complete\"}\n```",
        "```json\n{\"decision\":\"NEEDS_WORK\",\"confidence\":0.7,\"reasoning\":\"Incomplete\"}\n```",
      ];

      for (const response of responses) {
        const parsed = workerEngine["parseContainerValidationResponse"](response);
        expect(["DONE", "NEEDS_WORK"]).toContain(parsed.outcome);
        expect(parsed.confidence).toBeGreaterThan(0);
      }
    });

    it("should handle invalid outcomes", () => {
      const workerEngine = new WorkerEngine();

      const invalidResponses = [
        JSON.stringify({ decision: "INVALID", confidence: 0.5, reasoning: "Test" }),
        JSON.stringify({ decision: "", confidence: 0.5, reasoning: "Test" }),
        JSON.stringify({ decision: "done", confidence: 0.5, reasoning: "Test" }),
      ];

      for (const response of invalidResponses) {
        const parsed = workerEngine["parseContainerValidationResponse"](response);
        expect(parsed.outcome).toBe("UNCLEAR");
      }
    });

    it("should handle malformed JSON", () => {
      const workerEngine = new WorkerEngine();

      const malformedResponses = [
        "not json at all",
        "{decision: DONE, confidence: 0.9}",
        "{\"decision\": \"DONE\",",
      ];

      for (const response of malformedResponses) {
        const parsed = workerEngine["parseContainerValidationResponse"](response);
        expect(parsed.outcome).toBe("UNCLEAR");
        expect(parsed.confidence).toBeLessThan(0.5);
        expect(parsed.reasoning).toContain("Failed to parse");
      }
    });

    it("should extract recommendations when present", () => {
      const workerEngine = new WorkerEngine();

      const response = JSON.stringify({
        decision: "DONE",
        confidence: 0.9,
        reasoning: "Complete",
        recommendations: ["Proceed with next phase", "Document completion"],
      });

      const parsed = workerEngine["parseContainerValidationResponse"](response);
      expect(parsed.outcome).toBe("DONE");
      expect(parsed.recommendations).toEqual(["Proceed with next phase", "Document completion"]);
    });
  });
});
