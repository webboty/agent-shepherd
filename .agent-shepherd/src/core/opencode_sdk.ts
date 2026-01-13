/**
 * OpenCode SDK Module
 * Dedicated SDK functions for session monitoring and execution
 *
 * This module provides a clean abstraction over OpenCode SDK for
 * monitoring session activity, detecting heartbeats, and executing agents.
 */

import { createOpencodeClient } from '@opencode-ai/sdk';

export interface ProgressCallback {
  (message: string): void;
}

export interface SessionConfig {
  directory?: string;
  title?: string;
  agent?: string;
  model?: string;
  message?: string;
  sessionId?: string;
}

export interface SessionActivity {
  sessionId: string;
  lastActivityTimestamp: number | null;
  messageCount: number;
  isActive: boolean;
}

export interface HeartbeatCheckResult {
  alive: boolean;
  lastActivity: number | null;
  lastActivityAge: number | null;
  stale: boolean;
}

export interface SessionStatus {
  exists: boolean;
  sessionId: string;
  title?: string;
  messageCount: number;
}

/**
 * OpenCode SDK Client for session monitoring
 */
export class OpenCodeSDKClient {
  private client: ReturnType<typeof createOpencodeClient>;
  private baseUrl: string;

  constructor(config?: { baseUrl?: string }) {
    this.baseUrl = config?.baseUrl || 'http://localhost:4321';
    this.client = createOpencodeClient({ baseUrl: this.baseUrl });
  }

  /**
   * Create a new OpenCode session
   *
   * @param title - Session title
   * @returns Session ID
   */
  async createSession(title: string): Promise<string> {
    try {
      const result = await this.client.session.create({
        body: {
          title,
        },
      });

      if (!result.data || !result.data.id) {
        throw new Error('Failed to create session: No session ID returned');
      }

      console.log(`Created session ${result.data.id} with title: ${title}`);
      return result.data.id;
    } catch (error) {
      console.error(`Failed to create session:`, error);
      throw error;
    }
  }

