/**
 * Container Handling Integration Tests
 * End-to-end tests for container workflow, validation, and policy testing
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { WorkerEngine } from "../src/core/worker-engine";
import { IssuePicker, resetIssuePicker } from "../src/core/issue-picker";
import { loadConfig } from "../src/core/config";
import { getConfigPath } from "../src/core/path-utils";
import { PolicyEngine } from "../src/core/policy";
import {
  setupBeadsIsolation,
  cleanupBeadsEnv,
  type BeadsTestEnv,
  cleanupTestIssues
} from "./helpers/beads-test-isolation";

const __dirname = import.meta.dir;
const TEMP_DIR = join(__dirname, "..", "..", "tmp_test");
const TEST_ISSUE_PREFIX = "container-integration-test";

describe("Container Handling - Integration Tests", () => {
  let beadsTestEnv: BeadsTestEnv;
  let workerEngine: WorkerEngine;
  let picker: IssuePicker;
  let testDataDir: string;

  beforeAll(async () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testDataDir = join(TEMP_DIR, `.test-container-integration-${timestamp}-${random}`);
    mkdirSync(testDataDir, { recursive: true });
    mkdirSync(join(testDataDir, ".agent-shepherd"), { recursive: true });
    mkdirSync(join(testDataDir, ".agent-shepherd", "config"), { recursive: true });
    mkdirSync(join(testDataDir, ".agent-shepherd", "data"), { recursive: true });

    process.env.ASHEP_DIR = join(testDataDir, ".agent-shepherd");
    resetIssuePicker();

    writeFileSync(
      join(testDataDir, ".agent-shepherd", "config.yaml"),
      `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  container_detection:\n    check_children: true\n    min_children: 2\n    check_description: true\n    check_dependencies: true\n  ordering:\n    strategy: hybrid\n    dependency_weight: 0.7\n`
    );

    writeFileSync(
      join(testDataDir, ".agent-shepherd", "policies.yaml"),
      `policies:\n  default:\n    name: default\n    phases:\n      - name: test\n        capabilities:\n          - test\n`
    );

    beadsTestEnv = setupBeadsIsolation();
    await beadsTestEnv.initialize();

    process.env.BEADS_DIR = beadsTestEnv.beadsDir;
    process.env.BD_NO_DAEMON = "true";
    process.env.BD_SANDBOX = "true";

    const policiesPath = getConfigPath("policies.yaml");
    const policyEngine = new PolicyEngine(policiesPath);
    workerEngine = new WorkerEngine();
    picker = new IssuePicker({ mode: "smart", max_issues: 10 });
  });

  afterAll(async () => {
    try {
      const issuesOutput = await beadsTestEnv.exec(["list", "--json"]);
      const issues = JSON.parse(issuesOutput);

      for (const issue of issues) {
        if (issue.title && issue.title.includes(TEST_ISSUE_PREFIX)) {
          await beadsTestEnv.deleteIssue(issue.id);
        }
      }

      await beadsTestEnv.cleanup();
    } catch (error) {
    } finally {
      if (existsSync(testDataDir)) {
        rmSync(testDataDir, { recursive: true, force: true });
      }
      delete process.env.ASHEP_DIR;
      resetIssuePicker();
    }
  });

  describe("Container Detection", () => {
    it("should detect container by issue type", () => {
      const epic: BeadsIssue = {
        id: "test-epic-1",
        title: "Container Type Test",
        description: "Test epic",
        issue_type: "epic",
        status: "open" as const,
        priority: 1,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const task: BeadsIssue = {
        id: "test-task-1",
        title: "Task 1",
        description: "Test task",
        issue_type: "task",
        status: "open" as const,
        priority: 1,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const isContainerType = workerEngine["isContainerType"](epic);
      const isTaskType = workerEngine["isContainerType"](task);

      expect(isContainerType).toBe(true);
      expect(isTaskType).toBe(false);
    });

    it("should detect container by description language", () => {
      const container: BeadsIssue = {
        id: "test-epic-2",
        title: "Container Language Test",
        description: "This epic contains subtasks",
        issue_type: "task",
        status: "open" as const,
        priority: 1,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const nonContainer: BeadsIssue = {
        id: "test-task-2",
        title: "Regular task",
        description: "Regular task without keywords",
        issue_type: "task",
        status: "open" as const,
        priority: 1,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const containerLanguage = workerEngine["hasContainerLanguage"](container);
      const nonContainerLanguage = workerEngine["hasContainerLanguage"](nonContainer);

      expect(containerLanguage).toBe(true);
      expect(nonContainerLanguage).toBe(false);
    });

    it("should calculate container confidence correctly", () => {
      const highConf = workerEngine["calculateContainerConfidence"](
        false,
        true,
        true,
        true
      );

      const lowConf = workerEngine["calculateContainerConfidence"](
        false,
        false,
        false,
        false
      );

      expect(highConf).toBeGreaterThan(0.8);
      expect(lowConf).toBeLessThan(0.6);
    });
  });

  describe("Hierarchy Depth Calculation", () => {
    it("should calculate depth for various issue IDs", async () => {
      const testCases = [
        { id: `test-depth-${Date.now()}`, expectedDepth: 0 },
        { id: `test-depth-${Date.now()}.1`, expectedDepth: 1 },
        { id: `test-depth-${Date.now()}.1.1`, expectedDepth: 2 },
        { id: `test-depth-${Date.now()}.1.1.1`, expectedDepth: 3 },
        { id: "no-dots-issue", expectedDepth: 0 },
      ];

      for (const { id, expectedDepth } of testCases) {
        const depth = picker["calculateHierarchicalDepth"](id);
        expect(depth).toBe(expectedDepth);
      }
    });
  });

  describe("Policy Resolution", () => {
    it("should apply level-specific policies correctly", async () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  level_policies:\n    "0":\n      mode: validation\n    "1":\n      mode: process-as-task\n    "2":\n      mode: validation\n      workflow_override: workflow-level-2\n`
      );

      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const testCases = [
        { id: `test-lvl`, expectedMode: "validation", expectedWorkflow: undefined },
        { id: `test-lvl.1`, expectedMode: "process-as-task", expectedWorkflow: undefined },
        { id: `test-lvl.1.1`, expectedMode: "validation", expectedWorkflow: "workflow-level-2" },
      ];

      for (const { id, expectedMode, expectedWorkflow } of testCases) {
        const issue = {
          id,
          title: `Test issue ${id}`,
          description: "Test issue",
          issue_type: "task",
          status: "open" as const,
          priority: 1,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        };

        const policy = picker["getContainerHandlingPolicy"](issue as any);

        expect(policy.mode).toBe(expectedMode);
        expect(policy.workflow_override).toBe(expectedWorkflow);
      }

      for (const { id, expectedMode, expectedWorkflow } of testCases) {
        const issue = {
          id,
          title: `Test issue ${id}`,
          description: "Test issue",
          issue_type: "task",
          status: "open" as const,
          priority: 1,
          created_at: "2024-01-01T00:00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        };

        const policy = picker["getContainerHandlingPolicy"](issue as any);

        expect(policy.mode).toBe(expectedMode);
        expect(policy.workflow_override).toBe(expectedWorkflow);
      }

      await beadsTestEnv.cleanup();
    });

    it("should fall back to default mode when no level policy", async () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: custom-default\n  level_policies:\n    "5":\n      mode: validation\n    "10":\n      mode: process-as-task\n`
      );

      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const testCases = [
        { id: "test-2", expectedMode: "custom-default" },
        { id: "test-3", expectedMode: "custom-default" },
      ];

      for (const { id, expectedMode } of testCases) {
        const issue = {
          id,
          title: `Test ${id}`,
          description: "Test issue",
          issue_type: "task",
          status: "open" as const,
          priority: 1,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        };

        const policy = picker["getContainerHandlingPolicy"](issue as any);
        expect(policy.mode).toBe(expectedMode);
      }
    });
  });
});
