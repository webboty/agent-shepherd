/**
 * Tests for Configuration Validator
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ConfigurationValidator } from '../src/core/config-validator.ts';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('ConfigurationValidator', () => {
  let validator: ConfigurationValidator;
  let tempDir: string;

  beforeEach(() => {
    validator = new ConfigurationValidator();
    tempDir = join(__dirname, 'temp-test');
    
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('validateConfig', () => {
    it('should validate a valid config file', async () => {
      // Create valid config
      const validConfig = {
        version: "1.0",
        worker: {
          poll_interval_ms: 30000,
          max_concurrent_runs: 3
        },
        ui: {
          port: 3000,
          host: "localhost"
        }
      };

      const validSchema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        type: "object",
        required: ["version"],
        properties: {
          version: { type: "string" },
          worker: {
            type: "object",
            properties: {
              poll_interval_ms: { type: "integer" },
              max_concurrent_runs: { type: "integer" }
            }
          },
          ui: {
            type: "object",
            properties: {
              port: { type: "integer" },
              host: { type: "string" }
            }
          }
        }
      };

      const configPath = join(tempDir, 'config.json');
      const schemaPath = join(tempDir, 'schema.json');
      
      writeFileSync(configPath, JSON.stringify(validConfig));
      writeFileSync(schemaPath, JSON.stringify(validSchema));

      const result = await validator.validateConfig(configPath, schemaPath);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid config file', async () => {
      const invalidConfig = {
        // Missing required version field
        worker: {
          poll_interval_ms: "invalid", // Should be integer
          max_concurrent_runs: 3
        }
      };

      const validSchema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        type: "object",
        required: ["version"],
        properties: {
          version: { type: "string" },
          worker: {
            type: "object",
            properties: {
              poll_interval_ms: { type: "integer" },
              max_concurrent_runs: { type: "integer" }
            }
          }
        }
      };

      const configPath = join(tempDir, 'config.json');
      const schemaPath = join(tempDir, 'schema.json');
      
      writeFileSync(configPath, JSON.stringify(invalidConfig));
      writeFileSync(schemaPath, JSON.stringify(validSchema));

      const result = await validator.validateConfig(configPath, schemaPath);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateYAMLConfig', () => {
    it('should validate YAML configuration', async () => {
      const yamlContent = `
version: "1.0"
worker:
  poll_interval_ms: 30000
  max_concurrent_runs: 3
      `.trim();

      const validSchema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        type: "object",
        required: ["version"],
        properties: {
          version: { type: "string" },
          worker: {
            type: "object",
            properties: {
              poll_interval_ms: { type: "integer" },
              max_concurrent_runs: { type: "integer" }
            }
          }
        }
      };

      const yamlPath = join(tempDir, 'config.yaml');
      const schemaPath = join(tempDir, 'schema.json');
      
      writeFileSync(yamlPath, yamlContent);
      writeFileSync(schemaPath, JSON.stringify(validSchema));

      const result = await validator.validateYAMLConfig(yamlPath, schemaPath);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});