import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  hasExcludedLabel,
  getIssueLabels,
  addIssueLabel,
  removeIssueLabel,
  getIssue,
} from "../src/core/beads";
import {
  setupBeadsIsolation,
  cleanupBeadsEnv,
  type BeadsTestEnv
} from "./helpers/beads-test-isolation";

const TEST_ISSUE_PREFIX = "exclusion-control-test";

describe("hasExcludedLabel", () => {
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
      `${TEST_ISSUE_PREFIX}: Test issue for exclusion control`,
      "task",
      []
    );
  });

  afterEach(async () => {
    await beadsTestEnv.cleanup();
    cleanupBeadsEnv();
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
  let beadsTestEnv: BeadsTestEnv;
  let testIssueId1: string;
  let testIssueId2: string;

  beforeEach(async () => {
    beadsTestEnv = setupBeadsIsolation();
    await beadsTestEnv.initialize();

    // Set environment variables for the Beads functions to use the isolated database
    process.env.BEADS_DIR = beadsTestEnv.beadsDir;
    process.env.BD_NO_DAEMON = "true";
    process.env.BD_SANDBOX = "true";

    testIssueId1 = await beadsTestEnv.createIssue(
      `${TEST_ISSUE_PREFIX}: Test issue 1 for exclusion control`,
      "task",
      []
    );

    testIssueId2 = await beadsTestEnv.createIssue(
      `${TEST_ISSUE_PREFIX}: Test issue 2 for exclusion control`,
      "task",
      []
    );
  });

  afterEach(async () => {
    await beadsTestEnv.cleanup();
    cleanupBeadsEnv();
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
