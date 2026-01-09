/**
 * Tests for Worker Engine Custom Prompts
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { WorkerEngine } from '../src/core/worker-engine.ts';
import { PolicyEngine } from '../src/core/policy.ts';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('WorkerEngine Custom Prompts', () => {
  let tempDir: string;
  let policiesPath: string;
  let workerEngine: WorkerEngine;
  let policyEngine: PolicyEngine;

  beforeEach(() => {
    tempDir = join(process.cwd(), 'temp-worker-test');
    policiesPath = join(tempDir, 'policies.yaml');

    mkdirSync(tempDir, { recursive: true });

    const testPolicies = `
policies:
  default:
    name: "Default Policy"
    phases:
      - name: plan
        capabilities: [planning]
      - name: implement
        capabilities: [coding]
        custom_prompt: "Implement the feature for issue {{issue.title}}. Use capabilities: {{capabilities}}."
      - name: test
        capabilities: [testing]
    retry:
      max_attempts: 3
      backoff_strategy: exponential
    timeout_base_ms: 300000
    stall_threshold_ms: 60000

default_policy: default
    `.trim();

    writeFileSync(policiesPath, testPolicies);

    policyEngine = new PolicyEngine(policiesPath);
    workerEngine = new WorkerEngine();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('buildInstructions', () => {
    it('should use generic template when custom_prompt is not specified', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Test Issue',
        description: 'Test Description',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const instructions = (workerEngine as any).buildInstructions(issue, 'plan', 'default');

      expect(instructions).toContain('# Task: Test Issue');
      expect(instructions).toContain('## Issue Details');
      expect(instructions).toContain('## Current Phase');
      expect(instructions).toContain('**plan**');
    });
  });

  describe('substituteVariables', () => {
    it('should substitute {{issue.title}} variable', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Test Issue Title',
        description: 'Description',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const template = 'Work on issue: {{issue.title}}';
      const result = (workerEngine as any).substituteVariables(template, issue, 'plan', ['planning']);

      expect(result).toBe('Work on issue: Test Issue Title');
    });

    it('should substitute {{issue.description}} variable', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Title',
        description: 'Detailed issue description here',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const template = 'Description: {{issue.description}}';
      const result = (workerEngine as any).substituteVariables(template, issue, 'plan', ['planning']);

      expect(result).toBe('Description: Detailed issue description here');
    });

    it('should substitute {{issue.id}} variable', () => {
      const issue = {
        id: 'TEST-123',
        title: 'Title',
        description: 'Description',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const template = 'Issue ID: {{issue.id}}';
      const result = (workerEngine as any).substituteVariables(template, issue, 'plan', ['planning']);

      expect(result).toBe('Issue ID: TEST-123');
    });

    it('should substitute {{issue.type}} variable', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Title',
        description: 'Description',
        issue_type: 'feature',
        priority: 2,
        status: 'open',
        labels: []
      };

      const template = 'Type: {{issue.type}}';
      const result = (workerEngine as any).substituteVariables(template, issue, 'plan', ['planning']);

      expect(result).toBe('Type: feature');
    });

    it('should substitute {{phase}} variable', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Title',
        description: 'Description',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const template = 'Current phase: {{phase}}';
      const result = (workerEngine as any).substituteVariables(template, issue, 'implement', ['coding']);

      expect(result).toBe('Current phase: implement');
    });

    it('should substitute {{capabilities}} variable', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Title',
        description: 'Description',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const template = 'Use capabilities: {{capabilities}}';
      const result = (workerEngine as any).substituteVariables(template, issue, 'plan', ['planning', 'architecture', 'testing']);

      expect(result).toBe('Use capabilities: planning, architecture, testing');
    });

    it('should substitute multiple variables in one template', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Feature XYZ',
        description: 'Implement feature XYZ',
        issue_type: 'feature',
        priority: 2,
        status: 'open',
        labels: []
      };

      const template = 'Phase: {{phase}}\nIssue: {{issue.title}} ({{issue.id}})\nType: {{issue.type}}\nCapabilities: {{capabilities}}';
      const result = (workerEngine as any).substituteVariables(template, issue, 'implement', ['coding', 'testing']);

      expect(result).toContain('Phase: implement');
      expect(result).toContain('Issue: Feature XYZ (TEST-001)');
      expect(result).toContain('Type: feature');
      expect(result).toContain('Capabilities: coding, testing');
    });

    it('should handle missing capabilities gracefully', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Title',
        description: 'Description',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const template = 'Capabilities: {{capabilities}}';
      const result = (workerEngine as any).substituteVariables(template, issue, 'plan', undefined);

      expect(result).toBe('Capabilities: None specified');
    });

    it('should handle empty field values', () => {
      const issue = {
        id: 'TEST-001',
        title: '',
        description: '',
        issue_type: '',
        priority: 2,
        status: 'open',
        labels: []
      };

      const template = '{{issue.title}} - {{issue.description}} - {{issue.type}}';
      const result = (workerEngine as any).substituteVariables(template, issue, 'plan', ['planning']);

      expect(result).toBe(' -  - ');
    });

    it('should leave invalid variables unchanged', () => {
      const issue = {
        id: 'TEST-001',
        title: 'Title',
        description: 'Description',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const template = 'Valid: {{issue.title}}, Invalid: {{issue.nonexistent}}, Also Invalid: {{unknown}}';
      const result = (workerEngine as any).substituteVariables(template, issue, 'plan', ['planning']);

      expect(result).toBe('Valid: Title, Invalid: {{issue.nonexistent}}, Also Invalid: {{unknown}}');
    });

    it('should substitute all occurrences of a variable', () => {
      const issue = {
        id: 'TEST-001',
        title: 'XYZ',
        description: 'Description',
        issue_type: 'bug',
        priority: 2,
        status: 'open',
        labels: []
      };

      const template = '{{issue.title}} {{issue.title}} {{issue.title}}';
      const result = (workerEngine as any).substituteVariables(template, issue, 'plan', ['planning']);

      expect(result).toBe('XYZ XYZ XYZ');
    });
  });
});
