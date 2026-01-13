/**
 * Container Handling Performance Tests
 * Performance benchmarks for algorithms, depth calculation, and memory usage
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
    mkdirSync(join(testDataDir, ".agent-shepherd"), { recursive: true });
    mkdirSync(join(testDataDir, ".agent-shepherd", "config"), { recursive: true });
    mkdirSync(join(testDataDir, ".agent-shepherd", "data"), { recursive: true });

    process.env.ASHEP_DIR = testDataDir;
    resetIssuePicker();

    writeFileSync(
      join(testDataDir, ".agent-shepherd", "config", "config.yaml"),
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
    it("should calculate depth for 100+ issue IDs efficiently", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 150 });

      const issueIds = [];
      for (let i = 0; i <= 100; i++) {
        issueIds.push(`perf-epic-2.${i}`);
      }

      const startTime = Date.now();
      const depths = issueIds.map(id => picker["calculateHierarchicalDepth"](id));
      const endTime = Date.now();

      expect(depths).toHaveLength(101);
      expect(depths[0]).toBe(0);
      expect(depths[100]).toBe(1);
      expect(endTime - startTime).toBeLessThan(200);
    });
  });

  describe("Algorithm Performance", () => {
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
      expect(confidences.every(c => c >= 0 && c <= 1)).toBe(true);
      expect(endTime - startTime).toBeLessThan(100);
    });

    it("should apply hybrid ordering efficiently", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 100 });

      const nodes = new Map<string, BeadsIssue>();
      const edges: any[] = [];
      const indegree = new Map<string, number>();
      const depth = new Map<string, number>();
      const level = new Map<string, number>();

      for (let i = 0; i < 100; i++) {
        const issue: BeadsIssue = {
          id: `perf-order-${i}`,
          title: `Task ${i}`,
          description: `Task ${i}`,
          status: "open" as const,
          priority: (i % 10) + 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        };
        nodes.set(issue.id, issue);
        indegree.set(issue.id, 0);
        depth.set(issue.id, Math.floor(i / 10));
        level.set(issue.id, Math.floor(i / 10));
        level.set(issue.id, Math.floor(i / 10));
      }

      const graph = { nodes, edges, indegree, depth, level };

      const startTime = Date.now();
      const ordered = picker["applyHybridOrdering"](graph);
      const endTime = Date.now();

      expect(ordered).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it("should apply dependency ordering efficiently", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 100 });

       const nodes = new Map<string, BeadsIssue>();
      const edges: any[] = [];
      const indegree = new Map<string, number>();
      const depthMap = new Map<string, number>();
      const level = new Map<string, number>();

      for (let i = 0; i < 100; i++) {
        const issueDepth = Math.floor(Math.random() * 5);
        const issue: BeadsIssue = {
          id: `perf-dep-order-${i}`,
          title: `Task ${i}`,
          description: `Task ${i}`,
          status: "open" as const,
          priority: 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00:00Z",
          updated_at: "2024-01-01T00:00:00:00Z",
        };
        nodes.set(issue.id, issue);
        indegree.set(issue.id, 0);
        depthMap.set(issue.id, issueDepth);
        level.set(issue.id, issueDepth);
      }

      const graph = { nodes, edges, indegree, depth: depthMap, level };

      const startTime = Date.now();
      const ordered = picker["applyDependencyOrdering"](graph);
      const endTime = Date.now();

      expect(ordered).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(500);
    });

    it("should apply hierarchy ordering efficiently", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 100 });

      const nodes = new Map<string, BeadsIssue>();
      const edges: any[] = [];
      const indegree = new Map<string, number>();
      const depth = new Map<string, number>();
      const level = new Map<string, number>();

      for (let i = 0; i < 100; i++) {
        const issueDepth = Math.floor(Math.random() * 5);
        const issue: BeadsIssue = {
          id: `perf-hier-order-${i}`,
          title: `Task ${i}`,
          description: `Task ${i}`,
          status: "open" as const,
          priority: (i % 10) + 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00:00Z",
          updated_at: "2024-01-01T00:00:00:00Z",
        };
        nodes.set(issue.id, issue);
        indegree.set(issue.id, 0);
        depthMap.set(issue.id, issueDepth);
        level.set(issue.id, issueDepth);
      }

      const graph = { nodes, edges, indegree, depth, level };

      const startTime = Date.now();
      const ordered = picker["applyHierarchyOrdering"](graph);
      const endTime = Date.now();

      expect(ordered).toHaveLength(100);
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

    it("should handle ordering operations without memory leaks", async () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 100 });

      const nodes = new Map<string, BeadsIssue>();
      const edges: any[] = [];
      const indegree = new Map<string, number>();
      const depth = new Map<string, number>();
      const level = new Map<string, number>();

      for (let i = 0; i < 50; i++) {
        const issue: BeadsIssue = {
          id: `perf-order-mem-${i}`,
          title: `Task ${i}`,
          description: `Task ${i}`,
          status: "open" as const,
          priority: (i % 10) + 1,
          issue_type: "task",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00Z",
        };
        nodes.set(issue.id, issue);
        indegree.set(issue.id, 0);
        depth.set(issue.id, 0);
        level.set(issue.id, 0);
      }

      const graph = { nodes, edges, indegree, depth, level };

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

    it("should handle deep hierarchy calculations without memory issues", async () => {
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
    it("should check container type efficiently", async () => {
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
          updated_at: "2024-01-01T00:00Z",
        });
      }

      const startTime = Date.now();
      const results = issues.map(issue => workerEngine["isContainerType"](issue));
      const endTime = Date.now();

      expect(results).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(500);
    });

    it("should check container language efficiently", async () => {
      const workerEngine = new WorkerEngine();

      const containerPhrases = [
        "contains subtasks",
        "work in this epic",
        "this epic contains",
        "phase of project",
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
});
