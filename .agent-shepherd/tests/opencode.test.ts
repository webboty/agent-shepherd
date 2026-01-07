/**
 * OpenCode Output Parsing Tests
 * Tests for parseRunOutput() method
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { OpenCodeClient, type ParsedRunOutcome } from "../src/core/opencode";

describe("OpenCodeClient.parseRunOutput", () => {
  let client: OpenCodeClient;

  beforeEach(() => {
    client = new OpenCodeClient();
  });

  describe("Session ID extraction", () => {
    test("extracts session_id from session.created event", () => {
      const stdout = JSON.stringify({
        type: "session.created",
        properties: {
          info: {
            id: "session-abc123",
            projectID: "project-xyz",
            directory: "/path",
            title: "Test",
            time: { created: Date.now() },
          },
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.session_id).toBe("session-abc123");
    });

    test("extracts session_id from session.updated event", () => {
      const stdout = JSON.stringify({
        type: "session.updated",
        properties: {
          info: {
            id: "session-xyz789",
            projectID: "project-xyz",
            directory: "/path",
            title: "Updated",
            time: { created: Date.now() },
          },
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.session_id).toBe("session-xyz789");
    });

    test("handles missing session_id gracefully", () => {
      const stdout = JSON.stringify({
        type: "message.updated",
        properties: {
          info: {
            id: "msg-123",
            sessionID: "session-abc",
            role: "assistant",
          },
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.session_id).toBeUndefined();
    });
  });

  describe("Metrics extraction", () => {
    test("extracts tokens from assistant message", () => {
      const stdout = [
        JSON.stringify({
          type: "message.updated",
          properties: {
            info: {
              id: "msg-1",
              sessionID: "session-1",
              role: "assistant",
              time: { created: 1000, completed: 2000 },
              tokens: {
                input: 1000,
                output: 500,
                reasoning: 0,
                cache: { read: 0, write: 100 },
              },
              cost: 0.01,
            },
          },
        }),
      ].join("\n");

      const result = client.parseRunOutput(stdout, "");

      expect(result.metrics?.tokens_used).toBe(1500);
      expect(result.metrics?.cost).toBe(0.01);
      expect(result.metrics?.start_time_ms).toBe(1000);
      expect(result.metrics?.end_time_ms).toBe(2000);
      expect(result.metrics?.duration_ms).toBe(1000);
    });

    test("extracts model name from message", () => {
      const stdout = JSON.stringify({
        type: "message.updated",
        properties: {
          info: {
            id: "msg-1",
            sessionID: "session-1",
            role: "assistant",
            providerID: "anthropic",
            modelID: "claude-sonnet",
          },
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.metrics?.model_name).toBe("anthropic/claude-sonnet");
    });

    test("calculates duration from timestamps", () => {
      const stdout = [
        JSON.stringify({
          type: "message.updated",
          properties: {
            info: {
              id: "msg-1",
              role: "assistant",
              time: { created: 1000, completed: 5000 },
            },
          },
        }),
      ].join("\n");

      const result = client.parseRunOutput(stdout, "");

      expect(result.metrics?.duration_ms).toBe(4000);
    });

    test("counts tool calls", () => {
      const stdout = [
        JSON.stringify({
          type: "message.updated",
          properties: { info: { id: "msg-1", role: "assistant" } },
        }),
        JSON.stringify({
          type: "message.part.updated",
          properties: {
            part: {
              type: "tool",
              tool: "bash",
              state: { status: "completed", input: {} },
            },
          },
        }),
        JSON.stringify({
          type: "message.part.updated",
          properties: {
            part: {
              type: "tool",
              tool: "write",
              state: { status: "completed", input: {} },
            },
          },
        }),
      ].join("\n");

      const result = client.parseRunOutput(stdout, "");

      expect(result.metrics?.api_calls_count).toBe(2);
    });
  });

  describe("Artifact parsing", () => {
    test("extracts file modifications from file.edited events", () => {
      const stdout = JSON.stringify({
        type: "file.edited",
        properties: {
          diff: {
            file: "/path/to/file.ts",
            before: "old content",
            after: "new content",
            additions: 10,
            deletions: 5,
          },
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts?.[0]).toEqual({
        path: "/path/to/file.ts",
        operation: "modified",
      });
    });

    test("handles multiple file edits", () => {
      const stdout = [
        JSON.stringify({
          type: "file.edited",
          properties: {
            diff: {
              file: "/path/file1.ts",
              additions: 5,
              deletions: 0,
            },
          },
        }),
        JSON.stringify({
          type: "file.edited",
          properties: {
            diff: {
              file: "/path/file2.ts",
              additions: 10,
              deletions: 3,
            },
          },
        }),
      ].join("\n");

      const result = client.parseRunOutput(stdout, "");

      expect(result.artifacts).toHaveLength(2);
      expect(result.artifacts?.[0].path).toBe("/path/file1.ts");
      expect(result.artifacts?.[1].path).toBe("/path/file2.ts");
    });
  });

  describe("Tool call parsing", () => {
    test("extracts completed tool calls", () => {
      const stdout = JSON.stringify({
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            tool: "bash",
            state: {
              status: "completed",
              input: { command: "echo hello" },
              output: "hello\n",
              time: { start: 1000, end: 2000 },
            },
          },
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls?.[0]).toEqual({
        name: "bash",
        inputs: { command: "echo hello" },
        outputs: "hello\n",
        duration_ms: 1000,
        status: "completed",
      });
    });

    test("extracts tool call with error status", () => {
      const stdout = JSON.stringify({
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            tool: "bash",
            state: {
              status: "error",
              input: { command: "fail" },
              error: "Command failed",
              time: { start: 1000, end: 2000 },
            },
          },
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.tool_calls?.[0].status).toBe("error");
      expect(result.tool_calls?.[0]).toEqual({
        name: "bash",
        inputs: { command: "fail" },
        status: "error",
        duration_ms: 1000,
      });
    });

    test("handles tool calls without timing", () => {
      const stdout = JSON.stringify({
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            tool: "write",
            state: {
              status: "completed",
              input: { path: "test.txt" },
            },
          },
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.tool_calls?.[0].duration_ms).toBeUndefined();
    });
  });

  describe("Error handling", () => {
    test("extracts error details from session.error", () => {
      const stdout = JSON.stringify({
        type: "session.error",
        properties: {
          sessionID: "session-1",
          error: {
            name: "ApiError",
            message: "API rate limit exceeded",
          },
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.success).toBe(false);
      expect(result.error).toBe("API rate limit exceeded");
      expect(result.error_details).toEqual({
        type: "ApiError",
        message: "API rate limit exceeded",
      });
    });

    test("extracts error details from message", () => {
      const stdout = JSON.stringify({
        type: "message.updated",
        properties: {
          info: {
            id: "msg-1",
            role: "assistant",
            error: {
              name: "ProviderAuthError",
              data: {
                providerID: "anthropic",
                message: "Invalid API key",
              },
            },
          },
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid API key");
      expect(result.error_details).toEqual({
        type: "ProviderAuthError",
        message: "Invalid API key",
      });
    });
  });

  describe("Warning extraction", () => {
    test("extracts warnings from session.status retry", () => {
      const stdout = JSON.stringify({
        type: "session.status",
        properties: {
          sessionID: "session-1",
          status: {
            type: "retry",
            attempt: 2,
            message: "Rate limit, retrying",
            next: Date.now() + 60000,
          },
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings?.[0]).toContain("Session retry");
      expect(result.warnings?.[0]).toContain("Rate limit, retrying");
    });

    test("extracts warnings from permission requests", () => {
      const stdout = JSON.stringify({
        type: "permission.updated",
        properties: {
          id: "perm-1",
          sessionID: "session-1",
          title: "Permission to execute command",
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings?.[0]).toContain("Permission required");
    });
  });

  describe("Multi-line JSONL parsing", () => {
    test("combines data from multiple JSON lines", () => {
      const stdout = [
        JSON.stringify({
          type: "session.created",
          properties: {
            info: { id: "session-1", title: "Test" },
          },
        }),
        JSON.stringify({
          type: "message.updated",
          properties: {
            info: {
              id: "msg-1",
              role: "assistant",
              tokens: { input: 1000, output: 500 },
              time: { created: 1000, completed: 2000 },
            },
          },
        }),
        JSON.stringify({
          type: "message.part.updated",
          properties: {
            part: {
              type: "tool",
              tool: "bash",
              state: { status: "completed", input: {} },
            },
          },
        }),
      ].join("\n");

      const result = client.parseRunOutput(stdout, "");

      expect(result.session_id).toBe("session-1");
      expect(result.metrics?.tokens_used).toBe(1500);
      expect(result.tool_calls).toHaveLength(1);
      expect(result.metrics?.duration_ms).toBe(1000);
    });

    test("handles empty lines gracefully", () => {
      const stdout = [
        "",
        JSON.stringify({
          type: "session.created",
          properties: { info: { id: "session-1" } },
        }),
        "",
        JSON.stringify({
          type: "message.updated",
          properties: { info: { id: "msg-1", role: "assistant" } },
        }),
        "",
      ].join("\n");

      const result = client.parseRunOutput(stdout, "");

      expect(result.session_id).toBe("session-1");
      expect(result.success).toBe(true);
    });
  });

  describe("Malformed JSON handling", () => {
    test("skips malformed JSON lines and continues", () => {
      const stdout = [
        "invalid json",
        JSON.stringify({
          type: "session.created",
          properties: { info: { id: "session-1" } },
        }),
        "{ also invalid }",
        JSON.stringify({
          type: "message.updated",
          properties: { info: { id: "msg-1", role: "assistant" } },
        }),
      ].join("\n");

      const result = client.parseRunOutput(stdout, "");

      expect(result.session_id).toBe("session-1");
      expect(result.success).toBe(true);
    });

    test("handles completely invalid input", () => {
      const stdout = "not json at all";

      const result = client.parseRunOutput(stdout, "");

      expect(result.success).toBe(true);
      expect(result.session_id).toBeUndefined();
    });
  });

  describe("Graceful degradation", () => {
    test("handles missing optional fields", () => {
      const stdout = JSON.stringify({
        type: "session.created",
        properties: {
          info: {
            id: "session-1",
            time: { created: Date.now() },
          },
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.success).toBe(true);
      expect(result.session_id).toBe("session-1");
      expect(result.artifacts).toEqual([]);
      expect(result.tool_calls).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.metrics?.duration_ms).toBeUndefined();
    });

    test("handles partially complete data", () => {
      const stdout = JSON.stringify({
        type: "message.updated",
        properties: {
          info: {
            id: "msg-1",
            role: "assistant",
            time: { created: 1000 },
          },
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.metrics?.start_time_ms).toBe(1000);
      expect(result.metrics?.end_time_ms).toBeUndefined();
      expect(result.metrics?.duration_ms).toBeUndefined();
    });
  });

  describe("Command execution parsing", () => {
    test("extracts command.executed events as tool calls", () => {
      const stdout = JSON.stringify({
        type: "command.executed",
        properties: {
          command: "npm test",
          exitCode: 0,
          stdout: "PASS\nTests: 1\n",
          stderr: "",
          time: { start: 1000, end: 5000 },
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls?.[0]).toEqual({
        name: "bash",
        inputs: { command: "npm test" },
        outputs: "PASS\nTests: 1\n",
        duration_ms: 4000,
        status: "completed",
      });
    });

    test("handles failed command execution", () => {
      const stdout = JSON.stringify({
        type: "command.executed",
        properties: {
          command: "npm fail",
          exitCode: 1,
          stdout: "",
          stderr: "Error\n",
          time: { start: 1000, end: 2000 },
        },
      });

      const result = client.parseRunOutput(stdout, "");

      expect(result.tool_calls?.[0].status).toBe("error");
    });
  });

  describe("Combined scenarios", () => {
    test("handles complete agent execution output", () => {
      const stdout = [
        JSON.stringify({
          type: "session.created",
          properties: {
            info: { id: "session-full", title: "Complete run" },
          },
        }),
        JSON.stringify({
          type: "message.updated",
          properties: {
            info: {
              id: "msg-1",
              role: "assistant",
              providerID: "anthropic",
              modelID: "claude-sonnet",
              time: { created: 1000, completed: 5000 },
              tokens: { input: 2000, output: 1000 },
              cost: 0.02,
            },
          },
        }),
        JSON.stringify({
          type: "message.part.updated",
          properties: {
            part: {
              type: "tool",
              tool: "bash",
              state: {
                status: "completed",
                input: { command: "echo test" },
                output: "test\n",
                time: { start: 1500, end: 2500 },
              },
            },
          },
        }),
        JSON.stringify({
          type: "file.edited",
          properties: {
            diff: {
              file: "/path/to/file.ts",
              additions: 10,
              deletions: 5,
            },
          },
        }),
        JSON.stringify({
          type: "permission.updated",
          properties: { id: "perm-1", title: "File write permission" },
        }),
      ].join("\n");

      const result = client.parseRunOutput(stdout, "");

      expect(result.session_id).toBe("session-full");
      expect(result.metrics?.model_name).toBe("anthropic/claude-sonnet");
      expect(result.metrics?.tokens_used).toBe(3000);
      expect(result.metrics?.cost).toBe(0.02);
      expect(result.metrics?.duration_ms).toBe(4000);
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls?.[0].name).toBe("bash");
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts?.[0].path).toBe("/path/to/file.ts");
      expect(result.warnings).toHaveLength(1);
      expect(result.success).toBe(true);
    });

    test("handles failed execution with errors", () => {
      const stdout = [
        JSON.stringify({
          type: "session.created",
          properties: { info: { id: "session-failed" } },
        }),
        JSON.stringify({
          type: "message.updated",
          properties: {
            info: {
              id: "msg-1",
              role: "assistant",
              time: { created: 1000, completed: 2000 },
              error: {
                name: "ApiError",
                data: {
                  message: "Rate limit exceeded",
                  statusCode: 429,
                },
              },
            },
          },
        }),
      ].join("\n");

      const result = client.parseRunOutput(stdout, "");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Rate limit exceeded");
      expect(result.error_details?.type).toBe("ApiError");
      expect(result.metrics?.duration_ms).toBe(1000);
    });
  });
});

describe("Integration with Worker Engine", () => {
  test("RunOutcome integrates with worker engine seamlessly", () => {
    const client = new OpenCodeClient();
    const stdout = [
      JSON.stringify({
        type: "session.created",
        properties: { info: { id: "session-test", title: "Test" } },
      }),
      JSON.stringify({
        type: "message.updated",
        properties: {
          info: {
            id: "msg-1",
            role: "assistant",
            time: { created: 1000, completed: 5000 },
            tokens: { input: 1000, output: 500 },
          },
        },
      }),
    ].join("\n");

    const parsed = client.parseRunOutput(stdout, "");

    expect(parsed).toBeDefined();
    expect(parsed.session_id).toBe("session-test");
    expect(parsed.metrics?.tokens_used).toBe(1500);
    expect(parsed.tool_calls).toBeDefined();
    expect(parsed.artifacts).toBeDefined();
    expect(parsed.warnings).toBeDefined();
  });
});
