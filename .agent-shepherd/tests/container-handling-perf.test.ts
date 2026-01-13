/**
 * Container Handling Performance Tests
 * Performance benchmarks for large hierarchies, ordering, and memory usage
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { IssuePicker, resetIssuePicker } from "../src/core/issue-picker";
import { WorkerEngine } from "../src/core/worker-engine";
import type { BeadsIssue } from "../src/core/beads";

const __dirname = import.meta.dir;
const TEMP_DIR = join(__dirname, "..", "..", "tmp_test");

describe("Container Handling - Performance Tests", () => {
  let testDataDir: string;

  beforeEach(() => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testDataDir = join(TEMP_DIR, `.test-container-perf-${timestamp}-${random}`);
    mkdirSync(testDataDir, { recursive: true });
    mkdirSync(join(testDataDir, "config"), { recursive: true });
    mkdirSync(join(testDataDir, "data"), { recursive: true });

    process.env.ASHEP_DIR = testDataDir;
    resetIssuePicker();

    writeFileSync(
      join(testDataDir, "config", "config.yaml"),
      `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  container_detection:\n    check_children: true\n    min_children: 2\n    check_description: true\n    check_dependencies: true\n  ordering:\n    strategy: hybrid\n    dependency_weight: 0.7\n`
    );
  });

  afterEach(() => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    delete process.env.ASHEP_DIR;
    resetIssuePicker();
  });

  describe("Large Hierarchies", () => {
    it("should handle 100+ issue trees efficiently", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 150 });

      const issues: BeadsIssue[] = [];
      const rootEpic = { id: "perf-epic-1", title: "Root Epic", description: "Root container", status: "open" as const, priority: 1, issue_type: "epic", created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" };
      issues.push(rootEpic);

      for (let i = 1; i <= 100; i++) {
        issues.push({
          id: `perf-epic-1.${i}`,
          title: `Subtask ${i}`,
          description: `Subtask ${i}`,
          status: "open" as const,
          priority: (i % 5) + 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        });
      }

      const startTime = Date.now();
      const depth = picker["calculateHierarchicalDepth"]("perf-epic-1.50");
      const endTime = Date.now();

      expect(depth).toBe(1);
      expect(endTime - startTime).toBeLessThan(100);
    });

    it("should calculate depth for deep hierarchies efficiently", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const deepIds = [];
      for (let i = 0; i < 10; i++) {
        const id = `perf-deep-${Array(i + 1).fill("1").join(".")}`;
        deepIds.push(id);
      }

      const startTime = Date.now();
      const depths = deepIds.map(id => picker["calculateHierarchicalDepth"](id));
      const endTime = Date.now();

      expect(depths).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(endTime - startTime).toBeLessThan(50);
    });

    it("should build dependency graph for large hierarchies efficiently", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 100 });

      const issues: BeadsIssue[] = [];
      for (let i = 0; i < 50; i++) {
        issues.push({
          id: `perf-graph-${i}`,
          title: `Task ${i}`,
          description: `Task ${i}`,
          status: "open" as const,
          priority: (i % 5) + 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        });
      }

      const startTime = Date.now();
      const graph = await picker["buildDependencyGraph"](issues);
      const endTime = Date.now();

      expect(graph.nodes.size).toBe(50);
      expect(graph.indegree.size).toBe(50);
      expect(graph.depth.size).toBe(50);
      expect(endTime - startTime).toBeLessThan(500);
    });

    it("should handle 500+ issue trees efficiently", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 600 });

      const issues: BeadsIssue[] = [];
      const rootEpic = { id: "perf-epic-2", title: "Large Root Epic", description: "Large root container", status: "open" as const, priority: 1, issue_type: "epic", created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" };
      issues.push(rootEpic);

      for (let i = 1; i <= 500; i++) {
        issues.push({
          id: `perf-epic-2.${i}`,
          title: `Subtask ${i}`,
          description: `Subtask ${i}`,
          status: "open" as const,
          priority: (i % 5) + 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        });
      }

      const startTime = Date.now();
      const depths = [
        picker["calculateHierarchicalDepth"]("perf-epic-2.1"),
        picker["calculateHierarchicalDepth"]("perf-epic-2.50"),
        picker["calculateHierarchicalDepth"]("perf-epic-2.250"),
        picker["calculateHierarchicalDepth"]("perf-epic-2.500"),
      ];
      const endTime = Date.now();

      expect(depths).toEqual([1, 1, 1, 1]);
      expect(endTime - startTime).toBeLessThan(200);
    });
  });

  describe("Ordering Performance", () => {
    it("should sort 100+ issues with hybrid ordering efficiently", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 100 });

      const issues: BeadsIssue[] = [];
      for (let i = 0; i < 100; i++) {
        issues.push({
          id: `perf-order-${i}`,
          title: `Task ${i}`,
          description: `Task ${i}`,
          status: "open" as const,
          priority: (i % 10) + 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        });
      }

      const graph = await picker["buildDependencyGraph"](issues);

      const startTime = Date.now();
      const ordered = picker["applyHybridOrdering"](graph);
      const endTime = Date.now();

      expect(ordered).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it("should topologically sort large dependency graphs efficiently", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 100 });

      const issues: BeadsIssue[] = [];
      for (let i = 0; i < 100; i++) {
        issues.push({
          id: `perf-topo-${i}`,
          title: `Task ${i}`,
          description: `Task ${i}`,
          status: "open" as const,
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        });
      }

      const graph = await picker["buildDependencyGraph"](issues);

      const startTime = Date.now();
      const ordered = picker["applyDependencyOrdering"](graph);
      const endTime = Date.now();

      expect(ordered).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(500);
    });

    it("should sort by hierarchy for large sets efficiently", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 100 });

      const issues: BeadsIssue[] = [];
      for (let i = 0; i < 100; i++) {
        const depth = Math.floor(Math.random() * 5);
        const id = depth === 0 ? `perf-hier-${i}` : `perf-hier-${Math.floor(Math.random() * 10)}.${i}`;
        issues.push({
          id,
          title: `Task ${i}`,
          description: `Task ${i}`,
          status: "open" as const,
          priority: (i % 10) + 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        });
      }

      const graph = await picker["buildDependencyGraph"](issues);

      const startTime = Date.now();
      const ordered = picker["applyHierarchyOrdering"](graph);
      const endTime = Date.now();

      expect(ordered).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(100);
    });

    it("should calculate dependency scores efficiently for large graphs", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 200 });

      const issues: BeadsIssue[] = [];
      for (let i = 0; i < 100; i++) {
        issues.push({
          id: `perf-dep-score-${i}`,
          title: `Task ${i}`,
          description: `Task ${i}`,
          status: i % 3 === 0 ? "closed" as const : "open" as const,
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        });
      }

      const graph = await picker["buildDependencyGraph"](issues);

      const startTime = Date.now();
      const scores = issues.slice(0, 20).map(issue =>
        picker["calculateDependencyCompleteness"](issue.id, graph)
      );
      const endTime = Date.now();

      expect(scores).toHaveLength(20);
      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe("Memory Usage", () => {
    it("should not leak memory when calculating depths repeatedly", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const testIds = Array.from({ length: 1000 }, (_, i) =>
        `perf-memory-${Math.floor(i / 10)}.${i % 10}`
      );

      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 100; i++) {
        for (const id of testIds) {
          picker["calculateHierarchicalDepth"](id);
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    it("should handle building graphs for large sets without memory leaks", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 100 });

      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 10; i++) {
        const issues: BeadsIssue[] = [];
        for (let j = 0; j < 100; j++) {
          issues.push({
            id: `perf-graph-iter-${i}-${j}`,
            title: `Task ${j}`,
            description: `Task ${j}`,
            status: "open" as const,
            priority: 1,
            issue_type: "task",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          });
        }

        await picker["buildDependencyGraph"](issues);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it("should not leak memory when applying ordering repeatedly", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 100 });

      const issues: BeadsIssue[] = [];
      for (let i = 0; i < 50; i++) {
        issues.push({
          id: `perf-order-mem-${i}`,
          title: `Task ${i}`,
          description: `Task ${i}`,
          status: "open" as const,
          priority: (i % 10) + 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        });
      }

      const graph = await picker["buildDependencyGraph"](issues);

      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 50; i++) {
        picker["applyHybridOrdering"](graph);
        picker["applyDependencyOrdering"](graph);
        picker["applyHierarchyOrdering"](graph);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024);
    });

    it("should handle deep hierarchies without memory issues", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const deepId = "perf-deep-mem." + Array(20).fill("1").join(".");

      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 1000; i++) {
        picker["calculateHierarchicalDepth"](deepId);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });
  });

  describe("Container Detection Performance", () => {
    it("should calculate container confidence efficiently", async () => {
      const workerEngine = new WorkerEngine();

      const testCases = [];
      for (let i = 0; i < 100; i++) {
        testCases.push({
          hasChildren: i % 3 === 0,
          hasContainerType: i % 2 === 0,
          hasContainerLanguage: i % 4 === 0,
          hasContainerStructure: i % 5 === 0,
        });
      }

      const startTime = Date.now();
      const confidences = testCases.map(tc =>
        workerEngine["calculateContainerConfidence"](
          tc.hasChildren,
          tc.hasContainerType,
          tc.hasContainerLanguage,
          tc.hasContainerStructure
        )
      );
      const endTime = Date.now();

      expect(confidences).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(100);
    });

    it("should check container type efficiently for large sets", async () => {
      const workerEngine = new WorkerEngine();

      const issues: BeadsIssue[] = [];
      const containerTypes = ["epic", "milestone", "phase", "group"];
      const taskTypes = ["task", "bug", "feature", "chore"];

      for (let i = 0; i < 1000; i++) {
        const isContainer = i % 2 === 0;
        issues.push({
          id: `perf-cont-type-${i}`,
          title: `Issue ${i}`,
          description: `Issue ${i}`,
          status: "open" as const,
          priority: 1,
          issue_type: isContainer ? (containerTypes[i % 4] as any) : (taskTypes[i % 4] as any),
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        });
      }

      const startTime = Date.now();
      const results = issues.map(issue => workerEngine["isContainerType"](issue));
      const endTime = Date.now();

      expect(results).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(500);
    });

    it("should check container language efficiently for large sets", async () => {
      const workerEngine = new WorkerEngine();

      const containerPhrases = [
        "contains subtasks",
        "work in this epic",
        "this epic contains",
        "phase of the project",
        "group related tasks",
      ];

      const nonContainerPhrases = [
        "implement feature",
        "fix bug in code",
        "write tests",
        "update documentation",
        "refactor module",
      ];

      const issues: BeadsIssue[] = [];
      for (let i = 0; i < 1000; i++) {
        const isContainer = i % 2 === 0;
        const phrase = isContainer
          ? containerPhrases[i % containerPhrases.length]
          : nonContainerPhrases[i % nonContainerPhrases.length];

        issues.push({
          id: `perf-cont-lang-${i}`,
          title: `Issue ${i}`,
          description: phrase,
          status: "open" as const,
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        });
      }

      const startTime = Date.now();
      const results = issues.map(issue => workerEngine["hasContainerLanguage"](issue));
      const endTime = Date.now();

      expect(results).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(500);
    });
  });

  describe("Policy Resolution Performance", () => {
    it("should resolve container handling policy efficiently", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const issueIds = [];
      for (let i = 0; i < 10; i++) {
        issueIds.push(`perf-policy-${i}`);
        issueIds.push(`perf-policy-${i}.${i + 1}`);
        issueIds.push(`perf-policy-${i}.${i + 1}.${i + 2}`);
      }

      const startTime = Date.now();
      const policies = issueIds.map(id =>
        picker["getContainerHandlingPolicy"]({ id } as BeadsIssue)
      );
      const endTime = Date.now();

      expect(policies).toHaveLength(30);
      expect(endTime - startTime).toBeLessThan(500);
    });

    it("should handle complex level policies efficiently", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const issueIds = [];
      for (let level = 0; level < 5; level++) {
        for (let i = 0; i < 20; i++) {
          const parts = Array(level + 1).fill(i).join(".");
          issueIds.push(`perf-complex-policy.${parts}`);
        }
      }

      const startTime = Date.now();
      const policies = issueIds.map(id =>
        picker["getContainerHandlingPolicy"]({ id } as BeadsIssue)
      );
      const endTime = Date.now();

      expect(policies).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});
