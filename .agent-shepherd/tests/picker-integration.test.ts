/**
 * Smart Issue Picker - Integration Tests
 * Tests for multi-worker coordination, failure scenarios, and SDK integration
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = join(__dirname, '..', 'tmp_test');

import {
  IssuePicker,
  resetIssuePicker,
  type DependencyGraph,
} from "../src/core/issue-picker";
import { OpenCodeSDKClient, resetSDKClient } from "../src/core/opencode_sdk";
import { Logger, resetLogger } from "../src/core/logging";
import type { BeadsIssue } from "../src/core/beads";

describe("Smart Issue Picker Integration Tests", () => {
  let testDataDir: string;
  let logger: Logger;

  beforeEach(() => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testDataDir = join(TEMP_DIR, `.test-picker-integration-${timestamp}-${random}`);
    mkdirSync(testDataDir, { recursive: true });
    process.env.ASHEP_DIR = testDataDir;
    resetIssuePicker();
    resetSDKClient();
    resetLogger();
    logger = new Logger(testDataDir);
  });

  afterEach(() => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    delete process.env.ASHEP_DIR;
    resetIssuePicker();
    resetSDKClient();
    resetLogger();
  });

  describe("Dependency Graph Construction", () => {
    it("builds graph with multiple dependencies", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-a",
          title: "Task A",
          description: "Task A",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "task-b",
          title: "Task B",
          description: "Task B depends on A",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "task-c",
          title: "Task C",
          description: "Task C depends on A and B",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const graph: DependencyGraph = {
        nodes: new Map([
          ["task-a", issues[0]],
          ["task-b", issues[1]],
          ["task-c", issues[2]],
        ]),
        edges: [
          { from: "task-a", to: "task-b", type: "blocks" },
          { from: "task-a", to: "task-c", type: "blocks" },
          { from: "task-b", to: "task-c", type: "blocks" },
        ],
        indegree: new Map([
          ["task-a", 0],
          ["task-b", 1],
          ["task-c", 2],
        ]),
        depth: new Map([
          ["task-a", 0],
          ["task-b", 0],
          ["task-c", 0],
        ]),
      };

      expect(graph.nodes.size).toBe(3);
      expect(graph.edges.length).toBe(3);
      expect(graph.indegree.get("task-a")).toBe(0);
      expect(graph.indegree.get("task-c")).toBe(2);
    });

    it("handles diamond dependency pattern", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-start",
          title: "Start",
          description: "Start task",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "task-middle-1",
          title: "Middle 1",
          description: "First middle task",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "task-middle-2",
          title: "Middle 2",
          description: "Second middle task",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "task-end",
          title: "End",
          description: "End task",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const graph: DependencyGraph = {
        nodes: new Map(issues.map(issue => [issue.id, issue])),
        edges: [
          { from: "task-start", to: "task-middle-1", type: "blocks" },
          { from: "task-start", to: "task-middle-2", type: "blocks" },
          { from: "task-middle-1", to: "task-end", type: "blocks" },
          { from: "task-middle-2", to: "task-end", type: "blocks" },
        ],
        indegree: new Map([
          ["task-start", 0],
          ["task-middle-1", 1],
          ["task-middle-2", 1],
          ["task-end", 2],
        ]),
        depth: new Map([
          ["task-start", 0],
          ["task-middle-1", 0],
          ["task-middle-2", 0],
          ["task-end", 0],
        ]),
      };

      expect(graph.indegree.get("task-start")).toBe(0);
      expect(graph.indegree.get("task-end")).toBe(2);
    });

    it("handles linear chain dependencies", async () => {
      const issues: BeadsIssue[] = Array.from({ length: 5 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        description: `Task ${i}`,
        status: "open" as const,
        priority: 1,
        issue_type: "task" as const,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      }));

      const edges = issues.slice(0, -1).map((issue, i) => ({
        from: issue.id,
        to: issues[i + 1].id,
        type: "blocks" as const,
      }));

      const indegree = new Map<string, number>();
      issues.forEach((issue, i) => {
        indegree.set(issue.id, i === 0 ? 0 : 1);
      });

      const graph: DependencyGraph = {
        nodes: new Map(issues.map(issue => [issue.id, issue])),
        edges,
        indegree,
        depth: new Map(issues.map(issue => [issue.id, 0])),
      };

      expect(graph.edges.length).toBe(4);
      expect(graph.indegree.get("task-0")).toBe(0);
      expect(graph.indegree.get("task-4")).toBe(1);
    });
  });

  describe("Topological Ordering", () => {
    it("orders tasks respecting dependencies", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-a",
          title: "Task A",
          description: "Task A",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "task-b",
          title: "Task B",
          description: "Task B depends on A",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const graph: DependencyGraph = {
        nodes: new Map([
          ["task-a", issues[0]],
          ["task-b", issues[1]],
        ]),
        edges: [{ from: "task-a", to: "task-b", type: "blocks" }],
        indegree: new Map([
          ["task-a", 0],
          ["task-b", 1],
        ]),
        depth: new Map([
          ["task-a", 0],
          ["task-b", 0],
        ]),
      };

      const picker = new IssuePicker();
      const ordered = picker["applySmartOrdering"](graph);

      expect(ordered[0].id).toBe("task-a");
      expect(ordered[1].id).toBe("task-b");
    });

    it("handles multiple roots at same priority", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-a",
          title: "Task A",
          description: "Independent A",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "task-b",
          title: "Task B",
          description: "Independent B",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const graph: DependencyGraph = {
        nodes: new Map([
          ["task-a", issues[0]],
          ["task-b", issues[1]],
        ]),
        edges: [],
        indegree: new Map([
          ["task-a", 0],
          ["task-b", 0],
        ]),
        depth: new Map([
          ["task-a", 0],
          ["task-b", 0],
        ]),
      };

      const picker = new IssuePicker();
      const ordered = picker["applySmartOrdering"](graph);

      expect(ordered.length).toBe(2);
      expect(ordered[0].id).toBe("task-a");
      expect(ordered[1].id).toBe("task-b");
    });

    it("prioritizes by priority when depth is equal", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-low",
          title: "Low Priority",
          description: "Low priority task",
          status: "open",
          priority: 5,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "task-high",
          title: "High Priority",
          description: "High priority task",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const graph: DependencyGraph = {
        nodes: new Map([
          ["task-low", issues[0]],
          ["task-high", issues[1]],
        ]),
        edges: [],
        indegree: new Map([
          ["task-low", 0],
          ["task-high", 0],
        ]),
        depth: new Map([
          ["task-low", 0],
          ["task-high", 0],
        ]),
      };

      const picker = new IssuePicker();
      const ordered = picker["applySmartOrdering"](graph);

      expect(ordered[0].id).toBe("task-high");
      expect(ordered[1].id).toBe("task-low");
    });
  });

  describe("Epic Hierarchy Processing", () => {
    it("extracts epic ID correctly", () => {
      const picker = new IssuePicker();

      const testCases = [
        { id: "epic-1", expected: null },
        { id: "epic-1.1", expected: "epic-1" },
        { id: "epic-1.2.3", expected: "epic-1" },
        { id: "project-abc.99.1", expected: "project-abc" },
        { id: "task-only", expected: null },
      ];

      for (const { id, expected } of testCases) {
        const epicId = picker["extractEpicId"](id);
        expect(epicId).toBe(expected);
      }
    });

    it("calculates hierarchical depth correctly", () => {
      const picker = new IssuePicker();

      const testCases = [
        { id: "epic-1", expected: 0 },
        { id: "epic-1.1", expected: 1 },
        { id: "epic-1.1.1", expected: 2 },
        { id: "epic-1.2.3", expected: 2 },
        { id: "feature-abc.2.3.4.5", expected: 4 },
      ];

      for (const { id, expected } of testCases) {
        const depth = picker["calculateHierarchicalDepth"](id);
        expect(depth).toBe(expected);
      }
    });

    it("processes leaf tasks before parent epics", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "epic-parent",
          title: "Parent Epic",
          description: "Parent",
          status: "open",
          priority: 1,
          issue_type: "epic",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "epic-parent.1",
          title: "Child Task",
          description: "Child",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const graph: DependencyGraph = {
        nodes: new Map([
          ["epic-parent", issues[0]],
          ["epic-parent.1", issues[1]],
        ]),
        edges: [],
        indegree: new Map([
          ["epic-parent", 0],
          ["epic-parent.1", 0],
        ]),
        depth: new Map([
          ["epic-parent", 0],
          ["epic-parent.1", 1],
        ]),
      };

      const picker = new IssuePicker();
      const ordered = picker["applySmartOrdering"](graph);

      expect(ordered[0].id).toBe("epic-parent.1");
      expect(ordered[1].id).toBe("epic-parent");
    });
  });

  describe("Issue Filtering", () => {
    it("filters out excluded issues", () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-1",
          title: "Task 1",
          description: "Regular task",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          labels: [],
        },
        {
          id: "task-2",
          title: "Task 2",
          description: "Excluded task",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          labels: ["ashep-excluded"],
        },
      ];

      const picker = new IssuePicker();
      const filtered = picker["filterExcluded"](issues);

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe("task-1");
    });

    it("handles issues without labels property", () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-1",
          title: "Task 1",
          description: "Task without labels",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const picker = new IssuePicker();
      const filtered = picker["filterExcluded"](issues);

      expect(filtered.length).toBe(1);
    });

    it("filters by max_issues limit", () => {
      const issues: BeadsIssue[] = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        description: `Task ${i}`,
        status: "open" as const,
        priority: 1,
        issue_type: "task" as const,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      }));

      const picker = new IssuePicker({ mode: "simple", max_issues: 3 });
      const result = picker["simplePick"](issues);

      expect(result.length).toBe(3);
    });
  });

  describe("Configuration Management", () => {
    it("updates configuration at runtime", () => {
      const picker = new IssuePicker({ mode: "simple", max_issues: 3 });

      expect(picker["config"].mode).toBe("simple");
      expect(picker["config"].max_issues).toBe(3);

      picker.updateConfig({ mode: "smart", max_issues: 5 });

      expect(picker["config"].mode).toBe("smart");
      expect(picker["config"].max_issues).toBe(5);
    });

    it("merges partial configuration updates", () => {
      const picker = new IssuePicker({ mode: "simple", max_issues: 3, prefer_epic_affinity: true });

      picker.updateConfig({ max_issues: 5 });

      expect(picker["config"].mode).toBe("simple");
      expect(picker["config"].max_issues).toBe(5);
      expect(picker["config"].prefer_epic_affinity).toBe(true);
    });

    it("uses default values for missing config", () => {
      const picker = new IssuePicker({});

      expect(picker["config"].mode).toBe("simple");
      expect(picker["config"].max_issues).toBe(3);
      expect(picker["config"].prefer_epic_affinity).toBe(true);
    });
  });

  describe("SDK Client Integration", () => {
    it("handles SDK connection errors gracefully", async () => {
      const client = new OpenCodeSDKClient({ baseUrl: "http://invalid:9999" });

      const activity = await client.getLastSessionActivity("session-123");

      expect(activity).toBeNull();
    });

    it("handles empty session messages", async () => {
      const client = new OpenCodeSDKClient();

      (client as any).client = {
        session: {
          messages: async () => ({ data: [] }),
        },
      };

      const activity = await client.getLastSessionActivity("session-123");

      expect(activity).toBeNull();
    });

    it("handles malformed message timestamps", async () => {
      const client = new OpenCodeSDKClient();

      (client as any).client = {
        session: {
          messages: async () => ({
            data: [
              { info: {} },
              { info: { time: {} } },
              { info: { time: { created: 1000000 } } },
            ],
          }),
        },
      };

      const activity = await client.getLastSessionActivity("session-123");

      expect(activity).toBe(1000000);
    });

    it("detects stale sessions correctly", async () => {
      const client = new OpenCodeSDKClient();

      const staleTime = Date.now() - 10 * 60 * 1000;
      (client as any).client = {
        session: {
          messages: async () => ({
            data: [{ info: { time: { created: staleTime } } }],
          }),
        },
      };

      const result = await client.checkSessionHeartbeat("session-123", 5 * 60 * 1000);

      expect(result.alive).toBe(false);
      expect(result.stale).toBe(true);
    });

    it("detects active sessions correctly", async () => {
      const client = new OpenCodeSDKClient();

      const recentTime = Date.now() - 60000;
      (client as any).client = {
        session: {
          messages: async () => ({
            data: [{ info: { time: { created: recentTime } } }],
          }),
        },
      };

      const result = await client.checkSessionHeartbeat("session-123", 5 * 60 * 1000);

      expect(result.alive).toBe(true);
      expect(result.stale).toBe(false);
    });
  });

  describe("Logging Integration", () => {
    it("creates and retrieves runs", () => {
      const run = logger.createRun({
        id: "run-1",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test",
        phase: "implement",
        status: "running",
      });

      expect(run.id).toBe("run-1");
      expect(run.status).toBe("running");
    });

    it("logs and retrieves decisions", () => {
      logger.createRun({
        id: "run-1",
        issue_id: "issue-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test",
        phase: "implement",
        status: "running",
      });

      const decision = logger.logDecision({
        run_id: "run-1",
        type: "phase_transition",
        decision: "advance",
        reasoning: "Test transition",
        metadata: { from_phase: "implement", to_phase: "test" },
      });

      expect(decision.type).toBe("phase_transition");
      expect(decision.decision).toBe("advance");
    });

    it("queries decisions by issue", () => {
      logger.createRun({
        id: "run-1",
        issue_id: "issue-query-1",
        session_id: "session-1",
        agent_id: "agent-1",
        policy_name: "test",
        phase: "implement",
        status: "completed",
      });

      logger.logDecision({
        run_id: "run-1",
        type: "phase_transition",
        decision: "advance",
        reasoning: "Completed",
        metadata: { from_phase: "implement", to_phase: "test" },
      });

      const decisions = logger.getDecisionsForIssue("issue-query-1");

      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions[0].type).toBe("phase_transition");
    });
  });
});
