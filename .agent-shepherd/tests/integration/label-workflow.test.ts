/**
 * Integration Tests for Label-Based Workflow System
 * 
 * Tests complete label workflow including:
 * - Trigger system (explicit labels, issue type matching, default)
 * - Phase tracking and resumption
 * - HITL (Human-in-the-Loop) labels
 * - Exclusion control
 * - Invalid workflow label handling
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { PolicyEngine } from "../../src/core/policy.ts";
import * as beads from "../../src/core/beads.ts";
import { loadConfig } from "../../src/core/config.ts";
import { getConfigPath } from "../../src/core/path-utils";

const TEST_ISSUE_PREFIX = "label-workflow-test";

// Helper to execute bd commands
async function execBeadsCommand(args: string[]): Promise<string> {
  const proc = Bun.spawn(["bd", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const error = await new Response(proc.stderr).text();
    throw new Error(`Beads command failed: ${error}`);
  }

  return output;
}

// Helper to create test issue
async function createTestIssue(title: string, issueType: string = "task", labels: string[] = []): Promise<string> {
  const args = ["create", "--type", issueType, "--title", `${TEST_ISSUE_PREFIX}: ${title}`];

  for (const label of labels) {
    args.push("--labels", label);
  }

  const output = await execBeadsCommand(args);
  const issueId = output.match(/Created issue: ([^\s\n]+)/)?.[1];

  if (!issueId) {
    throw new Error(`Failed to create test issue: ${title}. Output: ${output}`);
  }

  return issueId;
}

// Helper to clean up test issues
async function cleanupTestIssues(): Promise<void> {
  try {
    const issues = await beads.listIssues();
    for (const issue of issues) {
      if (issue.title.includes(TEST_ISSUE_PREFIX)) {
        await execBeadsCommand(["delete", issue.id]);
      }
    }
  } catch (error) {
    console.warn("Failed to cleanup test issues:", error);
  }
}

describe("Label-Based Workflow Integration Tests", () => {
  let policyEngine: PolicyEngine;
  
  beforeAll(async () => {
    // Clean up any existing test issues
    await cleanupTestIssues();
    
    // Initialize policy engine with local config path
    const policiesPath = getConfigPath("policies.yaml");
    policyEngine = new PolicyEngine(policiesPath);
  });
  
  afterAll(async () => {
    // Clean up all test issues
    await cleanupTestIssues();
  });
  
  describe("Explicit Workflow Label Trigger", () => {
    it("should match policy with explicit workflow label", async () => {
      const issueId = await createTestIssue(
        "Explicit workflow label test",
        "task",
        ["ashep-workflow:simple"]
      );

      try {
        const issue = await beads.getIssue(issueId);
        if (!issue) {
          throw new Error(`Failed to get issue ${issueId}`);
        }
        const matchedPolicy = policyEngine.matchPolicy(issue);

        expect(matchedPolicy).toBe("simple");
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });

    it("should match default workflow policy via label", async () => {
      const issueId = await createTestIssue(
        "Default workflow label test",
        "feature",
        ["ashep-workflow:default"]
      );

      try {
        const issue = await beads.getIssue(issueId);
        if (!issue) {
          throw new Error(`Failed to get issue ${issueId}`);
        }
        const matchedPolicy = policyEngine.matchPolicy(issue);

        expect(matchedPolicy).toBe("default");
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });

    it("should handle invalid workflow label based on config", async () => {
      const config = loadConfig();
      const strategy = config.workflow?.invalid_label_strategy || "error";

      const issueId = await createTestIssue(
        "Invalid workflow label test",
        "task",
        ["ashep-workflow:nonexistent-workflow"]
      );

      try {
        const issue = await beads.getIssue(issueId);
        if (!issue) {
          throw new Error(`Failed to get issue ${issueId}`);
        }

        if (strategy === "error") {
          expect(() => policyEngine.matchPolicy(issue)).toThrow(/Invalid workflow label/);
        } else {
          // For "warning" or "ignore", should fall back to default
          const matchedPolicy = policyEngine.matchPolicy(issue);
          expect(matchedPolicy).toBe(policyEngine.getDefaultPolicyName());
        }
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });
  });
  
  describe("Default Policy Fallback", () => {
    it("should use default policy when no label or type match", async () => {
      const issueId = await createTestIssue("Default policy test", "chore");

      try {
        const issue = await beads.getIssue(issueId);
        if (!issue) {
          throw new Error(`Failed to get issue ${issueId}`);
        }
        const matchedPolicy = policyEngine.matchPolicy(issue);

        expect(matchedPolicy).toBe(policyEngine.getDefaultPolicyName());
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });
  });
  
  describe("Phase Tracking Labels", () => {
    it("should set phase label on issue", async () => {
      const issueId = await createTestIssue("Phase label set test");

      try {
        await beads.setPhaseLabel(issueId, "implement");
        
        const currentPhase = await beads.getCurrentPhase(issueId);
        expect(currentPhase).toBe("implement");
        
        const labels = await beads.getIssueLabels(issueId);
        expect(labels).toContain("ashep-phase:implement");
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });
    
    it("should read phase label from issue", async () => {
      const issueId = await createTestIssue("Phase label read test");

      try {
        await beads.setPhaseLabel(issueId, "test");
        
        const currentPhase = await beads.getCurrentPhase(issueId);
        expect(currentPhase).toBe("test");
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });
    
    it("should remove all phase labels", async () => {
      const issueId = await createTestIssue("Phase label remove test");

      try {
        await beads.setPhaseLabel(issueId, "plan");
        await beads.setPhaseLabel(issueId, "implement");
        
        const labels = await beads.getIssueLabels(issueId);
        const phaseLabels = labels.filter((l) => l.startsWith("ashep-phase:"));
        expect(phaseLabels.length).toBeGreaterThan(0);
        
        await beads.removePhaseLabels(issueId);
        
        const labelsAfter = await beads.getIssueLabels(issueId);
        const phaseLabelsAfter = labelsAfter.filter((l) => l.startsWith("ashep-phase:"));
        expect(phaseLabelsAfter.length).toBe(0);
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });
  });
  
  describe("HITL (Human-in-the-Loop) Labels", () => {
    it("should set HITL label with reason", async () => {
      const issueId = await createTestIssue("HITL label set test");

      try {
        await beads.setHITLLabel(issueId, "approval");
        
        const labels = await beads.getIssueLabels(issueId);
        expect(labels).toContain("ashep-hitl:approval");
        
        const hitlReason = await beads.getHITLReason(issueId);
        expect(hitlReason).toBe("approval");
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });
    
    it("should read HITL reason from label", async () => {
      const issueId = await createTestIssue("HITL label read test");

      try {
        await beads.setHITLLabel(issueId, "manual-intervention");
        
        const hitlReason = await beads.getHITLReason(issueId);
        expect(hitlReason).toBe("manual-intervention");
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });
    
    it("should clear all HITL labels", async () => {
      const issueId = await createTestIssue("HITL label clear test");

      try {
        await beads.setHITLLabel(issueId, "approval");
        await beads.setHITLLabel(issueId, "review-request");
        
        const labels = await beads.getIssueLabels(issueId);
        const hitlLabels = labels.filter((l) => l.startsWith("ashep-hitl:"));
        expect(hitlLabels.length).toBeGreaterThan(0);
        
        await beads.clearHITLLabels(issueId);
        
        const labelsAfter = await beads.getIssueLabels(issueId);
        const hitlLabelsAfter = labelsAfter.filter((l) => l.startsWith("ashep-hitl:"));
        expect(hitlLabelsAfter.length).toBe(0);
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });
    
    it("should validate predefined HITL reasons", async () => {
      const config = loadConfig();
      const { validateHITLReason } = await import("../../src/core/policy.ts");
      
      const predefinedReasons = config.hitl?.allowed_reasons.predefined || [];
      
      // All predefined reasons should be valid
      for (const reason of predefinedReasons) {
        expect(validateHITLReason(reason, config.hitl)).toBe(true);
      }
    });
    
    it("should validate custom HITL reasons", async () => {
      const config = loadConfig();
      const { validateHITLReason } = await import("../../src/core/policy.ts");
      
      const allowCustom = config.hitl?.allowed_reasons?.allow_custom ?? true;
      
      if (allowCustom) {
        expect(validateHITLReason("custom-reason-123", config.hitl)).toBe(true);
      } else {
        expect(validateHITLReason("custom-reason-123", config.hitl)).toBe(false);
      }
    });
  });
  
  describe("Exclusion Control", () => {
    it("should identify excluded issues", async () => {
      const issueId = await createTestIssue("Exclusion test", "task", ["ashep-excluded"]);

      try {
        const isExcluded = await beads.hasExcludedLabel(issueId);
        expect(isExcluded).toBe(true);
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });
    
    it("should identify non-excluded issues", async () => {
      const issueId = await createTestIssue("Non-exclusion test");

      try {
        const isExcluded = await beads.hasExcludedLabel(issueId);
        expect(isExcluded).toBe(false);
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });
    
    it("should handle exclusion label addition and removal", async () => {
      const issueId = await createTestIssue("Exclusion toggle test");

      try {
        await beads.addIssueLabel(issueId, "ashep-excluded");
        let isExcluded = await beads.hasExcludedLabel(issueId);
        expect(isExcluded).toBe(true);
        
        await beads.removeIssueLabel(issueId, "ashep-excluded");
        isExcluded = await beads.hasExcludedLabel(issueId);
        expect(isExcluded).toBe(false);
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });
  });
  
  describe("Complete Workflow Scenario", () => {
    it("should handle full label workflow lifecycle", async () => {
      const issueId = await createTestIssue(
        "Full workflow lifecycle test",
        "feature",
        ["ashep-workflow:simple"]
      );

      try {
        // 1. Initial state - explicit workflow label
        const initialIssue = await beads.getIssue(issueId);
        if (!initialIssue) {
          throw new Error(`Failed to get issue ${issueId}`);
        }
        expect(initialIssue?.labels).toContain("ashep-workflow:simple");
        
        // 2. Match policy
        const matchedPolicy = policyEngine.matchPolicy(initialIssue);
        expect(matchedPolicy).toBe("simple");
        
        // 3. Simulate phase tracking
        await beads.setPhaseLabel(issueId, "implement");
        let currentPhase = await beads.getCurrentPhase(issueId);
        expect(currentPhase).toBe("implement");
        
        // 4. Simulate phase completion - move to next phase
        await beads.removePhaseLabels(issueId);
        await beads.setPhaseLabel(issueId, "test");
        currentPhase = await beads.getCurrentPhase(issueId);
        expect(currentPhase).toBe("test");
        
        // 5. Simulate HITL requirement
        await beads.setHITLLabel(issueId, "approval");
        const hitlReason = await beads.getHITLReason(issueId);
        expect(hitlReason).toBe("approval");
        
        // 6. Simulate HITL resolution
        await beads.clearHITLLabels(issueId);
        const hitlReasonAfter = await beads.getHITLReason(issueId);
        expect(hitlReasonAfter).toBeNull();
        
        // 7. Simulate workflow completion
        await beads.removePhaseLabels(issueId);
        const finalPhase = await beads.getCurrentPhase(issueId);
        expect(finalPhase).toBeNull();
        
        const finalIssue = await beads.getIssue(issueId);
        const finalLabels = finalIssue?.labels || [];
        expect(finalLabels).not.toContain("ashep-phase:test");
        expect(finalLabels).not.toContain("ashep-hitl:approval");
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });
  });
  
  describe("Label Update Operations", () => {
    it("should add and remove labels in batch", async () => {
      const issueId = await createTestIssue("Batch label update test");

      try {
        await beads.updateIssueLabels(
          issueId,
          ["label1", "label2", "label3"],
          ["label1"]
        );
        
        const labels = await beads.getIssueLabels(issueId);
        expect(labels).toContain("label2");
        expect(labels).toContain("label3");
        expect(labels).not.toContain("label1");
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });
    
    it("should handle empty label operations", async () => {
      const issueId = await createTestIssue("Empty label ops test");

      try {
        // Should not throw on empty operations
        await beads.updateIssueLabels(issueId, [], []);
        await beads.setPhaseLabel(issueId, "test");
        await beads.removePhaseLabels(issueId);
        
        const labels = await beads.getIssueLabels(issueId);
        const phaseLabels = labels.filter((l) => l.startsWith("ashep-phase:"));
        expect(phaseLabels.length).toBe(0);
      } finally {
        await execBeadsCommand(["delete", issueId]);
      }
    });
  });
});
