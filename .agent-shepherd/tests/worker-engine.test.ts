/**
 * Tests for Worker Engine Session Continuation
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { WorkerEngine } from '../src/core/worker-engine.ts';
import { PolicyEngine } from '../src/core/policy.ts';
import { getLogger } from '../src/core/logging.ts';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('WorkerEngine Session Continuation', () => {
  let tempDir: string;
  let policiesPath: string;
  let workerEngine: WorkerEngine;
  let policyEngine: PolicyEngine;
  let logger: ReturnType<typeof getLogger>;

  beforeEach(() => {
    tempDir = join(process.cwd(), '.agent-shepherd', 'temp-session-test');
    policiesPath = join(tempDir, 'policies.yaml');

    mkdirSync(tempDir, { recursive: true });

    const testPolicies = `
policies:
  test-policy:
    name: "Test Policy"
    shared_session: true
    phases:
      - name: plan
        capabilities: [planning]
      - name: implement
        capabilities: [coding]
        reuse_session_from_phase: "@previous"
      - name: test
        capabilities: [testing]
        reuse_session_from_phase: "@shared"
        context_window_threshold: 0.9
      - name: review
        capabilities: [review]
        reuse_session_from_phase: "plan"
        max_context_tokens: 100000
      - name: first-phase
        capabilities: [planning]
    retry:
      max_attempts: 3
    timeout_base_ms: 300000

default_policy: test-policy
    `.trim();

    writeFileSync(policiesPath, testPolicies);

    policyEngine = new PolicyEngine(policiesPath);
    logger = getLogger(tempDir);
    workerEngine = new WorkerEngine();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('resolveReuseTarget', () => {
    it('should resolve @shared keyword when policy has shared_session enabled', () => {
      const policy = policyEngine.getPolicyConfig('test-policy');

      const result = (workerEngine as any).resolveReuseTarget(
        'implement',
        '@shared',
        policy
      );

      expect(result).toBe('@shared');
    });

    it('should return null for @shared when policy does not have shared_session', () => {
      const policyWithoutShared = {
        ...policyEngine.getPolicyConfig('test-policy'),
        shared_session: false
      };

      const result = (workerEngine as any).resolveReuseTarget(
        'implement',
        '@shared',
        policyWithoutShared
      );

      expect(result).toBeNull();
    });

    it('should resolve @previous to phase before current', () => {
      const policy = policyEngine.getPolicyConfig('test-policy');

      const result = (workerEngine as any).resolveReuseTarget(
        'implement',
        '@previous',
        policy
      );

      expect(result).toBe('plan');
    });

    it('should return null for @previous when at first phase', () => {
      const policy = policyEngine.getPolicyConfig('test-policy');

      const result = (workerEngine as any).resolveReuseTarget(
        'plan',
        '@previous',
        policy
      );

      expect(result).toBeNull();
    });

    it('should resolve @self to current phase name', () => {
      const policy = policyEngine.getPolicyConfig('test-policy');

      const result = (workerEngine as any).resolveReuseTarget(
        'test',
        '@self',
        policy
      );

      expect(result).toBe('test');
    });

    it('should resolve @first to first phase in policy', () => {
      const policy = policyEngine.getPolicyConfig('test-policy');

      const result = (workerEngine as any).resolveReuseTarget(
        'review',
        '@first',
        policy
      );

      expect(result).toBe('plan');
    });

    it('should resolve explicit phase name as-is', () => {
      const policy = policyEngine.getPolicyConfig('test-policy');

      const result = (workerEngine as any).resolveReuseTarget(
        'test',
        'plan',
        policy
      );

      expect(result).toBe('plan');
    });

    it('should handle invalid phase names gracefully', () => {
      const policy = policyEngine.getPolicyConfig('test-policy');

      const result = (workerEngine as any).resolveReuseTarget(
        'test',
        'nonexistent-phase',
        policy
      );

      expect(result).toBe('nonexistent-phase');
    });
  });

  describe('getPreviousPhase', () => {
    it('should return previous phase name', () => {
      const policy = policyEngine.getPolicyConfig('test-policy');

      const result = (workerEngine as any).getPreviousPhase('implement', policy);

      expect(result).toBe('plan');
    });

    it('should return null for first phase', () => {
      const policy = policyEngine.getPolicyConfig('test-policy');

      const result = (workerEngine as any).getPreviousPhase('plan', policy);

      expect(result).toBeNull();
    });

    it('should return null for unknown phase', () => {
      const policy = policyEngine.getPolicyConfig('test-policy');

      const result = (workerEngine as any).getPreviousPhase('unknown', policy);

      expect(result).toBeNull();
    });
  });

  describe('sumTokensForSession', () => {
    it('should sum tokens for a session across multiple runs', () => {
      const issueId = 'TEST-001';
      const sessionId = 'session-123';

      logger.createRun({
        id: 'run-1',
        issue_id: issueId,
        session_id: sessionId,
        agent_id: 'agent-1',
        policy_name: 'test-policy',
        phase: 'plan',
        status: 'completed',
        outcome: {
          success: true,
          metrics: { tokens_used: 5000 }
        }
      });

      logger.createRun({
        id: 'run-2',
        issue_id: issueId,
        session_id: sessionId,
        agent_id: 'agent-1',
        policy_name: 'test-policy',
        phase: 'implement',
        status: 'completed',
        outcome: {
          success: true,
          metrics: { tokens_used: 3000 }
        }
      });

      const result = (workerEngine as any).sumTokensForSession(sessionId, issueId);

      expect(result).toBe(8000);
    });

    it('should ignore runs from different sessions', () => {
      const issueId = 'TEST-001';
      const sessionId1 = 'session-123';
      const sessionId2 = 'session-456';

      logger.createRun({
        id: 'run-1',
        issue_id: issueId,
        session_id: sessionId1,
        agent_id: 'agent-1',
        policy_name: 'test-policy',
        phase: 'plan',
        status: 'completed',
        outcome: {
          success: true,
          metrics: { tokens_used: 5000 }
        }
      });

      logger.createRun({
        id: 'run-2',
        issue_id: issueId,
        session_id: sessionId2,
        agent_id: 'agent-1',
        policy_name: 'test-policy',
        phase: 'implement',
        status: 'completed',
        outcome: {
          success: true,
          metrics: { tokens_used: 3000 }
        }
      });

      const result = (workerEngine as any).sumTokensForSession(sessionId1, issueId);

      expect(result).toBe(5000);
    });

    it('should return 0 for session with no token data', () => {
      const issueId = 'TEST-001';
      const sessionId = 'session-123';

      logger.createRun({
        id: 'run-1',
        issue_id: issueId,
        session_id: sessionId,
        agent_id: 'agent-1',
        policy_name: 'test-policy',
        phase: 'plan',
        status: 'completed',
        outcome: {
          success: true,
          metrics: {}
        }
      });

      const result = (workerEngine as any).sumTokensForSession(sessionId, issueId);

      expect(result).toBe(0);
    });

    it('should return 0 for non-existent session', () => {
      const issueId = 'TEST-001';
      const sessionId = 'nonexistent-session';

      const result = (workerEngine as any).sumTokensForSession(sessionId, issueId);

      expect(result).toBe(0);
    });
  });

  describe('getMaxTokens', () => {
    it('should return default max tokens when not configured', () => {
      const result = (workerEngine as any).getMaxTokens();

      expect(result).toBe(130000);
    });
  });

  describe('getThreshold', () => {
    it('should return phase-specific threshold when configured', () => {
      const phaseConfig = policyEngine.getPhaseConfig('test-policy', 'test');

      const result = (workerEngine as any).getThreshold(phaseConfig);

      expect(result).toBe(0.9);
    });

    it('should return default threshold when phase not configured', () => {
      const phaseConfig = policyEngine.getPhaseConfig('test-policy', 'implement');

      const result = (workerEngine as any).getThreshold(phaseConfig);

      expect(result).toBe(0.8);
    });

    it('should return default threshold when no phase config provided', () => {
      const result = (workerEngine as any).getThreshold();

      expect(result).toBe(0.8);
    });
  });

  describe('findReusableSession', () => {
    it('should find and reuse session when under threshold', async () => {
      const issueId = 'TEST-001';
      const sessionId = 'session-123';

      logger.createRun({
        id: 'run-1',
        issue_id: issueId,
        session_id: sessionId,
        agent_id: 'agent-1',
        policy_name: 'test-policy',
        phase: 'plan',
        status: 'completed',
        outcome: {
          success: true,
          metrics: { tokens_used: 50000 }
        }
      });

      const result = await (workerEngine as any).findReusableSession(issueId, 'plan');

      expect(result.sessionId).toBe(sessionId);
      expect(result.shouldReuse).toBe(true);
    });

    it('should not reuse session when exceeding threshold', async () => {
      const issueId = 'TEST-001';
      const sessionId = 'session-123';

      logger.createRun({
        id: 'run-1',
        issue_id: issueId,
        session_id: sessionId,
        agent_id: 'agent-1',
        policy_name: 'test-policy',
        phase: 'test',
        status: 'completed',
        outcome: {
          success: true,
          metrics: { tokens_used: 120000 }
        }
      });

      const result = await (workerEngine as any).findReusableSession(issueId, 'test');

      expect(result.sessionId).toBe(sessionId);
      expect(result.shouldReuse).toBe(false);
    });

    it('should return null when no runs exist for phase', async () => {
      const issueId = 'TEST-001';

      const result = await (workerEngine as any).findReusableSession(issueId, 'nonexistent');

      expect(result.sessionId).toBeNull();
      expect(result.shouldReuse).toBe(false);
    });

    it('should return null for failed runs', async () => {
      const issueId = 'TEST-001';

      logger.createRun({
        id: 'run-1',
        issue_id: issueId,
        session_id: 'session-123',
        agent_id: 'agent-1',
        policy_name: 'test-policy',
        phase: 'plan',
        status: 'failed',
        outcome: {
          success: false,
          error: 'Test error'
        }
      });

      const result = await (workerEngine as any).findReusableSession(issueId, 'plan');

      expect(result.sessionId).toBeNull();
      expect(result.shouldReuse).toBe(false);
    });

    it('should respect phase-specific threshold', async () => {
      const issueId = 'TEST-001';
      const sessionId = 'session-123';

      logger.createRun({
        id: 'run-1',
        issue_id: issueId,
        session_id: sessionId,
        agent_id: 'agent-1',
        policy_name: 'test-policy',
        phase: 'test',
        status: 'completed',
        outcome: {
          success: true,
          metrics: { tokens_used: 115000 }
        }
      });

      const result = await (workerEngine as any).findReusableSession(issueId, 'test');

      expect(result.sessionId).toBe(sessionId);
      expect(result.shouldReuse).toBe(false);
    });

    it('should return null when session_id is missing', async () => {
      const issueId = 'TEST-001';

      logger.createRun({
        id: 'run-1',
        issue_id: issueId,
        session_id: '',
        agent_id: 'agent-1',
        policy_name: 'test-policy',
        phase: 'plan',
        status: 'completed',
        outcome: {
          success: true,
          metrics: { tokens_used: 5000 }
        }
      });

      const result = await (workerEngine as any).findReusableSession(issueId, 'plan');

      expect(result.sessionId).toBeNull();
      expect(result.shouldReuse).toBe(false);
    });
  });
});
