import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";
import {
  getIssueLabels,
  updateIssueLabels,
  addIssueLabel,
  removeIssueLabel,
  getIssue,
  getReadyIssues,
  type BeadsIssue,
} from "../src/core/beads";
import {
  setupBeadsIsolation,
  type BeadsTestEnv
} from "./helpers/beads-test-isolation";

const TEST_ISSUE_PREFIX = "beads-labels-test";

describe("Beads Label Functions", () => {
  let beadsTestEnv: BeadsTestEnv;
  let testIssueId: string;

  beforeEach(async () => {
    beadsTestEnv = setupBeadsIsolation();
    await beadsTestEnv.initialize();

    // Set environment variables for the Beads functions to use the isolated database
    process.env.BEADS_DIR = beadsTestEnv.beadsDir;
    process.env.BD_NO_DAEMON = "true";
    process.env.BD_SANDBOX = "true";

    testIssueId = await beadsTestEnv.createIssue(
      `${TEST_ISSUE_PREFIX}: Test issue for label operations`,
      "task",
      []
    );
  });

  afterEach(async () => {
    await beadsTestEnv.cleanup();
  });

  describe("getIssueLabels", () => {
    it("should return array of label strings", async () => {
      const labels = await getIssueLabels(testIssueId);
      expect(Array.isArray(labels)).toBe(true);
      expect(labels.every((label) => typeof label === "string")).toBe(true);
    });

    it("should return empty array on error", async () => {
      const labels = await getIssueLabels("nonexistent-issue");
      expect(Array.isArray(labels)).toBe(true);
      expect(labels.length).toBe(0);
    });
  });

  describe("addIssueLabel", () => {
    it("should add a label to an issue", async () => {
      await addIssueLabel(testIssueId, "test-label");
      const labels = await getIssueLabels(testIssueId);
      expect(labels).toContain("test-label");
    });

    it("should handle label addition gracefully", async () => {
      await expect(async () => await addIssueLabel(testIssueId, "another-test-label")).not.toThrow();
    });
  });

  describe("removeIssueLabel", () => {
    it("should remove a label from an issue", async () => {
      const testLabel = "temp-test-label";
      await addIssueLabel(testIssueId, testLabel);
      expect(await getIssueLabels(testIssueId)).toContain(testLabel);

      await removeIssueLabel(testIssueId, testLabel);
      expect(await getIssueLabels(testIssueId)).not.toContain(testLabel);
    });

    it("should handle label removal gracefully", async () => {
      await expect(async () => await removeIssueLabel(testIssueId, "nonexistent-label")).not.toThrow();
    });
  });

  describe("updateIssueLabels", () => {
    it("should add multiple labels", async () => {
      const addLabels = ["label-1", "label-2", "label-3"];
      await updateIssueLabels(testIssueId, addLabels, []);

      const labels = await getIssueLabels(testIssueId);
      addLabels.forEach((label) => {
        expect(labels).toContain(label);
      });

      await updateIssueLabels(testIssueId, [], addLabels);
    });

    it("should remove multiple labels", async () => {
      const removeLabels = ["remove-1", "remove-2"];
      await updateIssueLabels(testIssueId, removeLabels, []);

      await updateIssueLabels(testIssueId, [], removeLabels);

      const labels = await getIssueLabels(testIssueId);
      removeLabels.forEach((label) => {
        expect(labels).not.toContain(label);
      });
    });

    it("should add and remove labels simultaneously", async () => {
      const addLabels = ["add-new-1", "add-new-2"];
      const removeLabels = ["remove-old-1", "remove-old-2"];

      await updateIssueLabels(testIssueId, removeLabels, []);

      await updateIssueLabels(testIssueId, addLabels, removeLabels);

      const labels = await getIssueLabels(testIssueId);
      addLabels.forEach((label) => {
        expect(labels).toContain(label);
      });
      removeLabels.forEach((label) => {
        expect(labels).not.toContain(label);
      });

      await updateIssueLabels(testIssueId, [], addLabels);
    });
  });

  describe("getIssue includes labels", () => {
    it("should include labels field in returned issue", async () => {
      const issue = await getIssue(testIssueId);
      expect(issue).not.toBeNull();
      if (issue) {
        expect(issue.labels).toBeDefined();
        expect(Array.isArray(issue.labels)).toBe(true);
      }
    });
  });

  describe("getReadyIssues includes labels", () => {
    it("should include labels for all issues", async () => {
      const issues = await getReadyIssues();
      expect(Array.isArray(issues)).toBe(true);

      issues.forEach((issue: BeadsIssue) => {
        expect(issue.labels).toBeDefined();
        expect(Array.isArray(issue.labels)).toBe(true);
      });
    });
  });

  describe("Error handling", () => {
    it("should handle nonexistent issue gracefully", async () => {
      const issue = await getIssue("nonexistent-issue-id");
      expect(issue).toBeNull();
    });

    it("should handle getIssueLabels error gracefully", async () => {
      const labels = await getIssueLabels("invalid-issue-id");
      expect(labels).toEqual([]);
    });
  });
});
