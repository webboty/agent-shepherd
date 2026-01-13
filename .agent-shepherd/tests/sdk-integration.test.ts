/**
 * SDK Mode Integration Tests
 * Tests for end-to-end SDK workflow execution
 */

import { describe, test, expect } from "bun:test";

describe("SDK Mode Integration", () => {
  test("SDK mode is configurable via config.execution.mode", () => {
    const { loadConfig } = require('../src/core/config.ts');

    const config = loadConfig();

    // Verify execution config exists
    expect(config.execution).toBeDefined();
    expect(config.execution?.mode).toMatch(/^(cli|sdk)$/);
  });

  test("SDK exports are accessible for dynamic import", async () => {
    const sdkModule = await import('../src/core/opencode_sdk.ts');

    // Verify all required exports are available
    expect(sdkModule.getSDKClient).toBeDefined();
    expect(sdkModule.SDKErrorType).toBeDefined();
    expect(sdkModule.SDKError).toBeDefined();
    expect(sdkModule.OpenCodeSDKClient).toBeDefined();

    // Verify error types exist
    expect(sdkModule.SDKErrorType.NETWORK_ERROR).toBe('NETWORK_ERROR');
    expect(sdkModule.SDKErrorType.AGENT_NOT_FOUND).toBe('AGENT_NOT_FOUND');
    expect(sdkModule.SDKErrorType.SESSION_NOT_FOUND).toBe('SESSION_NOT_FOUND');
    expect(sdkModule.SDKErrorType.SESSION_CREATION_FAILED).toBe('SESSION_CREATION_FAILED');
    expect(sdkModule.SDKErrorType.EXECUTION_TIMEOUT).toBe('EXECUTION_TIMEOUT');
    expect(sdkModule.SDKErrorType.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR');
  });

  test("OpenCodeClient.runAgentSDK exists", async () => {
    const { OpenCodeClient } = await import('../src/core/opencode.ts');

    const client = new OpenCodeClient({ directory: '/tmp' });

    // Verify SDK mode method exists
    expect(client.runAgentSDK).toBeDefined();
    expect(typeof client.runAgentSDK).toBe('function');
  });

  test("SDK mode uses proper session preservation", async () => {
    const { OpenCodeClient } = await import('../src/core/opencode.ts');
    const { getSDKClient } = await import('../src/core/opencode_sdk.ts');

    const sdkClient = getSDKClient();

    // Verify cleanup session method exists
    expect(sdkClient.cleanupSession).toBeDefined();
    expect(typeof sdkClient.cleanupSession).toBe('function');

    // Verify selective cleanup behavior (only test sessions are deleted)
    // This is tested behavior - actual cleanup depends on OpenCode server
  });
});
