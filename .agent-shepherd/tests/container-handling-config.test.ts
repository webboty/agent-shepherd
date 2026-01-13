/**
 * Container Handling Configuration Tests
 * Tests for schema validation, workflow overrides, and level calculation
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { loadConfig, saveConfig, validateConfig } from "../src/core/config";
import { IssuePicker, resetIssuePicker } from "../src/core/issue-picker";
import { WorkerEngine } from "../src/core/worker-engine";
import type { BeadsIssue } from "../src/core/beads";

const __dirname = import.meta.dir;
const TEMP_DIR = join(__dirname, "..", "..", "tmp_test");

describe("Container Handling - Configuration Tests", () => {
  let testDataDir: string;

  beforeEach(() => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testDataDir = join(TEMP_DIR, `.test-container-config-${timestamp}-${random}`);
    mkdirSync(testDataDir, { recursive: true });
    mkdirSync(join(testDataDir, ".agent-shepherd"), { recursive: true });
    mkdirSync(join(testDataDir, ".agent-shepherd", "config"), { recursive: true });
    mkdirSync(join(testDataDir, ".agent-shepherd", "data"), { recursive: true });

    process.env.ASHEP_DIR = join(testDataDir, ".agent-shepherd");
    resetIssuePicker();

    writeFileSync(
      join(testDataDir, ".agent-shepherd", "config.yaml"),
      `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\n`
    );
    writeFileSync(
      join(testDataDir, ".agent-shepherd", "policies.yaml"),
      `policies:\n  default:\n    name: default\n    phases:\n      - name: test\n        capabilities:\n          - test\n`
    );
  });

  afterEach(() => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    delete process.env.ASHEP_DIR;
    resetIssuePicker();
  });

  describe("Schema Validation", () => {
    it("should validate valid container handling config", () => {
      const validConfig = {
        worker: {
          poll_interval_ms: 30000,
          max_concurrent_runs: 3,
        },
        container_handling: {
          enabled: true,
          default_mode: "auto-close",
          container_detection: {
            check_children: true,
            min_children: 2,
            check_description: true,
            check_dependencies: true,
          },
          ordering: {
            strategy: "hybrid",
            dependency_weight: 0.7,
          },
          level_policies: {
            "0": {
              mode: "auto-close",
            },
            "1": {
              mode: "process-as-task",
            },
          },
        },
      };

      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  container_detection:\n    check_children: true\n    min_children: 2\n    check_description: true\n    check_dependencies: true\n  ordering:\n    strategy: hybrid\n    dependency_weight: 0.7\n  level_policies:\n    "0":\n      mode: auto-close\n    "1":\n      mode: process-as-task\n`
      );

      const config = loadConfig(testDataDir);
      expect(config.container_handling).toBeDefined();
      expect(config.container_handling?.enabled).toBe(true);
      expect(config.container_handling?.default_mode).toBe("auto-close");
      expect(config.container_handling?.container_detection).toBeDefined();
      expect(config.container_handling?.ordering).toBeDefined();
      expect(config.container_handling?.level_policies).toBeDefined();
    });

    it("should handle minimal container handling config", () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n`
      );

      const config = loadConfig(testDataDir);
      expect(config.container_handling).toBeDefined();
      expect(config.container_handling?.enabled).toBe(true);
      expect(config.container_handling?.default_mode).toBe("auto-close");
      expect(config.container_handling?.container_detection).toBeDefined();
      expect(config.container_handling?.ordering).toBeDefined();
      expect(config.container_handling?.level_policies).toBeUndefined();
    });

    it("should handle disabled container handling", () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: false\n`
      );

      const config = loadConfig(testDataDir);
      expect(config.container_handling).toBeDefined();
      expect(config.container_handling?.enabled).toBe(false);
    });

    it("should handle missing container handling config", () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\n`
      );

      const config = loadConfig(testDataDir);
      expect(config.container_handling).toBeDefined();
      expect(config.container_handling?.enabled).toBe(true);
      expect(config.container_handling?.default_mode).toBe("auto-close");
    });

    it("should validate container handling modes", () => {
      const validModes = ["auto-close", "process-as-task", "validation"];

      for (const mode of validModes) {
        writeFileSync(
          join(testDataDir, ".agent-shepherd", "config.yaml"),
          `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: ${mode}\n`
        );

        const config = loadConfig(testDataDir);
        expect(config.container_handling?.default_mode).toBe(mode);
      }
    });

    it("should validate ordering strategies", () => {
      const validStrategies = ["dependency", "hierarchy", "hybrid"];

      for (const strategy of validStrategies) {
        writeFileSync(
          join(testDataDir, ".agent-shepherd", "config.yaml"),
          `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  ordering:\n    strategy: ${strategy}\n`
        );

        const config = loadConfig(testDataDir);
        expect(config.container_handling?.ordering?.strategy).toBe(strategy);
      }
    });

    it("should validate dependency weight range", () => {
      const weights = [0.0, 0.5, 0.7, 0.9, 1.0];

      for (const weight of weights) {
        writeFileSync(
          join(testDataDir, ".agent-shepherd", "config.yaml"),
          `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  ordering:\n    strategy: hybrid\n    dependency_weight: ${weight}\n`
        );

        const config = loadConfig(testDataDir);
        expect(config.container_handling?.ordering?.dependency_weight).toBe(weight);
      }
    });

    it("should validate min_children range", () => {
      const minChildrenValues = [1, 2, 5, 10];

      for (const minChildren of minChildrenValues) {
        writeFileSync(
          join(testDataDir, ".agent-shepherd", "config.yaml"),
          `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  container_detection:\n    check_children: true\n    min_children: ${minChildren}\n`
        );

        const config = loadConfig(testDataDir);
        expect(config.container_handling?.container_detection?.min_children).toBe(minChildren);
      }
    });
  });

  describe("Workflow Overrides", () => {
    it("should apply workflow override at level 0", () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  level_policies:\n    "0":\n      mode: validation\n      workflow_override: custom-validation-workflow\n`
      );

      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });
      const policy = picker["getContainerHandlingPolicy"]({ id: "epic-1" } as BeadsIssue);

      expect(policy.mode).toBe("validation");
      expect(policy.workflow_override).toBe("custom-validation-workflow");
      expect(policy.level).toBe(0);
    });

    it("should apply workflow override at level 2", () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  level_policies:\n    "0":\n      mode: auto-close\n    "1":\n      mode: process-as-task\n    "2":\n      mode: validation\n      workflow_override: deep-validation-workflow\n`
      );

      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });
      const policy = picker["getContainerHandlingPolicy"]({ id: "epic-1.1.1" } as BeadsIssue);

      expect(policy.mode).toBe("validation");
      expect(policy.workflow_override).toBe("deep-validation-workflow");
      expect(policy.level).toBe(2);
    });

    it("should fall back to default mode when no level policy exists", () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: process-as-task\n  level_policies:\n    "0":\n      mode: auto-close\n`
      );

      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });
      const policy = picker["getContainerHandlingPolicy"]({ id: "epic-1.1" } as BeadsIssue);

      expect(policy.mode).toBe("process-as-task");
      expect(policy.workflow_override).toBeUndefined();
      expect(policy.level).toBe(1);
    });

    it("should prioritize level-specific policy over default", () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  level_policies:\n    "1":\n      mode: validation\n      workflow_override: override-workflow\n`
      );

      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const policyLevel0 = picker["getContainerHandlingPolicy"]({ id: "epic-1" } as BeadsIssue);
      expect(policyLevel0.mode).toBe("auto-close");

      const policyLevel1 = picker["getContainerHandlingPolicy"]({ id: "epic-1.1" } as BeadsIssue);
      expect(policyLevel1.mode).toBe("validation");
      expect(policyLevel1.workflow_override).toBe("override-workflow");

      const policyLevel2 = picker["getContainerHandlingPolicy"]({ id: "epic-1.1.1" } as BeadsIssue);
      expect(policyLevel2.mode).toBe("auto-close");
    });
  });

  describe("Level Calculation", () => {
    it("should calculate level 0 for root epics", () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const rootIssues = ["epic-1", "feature-abc", "project-xyz"];

      for (const id of rootIssues) {
        const level = picker["calculateHierarchicalDepth"](id);
        expect(level).toBe(0);
      }
    });

    it("should calculate level 1 for first-level children", () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const level1Issues = ["epic-1.1", "feature-abc.1", "project-xyz.2"];

      for (const id of level1Issues) {
        const level = picker["calculateHierarchicalDepth"](id);
        expect(level).toBe(1);
      }
    });

    it("should calculate correct levels for deep hierarchies", () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const testCases = [
        { id: "epic-1", expectedLevel: 0 },
        { id: "epic-1.1", expectedLevel: 1 },
        { id: "epic-1.1.1", expectedLevel: 2 },
        { id: "epic-1.1.1.1", expectedLevel: 3 },
        { id: "epic-1.1.1.1.1", expectedLevel: 4 },
        { id: "epic-1.1.1.1.1.1", expectedLevel: 5 },
      ];

      for (const { id, expectedLevel } of testCases) {
        const level = picker["calculateHierarchicalDepth"](id);
        expect(level).toBe(expectedLevel);
      }
    });

    it("should handle edge cases in level calculation", () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const edgeCases = [
        { id: "", expectedLevel: 0 },
        { id: "no-dots", expectedLevel: 0 },
        { id: "prefix.", expectedLevel: 0 },
        { id: ".1.2", expectedLevel: 2 },
        { id: "prefix.abc.123", expectedLevel: 1 },
        { id: "prefix.123.abc", expectedLevel: 1 },
        { id: "a.b.c.d.e", expectedLevel: 0 },
      ];

      for (const { id, expectedLevel } of edgeCases) {
        const level = picker["calculateHierarchicalDepth"](id);
        expect(level).toBe(expectedLevel);
      }
    });

    it("should calculate consistent levels across components", () => {
      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });
      const workerEngine = new WorkerEngine();

      const testIds = ["epic-1.1.1", "feature-2.3.4", "project-9z1.5.1"];

      for (const id of testIds) {
        const pickerLevel = picker["calculateHierarchicalDepth"](id);
        const engineLevel = workerEngine["calculateHierarchicalLevel"](id);
        expect(pickerLevel).toBe(engineLevel);
      }
    });
  });

  describe("Config Precedence", () => {
    it("should respect level-specific mode over default mode", () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  level_policies:\n    "1":\n      mode: process-as-task\n    "2":\n      mode: validation\n`
      );

      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const policy0 = picker["getContainerHandlingPolicy"]({ id: "epic-1" } as BeadsIssue);
      expect(policy0.mode).toBe("auto-close");

      const policy1 = picker["getContainerHandlingPolicy"]({ id: "epic-1.1" } as BeadsIssue);
      expect(policy1.mode).toBe("process-as-task");

      const policy2 = picker["getContainerHandlingPolicy"]({ id: "epic-1.1.1" } as BeadsIssue);
      expect(policy2.mode).toBe("validation");
    });

    it("should apply workflow override only when specified", () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  level_policies:\n    "1":\n      mode: process-as-task\n      workflow_override: workflow-level-1\n    "2":\n      mode: validation\n`
      );

      const picker = new IssuePicker({ mode: "smart", max_issues: 10 });

      const policy1 = picker["getContainerHandlingPolicy"]({ id: "epic-1.1" } as BeadsIssue);
      expect(policy1.workflow_override).toBe("workflow-level-1");

      const policy2 = picker["getContainerHandlingPolicy"]({ id: "epic-1.1.1" } as BeadsIssue);
      expect(policy2.workflow_override).toBeUndefined();
    });

    it("should apply default values for missing config fields", () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n`
      );

      const config = loadConfig(testDataDir);
      expect(config.container_handling?.default_mode).toBe("auto-close");
      expect(config.container_handling?.ordering).toBeDefined();
      expect(config.container_handling?.ordering?.strategy).toBe("hybrid");
      expect(config.container_handling?.ordering?.dependency_weight).toBe(0.7);
      expect(config.container_handling?.level_policies).toBeUndefined();
    });
  });

  describe("Config Validation", () => {
    it("should handle invalid container handling mode gracefully", () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: invalid-mode\n`
      );

      const config = loadConfig(testDataDir);
      expect(config.container_handling?.default_mode).toBe("invalid-mode");
    });

    it("should handle invalid ordering strategy gracefully", () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  ordering:\n    strategy: invalid-strategy\n`
      );

      const config = loadConfig(testDataDir);
      expect(config.container_handling?.ordering?.strategy).toBe("invalid-strategy");
    });

    it("should handle out-of-range dependency weight", () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  ordering:\n    strategy: hybrid\n    dependency_weight: 1.5\n`
      );

      const config = loadConfig(testDataDir);
      expect(config.container_handling?.ordering?.dependency_weight).toBe(1.5);
    });

    it("should handle invalid min_children value", () => {
      writeFileSync(
        join(testDataDir, ".agent-shepherd", "config.yaml"),
        `worker:\n  poll_interval_ms: 30000\n  max_concurrent_runs: 3\ncontainer_handling:\n  enabled: true\n  default_mode: auto-close\n  container_detection:\n    check_children: true\n    min_children: -1\n`
      );

      const config = loadConfig(testDataDir);
      expect(config.container_handling?.container_detection?.min_children).toBe(-1);
    });
  });
});
