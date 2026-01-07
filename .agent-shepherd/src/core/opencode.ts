/**
 * OpenCode Integration
 * Uses CLI to start server and direct HTTP calls for API access
 */

export interface SessionConfig {
  directory?: string;
  title?: string;
  agent?: string;
  model?: string;
  message?: string;
}

export interface RunResult {
  success: boolean;
  output: string;
  error?: string;
  sessionId?: string;
}

export interface OpenCodeEvent {
  type: string;
  properties?: any;
  payload?: any;
  directory?: string;
}

export interface ToolCall {
  name: string;
  inputs: any;
  outputs?: string;
  duration_ms?: number;
  status: "completed" | "error" | "cancelled";
}

export interface Artifact {
  path: string;
  operation: "created" | "modified" | "deleted";
  size?: number;
  type?: "file" | "directory";
}

export interface ErrorDetails {
  type?: string;
  message?: string;
  stack_trace?: string;
  file_path?: string;
  line_number?: number;
}

export interface ParsedRunOutcome {
  success: boolean;
  message?: string;
  session_id?: string;
  artifacts?: Artifact[];
  error?: string;
  error_details?: ErrorDetails;
  warnings?: string[];
  tool_calls?: ToolCall[];
  metrics?: {
    duration_ms?: number;
    tokens_used?: number;
    cost?: number;
    start_time_ms?: number;
    end_time_ms?: number;
    api_calls_count?: number;
    model_name?: string;
  };
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

    // Add model override if specified
    if (config.model) {
      args.push("--model", config.model);
    }

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

  /**
   * Parse comprehensive run outcome from OpenCode CLI JSON output
   */
  parseRunOutput(stdout: string, stderr: string): ParsedRunOutcome {
    const outcome: ParsedRunOutcome = {
      success: true,
      artifacts: [],
      tool_calls: [],
      warnings: [],
      metrics: {},
    };

    const parseLine = (line: string) => {
      try {
        return JSON.parse(line) as OpenCodeEvent;
      } catch {
        return null;
      }
    };

    const processEvent = (event: OpenCodeEvent) => {
      if (!event) return;

      const payload = event.payload || event.properties;

      switch (event.type) {
        case "session.created":
        case "session.updated":
          if (payload?.info?.id) {
            outcome.session_id = payload.info.id;
          }
          break;

        case "session.status":
          if (payload?.status?.type === "retry") {
            outcome.warnings?.push(
              `Session retry: ${payload.status.message} (attempt ${payload.status.attempt})`
            );
          }
          break;

        case "session.error":
          outcome.success = false;
          outcome.error = payload?.error?.message || "Session error occurred";
          if (payload?.error) {
            outcome.error_details = {
              type: payload.error.name || "SessionError",
              message: payload.error.message,
            };
          }
          break;

        case "message.updated":
          if (payload?.info?.role === "assistant") {
            const msg = payload.info;
            if (msg.time?.created) {
              outcome.metrics!.start_time_ms = msg.time.created;
            }
            if (msg.time?.completed) {
              outcome.metrics!.end_time_ms = msg.time.completed;
            }
            if (msg.tokens) {
              outcome.metrics!.tokens_used = (msg.tokens.input || 0) + (msg.tokens.output || 0);
            }
            if (msg.cost) {
              outcome.metrics!.cost = msg.cost;
            }
            if (msg.modelID && msg.providerID) {
              outcome.metrics!.model_name = `${msg.providerID}/${msg.modelID}`;
            }
            if (msg.error) {
              outcome.success = false;
              outcome.error = msg.error.data?.message || "Message error occurred";
              outcome.error_details = {
                type: msg.error.name || "MessageError",
                message: msg.error.data?.message,
              };
            }
          }
          break;

        case "message.part.updated":
          if (payload?.part?.type === "tool") {
            const part = payload.part;
            const toolCall: ToolCall = {
              name: part.tool,
              inputs: part.state?.input,
              status: part.state?.status || "completed",
            };
            if (part.state?.status === "completed" && part.state.output) {
              toolCall.outputs = part.state.output;
            }
            if (part.state?.time) {
              const start = part.state.time.start || 0;
              const end = part.state.time.end || start;
              toolCall.duration_ms = end - start;
            }
            outcome.tool_calls?.push(toolCall);
          }
          break;

        case "file.edited":
          if (payload?.diff) {
            const artifact: Artifact = {
              path: payload.diff.file,
              operation: "modified",
            };
            if (payload.diff.additions > 0 || payload.diff.deletions > 0) {
              artifact.operation = "modified";
            }
            outcome.artifacts?.push(artifact);
          }
          break;

        case "permission.updated":
          outcome.warnings?.push(
            `Permission required: ${payload.title}`
          );
          break;

        case "command.executed":
          outcome.tool_calls?.push({
            name: "bash",
            inputs: { command: payload.command },
            outputs: payload.stdout,
            status: payload.exitCode === 0 ? "completed" : "error",
            duration_ms: payload.time?.start && payload.time?.end
              ? payload.time.end - payload.time.start
              : undefined,
          });
          break;
      }
    };

    const lines = stdout.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        const event = parseLine(line);
        if (event) {
          processEvent(event);
        }
      }
    }

    const stderrLines = stderr.split('\n');
    for (const line of stderrLines) {
      if (line.trim()) {
        const event = parseLine(line);
        if (event) {
          processEvent(event);
        }
      }
    }

    if (outcome.metrics!.start_time_ms && outcome.metrics!.end_time_ms) {
      outcome.metrics!.duration_ms = outcome.metrics!.end_time_ms - outcome.metrics!.start_time_ms;
    }

    if (outcome.tool_calls && outcome.tool_calls.length > 0) {
      outcome.metrics!.api_calls_count = outcome.tool_calls.length;
    }

    if (!outcome.error && outcome.success === false) {
      outcome.error = "Agent execution failed";
    }

    return outcome;
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