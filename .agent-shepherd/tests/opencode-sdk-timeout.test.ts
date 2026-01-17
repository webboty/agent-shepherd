
import { describe, test, expect, spyOn } from "bun:test";
import { OpenCodeSDKClient, SDKErrorType } from "../src/core/opencode_sdk";

describe("OpenCode SDK Client - waitForCompletion", () => {
  test("waitForCompletion returns timeout after 10 minutes", async () => {
    // Create client
    const client = new OpenCodeSDKClient();
    
    // Spy on getSessionMessages to return empty array (simulating stalled session)
    spyOn(client, "getSessionMessages").mockImplementation(async () => {
      return [];
    });
    
    // Use a very short timeout for testing (e.g., 100ms) to avoid hanging the test
    const timeoutMs = 100;
    const pollIntervalMs = 10;
    
    // Call waitForCompletion
    const result = await client.waitForCompletion("test-session-id", timeoutMs, pollIntervalMs);
    
    // Assertions
    expect(result.success).toBe(false);
    expect(result.errorType).toBe(SDKErrorType.EXECUTION_TIMEOUT);
    expect(result.error).toContain(`Session test-session-id did not complete within ${timeoutMs}ms`);
  });
  
  test("waitForCompletion reports waiting status", async () => {
    const client = new OpenCodeSDKClient();
    spyOn(client, "getSessionMessages").mockImplementation(async () => []);
    
    // Use jest.fn() equivalent if available, or just a simple mock function
    const onProgress = ((msg: string) => {}) as any;
    // But bun:test spyOn works on objects. 
    // We can use a simple wrapper object.
    
    const progressMonitor = {
      report: (msg: string) => {}
    };
    
    const reportSpy = spyOn(progressMonitor, "report");
    
    await client.waitForCompletion("test-session-id", 50, 10, progressMonitor.report);
    
    // Verify it called "Waiting for session to start..." at least once
    expect(reportSpy).toHaveBeenCalledWith("Waiting for session to start...");
  });
});
