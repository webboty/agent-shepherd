/**
 * Tests for Trigger System (matchPolicy)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PolicyEngine } from '../src/core/policy.ts';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Trigger System', () => {
  let policyEngine: PolicyEngine;
  let tempDir: string;
  let policiesPath: string;

  beforeEach(() => {
    tempDir = join(process.cwd(), 'temp-test');
    policiesPath = join(tempDir, 'policies.yaml');
    
    // Create temp directory
    mkdirSync(tempDir, { recursive: true });
    
    // Create test policies file with trigger system fields
    const testPolicies = `
policies:
  default:
    name: "Default Policy"
    description: "Test default policy"
    issue_types: [task, chore]
    priority: 50
    phases:
      - name: plan
        description: "Planning phase"
        capabilities: [planning]
      - name: implement
        description: "Implementation phase"
        capabilities: [coding]

  bugfix:
    name: "Bug Fix Policy"
    description: "Policy for bug fixes"
    issue_types: [bug]
    priority: 80
    phases:
      - name: investigate
        description: "Investigation phase"
        capabilities: [debugging]
      - name: fix
        description: "Fix phase"
        capabilities: [coding]

  feature:
    name: "Feature Policy"
    description: "Policy for features"
    issue_types: [feature]
    priority: 70
    phases:
      - name: design
        description: "Design phase"
        capabilities: [architecture]
      - name: implement
        description: "Implementation phase"
        capabilities: [coding]

  priority-high:
    name: "High Priority Policy"
    description: "High priority policy"
    issue_types: [bug]
    priority: 90
    phases:
      - name: triage
        description: "Triage phase"
        capabilities: [planning]

  priority-low:
    name: "Low Priority Policy"
    description: "Low priority policy"
    issue_types: [bug]
    priority: 70
    phases:
      - name: triage
        description: "Triage phase"
        capabilities: [planning]

  custom:
    name: "Custom Workflow"
    description: "Custom workflow for specific cases"
    phases:
      - name: analyze
        description: "Analysis phase"
        capabilities: [analysis]

default_policy: default
    `.trim();
    
    writeFileSync(policiesPath, testPolicies);
    policyEngine = new PolicyEngine(policiesPath);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Explicit Workflow Label', () => {
    it('should use explicit workflow label when present', () => {
      const issue = {
        id: 'test-1',
        title: 'Test Issue',
        description: 'Test description',
        status: 'open' as const,
        priority: 1,
        issue_type: 'bug',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        labels: ['ashep-workflow:custom']
      };

      const matched = policyEngine.matchPolicy(issue);
      expect(matched).toBe('custom');
    });

    it('should throw error on invalid workflow label with error strategy', () => {
      const issue = {
        id: 'test-2',
        title: 'Test Issue',
        description: 'Test description',
        status: 'open' as const,
        priority: 1,
        issue_type: 'bug',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        labels: ['ashep-workflow:nonexistent']
      };

      expect(() => policyEngine.matchPolicy(issue)).toThrow(
        "Invalid workflow label: ashep-workflow:nonexistent. Policy 'nonexistent' does not exist."
      );
    });
  });

  describe('Issue Type Matching', () => {
    it('should match policy by issue type', () => {
      const issue = {
        id: 'test-3',
        title: 'Bug Issue',
        description: 'Fix a bug',
        status: 'open' as const,
        priority: 1,
        issue_type: 'bug',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        labels: []
      };

      const matched = policyEngine.matchPolicy(issue);
      // Should match bugfix policy (priority 80) not priority-low (70)
      expect(matched).toBe('priority-high');
    });

    it('should match feature issue type', () => {
      const issue = {
        id: 'test-4',
        title: 'Feature Issue',
        description: 'Add a feature',
        status: 'open' as const,
        priority: 1,
        issue_type: 'feature',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        labels: []
      };

      const matched = policyEngine.matchPolicy(issue);
      expect(matched).toBe('feature');
    });

    it('should match task issue type', () => {
      const issue = {
        id: 'test-5',
        title: 'Task Issue',
        description: 'Complete a task',
        status: 'open' as const,
        priority: 1,
        issue_type: 'task',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        labels: []
      };

      const matched = policyEngine.matchPolicy(issue);
      expect(matched).toBe('default');
    });
  });

  describe('Priority-Based Selection', () => {
    it('should select highest priority policy for issue type', () => {
      const issue = {
        id: 'test-6',
        title: 'Bug Issue',
        description: 'Fix a bug',
        status: 'open' as const,
        priority: 1,
        issue_type: 'bug',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        labels: []
      };

      const matched = policyEngine.matchPolicy(issue);
      // priority-high has priority 90, bugfix has 80, priority-low has 70
      expect(matched).toBe('priority-high');
    });

    it('should break ties using config order', () => {
      // Both priority-low and feature have priority 70
      // But feature comes before priority-low in the config
      const featureIssue = {
        id: 'test-7',
        title: 'Feature Issue',
        description: 'Add a feature',
        status: 'open' as const,
        priority: 1,
        issue_type: 'feature',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        labels: []
      };

      const matched = policyEngine.matchPolicy(featureIssue);
      expect(matched).toBe('feature');
    });
  });

  describe('Default Fallback', () => {
    it('should fall back to default policy when no match', () => {
      const issue = {
        id: 'test-8',
        title: 'Unknown Issue',
        description: 'Unknown type',
        status: 'open' as const,
        priority: 1,
        issue_type: 'unknown',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        labels: []
      };

      const matched = policyEngine.matchPolicy(issue);
      expect(matched).toBe('default');
    });

    it('should fall back to default when no labels and no issue type match', () => {
      const issue = {
        id: 'test-9',
        title: 'No Labels Issue',
        description: 'No labels or matching issue type',
        status: 'open' as const,
        priority: 1,
        issue_type: 'chore',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        labels: []
      };

      const matched = policyEngine.matchPolicy(issue);
      expect(matched).toBe('default');
    });

    it('should handle undefined labels', () => {
      const issue = {
        id: 'test-10',
        title: 'No Labels Issue',
        description: 'No labels array',
        status: 'open' as const,
        priority: 1,
        issue_type: 'unknown',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        labels: undefined
      };

      const matched = policyEngine.matchPolicy(issue);
      expect(matched).toBe('default');
    });
  });

  describe('Priority Order', () => {
    it('should use config order to break priority ties', () => {
      // Create a test case where two policies have the same priority
      // bugfix (priority 80) and priority-high (priority 90)
      // priority-high should win due to higher priority
      const issue = {
        id: 'test-11',
        title: 'Bug Issue',
        description: 'Fix a bug',
        status: 'open' as const,
        priority: 1,
        issue_type: 'bug',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        labels: []
      };

      const matched = policyEngine.matchPolicy(issue);
      expect(matched).toBe('priority-high');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty labels array', () => {
      const issue = {
        id: 'test-12',
        title: 'Empty Labels Issue',
        description: 'Empty labels array',
        status: 'open' as const,
        priority: 1,
        issue_type: 'bug',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        labels: []
      };

      const matched = policyEngine.matchPolicy(issue);
      expect(matched).toBe('priority-high');
    });

    it('should ignore non-workflow labels', () => {
      const issue = {
        id: 'test-13',
        title: 'Other Labels Issue',
        description: 'Has other labels but no workflow label',
        status: 'open' as const,
        priority: 1,
        issue_type: 'bug',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        labels: ['bug', 'critical', 'urgent']
      };

      const matched = policyEngine.matchPolicy(issue);
      expect(matched).toBe('priority-high');
    });
  });
});
