/**
 * OpenCode SDK Module
 * Dedicated SDK functions for session monitoring and execution
 *
 * This module provides a clean abstraction over OpenCode SDK for
 * monitoring session activity, detecting heartbeats, and executing agents.
 */

import { createOpencodeClient } from '@opencode-ai/sdk';

export interface ProgressCallback {
  (_msg: string): void;
}

export interface SessionStatus {
  exists: boolean;
  sessionId: string;
  title?: string;
  messageCount: number;
}

// Enum values used in classifyError() and imported by opencode.ts via dynamic import
// ESLint doesn't detect usage across dynamic imports
export enum SDKErrorType {
  NETWORK_ERROR = "NETWORK_ERROR",
  AGENT_NOT_FOUND = "AGENT_NOT_FOUND",
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  SESSION_CREATION_FAILED = "SESSION_CREATION_FAILED",
  EXECUTION_TIMEOUT = "EXECUTION_TIMEOUT",
  INVALID_SESSION_ID = "INVALID_SESSION_ID",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
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

// Enum values used in classifyError() and imported by opencode.ts via dynamic import
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export enum SDKErrorType {
  NETWORK_ERROR = "NETWORK_ERROR",
  AGENT_NOT_FOUND = "AGENT_NOT_FOUND",
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  SESSION_CREATION_FAILED = "SESSION_CREATION_FAILED",
  EXECUTION_TIMEOUT = "EXECUTION_TIMEOUT",
  INVALID_SESSION_ID = "INVALID_SESSION_ID",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

// Class used in classifyError() and imported by opencode.ts via dynamic import
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class SDKError extends Error {
  public type: SDKErrorType;
  public originalError?: any;

  constructor(type: SDKErrorType, originalError?: any, message: string = '') {
    super(message);
    this.name = "SDKError";
    this.type = type;
    this.originalError = originalError;
  }
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
   * Classify SDK error into appropriate error type
   */
  private classifyError(error: any): SDKError {
    const errorMessage = error?.message || String(error);
    const statusCode = error?.response?.status || error?.status;

    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.code === 'ETIMEDOUT') {
      return new SDKError(
        SDKErrorType.NETWORK_ERROR,
        error,
        `Network error: Cannot connect to OpenCode at ${this.baseUrl}`
      );
    }

    if (errorMessage.includes('agent not found') || errorMessage.includes('unknown agent') || statusCode === 404) {
      return new SDKError(
        SDKErrorType.AGENT_NOT_FOUND,
        error,
        `Agent not found: ${errorMessage}`
      );
    }

    if (errorMessage.includes('session not found') || errorMessage.includes('invalid session')) {
      return new SDKError(
        SDKErrorType.SESSION_NOT_FOUND,
        error,
        `Session not found: ${errorMessage}`
      );
    }

    if (errorMessage.includes('Failed to create session')) {
      return new SDKError(
        SDKErrorType.SESSION_CREATION_FAILED,
        error,
        `Failed to create session: ${errorMessage}`
      );
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('did not complete')) {
      return new SDKError(
        SDKErrorType.EXECUTION_TIMEOUT,
        error,
        `Execution timeout: ${errorMessage}`
      );
    }

    return new SDKError(
      SDKErrorType.UNKNOWN_ERROR,
      error,
      `SDK error: ${errorMessage}`
    );
  }

  /**
   * Log SDK error with details for debugging
   */
  private logError(context: string, error: SDKError | Error | any): void {
    if (error instanceof SDKError) {
      console.error(`[SDK Error] ${context}:`);
      console.error(`  Type: ${error.type}`);
      console.error(`  Message: ${error.message}`);
      if (error.originalError) {
        console.error(`  Original:`, error.originalError);
      }
    } else {
      console.error(`[SDK Error] ${context}:`, error);
    }
  }

  /**
   * Create a new OpenCode session
   *
   * @param title - Session title
   * @returns Session ID
   * @throws SDKError if session creation fails
   */
  async createSession(title: string): Promise<string> {
    try {
      const result = await this.client.session.create({
        body: {
          title,
        },
      });

      if (!result.data || !result.data.id) {
        throw new SDKError(
          SDKErrorType.SESSION_CREATION_FAILED,
          'Failed to create session: No session ID returned'
        );
      }

      console.log(`Created session ${result.data.id} with title: ${title}`);
      return result.data.id;
    } catch (error) {
      const classifiedError = this.classifyError(error);
      this.logError('createSession', classifiedError);
      throw classifiedError;
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
        parts: []
      };

      if (config.message) {
        body.parts.push({
          type: "text",
          text: config.message
        });
      }

      console.log(`Sending prompt to session ${sessionId} with ${body.parts.length} part(s)...`);

      // Add retry logic for prompt sending
      const maxRetries = 3;
      let promptResult;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          promptResult = await this.client.session.prompt({
            path: { id: sessionId },
            body,
          });
          
          if (!promptResult.error) {
            break; // Success
          }
          
          console.warn(`Prompt attempt ${attempt}/${maxRetries} failed:`, promptResult.error);
        } catch (error) {
          console.warn(`Prompt attempt ${attempt}/${maxRetries} threw exception:`, error);
          if (attempt === maxRetries) throw error;
        }
        
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }

