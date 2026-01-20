import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const TEST_DIR = join(process.cwd(), "tmp_test_convert");
// Mock the CLI entry point would be complex, so we will test the logic by invoking the CLI if possible
// or just verify the functionality if we extracted it. Since it's in CLI index.ts and not exported, 
// we might need to run the built binary or the ts file directly.
// Running ts file directly via bun run src/cli/index.ts is best.

const CLI_PATH = join(process.cwd(), "src", "cli", "index.ts");

describe("cli convert-config", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test("should convert YAML to JSON", () => {
    const yamlPath = join(TEST_DIR, "config.yaml");
    const jsonPath = join(TEST_DIR, "config.json");
    
    writeFileSync(yamlPath, "key: value\nnested:\n  foo: bar");
    
    // Run CLI command
    execSync(`bun run "${CLI_PATH}" convert-config "${yamlPath}" "${jsonPath}"`);
    
    expect(existsSync(jsonPath)).toBe(true);
    const content = JSON.parse(readFileSync(jsonPath, "utf-8"));
    expect(content).toEqual({ key: "value", nested: { foo: "bar" } });
  });

  test("should convert JSON to YAML", () => {
    const jsonPath = join(TEST_DIR, "config.json");
    const yamlPath = join(TEST_DIR, "config.yaml");
    
    writeFileSync(jsonPath, JSON.stringify({ key: "value", nested: { foo: "bar" } }));
    
    execSync(`bun run "${CLI_PATH}" convert-config "${jsonPath}" "${yamlPath}"`);
    
    expect(existsSync(yamlPath)).toBe(true);
    const content = readFileSync(yamlPath, "utf-8");
    expect(content).toContain("key: value");
    expect(content).toContain("nested:");
    expect(content).toContain("foo: bar");
  });

  test("should convert JSON5 to JSON", () => {
    const json5Path = join(TEST_DIR, "config.json5");
    const jsonPath = join(TEST_DIR, "config.json");
    
    writeFileSync(json5Path, "{ key: 'value', // comment \n }");
    
    execSync(`bun run "${CLI_PATH}" convert-config "${json5Path}" "${jsonPath}"`);
    
    const content = JSON.parse(readFileSync(jsonPath, "utf-8"));
    expect(content).toEqual({ key: "value" });
  });
});
