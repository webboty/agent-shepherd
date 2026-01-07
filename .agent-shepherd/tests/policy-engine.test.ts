/**
 * Tests for Policy Engine
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PolicyEngine } from '../src/core/policy.ts';
import { writeFileSync, rmSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import Ajv from 'ajv';

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

  describe('Conditional Transitions', () => {
    beforeEach(() => {
      const policiesWithTransitions = `
policies:
  default:
    name: "Default Policy"
    phases:
      - name: plan
        capabilities: [planning]
        transitions:
          on_success: implement
          on_failure: plan
      - name: implement
        capabilities: [coding]
        transitions:
          on_success:
            capability: test-decision
            prompt: "Test the implementation"
            allowed_destinations: [test, implement]
          on_failure:
            capability: failure-decision
            prompt: "Analyze the failure"
            allowed_destinations: [plan, implement]
      - name: test
        capabilities: [testing]
        transitions:
          on_success:
            capability: quality-decision
            prompt: "Assess quality"
            allowed_destinations: [test]
            confidence_thresholds:
              auto_advance: 0.8
              require_approval: 0.6
          on_partial_success:
            capability: partial-decision
            prompt: "Partial success"
            allowed_destinations: [test]
          on_unclear:
            capability: clarify-decision
            prompt: "Clarify outcome"
            allowed_destinations: [test]
    retry:
      max_attempts: 3
      backoff_strategy: exponential
    timeout_base_ms: 300000

default_policy: default
      `.trim();

      writeFileSync(policiesPath, policiesWithTransitions);
      policyEngine = new PolicyEngine(policiesPath);
    });

    it('should load policy with transition blocks', () => {
      const planPhase = policyEngine.getPhaseConfig('default', 'plan');
      expect(planPhase?.transitions).toBeDefined();
      expect(planPhase?.transitions?.on_success).toBe('implement');
      expect(planPhase?.transitions?.on_failure).toBe('plan');
    });

    it('should use string transition for direct jump', () => {
      const transition = policyEngine.determineTransition('default', 'plan', {
        success: true
      });
      expect(transition.type).toBe('advance');
      expect(transition.next_phase).toBe('implement');
      expect(transition.reason).toContain('Direct transition');
    });

    it('should use object transition for AI decision', () => {
      const implementPhase = policyEngine.getPhaseConfig('default', 'implement');
      const successConfig = implementPhase?.transitions?.on_success;

      if (typeof successConfig === 'object') {
        expect(successConfig.capability).toBe('test-decision');
        expect(successConfig.prompt).toContain('Test');
        expect(successConfig.allowed_destinations).toEqual(['test', 'implement']);
      }
    });

    it('should use on_failure transition', () => {
      const implementPhase = policyEngine.getPhaseConfig('default', 'implement');
      const failureConfig = implementPhase?.transitions?.on_failure;

      expect(failureConfig).toBeDefined();
      if (typeof failureConfig === 'object') {
        expect(failureConfig.capability).toBe('failure-decision');
        expect(failureConfig.allowed_destinations).toEqual(['plan', 'implement']);
      }
    });

    it('should use result_type for transition selection', () => {
      const testPhase = policyEngine.getPhaseConfig('default', 'test');
      const partialSuccessConfig = testPhase?.transitions?.on_partial_success;

      expect(partialSuccessConfig).toBeDefined();
      if (typeof partialSuccessConfig === 'object') {
        expect(partialSuccessConfig.capability).toBe('partial-decision');
        expect(partialSuccessConfig.prompt).toContain('Partial');
      }
    });

    it('should use on_unclear transition', () => {
      const testPhase = policyEngine.getPhaseConfig('default', 'test');
      const unclearConfig = testPhase?.transitions?.on_unclear;

      expect(unclearConfig).toBeDefined();
      if (typeof unclearConfig === 'object') {
        expect(unclearConfig.capability).toBe('clarify-decision');
        expect(unclearConfig.prompt).toContain('Clarify');
      }
    });

    it('should parse confidence thresholds', () => {
      const testPhase = policyEngine.getPhaseConfig('default', 'test');
      expect(testPhase?.transitions?.on_success).toBeDefined();
      const successConfig = testPhase?.transitions?.on_success;
      if (typeof successConfig === 'object') {
        expect(successConfig.confidence_thresholds).toBeDefined();
        expect(successConfig.confidence_thresholds?.auto_advance).toBe(0.8);
        expect(successConfig.confidence_thresholds?.require_approval).toBe(0.6);
      }
    });

    it('should fall back to default behavior without transitions', () => {
      const noTransitionsPolicy = `
policies:
  simple:
    name: "Simple"
    phases:
      - name: phase1
        capabilities: [coding]
      - name: phase2
        capabilities: [testing]
    retry:
      max_attempts: 2
      backoff_strategy: exponential
    timeout_base_ms: 300000

default_policy: simple
      `.trim();

      writeFileSync(policiesPath, noTransitionsPolicy);
      const simpleEngine = new PolicyEngine(policiesPath);

      const transition = simpleEngine.determineTransition('simple', 'phase1', {
        success: true
      });
      expect(transition.type).toBe('advance');
      expect(transition.next_phase).toBe('phase2');
    });

    it('should throw error for invalid phase in allowed_destinations', () => {
      const invalidDestinations = `
policies:
  invalid:
    name: "Invalid"
    phases:
      - name: phase1
        capabilities: [coding]
        transitions:
          on_success:
            capability: test-decision
            prompt: "Test"
            allowed_destinations: [nonexistent]
    retry:
      max_attempts: 2
    timeout_base_ms: 300000

default_policy: invalid
      `.trim();

      writeFileSync(policiesPath, invalidDestinations);
      expect(() => new PolicyEngine(policiesPath)).toThrow();
    });

    it('should throw error for invalid confidence thresholds', () => {
      const invalidThresholds = `
policies:
  invalid:
    name: "Invalid"
    phases:
      - name: phase1
        capabilities: [coding]
        transitions:
          on_success:
            capability: test-decision
            prompt: "Test"
            allowed_destinations: [phase1]
            confidence_thresholds:
              auto_advance: 1.5
    retry:
      max_attempts: 2
    timeout_base_ms: 300000

default_policy: invalid
      `.trim();

      writeFileSync(policiesPath, invalidThresholds);
      expect(() => new PolicyEngine(policiesPath)).toThrow();
    });

    it('should throw error for on_partial_success as string', () => {
      const invalidStringTransition = `
policies:
  invalid:
    name: "Invalid"
    phases:
      - name: phase1
        capabilities: [coding]
        transitions:
          on_partial_success: phase2
      - name: phase2
        capabilities: [testing]
    retry:
      max_attempts: 2
    timeout_base_ms: 300000

default_policy: invalid
      `.trim();

      writeFileSync(policiesPath, invalidStringTransition);
      expect(() => new PolicyEngine(policiesPath)).toThrow();
    });

    it('should throw error for on_unclear as string', () => {
      const invalidStringTransition = `
policies:
  invalid:
    name: "Invalid"
    phases:
      - name: phase1
        capabilities: [coding]
        transitions:
          on_unclear: phase1
    retry:
      max_attempts: 2
    timeout_base_ms: 300000

default_policy: invalid
      `.trim();

      writeFileSync(policiesPath, invalidStringTransition);
      expect(() => new PolicyEngine(policiesPath)).toThrow();
    });

    it('should throw error for missing required fields in TransitionConfig', () => {
      const missingFields = `
policies:
  invalid:
    name: "Invalid"
    phases:
      - name: phase1
        capabilities: [coding]
        transitions:
          on_success:
            capability: test-decision
            prompt: "Test"
            allowed_destinations: [phase1]
      - name: phase2
        capabilities: [testing]
        transitions:
          on_failure:
            capability: test-decision
            allowed_destinations: [phase1]
      - name: phase3
        capabilities: [testing]
        transitions:
          on_partial_success:
            prompt: "Test"
            allowed_destinations: [phase1]
    retry:
      max_attempts: 2
    timeout_base_ms: 300000

default_policy: invalid
      `.trim();

      writeFileSync(policiesPath, missingFields);
      expect(() => new PolicyEngine(policiesPath)).toThrow();
    });

    it('should handle mixed string and object transitions', () => {
      const mixedTransitions = `
policies:
  mixed:
    name: "Mixed Transitions"
    phases:
      - name: phase1
        capabilities: [coding]
        transitions:
          on_success: phase2
          on_failure:
            capability: test-decision
            prompt: "Analyze failure"
            allowed_destinations: [phase1]
      - name: phase2
        capabilities: [testing]
        transitions:
          on_success:
            capability: quality-decision
            prompt: "Assess quality"
            allowed_destinations: [phase2, phase3]
          on_failure: phase1
      - name: phase3
        capabilities: [review]
        transitions:
          on_success: phase2
          on_partial_success:
            capability: review-decision
            prompt: "Partial review"
            allowed_destinations: [phase2, phase3]
    retry:
      max_attempts: 2
    timeout_base_ms: 300000

default_policy: mixed
      `.trim();

      writeFileSync(policiesPath, mixedTransitions);
      const mixedEngine = new PolicyEngine(policiesPath);

      const phase1Config = mixedEngine.getPhaseConfig('mixed', 'phase1');
      expect(phase1Config?.transitions?.on_success).toBe('phase2');
      if (typeof phase1Config?.transitions?.on_failure === 'object') {
        expect(phase1Config?.transitions?.on_failure.capability).toBe('test-decision');
      }

      const phase2Config = mixedEngine.getPhaseConfig('mixed', 'phase2');
      if (typeof phase2Config?.transitions?.on_success === 'object') {
        expect(phase2Config?.transitions?.on_success.capability).toBe('quality-decision');
      }
      expect(phase2Config?.transitions?.on_failure).toBe('phase1');
    });
  });

  describe('Schema Validation', () => {
    let ajv: any;
    let schema: any;

    beforeEach(() => {
      ajv = new Ajv();
      const schemaPath = join(import.meta.dir, '..', 'schemas', 'policies.schema.json');
      schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    });

    it('should validate on_partial_success as object only', () => {
      const invalidPolicy = {
        policies: {
          test: {
            name: 'Test',
            phases: [{
              name: 'phase1',
              transitions: {
                on_partial_success: 'phase2'
              }
            }]
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(invalidPolicy);
      expect(valid).toBe(false);
      expect(validate.errors).toBeDefined();
    });

    it('should validate on_unclear as object only', () => {
      const invalidPolicy = {
        policies: {
          test: {
            name: 'Test',
            phases: [{
              name: 'phase1',
              transitions: {
                on_unclear: 'phase1'
              }
            }]
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(invalidPolicy);
      expect(valid).toBe(false);
      expect(validate.errors).toBeDefined();
    });

    it('should validate on_success as string or object', () => {
      const validPolicyWithString = {
        policies: {
          test: {
            name: 'Test',
            phases: [{
              name: 'phase1',
              transitions: {
                on_success: 'phase2'
              }
            }, {
              name: 'phase2'
            }]
          }
        }
      };

      const validate = ajv.compile(schema);
      let valid = validate(validPolicyWithString);
      expect(valid).toBe(true);

      const validPolicyWithObject = {
        policies: {
          test: {
            name: 'Test',
            phases: [{
              name: 'phase1',
              transitions: {
                on_success: {
                  capability: 'test-decision',
                  prompt: 'Test',
                  allowed_destinations: ['phase2']
                }
              }
            }, {
              name: 'phase2'
            }]
          }
        }
      };

      valid = validate(validPolicyWithObject);
      expect(valid).toBe(true);
    });

    it('should validate confidence thresholds range', () => {
      const invalidThresholds = {
        policies: {
          test: {
            name: 'Test',
            phases: [{
              name: 'phase1',
              transitions: {
                on_success: {
                  capability: 'test-decision',
                  prompt: 'Test',
                  allowed_destinations: ['phase1'],
                  confidence_thresholds: {
                    auto_advance: 1.5
                  }
                }
              }
            }]
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(invalidThresholds);
      expect(valid).toBe(false);
      expect(validate.errors).toBeDefined();
    });

    it('should validate missing required fields in TransitionConfig', () => {
      const missingFields = {
        policies: {
          test: {
            name: 'Test',
            phases: [{
              name: 'phase1',
              transitions: {
                on_success: {
                  capability: 'test-decision',
                  allowed_destinations: ['phase1']
                }
              }
            }]
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(missingFields);
      expect(valid).toBe(false);
      expect(validate.errors).toBeDefined();
    });
  });
});