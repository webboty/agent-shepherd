import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { isServerRunning, ensureServerRunning } from "../src/core/process-manager.ts";
import type { OpenCodeServerConfig } from "../src/core/config.ts";

const TEST_PORT = 54321;
const TEST_URL = `http://localhost:${TEST_PORT}`;

const config: OpenCodeServerConfig = {
  auto_start: true,
  base_url: TEST_URL,
  startup_timeout_ms: 100 // Short timeout for tests
};

describe("OpenCode Server Management", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("isServerRunning should return true when fetch succeeds", async () => {
    global.fetch = mock(() => Promise.resolve(new Response("OK", { status: 200 }))) as any;
    const result = await isServerRunning(TEST_URL);
    expect(result).toBe(true);
  });

  it("isServerRunning should return false when fetch fails", async () => {
    global.fetch = mock(() => Promise.reject(new Error("Connection refused"))) as any;
    const result = await isServerRunning(TEST_URL);
    expect(result).toBe(false);
  });

  it("ensureServerRunning should return false if auto_start is disabled and server is down", async () => {
    global.fetch = mock(() => Promise.reject(new Error("Connection refused"))) as any;
    const noAutoConfig = { ...config, auto_start: false };
    const result = await ensureServerRunning(noAutoConfig);
    expect(result).toBe(false);
  });
  
  it("ensureServerRunning should return true if server is already running", async () => {
    global.fetch = mock(() => Promise.resolve(new Response("OK", { status: 200 }))) as any;
    const result = await ensureServerRunning(config);
    expect(result).toBe(true);
  });
});
