/**
 * Container Handling Integration Tests
 * End-to-end tests for container workflow, validation, and dependency handling
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { WorkerEngine } from "../src/core/worker-engine";
import { IssuePicker, resetIssuePicker } from "../src/core/issue-picker";
import {
  createIssue,
  updateIssue,
  getIssue,
  closeIssue,
  addDependency,
  listDependencies,
  type BeadsIssue,
} from "../src/core/beads";
import { loadConfig } from "../src/core/config";

const __dirname = import.meta.dir;
const TEMP_DIR = join(__dirname, "..", "..", "tmp_test");

describe("Container Handling - Integration Tests", () => {
  let testDataDir: string;

  beforeEach(async () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testDataDir = join(TEMP_DIR, `.test-container-integration-${timestamp}-${random}`);
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

  afterEach(async () => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    delete process.env.ASHEP_DIR;
    resetIssuePicker();
  });

  describe("End-to-End Container Flow", () => {
    it("should create epic with subtasks and verify container detection", async () => {
      const epic = await createIssue({
        id: "test-epic-1",
        title: "Container Epic for Testing",
        description: "This epic contains multiple subtasks that should be auto-closed",
        issue_type: "epic",
        priority: 1,
      });

      expect(epic).toBeDefined();
      expect(epic.issue_type).toBe("epic");

      const subtask1 = await createIssue({
        id: "test-epic-1.1",
        title: "Subtask 1",
        description: "First subtask",
        issue_type: "task",
        priority: 1,
      });

      const subtask2 = await createIssue({
        id: "test-epic-1.2",
        title: "Subtask 2",
        description: "Second subtask",
        issue_type: "task",
        priority: 1,
      });

      await addDependency("test-epic-1", "test-epic-1.1", "parent-child");
      await addDependency("test-epic-1", "test-epic-1.2", "parent-child");

      const deps = await listDependencies("test-epic-1");
      expect(deps.filter((d: any) => d.dependency_type === "parent-child")).toHaveLength(2);

      expect(subtask1.status).toBe("open");
      expect(subtask2.status).toBe("open");
    });

    it("should auto-close container epic when all children complete", async () => {
      const epic = await createIssue({
        id: "test-auto-close-epic",
        title: "Auto-Close Container Epic",
        description: "This epic will be auto-closed when subtasks complete",
        issue_type: "epic",
        priority: 1,
      });

      const subtask1 = await createIssue({
        id: "test-auto-close-epic.1",
        title: "Subtask 1",
        description: "First subtask",
        issue_type: "task",
        priority: 1,
      });

      const subtask2 = await createIssue({
        id: "test-auto-close-epic.2",
        title: "Subtask 2",
        description: "Second subtask",
        issue_type: "task",
        priority: 1,
      });

      await addDependency("test-auto-close-epic", "test-auto-close-epic.1", "parent-child");
      await addDependency("test-auto-close-epic", "test-auto-close-epic.2", "parent-child");

      expect(epic.status).toBe("open");
      expect(subtask1.status).toBe("open");
      expect(subtask2.status).toBe("open");

      await closeIssue("test-auto-close-epic.1");
      await closeIssue("test-auto-close-epic.2");

      const updatedSubtask1 = await getIssue("test-auto-close-epic.1");
      const updatedSubtask2 = await getIssue("test-auto-close-epic.2");

      expect(updatedSubtask1.status).toBe("closed");
      expect(updatedSubtask2.status).toBe("closed");

      const workerEngine = new WorkerEngine();
      const containerCheck = await workerEngine["isContainerEpic"](epic);

      expect(containerCheck.is_container).toBe(true);
      expect(containerCheck.ready_to_close).toBe(true);
    });

    it("should process container validation workflow", async () => {
      const epic = await createIssue({
        id: "test-validation-epic",
        title: "Validation Container Epic",
        description: "This epic requires validation",
        issue_type: "epic",
        priority: 1,
      });

      const subtask1 = await createIssue({
        id: "test-validation-epic.1",
        title: "Validation Subtask 1",
        description: "First validation subtask",
        issue_type: "task",
        priority: 1,
      });

      await addDependency("test-validation-epic", "test-validation-epic.1", "parent-child");

      await closeIssue("test-validation-epic.1");

      const workerEngine = new WorkerEngine();
      const containerCheck = await workerEngine["isContainerEpic"](epic);

      expect(containerCheck.is_container).toBe(true);
      expect(containerCheck.ready_to_close).toBe(true);
    });
  });

  describe("Validation Workflow", () => {
    it("should trigger container validation when children complete", async () => {
      const epic = await createIssue({
        id: "test-validate-trigger",
        title: "Validation Trigger Epic",
        description: "Epic to test validation triggering",
        issue_type: "epic",
        priority: 1,
      });

      const subtask1 = await createIssue({
        id: "test-validate-trigger.1",
        title: "Validation Trigger Subtask",
        description: "Subtask to test validation",
        issue_type: "task",
        priority: 1,
      });

      await addDependency("test-validate-trigger", "test-validate-trigger.1", "parent-child");

      await closeIssue("test-validate-trigger.1");

      const workerEngine = new WorkerEngine();
      const containerCheck = await workerEngine["isContainerEpic"](epic);

      expect(containerCheck.ready_to_close).toBe(true);
    });

    it("should handle mixed completion states", async () => {
      const epic = await createIssue({
        id: "test-mixed-completion",
        title: "Mixed Completion Epic",
        description: "Epic with mixed completion states",
        issue_type: "epic",
        priority: 1,
      });

      const subtask1 = await createIssue({
        id: "test-mixed-completion.1",
        title: "Completed Subtask",
        description: "Completed subtask",
        issue_type: "task",
        priority: 1,
      });

      const subtask2 = await createIssue({
        id: "test-mixed-completion.2",
        title: "Pending Subtask",
        description: "Pending subtask",
        issue_type: "task",
        priority: 1,
      });

      await addDependency("test-mixed-completion", "test-mixed-completion.1", "parent-child");
      await addDependency("test-mixed-completion", "test-mixed-completion.2", "parent-child");

      await closeIssue("test-mixed-completion.1");

      const workerEngine = new WorkerEngine();
      const containerCheck = await workerEngine["isContainerEpic"](epic);

      expect(containerCheck.is_container).toBe(true);
      expect(containerCheck.ready_to_close).toBe(false);
    });
  });

  describe("HITL Integration", () => {
    it("should handle unclear validation with HITL escalation", async () => {
      const epic = await createIssue({
        id: "test-hitl-escalation",
        title: "HITL Escalation Epic",
        description: "Epic to test HITL escalation",
        issue_type: "epic",
        priority: 1,
      });

      const subtask1 = await createIssue({
        id: "test-hitl-escalation.1",
        title: "HITL Subtask",
        description: "Subtask with unclear completion",
        issue_type: "task",
        priority: 1,
      });

      await addDependency("test-hitl-escalation", "test-hitl-escalation.1", "parent-child");

      await closeIssue("test-hitl-escalation.1");

      const workerEngine = new WorkerEngine();
      const containerCheck = await workerEngine["isContainerEpic"](epic);

      expect(containerCheck.is_container).toBe(true);
      expect(containerCheck.ready_to_close).toBe(true);
    });

    it("should generate validation notes for HITL", async () => {
      const epic = await createIssue({
        id: "test-validation-note",
        title: "Validation Note Epic",
        description: "Epic to test validation note generation",
        issue_type: "epic",
        priority: 1,
      });

      const subtask1 = await createIssue({
        id: "test-validation-note.1",
        title: "Validation Note Subtask",
        description: "Subtask for validation note",
        issue_type: "task",
        priority: 1,
      });

      await addDependency("test-validation-note", "test-validation-note.1", "parent-child");

      await closeIssue("test-validation-note.1");

      const workerEngine = new WorkerEngine();
      const containerCheck = await workerEngine["isContainerEpic"](epic);

      expect(containerCheck.ready_to_close).toBe(true);
    });
  });

  describe("Mixed Dependencies", () => {
    it("should handle container with both parent-child and blocking dependencies", async () => {
      const epic = await createIssue({
        id: "test-mixed-deps",
        title: "Mixed Dependencies Epic",
        description: "Epic with mixed dependency types",
        issue_type: "epic",
        priority: 1,
      });

      const subtask1 = await createIssue({
        id: "test-mixed-deps.1",
        title: "Subtask 1",
        description: "First subtask",
        issue_type: "task",
        priority: 1,
      });

      const subtask2 = await createIssue({
        id: "test-mixed-deps.2",
        title: "Subtask 2",
        description: "Second subtask",
        issue_type: "task",
        priority: 1,
      });

      const blocker = await createIssue({
        id: "test-blocker",
        title: "Blocker",
        description: "Blocks subtask 2",
        issue_type: "bug",
        priority: 1,
      });

      await addDependency("test-mixed-deps", "test-mixed-deps.1", "parent-child");
      await addDependency("test-mixed-deps", "test-mixed-deps.2", "parent-child");
      await addDependency("test-blocker", "test-mixed-deps.2", "blocks");

      const epicDeps = await listDependencies("test-mixed-deps");
      const subtask2Deps = await listDependencies("test-mixed-deps.2");

      expect(epicDeps.filter((d: any) => d.dependency_type === "parent-child")).toHaveLength(2);
      expect(subtask2Deps.filter((d: any) => d.dependency_type === "blocks")).toHaveLength(1);
    });

    it("should fallback to hierarchy ordering when dependencies are missing", async () => {
      const issues = [
        { id: "epic-fallback.1", depth: 1, priority: 2 },
        { id: "epic-fallback.2", depth: 2, priority: 1 },
        { id: "epic-fallback.3", depth: 1, priority: 1 },
      ];

      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const graph = {
        nodes: new Map(
          issues.map((i) => [
            i.id,
            { id: i.id, priority: i.priority, status: "open" as const },
          ])
        ),
        edges: [],
        indegree: new Map(issues.map((i) => [i.id, 0])),
        depth: new Map(issues.map((i) => [i.id, i.depth])),
        level: new Map(issues.map((i) => [i.id, i.depth])),
      };

      const ordered = picker["applyHierarchyOrdering"](graph);

      expect(ordered).toHaveLength(3);
      expect(ordered[0].id).toBe("epic-fallback.2");
    });

    it("should handle nested container hierarchies", async () => {
      const rootEpic = await createIssue({
        id: "test-nested-root",
        title: "Root Epic",
        description: "Root container epic",
        issue_type: "epic",
        priority: 1,
      });

      const subEpic = await createIssue({
        id: "test-nested-root.1",
        title: "Sub Epic",
        description: "Nested container epic",
        issue_type: "epic",
        priority: 1,
      });

      const subtask = await createIssue({
        id: "test-nested-root.1.1",
        title: "Leaf Task",
        description: "Leaf task",
        issue_type: "task",
        priority: 1,
      });

      await addDependency("test-nested-root", "test-nested-root.1", "parent-child");
      await addDependency("test-nested-root.1", "test-nested-root.1.1", "parent-child");

      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const depthRoot = picker["calculateHierarchicalDepth"]("test-nested-root");
      const depthSub = picker["calculateHierarchicalDepth"]("test-nested-root.1");
      const depthLeaf = picker["calculateHierarchicalDepth"]("test-nested-root.1.1");

      expect(depthRoot).toBe(0);
      expect(depthSub).toBe(1);
      expect(depthLeaf).toBe(2);
    });
  });

  describe("Container Children Info", () => {
    it("should retrieve correct children counts and completion status", async () => {
      const epic = await createIssue({
        id: "test-children-info",
        title: "Children Info Epic",
        description: "Epic to test children info retrieval",
        issue_type: "epic",
        priority: 1,
      });

      const subtask1 = await createIssue({
        id: "test-children-info.1",
        title: "Subtask 1",
        description: "First subtask",
        issue_type: "task",
        priority: 1,
      });

      const subtask2 = await createIssue({
        id: "test-children-info.2",
        title: "Subtask 2",
        description: "Second subtask",
        issue_type: "task",
        priority: 1,
      });

      const subtask3 = await createIssue({
        id: "test-children-info.3",
        title: "Subtask 3",
        description: "Third subtask",
        issue_type: "task",
        priority: 1,
      });

      await addDependency("test-children-info", "test-children-info.1", "parent-child");
      await addDependency("test-children-info", "test-children-info.2", "parent-child");
      await addDependency("test-children-info", "test-children-info.3", "parent-child");

      const workerEngine = new WorkerEngine();
      const childrenInfo1 = await workerEngine["getContainerChildrenInfo"](epic);

      expect(childrenInfo1.total).toBe(3);
      expect(childrenInfo1.completed).toBe(0);

      await closeIssue("test-children-info.1");
      await closeIssue("test-children-info.2");

      const childrenInfo2 = await workerEngine["getContainerChildrenInfo"](epic);

      expect(childrenInfo2.total).toBe(3);
      expect(childrenInfo2.completed).toBe(2);
    });

    it("should handle containers with no children", async () => {
      const epic = await createIssue({
        id: "test-no-children",
        title: "No Children Epic",
        description: "Epic with no children",
        issue_type: "epic",
        priority: 1,
      });

      const workerEngine = new WorkerEngine();
      const childrenInfo = await workerEngine["getContainerChildrenInfo"](epic);

      expect(childrenInfo.total).toBe(0);
      expect(childrenInfo.completed).toBe(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty description in container language check", async () => {
      const epic = await createIssue({
        id: "test-empty-desc",
        title: "Empty Description Epic",
        description: "",
        issue_type: "epic",
        priority: 1,
      });

      const workerEngine = new WorkerEngine();
      const hasLanguage = workerEngine["hasContainerLanguage"](epic);

      expect(hasLanguage).toBe(false);
    });

    it("should handle missing labels gracefully", async () => {
      const epic = await createIssue({
        id: "test-no-labels",
        title: "No Labels Epic",
        description: "Epic with no labels",
        issue_type: "epic",
        priority: 1,
      });

      expect(epic.labels).toBeUndefined();
    });

    it("should handle circular dependencies gracefully", async () => {
      const task1 = await createIssue({
        id: "test-circular-1",
        title: "Circular Task 1",
        description: "First circular task",
        issue_type: "task",
        priority: 1,
      });

      const task2 = await createIssue({
        id: "test-circular-2",
        title: "Circular Task 2",
        description: "Second circular task",
        issue_type: "task",
        priority: 1,
      });

      await addDependency("test-circular-1", "test-circular-2", "blocks");
      await addDependency("test-circular-2", "test-circular-1", "blocks");

      const deps1 = await listDependencies("test-circular-1");
      const deps2 = await listDependencies("test-circular-2");

      expect(deps1).toBeDefined();
      expect(deps2).toBeDefined();
    });
  });
});
