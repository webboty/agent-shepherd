import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { getConfigPath } from "../src/core/path-utils";

const TEST_DIR = join(process.cwd(), "tmp_test_path_utils");

describe("path-utils extensions", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(join(TEST_DIR, ".agent-shepherd", "config"), { recursive: true });
    // Set environment variable to mock the install directory
    process.env.ASHEP_DIR = join(TEST_DIR, ".agent-shepherd");
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.ASHEP_DIR;
  });

  test("should find existing .yaml file", () => {
    const yamlPath = join(TEST_DIR, ".agent-shepherd", "config", "test.yaml");
    writeFileSync(yamlPath, "content");
    
    const result = getConfigPath("test.yaml");
    expect(result).toBe(yamlPath);
  });

  test("should find .json file when .yaml is requested but missing", () => {
    const jsonPath = join(TEST_DIR, ".agent-shepherd", "config", "test.json");
    writeFileSync(jsonPath, "{}");
    
    const result = getConfigPath("test.yaml");
    expect(result).toBe(jsonPath);
  });

  test("should prioritize .yaml over .json", () => {
    const yamlPath = join(TEST_DIR, ".agent-shepherd", "config", "test.yaml");
    const jsonPath = join(TEST_DIR, ".agent-shepherd", "config", "test.json");
    writeFileSync(yamlPath, "yaml");
    writeFileSync(jsonPath, "json");
    
    const result = getConfigPath("test.yaml");
    expect(result).toBe(yamlPath);
  });
  
  test("should default to requested filename if none exist", () => {
    const result = getConfigPath("nonexistent.yaml");
    expect(result).toBe(join(TEST_DIR, ".agent-shepherd", "config", "nonexistent.yaml"));
  });
});
