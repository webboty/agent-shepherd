/**
 * Issue Picker Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import {
  IssuePicker,
  DependencyGraph,
  getIssuePicker,
  resetIssuePicker,
} from "../src/core/issue-picker";
import type { BeadsIssue } from "../src/core/beads";

const __dirname = import.meta.dir;
const TEMP_DIR = join(__dirname, "..", "..", "tmp_test");

describe("IssuePicker", () => {
  let picker: IssuePicker;
  let testDataDir: string;

  beforeEach(() => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testDataDir = join(TEMP_DIR, `.test-issue-picker-${timestamp}-${random}`);
    mkdirSync(testDataDir, { recursive: true });
    process.env.ASHEP_DIR = testDataDir;
    resetIssuePicker();
    picker = new IssuePicker({ mode: "simple", max_issues: 5 });
  });

  afterEach(() => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    delete process.env.ASHEP_DIR;
    resetIssuePicker();
  });

  describe("Simple Mode", () => {
    it("should sort issues by priority then ID (numeric sort)", () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-10",
          title: "Task 10",
          description: "Task 10",
          status: "open",
          priority: 2,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "task-2",
          title: "Task 2",
          description: "Task 2",
          status: "open",
          priority: 2,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const simplePicker = new IssuePicker({ mode: "simple", max_issues: 10 });

      const result = simplePicker["simplePick"](issues);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("task-2");
      expect(result[1].id).toBe("task-10");
    });

    it("should sort issues by priority then ID", () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-3",
          title: "Task 3",
          description: "Low priority task",
          status: "open",
          priority: 3,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "task-1",
          title: "Task 1",
          description: "High priority task",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "task-2",
          title: "Task 2",
          description: "Medium priority task",
          status: "open",
          priority: 2,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const simplePicker = new IssuePicker({ mode: "simple", max_issues: 10 });

      const result = simplePicker["simplePick"](issues);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe("task-1");
      expect(result[1].id).toBe("task-2");
      expect(result[2].id).toBe("task-3");
    });

    it("should limit to max_issues", () => {
      const issues: BeadsIssue[] = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        description: `Task ${i}`,
        status: "open",
        priority: 1,
        issue_type: "task",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      }));

      const simplePicker = new IssuePicker({ mode: "simple", max_issues: 3 });

      const result = simplePicker["simplePick"](issues);

      expect(result).toHaveLength(3);
    });

    it("should filter out excluded issues", () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-1",
          title: "Task 1",
          description: "Included task",
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

      const result = picker["filterExcluded"](issues);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("task-1");
    });
  });

  describe("Hierarchical Depth Calculation", () => {
    it("should calculate depth for various issue IDs", () => {
      const testCases = [
        { id: "epic-1", expected: 0 },
        { id: "epic-1.1", expected: 1 },
        { id: "epic-1.1.1", expected: 2 },
        { id: "epic-1.1.1.1", expected: 3 },
        { id: "feature-abc.2.3", expected: 2 },
      ];

      for (const { id, expected } of testCases) {
        const depth = picker["calculateHierarchicalDepth"](id);
        expect(depth).toBe(expected);
      }
    });
  });

  describe("Dependency Graph Builder", () => {
    it("should build graph with nodes and depths", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "epic-1",
          title: "Epic",
          description: "Epic",
          status: "open",
          priority: 1,
          issue_type: "epic",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "epic-1.1",
          title: "Task",
          description: "Task",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const graph = await picker.buildDependencyGraph(issues);

      expect(graph.nodes.size).toBe(2);
      expect(graph.depth.get("epic-1")).toBe(0);
      expect(graph.depth.get("epic-1.1")).toBe(1);
    });

    it("should initialize indegree for all nodes", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-1",
          title: "Task 1",
          description: "Task 1",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const graph = await picker.buildDependencyGraph(issues);

      expect(graph.indegree.get("task-1")).toBe(0);
    });

    it("should handle empty issue list", async () => {
      const graph = await picker.buildDependencyGraph([]);

      expect(graph.nodes.size).toBe(0);
      expect(graph.edges.length).toBe(0);
      expect(graph.indegree.size).toBe(0);
      expect(graph.depth.size).toBe(0);
    });
  });

  describe("Smart Ordering", () => {
    it("should apply Kahn's algorithm for topological ordering", async () => {
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
        nodes: new Map(
          issues.map((issue) => [issue.id, issue])
        ),
        edges: [
          { from: "task-a", to: "task-b", type: "blocks" },
        ],
        indegree: new Map([
          ["task-a", 0],
          ["task-b", 1],
        ]),
        depth: new Map([
          ["task-a", 0],
          ["task-b", 0],
        ]),
        level: new Map([
          ["task-a", 0],
          ["task-b", 0],
        ]),
      };

      const ordered = picker["applySmartOrdering"](graph);

      expect(ordered).toHaveLength(2);
      expect(ordered[0].id).toBe("task-a");
      expect(ordered[1].id).toBe("task-b");
    });

    it("should sort by hierarchical depth (leaves first)", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "epic-1",
          title: "Epic",
          description: "Epic",
          status: "open",
          priority: 1,
          issue_type: "epic",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "epic-1.1",
          title: "Task",
          description: "Task",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const graph: DependencyGraph = {
        nodes: new Map(
          issues.map((issue) => [issue.id, issue])
        ),
        edges: [],
        indegree: new Map([
          ["epic-1", 0],
          ["epic-1.1", 0],
        ]),
        depth: new Map([
          ["epic-1", 0],
          ["epic-1.1", 1],
        ]),
        level: new Map([
          ["epic-1", 0],
          ["epic-1.1", 1],
        ]),
      };

      const ordered = picker["applySmartOrdering"](graph);

      expect(ordered[0].id).toBe("epic-1.1");
      expect(ordered[1].id).toBe("epic-1");
    });

    it("should sort by priority after depth", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-1",
          title: "Task 1",
          description: "Low priority",
          status: "open",
          priority: 2,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "task-2",
          title: "Task 2",
          description: "High priority",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const graph: DependencyGraph = {
        nodes: new Map(
          issues.map((issue) => [issue.id, issue])
        ),
        edges: [],
        indegree: new Map([
          ["task-1", 0],
          ["task-2", 0],
        ]),
        depth: new Map([
          ["task-1", 0],
          ["task-2", 0],
        ]),
        level: new Map([
          ["task-1", 0],
          ["task-2", 0],
        ]),
      };

      const ordered = picker["applySmartOrdering"](graph);

      expect(ordered[0].id).toBe("task-2");
      expect(ordered[1].id).toBe("task-1");
    });

    it("should sort by ID after depth and priority", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-b",
          title: "Task B",
          description: "Task B",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
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
      ];

      const graph: DependencyGraph = {
        nodes: new Map(
          issues.map((issue) => [issue.id, issue])
        ),
        edges: [],
        indegree: new Map([
          ["task-a", 0],
          ["task-b", 0],
        ]),
        depth: new Map([
          ["task-a", 0],
          ["task-b", 0],
        ]),
        level: new Map([
          ["task-a", 0],
          ["task-b", 0],
        ]),
      };

      const ordered = picker["applySmartOrdering"](graph);

      expect(ordered[0].id).toBe("task-a");
      expect(ordered[1].id).toBe("task-b");
    });
  });

  describe("Epic ID Extraction", () => {
    it("should extract epic ID from hierarchical issue IDs", () => {
      const testCases = [
        { id: "agent-shepherd-1", expected: null },
        { id: "agent-shepherd-1.1", expected: "agent-shepherd-1" },
        { id: "agent-shepherd-1.2", expected: "agent-shepherd-1" },
        { id: "agent-shepherd-1.2.1", expected: "agent-shepherd-1" },
        { id: "task-abc", expected: null },
      ];

      for (const { id, expected } of testCases) {
        const epicId = picker["extractEpicId"](id);
        expect(epicId).toBe(expected);
      }
    });
  });

  describe("Queue Initialization", () => {
    it("should initialize queue with nodes that have no dependencies", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-1",
          title: "Task 1",
          description: "Task 1",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "task-2",
          title: "Task 2",
          description: "Task 2",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const graph: DependencyGraph = {
        nodes: new Map(
          issues.map((issue) => [issue.id, issue])
        ),
        edges: [],
        indegree: new Map([
          ["task-1", 0],
          ["task-2", 0],
        ]),
        depth: new Map([
          ["task-1", 0],
          ["task-2", 0],
        ]),
        level: new Map([
          ["task-1", 0],
          ["task-2", 0],
        ]),
      };

      const queue = picker["initializeQueue"](graph);

      expect(queue).toHaveLength(2);
    });

    it("should exclude nodes with dependencies from initial queue", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-1",
          title: "Task 1",
          description: "Task 1",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const graph: DependencyGraph = {
        nodes: new Map([["task-1", issues[0]]]),
        edges: [],
        indegree: new Map([["task-1", 1]]),
        depth: new Map([["task-1", 0]]),
        level: new Map([["task-1", 0]]),
      };

      const queue = picker["initializeQueue"](graph);

      expect(queue).toHaveLength(0);
    });
  });

  describe("Indegree Decrement", () => {
    it("should decrement indegrees of dependent issues", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-1",
          title: "Task 1",
          description: "Task 1",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "task-2",
          title: "Task 2",
          description: "Task 2",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const graph: DependencyGraph = {
        nodes: new Map(
          issues.map((issue) => [issue.id, issue])
        ),
        edges: [
          { from: "task-1", to: "task-2", type: "blocks" },
        ],
        indegree: new Map([
          ["task-1", 0],
          ["task-2", 1],
        ]),
        depth: new Map([
          ["task-1", 0],
          ["task-2", 0],
        ]),
        level: new Map([
          ["task-1", 0],
          ["task-2", 0],
        ]),
      };

      const queue: BeadsIssue[] = [];
      picker["decrementIndegrees"](graph, "task-1", queue);

      expect(graph.indegree.get("task-2")).toBe(0);
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe("task-2");
    });

    it("should not add to queue if indegree still > 0", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-1",
          title: "Task 1",
          description: "Task 1",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "task-2",
          title: "Task 2",
          description: "Task 2",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const graph: DependencyGraph = {
        nodes: new Map(
          issues.map((issue) => [issue.id, issue])
        ),
        edges: [
          { from: "task-1", to: "task-2", type: "blocks" },
        ],
        indegree: new Map([
          ["task-1", 0],
          ["task-2", 2],
        ]),
        depth: new Map([
          ["task-1", 0],
          ["task-2", 0],
        ]),
        level: new Map([
          ["task-1", 0],
          ["task-2", 0],
        ]),
      };

      const queue: BeadsIssue[] = [];
      picker["decrementIndegrees"](graph, "task-1", queue);

      expect(graph.indegree.get("task-2")).toBe(1);
      expect(queue).toHaveLength(0);
    });
  });

  describe("Configuration", () => {
    it("should update configuration", () => {
      const newPicker = new IssuePicker({ mode: "simple", max_issues: 3 });

      newPicker.updateConfig({ mode: "smart", max_issues: 5 });

      expect(newPicker["config"].mode).toBe("smart");
      expect(newPicker["config"].max_issues).toBe(5);
    });
  });

  describe("Singleton", () => {
    it("should create singleton instance", () => {
      const picker1 = getIssuePicker();
      const picker2 = getIssuePicker();

      expect(picker1).toBe(picker2);
    });

    it("should reset singleton instance", () => {
      const picker1 = getIssuePicker();
      resetIssuePicker();
      const picker2 = getIssuePicker();

      expect(picker1).not.toBe(picker2);
    });
  });

  describe("Coordination Filtering", () => {
    it("filters by epic affinity when configured", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "epic-a.1",
          title: "Epic A Task",
          description: "Task from Epic A",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "epic-b.1",
          title: "Epic B Task",
          description: "Task from Epic B",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const picker = new IssuePicker({
        mode: "smart",
        prefer_epic_affinity: true,
      });

      const filtered = picker["filterExcluded"](issues);

      expect(filtered).toHaveLength(2);
    });

    it("respects max_issues limit", async () => {
      const issues: BeadsIssue[] = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        description: `Task ${i}`,
        status: "open",
        priority: 1,
        issue_type: "task",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      }));

      const picker = new IssuePicker({
        mode: "simple",
        max_issues: 5,
      });

      const result = picker["simplePick"](issues);

      expect(result).toHaveLength(5);
    });

    it("handles empty issue list in smart mode", async () => {
      const issues: BeadsIssue[] = [];

      const picker = new IssuePicker({ mode: "smart" });

      const graph = await picker.buildDependencyGraph(issues);

      expect(graph.nodes.size).toBe(0);
      expect(graph.edges.length).toBe(0);
    });
  });

  describe("Dependency Edge Cases", () => {
    it("handles empty dependencies list", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-1",
          title: "Task 1",
          description: "Task 1",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const picker = new IssuePicker();

      const dependencies = await picker["getDependencies"]("task-1");

      expect(Array.isArray(dependencies)).toBe(true);
    });

    it("handles missing dependency information", async () => {
      const issues: BeadsIssue[] = [
        {
          id: "task-1",
          title: "Task 1",
          description: "Task 1",
          status: "open",
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const graph = await picker.buildDependencyGraph(issues);

      expect(graph.edges.length).toBe(0);
    });
  });

  describe("Configuration Validation", () => {
    it("handles mode switching", async () => {
      const picker = new IssuePicker({ mode: "simple", max_issues: 3 });

      expect(picker["config"].mode).toBe("simple");
      expect(picker["config"].max_issues).toBe(3);

      picker.updateConfig({ mode: "smart", max_issues: 5 });

      expect(picker["config"].mode).toBe("smart");
      expect(picker["config"].max_issues).toBe(5);
    });

    it("handles epic affinity toggle", () => {
      const picker = new IssuePicker({ prefer_epic_affinity: false });

      expect(picker["config"].prefer_epic_affinity).toBe(false);

      picker.updateConfig({ prefer_epic_affinity: true });

      expect(picker["config"].prefer_epic_affinity).toBe(true);
    });
  });
});
