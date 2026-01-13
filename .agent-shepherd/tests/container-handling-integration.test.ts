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
  type BeadsTestEnv,
  cleanupTestIssues
} from "../helpers/beads-test-isolation";

interface BeadsTestEnv {
  tempDir: string;
  beadsDir: string;
  exec(args: string[]): Promise<string>;
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
  createIssue(title: string, issueType?: string, labels?: string[]): Promise<string>;
  deleteIssue(issueId: string): Promise<void>;
}

function setupBeadsIsolation(): BeadsTestEnv {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const tempDir = join(__dirname, '..', 'tmp_test', 'beads-isolation');
  const beadsDir = join(tempDir, '.beads');

  async function execBeadsCommand(args: string[]): Promise<string> {
    const proc = Bun.spawn(["bd", ...args], {
      cwd: tempDir,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        BEADS_DIR: beadsDir,
        PATH: process.env.PATH,
        BD_NO_DAEMON: "true",
        BD_SANDBOX: "true",
      },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const error = await new Response(proc.stderr).text();
      throw new Error(`Beads command failed: ${error}\nCommand: bd ${args.join(' ')}\nCWD: ${tempDir}\nBEADS_DIR: ${beadsDir}`);
    }

    return output;
  }

  const env: BeadsTestEnv = {
    tempDir,
    beadsDir,

    async exec(args: string[]) {
      return execBeadsCommand(args);
    },

    async initialize() {
      mkdirSync(tempDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      const initArgs = ["init", "--prefix", "test-"];

      try {
        await execBeadsCommand(initArgs);
      } catch (error) {
        throw new Error(`Failed to initialize isolated Beads database: ${error}`);
      }
    },

    async cleanup() {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },

    async createIssue(title: string, issueType: string = "task", labels: string[] = []): Promise<string> {
      const args = ["create", "--type", issueType, "--title", title];

      for (const label of labels) {
        args.push("--labels", label);
      }

      const output = await execBeadsCommand(args);
      const issueId = output.match(/Created issue: ([^\s\n]+)/)?.[1];

      if (!issueId) {
        throw new Error(`Failed to create test issue: ${title}. Output: ${output}`);
      }

      return issueId;
    },

    async deleteIssue(issueId: string): Promise<void> {
      await execBeadsCommand(["delete", issueId]);
    },
  };

  return env;
}

async function cleanupTestIssues(env: BeadsTestEnv, prefix: string): Promise<void> {
  try {
    const output = await env.exec(["list", "--json"]);
    const issues = JSON.parse(output);

    for (const issue of issues) {
      if (issue.title && issue.title.includes(prefix)) {
        await env.deleteIssue(issue.id);
      }
    }
  } catch (error) {
    console.warn(`Failed to cleanup test issues with prefix "${prefix}":`, error);
  }
}

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

    const policiesPath = getConfigPath("policies.yaml");
    const policyEngine = new PolicyEngine(policiesPath);
    workerEngine = new WorkerEngine();
    picker = new IssuePicker({ mode: "smart", max_issues: 10 });
  });

  afterAll(async () => {
    const issuesOutput = await beadsTestEnv.exec(["list", "--json"]);
    const issues = JSON.parse(issuesOutput);

    for (const issue of issues) {
      if (issue.title && issue.title.includes(TEST_ISSUE_PREFIX)) {
        await beadsTestEnv.deleteIssue(issue.id);
      }
    }

    await beadsTestEnv.cleanup();
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    delete process.env.ASHEP_DIR;
    resetIssuePicker();
  });

  describe("Container Detection", () => {
    it("should detect container by issue type", async () => {
      const epicId = await beadsTestEnv.createIssue("Container Type Test", "epic");
      const task1Id = await beadsTestEnv.createIssue("Task 1", "task");

      const epic = JSON.parse(await beadsTestEnv.exec(["show", epicId, "--json"]));
      const task1 = JSON.parse(await beadsTestEnv.exec(["show", task1Id, "--json"]));

      const isContainerType = workerEngine["isContainerType"](epic);
      const isTaskType = workerEngine["isContainerType"](task1);

      expect(isContainerType).toBe(true);
      expect(isTaskType).toBe(false);

      await beadsTestEnv.deleteIssue(task1Id);
      await beadsTestEnv.deleteIssue(epicId);
    });

    it("should detect container by description language", async () => {
      const containerId = await beadsTestEnv.createIssue("This epic contains subtasks", "epic");
      const nonContainerId = await beadsTestEnv.createIssue("Regular task without keywords", "task");

      const container = JSON.parse(await beadsTestEnv.exec(["show", containerId, "--json"]));
      const nonContainer = JSON.parse(await beadsTestEnv.exec(["show", nonContainerId, "--json"]));

      const containerLanguage = workerEngine["hasContainerLanguage"](container);
      const nonContainerLanguage = workerEngine["hasContainerLanguage"](nonContainer);

      expect(containerLanguage).toBe(true);
      expect(nonContainerLanguage).toBe(false);

      await beadsTestEnv.deleteIssue(nonContainerId);
      await beadsTestEnv.deleteIssue(containerId);
    });

    it("should calculate container confidence correctly", async () => {
      const highConfidenceId = await beadsTestEnv.createIssue("High confidence container", "epic");
      const lowConfidenceId = await beadsTestEnv.createIssue("Low confidence container", "epic");

      const highConfidence = JSON.parse(await beadsTestEnv.exec(["show", highConfidenceId, "--json"]));
      const lowConfidence = JSON.parse(await beadsTestEnv.exec(["show", lowConfidenceId, "--json"]));

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

      await beadsTestEnv.deleteIssue(lowConfidenceId);
      await beadsTestEnv.deleteIssue(highConfidenceId);
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
        join(testDataDir, ".agent-shepherd", "config", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  level_policies:\n    "0":\n      mode: validation\n    "1":\n      mode: process-as-task\n    "2":\n      mode: validation\n      workflow_override: workflow-level-2\n`
      );

      const testCases = [
        { id: `test-lvl-0`, expectedMode: "validation", expectedWorkflow: undefined },
        { id: `test-lvl-1`, expectedMode: "process-as-task", expectedWorkflow: undefined },
        { id: `test-lvl-2`, expectedMode: "validation", expectedWorkflow: "workflow-level-2" },
        { id: `no-level-issue`, expectedMode: "auto-close", expectedWorkflow: undefined },
      ];

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
        join(testDataDir, ".agent-shepherd", "config", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: custom-default\n  level_policies:\n    "0":\n      mode: validation-mode\n    "1":\n      mode: process-mode\n`
      );

      const noLevelIssue = {
        id: "test-no-level",
        title: "No level policy issue",
        description: "Test issue",
        issue_type: "task",
        status: "open" as const,
        priority: 1,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const otherLevelIssue = {
        id: "test-other-level",
        title: "Other level issue",
        description: "Test issue",
        issue_type: "task",
        status: "open" as const,
        priority: 1,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const policy1 = picker["getContainerHandlingPolicy"](noLevelIssue as any);
      const policy2 = picker["getContainerHandlingPolicy"](otherLevelIssue as any);

      expect(policy1.mode).toBe("custom-default");
      expect(policy2.mode).toBe("custom-default");

      await beadsTestEnv.cleanup();
    });
  });
});
