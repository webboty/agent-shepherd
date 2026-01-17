
import { describe, test, expect, spyOn } from "bun:test";
import { getEpicState } from "../src/core/beads";

describe("Beads State Parsing", () => {
  test("getEpicState handles '(no ... state set)' message as null", async () => {
    // Mock Bun.spawn to simulate the specific beads output
    const spawnSpy = spyOn(Bun, "spawn").mockImplementation((cmd: string[], options: any) => {
      // Check if this is the state command
      // cmd will be ["bd", "state", "test-epic", "assigned-worker"]
      
      const output = "(no assigned-worker state set)\n";
      
      return {
        stdout: new Response(output).body, // executing via stream
        stderr: new Response("").body,
        exited: Promise.resolve(0),
        kill: () => {},
        unref: () => {},
        ref: () => {},
        pid: 123,
      } as any;
    });

    const result = await getEpicState("test-epic", "assigned-worker");
    
    expect(result).toBeNull();
    
    // Cleanup
    spawnSpy.mockRestore();
  });

  test("getEpicState handles normal values", async () => {
    // Mock Bun.spawn for normal value
    const spawnSpy = spyOn(Bun, "spawn").mockImplementation((cmd: string[], options: any) => {
      return {
        stdout: new Response("worker-123\n").body,
        stderr: new Response("").body,
        exited: Promise.resolve(0),
        kill: () => {},
        unref: () => {},
        ref: () => {},
        pid: 123,
      } as any;
    });

    const result = await getEpicState("test-epic", "assigned-worker");
    
    expect(result).toBe("worker-123");
    
    spawnSpy.mockRestore();
  });
});
