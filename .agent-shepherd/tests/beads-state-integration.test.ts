
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupBeadsIsolation, type BeadsTestEnv } from "./helpers/beads-test-isolation";
import { getEpicState } from "../src/core/beads";

describe("Beads State Integration Tests", () => {
  let beadsTestEnv: BeadsTestEnv;

  beforeEach(async () => {
    beadsTestEnv = setupBeadsIsolation();
    await beadsTestEnv.initialize();

    // Set environment variables for Beads functions to use isolated database
    process.env.BEADS_DIR = beadsTestEnv.beadsDir;
    process.env.BD_NO_DAEMON = "true";
    process.env.BD_SANDBOX = "true";
  });

  afterEach(async () => {
    await beadsTestEnv.cleanup();
    delete process.env.BEADS_DIR;
    delete process.env.BD_NO_DAEMON;
    delete process.env.BD_SANDBOX;
  });

  test("getEpicState should return null for unassigned epic using real CLI output", async () => {
    // 1. Create a test Epic
    const epicId = await beadsTestEnv.createIssue("Test Epic", "epic");
    
    // 2. Query the state using the real function (which invokes the CLI)
    // The CLI should return "(no assigned-worker state set)"
    const result = await getEpicState(epicId, "assigned-worker");
    
    // 3. Verify it is parsed as null
    expect(result).toBeNull();
  });

  test("getEpicState should return value when state is set", async () => {
    const epicId = await beadsTestEnv.createIssue("Test Epic 2", "epic");
    const workerId = "worker-integration-test";
    
    // Set state using CLI
    await beadsTestEnv.exec(["set-state", epicId, `assigned-worker=${workerId}`]);
    
    // Query
    const result = await getEpicState(epicId, "assigned-worker");
    
    expect(result).toBe(workerId);
  });
});
