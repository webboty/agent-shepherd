/**
 * Tests for Enhanced Transition Logic (Task 2.1)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PolicyEngine, type PhaseTransition } from '../src/core/policy.ts';
import { getAgentRegistry } from '../src/core/agent-registry.ts';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

describe('Enhanced Transition Logic', () => {
  let policyEngine: PolicyEngine;
  let tempDir: string;
  let policiesPath: string;

  beforeEach(() => {
    tempDir = join(process.cwd(), 'temp-transition-test');
    policiesPath = join(tempDir, 'policies.yaml');
    
    // Create temp directory
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    
    // Create test policies file with multiple phases
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
      - name: develop
        description: "Development phase"
        capabilities: [coding, refactoring]
        timeout_multiplier: 2.0
      - name: test
        description: "Testing phase"
        capabilities: [testing, qa]
        timeout_multiplier: 1.5
      - name: validate
        description: "Validation phase"
        capabilities: [validation, review]
        timeout_multiplier: 1.0
    retry:
      max_attempts: 3
      backoff_strategy: exponential
      initial_delay_ms: 5000
      max_delay_ms: 300000
    timeout_base_ms: 300000
    stall_threshold_ms: 60000
    require_hitl: false

  multi-phase:
    name: "Multi-Phase Policy"
    description: "Test policy with many phases"
    phases:
      - name: phase1
        description: "First phase"
        capabilities: [planning]
      - name: phase2
        description: "Second phase"
        capabilities: [coding]
      - name: phase3
        description: "Third phase"
        capabilities: [testing]
      - name: phase4
        description: "Fourth phase"
        capabilities: [review]
    retry:
      max_attempts: 2
      backoff_strategy: linear
    timeout_base_ms: 300000

default_policy: default
    `.trim();
    
    writeFileSync(policiesPath, testPolicies);
    policyEngine = new PolicyEngine(policiesPath);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Backward Compatibility', () => {
    it('should support existing advance transition type', () => {
      const transition = policyEngine.determineTransition('default', 'plan', {
        success: true
      });
      
      expect(transition.type).toBe('advance');
      expect(transition.next_phase).toBe('develop');
      expect(transition.reason).toBe('Phase completed successfully');
    });

    it('should support existing retry transition type', () => {
      const transition = policyEngine.determineTransition('default', 'plan', {
        success: false,
        retry_count: 0
      });
      
      expect(transition.type).toBe('retry');
      expect(transition.reason).toBe('Retry 1/3');
    });

    it('should support existing block transition type for approval', () => {
      const transition = policyEngine.determineTransition('default', 'plan', {
        success: true,
        requires_approval: true
      });
      
      expect(transition.type).toBe('block');
      expect(transition.reason).toBe('Human approval required');
    });

    it('should support existing block transition type for max retries', () => {
      const transition = policyEngine.determineTransition('default', 'plan', {
        success: false,
        retry_count: 3
      });
      
      expect(transition.type).toBe('block');
      expect(transition.reason).toBe('Max retries exceeded (3)');
    });

    it('should support existing close transition type', () => {
      const transition = policyEngine.determineTransition('default', 'validate', {
        success: true
      });
      
      expect(transition.type).toBe('close');
      expect(transition.reason).toBe('All phases completed');
    });
  });

  describe('Jump Back Transition Validation', () => {
    it('should validate jump_back requires target phase', () => {
      const transition: PhaseTransition = {
        type: 'jump_back',
        reason: 'Jump back test'
      };
      
      expect(() => {
        (policyEngine as any).validateTransition('default', 'develop', transition);
      }).toThrow('jump_back transition requires jump_target_phase or next_phase');
    });

    it('should validate jump_target_phase exists in policy', () => {
      const transition: PhaseTransition = {
        type: 'jump_back',
        jump_target_phase: 'nonexistent-phase',
        reason: 'Jump back test'
      };
      
      expect(() => {
        (policyEngine as any).validateTransition('default', 'develop', transition);
      }).toThrow("Target phase 'nonexistent-phase' not found in policy 'default'");
    });

    it('should validate no circular jumps', () => {
      const transition: PhaseTransition = {
        type: 'jump_back',
        jump_target_phase: 'develop',
        reason: 'Jump back test'
      };
      
      expect(() => {
        (policyEngine as any).validateTransition('default', 'develop', transition);
      }).toThrow("Cannot jump from phase 'develop' to itself");
    });

    it('should accept valid jump_back transition', () => {
      const transition: PhaseTransition = {
        type: 'jump_back',
        jump_target_phase: 'plan',
        reason: 'Jump back to planning'
      };
      
      expect(() => {
        (policyEngine as any).validateTransition('default', 'develop', transition);
      }).not.toThrow();
    });

    it('should accept jump_back using next_phase field', () => {
      const transition: PhaseTransition = {
        type: 'jump_back',
        next_phase: 'plan',
        reason: 'Jump back to planning'
      };
      
      expect(() => {
        (policyEngine as any).validateTransition('default', 'develop', transition);
      }).not.toThrow();
    });
  });

  describe('Dynamic Decision Transition Validation', () => {
    it('should validate dynamic_decision requires dynamic_agent', () => {
      const transition: PhaseTransition = {
        type: 'dynamic_decision',
        reason: 'Decision test'
      };
      
      expect(() => {
        (policyEngine as any).validateTransition('default', 'develop', transition);
      }).toThrow('dynamic_decision transition requires dynamic_agent');
    });

    it('should validate dynamic_agent capability has active agents', () => {
      const agentRegistry = getAgentRegistry();
      const agents = agentRegistry.getAgentsByCapability('test-decision');
      
      // Skip this test if there are test-decision agents
      if (agents.length > 0) {
        const transition: PhaseTransition = {
          type: 'dynamic_decision',
          dynamic_agent: 'test-decision',
          reason: 'Decision test'
        };
        
        expect(() => {
          (policyEngine as any).validateTransition('default', 'develop', transition);
        }).not.toThrow();
      } else {
        // Test that it throws when no agents exist
        const transition: PhaseTransition = {
          type: 'dynamic_decision',
          dynamic_agent: 'nonexistent-capability',
          reason: 'Decision test'
        };
        
        expect(() => {
          (policyEngine as any).validateTransition('default', 'develop', transition);
        }).toThrow("No active agents found with capability 'nonexistent-capability'");
      }
    });
  });

  describe('Transition Field Validation', () => {
    it('should handle missing optional fields gracefully', () => {
      const transition: PhaseTransition = {
        type: 'advance',
        next_phase: 'test',
        reason: 'Advance test'
      };
      
      expect(transition.jump_target_phase).toBeUndefined();
      expect(transition.dynamic_agent).toBeUndefined();
      expect(transition.decision_config).toBeUndefined();
    });

    it('should accept all new transition fields', () => {
      const transition: PhaseTransition = {
        type: 'dynamic_decision',
        dynamic_agent: 'test-decision',
        decision_config: { threshold: 0.8 },
        reason: 'Decision test'
      };
      
      expect(transition.dynamic_agent).toBe('test-decision');
      expect(transition.decision_config).toEqual({ threshold: 0.8 });
    });

    it('should support both jump_target_phase and next_phase for jump_back', () => {
      const transition: PhaseTransition = {
        type: 'jump_back',
        jump_target_phase: 'plan',
        next_phase: 'test',
        reason: 'Jump back test'
      };
      
      expect(transition.jump_target_phase).toBe('plan');
      expect(transition.next_phase).toBe('test');
    });
  });

  describe('Phase Sequence Validation', () => {
    it('should validate phase sequence for default policy', () => {
      const phases = policyEngine.getPhaseSequence('default');
      
      expect(phases).toEqual(['plan', 'develop', 'test', 'validate']);
    });

    it('should validate phase sequence for multi-phase policy', () => {
      const phases = policyEngine.getPhaseSequence('multi-phase');
      
      expect(phases).toEqual(['phase1', 'phase2', 'phase3', 'phase4']);
    });

    it('should get next phase correctly', () => {
      const next1 = policyEngine.getNextPhase('default', 'plan');
      expect(next1).toBe('develop');
      
      const next2 = policyEngine.getNextPhase('default', 'develop');
      expect(next2).toBe('test');
      
      const next3 = policyEngine.getNextPhase('default', 'test');
      expect(next3).toBe('validate');
    });

    it('should return null for last phase', () => {
      const next = policyEngine.getNextPhase('default', 'validate');
      expect(next).toBeNull();
    });
  });

  describe('Transition Type Support', () => {
    it('should support all transition types in type definition', () => {
      const advanceTransition: PhaseTransition = { type: 'advance', next_phase: 'test' };
      const retryTransition: PhaseTransition = { type: 'retry', reason: 'Retry' };
      const blockTransition: PhaseTransition = { type: 'block', reason: 'Block' };
      const closeTransition: PhaseTransition = { type: 'close', reason: 'Close' };
      const jumpBackTransition: PhaseTransition = { type: 'jump_back', jump_target_phase: 'test' };
      const dynamicDecisionTransition: PhaseTransition = { 
        type: 'dynamic_decision', 
        dynamic_agent: 'test' 
      };

      expect(advanceTransition.type).toBe('advance');
      expect(retryTransition.type).toBe('retry');
      expect(blockTransition.type).toBe('block');
      expect(closeTransition.type).toBe('close');
      expect(jumpBackTransition.type).toBe('jump_back');
      expect(dynamicDecisionTransition.type).toBe('dynamic_decision');
    });
  });

  describe('Policy Validation', () => {
    it('should throw error for nonexistent policy', () => {
      const transition = policyEngine.determineTransition('nonexistent', 'plan', {
        success: true
      });
      
      expect(transition.type).toBe('block');
      expect(transition.reason).toBe('Policy not found');
    });

    it('should throw error for nonexistent phase', () => {
      const transition = policyEngine.determineTransition('default', 'nonexistent', {
        success: true
      });
      
      expect(transition.type).toBe('block');
      expect(transition.reason).toBe('Phase not found');
    });
  });
});
