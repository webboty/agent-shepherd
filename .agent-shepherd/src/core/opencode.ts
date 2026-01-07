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
  code?: string;
  context?: string;
}

export interface SessionMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content?: string;
  timestamp?: number;
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    total?: number;
  };
  parts?: Array<{
    type: "text" | "tool" | "thinking";
    tool?: string;
    content?: string;
  }>;
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
    cache_reads?: number;
    cache_writes?: number;
  };
  messages?: SessionMessage[];
  raw_output?: {
    stdout: string;
    stderr: string;
    exit_code?: number;
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
   * Safe property getter for nested objects
   */
  private safeGet<T>(obj: any, path: string, defaultValue?: T): T | undefined {
    try {
      const keys = path.split(".");
      let result = obj;
      for (const key of keys) {
        if (result && typeof result === "object" && key in result) {
          result = result[key];
        } else {
          return defaultValue;
        }
      }
      return result as T;
    } catch {
      return defaultValue;
    }
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
      messages: [],
      raw_output: {
        stdout,
        stderr,
      },
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
          if (this.safeGet<string>(payload, "info.id")) {
            outcome.session_id = this.safeGet<string>(payload, "info.id");
          }
          break;

        case "session.status":
          if (this.safeGet<string>(payload, "status.type") === "retry") {
            outcome.warnings?.push(
              `Session retry: ${this.safeGet<string>(payload, "status.message", "")} (attempt ${this.safeGet<number>(payload, "status.attempt", 0)})`
            );
          }
          break;

        case "session.error":
          outcome.success = false;
          outcome.error = this.safeGet<string>(payload, "error.message", "Session error occurred");
          if (this.safeGet<any>(payload, "error")) {
            outcome.error_details = {
              type: this.safeGet<string>(payload, "error.name", "SessionError"),
              message: this.safeGet<string>(payload, "error.message"),
              stack_trace: this.safeGet<string>(payload, "error.stack"),
              code: this.safeGet<string>(payload, "error.code"),
              context: this.safeGet<string>(payload, "error.context"),
            };
          }
          break;

        case "message.updated": {
          const role = this.safeGet<string>(payload, "info.role");
          if (role === "assistant" || role === "user") {
            const msg = payload.info;
            if (role === "assistant") {
              if (this.safeGet<number>(msg, "time.created")) {
                outcome.metrics!.start_time_ms = this.safeGet<number>(msg, "time.created");
              }
              if (this.safeGet<number>(msg, "time.completed")) {
                outcome.metrics!.end_time_ms = this.safeGet<number>(msg, "time.completed");
              }
              if (this.safeGet<any>(msg, "tokens")) {
                outcome.metrics!.tokens_used = (this.safeGet<number>(msg, "tokens.input", 0) || 0) + (this.safeGet<number>(msg, "tokens.output", 0) || 0);
                const tokens = this.safeGet<any>(msg, "tokens");
                if (tokens && tokens.cache) {
                  outcome.metrics!.cache_reads = this.safeGet<number>(tokens, "cache.read", 0) || 0;
                  outcome.metrics!.cache_writes = this.safeGet<number>(tokens, "cache.write", 0) || 0;
                }
              }
              if (this.safeGet<number>(msg, "cost")) {
                outcome.metrics!.cost = this.safeGet<number>(msg, "cost");
              }
              const modelID = this.safeGet<string>(msg, "modelID");
              const providerID = this.safeGet<string>(msg, "providerID");
              if (modelID && providerID) {
                outcome.metrics!.model_name = `${providerID}/${modelID}`;
              }
              if (this.safeGet<any>(msg, "error")) {
                outcome.success = false;
                outcome.error = this.safeGet<string>(msg, "error.data.message", "Message error occurred");
                outcome.error_details = {
                  type: this.safeGet<string>(msg, "error.name", "MessageError"),
                  message: this.safeGet<string>(msg, "error.data.message"),
                  stack_trace: this.safeGet<string>(msg, "error.data.stack"),
                  file_path: this.safeGet<string>(msg, "error.data.file_path"),
                  line_number: this.safeGet<number>(msg, "error.data.line_number"),
                  code: this.safeGet<string>(msg, "error.data.code"),
                };
              }
            }

            const message: SessionMessage = {
              id: this.safeGet<string>(msg, "id"),
              role: role as "user" | "assistant" | "system",
              content: this.safeGet<string>(msg, "content"),
              timestamp: this.safeGet<number>(msg, "time.created"),
            };

            if (role === "assistant") {
              message.tokens = {
                input: this.safeGet<number>(msg, "tokens.input"),
                output: this.safeGet<number>(msg, "tokens.output"),
                reasoning: this.safeGet<number>(msg, "tokens.reasoning"),
                total: this.safeGet<number>(msg, "tokens.total"),
              };
            }

            outcome.messages?.push(message);
          }
          break;
        }

        case "message.part.updated":
          if (this.safeGet<string>(payload, "part.type") === "tool") {
            const part = payload.part;
            const toolName = this.safeGet<string>(part, "tool");
            const toolCall: ToolCall = {
              name: toolName || "",
              inputs: this.safeGet<any>(part, "state.input"),
              status: this.safeGet<string>(part, "state.status", "completed") as any,
            };
            const status = this.safeGet<string>(part, "state.status");
            if (status === "completed") {
              const output = this.safeGet<string>(part, "state.output");
              if (output) {
                toolCall.outputs = output;
              }
            }
            const timeObj = this.safeGet<any>(part, "state.time");
            if (timeObj) {
              const start = this.safeGet<number>(timeObj, "start", 0) || 0;
              const end = this.safeGet<number>(timeObj, "end", start) || start;
              toolCall.duration_ms = end - start;
            }
            outcome.tool_calls?.push(toolCall);
          }
          break;

        case "file.edited": {
          if (this.safeGet<any>(payload, "diff")) {
            const filePath = this.safeGet<string>(payload, "diff.file");
            if (filePath) {
              const artifact: Artifact = {
                path: filePath,
                operation: "modified",
                size: this.safeGet<number>(payload, "diff.size"),
                type: this.safeGet<string>(payload, "diff.type") as any,
              };
              const additions = this.safeGet<number>(payload, "diff.additions", 0) || 0;
              const deletions = this.safeGet<number>(payload, "diff.deletions", 0) || 0;
              if (additions > 0 || deletions > 0) {
                artifact.operation = "modified";
              }
              outcome.artifacts?.push(artifact);
            }
          }
          break;
        }

        case "permission.updated":
          outcome.warnings?.push(
            `Permission required: ${this.safeGet<string>(payload, "title", "")}`
          );
          break;

        case "command.executed": {
          const timeObj = this.safeGet<any>(payload, "time");
          const startTime = this.safeGet<number>(timeObj, "start");
          const endTime = this.safeGet<number>(timeObj, "end");
          outcome.tool_calls?.push({
            name: "bash",
            inputs: { command: this.safeGet<string>(payload, "command", "") },
            outputs: this.safeGet<string>(payload, "stdout"),
            status: (this.safeGet<number>(payload, "exitCode", 0) === 0 ? "completed" : "error") as any,
            duration_ms: (startTime !== undefined && endTime !== undefined)
              ? endTime - startTime
              : undefined,
          });
          break;
        }
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