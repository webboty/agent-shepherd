/**
 * Tests for Policy Engine
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PolicyEngine } from '../src/core/policy.ts';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('PolicyEngine', () => {
  let policyEngine: PolicyEngine;
  let tempDir: string;
  let policiesPath: string;

  beforeEach(() => {
    tempDir = join(process.cwd(), 'temp-test');
    policiesPath = join(tempDir, 'policies.yaml');
    
    // Create temp directory
    mkdirSync(tempDir, { recursive: true });
    
    // Create test policies file
    const testPolicies = `
policies:
  default:
    name: "Default Policy"
    description: "Test default policy"
    phases:
      - name: plan
        description: "Planning phase"
        capabilities: [planning, architecture]
        timeout_multiplier: 1.0
      - name: implement
        description: "Implementation phase"  
        capabilities: [coding, refactoring]
        timeout_multiplier: 2.0
    retry:
      max_attempts: 3
      backoff_strategy: exponential
      initial_delay_ms: 5000
      max_delay_ms: 300000
    timeout_base_ms: 300000
    stall_threshold_ms: 60000
    require_hitl: false

  strict:
    name: "Strict Policy"
    description: "Test strict policy"
    phases:
      - name: plan
        description: "Planning phase"
        capabilities: [planning, architecture]
        require_approval: true
      - name: implement
        description: "Implementation phase"
        capabilities: [coding, refactoring]
        require_approval: true
    retry:
      max_attempts: 1
      backoff_strategy: fixed
    timeout_base_ms: 180000
    require_hitl: true

default_policy: default
    `.trim();
    
    writeFileSync(policiesPath, testPolicies);
    policyEngine = new PolicyEngine(policiesPath);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Policy Loading', () => {
    it('should load policy names from YAML file', () => {
      const policyNames = policyEngine.getPolicyNames();
      expect(policyNames).toContain('default');
      expect(policyNames).toContain('strict');
    });

    it('should set default policy', () => {
      const defaultPolicy = policyEngine.getDefaultPolicyName();
      expect(defaultPolicy).toBe('default');
    });

    it('should get policy by name', () => {
      const policy = policyEngine.getPolicy('default');
      expect(policy).toBeDefined();
      expect(policy?.name).toBe('Default Policy');
      expect(policy?.phases).toHaveLength(2);
    });
  });

  describe('Phase Management', () => {
    it('should get phase sequence from policy', () => {
      const phases = policyEngine.getPhaseSequence('default');
      expect(phases).toHaveLength(2);
      expect(phases[0]).toBe('plan');
      expect(phases[1]).toBe('implement');
    });

    it('should get phase configuration', () => {
      const planPhase = policyEngine.getPhaseConfig('default', 'plan');
      const implementPhase = policyEngine.getPhaseConfig('default', 'implement');
      
      expect(planPhase?.capabilities).toEqual(['planning', 'architecture']);
      expect(implementPhase?.capabilities).toEqual(['coding', 'refactoring']);
    });

    it('should get next phase in sequence', () => {
      const nextPhase = policyEngine.getNextPhase('default', 'plan');
      expect(nextPhase).toBe('implement');
      
      const noNextPhase = policyEngine.getNextPhase('default', 'implement');
      expect(noNextPhase).toBe(null);
    });

    it('should determine phase transitions', () => {
      const transition = policyEngine.determineTransition('default', 'plan', {
        success: true
      });
      expect(transition.type).toBe('advance');
      expect(transition.next_phase).toBe('implement');
    });
  });
});