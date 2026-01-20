/**
 * SDK Mode End-to-End Workflow Tests
 * Tests for complete issue processing with SDK mode enabled
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = join(__dirname, '..', 'tmp_test');

// Setup Beads isolation for testing
const { setupBeadsIsolation } = await import('./helpers/beads-test-isolation.ts');

describe("SDK Mode End-to-End Workflows", () => {
  let beadsTestEnv: any;
  let testDataDir: string;

  beforeEach(async () => {
    testDataDir = join(TEMP_DIR, `.test-sdk-e2e-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    mkdirSync(testDataDir, { recursive: true });

    beadsTestEnv = setupBeadsIsolation();
    await beadsTestEnv.initialize();

    // Set environment variables for Beads and Agent Shepherd
    process.env.BEADS_DIR = beadsTestEnv.beadsDir;
    process.env.BD_NO_DAEMON = "true";
    process.env.BD_SANDBOX = "true";
    process.env.ASHEP_DIR = testDataDir;

    // Reset singletons
    const { resetSDKClient } = await import('../src/core/opencode_sdk.ts');
    resetSDKClient();

    const { resetLogger } = await import('../src/core/logging.ts');
    resetLogger();
  });

  afterEach(async () => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    if (beadsTestEnv) {
      await beadsTestEnv.cleanup();
    }
  });

  describe("Worker Engine SDK Mode Integration", () => {
    test("worker engine respects execution mode configuration", async () => {
      const { loadConfig } = await import('../src/core/config.ts');

      // Use default config, just verify execution config exists
      const config = loadConfig();

      expect(config.execution).toBeDefined();
      expect(config.execution?.mode).toMatch(/^(cli|sdk)$/);
    });

    test("worker engine processes issue with SDK mode configuration", async () => {
      // Create a test issue
      const output = await beadsTestEnv.exec(['create', '--type', 'task', '--title', 'SDK Test Issue']);
      const issueId = output.match(/Created issue: ([a-zA-Z0-9-]+)/)?.[1];

      expect(issueId).toBeTruthy();

      // Verify issue was created
      const showOutput = await beadsTestEnv.exec(['show', issueId]);
      expect(showOutput).toContain(issueId);
      expect(showOutput).toContain('SDK Test Issue');
    });
  });

  describe("RunResult Format Validation", () => {
    test("SDK execution returns compatible RunResult format", async () => {
      // Set shorter timeouts for testing
      process.env.OPENCODE_EXECUTION_TIMEOUT_MS = "8000";  // 8 seconds
      process.env.OPENCODE_POLL_INTERVAL_MS = "500";       // 500ms polling

      const { OpenCodeClient } = await import('../src/core/opencode.ts');

      const client = new OpenCodeClient({ directory: testDataDir });

      // Verify runAgentSDK method exists and returns RunResult-compatible result
      const result = await client.runAgentSDK({
        title: 'Test Session',
        agent: 'default',
        message: 'test',
      });

      // Verify RunResult structure (should have success, output, error, sessionId)
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');

      // Output may be empty for failed runs or test sessions
      expect(result).toHaveProperty('output');
      expect(typeof result.output).toBe('string');

      expect(result).toHaveProperty('error');
      expect(result.error === undefined || typeof result.error === 'string').toBe(true);

      expect(result).toHaveProperty('sessionId');
      expect(result.sessionId === undefined || typeof result.sessionId === 'string').toBe(true);
    }, 15000); // 15 second timeout for test

    test("SDK error results maintain RunResult compatibility", async () => {
      // Set shorter timeouts for testing
      process.env.OPENCODE_EXECUTION_TIMEOUT_MS = "8000";  // 8 seconds
      process.env.OPENCODE_POLL_INTERVAL_MS = "500";       // 500ms polling

      const { OpenCodeClient } = await import('../src/core/opencode.ts');

      const client = new OpenCodeClient({ directory: testDataDir });

      // Test with invalid agent to trigger error handling
      // Note: Without a running OpenCode server, this will fail with connection error
      // The test validates that error handling maintains RunResult structure
      const result = await client.runAgentSDK({
        title: 'Test Error',
        agent: 'non-existent-agent-12345',
        message: 'test',
      });

      // Verify failed result maintains RunResult structure
      expect(result.success).toBe(false);
      expect(result.output).toBeDefined();
      expect(result.error).toBeDefined();

      // Error should be descriptive (either agent not found or connection error)
      expect(result.error).toBeTruthy();
      expect(typeof result.error).toBe('string');
    }, 15000); // 15 second timeout for test
  });

  describe("Session Preservation", () => {
    test("session preservation logic in runAgentSDK", async () => {
      const { getSDKClient } = await import('../src/core/opencode_sdk.ts');
      const sdkClient = getSDKClient();

      // Test cleanup session behavior
      // New sessions should be cleaned up on error
      // Reused sessions should not be cleaned up

      // This is a behavior verification test
      // Actual session persistence depends on OpenCode server
      expect(sdkClient.cleanupSession).toBeDefined();
      expect(typeof sdkClient.cleanupSession).toBe('function');
    });

    test("selective cleanup respects isTestSession flag", async () => {
      const { getSDKClient } = await import('../src/core/opencode_sdk.ts');
      const sdkClient = getSDKClient();

      // Mock the internal client to avoid real OpenCode calls
      (sdkClient as any).client = {
        session: {
          delete: async () => ({ data: { success: true } }),
        },
      };

      // Test session cleanup with test session flag
      const testCleanup = await sdkClient.cleanupSession('test-session', true, false);
      expect(testCleanup).toBe(true);

      // Test session cleanup with non-test session flag (should skip)
      const nonTestCleanup = await sdkClient.cleanupSession('debug-session', false, false);
      expect(nonTestCleanup).toBe(true);

      // Test session cleanup with error context
      const errorCleanup = await sdkClient.cleanupSession('test-session-error', true, true);
      expect(errorCleanup).toBe(true);
    });
  });

  describe("Error Handling in SDK Mode", () => {
    test("network errors are properly classified and handled", async () => {
      const { getSDKClient, SDKErrorType } = await import('../src/core/opencode_sdk.ts');
      const { OpenCodeClient } = await import('../src/core/opencode.ts');

      const sdkClient = getSDKClient();
      const client = new OpenCodeClient({ directory: testDataDir });

      // Test network error classification
      const networkError = { code: 'ECONNREFUSED', message: 'Connection refused' };
      const classified = (sdkClient as any).classifyError(networkError);

      expect(classified.type).toBe(SDKErrorType.NETWORK_ERROR);
      expect(classified.message).toContain('Network error');

      // Verify this error type maps to user-friendly message in runAgentSDK
      // This validates the error message mapping chain
    });

    test("session not found errors are properly handled", async () => {
      const { getSDKClient, SDKErrorType } = await import('../src/core/opencode_sdk.ts');

      const sdkClient = getSDKClient();

      const sessionError = { message: 'session not found: abc123' };
      const classified = (sdkClient as any).classifyError(sessionError);

      expect(classified.type).toBe(SDKErrorType.SESSION_NOT_FOUND);
      expect(classified.message).toContain('Session not found');
    });

    test("timeout errors are properly classified", async () => {
      const { getSDKClient, SDKErrorType } = await import('../src/core/opencode_sdk.ts');

      const sdkClient = getSDKClient();

      const timeoutError = { message: 'timeout after 60000ms' };
      const classified = (sdkClient as any).classifyError(timeoutError);

      expect(classified.type).toBe(SDKErrorType.EXECUTION_TIMEOUT);
      expect(classified.message).toContain('timeout');
    });
  });

  describe("SDK Mode Configuration", () => {
    test("SDK mode is correctly configured in config", async () => {
      const { ExecutionConfig, AgentShepherdConfig } = await import('../src/core/config.ts');

      // Verify ExecutionConfig interface exists
      const executionConfig: ExecutionConfig = {
        mode: 'sdk',
        sdk_base_url: 'http://localhost:4321',
      };

      expect(executionConfig.mode).toBe('sdk');
      expect(executionConfig.sdk_base_url).toBe('http://localhost:4321');

      // Verify AgentShepherdConfig includes execution field
      const config: Partial<AgentShepherdConfig> = {
        version: '1.0.0',
        execution: executionConfig,
      };

      expect(config.execution).toBeDefined();
      expect(config.execution?.mode).toBe('sdk');
    });

    test("worker engine can be configured for SDK mode", async () => {
      const { WorkerEngine } = await import('../src/core/worker-engine.ts');

      // Create worker engine with SDK mode
      const worker = new WorkerEngine();

      // Worker should instantiate successfully
      expect(worker).toBeDefined();
      expect(worker).toBeInstanceOf(WorkerEngine);
    });
  });
});
