import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  setHITLLabel,
  clearHITLLabels,
  getHITLReason,
  getIssueLabels,
  type BeadsIssue,
} from "../src/core/beads";
import {
  validateHITLReason,
} from "../src/core/policy";
import {
  type HITLConfig,
} from "../src/core/config";
import {
  setupBeadsIsolation,
  cleanupBeadsEnv,
  type BeadsTestEnv
} from "./helpers/beads-test-isolation";

const TEST_ISSUE_PREFIX = "hitl-tracking-test";

describe("HITL Tracking Functions", () => {
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
      `${TEST_ISSUE_PREFIX}: Test issue for HITL tracking`,
      "task",
      []
    );
  });

  afterEach(async () => {
    await beadsTestEnv.cleanup();
  });

  describe("setHITLLabel", () => {
    it("should set correct HITL label format", async () => {
      const reason = "approval";
      await setHITLLabel(testIssueId, reason);

      const labels = await getIssueLabels(testIssueId);
      expect(labels).toContain(`ashep-hitl:${reason}`);
    });

    it("should handle multiple HITL labels", async () => {
      await setHITLLabel(testIssueId, "approval");
      await setHITLLabel(testIssueId, "manual-intervention");

      const labels = await getIssueLabels(testIssueId);
      expect(labels).toContain("ashep-hitl:approval");
      expect(labels).toContain("ashep-hitl:manual-intervention");
    });

    it("should handle reasons with hyphens", async () => {
      const reason = "review-request";
      await setHITLLabel(testIssueId, reason);

      const labels = await getIssueLabels(testIssueId);
      expect(labels).toContain(`ashep-hitl:${reason}`);
    });
  });

  describe("clearHITLLabels", () => {
    it("should remove all HITL labels", async () => {
      await setHITLLabel(testIssueId, "approval");
      await setHITLLabel(testIssueId, "timeout");
      await setHITLLabel(testIssueId, "error");

      let labels = await getIssueLabels(testIssueId);
      const hitlLabels = labels.filter((label) => label.startsWith("ashep-hitl:"));
      expect(hitlLabels.length).toBeGreaterThan(0);

      await clearHITLLabels(testIssueId);

      labels = await getIssueLabels(testIssueId);
      const remainingHitlLabels = labels.filter((label) => label.startsWith("ashep-hitl:"));
      expect(remainingHitlLabels.length).toBe(0);
    });

    it("should handle no HITL labels gracefully", async () => {
      await clearHITLLabels(testIssueId);
      const labels = await getIssueLabels(testIssueId);
      const hitlLabels = labels.filter((label) => label.startsWith("ashep-hitl:"));
      expect(hitlLabels.length).toBe(0);
    });

    it("should preserve non-HITL labels", async () => {
      const testLabel = "test-label";
      await addLabel(testIssueId, testLabel);
      await setHITLLabel(testIssueId, "approval");

      await clearHITLLabels(testIssueId);

      const labels = await getIssueLabels(testIssueId);
      expect(labels).toContain(testLabel);
      expect(labels).not.toContain("ashep-hitl:approval");

      await removeLabel(testIssueId, testLabel);
    });
  });

  describe("getHITLReason", () => {
    it("should return HITL reason from labels", async () => {
      const reason = "manual-intervention";
      await setHITLLabel(testIssueId, reason);

      const hitlReason = await getHITLReason(testIssueId);
      expect(hitlReason).toBe(reason);
    });

    it("should return null when no HITL label exists", async () => {
      await clearHITLLabels(testIssueId);

      const hitlReason = await getHITLReason(testIssueId);
      expect(hitlReason).toBeNull();
    });

    it("should return first HITL reason if multiple exist", async () => {
      await setHITLLabel(testIssueId, "approval");
      await setHITLLabel(testIssueId, "timeout");

      const hitlReason = await getHITLReason(testIssueId);
      expect(["approval", "timeout"]).toContain(hitlReason || "");
    });
  });

  describe("validateHITLReason", () => {
    const defaultConfig: HITLConfig = {
      allowed_reasons: {
        predefined: ["approval", "manual-intervention", "timeout", "error", "review-request"],
        allow_custom: true,
        custom_validation: "alphanumeric-dash-underscore",
      },
    };

    it("should accept predefined reasons", () => {
      expect(validateHITLReason("approval", defaultConfig)).toBe(true);
      expect(validateHITLReason("manual-intervention", defaultConfig)).toBe(true);
      expect(validateHITLReason("timeout", defaultConfig)).toBe(true);
      expect(validateHITLReason("error", defaultConfig)).toBe(true);
      expect(validateHITLReason("review-request", defaultConfig)).toBe(true);
    });

    it("should accept custom reasons when allowed", () => {
      expect(validateHITLReason("custom-reason", defaultConfig)).toBe(true);
      expect(validateHITLReason("test_case_123", defaultConfig)).toBe(true);
    });

    it("should reject custom reasons when not allowed", () => {
      const noCustomConfig: HITLConfig = {
        allowed_reasons: {
          predefined: ["approval", "manual-intervention"],
          allow_custom: false,
          custom_validation: "alphanumeric-dash-underscore",
        },
      };

      expect(validateHITLReason("custom-reason", noCustomConfig)).toBe(false);
      expect(validateHITLReason("approval", noCustomConfig)).toBe(true);
    });

    it("should validate with alphanumeric pattern", () => {
      const alphanumericConfig: HITLConfig = {
        allowed_reasons: {
          predefined: ["approval"],
          allow_custom: true,
          custom_validation: "alphanumeric",
        },
      };

      expect(validateHITLReason("custom123", alphanumericConfig)).toBe(true);
      expect(validateHITLReason("custom-reason", alphanumericConfig)).toBe(false);
      expect(validateHITLReason("custom_reason", alphanumericConfig)).toBe(false);
    });

    it("should validate with alphanumeric-dash-underscore pattern", () => {
      expect(validateHITLReason("custom-reason", defaultConfig)).toBe(true);
      expect(validateHITLReason("custom_reason", defaultConfig)).toBe(true);
      expect(validateHITLReason("custom-reason_123", defaultConfig)).toBe(true);
      expect(validateHITLReason("custom!reason", defaultConfig)).toBe(false);
    });

    it("should accept any reason with 'none' validation", () => {
      const noneConfig: HITLConfig = {
        allowed_reasons: {
          predefined: ["approval"],
          allow_custom: true,
          custom_validation: "none",
        },
      };

      expect(validateHITLReason("any!reason@here", noneConfig)).toBe(true);
      expect(validateHITLReason("spaces allowed", noneConfig)).toBe(true);
    });

    it("should return true when no config provided", () => {
      expect(validateHITLReason("any-reason")).toBe(true);
    });

    it("should reject reasons starting with numbers", () => {
      expect(validateHITLReason("123-reason", defaultConfig)).toBe(false);
      expect(validateHITLReason("1start", defaultConfig)).toBe(false);
    });

    it("should reject empty reasons", () => {
      expect(validateHITLReason("", defaultConfig)).toBe(false);
    });
  });

  describe("Integration with other labels", () => {
    it("should work alongside phase labels", async () => {
      await addLabel(testIssueId, "ashep-phase:implement");
      await setHITLLabel(testIssueId, "approval");

      const labels = await getIssueLabels(testIssueId);
      expect(labels).toContain("ashep-phase:implement");
      expect(labels).toContain("ashep-hitl:approval");

      await clearHITLLabels(testIssueId);

      const remainingLabels = await getIssueLabels(testIssueId);
      expect(remainingLabels).toContain("ashep-phase:implement");
      expect(remainingLabels).not.toContain("ashep-hitl:approval");

      await removeLabel(testIssueId, "ashep-phase:implement");
    });
  });

  describe("Error handling", () => {
    it("should handle invalid issue IDs gracefully", async () => {
      await expect(async () => {
        await setHITLLabel("nonexistent-issue", "approval");
      }).not.toThrow();
    });

    it("should handle empty reasons gracefully", async () => {
      await expect(async () => {
        await setHITLLabel(testIssueId, "");
      }).not.toThrow();
    });
  });
});

// Helper functions for testing (using isolated environment)
async function addLabel(issueId: string, label: string): Promise<void> {
  const { addIssueLabel } = await import("../src/core/beads.ts");
  await addIssueLabel(issueId, label);
}

async function removeLabel(issueId: string, label: string): Promise<void> {
  const { removeIssueLabel } = await import("../src/core/beads.ts");
  await removeIssueLabel(issueId, label);
}
