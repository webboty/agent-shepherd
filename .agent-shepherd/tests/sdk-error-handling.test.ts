/**
 * SDK Error Handling Tests
 * Tests for SDK error classification and handling
 */

import { describe, test, expect } from "bun:test";
import { OpenCodeSDKClient, SDKError, SDKErrorType } from "../src/core/opencode_sdk";

describe("SDK Error Handling", () => {
  describe("classifyError", () => {
    test("classifies ECONNREFUSED as NETWORK_ERROR", () => {
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      // Simulate network error by accessing private method
      const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
      const classified = (client as any).classifyError(error);

      expect(classified).toBeInstanceOf(SDKError);
      expect(classified.type).toBe(SDKErrorType.NETWORK_ERROR);
      expect(classified.message).toContain('Network error');
    });

    test("classifies ENOTFOUND as NETWORK_ERROR", () => {
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      const error = { code: 'ENOTFOUND', message: 'Host not found' };
      const classified = (client as any).classifyError(error);

      expect(classified).toBeInstanceOf(SDKError);
      expect(classified.type).toBe(SDKErrorType.NETWORK_ERROR);
    });

    test("classifies 'agent not found' error", () => {
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      const error = { message: 'agent not found: my-agent' };
      const classified = (client as any).classifyError(error);

      expect(classified).toBeInstanceOf(SDKError);
      expect(classified.type).toBe(SDKErrorType.AGENT_NOT_FOUND);
      expect(classified.message).toContain('Agent not found');
    });

    test("classifies 'session not found' error", () => {
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      const error = { message: 'session not found: abc123' };
      const classified = (client as any).classifyError(error);

      expect(classified).toBeInstanceOf(SDKError);
      expect(classified.type).toBe(SDKErrorType.SESSION_NOT_FOUND);
      expect(classified.message).toContain('Session not found');
    });

    test("classifies timeout errors", () => {
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      const error = { message: 'timeout after 60000ms' };
      const classified = (client as any).classifyError(error);

      expect(classified).toBeInstanceOf(SDKError);
      expect(classified.type).toBe(SDKErrorType.EXECUTION_TIMEOUT);
      expect(classified.message).toContain('timeout');
    });

    test("classifies unknown errors as UNKNOWN_ERROR", () => {
      const client = new OpenCodeSDKClient({ baseUrl: "http://localhost:4321" });

      const error = { message: 'some unexpected error' };
      const classified = (client as any).classifyError(error);

      expect(classified).toBeInstanceOf(SDKError);
      expect(classified.type).toBe(SDKErrorType.UNKNOWN_ERROR);
    });
  });

  describe("SDKError class", () => {
    test("creates error with type and message", () => {
      const error = new SDKError(SDKErrorType.AGENT_NOT_FOUND, null, 'Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('SDKError');
      expect(error.type).toBe(SDKErrorType.AGENT_NOT_FOUND);
      expect(error.message).toBe('Test error');
      expect(error.originalError).toBeNull();
    });

    test("creates error with original error", () => {
      const original = new Error('Original error');
      const error = new SDKError(SDKErrorType.NETWORK_ERROR, original, 'Network issue');

      expect(error.originalError).toBe(original);
      expect(error.message).toBe('Network issue');
    });

    test("creates error with default empty message", () => {
      const error = new SDKError(SDKErrorType.UNKNOWN_ERROR);

      expect(error.message).toBe('');
      expect(error.type).toBe(SDKErrorType.UNKNOWN_ERROR);
    });
  });
});
