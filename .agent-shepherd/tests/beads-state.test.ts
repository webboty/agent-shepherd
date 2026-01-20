
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { getEpicState } from "../src/core/beads";

describe("Beads State Unit Tests", () => {
  const originalSpawn = Bun.spawn;

  beforeEach(() => {
    // Mock Bun.spawn to avoid real CLI execution
    (Bun as any).spawn = mock((args: string[], options?: any) => {
      const command = args.join(" ");
      let stdout = "";
      
      // Mock responses based on command arguments
      // Matches args like: ["bd", "state", "Test Epic", "assigned-worker"]
      if (command.includes("state") && command.includes("assigned-worker")) {
         if (command.includes("Test Epic 2")) {
           // For the set value test
           stdout = "worker-integration-test";
         } else if (command.includes("Test Epic")) {
           // For the null test
           stdout = "(no assigned-worker state set)";
         }
      }

      return {
        stdout: new Response(stdout).body,
        stderr: new Response("").body,
        exited: Promise.resolve(0),
        kill: () => {},
        unref: () => {},
      } as any;
    });
  });

  afterEach(() => {
    // Restore original Bun.spawn
    Bun.spawn = originalSpawn;
  });

  test("getEpicState should return null for unassigned epic using mocked CLI output", async () => {
    // No need to create issue in DB, just checking parser logic
    const epicId = "Test Epic";
    
    const result = await getEpicState(epicId, "assigned-worker");
    
    // Verify it parses the specific Beads output format correctly
    expect(result).toBeNull();
  });

  test("getEpicState should return value when state is set using mocked CLI output", async () => {
    const epicId = "Test Epic 2";
    const workerId = "worker-integration-test";
    
    // The mock is set up to return 'worker-integration-test' for this ID
    const result = await getEpicState(epicId, "assigned-worker");
    
    expect(result).toBe(workerId);
  });
});
