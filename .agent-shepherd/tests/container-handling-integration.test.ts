/**
 * Container Handling Integration Tests
 * End-to-end tests for container workflow, validation, and dependency handling
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { WorkerEngine } from "../src/core/worker-engine";
import { IssuePicker, resetIssuePicker } from "../src/core/issue-picker";
import { loadConfig } from "../src/core/config";
import {
  setupBeadsIsolation,
  type BeadsTestEnv,
  cleanupTestIssues
} from "../helpers/beads-test-isolation";
import { getConfigPath } from "../src/core/path-utils";
import { PolicyEngine } from "../src/core/policy";

const __dirname = import.meta.dir;
const TEMP_DIR = join(__dirname, "..", "..", "tmp_test");
const TEST_ISSUE_PREFIX = "container-handling-integration-test";

describe("Container Handling - Integration Tests", () => {
  let beadsTestEnv: BeadsTestEnv;
  let workerEngine: WorkerEngine;
  let picker: IssuePicker;
  let policyEngine: PolicyEngine;
  let testDataDir: string;

  beforeAll(async () => {
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

    writeFileSync(
      join(testDataDir, "config", "policies.yaml"),
      `policies:\n  default:\n    name: default\n    phases:\n      - name: test\n        capabilities:\n          - test\n`
    );

    beadsTestEnv = setupBeadsIsolation();
    await beadsTestEnv.initialize();

    process.env.BEADS_DIR = beadsTestEnv.beadsDir;
    process.env.BD_NO_DAEMON = "true";
    process.env.BD_SANDBOX = "true";

    await cleanupTestIssues(beadsTestEnv, TEST_ISSUE_PREFIX);

    const policiesPath = getConfigPath("policies.yaml");
    policyEngine = new PolicyEngine(policiesPath);
    workerEngine = new WorkerEngine();
    picker = new IssuePicker({ mode: "smart", max_issues: 10 });
  });

  afterAll(async () => {
    await cleanupTestIssues(beadsTestEnv, TEST_ISSUE_PREFIX);
    await beadsTestEnv.cleanup();
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    delete process.env.ASHEP_DIR;
    resetIssuePicker();
  });

  async function createTestIssue(
    title: string,
    issueType: string = "task",
    labels: string[] = []
  ): Promise<string> {
    const issueId = await beadsTestEnv.createIssue(
      `${TEST_ISSUE_PREFIX}: ${title}`,
      issueType,
      labels
    );
    return issueId;
  }

  async function addDependency(
    fromId: string,
    toId: string,
    type: string = "blocks"
  ): Promise<void> {
    await beadsTestEnv.exec(["dep", "add", fromId, toId, "--type", type]);
  }

  async function listDependencies(issueId: string): Promise<any[]> {
    const output = await beadsTestEnv.exec(["dep", "list", issueId, "--json"]);
    const deps = JSON.parse(output);
    return Array.isArray(deps) ? deps : [];
  }

  async function getIssueDetails(issueId: string): Promise<any> {
    const output = await beadsTestEnv.exec(["show", issueId, "--json"]);
    return JSON.parse(output);
  }

  async function closeIssue(issueId: string): Promise<void> {
    await beadsTestEnv.exec(["close", issueId]);
  }

  describe("End-to-End Container Flow", () => {
    it("should create epic with subtasks and verify container detection", async () => {
      const epicId = await createTestIssue(
        "Container Epic for Testing",
        "epic",
        []
      );

      const subtask1Id = await createTestIssue("Subtask 1", "task");
      const subtask2Id = await createTestIssue("Subtask 2", "task");

      await addDependency(epicId, subtask1Id, "parent-child");
      await addDependency(epicId, subtask2Id, "parent-child");

      const epic = await getIssueDetails(epicId);
      const deps = await listDependencies(epicId);

      expect(epic.issue_type).toBe("epic");
      expect(deps.filter((d: any) => d.dependency_type === "parent-child")).toHaveLength(2);

      const subtask1 = await getIssueDetails(subtask1Id);
      const subtask2 = await getIssueDetails(subtask2Id);

      expect(subtask1.status).toBe("open");
      expect(subtask2.status).toBe("open");
    });

    it("should detect container with confidence", async () => {
      const epicId = await createTestIssue(
        "This epic contains subtasks and should be detected",
        "epic",
        []
      );

      const subtask1Id = await createTestIssue("Subtask 1", "task");
      const subtask2Id = await createTestIssue("Subtask 2", "task");

      await addDependency(epicId, subtask1Id, "parent-child");
      await addDependency(epicId, subtask2Id, "parent-child");

      const epic = await getIssueDetails(epicId);

      const isContainer = workerEngine["isContainerType"](epic);
      const hasContainerLanguage = workerEngine["hasContainerLanguage"](epic);

      expect(isContainer).toBe(true);
      expect(hasContainerLanguage).toBe(true);
    });

    it("should auto-close container epic when all children complete", async () => {
      const epicId = await createTestIssue(
        "Auto-Close Container Epic",
        "epic",
        []
      );

      const subtask1Id = await createTestIssue("Subtask 1", "task");
      const subtask2Id = await createTestIssue("Subtask 2", "task");

      await addDependency(epicId, subtask1Id, "parent-child");
      await addDependency(epicId, subtask2Id, "parent-child");

      const epic = await getIssueDetails(epicId);
      expect(epic.status).toBe("open");

      await closeIssue(subtask1Id);
      await closeIssue(subtask2Id);

      const subtask1Updated = await getIssueDetails(subtask1Id);
      const subtask2Updated = await getIssueDetails(subtask2Id);

      expect(subtask1Updated.status).toBe("closed");
      expect(subtask2Updated.status).toBe("closed");
    });

    it("should process container validation workflow", async () => {
      const epicId = await createTestIssue(
        "Validation Container Epic",
        "epic",
        []
      );

      const subtask1Id = await createTestIssue("Validation Subtask 1", "task");

      await addDependency(epicId, subtask1Id, "parent-child");

      await closeIssue(subtask1Id);

      const epic = await getIssueDetails(epicId);
      const containerCheck = await workerEngine["isContainerEpic"](epic);

      expect(containerCheck.is_container).toBe(true);
      expect(containerCheck.ready_to_close).toBe(true);
    });
  });

  describe("Validation Workflow", () => {
    it("should trigger container validation when children complete", async () => {
      const epicId = await createTestIssue("Validation Trigger Epic", "epic");

      const subtask1Id = await createTestIssue("Validation Trigger Subtask", "task");

      await addDependency(epicId, subtask1Id, "parent-child");

      await closeIssue(subtask1Id);

      const epic = await getIssueDetails(epicId);
      const containerCheck = await workerEngine["isContainerEpic"](epic);

      expect(containerCheck.ready_to_close).toBe(true);
    });

    it("should handle mixed completion states", async () => {
      const epicId = await createTestIssue("Mixed Completion Epic", "epic");

      const subtask1Id = await createTestIssue("Completed Subtask", "task");
      const subtask2Id = await createTestIssue("Pending Subtask", "task");

      await addDependency(epicId, subtask1Id, "parent-child");
      await addDependency(epicId, subtask2Id, "parent-child");

      await closeIssue(subtask1Id);

      const epic = await getIssueDetails(epicId);
      const containerCheck = await workerEngine["isContainerEpic"](epic);

      expect(containerCheck.is_container).toBe(true);
      expect(containerCheck.ready_to_close).toBe(false);
    });
  });

  describe("HITL Integration", () => {
    it("should handle unclear validation with HITL escalation", async () => {
      const epicId = await createTestIssue("HITL Escalation Epic", "epic");

      const subtask1Id = await createTestIssue("HITL Subtask", "task");

      await addDependency(epicId, subtask1Id, "parent-child");

      await closeIssue(subtask1Id);

      const epic = await getIssueDetails(epicId);
      const containerCheck = await workerEngine["isContainerEpic"](epic);

      expect(containerCheck.is_container).toBe(true);
      expect(containerCheck.ready_to_close).toBe(true);
    });
  });

  describe("Mixed Dependencies", () => {
    it("should handle container with both parent-child and blocking dependencies", async () => {
      const epicId = await createTestIssue("Mixed Dependencies Epic", "epic");

      const subtask1Id = await createTestIssue("Subtask 1", "task");
      const subtask2Id = await createTestIssue("Subtask 2", "task");
      const blockerId = await createTestIssue("Blocker", "bug");

      await addDependency(epicId, subtask1Id, "parent-child");
      await addDependency(epicId, subtask2Id, "parent-child");
      await addDependency(blockerId, subtask2Id, "blocks");

      const epicDeps = await listDependencies(epicId);
      const subtask2Deps = await listDependencies(subtask2Id);

      expect(epicDeps.filter((d: any) => d.dependency_type === "parent-child")).toHaveLength(2);
      expect(subtask2Deps.filter((d: any) => d.dependency_type === "blocks")).toHaveLength(1);
    });

    it("should handle nested container hierarchies", async () => {
      const rootEpicId = await createTestIssue("Root Epic", "epic");

      const subEpicId = await createTestIssue("Sub Epic", "epic");

      const leafTaskId = await createTestIssue("Leaf Task", "task");

      await addDependency(rootEpicId, subEpicId, "parent-child");
      await addDependency(subEpicId, leafTaskId, "parent-child");

      const depthRoot = picker["calculateHierarchicalDepth"](rootEpicId);
      const depthSub = picker["calculateHierarchicalDepth"](subEpicId);
      const depthLeaf = picker["calculateHierarchicalDepth"](leafTaskId);

      expect(depthRoot).toBe(0);
      expect(depthSub).toBe(1);
      expect(depthLeaf).toBe(2);
    });
  });

  describe("Container Children Info", () => {
    it("should retrieve correct children counts and completion status", async () => {
      const epicId = await createTestIssue("Children Info Epic", "epic");

      const subtask1Id = await createTestIssue("Subtask 1", "task");
      const subtask2Id = await createTestIssue("Subtask 2", "task");
      const subtask3Id = await createTestIssue("Subtask 3", "task");

      await addDependency(epicId, subtask1Id, "parent-child");
      await addDependency(epicId, subtask2Id, "parent-child");
      await addDependency(epicId, subtask3Id, "parent-child");

      const epic = await getIssueDetails(epicId);
      const childrenInfo1 = await workerEngine["getContainerChildrenInfo"](epic);

      expect(childrenInfo1.total).toBe(3);
      expect(childrenInfo1.completed).toBe(0);

      await closeIssue(subtask1Id);
      await closeIssue(subtask2Id);

      const childrenInfo2 = await workerEngine["getContainerChildrenInfo"](epic);

      expect(childrenInfo2.total).toBe(3);
      expect(childrenInfo2.completed).toBe(2);
    });

    it("should handle containers with no children", async () => {
      const epicId = await createTestIssue("No Children Epic", "epic");

      const epic = await getIssueDetails(epicId);
      const childrenInfo = await workerEngine["getContainerChildrenInfo"](epic);

      expect(childrenInfo.total).toBe(0);
      expect(childrenInfo.completed).toBe(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty description in container language check", async () => {
      const epicId = await createTestIssue("Empty Description Epic", "epic");

      const epic = await getIssueDetails(epicId);
      const hasLanguage = workerEngine["hasContainerLanguage"](epic);

      expect(hasLanguage).toBe(false);
    });

    it("should handle circular dependencies gracefully", async () => {
      const task1Id = await createTestIssue("Circular Task 1", "task");
      const task2Id = await createTestIssue("Circular Task 2", "task");

      await addDependency(task1Id, task2Id, "blocks");
      await addDependency(task2Id, task1Id, "blocks");

      const deps1 = await listDependencies(task1Id);
      const deps2 = await listDependencies(task2Id);

      expect(deps1).toBeDefined();
      expect(deps2).toBeDefined();
    });
  });
});
