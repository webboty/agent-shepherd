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
import {
  setupBeadsIsolation,
  type BeadsTestEnv
} from "./helpers/beads-test-isolation";

const TEST_ISSUE_PREFIX = "phase-tracking-test";

describe("Phase Tracking Functions", () => {
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
      `${TEST_ISSUE_PREFIX}: Test issue for phase tracking`,
      "task",
      []
    );
  });

  afterEach(async () => {
    await beadsTestEnv.cleanup();
  });

  describe("setPhaseLabel", () => {
    it("should set correct phase label format", async () => {
      const phaseName = "implement";
      await setPhaseLabel(testIssueId, phaseName);

      const labels = await getIssueLabels(testIssueId);
      expect(labels).toContain(`ashep-phase:${phaseName}`);
    });

    it("should handle multiple phase label changes", async () => {
      await setPhaseLabel(testIssueId, "plan");
      let labels = await getIssueLabels(testIssueId);
      expect(labels).toContain("ashep-phase:plan");

      await setPhaseLabel(testIssueId, "implement");
      labels = await getIssueLabels(testIssueId);
      expect(labels).toContain("ashep-phase:implement");
      expect(labels).not.toContain("ashep-phase:plan"); // Old phase should be removed
    });

    it("should handle phase names with underscores", async () => {
      const phaseName = "code_review";
      await setPhaseLabel(testIssueId, phaseName);

      const labels = await getIssueLabels(testIssueId);
      expect(labels).toContain(`ashep-phase:${phaseName}`);
    });
  });

  describe("removePhaseLabels", () => {
    it("should remove all phase labels", async () => {
      await setPhaseLabel(testIssueId, "plan");
      await setPhaseLabel(testIssueId, "implement");
      await setPhaseLabel(testIssueId, "test");

      let labels = await getIssueLabels(testIssueId);
      const phaseLabels = labels.filter((label) => label.startsWith("ashep-phase:"));
      expect(phaseLabels.length).toBeGreaterThan(0);

      await removePhaseLabels(testIssueId);

      labels = await getIssueLabels(testIssueId);
      const remainingPhaseLabels = labels.filter((label) => label.startsWith("ashep-phase:"));
      expect(remainingPhaseLabels.length).toBe(0);
    });

    it("should handle no phase labels gracefully", async () => {
      await removePhaseLabels(testIssueId);
      const labels = await getIssueLabels(testIssueId);
      const phaseLabels = labels.filter((label) => label.startsWith("ashep-phase:"));
      expect(phaseLabels.length).toBe(0);
    });

    it("should preserve non-phase labels", async () => {
      const testLabel = "test-label";
      await addLabel(testIssueId, testLabel);
      await setPhaseLabel(testIssueId, "plan");

      await removePhaseLabels(testIssueId);

      const labels = await getIssueLabels(testIssueId);
      expect(labels).toContain(testLabel);
      expect(labels).not.toContain("ashep-phase:plan");

      await removeLabel(testIssueId, testLabel);
    });
  });

  describe("getCurrentPhase", () => {
    it("should return current phase from labels", async () => {
      const phaseName = "test-phase";
      await setPhaseLabel(testIssueId, phaseName);

      const currentPhase = await getCurrentPhase(testIssueId);
      expect(currentPhase).toBe(phaseName);
    });

    it("should return null when no phase label exists", async () => {
      await removePhaseLabels(testIssueId);

      const currentPhase = await getCurrentPhase(testIssueId);
      expect(currentPhase).toBeNull();
    });

    it("should return most recently set phase", async () => {
      await setPhaseLabel(testIssueId, "plan");
      await setPhaseLabel(testIssueId, "implement");
      await setPhaseLabel(testIssueId, "test");

      const currentPhase = await getCurrentPhase(testIssueId);
      expect(currentPhase).toBe("test"); // Should strictly be the last one set
    });
  });

  describe("Integration with other labels", () => {
    it("should work alongside HITL labels", async () => {
      await setPhaseLabel(testIssueId, "implement");
      await addLabel(testIssueId, "ashep-hitl:approval");

      const labels = await getIssueLabels(testIssueId);
      expect(labels).toContain("ashep-phase:implement");
      expect(labels).toContain("ashep-hitl:approval");

      await removePhaseLabels(testIssueId);

      const remainingLabels = await getIssueLabels(testIssueId);
      expect(remainingLabels).not.toContain("ashep-phase:implement");
      expect(remainingLabels).toContain("ashep-hitl:approval");

      await removeLabel(testIssueId, "ashep-hitl:approval");
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
        await setPhaseLabel(testIssueId, "");
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
