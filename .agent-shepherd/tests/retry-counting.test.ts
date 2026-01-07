/**
 * Tests for Retry Counting Logic
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PolicyEngine } from '../src/core/policy.ts';
import { Logger } from '../src/core/logging.ts';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Retry Counting Logic', () => {
  let policyEngine: PolicyEngine;
  let logger: Logger;
  let tempDir: string;
  let policiesPath: string;
  let loggerDir: string;

  beforeEach(() => {
    tempDir = join(process.cwd(), 'temp-retry-test');
    policiesPath = join(tempDir, 'policies.yaml');
    loggerDir = join(tempDir, '.agent-shepherd');

    // Create temp directories
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(loggerDir, { recursive: true });

    // Create test policies file with retry configuration
    const testPolicies = `
policies:
  default:
    name: "Default Policy"
    description: "Test policy with retry"
    phases:
      - name: plan
        description: "Planning phase"
        capabilities: [planning]
      - name: implement
        description: "Implementation phase"
        capabilities: [coding]
    retry:
      max_attempts: 3
      backoff_strategy: exponential
      initial_delay_ms: 5000
      max_delay_ms: 300000
    timeout_base_ms: 300000

  limited:
    name: "Limited Policy"
    description: "Test policy with single attempt"
    phases:
      - name: plan
        description: "Planning phase"
        capabilities: [planning]
    retry:
      max_attempts: 1
      backoff_strategy: linear
      initial_delay_ms: 10000

default_policy: default
    `.trim();

    writeFileSync(policiesPath, testPolicies);
    policyEngine = new PolicyEngine(policiesPath);
    logger = new Logger(loggerDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Logger.getPhaseRetryCount()', () => {
    it('should return 0 for no failed attempts', () => {
      const retryCount = logger.getPhaseRetryCount('issue-1', 'plan');
      expect(retryCount).toBe(0);
    });

    it('should count 1 failed attempt', () => {
      logger.createRun({
        id: 'run-1',
        issue_id: 'issue-1',
        session_id: 'session-1',
        agent_id: 'agent-1',
        policy_name: 'default',
        phase: 'plan',
        status: 'failed',
      });

      const retryCount = logger.getPhaseRetryCount('issue-1', 'plan');
      expect(retryCount).toBe(1);
    });

    it('should count multiple failed attempts', () => {
      logger.createRun({
        id: 'run-1',
        issue_id: 'issue-1',
        session_id: 'session-1',
        agent_id: 'agent-1',
        policy_name: 'default',
        phase: 'plan',
        status: 'failed',
      });

      logger.createRun({
        id: 'run-2',
        issue_id: 'issue-1',
        session_id: 'session-2',
        agent_id: 'agent-1',
        policy_name: 'default',
        phase: 'plan',
        status: 'failed',
      });

      const retryCount = logger.getPhaseRetryCount('issue-1', 'plan');
      expect(retryCount).toBe(2);
    });

    it('should only count failed status', () => {
      logger.createRun({
        id: 'run-1',
        issue_id: 'issue-1',
        session_id: 'session-1',
        agent_id: 'agent-1',
        policy_name: 'default',
        phase: 'plan',
        status: 'failed',
      });

      logger.createRun({
        id: 'run-2',
        issue_id: 'issue-1',
        session_id: 'session-2',
        agent_id: 'agent-1',
        policy_name: 'default',
        phase: 'plan',
        status: 'completed',
      });

      logger.createRun({
        id: 'run-3',
        issue_id: 'issue-1',
        session_id: 'session-3',
        agent_id: 'agent-1',
        policy_name: 'default',
        phase: 'plan',
        status: 'pending',
      });

      const retryCount = logger.getPhaseRetryCount('issue-1', 'plan');
      expect(retryCount).toBe(1);
    });

    it('should filter by phase name', () => {
      logger.createRun({
        id: 'run-1',
        issue_id: 'issue-1',
        session_id: 'session-1',
        agent_id: 'agent-1',
        policy_name: 'default',
        phase: 'plan',
        status: 'failed',
      });

      logger.createRun({
        id: 'run-2',
        issue_id: 'issue-1',
        session_id: 'session-2',
        agent_id: 'agent-1',
        policy_name: 'default',
        phase: 'implement',
        status: 'failed',
      });

      const planRetryCount = logger.getPhaseRetryCount('issue-1', 'plan');
      const implementRetryCount = logger.getPhaseRetryCount('issue-1', 'implement');

      expect(planRetryCount).toBe(1);
      expect(implementRetryCount).toBe(1);
    });

    it('should filter by issue ID', () => {
      logger.createRun({
        id: 'run-1',
        issue_id: 'issue-1',
        session_id: 'session-1',
        agent_id: 'agent-1',
        policy_name: 'default',
        phase: 'plan',
        status: 'failed',
      });

      logger.createRun({
        id: 'run-2',
        issue_id: 'issue-2',
        session_id: 'session-2',
        agent_id: 'agent-1',
        policy_name: 'default',
        phase: 'plan',
        status: 'failed',
      });

      const retryCount1 = logger.getPhaseRetryCount('issue-1', 'plan');
      const retryCount2 = logger.getPhaseRetryCount('issue-2', 'plan');

      expect(retryCount1).toBe(1);
      expect(retryCount2).toBe(1);
    });
  });

  describe('PolicyEngine.determineTransition() with retry_count', () => {
    it('should allow retry on first failure (retry_count = 0, max_attempts = 3)', () => {
      const transition = await policyEngine.determineTransition('default', 'plan', {
        success: false,
        retry_count: 0,
      });

      expect(transition.type).toBe('retry');
      expect(transition.reason).toBe('Retry 1/3');
    });

    it('should allow retry on second failure (retry_count = 1, max_attempts = 3)', () => {
      const transition = await policyEngine.determineTransition('default', 'plan', {
        success: false,
        retry_count: 1,
      });

      expect(transition.type).toBe('retry');
      expect(transition.reason).toBe('Retry 2/3');
    });

    it('should block when retry_count reaches limit (retry_count = 2, max_attempts = 3)', () => {
      const transition = await policyEngine.determineTransition('default', 'plan', {
        success: false,
        retry_count: 2,
      });

      expect(transition.type).toBe('block');
      expect(transition.reason).toBe('Max retries exceeded (3)');
    });

    it('should block immediately with max_attempts = 1 (retry_count = 0)', () => {
      const transition = await policyEngine.determineTransition('limited', 'plan', {
        success: false,
        retry_count: 0,
      });

      expect(transition.type).toBe('block');
      expect(transition.reason).toBe('Max retries exceeded (1)');
    });

    it('should allow retry when retry_count is undefined (backward compatibility)', () => {
      const transition = await policyEngine.determineTransition('default', 'plan', {
        success: false,
        retry_count: undefined,
      });

      expect(transition.type).toBe('retry');
      expect(transition.reason).toBe('Retry 1/3');
    });

    it('should advance on success regardless of retry_count', () => {
      const transition = await policyEngine.determineTransition('default', 'plan', {
        success: true,
        retry_count: 5,
      });

      expect(transition.type).toBe('advance');
      expect(transition.next_phase).toBe('implement');
    });

    it('should close on success at last phase regardless of retry_count', () => {
      const transition = await policyEngine.determineTransition('default', 'implement', {
        success: true,
        retry_count: 5,
      });

      expect(transition.type).toBe('close');
      expect(transition.reason).toBe('All phases completed');
    });
  });

  describe('PolicyEngine.calculateRetryDelay()', () => {
    it('should calculate exponential backoff delays', () => {
      const delay0 = policyEngine.calculateRetryDelay('default', 0);
      const delay1 = policyEngine.calculateRetryDelay('default', 1);
      const delay2 = policyEngine.calculateRetryDelay('default', 2);

      expect(delay0).toBe(5000);
      expect(delay1).toBe(10000);
      expect(delay2).toBe(20000);
    });

    it('should calculate linear backoff delays', () => {
      const delay0 = policyEngine.calculateRetryDelay('limited', 0);
      const delay1 = policyEngine.calculateRetryDelay('limited', 1);
      const delay2 = policyEngine.calculateRetryDelay('limited', 2);

      expect(delay0).toBe(10000);
      expect(delay1).toBe(20000);
      expect(delay2).toBe(30000);
    });

    it('should enforce max_delay_ms limit', () => {
      const delay = policyEngine.calculateRetryDelay('default', 100);

      expect(delay).toBe(300000);
    });
  });

  describe('Integration: Retry Counting Flow', () => {
    it('should integrate logger and policy engine for retry decision', () => {
      const issueId = 'issue-test-1';
      const phase = 'plan';

      const initialRetryCount = logger.getPhaseRetryCount(issueId, phase);
      expect(initialRetryCount).toBe(0);

      const transition = await policyEngine.determineTransition('default', phase, {
        success: false,
        retry_count: initialRetryCount,
      });

      expect(transition.type).toBe('retry');
      expect(transition.reason).toBe('Retry 1/3');
    });

    it('should block after max failed attempts', () => {
      const issueId = 'issue-test-2';
      const phase = 'plan';

      for (let i = 0; i < 3; i++) {
        logger.createRun({
          id: `run-${i}`,
          issue_id: issueId,
          session_id: `session-${i}`,
          agent_id: 'agent-1',
          policy_name: 'default',
          phase,
          status: 'failed',
        });
      }

      const retryCount = logger.getPhaseRetryCount(issueId, phase);
      expect(retryCount).toBe(3);

      const transition = await policyEngine.determineTransition('default', phase, {
        success: false,
        retry_count: retryCount,
      });

      expect(transition.type).toBe('block');
      expect(transition.reason).toBe('Max retries exceeded (3)');
    });
  });
});
