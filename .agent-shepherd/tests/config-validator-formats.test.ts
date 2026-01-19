import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { ConfigurationValidator } from "../src/core/config-validator";

const TEST_DIR = join(process.cwd(), "tmp_test_validator");

describe("config validator formats", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(join(TEST_DIR, ".agent-shepherd", "config"), { recursive: true });
    mkdirSync(join(TEST_DIR, ".agent-shepherd", "schemas"), { recursive: true });
    
    process.env.ASHEP_DIR = join(TEST_DIR, ".agent-shepherd");
    
    // Create dummy schema
    const schema = {
      type: "object",
      properties: {
        version: { type: "string" }
      },
      required: ["version"]
    };
    writeFileSync(join(TEST_DIR, ".agent-shepherd", "schemas", "config.schema.json"), JSON.stringify(schema));
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.ASHEP_DIR;
  });

  test("should validate JSON config", async () => {
    const validator = new ConfigurationValidator();
    const configPath = join(TEST_DIR, ".agent-shepherd", "config", "config.json");
    const schemaPath = join(TEST_DIR, ".agent-shepherd", "schemas", "config.schema.json");
    
    writeFileSync(configPath, JSON.stringify({ version: "1.0" }));
    
    const result = await validator.validateAnyConfig(configPath, schemaPath);
    expect(result.valid).toBe(true);
  });

  test("should validate JSON5 config", async () => {
    const validator = new ConfigurationValidator();
    const configPath = join(TEST_DIR, ".agent-shepherd", "config", "config.json5");
    const schemaPath = join(TEST_DIR, ".agent-shepherd", "schemas", "config.schema.json");
    
    writeFileSync(configPath, "{ version: '1.0', // comment \n }");
    
    const result = await validator.validateAnyConfig(configPath, schemaPath);
    expect(result.valid).toBe(true);
  });

  test("should catch errors in invalid format", async () => {
    const validator = new ConfigurationValidator();
    const configPath = join(TEST_DIR, ".agent-shepherd", "config", "config.json");
    const schemaPath = join(TEST_DIR, ".agent-shepherd", "schemas", "config.schema.json");
    
    writeFileSync(configPath, "invalid json");
    
    const result = await validator.validateAnyConfig(configPath, schemaPath);
    expect(result.valid).toBe(false);
    expect(result.errors[0].keyword).toBe("parse-error");
  });
});
