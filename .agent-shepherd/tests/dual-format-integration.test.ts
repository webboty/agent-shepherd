import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { loadConfig } from "../.agent-shepherd/src/core/config";
import { ConfigurationValidator } from "../.agent-shepherd/src/core/config-validator";

const TEST_DIR = join(process.cwd(), "tmp_test_integration_dual_format");

describe("Dual Format Config Integration", () => {
  let validator: ConfigurationValidator;

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(join(TEST_DIR, ".agent-shepherd", "config"), { recursive: true });
    mkdirSync(join(TEST_DIR, ".agent-shepherd", "schemas"), { recursive: true });

    process.env.ASHEP_DIR = join(TEST_DIR, ".agent-shepherd");
    validator = new ConfigurationValidator();

    // Create a mock schema for config.yaml/json
    const configSchema = {
      type: "object",
      properties: {
        version: { type: "string" },
        worker: {
          type: "object",
          properties: {
            poll_interval_ms: { type: "number" }
          }
        }
      },
      required: ["version"]
    };
    writeFileSync(
      join(TEST_DIR, ".agent-shepherd", "schemas", "config.schema.json"), 
      JSON.stringify(configSchema)
    );
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.ASHEP_DIR;
  });

  test("should load and validate JSON config correctly", async () => {
    const configPath = join(TEST_DIR, ".agent-shepherd", "config", "config.json");
    const content = JSON.stringify({
      version: "1.0",
      worker: {
        poll_interval_ms: 1000
      }
    });
    writeFileSync(configPath, content);

    // 1. Test loadConfig
    const config = loadConfig();
    expect(config.worker?.poll_interval_ms).toBe(1000);

    // 2. Test validation
    const schemaPath = join(TEST_DIR, ".agent-shepherd", "schemas", "config.schema.json");
    const result = await validator.validateAnyConfig(configPath, schemaPath);
    expect(result.valid).toBe(true);
  });

  test("should load and validate YAML config correctly", async () => {
    const configPath = join(TEST_DIR, ".agent-shepherd", "config", "config.yaml");
    const content = `
version: "1.0"
worker:
  poll_interval_ms: 2000
`;
    writeFileSync(configPath, content);

    // 1. Test loadConfig
    const config = loadConfig();
    expect(config.worker?.poll_interval_ms).toBe(2000);

    // 2. Test validation
    const schemaPath = join(TEST_DIR, ".agent-shepherd", "schemas", "config.schema.json");
    const result = await validator.validateAnyConfig(configPath, schemaPath);
    expect(result.valid).toBe(true);
  });

  test("should handle missing optional config file with different format", () => {
     // loadConfig throws if config file is not found
     expect(() => loadConfig()).toThrow();
  });

  test("should prefer YAML if both exist (priority test)", async () => {
    const yamlPath = join(TEST_DIR, ".agent-shepherd", "config", "config.yaml");
    const jsonPath = join(TEST_DIR, ".agent-shepherd", "config", "config.json");
    
    writeFileSync(yamlPath, "version: 'yaml'\nworker:\n  poll_interval_ms: 111");
    writeFileSync(jsonPath, JSON.stringify({ version: "json", worker: { poll_interval_ms: 222 } }));

    // path-utils priority is .yaml > .yml > .json > .json5
    // loadConfig uses getConfigPath("config.yaml") which triggers this priority scan
    // But getConfigPath implementation:
    // const extensions = [ext, ".yaml", ".yml", ".json", ".json5"]
    // If filename is "config.yaml", ext is ".yaml".
    // Extensions order: .yaml, .yml, .json, .json5
    // So it should pick yaml.

    const config = loadConfig();
    expect(config.worker?.poll_interval_ms).toBe(111);
  });
});
