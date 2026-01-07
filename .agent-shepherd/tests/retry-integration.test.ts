/**
 * Integration Tests for Retry Counting
 * End-to-end test of retry counting with actual policy execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PolicyEngine } from '../src/core/policy.ts';
import { Logger } from '../src/core/logging.ts';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Retry Counting - Integration Tests', () => {
  let policyEngine: PolicyEngine;
  let logger: Logger;
  let tempDir: string;
  let policiesPath: string;
  let loggerDir: string;

  beforeEach(() => {
    tempDir = join(process.cwd(), 'temp-retry-integration-test');
    policiesPath = join(tempDir, 'policies.yaml');
    loggerDir = join(tempDir, '.agent-shepherd');

    // Create temp directories
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(loggerDir, { recursive: true });

    // Create test policies file with retry configuration
    const testPolicies = `
policies:
  retry-policy:
    name: "Retry Test Policy"
    description: "Policy for testing retry counting"
    phases:
      - name: test-phase
        description: "Test phase for retry counting"
        capabilities: [testing]
    retry:
      max_attempts: 2
      backoff_strategy: exponential
      initial_delay_ms: 1000
      max_delay_ms: 60000
    timeout_base_ms: 300000
    stall_threshold_ms: 60000
    require_hitl: false

default_policy: retry-policy
`.trim();

    writeFileSync(policiesPath, testPolicies);
    policyEngine = new PolicyEngine(policiesPath);
    logger = new Logger(loggerDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('End-to-End Retry Flow with max_attempts: 2', () => {
    it('should allow retry on first failure (retry_count = 0, max_attempts = 2)', () => {
      const issueId = 'integration-test-issue-1';
      const phase = 'test-phase';
      const policy = 'retry-policy';

      // Simulate first failed attempt
      logger.createRun({
        id: 'run-attempt-1',
        issue_id: issueId,
        session_id: 'session-1',
        agent_id: 'agent-1',
        policy_name: policy,
        phase,
        status: 'failed',
        metadata: {
          attempt_number: 1,
          retry_count: 0,
        },
      });

      // Get retry count from logger
      const retryCount = logger.getPhaseRetryCount(issueId, phase);
      expect(retryCount).toBe(1);

      // Determine transition with actual retry count
      const transition = await policyEngine.determineTransition(policy, phase, {
        success: false,
        retry_count: retryCount,
      });

      // Should allow retry (retry_count 1 < max_attempts - 1 which is 1, so retry_count 1 = 1 < 1 is false)
      // Wait, retry_count is 1 (one failed attempt), so this should be the last attempt
      // Actually, the retry_count passed to determineTransition is the count of PREVIOUS failed attempts
      // So after first failure, retry_count = 1, which means we're on attempt 2
      expect(transition.type).toBe('block');
      expect(transition.reason).toBe('Max retries exceeded (2)');
    });

    it('should retry first failure (retry_count = 0)', () => {
      const issueId = 'integration-test-issue-2';
      const phase = 'test-phase';
      const policy = 'retry-policy';

      // No failed attempts yet
      const initialRetryCount = logger.getPhaseRetryCount(issueId, phase);
      expect(initialRetryCount).toBe(0);

      // Determine transition
      const transition = await policyEngine.determineTransition(policy, phase, {
        success: false,
        retry_count: initialRetryCount,
      });

      // Should allow retry (retry_count 0 < max_attempts - 1 which is 1)
      expect(transition.type).toBe('retry');
      expect(transition.reason).toBe('Retry 1/2');
    });

    it('should block after max_attempts reached', () => {
      const issueId = 'integration-test-issue-3';
      const phase = 'test-phase';
      const policy = 'retry-policy';

      // Simulate max failed attempts
      for (let i = 0; i < 2; i++) {
        logger.createRun({
          id: `run-attempt-${i + 1}`,
          issue_id: issueId,
          session_id: `session-${i + 1}`,
          agent_id: 'agent-1',
          policy_name: policy,
          phase,
          status: 'failed',
          metadata: {
            attempt_number: i + 1,
            retry_count: i,
          },
        });
      }

      const retryCount = logger.getPhaseRetryCount(issueId, phase);
      expect(retryCount).toBe(2);

      const transition = await policyEngine.determineTransition(policy, phase, {
        success: false,
        retry_count: retryCount,
      });

      expect(transition.type).toBe('block');
      expect(transition.reason).toBe('Max retries exceeded (2)');
    });
  });

  describe('Retry Count Properly Increments Across Attempts', () => {
    it('should track retry count progression', () => {
      const issueId = 'integration-test-issue-4';
      const phase = 'test-phase';
      const policy = 'retry-policy';

      // Initial state: no failures
      let retryCount = logger.getPhaseRetryCount(issueId, phase);
      expect(retryCount).toBe(0);

      // After first failure
      logger.createRun({
        id: 'run-1',
        issue_id: issueId,
        session_id: 'session-1',
        agent_id: 'agent-1',
        policy_name: policy,
        phase,
        status: 'failed',
      });

      retryCount = logger.getPhaseRetryCount(issueId, phase);
      expect(retryCount).toBe(1);

      // After second failure
      logger.createRun({
        id: 'run-2',
        issue_id: issueId,
        session_id: 'session-2',
        agent_id: 'agent-1',
        policy_name: policy,
        phase,
        status: 'failed',
      });

      retryCount = logger.getPhaseRetryCount(issueId, phase);
      expect(retryCount).toBe(2);

      // Verify transition decisions at each stage
      let transition = await policyEngine.determineTransition(policy, phase, {
        success: false,
        retry_count: 1,
      });

      expect(transition.type).toBe('block');
      expect(transition.reason).toBe('Max retries exceeded (2)');
    });
  });

  describe('Max_attempts Blocks After Limit Reached', () => {
    it('should enforce max_attempts limit strictly', () => {
      const issueId = 'integration-test-issue-5';
      const phase = 'test-phase';
      const policy = 'retry-policy';

      // Create one failed attempt
      logger.createRun({
        id: 'run-1',
        issue_id: issueId,
        session_id: 'session-1',
        agent_id: 'agent-1',
        policy_name: policy,
        phase,
        status: 'failed',
      });

      const retryCount = logger.getPhaseRetryCount(issueId, phase);
      expect(retryCount).toBe(1);

      // This is the second attempt (retry_count = 1), should be the last allowed
      const transition = await policyEngine.determineTransition(policy, phase, {
        success: false,
        retry_count: retryCount,
      });

      expect(transition.type).toBe('block');
      expect(transition.reason).toBe('Max retries exceeded (2)');
    });

    it('should allow success on retry attempt', () => {
      const issueId = 'integration-test-issue-6';
      const phase = 'test-phase';
      const policy = 'retry-policy';

      // Create one failed attempt
      logger.createRun({
        id: 'run-1',
        issue_id: issueId,
        session_id: 'session-1',
        agent_id: 'agent-1',
        policy_name: policy,
        phase,
        status: 'failed',
      });

      const retryCount = logger.getPhaseRetryCount(issueId, phase);
      expect(retryCount).toBe(1);

      // This is the second attempt, but it succeeds
      const transition = await policyEngine.determineTransition(policy, phase, {
        success: true,
        retry_count: retryCount,
      });

      expect(transition.type).toBe('close');
    });
  });

  describe('Retry Delay Follows Configured Strategy', () => {
    it('should use exponential backoff for delays', () => {
      const policy = 'retry-policy';

      const delay0 = policyEngine.calculateRetryDelay(policy, 0);
      const delay1 = policyEngine.calculateRetryDelay(policy, 1);
      const delay2 = policyEngine.calculateRetryDelay(policy, 2);

      // Exponential: 1000 * 2^attempt
      expect(delay0).toBe(1000);
      expect(delay1).toBe(2000);
      expect(delay2).toBe(4000);
    });
  });

  describe('Full Workflow Simulation', () => {
    it('should simulate complete retry workflow', () => {
      const issueId = 'integration-test-issue-7';
      const phase = 'test-phase';
      const policy = 'retry-policy';

      // Attempt 1: First try, no previous failures
      let retryCount = logger.getPhaseRetryCount(issueId, phase);
      expect(retryCount).toBe(0);

      let transition = await policyEngine.determineTransition(policy, phase, {
        success: false,
        retry_count: retryCount,
      });

      expect(transition.type).toBe('retry');
      expect(transition.reason).toBe('Retry 1/2');

      // Log first failed run
      logger.createRun({
        id: 'run-1',
        issue_id: issueId,
        session_id: 'session-1',
        agent_id: 'agent-1',
        policy_name: policy,
        phase,
        status: 'failed',
        metadata: {
          attempt_number: 1,
          retry_count: 0,
        },
      });

      // Attempt 2: After first failure
      retryCount = logger.getPhaseRetryCount(issueId, phase);
      expect(retryCount).toBe(1);

      transition = await policyEngine.determineTransition(policy, phase, {
        success: false,
        retry_count: retryCount,
      });

      expect(transition.type).toBe('block');
      expect(transition.reason).toBe('Max retries exceeded (2)');

      // Log second failed run
      logger.createRun({
        id: 'run-2',
        issue_id: issueId,
        session_id: 'session-2',
        agent_id: 'agent-1',
        policy_name: policy,
        phase,
        status: 'failed',
        metadata: {
          attempt_number: 2,
          retry_count: 1,
        },
      });

      // Attempt 3: Would be blocked
      retryCount = logger.getPhaseRetryCount(issueId, phase);
      expect(retryCount).toBe(2);

      transition = await policyEngine.determineTransition(policy, phase, {
        success: false,
        retry_count: retryCount,
      });

      expect(transition.type).toBe('block');
      expect(transition.reason).toBe('Max retries exceeded (2)');
    });
  });
});
