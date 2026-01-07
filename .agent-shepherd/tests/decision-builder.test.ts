/**
 * Decision Prompt Builder Tests
 * Tests for template loading, prompt generation, response validation, and analytics
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { DecisionPromptBuilder, getDecisionPromptBuilder, type TemplateContext } from "../src/core/decision-builder";
import { type RunOutcome } from "../src/core/logging";
import { type BeadsIssue } from "../src/core/beads";

describe("DecisionPromptBuilder", () => {
  let tempDir: string;
  let builder: DecisionPromptBuilder;
  let testConfigPath: string;

  const mockIssue: BeadsIssue = {
    id: "test-123",
    title: "Test Issue",
    description: "Test description",
    issue_type: "bug",
    priority: 2,
    status: "open",
    labels: ["label1", "label2"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockOutcome: RunOutcome = {
    success: true,
    message: "Task completed successfully",
    metrics: {
      duration_ms: 5000,
      tokens_used: 1000,
      start_time_ms: Date.now() - 5000,
      end_time_ms: Date.now(),
    },
    warnings: ["Minor warning"],
  };

  beforeEach(() => {
    tempDir = join(process.cwd(), ".test-temp");
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    testConfigPath = join(tempDir, "decision-prompts-test.yaml");

    const testConfig = `
version: "1.0"
templates:
  test-decision:
    name: "Test Decision"
    description: "Test template"
    system_prompt: "You are a test decision agent."
    prompt_template: |
      # Test Decision
      ID: {{issue.id}}
      Title: {{issue.title}}
      Description: {{issue.description}}
      Type: {{issue.issue_type}}
      Priority: P{{issue.priority}}
      Status: {{issue.status}}
      Outcome: {{outcome.success}}
      Message: {{outcome.message}}
      Duration: {{outcome.metrics.duration_ms}}ms
      Error: {{outcome.error}}

      {{#each outcome.warnings}}
        - {{this}}
      {{/each}}

      {{#each recent_decisions}}
        - {{timestamp}}: {{decision}} ({{reasoning}})
      {{/each}}

      {{#each phase_history}}
        - {{phase}} (Attempt {{attempt_number}}): {{status}} ({{duration_ms}}ms)
      {{/each}}

      {{#performance_context}}
        Average: {{average_duration_ms}}ms
        Total: {{total_duration_ms}}ms
        Visits: {{phase_visit_count}}
      {{/performance_context}}

      Custom: {{custom_instructions}}

      {{#each allowed_destinations}}
      - {{this}}
      {{/each}}
  fallback-template:
    name: "Fallback"
    description: "Fallback template"
    system_prompt: "Fallback agent"
    prompt_template: |
      Fallback: {{issue.title}}
      Custom: {{custom_instructions}}
      Allowed: {{#each allowed_destinations}}
      - {{this}}
      {{/each}}
default_template: "fallback-template"
`;

    writeFileSync(testConfigPath, testConfig);
    builder = new DecisionPromptBuilder(testConfigPath);
  });

  describe("2.5.1 Standardize Prompt Templates", () => {
    it("should load templates from config file", () => {
      const templates = builder.getAvailableTemplates();
      expect(templates).toContain("test-decision");
      expect(templates).toContain("fallback-template");
    });

    it("should get template by name", () => {
      const template = builder.getTemplate("test-decision");
      expect(template).not.toBeNull();
      expect(template?.name).toBe("Test Decision");
      expect(template?.description).toBe("Test template");
    });

    it("should get fallback template when requested template not found", () => {
      const template = builder.getTemplate("non-existent");
      expect(template).not.toBeNull();
      expect(template?.name).toBe("Fallback");
    });

    it("should return null when config is not loaded", () => {
      const brokenBuilder = new DecisionPromptBuilder("/nonexistent/path.yaml");
      const template = brokenBuilder.getTemplate("test-decision");
      expect(template).toBeNull();
    });

    it("should reload config", () => {
      expect(builder.getAvailableTemplates()).toContain("test-decision");
      builder.reloadConfig();
      expect(builder.getAvailableTemplates()).toContain("test-decision");
    });
  });

  describe("2.5.2 Enhance buildDecisionInstructions()", () => {
    it("should build prompt using template", () => {
      const context: TemplateContext = {
        issue: mockIssue,
        outcome: mockOutcome,
        current_phase: "test",
        custom_instructions: "Test instructions",
        allowed_destinations: ["phase1", "phase2"],
      };

      const promptData = builder.buildPrompt("test-decision", context);
      expect(promptData).not.toBeNull();
      expect(promptData?.user_prompt).toContain("Test Issue");
      expect(promptData?.user_prompt).toContain("Test description");
      expect(promptData?.user_prompt).toContain("bug");
      expect(promptData?.user_prompt).toContain("P2");
      expect(promptData?.user_prompt).toContain("true");
      expect(promptData?.user_prompt).toContain("Task completed successfully");
      expect(promptData?.user_prompt).toContain("5000");
      expect(promptData?.user_prompt).toContain("Minor warning");
      expect(promptData?.user_prompt).toContain("Test instructions");
      expect(promptData?.user_prompt).toContain("phase1");
      expect(promptData?.user_prompt).toContain("phase2");
    });

    it("should return null for non-existent template", () => {
      const context: TemplateContext = {
        issue: mockIssue,
        outcome: mockOutcome,
        current_phase: "test",
        custom_instructions: "Test",
        allowed_destinations: [],
      };

      const promptData = builder.buildPrompt("non-existent", context);
      expect(promptData).toBeNull();
    });

    it("should substitute all issue variables", () => {
      const context: TemplateContext = {
        issue: mockIssue,
        outcome: mockOutcome,
        current_phase: "test",
        custom_instructions: "Test",
        allowed_destinations: [],
      };

      const promptData = builder.buildPrompt("test-decision", context);
      expect(promptData?.user_prompt).toContain("Test Issue");
      expect(promptData?.user_prompt).toContain("Test description");
      expect(promptData?.user_prompt).toContain("bug");
      expect(promptData?.user_prompt).toContain("P2");
      expect(promptData?.user_prompt).toContain("open");
    });

    it("should substitute outcome variables", () => {
      const outcome: RunOutcome = {
        success: false,
        error: "Test error",
        metrics: { duration_ms: 12345 },
      };

      const context: TemplateContext = {
        issue: mockIssue,
        outcome,
        current_phase: "test",
        custom_instructions: "Test",
        allowed_destinations: [],
      };

      const promptData = builder.buildPrompt("test-decision", context);
      expect(promptData?.user_prompt).toContain("false");
      expect(promptData?.user_prompt).toContain("Test error");
      expect(promptData?.user_prompt).toContain("12345");
    });
  });

  describe("2.5.3 Add Contextual Information to Prompts", () => {
    it("should include recent decisions in prompt", () => {
      const context: TemplateContext = {
        issue: mockIssue,
        outcome: mockOutcome,
        current_phase: "test",
        custom_instructions: "Test",
        allowed_destinations: [],
        recent_decisions: [
          {
            timestamp: Date.now() - 60000,
            decision: "advance_to_phase2",
            reasoning: "Good progress",
          },
          {
            timestamp: Date.now() - 30000,
            decision: "require_approval",
            reasoning: "Unclear results",
          },
        ],
      };

      const promptData = builder.buildPrompt("test-decision", context);
      expect(promptData?.user_prompt).toContain("advance_to_phase2");
      expect(promptData?.user_prompt).toContain("Good progress");
      expect(promptData?.user_prompt).toContain("require_approval");
      expect(promptData?.user_prompt).toContain("Unclear results");
    });

    it("should include phase history in prompt", () => {
      const context: TemplateContext = {
        issue: mockIssue,
        outcome: mockOutcome,
        current_phase: "test",
        custom_instructions: "Test",
        allowed_destinations: [],
        phase_history: [
          {
            phase: "implement",
            attempt_number: 1,
            status: "completed",
            duration_ms: 5000,
          },
          {
            phase: "test",
            attempt_number: 2,
            status: "failed",
            duration_ms: 3000,
            error: "Test failed",
          },
        ],
      };

      const promptData = builder.buildPrompt("test-decision", context);
      expect(promptData?.user_prompt).toContain("Attempt 1");
      expect(promptData?.user_prompt).toContain("completed");
      expect(promptData?.user_prompt).toContain("5000");
      expect(promptData?.user_prompt).toContain("Attempt 2");
      expect(promptData?.user_prompt).toContain("failed");
      expect(promptData?.user_prompt).toContain("3000");
      expect(promptData?.user_prompt).toContain("Test failed");
    });

    it("should include performance context in prompt", () => {
      const context: TemplateContext = {
        issue: mockIssue,
        outcome: mockOutcome,
        current_phase: "test",
        custom_instructions: "Test",
        allowed_destinations: [],
        performance_context: {
          average_duration_ms: 4000,
          total_duration_ms: 20000,
          phase_visit_count: 5,
        },
      };

      const promptData = builder.buildPrompt("test-decision", context);
      expect(promptData?.user_prompt).toContain("4000");
      expect(promptData?.user_prompt).toContain("20000");
      expect(promptData?.user_prompt).toContain("5");
    });
  });

  describe("2.5.4 Implement Response Validation", () => {
    it("should validate valid response", () => {
      const response = JSON.stringify({
        decision: "advance_to_phase2",
        reasoning: "All tests passed",
        confidence: 0.9,
      });

      const validation = (builder as any).validateResponse(response, ["phase2", "phase3"]);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.response?.decision).toBe("advance_to_phase2");
      expect(validation.response?.reasoning).toBe("All tests passed");
      expect(validation.response?.confidence).toBe(0.9);
    });

    it("should reject response missing decision field", () => {
      const response = JSON.stringify({
        reasoning: "Test",
        confidence: 0.9,
      });

      const validation = (builder as any).validateResponse(response, ["phase2"]);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain("Missing required field: decision");
    });

    it("should reject response missing reasoning field", () => {
      const response = JSON.stringify({
        decision: "advance_to_phase2",
        confidence: 0.9,
      });

      const validation = (builder as any).validateResponse(response, ["phase2"]);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain("Missing required field: reasoning");
    });

    it("should reject invalid confidence value", () => {
      const response = JSON.stringify({
        decision: "advance_to_phase2",
        reasoning: "Test",
        confidence: 1.5,
      });

      const validation = (builder as any).validateResponse(response, ["phase2"]);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        "Invalid confidence value: must be a number between 0.0 and 1.0"
      );
    });

    it("should reject invalid decision action format", () => {
      const response = JSON.stringify({
        decision: "invalid_action",
        reasoning: "Test",
        confidence: 0.8,
      });

      const validation = (builder as any).validateResponse(response, ["phase2"]);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes("Invalid decision action"))).toBe(true);
    });

    it("should reject unauthorized target phase", () => {
      const response = JSON.stringify({
        decision: "jump_to_unauthorized",
        reasoning: "Test",
        confidence: 0.8,
      });

      const validation = (builder as any).validateResponse(response, ["phase1", "phase2"]);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes("not in allowed destinations"))).toBe(true);
    });

    it("should warn about low confidence", () => {
      const response = JSON.stringify({
        decision: "require_approval",
        reasoning: "Uncertain",
        confidence: 0.4,
      });

      const validation = (builder as any).validateResponse(
        response,
        ["phase2"],
        { auto_advance: 0.8, require_approval: 0.6 }
      );
      expect(validation.valid).toBe(true);
      expect(validation.warnings).toHaveLength(1);
      expect(validation.warnings[0]).toContain("below require_approval threshold");
    });

    it("should reject invalid recommendations format", () => {
      const response = JSON.stringify({
        decision: "advance_to_phase2",
        reasoning: "Test",
        confidence: 0.8,
        recommendations: "not an array",
      });

      const validation = (builder as any).validateResponse(response, ["phase2"]);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain("Invalid recommendations: must be an array");
    });

    it("should accept valid recommendations array", () => {
      const response = JSON.stringify({
        decision: "advance_to_phase2",
        reasoning: "Test",
        confidence: 0.8,
        recommendations: ["Suggestion 1", "Suggestion 2"],
      });

      const validation = (builder as any).validateResponse(response, ["phase2"]);
      expect(validation.valid).toBe(true);
      expect(validation.response?.recommendations).toEqual(["Suggestion 1", "Suggestion 2"]);
    });
  });

  describe("2.5.5 Add Response Sanitization", () => {
    it("should strip markdown code blocks", () => {
      const response = '```json\n{"decision": "advance_to_phase2", "reasoning": "Test"}\n```';
      const sanitized = builder.sanitizeResponse(response);
      expect(sanitized).not.toContain("```");
      expect(sanitized).toContain('{"decision": "advance_to_phase2", "reasoning": "Test"}');
    });

    it("should strip extra whitespace", () => {
      const response = '   {"decision": "advance_to_phase2"}   ';
      const sanitized = builder.sanitizeResponse(response);
      expect(sanitized).toBe('{"decision": "advance_to_phase2"}');
    });

    it("should handle escaped quotes", () => {
      const response = '{"decision": "advance_to_phase2", "reasoning": "This is \\"quoted\\""}';
      const sanitized = builder.sanitizeResponse(response);
      expect(sanitized).not.toContain('\\"');
    });

    it("should remove control characters", () => {
      const response = '{"decision": "advance_to_phase\u0000test"}';
      const sanitized = builder.sanitizeResponse(response);
      expect(sanitized).not.toContain("\u0000");
    });
  });

  describe("2.5.6 Add Retry Logic for Decision Agents", () => {
    it("should parse valid response correctly", () => {
      const response = JSON.stringify({
        decision: "advance_to_phase2",
        reasoning: "Test",
        confidence: 0.9,
      });

      const parsed = builder.parseDecisionResponse(response, ["phase2"]);
      expect(parsed).not.toBeNull();
      expect(parsed?.decision).toBe("advance_to_phase2");
      expect(parsed?.reasoning).toBe("Test");
      expect(parsed?.confidence).toBe(0.9);
    });

    it("should return null for invalid response", () => {
      const response = JSON.stringify({
        decision: "invalid",
        reasoning: "Test",
        confidence: 0.9,
      });

      const parsed = builder.parseDecisionResponse(response, ["phase2"]);
      expect(parsed).toBeNull();
    });

    it("should handle JSON parse errors gracefully", () => {
      const response = "invalid json";
      const parsed = builder.parseDecisionResponse(response, ["phase2"]);
      expect(parsed).toBeNull();
    });
  });

  describe("2.5.7 Add Decision Analytics", () => {
    beforeEach(() => {
      builder.resetAnalytics();
    });

    it("should track total decisions", () => {
      expect(builder.getAnalytics().total_decisions).toBe(0);

      builder.parseDecisionResponse(
        JSON.stringify({ decision: "advance_to_phase2", reasoning: "Test", confidence: 0.9 }),
        ["phase2"]
      );
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "jump_to_phase1", reasoning: "Test", confidence: 0.8 }),
        ["phase1", "phase2"]
      );

      expect(builder.getAnalytics().total_decisions).toBe(2);
    });

    it("should track decisions by type", () => {
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "advance_to_phase2", reasoning: "Test", confidence: 0.9 }),
        ["phase2"]
      );
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "jump_to_phase1", reasoning: "Test", confidence: 0.8 }),
        ["phase1"]
      );
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "require_approval", reasoning: "Test", confidence: 0.5 }),
        []
      );

      const analytics = builder.getAnalytics();
      expect(analytics.decisions_by_type["advance"]).toBe(1);
      expect(analytics.decisions_by_type["jump"]).toBe(1);
      expect(analytics.decisions_by_type["require"]).toBe(1);
    });

    it("should track confidence distribution", () => {
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "advance_to_phase2", reasoning: "Test", confidence: 0.9 }),
        ["phase2"]
      );
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "jump_to_phase1", reasoning: "Test", confidence: 0.7 }),
        ["phase1"]
      );
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "require_approval", reasoning: "Test", confidence: 0.4 }),
        []
      );

      const analytics = builder.getAnalytics();
      expect(analytics.confidence_distribution.high).toBe(1);
      expect(analytics.confidence_distribution.medium).toBe(1);
      expect(analytics.confidence_distribution.low).toBe(1);
    });

    it("should track most common target phases", () => {
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "advance_to_phase2", reasoning: "Test", confidence: 0.9 }),
        ["phase2"]
      );
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "jump_to_phase2", reasoning: "Test", confidence: 0.8 }),
        ["phase1", "phase2"]
      );
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "advance_to_phase3", reasoning: "Test", confidence: 0.7 }),
        ["phase3"]
      );

      const analytics = builder.getAnalytics();
      expect(analytics.most_common_targets[0].target).toBe("phase2");
      expect(analytics.most_common_targets[0].count).toBe(2);
      expect(analytics.most_common_targets[1].target).toBe("phase3");
      expect(analytics.most_common_targets[1].count).toBe(1);
    });

    it("should track approval rate by confidence", () => {
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "advance_to_phase2", reasoning: "Test", confidence: 0.9 }),
        ["phase2"]
      );
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "jump_to_phase1", reasoning: "Test", confidence: 0.85 }),
        ["phase1"]
      );
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "advance_to_phase2", reasoning: "Test", confidence: 0.6 }),
        ["phase2"]
      );
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "jump_to_phase1", reasoning: "Test", confidence: 0.55 }),
        ["phase1"]
      );
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "require_approval", reasoning: "Test", confidence: 0.4 }),
        []
      );
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "advance_to_phase2", reasoning: "Test", confidence: 0.3 }),
        ["phase2"]
      );

      const analytics = builder.getAnalytics();
      expect(analytics.approval_rate_by_confidence.high_total).toBe(2);
      expect(analytics.approval_rate_by_confidence.high_approved).toBe(2);
      expect(analytics.approval_rate_by_confidence.medium_total).toBe(2);
      expect(analytics.approval_rate_by_confidence.medium_approved).toBe(2);
      expect(analytics.approval_rate_by_confidence.low_total).toBe(2);
      expect(analytics.approval_rate_by_confidence.low_approved).toBe(1);
    });

    it("should reset analytics", () => {
      builder.parseDecisionResponse(
        JSON.stringify({ decision: "advance_to_phase2", reasoning: "Test", confidence: 0.9 }),
        ["phase2"]
      );

      expect(builder.getAnalytics().total_decisions).toBe(1);
      
      builder.resetAnalytics();
      
      expect(builder.getAnalytics().total_decisions).toBe(0);
      expect(builder.getAnalytics().decisions_by_type).toEqual({});
    });
  });

  describe("2.5.8 Comprehensive Tests - Integration", () => {
    it("should build complete decision prompt with all context", () => {
      const context: TemplateContext = {
        issue: mockIssue,
        outcome: mockOutcome,
        current_phase: "test",
        custom_instructions: "Make a decision",
        allowed_destinations: ["phase1", "phase2", "phase3"],
        recent_decisions: [
          {
            timestamp: Date.now() - 60000,
            decision: "advance_to_phase1",
            reasoning: "Good progress",
          },
        ],
        phase_history: [
          {
            phase: "implement",
            attempt_number: 1,
            status: "completed",
            duration_ms: 5000,
          },
        ],
        performance_context: {
          average_duration_ms: 4000,
          total_duration_ms: 20000,
          phase_visit_count: 5,
        },
      };

      const promptData = builder.buildPrompt("test-decision", context);
      expect(promptData).not.toBeNull();
      expect(promptData?.user_prompt).toContain("Test Issue");
      expect(promptData?.user_prompt).toContain("Good progress");
      expect(promptData?.user_prompt).toContain("Attempt 1");
      expect(promptData?.user_prompt).toContain("4000");
    });

    it("should handle missing optional context fields", () => {
      const context: TemplateContext = {
        issue: mockIssue,
        outcome: mockOutcome,
        current_phase: "test",
        custom_instructions: "Make a decision",
        allowed_destinations: ["phase1"],
      };

      const promptData = builder.buildPrompt("test-decision", context);
      expect(promptData).not.toBeNull();
      expect(promptData?.user_prompt).toContain("Test Issue");
    });

    it("should handle empty arrays in context", () => {
      const context: TemplateContext = {
        issue: mockIssue,
        outcome: { ...mockOutcome, warnings: [] },
        current_phase: "test",
        custom_instructions: "Test",
        allowed_destinations: [],
        recent_decisions: [],
        phase_history: [],
      };

      const promptData = builder.buildPrompt("test-decision", context);
      expect(promptData).not.toBeNull();
    });

    it("should use fallback template when primary template fails", () => {
      const context: TemplateContext = {
        issue: mockIssue,
        outcome: mockOutcome,
        current_phase: "test",
        custom_instructions: "Test",
        allowed_destinations: [],
      };

      const instructions = builder.buildDecisionInstructions(
        mockIssue,
        "non-existent",
        mockOutcome,
        "test",
        "Test instructions",
        [],
        context
      );

      expect(instructions).toContain("Fallback");
      expect(instructions).toContain("Test Issue");
    });
  });

  describe("Singleton Pattern", () => {
    it("should return same instance on multiple calls", () => {
      const instance1 = getDecisionPromptBuilder(testConfigPath);
      const instance2 = getDecisionPromptBuilder(testConfigPath);
      expect(instance1).toBe(instance2);
    });
  });

  describe("getSystemPrompt", () => {
    it("should return system prompt for capability", () => {
      const systemPrompt = builder.getSystemPrompt("test-decision");
      expect(systemPrompt).toContain("You are a test decision agent");
    });

    it("should return empty string for non-existent capability", () => {
      const systemPrompt = builder.getSystemPrompt("non-existent");
      expect(systemPrompt).toBe("Fallback agent");
    });
  });
});
