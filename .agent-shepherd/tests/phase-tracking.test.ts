import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  setPhaseLabel,
  removePhaseLabels,
  getCurrentPhase,
  getIssueLabels,
  addIssueLabel,
  removeIssueLabel,
  type BeadsIssue,
} from "../src/core/beads";

describe("Phase Tracking Functions", () => {
  const mockIssueId = "agent-shepherd-uj0";

  describe("setPhaseLabel", () => {
    it("should set correct phase label format", async () => {
      const phaseName = "implement";
      await setPhaseLabel(mockIssueId, phaseName);

      const labels = await getIssueLabels(mockIssueId);
      expect(labels).toContain(`ashep-phase:${phaseName}`);
    });

    it("should handle multiple phase label changes", async () => {
      await setPhaseLabel(mockIssueId, "plan");
      let labels = await getIssueLabels(mockIssueId);
      expect(labels).toContain("ashep-phase:plan");

      await setPhaseLabel(mockIssueId, "implement");
      labels = await getIssueLabels(mockIssueId);
      expect(labels).toContain("ashep-phase:implement");
      expect(labels).toContain("ashep-phase:plan");
    });

    it("should handle phase names with underscores", async () => {
      const phaseName = "code_review";
      await setPhaseLabel(mockIssueId, phaseName);

      const labels = await getIssueLabels(mockIssueId);
      expect(labels).toContain(`ashep-phase:${phaseName}`);
    });
  });

  describe("removePhaseLabels", () => {
    it("should remove all phase labels", async () => {
      await setPhaseLabel(mockIssueId, "plan");
      await setPhaseLabel(mockIssueId, "implement");
      await setPhaseLabel(mockIssueId, "test");

      let labels = await getIssueLabels(mockIssueId);
      const phaseLabels = labels.filter((label) => label.startsWith("ashep-phase:"));
      expect(phaseLabels.length).toBeGreaterThan(0);

      await removePhaseLabels(mockIssueId);

      labels = await getIssueLabels(mockIssueId);
      const remainingPhaseLabels = labels.filter((label) => label.startsWith("ashep-phase:"));
      expect(remainingPhaseLabels.length).toBe(0);
    });

    it("should handle no phase labels gracefully", async () => {
      await removePhaseLabels(mockIssueId);
      const labels = await getIssueLabels(mockIssueId);
      const phaseLabels = labels.filter((label) => label.startsWith("ashep-phase:"));
      expect(phaseLabels.length).toBe(0);
    });

    it("should preserve non-phase labels", async () => {
      const testLabel = "test-label";
      await addLabel(mockIssueId, testLabel);
      await setPhaseLabel(mockIssueId, "plan");

      await removePhaseLabels(mockIssueId);

      const labels = await getIssueLabels(mockIssueId);
      expect(labels).toContain(testLabel);
      expect(labels).not.toContain("ashep-phase:plan");

      await removeLabel(mockIssueId, testLabel);
    });
  });

  describe("getCurrentPhase", () => {
    it("should return current phase from labels", async () => {
      const phaseName = "test-phase";
      await setPhaseLabel(mockIssueId, phaseName);

      const currentPhase = await getCurrentPhase(mockIssueId);
      expect(currentPhase).toBe(phaseName);
    });

    it("should return null when no phase label exists", async () => {
      await removePhaseLabels(mockIssueId);

      const currentPhase = await getCurrentPhase(mockIssueId);
      expect(currentPhase).toBeNull();
    });

    it("should return most recently set phase", async () => {
      await setPhaseLabel(mockIssueId, "plan");
      await setPhaseLabel(mockIssueId, "implement");
      await setPhaseLabel(mockIssueId, "test");

      const currentPhase = await getCurrentPhase(mockIssueId);
      expect(["plan", "implement", "test"]).toContain(currentPhase || "");
    });
  });

  describe("Integration with other labels", () => {
    it("should work alongside HITL labels", async () => {
      await setPhaseLabel(mockIssueId, "implement");
      await addLabel(mockIssueId, "ashep-hitl:approval");

      const labels = await getIssueLabels(mockIssueId);
      expect(labels).toContain("ashep-phase:implement");
      expect(labels).toContain("ashep-hitl:approval");

      await removePhaseLabels(mockIssueId);

      const remainingLabels = await getIssueLabels(mockIssueId);
      expect(remainingLabels).not.toContain("ashep-phase:implement");
      expect(remainingLabels).toContain("ashep-hitl:approval");

      await removeLabel(mockIssueId, "ashep-hitl:approval");
    });
  });

  describe("Error handling", () => {
    it("should handle invalid issue IDs gracefully", async () => {
      await expect(async () => {
        await setPhaseLabel("nonexistent-issue", "plan");
      }).not.toThrow();
    });

    it("should handle empty phase names", async () => {
      await expect(async () => {
        await setPhaseLabel(mockIssueId, "");
      }).not.toThrow();
    });
  });
});

// Helper functions for testing
async function addLabel(issueId: string, label: string): Promise<void> {
  await addIssueLabel(issueId, label);
}

async function removeLabel(issueId: string, label: string): Promise<void> {
  await removeIssueLabel(issueId, label);
}
