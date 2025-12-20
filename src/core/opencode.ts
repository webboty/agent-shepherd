/**
 * OpenCode Integration
 * Uses CLI to start server and direct HTTP calls for API access
 */

export interface SessionConfig {
  directory?: string;
  title?: string;
  agent?: string;
  message?: string;
}

export interface RunResult {
  success: boolean;
  output: string;
  error?: string;
  sessionId?: string;
}

/**
 * OpenCode client using CLI commands
 */
export class OpenCodeClient {
  private directory: string;

  constructor(config?: { directory?: string }) {
    this.directory = config?.directory || process.cwd();
  }

  /**
   * Run an agent using OpenCode CLI (simpler and more reliable)
   */
  async runAgentCLI(config: SessionConfig): Promise<RunResult> {
    const { spawn } = await import("bun");
    const args = [
      "run",
      "--agent", config.agent || "default",
      "--format", "json",
      "--title", config.title || "Agent Shepherd Run",
    ];

    if (config.message) {
      args.push(config.message);
    }

    console.log(`Running: opencode ${args.join(' ')}`);

    const proc = spawn(["opencode", ...args], {
      cwd: this.directory,
      stdout: "pipe",
      stderr: "pipe",
    });

    let stdout = "";
    let stderr = "";

    // Handle stdout
    const stdoutReader = proc.stdout?.getReader();
    if (stdoutReader) {
      try {
        while (true) {
          const { done, value } = await stdoutReader.read();
          if (done) break;
          stdout += new TextDecoder().decode(value);
        }
      } finally {
        stdoutReader.releaseLock();
      }
    }

    // Handle stderr
    const stderrReader = proc.stderr?.getReader();
    if (stderrReader) {
      try {
        while (true) {
          const { done, value } = await stderrReader.read();
          if (done) break;
          stderr += new TextDecoder().decode(value);
        }
      } finally {
        stderrReader.releaseLock();
      }
    }

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return {
        success: false,
        output: stdout,
        error: stderr || `Process exited with code ${exitCode}`,
      };
    }

    return {
      success: true,
      output: stdout,
      sessionId: this.extractSessionId(stdout),
    };
  }

  /**
   * Run agent (alias for runAgentCLI)
   */
  async runAgent(config: SessionConfig): Promise<RunResult> {
    return this.runAgentCLI(config);
  }

  /**
   * Extract session ID from OpenCode output
   */
  private extractSessionId(output: string): string | undefined {
    try {
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          const data = JSON.parse(line);
          if (data.sessionId || data.session_id) {
            return data.sessionId || data.session_id;
          }
        }
      }
    } catch {
      // Ignore JSON parsing errors
    }
    return undefined;
  }

  // Placeholder methods for SDK compatibility
  async createSession(): Promise<any> {
    throw new Error("Use runAgentCLI() instead - SDK methods not implemented");
  }

  async sendMessage(): Promise<any> {
    throw new Error("Use runAgentCLI() instead - SDK methods not implemented");
  }

  async getMessages(): Promise<any[]> {
    return [];
  }

  async waitForCompletion(): Promise<any> {
    throw new Error("Use runAgentCLI() instead - SDK methods not implemented");
  }

  isHumanMessage(): boolean {
    return false;
  }

  async abortSession(): Promise<void> {
    // No-op for CLI approach
  }
}

/**
 * Create a singleton OpenCode client instance
 */
let defaultClient: OpenCodeClient | null = null;

export function getOpenCodeClient(config?: {
  directory?: string;
  serverUrl?: string;
}): OpenCodeClient {
  if (!defaultClient) {
    defaultClient = new OpenCodeClient(config);
  }
  return defaultClient;
}