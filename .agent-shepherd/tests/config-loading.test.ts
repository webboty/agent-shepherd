/**
 * Tests for Config Loading with Workflow and HITL Sections
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from '../src/core/config.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Config Loading - Workflow and HITL', () => {
  let tempDir: string;
  let configDir: string;

  beforeEach(() => {
    tempDir = join(__dirname, 'temp-config-test');
    configDir = join(tempDir, '.agent-shepherd');
    mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Workflow Configuration', () => {
    it('should load workflow config with all values', () => {
      const configContent = `
version: "1.0"
workflow:
  invalid_label_strategy: warning
`;

      const configPath = join(configDir, 'config.yaml');
      writeFileSync(configPath, configContent);

      const config = loadConfig(tempDir);

      expect(config.workflow).toBeDefined();
      expect(config.workflow?.invalid_label_strategy).toBe('warning');
    });

    it('should use default invalid_label_strategy if not specified', () => {
      const configContent = `
version: "1.0"
workflow:
  invalid_label_strategy: error
`;

      const configPath = join(configDir, 'config.yaml');
      writeFileSync(configPath, configContent);

      const config = loadConfig(tempDir);

      expect(config.workflow).toBeDefined();
      expect(config.workflow?.invalid_label_strategy).toBe('error');
    });

    it('should accept all valid invalid_label_strategy values', () => {
      const strategies = ['error', 'warning', 'ignore'] as const;

      for (const strategy of strategies) {
        const configContent = `
version: "1.0"
workflow:
  invalid_label_strategy: ${strategy}
`;

        const configPath = join(configDir, 'config.yaml');
        writeFileSync(configPath, configContent);

        const config = loadConfig(tempDir);

        expect(config.workflow?.invalid_label_strategy).toBe(strategy);
      }
    });
  });

  describe('HITL Configuration', () => {
    it('should load hitl config with all values', () => {
      const configContent = `
version: "1.0"
hitl:
  allowed_reasons:
    predefined:
      - approval
      - manual-intervention
      - custom-reason
    allow_custom: false
    custom_validation: alphanumeric
`;

      const configPath = join(configDir, 'config.yaml');
      writeFileSync(configPath, configContent);

      const config = loadConfig(tempDir);

      expect(config.hitl).toBeDefined();
      expect(config.hitl?.allowed_reasons.predefined).toEqual(['approval', 'manual-intervention', 'custom-reason']);
      expect(config.hitl?.allowed_reasons.allow_custom).toBe(false);
      expect(config.hitl?.allowed_reasons.custom_validation).toBe('alphanumeric');
    });

    it('should use default hitl config if not specified', () => {
      const configContent = `
version: "1.0"
hitl:
  allowed_reasons:
    predefined:
      - approval
      - manual-intervention
    allow_custom: true
    custom_validation: alphanumeric-dash-underscore
`;

      const configPath = join(configDir, 'config.yaml');
      writeFileSync(configPath, configContent);

      const config = loadConfig(tempDir);

      expect(config.hitl).toBeDefined();
      expect(config.hitl?.allowed_reasons.predefined).toEqual(['approval', 'manual-intervention']);
      expect(config.hitl?.allowed_reasons.allow_custom).toBe(true);
      expect(config.hitl?.allowed_reasons.custom_validation).toBe('alphanumeric-dash-underscore');
    });

    it('should accept all valid custom_validation values', () => {
      const validations = ['none', 'alphanumeric', 'alphanumeric-dash-underscore'] as const;

      for (const validation of validations) {
        const configContent = `
version: "1.0"
hitl:
  allowed_reasons:
    predefined:
      - approval
    allow_custom: true
    custom_validation: ${validation}
`;

        const configPath = join(configDir, 'config.yaml');
        writeFileSync(configPath, configContent);

        const config = loadConfig(tempDir);

        expect(config.hitl?.allowed_reasons.custom_validation).toBe(validation);
      }
    });

    it('should accept custom predefined reasons', () => {
      const configContent = `
version: "1.0"
hitl:
  allowed_reasons:
    predefined:
      - approval
      - custom-reason-1
      - custom_reason_2
      - anotherReason123
    allow_custom: true
    custom_validation: alphanumeric-dash-underscore
`;

      const configPath = join(configDir, 'config.yaml');
      writeFileSync(configPath, configContent);

      const config = loadConfig(tempDir);

      expect(config.hitl?.allowed_reasons.predefined).toEqual([
        'approval',
        'custom-reason-1',
        'custom_reason_2',
        'anotherReason123'
      ]);
    });
  });

  describe('Full Configuration', () => {
    it('should load complete config with workflow and hitl sections', () => {
      const configContent = `
version: "1.0"

worker:
  poll_interval_ms: 30000
  max_concurrent_runs: 3

monitor:
  poll_interval_ms: 10000
  stall_threshold_ms: 60000
  timeout_multiplier: 1.0

ui:
  port: 3000
  host: localhost

fallback:
  enabled: true
  default_agent: build

workflow:
  invalid_label_strategy: error

hitl:
  allowed_reasons:
    predefined:
      - approval
      - manual-intervention
      - timeout
      - error
      - review-request
    allow_custom: true
    custom_validation: alphanumeric-dash-underscore
`;

      const configPath = join(configDir, 'config.yaml');
      writeFileSync(configPath, configContent);

      const config = loadConfig(tempDir);

      expect(config.version).toBe('1.0');
      expect(config.worker?.poll_interval_ms).toBe(30000);
      expect(config.worker?.max_concurrent_runs).toBe(3);
      expect(config.monitor?.poll_interval_ms).toBe(10000);
      expect(config.monitor?.stall_threshold_ms).toBe(60000);
      expect(config.monitor?.timeout_multiplier).toBe(1.0);
      expect(config.ui?.port).toBe(3000);
      expect(config.ui?.host).toBe('localhost');
      expect(config.fallback?.enabled).toBe(true);
      expect(config.fallback?.default_agent).toBe('build');
      expect(config.workflow?.invalid_label_strategy).toBe('error');
      expect(config.hitl?.allowed_reasons.predefined).toEqual([
        'approval',
        'manual-intervention',
        'timeout',
        'error',
        'review-request'
      ]);
      expect(config.hitl?.allowed_reasons.allow_custom).toBe(true);
      expect(config.hitl?.allowed_reasons.custom_validation).toBe('alphanumeric-dash-underscore');
    });
  });

  describe('Backward Compatibility', () => {
    it('should load config without workflow and hitl sections', () => {
      const configContent = `
version: "1.0"

worker:
  poll_interval_ms: 30000

ui:
  port: 3000
  host: localhost
`;

      const configPath = join(configDir, 'config.yaml');
      writeFileSync(configPath, configContent);

      const config = loadConfig(tempDir);

      expect(config.version).toBe('1.0');
      expect(config.worker?.poll_interval_ms).toBe(30000);
      expect(config.ui?.port).toBe(3000);
      expect(config.ui?.host).toBe('localhost');
      expect(config.workflow).toBeDefined();
      expect(config.workflow?.invalid_label_strategy).toBe('error');
      expect(config.hitl).toBeUndefined();
    });
  });
});
