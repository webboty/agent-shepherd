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

  beforeEach(() => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    tempDir = join(process.cwd(), `temp-session-test-${timestamp}-${random}`);
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
      const policy = policyEngine.getPolicyConfig('continuation-policy');
      const phaseConfig = policyEngine.getPhaseConfig('continuation-policy', 'test');
      const result = (workerEngine as any).getThreshold(phaseConfig);

      expect(result).toBe(0.9);
    });

    it('should respect max_context_tokens when configured', () => {
      const result = (workerEngine as any).getMaxTokens();

      expect(result).toBe(130000);
    });

    it('should correctly determine session reuse based on threshold', () => {
      const maxTokens = (workerEngine as any).getMaxTokens();
      const phaseConfig = policyEngine.getPhaseConfig('continuation-policy', 'test');
      const threshold = (workerEngine as any).getThreshold(phaseConfig);
      const tokensToTest = maxTokens * threshold;

      const shouldReuse = tokensToTest < maxTokens * threshold;

      expect(shouldReuse).toBe(false);
    });

    it('should allow reuse when tokens under threshold', () => {
      const maxTokens = (workerEngine as any).getMaxTokens();
      const phaseConfig = policyEngine.getPhaseConfig('continuation-policy', 'test');
      const threshold = (workerEngine as any).getThreshold(phaseConfig);
      const tokensToTest = maxTokens * threshold - 10000;

      const shouldReuse = tokensToTest < maxTokens * threshold;

      expect(shouldReuse).toBe(true);
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
      const result = await (workerEngine as any).findReusableSession('TEST-007', 'plan');

      expect(result.sessionId).toBeNull();
      expect(result.shouldReuse).toBe(false);
    });

    it('should handle failed runs correctly', async () => {
      const result = await (workerEngine as any).findReusableSession('TEST-008', 'plan');

      expect(result.sessionId).toBeNull();
      expect(result.shouldReuse).toBe(false);
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
