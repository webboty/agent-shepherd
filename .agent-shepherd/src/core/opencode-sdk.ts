/**
 * OpenCode SDK Integration
 * Provides programmatic access to OpenCode sessions with clean separation from CLI
 */

import {
  createOpencodeClient,
  type OpencodeClient,
  type Part,
  type Message,
  type TextPart,
  type TextPartInput,
} from "@opencode-ai/sdk";

export interface SessionConfig {
  directory?: string;
  title?: string;
  agent?: string;
  model?: string;
  message?: string;
  sessionId?: string;
}

export interface RunResult {
  success: boolean;
  output: string;
  error?: string;
  sessionId?: string;
}

export interface SessionStatus {
  exists: boolean;
  active?: boolean;
  messageCount?: number;
}

export interface SessionInfo {
  sessionId: string;
  title: string;
  phase: string;
  tokens: number;
  created: number;
}

export interface OpenCodeSDKConfig {
  baseUrl?: string;
  directory?: string;
  timeoutMs?: number;
}

type MessageWithParts = {
  info: Message;
  parts: Part[];
};

export class OpenCodeSDKClient {
  private client: OpencodeClient;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config?: OpenCodeSDKConfig) {
    this.baseUrl = config?.baseUrl || "http://localhost:4096";
    this.timeoutMs = config?.timeoutMs || 300000;

    this.client = createOpencodeClient({
      baseUrl: this.baseUrl,
      directory: config?.directory,
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.session.list();
      return true;
    } catch (error) {
      console.error("OpenCode SDK connection test failed:", error);
      return false;
    }
  }

  async createSession(title?: string): Promise<string> {
    try {
      const result = await this.client.session.create({
        body: {
          title: title || "Agent Shepherd Session",
        },
      });

      if (!result.data) {
        throw new Error("No session data returned");
      }

      return result.data.id;
    } catch (error) {
      throw new Error(
        `Failed to create OpenCode session: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async executeAgent(config: SessionConfig): Promise<RunResult> {
    let sessionId: string;

    try {
      if (config.sessionId) {
        sessionId = config.sessionId;
      } else {
        sessionId = await this.createSession(config.title);
      }

      const promptOptions: {
        path: { id: string };
        body: {
          parts: Array<TextPartInput>;
          agent?: string;
        };
      } = {
        path: { id: sessionId },
        body: {
          parts: [
            {
              type: "text",
              text: config.message || "Execute task",
            },
          ],
        },
      };

      if (config.agent) {
        promptOptions.body.agent = config.agent;
      }

      const result = await Promise.race([
        this.client.session.prompt(promptOptions),
        this.timeout(this.timeoutMs),
      ]);

      if (!result || !result.data) {
        return {
          success: false,
          output: "",
          error: `Agent execution timed out after ${this.timeoutMs}ms`,
          sessionId,
        };
      }

      let output = "";
      if (result.data.parts) {
        output = this.extractTextFromParts(result.data.parts);
      }

      return {
        success: true,
        output,
        sessionId,
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
        sessionId: config.sessionId,
      };
    }
  }

  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    try {
      const messages = await this.client.session.messages({
        path: { id: sessionId },
      });

      const messageData: MessageWithParts[] = messages.data || [];

      return {
        exists: true,
        active: messageData.some((msg) => msg.info.role === "user"),
        messageCount: messageData.length,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return {
          exists: false,
        };
      }
      throw error;
    }
  }

  async getSessionMessages(sessionId: string): Promise<MessageWithParts[]> {
    try {
      const result = await this.client.session.messages({
        path: { id: sessionId },
      });

      return result.data || [];
    } catch (error) {
      throw new Error(
        `Failed to get session messages: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async cleanupSession(sessionId: string, force: boolean = false): Promise<void> {
    if (!force) {
      console.warn(`Skipping cleanup for session ${sessionId} (not marked as test/temporary)`);
      return;
    }

    try {
      await this.client.session.delete({
        path: { id: sessionId },
      });
      console.log(`Deleted session ${sessionId}`);
    } catch (error) {
      console.error(
        `Failed to delete session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private timeout(ms: number): Promise<null> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(null), ms);
    });
  }

  private extractTextFromParts(parts: Part[]): string {
    return parts
      .filter((part): part is TextPart => part.type === "text")
      .map((part) => part.text)
      .join("\n");
  }

  async listSessionsForIssue(issueId: string): Promise<SessionInfo[]> {
    try {
      const sessions = await this.client.session.list();

      const sessionData = sessions.data || [];

      return sessionData
        .filter((session) => session.title && session.title.includes(issueId))
        .map((session) => ({
          sessionId: session.id,
          title: session.title || "",
          phase: "unknown",
          tokens: 0,
          created: session.time?.created || Date.now(),
        }));
    } catch (error) {
      console.error(`Failed to list sessions for issue ${issueId}:`, error);
      return [];
    }
  }
}

let defaultSDKClient: OpenCodeSDKClient | null = null;

export function getSDKClient(config?: OpenCodeSDKConfig): OpenCodeSDKClient {
  if (!defaultSDKClient) {
    defaultSDKClient = new OpenCodeSDKClient(config);
  }
  return defaultSDKClient;
}

export function resetSDKClient(): void {
  defaultSDKClient = null;
}
