import { spawn } from "bun";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, openSync } from "fs";
import { join } from "path";
import { findAgentShepherdDir } from "./path-utils.ts";
import type { OpenCodeServerConfig } from "./config.ts";

const PID_FILE_NAME = "opencode-server.pid";

function getRunDir(): string {
  const root = findAgentShepherdDir();
  const runDir = join(root, "run");
  if (!existsSync(runDir)) {
    mkdirSync(runDir, { recursive: true });
  }
  return runDir;
}

function getPidFilePath(): string {
  return join(getRunDir(), PID_FILE_NAME);
}

export async function isServerRunning(baseUrl: string): Promise<boolean> {
  try {
    // Try health/status endpoint first
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    
    try {
        const response = await fetch(`${baseUrl}/api/status`, { 
        method: "GET",
        signal: controller.signal 
        });
        clearTimeout(timeoutId);
        return response.ok;
    } catch {
        clearTimeout(timeoutId);
        // Fallback to root
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 1000);
        try {
            const response = await fetch(baseUrl, { 
                method: "GET",
                signal: controller2.signal
            });
            clearTimeout(timeoutId2);
            return response.ok; // 200-299 is ok
        } catch {
            clearTimeout(timeoutId2);
            return false;
        }
    }
  } catch {
    return false;
  }
}

export function getServerPid(): number | null {
  const pidPath = getPidFilePath();
  if (existsSync(pidPath)) {
    try {
      const pid = parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
      if (!isNaN(pid)) {
        // Verify process existence
        try {
            process.kill(pid, 0); // Throws if process doesn't exist
            return pid;
        } catch {
            // Process doesn't exist
            unlinkSync(pidPath); // Clean up stale file
        }
      }
    } catch {
      // File corrupt or error reading
      // eslint-disable-next-line no-empty
      try { unlinkSync(pidPath); } catch {}
    }
  }
  return null;
}

export async function startServer(config: OpenCodeServerConfig): Promise<boolean> {
  // Check if already running via API
  if (await isServerRunning(config.base_url)) {
    return true;
  }

  // Check if PID exists (zombie or starting?)
  const existingPid = getServerPid();
  if (existingPid) {
    // Process exists but API failed? Maybe starting up?
    // Give it a chance? Or assume stuck?
    // Let's assume starting if within timeout window? Hard to know.
    // For now, assume it's valid and return true (waiter will fail if it never comes up)
    return true;
  }

  // Extract port from URL
  let port = 4321;
  try {
    const url = new URL(config.base_url);
    if (url.port) port = parseInt(url.port, 10);
  } catch {
    // Default
  }

  console.log(`Starting OpenCode server on port ${port}...`);

  const logFile = join(getRunDir(), "opencode-server.log");
  
  try {
    const logFd = openSync(logFile, "a");

    const proc = spawn(["opencode", "serve", "--port", port.toString()], {
      stdin: "ignore",
      stdout: logFd,
      stderr: logFd,
      detached: true, // Key for daemon
    });

    // Write PID
    writeFileSync(getPidFilePath(), proc.pid.toString());
    
    // Unref to detach completely
    proc.unref();

    // Wait for startup
    const start = Date.now();
    while (Date.now() - start < config.startup_timeout_ms) {
      if (await isServerRunning(config.base_url)) {
        console.log("✅ OpenCode server started successfully.");
        return true;
      }
      await new Promise(r => setTimeout(r, 500));
    }

    console.error("❌ Timeout waiting for OpenCode server to start.");
    return false;
  } catch (error) {
    console.error("❌ Failed to spawn opencode serve:", error);
    return false;
  }
}

export function stopServer(): boolean {
  const pid = getServerPid();
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, "SIGTERM");
    
    // Cleanup file immediately to prevent subsequent calls
    const pidPath = getPidFilePath();
    if (existsSync(pidPath)) unlinkSync(pidPath);
    
    console.log(`Stopped OpenCode server (PID: ${pid}).`);
    return true;
  } catch (error) {
    console.error(`Failed to stop server (PID: ${pid}):`, error);
    return false;
  }
}

export async function ensureServerRunning(config: OpenCodeServerConfig): Promise<boolean> {
  if (await isServerRunning(config.base_url)) {
    return true;
  }

  if (!config.auto_start) {
    return false;
  }

  return startServer(config);
}
