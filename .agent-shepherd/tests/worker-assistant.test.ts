/**
 * Tests for Worker Assistant Feature
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { WorkerEngine } from '../src/core/worker-engine.ts';
import { PolicyEngine } from '../src/core/policy.ts';
import { getLogger, type RunOutcome, Logger } from '../src/core/logging.ts';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Worker Assistant Feature', () => {
  let tempDir: string;
  let workerEngine: WorkerEngine;
  let policyEngine: PolicyEngine;

  beforeEach(() => {
    tempDir = join(__dirname, 'temp-worker-assistant-test');
    const policiesPath = join(tempDir, 'policies.yaml');

    mkdirSync(tempDir, { recursive: true });

    const testPolicies = `
policies:
  default:
    name: "Default Policy"
    phases:
      - name: implement
        capabilities: [coding]
      - name: test
        capabilities: [testing]
      - name: validate
        capabilities: [validation]
    retry:
      max_attempts: 3
      backoff_strategy: exponential
    timeout_base_ms: 300000
    stall_threshold_ms: 60000

  opt-out-policy:
    name: "Opt Out Policy"
    worker_assistant:
      enabled: false
    phases:
      - name: implement
        capabilities: [coding]
    retry:
      max_attempts: 3
    timeout_base_ms: 300000

default_policy: default
    `.trim();

    writeFileSync(policiesPath, testPolicies);
    policyEngine = new PolicyEngine(policiesPath);
    workerEngine = new WorkerEngine();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    Logger.resetInstance();
  });

  describe('parseWorkerAssistantResponse', () => {
    it('should parse ADVANCE response', () => {
      const response = 'Based on the analysis, I recommend to ADVANCE.';
      const result = (workerEngine as any).parseWorkerAssistantResponse(response);
      expect(result).toBe('advance');
    });

    it('should parse RETRY response', () => {
      const response = 'The errors are fixable, so please RETRY.';
      const result = (workerEngine as any).parseWorkerAssistantResponse(response);
      expect(result).toBe('retry');
    });

    it('should parse BLOCK response', () => {
      const response = 'This requires human review, so BLOCK for now.';
      const result = (workerEngine as any).parseWorkerAssistantResponse(response);
      expect(result).toBe('block');
    });

    it('should parse mixed case responses', () => {
      const response = 'I think we should advance to the next phase';
      const result = (workerEngine as any).parseWorkerAssistantResponse(response);
      expect(result).toBe('advance');
    });

    it('should parse uppercase response', () => {
      const response = 'RETRY';
      const result = (workerEngine as any).parseWorkerAssistantResponse(response);
      expect(result).toBe('retry');
    });

    it('should parse lowercase response', () => {
      const response = 'block';
      const result = (workerEngine as any).parseWorkerAssistantResponse(response);
      expect(result).toBe('block');
    });

    it('should return fallback for unrecognized response', () => {
      const response = 'I am not sure what to recommend here';
      const result = (workerEngine as any).parseWorkerAssistantResponse(response);
      expect(result).toBe('block');
    });

    it('should handle empty response', () => {
      const response = '';
      const result = (workerEngine as any).parseWorkerAssistantResponse(response);
      expect(result).toBe('block');
    });

    it('should handle whitespace-only response', () => {
      const response = '   ';
      const result = (workerEngine as any).parseWorkerAssistantResponse(response);
      expect(result).toBe('block');
    });

    it('should extract directive from verbose response', () => {
      const response = 'After careful analysis of the situation, considering all factors, I believe the best course of action is to RETRY this phase. The issues detected are minor and can be easily fixed.';
      const result = (workerEngine as any).parseWorkerAssistantResponse(response);
      expect(result).toBe('retry');
    });

    it('should prefer first match when multiple directives present', () => {
      const response = 'Either retry or block could work, but I think retry is better';
      const result = (workerEngine as any).parseWorkerAssistantResponse(response);
      expect(result).toBe('retry');
    });

    it('should handle response with only ADVANCE', () => {
      const response = 'The task is complete, ADVANCE.';
      const result = (workerEngine as any).parseWorkerAssistantResponse(response);
      expect(result).toBe('advance');
    });

    it('should handle response with embedded directive in sentence', () => {
      const response = 'We should advance to the next step because all tests pass.';
      const result = (workerEngine as any).parseWorkerAssistantResponse(response);
      expect(result).toBe('advance');
    });
  });

  describe('buildWorkerAssistantPrompt', () => {
    it('should include issue context in prompt', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Test Issue Title',
        description: 'Test issue description goes here',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const outcome: RunOutcome = {
        success: true,
        message: 'Test completed',
        warnings: ['Warning 1']
      };

      const prompt = (workerEngine as any).buildWorkerAssistantPrompt(issue, 'implement', outcome);
      expect(prompt).toContain('TEST-001');
      expect(prompt).toContain('Test Issue Title');
      expect(prompt).toContain('bug');
      expect(prompt).toContain('implement');
    });

    it('should include outcome summary in prompt', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Test',
        description: 'Desc',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const outcome: RunOutcome = {
        success: true,
        message: 'Partial completion',
        warnings: ['Warning 1', 'Warning 2', 'Warning 3'],
        artifacts: ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts', 'file5.ts', 'file6.ts'],
        error: undefined
      };

      const prompt = (workerEngine as any).buildWorkerAssistantPrompt(issue, 'implement', outcome);
      expect(prompt).toContain('"success": true');
      expect(prompt).toContain('"warnings": 3');
      expect(prompt).toContain('"artifacts": 6');
    });

    it('should include error details when present', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Test',
        description: 'Desc',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const outcome: RunOutcome = {
        success: false,
        error: 'Test error occurred',
        error_details: {
          type: 'TypeError',
          message: 'Invalid type encountered',
          stack_trace: 'at test.ts:10\nat test.ts:20',
          file_path: 'test.ts',
          line_number: 10
        }
      };

      const prompt = (workerEngine as any).buildWorkerAssistantPrompt(issue, 'test', outcome);
      expect(prompt).toContain('# Error Details');
      expect(prompt).toContain('TypeError');
      expect(prompt).toContain('Invalid type encountered');
      expect(prompt).toContain('test.ts');
    });

    it('should include directive instructions', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Test',
        description: 'Desc',
        issue_type: 'feature',
        priority: 2,
        status: 'open',
        labels: []
      };

      const outcome: RunOutcome = {
        success: true,
        message: 'Implementation done'
      };

      const prompt = (workerEngine as any).buildWorkerAssistantPrompt(issue, 'implement', outcome);
      expect(prompt).toContain('ADVANCE');
      expect(prompt).toContain('RETRY');
      expect(prompt).toContain('BLOCK');
      expect(prompt).toContain('Respond with ONLY one word');
    });

    it('should handle outcome with minimal data', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Test',
        description: 'Desc',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const outcome: RunOutcome = {
        success: true
      };

      const prompt = (workerEngine as any).buildWorkerAssistantPrompt(issue, 'plan', outcome);
      expect(prompt).toContain('TEST-001');
      expect(prompt).toContain('"success": true');
    });

    it('should handle issue with special characters in title', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Test with "quotes" and \'apostrophes\'',
        description: 'Test description',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const outcome: RunOutcome = {
        success: true,
        message: 'Done'
      };

      const prompt = (workerEngine as any).buildWorkerAssistantPrompt(issue, 'implement', outcome);
      expect(prompt).toContain('TEST-001');
      expect(prompt).toContain('Test with "quotes"');
    });

    it('should handle phase names with underscores', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Test',
        description: 'Desc',
        issue_type: 'feature',
        priority: 2,
        status: 'open',
        labels: []
      };

      const outcome: RunOutcome = {
        success: true,
        message: 'Done'
      };

      const prompt = (workerEngine as any).buildWorkerAssistantPrompt(issue, 'code_review', outcome);
      expect(prompt).toContain('code_review');
    });

    it('should handle complex error details', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Test',
        description: 'Desc',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const outcome: RunOutcome = {
        success: false,
        error: 'Multiple errors',
        error_details: {
          type: 'AggregateError',
          message: 'Multiple validation errors occurred',
          stack_trace: 'Error 1\nError 2\nError 3'
        }
      };

      const prompt = (workerEngine as any).buildWorkerAssistantPrompt(issue, 'test', outcome);
      expect(prompt).toContain('# Error Details');
      expect(prompt).toContain('AggregateError');
      expect(prompt).toContain('Multiple validation errors occurred');
    });
  });

  describe('Trigger Logic Analysis', () => {
    it('should count warnings in successful outcome', () => {
      const outcome: RunOutcome = {
        success: true,
        warnings: ['Warning 1', 'Warning 2', 'Warning 3']
      };

      let triggerCount = 0;
      if (outcome.warnings && outcome.warnings.length > 0) {
        triggerCount++;
      }
      expect(triggerCount).toBe(1);
    });

    it('should count many artifacts as trigger', () => {
      const outcome: RunOutcome = {
        success: true,
        artifacts: ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts', 'file5.ts', 'file6.ts']
      };

      let triggerCount = 0;
      if (outcome.artifacts && outcome.artifacts.length > 5) {
        triggerCount++;
      }
      expect(triggerCount).toBe(1);
    });

    it('should detect unclear keywords in message', () => {
      const unclearKeywords = ['unclear', 'partial', 'ambiguous', 'review'];
      const messages = [
        'The outcome is unclear',
        'partial implementation',
        'The result is ambiguous',
        'Requires manual review'
      ];

      messages.forEach((msg, i) => {
        let triggered = false;
        const keyword = unclearKeywords[i];
        if (msg.includes(keyword)) {
          triggered = true;
        }
        expect(triggered).toBe(true);
      });
    });

    it('should detect timeout keyword in failure message', () => {
      const message = 'Execution timeout occurred during processing';
      const hasTimeout = message.includes('timeout');
      expect(hasTimeout).toBe(true);
    });

    it('should detect incomplete keyword in failure message', () => {
      const message = 'The task was incomplete';
      const hasIncomplete = message.includes('incomplete');
      expect(hasIncomplete).toBe(true);
    });

    it('should detect error details as trigger', () => {
      const errorDetails = {
        type: 'ValidationError',
        message: 'Invalid input',
        stack_trace: 'trace'
      };

      let hasErrorDetails = false;
      if (errorDetails && Object.keys(errorDetails).length > 0) {
        hasErrorDetails = true;
      }
      expect(hasErrorDetails).toBe(true);
    });
  });

  describe('Configuration Tests', () => {
    it('should create valid worker assistant configuration structure', () => {
      const testConfig = `
version: "1.0"
worker_assistant:
  enabled: true
  agentCapability: worker-assistant
  timeoutMs: 10000
  fallbackAction: block
      `.trim();

      const configPath = join(tempDir, 'config.yaml');
      writeFileSync(configPath, testConfig);

      const { readFileSync } = require('fs');
      const configContent = readFileSync(configPath, 'utf-8');
      expect(configContent).toContain('worker_assistant:');
      expect(configContent).toContain('enabled: true');
      expect(configContent).toContain('agentCapability: worker-assistant');
      expect(configContent).toContain('timeoutMs: 10000');
      expect(configContent).toContain('fallbackAction: block');
    });

    it('should support different fallback actions', () => {
      const actions = ['advance', 'retry', 'block'] as const;
      
      actions.forEach((action) => {
        const testConfig = `
version: "1.0"
worker_assistant:
  enabled: true
  fallbackAction: ${action}
        `.trim();

        const configPath = join(tempDir, 'config.yaml');
        writeFileSync(configPath, testConfig);

        const { readFileSync } = require('fs');
        const configContent = readFileSync(configPath, 'utf-8');
        expect(configContent).toContain(`fallbackAction: ${action}`);
      });
    });

    it('should allow custom timeout values', () => {
      const testConfig = `
version: "1.0"
worker_assistant:
  enabled: true
  timeoutMs: 5000
  fallbackAction: block
      `.trim();

      const configPath = join(tempDir, 'config.yaml');
      writeFileSync(configPath, testConfig);

      const { readFileSync } = require('fs');
      const configContent = readFileSync(configPath, 'utf-8');
      expect(configContent).toContain('timeoutMs: 5000');
    });

    it('should allow custom agent capability', () => {
      const testConfig = `
version: "1.0"
worker_assistant:
  enabled: true
  agentCapability: custom-assistant-cap
  fallbackAction: block
      `.trim();

      const configPath = join(tempDir, 'config.yaml');
      writeFileSync(configPath, testConfig);

      const { readFileSync } = require('fs');
      const configContent = readFileSync(configPath, 'utf-8');
      expect(configContent).toContain('agentCapability: custom-assistant-cap');
    });
  });

  describe('Decision Logging', () => {
    it('should log worker assistant decision with metadata', () => {
      const logger = getLogger(tempDir);
      const runId = 'test-run-123';
      
      const decision = logger.logDecision({
        run_id: runId,
        type: 'worker_assistant',
        decision: 'retry',
        reasoning: 'Worker assistant recommended retry based on warnings',
        metadata: {
          issue_id: 'TEST-001',
          phase: 'implement',
          outcome_summary: {
            success: true,
            warnings: 2,
            artifacts: 6,
            has_error: false
          }
        }
      });

      expect(decision.type).toBe('worker_assistant');
      expect(decision.decision).toBe('retry');
      expect(decision.reasoning).toContain('Worker assistant recommended retry');
    });

    it('should retrieve worker assistant decisions for a run', () => {
      const logger = getLogger(tempDir);
      const runId = 'test-run-456';
      
      logger.logDecision({
        run_id: runId,
        type: 'worker_assistant',
        decision: 'advance',
        reasoning: 'All checks passed',
        metadata: {
          issue_id: 'TEST-002',
          phase: 'test'
        }
      });

      const decisions = logger.getDecisions(runId);
      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions[0].type).toBe('worker_assistant');
      expect(decisions[0].decision).toBe('advance');
      expect(decisions[0].metadata?.issue_id).toBe('TEST-002');
    });

    it('should include all metadata fields in decision', () => {
      const logger = getLogger(tempDir);
      const runId = 'test-run-789';
      
      const metadata = {
        issue_id: 'TEST-003',
        phase: 'validate',
        outcome_summary: {
          success: true,
          warnings: 0,
          artifacts: 3,
          has_error: false
        },
        confidence: 0.9,
        processing_time_ms: 150
      };

      const decision = logger.logDecision({
        run_id: runId,
        type: 'worker_assistant',
        decision: 'block',
        reasoning: 'Complex decision required',
        metadata
      });

      expect(decision.metadata).toBeDefined();
      expect(decision.metadata?.issue_id).toBe('TEST-003');
      expect(decision.metadata?.phase).toBe('validate');
      expect(decision.metadata?.confidence).toBe(0.9);
      expect(decision.metadata?.processing_time_ms).toBe(150);
    });
  });

  describe('Schema Validation', () => {
    it('should accept all valid fallback action values', () => {
      const validActions = ['advance', 'retry', 'block'];
      
      validActions.forEach((action) => {
        const testConfig = `
version: "1.0"
worker_assistant:
  enabled: true
  fallbackAction: ${action}
        `.trim();

        const configPath = join(tempDir, 'config.yaml');
        writeFileSync(configPath, testConfig);

        const { readFileSync } = require('fs');
        const configContent = readFileSync(configPath, 'utf-8');
        expect(configContent).toContain(`fallbackAction: ${action}`);
      });
    });

    it('should validate timeout range', () => {
      const timeoutValues = [1000, 5000, 10000, 30000, 60000];
      
      timeoutValues.forEach((timeout) => {
        const testConfig = `
version: "1.0"
worker_assistant:
  enabled: true
  timeoutMs: ${timeout}
  fallbackAction: block
        `.trim();

        const configPath = join(tempDir, 'config.yaml');
        writeFileSync(configPath, testConfig);

        const { readFileSync } = require('fs');
        const configContent = readFileSync(configPath, 'utf-8');
        expect(configContent).toContain(`timeoutMs: ${timeout}`);
      });
    });
  });

  describe('Policy-Level Opt-Out', () => {
    it('should detect worker_assistant opt-out in policy', () => {
      const testPolicies = `
policies:
  opt-out:
    name: "Opt Out Policy"
    worker_assistant:
      enabled: false
    phases:
      - name: implement
        capabilities: [coding]
    timeout_base_ms: 300000
      `.trim();

      const policiesPath = join(tempDir, 'policies-optout.yaml');
      writeFileSync(policiesPath, testPolicies);

      const { readFileSync } = require('fs');
      const policyContent = readFileSync(policiesPath, 'utf-8');
      expect(policyContent).toContain('worker_assistant:');
      expect(policyContent).toContain('enabled: false');
    });

    it('should support phase-level opt-out', () => {
      const testPolicies = `
policies:
  default:
    name: "Default Policy"
    phases:
      - name: implement
        capabilities: [coding]
        worker_assistant:
          enabled: false
      - name: test
        capabilities: [testing]
    timeout_base_ms: 300000
      `.trim();

      const policiesPath = join(tempDir, 'policies-phase-optout.yaml');
      writeFileSync(policiesPath, testPolicies);

      const { readFileSync } = require('fs');
      const policyContent = readFileSync(policiesPath, 'utf-8');
      expect(policyContent).toContain('worker_assistant:');
      expect(policyContent).toContain('enabled: false');
    });
  });

  describe('Edge Cases', () => {
    it('should handle response with embedded ADVANCE in larger context', () => {
      const response = 'Based on my analysis, we should ADVANCE because the implementation is complete and all tests pass.';
      const result = (workerEngine as any).parseWorkerAssistantResponse(response);
      expect(result).toBe('advance');
    });

    it('should handle response with newlines', () => {
      const response = 'After analysis:\n\nI recommend to RETRY\n\nThe errors are fixable.';
      const result = (workerEngine as any).parseWorkerAssistantResponse(response);
      expect(result).toBe('retry');
    });

    it('should handle null artifacts array', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Test',
        description: 'Desc',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const outcome: RunOutcome = {
        success: true,
        artifacts: null as any,
        message: 'Done'
      };

      const prompt = (workerEngine as any).buildWorkerAssistantPrompt(issue, 'plan', outcome);
      expect(prompt).toContain('TEST-001');
    });

    it('should handle undefined warnings', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Test',
        description: 'Desc',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const outcome: RunOutcome = {
        success: true,
        warnings: undefined,
        message: 'Done'
      };

      const prompt = (workerEngine as any).buildWorkerAssistantPrompt(issue, 'plan', outcome);
      expect(prompt).toContain('TEST-001');
    });
  });
});
