import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { loadConfig } from "../.agent-shepherd/src/core/config";

const TEST_DIR = join(process.cwd(), "tmp_test_config");

describe("config parsing", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
    }
    // Create the 'config' subdirectory so findConfigDir() picks it up via ASHEP_DIR
    mkdirSync(join(TEST_DIR, ".agent-shepherd", "config"), { recursive: true });
    
    // Set environment variable to mock the install directory
    process.env.ASHEP_DIR = join(TEST_DIR, ".agent-shepherd");
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.ASHEP_DIR;
  });

  test("should load YAML config", () => {
    const content = `
version: "1.0"
worker:
  poll_interval_ms: 5000
`;
    // Write to the 'config' subdirectory
    writeFileSync(join(TEST_DIR, ".agent-shepherd", "config", "config.yaml"), content);
    
    const config = loadConfig();
    expect(config.worker?.poll_interval_ms).toBe(5000);
  });

  test("should load JSON config", () => {
    const content = JSON.stringify({
      version: "1.0",
      worker: {
        poll_interval_ms: 6000
      }
    });
    // Write to the 'config' subdirectory
    writeFileSync(join(TEST_DIR, ".agent-shepherd", "config", "config.json"), content);
    
    const config = loadConfig();
    expect(config.worker?.poll_interval_ms).toBe(6000);
  });

  test("should load JSON5 config", () => {
    const content = `
{
  version: "1.0",
  // Comment
  worker: {
    poll_interval_ms: 7000,
  }
}
`;
    // Write to the 'config' subdirectory
    writeFileSync(join(TEST_DIR, ".agent-shepherd", "config", "config.json5"), content);
    
    const config = loadConfig();
    expect(config.worker?.poll_interval_ms).toBe(7000);
  });

  test("should load config from explicit directory (JSON)", () => {
    const explicitDir = join(TEST_DIR, "explicit");
    mkdirSync(join(explicitDir, ".agent-shepherd"), { recursive: true });
    
    const content = JSON.stringify({
      version: "1.0",
      worker: {
        poll_interval_ms: 8000
      }
    });
    // loadConfig(dir) expects .agent-shepherd/config.json (file named config in .agent-shepherd dir)
    // See src/core/config.ts logic: join(configDir, ".agent-shepherd", "config") + ext
    writeFileSync(join(explicitDir, ".agent-shepherd", "config.json"), content);
    
    const config = loadConfig(explicitDir);
    expect(config.worker?.poll_interval_ms).toBe(8000);
  });
});