  /**
   * Execute an agent in a session
   *
   * @param sessionId - The session ID
   * @param config - Session configuration including agent and message
   * @returns Run result with success, output, error
   */
  async executeAgentInSession(
    sessionId: string,
    config: SessionConfig
  ): Promise<any> {
    try {
      const body: any = {
        agent: config.agent || 'default',
      };

      if (config.message) {
        body.messageID = config.message;
      }

      const promptResult = await this.client.session.prompt({
        path: { id: sessionId },
        body,
      });

      // The SDK prompt method returns immediately, we need to wait for completion
      // For now, return success - completion will be handled by waitForCompletion
      return {
        success: true,
        data: promptResult.data,
        sessionId,
      };
    } catch (error) {
      console.error(`Failed to execute agent in session ${sessionId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      };
    }
  }

  /**
   * Get messages from a session
   *
   * @param sessionId - The session ID
   * @returns Array of session messages
   */
  async getSessionMessages(sessionId: string): Promise<any[]> {
    try {
      const result = await this.client.session.messages({
        path: { id: sessionId },
      });

      if (!result.data) {
        return [];
      }

      return result.data as any[];
    } catch (error) {
      console.error(`Failed to get messages for session ${sessionId}:`, error);
      return [];
    }
  }

  /**
   * Get session status
   *
   * @param sessionId - The session ID
   * @returns Session status information
   */
  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    try {
      const result = await this.client.session.messages({
        path: { id: sessionId },
      });

      if (!result.data || result.data.length === 0) {
        return {
          exists: false,
          sessionId,
          messageCount: 0,
        };
      }

      const messages = result.data as any[];

      // Get session info from first message if available
      const firstMessage = messages[0];
      const title = firstMessage?.info?.sessionTitle;

      return {
        exists: true,
        sessionId,
        title,
        messageCount: messages.length,
      };
    } catch (error) {
      console.error(`Failed to get session status for ${sessionId}:`, error);
      return {
        exists: false,
        sessionId,
        messageCount: 0,
      };
    }
  }

  /**
   * Cleanup a session (SELECTIVE - only for explicitly marked test sessions)
   *
   * @param sessionId - The session ID
   * @param isTestSession - Whether this is a test session (only delete if true)
   * @returns Success status
   */
  async cleanupSession(sessionId: string, isTestSession: boolean = false): Promise<boolean> {
    try {
      // Only delete test sessions
      if (!isTestSession) {
        console.log(`Skipping cleanup for non-test session ${sessionId} (preserved for debugging)`);
        return true;
      }

      await this.client.session.delete({
        path: { id: sessionId },
      });

      console.log(`Deleted test session ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`Failed to cleanup session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Wait for session completion
   * Polls session messages until completion or timeout
   *
   * @param sessionId - The session ID
   * @param timeoutMs - Timeout in milliseconds (default: 10 minutes)
   * @param pollIntervalMs - Polling interval in milliseconds (default: 1 minute)
   * @param onProgress - Optional callback for progress updates
   * @returns Final run result
   */
  async waitForCompletion(
    sessionId: string,
    timeoutMs: number = 10 * 60 * 1000,
    pollIntervalMs: number = 60 * 1000,
    onProgress?: ProgressCallback
  ): Promise<any> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const messages = await this.getSessionMessages(sessionId);

        if (messages.length === 0) {
          // No messages yet, wait and retry
          if (onProgress) {
            onProgress(`Waiting for session to start...`);
          }
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
          continue;
        }

        // Check if there's a completed assistant message
        const lastMessage = messages[messages.length - 1];

        if (lastMessage?.info?.role === 'assistant' && lastMessage?.info?.time?.completed) {
          // Session is complete
          if (onProgress) {
            onProgress(`Session completed successfully`);
          }
          console.log(`Session ${sessionId} completed`);
          return {
            success: true,
            data: messages,
            sessionId,
          };
        }

        // Check for errors
        const errorMessages = messages.filter((msg: any) =>
          msg?.info?.error
        );

        if (errorMessages.length > 0) {
          const error = errorMessages[errorMessages.length - 1];
          if (onProgress) {
            onProgress(`Session error: ${error?.info?.error?.message || 'Unknown error'}`);
          }
          return {
            success: false,
            error: error?.info?.error?.message || 'Session encountered an error',
            sessionId,
          };
        }

        // Session still running, provide progress and wait
        const assistantMessages = messages.filter((msg: any) => msg?.info?.role === 'assistant');
        if (assistantMessages.length > 0) {
          const lastAssistant = assistantMessages[assistantMessages.length - 1];
          const textParts = lastAssistant?.parts?.filter((p: any) => p?.type === 'text');
          if (textParts && textParts.length > 0) {
            const textContent = textParts.map((p: any) => p?.text || '').join('\n');
            if (onProgress && textContent) {
              // Show truncated preview of last message
              const preview = textContent.substring(0, 100);
              onProgress(`Agent working... last message: "${preview}${textContent.length > 100 ? '...' : ''}"`);
            }
          } else {
            // Agent is working on tool calls
            const toolParts = lastAssistant?.parts?.filter((p: any) => p?.type === 'tool');
            if (toolParts && toolParts.length > 0) {
              const lastTool = toolParts[toolParts.length - 1];
              if (onProgress) {
                onProgress(`Agent working... last action: ${lastTool?.tool || 'unknown tool'}`);
              }
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      } catch (error) {
        console.error(`Error polling session ${sessionId}:`, error);
        if (onProgress) {
          onProgress(`Error checking session status: ${error instanceof Error ? error.message : String(error)}`);
        }
        // Continue polling on error
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    }

    // Timeout reached
    if (onProgress) {
      onProgress(`Session timeout: did not complete within ${timeoutMs}ms`);
    }
    return {
      success: false,
      error: `Session ${sessionId} did not complete within ${timeoutMs}ms`,
      sessionId,
    };
  }

  /**
   * Get last activity timestamp from a session
   * Returns timestamp of most recent message in session
   *
   * @param sessionId - The OpenCode session ID
   * @returns Last activity timestamp in milliseconds since epoch, or null if no messages
   */
  async getLastSessionActivity(sessionId: string): Promise<number | null> {
    try {
      const result = await this.client.session.messages({
        path: { id: sessionId },
      });

      if (!result.data) {
        return null;
      }

      const messages = result.data as Array<{
        info: {
          time?: {
            created?: number;
          };
        };
      }>;

      if (messages.length === 0) {
        return null;
      }

      // Find message with most recent timestamp
      let lastTimestamp: number | null = null;
      for (const msg of messages) {
        const timestamp = msg.info?.time?.created || 0;
        if (timestamp > 0) {
          if (lastTimestamp === null || timestamp > lastTimestamp) {
            lastTimestamp = timestamp;
          }
        }
      }

      return lastTimestamp;
    } catch (error) {
      // Log error but return null for graceful degradation
      console.error(`Failed to get session activity for ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Get detailed activity information for a session
   *
   * @param sessionId - The OpenCode session ID
   * @returns Session activity information
   */
  async getSessionActivity(sessionId: string): Promise<SessionActivity> {
    try {
      const lastTimestamp = await this.getLastSessionActivity(sessionId);
      const now = Date.now();

      // Session is considered active if there was activity within last 10 minutes
      const ACTIVITY_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

      return {
        sessionId,
        lastActivityTimestamp: lastTimestamp,
        messageCount: 0, // Not easily available without fetching all messages
        isActive: lastTimestamp !== null && (now - lastTimestamp) < ACTIVITY_THRESHOLD_MS,
      };
    } catch (error) {
      console.error(`Failed to get session activity for ${sessionId}:`, error);
      return {
        sessionId,
        lastActivityTimestamp: null,
        messageCount: 0,
        isActive: false,
      };
    }
  }

  /**
   * Check if a session heartbeat is active
   * A session is considered alive if it has recent activity
   *
   * @param sessionId - The OpenCode session ID
   * @param staleThreshold - Threshold in ms to consider a heartbeat stale (default: 5 minutes)
   * @returns Heartbeat check result
   */
  async checkSessionHeartbeat(
    sessionId: string,
    staleThreshold: number = 5 * 60 * 1000 // 5 minutes default
  ): Promise<HeartbeatCheckResult> {
    const lastActivity = await this.getLastSessionActivity(sessionId);
    const now = Date.now();

    if (lastActivity === null) {
      return {
        alive: false,
        lastActivity: null,
        lastActivityAge: null,
        stale: true,
      };
    }

    const age = now - lastActivity;
    const isStale = age > staleThreshold;

    return {
      alive: !isStale,
      lastActivity,
      lastActivityAge: age,
      stale: isStale,
    };
  }

  /**
   * Get client instance for direct access if needed
   */
  getClient() {
    return this.client;
  }

  /**
   * Get base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}

/**
 * Singleton instance for easy access
 */
let defaultSDKClient: OpenCodeSDKClient | null = null;

export function getSDKClient(config?: { baseUrl?: string }): OpenCodeSDKClient {
  if (!defaultSDKClient) {
    defaultSDKClient = new OpenCodeSDKClient(config);
  }
  return defaultSDKClient;
}

/**
 * Reset singleton instance (mainly for testing)
 */
export function resetSDKClient(): void {
  defaultSDKClient = null;
}
