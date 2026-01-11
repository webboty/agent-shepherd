/**
 * Integration Tests for Session Continuation
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { WorkerEngine } from '../src/core/worker-engine.ts';
import { PolicyEngine } from '../src/core/policy.ts';
import { getAgentRegistry } from '../src/core/agent-registry.ts';
import { getLogger } from '../src/core/logging.ts';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Session Continuation Integration', () => {
  let tempDir: string;
  let policiesPath: string;
  let agentsPath: string;
  let workerEngine: WorkerEngine;
  let policyEngine: PolicyEngine;
  let logger: ReturnType<typeof getLogger>;

  beforeEach(() => {
    tempDir = join(process.cwd(), 'temp-session-integration-test');
    policiesPath = join(tempDir, 'policies.yaml');
    agentsPath = join(tempDir, 'agents.yaml');

    mkdirSync(tempDir, { recursive: true });

    const testPolicies = `
policies:
  continuation-policy:
    name: "Session Continuation Test"
    shared_session: true
    phases:
      - name: plan
        capabilities: [planning]
        reuse_session_from_phase: "@first"
      - name: implement
        capabilities: [coding]
        reuse_session_from_phase: "@previous"
      - name: test
        capabilities: [testing]
        reuse_session_from_phase: "@shared"
        context_window_threshold: 0.9
      - name: validate
        capabilities: [validation]
        reuse_session_from_phase: "@self"
      - name: review
        capabilities: [review]
        reuse_session_from_phase: "plan"
        max_context_tokens: 100000
    retry:
      max_attempts: 2
      backoff_strategy: exponential
    timeout_base_ms: 300000

default_policy: continuation-policy
    `.trim();

    writeFileSync(policiesPath, testPolicies);

    const testAgents = `
version: "1.0"
agents:
  - id: planning-agent
    name: "Planning Agent"
    capabilities:
      - planning
    provider_id: test
    model_id: test-model
    priority: 10
  - id: coding-agent
    name: "Coding Agent"
    capabilities:
      - coding
    provider_id: test
    model_id: test-model
    priority: 10
  - id: testing-agent
    name: "Testing Agent"
    capabilities:
      - testing
    provider_id: test
    model_id: test-model
    priority: 10
  - id: validation-agent
    name: "Validation Agent"
    capabilities:
      - validation
    provider_id: test
    model_id: test-model
    priority: 10
  - id: review-agent
    name: "Review Agent"
    capabilities:
      - review
    provider_id: test
    model_id: test-model
    priority: 10
    `.trim();

    writeFileSync(agentsPath, testAgents);

    logger = getLogger(tempDir);
    policyEngine = new PolicyEngine(policiesPath);
    const agentRegistry = getAgentRegistry();
    agentRegistry.loadAgents(agentsPath);
    workerEngine = new WorkerEngine();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Keyword Resolution in Workflow', () => {
    it('should resolve @self keyword correctly', () => {
      const policy = policyEngine.getPolicyConfig('continuation-policy');
      const result = (workerEngine as any).resolveReuseTarget(
        'validate',
        '@self',
        policy
      );

      expect(result).toBe('validate');
    });

    it('should resolve @first keyword correctly', () => {
      const policy = policyEngine.getPolicyConfig('continuation-policy');
      const result = (workerEngine as any).resolveReuseTarget(
        'review',
        '@first',
        policy
      );

      expect(result).toBe('plan');
    });

    it('should resolve @previous keyword correctly', () => {
      const policy = policyEngine.getPolicyConfig('continuation-policy');
      const result = (workerEngine as any).resolveReuseTarget(
        'implement',
        '@previous',
        policy
      );

      expect(result).toBe('plan');
    });

    it('should resolve @shared keyword correctly', () => {
      const policy = policyEngine.getPolicyConfig('continuation-policy');
      const result = (workerEngine as any).resolveReuseTarget(
        'test',
        '@shared',
        policy
      );

      expect(result).toBe('@shared');
    });

    it('should resolve explicit phase name correctly', () => {
      const policy = policyEngine.getPolicyConfig('continuation-policy');
      const result = (workerEngine as any).resolveReuseTarget(
        'review',
        'plan',
        policy
      );

      expect(result).toBe('plan');
    });
  });

  describe('Token Threshold Integration', () => {
    it('should respect phase-specific threshold', () => {
      const issueId = 'TEST-001';
      const sessionId = 'session-123';

      logger.createRun({
        id: 'run-1',
        issue_id: issueId,
        session_id: sessionId,
        agent_id: 'testing-agent',
        policy_name: 'continuation-policy',
        phase: 'test',
        status: 'completed',
        outcome: {
          success: true,
          metrics: { tokens_used: 110000 }
        }
      });

      const phaseConfig = policyEngine.getPhaseConfig('continuation-policy', 'test');
      const threshold = (workerEngine as any).getThreshold(phaseConfig);

      expect(threshold).toBe(0.9);
    });

    it('should respect max_context_tokens when configured', () => {
      const issueId = 'TEST-002';
      const sessionId = 'session-456';

      logger.createRun({
        id: 'run-2',
        issue_id: issueId,
        session_id: sessionId,
        agent_id: 'review-agent',
        policy_name: 'continuation-policy',
        phase: 'review',
        status: 'completed',
        outcome: {
          success: true,
          metrics: { tokens_used: 90000 }
        }
      });

      const maxTokens = (workerEngine as any).getMaxTokens();

      expect(maxTokens).toBe(130000);
    });

    it('should correctly determine session reuse based on threshold', async () => {
      const issueId = 'TEST-003';
      const sessionId = 'session-789';

      logger.createRun({
        id: 'run-3',
        issue_id: issueId,
        session_id: sessionId,
        agent_id: 'testing-agent',
        policy_name: 'continuation-policy',
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

    it('should allow reuse when tokens under threshold', async () => {
      const issueId = 'TEST-004';
      const sessionId = 'session-abc';

      logger.createRun({
        id: 'run-4',
        issue_id: issueId,
        session_id: sessionId,
        agent_id: 'testing-agent',
        policy_name: 'continuation-policy',
        phase: 'test',
        status: 'completed',
        outcome: {
          success: true,
          metrics: { tokens_used: 50000 }
        }
      });

      const result = await (workerEngine as any).findReusableSession(issueId, 'test');

      expect(result.sessionId).toBe(sessionId);
      expect(result.shouldReuse).toBe(true);
    });
  });

  describe('Shared Session Across Phases', () => {
    it('should identify shared session target', () => {
      const policy = policyEngine.getPolicyConfig('continuation-policy');

      const result = (workerEngine as any).resolveReuseTarget(
        'test',
        '@shared',
        policy
      );

      expect(result).toBe('@shared');
    });

    it('should query runs for shared session', async () => {
      const issueId = 'TEST-005';
      const sessionId = 'shared-session-123';

      logger.createRun({
        id: 'run-5',
        issue_id: issueId,
        session_id: sessionId,
        agent_id: 'planning-agent',
        policy_name: 'continuation-policy',
        phase: 'plan',
        status: 'completed',
        outcome: {
          success: true,
          metrics: { tokens_used: 10000 }
        }
      });

      const result = await (workerEngine as any).findReusableSession(issueId, '@shared');

      expect(result.sessionId).toBe(sessionId);
      expect(result.shouldReuse).toBe(true);
    });

    it('should sum tokens across all shared runs', () => {
      const issueId = 'TEST-006';
      const sessionId = 'shared-session-456';

      logger.createRun({
        id: 'run-6a',
        issue_id: issueId,
        session_id: sessionId,
        agent_id: 'planning-agent',
        policy_name: 'continuation-policy',
        phase: 'plan',
        status: 'completed',
        outcome: {
          success: true,
          metrics: { tokens_used: 10000 }
        }
      });

      logger.createRun({
        id: 'run-6b',
        issue_id: issueId,
        session_id: sessionId,
        agent_id: 'coding-agent',
        policy_name: 'continuation-policy',
        phase: 'implement',
        status: 'completed',
        outcome: {
          success: true,
          metrics: { tokens_used: 20000 }
        }
      });

      const totalTokens = (workerEngine as any).sumTokensForSession(sessionId, issueId);

      expect(totalTokens).toBe(30000);
    });
  });

  describe('Phase Jumps with Session Continuation', () => {
    it('should handle jump back with phase reuse', () => {
      const policy = policyEngine.getPolicyConfig('continuation-policy');

      const prevPhase = (workerEngine as any).getPreviousPhase('implement', policy);

      expect(prevPhase).toBe('plan');
    });

    it('should resolve target for jump back scenario', () => {
      const policy = policyEngine.getPolicyConfig('continuation-policy');
      const result = (workerEngine as any).resolveReuseTarget(
        'review',
        'plan',
        policy
      );

      expect(result).toBe('plan');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing session_id gracefully', async () => {
      const issueId = 'TEST-007';

      logger.createRun({
        id: 'run-7',
        issue_id: issueId,
        session_id: '',
        agent_id: 'planning-agent',
        policy_name: 'continuation-policy',
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

    it('should handle failed runs correctly', async () => {
      const issueId = 'TEST-008';

      logger.createRun({
        id: 'run-8',
        issue_id: issueId,
        session_id: 'session-123',
        agent_id: 'planning-agent',
        policy_name: 'continuation-policy',
        phase: 'plan',
        status: 'failed',
        outcome: {
          success: false,
          error: 'Test failure'
        }
      });

      const result = await (workerEngine as any).findReusableSession(issueId, 'plan');

      expect(result.sessionId).toBeNull();
      expect(result.shouldReuse).toBe(false);
    });

    it('should handle missing token data', async () => {
      const issueId = 'TEST-009';
      const sessionId = 'session-xyz';

      logger.createRun({
        id: 'run-9',
        issue_id: issueId,
        session_id: sessionId,
        agent_id: 'planning-agent',
        policy_name: 'continuation-policy',
        phase: 'plan',
        status: 'completed',
        outcome: {
          success: true,
          metrics: {}
        }
      });

      const result = await (workerEngine as any).findReusableSession(issueId, 'plan');

      expect(result.sessionId).toBe(sessionId);
      expect(result.shouldReuse).toBe(true);
    });

    it('should return 0 tokens for empty metrics', () => {
      const issueId = 'TEST-010';
      const sessionId = 'session-empty';

      logger.createRun({
        id: 'run-10',
        issue_id: issueId,
        session_id: sessionId,
        agent_id: 'planning-agent',
        policy_name: 'continuation-policy',
        phase: 'plan',
        status: 'completed',
        outcome: {
          success: true,
          metrics: {}
        }
      });

      const totalTokens = (workerEngine as any).sumTokensForSession(sessionId, issueId);

      expect(totalTokens).toBe(0);
    });
  });

  describe('Workflow Integration Scenarios', () => {
    it('should handle multiple phases with different reuse strategies', () => {
      const policy = policyEngine.getPolicyConfig('continuation-policy');

      const planReuse = (workerEngine as any).resolveReuseTarget('plan', '@first', policy);
      const implementReuse = (workerEngine as any).resolveReuseTarget('implement', '@previous', policy);
      const testReuse = (workerEngine as any).resolveReuseTarget('test', '@shared', policy);
      const validateReuse = (workerEngine as any).resolveReuseTarget('validate', '@self', policy);
      const reviewReuse = (workerEngine as any).resolveReuseTarget('review', 'plan', policy);

      expect(planReuse).toBe('plan');
      expect(implementReuse).toBe('plan');
      expect(testReuse).toBe('@shared');
      expect(validateReuse).toBe('validate');
      expect(reviewReuse).toBe('plan');
    });

    it('should apply correct thresholds per phase', () => {
      const policy = policyEngine.getPolicyConfig('continuation-policy');

      const testPhase = policyEngine.getPhaseConfig('continuation-policy', 'test');
      const reviewPhase = policyEngine.getPhaseConfig('continuation-policy', 'review');
      const planPhase = policyEngine.getPhaseConfig('continuation-policy', 'plan');

      const testThreshold = (workerEngine as any).getThreshold(testPhase);
      const reviewThreshold = (workerEngine as any).getThreshold(reviewPhase);
      const planThreshold = (workerEngine as any).getThreshold(planPhase);

      expect(testThreshold).toBe(0.9);
      expect(reviewThreshold).toBe(0.8);
      expect(planThreshold).toBe(0.8);
    });
  });
});
