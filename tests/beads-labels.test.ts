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
} from "../.agent-shepherd/src/core/beads";

describe("Beads Label Functions", () => {
  const mockIssueId = "agent-shepherd-uj0";

  describe("getIssueLabels", () => {
    it("should return array of label strings", async () => {
      const labels = await getIssueLabels(mockIssueId);
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
      await addIssueLabel(mockIssueId, "test-label");
      const labels = await getIssueLabels(mockIssueId);
      expect(labels).toContain("test-label");
    });

    it("should handle label addition gracefully", async () => {
      await expect(async () => await addIssueLabel(mockIssueId, "another-test-label")).not.toThrow();
    });
  });

  describe("removeIssueLabel", () => {
    it("should remove a label from an issue", async () => {
      const testLabel = "temp-test-label";
      await addIssueLabel(mockIssueId, testLabel);
      expect(await getIssueLabels(mockIssueId)).toContain(testLabel);

      await removeIssueLabel(mockIssueId, testLabel);
      expect(await getIssueLabels(mockIssueId)).not.toContain(testLabel);
    });

    it("should handle label removal gracefully", async () => {
      await expect(async () => await removeIssueLabel(mockIssueId, "nonexistent-label")).not.toThrow();
    });
  });

  describe("updateIssueLabels", () => {
    it("should add multiple labels", async () => {
      const addLabels = ["label-1", "label-2", "label-3"];
      await updateIssueLabels(mockIssueId, addLabels, []);

      const labels = await getIssueLabels(mockIssueId);
      addLabels.forEach((label) => {
        expect(labels).toContain(label);
      });

      await updateIssueLabels(mockIssueId, [], addLabels);
    });

    it("should remove multiple labels", async () => {
      const removeLabels = ["remove-1", "remove-2"];
      await updateIssueLabels(mockIssueId, removeLabels, []);

      await updateIssueLabels(mockIssueId, [], removeLabels);

      const labels = await getIssueLabels(mockIssueId);
      removeLabels.forEach((label) => {
        expect(labels).not.toContain(label);
      });
    });

    it("should add and remove labels simultaneously", async () => {
      const addLabels = ["add-new-1", "add-new-2"];
      const removeLabels = ["remove-old-1", "remove-old-2"];

      await updateIssueLabels(mockIssueId, removeLabels, []);

      await updateIssueLabels(mockIssueId, addLabels, removeLabels);

      const labels = await getIssueLabels(mockIssueId);
      addLabels.forEach((label) => {
        expect(labels).toContain(label);
      });
      removeLabels.forEach((label) => {
        expect(labels).not.toContain(label);
      });

      await updateIssueLabels(mockIssueId, [], addLabels);
    });
  });

  describe("getIssue includes labels", () => {
    it("should include labels field in returned issue", async () => {
      const issue = await getIssue(mockIssueId);
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
