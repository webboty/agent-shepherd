/**
 * OpenCode Integration
 * Handles session management and message operations using @opencode-ai/sdk
 */

import { createOpencodeClient } from "@opencode-ai/sdk/client";
import type {
  Session,
  Message,
  AssistantMessage,
} from "@opencode-ai/sdk/client";

export interface SessionConfig {
  directory?: string;
  title?: string;
  parentID?: string;
}

export interface MessageConfig {
  content: string;
  agent?: string;
  providerID?: string;
  modelID?: string;
  system?: string;
}

/**
 * OpenCode client wrapper for session and message operations
 */
export class OpenCodeClient {
  private client: ReturnType<typeof createOpencodeClient>;

  constructor(config?: { directory?: string }) {
    this.client = createOpencodeClient(config);
  }

  /**
   * Create a new OpenCode session
   */
  async createSession(config: SessionConfig): Promise<Session> {
    const response = await this.client.session.create({
      body: {
        title: config.title || "Agent Shepherd Run",
        parentID: config.parentID,
      },
      query: {
        directory: config.directory || process.cwd(),
      },
    });

    if (!response.data) {
      throw new Error("Failed to create session");
    }

    return response.data;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionID: string): Promise<Session | null> {
    const response = await this.client.session.get({
      path: { id: sessionID },
    });

    return response.data || null;
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<Session[]> {
    const response = await this.client.session.list();
    return response.data || [];
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionID: string): Promise<void> {
    await this.client.session.delete({
      path: { id: sessionID },
    });
  }

  /**
   * Send a message to a session
   */
  async sendMessage(
    sessionID: string,
    config: MessageConfig
  ): Promise<AssistantMessage> {
    const response = await this.client.session.prompt({
      path: { id: sessionID },
      body: {
        parts: [
          {
            type: "text",
            text: config.content,
          },
        ],
        agent: config.agent,
        model:
          config.providerID && config.modelID
            ? {
                providerID: config.providerID,
                modelID: config.modelID,
              }
            : undefined,
        system: config.system,
      },
    });

    if (!response.data) {
      throw new Error("Failed to send message");
    }

    return response.data.info;
  }

  /**
   * Get messages from a session
   */
  async getMessages(sessionID: string): Promise<Message[]> {
    const response = await this.client.session.messages({
      path: { id: sessionID },
    });

    if (!response.data) {
      return [];
    }

    return response.data.map((msg) => msg.info);
  }

  /**
   * Get a specific message
   */
  async getMessage(
    sessionID: string,
    messageID: string
  ): Promise<Message | null> {
    const response = await this.client.session.message({
      path: {
        id: sessionID,
        messageID: messageID,
      },
    });

    if (!response.data) {
      return null;
    }

    return response.data.info;
  }

  /**
   * Check if a message is from a human (user role)
   */
  isHumanMessage(message: Message): boolean {
    return message.role === "user";
  }

  /**
   * Check if a message is from an assistant
   */
  isAssistantMessage(message: Message): boolean {
    return message.role === "assistant";
  }

  /**
   * Check if an assistant message has completed
   */
  isMessageCompleted(message: Message): boolean {
    if (message.role !== "assistant") {
      return true; // User messages are always "completed"
    }

    const assistantMsg = message as AssistantMessage;
    return assistantMsg.time.completed !== undefined;
  }

  /**
   * Check if an assistant message has an error
   */
  hasMessageError(message: Message): boolean {
    if (message.role !== "assistant") {
      return false;
    }

    const assistantMsg = message as AssistantMessage;
    return assistantMsg.error !== undefined;
  }

  /**
   * Get latest messages since a timestamp
   */
  async getMessagesSince(
    sessionID: string,
    sinceTimestamp: number
  ): Promise<Message[]> {
    const allMessages = await this.getMessages(sessionID);
    return allMessages.filter((msg) => msg.time.created > sinceTimestamp);
  }

  /**
   * Wait for assistant message to complete
   */
  async waitForCompletion(
    sessionID: string,
    messageID: string,
    options: {
      pollInterval?: number;
      timeout?: number;
    } = {}
  ): Promise<Message> {
    const pollInterval = options.pollInterval || 1000;
    const timeout = options.timeout || 300000; // 5 minutes default

    const startTime = Date.now();

    while (true) {
      const message = await this.getMessage(sessionID, messageID);

      if (!message) {
        throw new Error(`Message ${messageID} not found`);
      }

      if (this.isMessageCompleted(message)) {
        return message;
      }

      if (this.hasMessageError(message)) {
        const assistantMsg = message as AssistantMessage;
        throw new Error(
          `Message failed: ${assistantMsg.error?.data?.message || "Unknown error"}`
        );
      }

      if (Date.now() - startTime > timeout) {
        throw new Error(`Message timeout after ${timeout}ms`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  /**
   * Abort a running session
   */
  async abortSession(sessionID: string): Promise<void> {
    await this.client.session.abort({
      path: { id: sessionID },
    });
  }

  /**
   * Get global session status
   */
  async getSessionStatus(): Promise<any> {
    const response = await this.client.session.status();

    return response.data;
  }
}

/**
 * Create a singleton OpenCode client instance
 */
let defaultClient: OpenCodeClient | null = null;

export function getOpenCodeClient(config?: {
  directory?: string;
}): OpenCodeClient {
  if (!defaultClient) {
    defaultClient = new OpenCodeClient(config);
  }
  return defaultClient;
}
