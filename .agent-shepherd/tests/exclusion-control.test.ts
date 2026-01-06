import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  hasExcludedLabel,
  getIssueLabels,
  addIssueLabel,
  removeIssueLabel,
} from "../src/core/beads";

describe("hasExcludedLabel", () => {
  const testIssueId = "agent-shepherd-zhj.5";
  
  beforeEach(async () => {
    // Ensure the issue doesn't have the excluded label before each test
    await removeIssueLabel(testIssueId, "ashep-excluded");
  });

  afterEach(async () => {
    // Clean up: remove the excluded label after each test
    await removeIssueLabel(testIssueId, "ashep-excluded");
  });

  it("should return true for issue with ashep-excluded label", async () => {
    await addIssueLabel(testIssueId, "ashep-excluded");
    const result = await hasExcludedLabel(testIssueId);
    expect(result).toBe(true);
  });

  it("should return false for issue without ashep-excluded label", async () => {
    const result = await hasExcludedLabel(testIssueId);
    expect(result).toBe(false);
  });

  it("should return false for issue with no labels", async () => {
    // Remove all ashep-related labels
    const labels = await getIssueLabels(testIssueId);
    for (const label of labels) {
      if (label.startsWith("ashep-")) {
        await removeIssueLabel(testIssueId, label);
      }
    }
    
    const result = await hasExcludedLabel(testIssueId);
    expect(result).toBe(false);
  });

  it("should return false for unknown issue", async () => {
    const result = await hasExcludedLabel("nonexistent-test-issue-" + Date.now());
    expect(result).toBe(false);
  });

  it("should return true for issue with ashep-excluded among other labels", async () => {
    await addIssueLabel(testIssueId, "ashep-excluded");
    
    const result = await hasExcludedLabel(testIssueId);
    expect(result).toBe(true);
  });
});

describe("Exclusion Label Integration", () => {
  const testIssueId1 = "agent-shepherd-zhj.5";
  const testIssueId2 = "agent-shepherd-zhj.5.1";

  beforeEach(async () => {
    // Clean up labels before each test
    await removeIssueLabel(testIssueId1, "ashep-excluded");
    await removeIssueLabel(testIssueId2, "ashep-excluded");
  });

  afterEach(async () => {
    // Clean up labels after each test
    await removeIssueLabel(testIssueId1, "ashep-excluded");
    await removeIssueLabel(testIssueId2, "ashep-excluded");
  });

  it("should distinguish between excluded and non-excluded issues", async () => {
    // Add excluded label to first issue
    await addIssueLabel(testIssueId1, "ashep-excluded");

    const isExcluded1 = await hasExcludedLabel(testIssueId1);
    const isExcluded2 = await hasExcludedLabel(testIssueId2);

    expect(isExcluded1).toBe(true);
    expect(isExcluded2).toBe(false);
  });

  it("should handle mixed label scenarios", async () => {
    // Add excluded label to first issue
    await addIssueLabel(testIssueId1, "ashep-excluded");

    const isExcluded1 = await hasExcludedLabel(testIssueId1);
    const isExcluded2 = await hasExcludedLabel(testIssueId2);

    expect(isExcluded1).toBe(true);
    expect(isExcluded2).toBe(false);
  });

  it("should update hasExcludedLabel result after adding label", async () => {
    // Initially no excluded label
    let result = await hasExcludedLabel(testIssueId1);
    expect(result).toBe(false);

    // Add excluded label
    await addIssueLabel(testIssueId1, "ashep-excluded");

    // Now should be excluded
    result = await hasExcludedLabel(testIssueId1);
    expect(result).toBe(true);
  });

  it("should update hasExcludedLabel result after removing label", async () => {
    // Add excluded label
    await addIssueLabel(testIssueId1, "ashep-excluded");
    let result = await hasExcludedLabel(testIssueId1);
    expect(result).toBe(true);

    // Remove excluded label
    await removeIssueLabel(testIssueId1, "ashep-excluded");

    // Now should not be excluded
    result = await hasExcludedLabel(testIssueId1);
    expect(result).toBe(false);
  });
});