      if (promptResult?.error) {
        console.error(`Prompt failed with error after retries:`, promptResult.error);
        throw new Error(`Prompt failed: ${JSON.stringify(promptResult.error)}`);
      }

      // The SDK prompt method returns immediately, we need to wait for completion
      // For now, return success - completion will be handled by waitForCompletion
      return {
        success: true,
        data: promptResult?.data,
        sessionId,
      };
    } catch (error) {
      const classifiedError = this.classifyError(error);
      this.logError(`executeAgentInSession(sessionId: ${sessionId}, agent: ${config.agent})`, classifiedError);

      // Return error result instead of throwing for compatibility
      return {
        success: false,
        error: classifiedError.message,
        errorType: classifiedError.type,
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
   * @param onError - Whether this cleanup is triggered by an error (affects logging)
   * @returns Success status
   */
  async cleanupSession(sessionId: string, isTestSession: boolean = false, onError: boolean = false): Promise<boolean> {
    try {
      // Only delete test sessions
      if (!isTestSession) {
        console.log(`Skipping cleanup for non-test session ${sessionId} (preserved for debugging)`);
        return true;
      }

      await this.client.session.delete({
        path: { id: sessionId },
      });

      const prefix = onError ? `[Error Cleanup] ` : '';
      console.log(`${prefix}Deleted test session ${sessionId}`);
      return true;
    } catch (error) {
      const classifiedError = this.classifyError(error);
      this.logError(`cleanupSession(sessionId: ${sessionId}, isTestSession: ${isTestSession})`, classifiedError);

      // Don't fail the whole operation if cleanup fails, but log it
      console.error(`Failed to cleanup session ${sessionId}: ${classifiedError.message}`);
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
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const messages = await this.getSessionMessages(sessionId);

        // Reset error counter on successful poll
        consecutiveErrors = 0;

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

        // NEW: Check for raw tool output leak (the "Weird Output" bug)
        // If the content contains raw protocol markers like <|channel|>, it means the model is hallucinating
        // or the parser failed. We should treat this as a potential error or try to recover.
        const content = lastMessage?.content || "";
        if (content.includes("<|channel|>") || content.includes("<|message|>")) {
             console.warn(`[Warning] Raw protocol detected in output: ${content.substring(0, 100)}...`);
             // We don't fail immediately, but we log it. 
             // If the session is STUCK on this message for too long without completion, the timeout will catch it.
             // However, if the server considers this a "completed" message (because it stopped generating),
             // but it didn't execute the tool, the loop might be restarting because the worker sees "success" but no artifacts.
        }

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
          const errorMessage = error?.info?.error?.message || 'Unknown error';

          // Log session error for debugging
          console.error(`Session ${sessionId} encountered error:`, errorMessage);
          this.logError(`waitForCompletion(sessionId: ${sessionId})`, new SDKError(
            SDKErrorType.UNKNOWN_ERROR,
            null,
            errorMessage
          ));

          if (onProgress) {
            onProgress(`Session error: ${errorMessage}`);
          }
          return {
            success: false,
            error: errorMessage,
            errorType: SDKErrorType.UNKNOWN_ERROR,
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
        const classifiedError = this.classifyError(error);
        consecutiveErrors++;

        this.logError(`waitForCompletion(sessionId: ${sessionId}) - Poll error ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}`, classifiedError);

        if (onProgress) {
          onProgress(`Error checking session status: ${classifiedError.message}`);
        }

        // If too many consecutive errors, give up
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          const timeoutError = new SDKError(
            SDKErrorType.EXECUTION_TIMEOUT,
            `Failed to poll session ${sessionId} after ${MAX_CONSECUTIVE_ERRORS} consecutive errors: ${classifiedError.message}`,
            error
          );
          this.logError(`waitForCompletion - Giving up after ${MAX_CONSECUTIVE_ERRORS} errors`, timeoutError);
          return {
            success: false,
            error: timeoutError.message,
            errorType: timeoutError.type,
            sessionId,
          };
        }

        // Continue polling on error
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    }

    // Timeout reached
    const timeoutMessage = `Session ${sessionId} did not complete within ${timeoutMs}ms`;
    const timeoutError = new SDKError(
      SDKErrorType.EXECUTION_TIMEOUT,
      null,
      timeoutMessage
    );

    this.logError(`waitForCompletion - Timeout after ${timeoutMs}ms`, timeoutError);

    if (onProgress) {
      onProgress(`Session timeout: did not complete within ${timeoutMs}ms`);
    }
    return {
      success: false,
      error: timeoutError.message,
      errorType: timeoutError.type,
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
   * Abort an ongoing session
   * 
   * @param sessionId - The session ID to abort
   * @returns Success status
   */
  async abortSession(sessionId: string): Promise<boolean> {
    try {
      await this.client.session.abort({
        path: { id: sessionId }
      });
      console.log(`Aborted session ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`Failed to abort session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * List active sessions
   * 
   * @param activeOnly - If true, filter for only active/running sessions
   * @returns Array of session objects
   */
  async listSessions(activeOnly: boolean = false): Promise<any[]> {
    try {
      // Get all sessions first
      const result = await this.client.session.list({});
      if (!result.data) {
        return [];
      }
      
      let sessions = result.data;
      
      // Filter by active status if requested
      if (activeOnly) {
        try {
          // Get status for all sessions to determine which are truly active
          const statusResult = await this.client.session.status({});
          if (statusResult.data) {
            const statusMap = statusResult.data as Record<string, any>;
            
            sessions = sessions.filter((session: any) => {
              const status = statusMap[session.id];
              // Consider active if status is busy or retry
              return status && (status.type === 'busy' || status.type === 'retry');
            });
          } else {
            // Fallback to timestamp check if status API not available or empty
          const now = Date.now();
          const ACTIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
          sessions = sessions.filter((session: any) => {
            // Check updated first, then created, default to 0
            const timestamp = session.time?.updated || session.time?.created || 0;
            return (now - timestamp) < ACTIVE_THRESHOLD;
          });
        }
      } catch (error) {
        console.warn(`Failed to fetch session statuses, falling back to timestamp check: ${error}`);
        // Fallback logic
        const now = Date.now();
        const ACTIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
        sessions = sessions.filter((session: any) => {
          const timestamp = session.time?.updated || session.time?.created || 0;
          return (now - timestamp) < ACTIVE_THRESHOLD;
        });
      }
    }
      
      return sessions;
    } catch (error) {
      console.error(`Failed to list sessions:`, error);
      return [];
    }
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
