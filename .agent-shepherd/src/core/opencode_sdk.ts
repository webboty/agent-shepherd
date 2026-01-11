/**
 * OpenCode SDK Module
 * Dedicated SDK functions for session monitoring
 * 
 * This module provides a clean abstraction over the OpenCode SDK for
 * monitoring session activity and detecting heartbeats.
 */

import { createOpencodeClient } from '@opencode-ai/sdk';

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
   * Get last activity timestamp from a session
   * Returns the timestamp of the most recent message in the session
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

      // Find the message with the most recent timestamp
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

      // Session is considered active if there was activity within the last 10 minutes
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
   * Get the base URL
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
