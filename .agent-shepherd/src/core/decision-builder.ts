/**
 * Decision Prompt Builder and Response Parser
 * Handles template-based prompt generation, response validation, and analytics
 */

import { parse as parseYAML } from "yaml";
import { readFileSync } from "fs";
import { getConfigPath } from "./path-utils";
import { type BeadsIssue } from "./beads.ts";
import { type RunOutcome } from "./logging.ts";

export interface DecisionPromptConfig {
  version: string;
  templates: {
    [key: string]: {
      name: string;
      description: string;
      system_prompt: string;
      prompt_template: string;
    };
  };
  default_template?: string;
}

export interface TemplateContext {
  issue: BeadsIssue;
  outcome: RunOutcome;
  current_phase: string;
  custom_instructions: string;
  allowed_destinations: string[];
  recent_decisions?: Array<{
    timestamp: number;
    decision: string;
    reasoning: string;
  }>;
  phase_history?: Array<{
    phase: string;
    attempt_number: number;
    status: string;
    duration_ms: number;
    error?: string;
  }>;
  performance_context?: {
    average_duration_ms: number;
    total_duration_ms: number;
    phase_visit_count: number;
  };
}

export interface DecisionResponse {
  decision: string;
  reasoning: string;
  confidence: number;
  recommendations?: string[];
}

export interface DecisionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  response?: DecisionResponse;
}

export interface DecisionAnalytics {
  total_decisions: number;
  decisions_by_type: Record<string, number>;
  confidence_distribution: {
    high: number; // 0.8-1.0
    medium: number; // 0.5-0.8
    low: number; // 0.0-0.5
  };
  most_common_targets: Array<{
    target: string;
    count: number;
  }>;
  approval_rate_by_confidence: {
    high_approved: number;
    high_total: number;
    medium_approved: number;
    medium_total: number;
    low_approved: number;
    low_total: number;
  };
}

/**
 * Decision Prompt Builder and Response Parser
 */
export class DecisionPromptBuilder {
  private config: DecisionPromptConfig | null = null;
  private configPath: string;
  private analytics: DecisionAnalytics;

  constructor(configPath?: string) {
    this.configPath = configPath || getConfigPath("decision-prompts.yaml");
    this.analytics = this.initAnalytics();
    this.loadConfig();
  }

  /**
   * Initialize analytics structure
   */
  private initAnalytics(): DecisionAnalytics {
    return {
      total_decisions: 0,
      decisions_by_type: {},
      confidence_distribution: {
        high: 0,
        medium: 0,
        low: 0,
      },
      most_common_targets: [],
      approval_rate_by_confidence: {
        high_approved: 0,
        high_total: 0,
        medium_approved: 0,
        medium_total: 0,
        low_approved: 0,
        low_total: 0,
      },
    };
  }

  /**
   * Load decision prompts configuration
   */
  private loadConfig(): void {
    try {
      const content = readFileSync(this.configPath, "utf-8");
      this.config = parseYAML(content) as DecisionPromptConfig;
    } catch (error) {
      console.warn(`Failed to load decision prompts config: ${error instanceof Error ? error.message : String(error)}`);
      this.config = null;
    }
  }

  /**
   * Reload configuration
   */
  reloadConfig(): void {
    this.loadConfig();
  }

  /**
   * Substitute variables in template
   */
  private substituteVariables(template: string, context: TemplateContext): string {
    let result = template;

    const substitute = (pattern: string, value: any) => {
      const regex = new RegExp(pattern, "g");
      result = result.replace(regex, (match) => {
        if (value === undefined || value === null) {
          return match;
        }
        return String(value);
      });
    };

    substitute("{{issue\\.id}}", context.issue.id);
    substitute("{{issue\\.title}}", context.issue.title);
    substitute("{{issue\\.description}}", context.issue.description);
    substitute("{{issue\\.issue_type}}", context.issue.issue_type);
    substitute("{{issue\\.priority}}", context.issue.priority);
    substitute("{{issue\\.status}}", context.issue.status);
    substitute("{{current_phase}}", context.current_phase);
    substitute("{{custom_instructions}}", context.custom_instructions);
    substitute("{{outcome\\.success}}", context.outcome.success);
    substitute("{{outcome\\.message}}", context.outcome.message);
    substitute("{{outcome\\.error}}", context.outcome.error);
    substitute(
      "{{outcome\\.metrics\\.duration_ms}}",
      context.outcome.metrics?.duration_ms
    );

    if (context.issue.labels && context.issue.labels.length > 0) {
      const labelsSection = context.issue.labels.map((l) => `- ${l}`).join("\n");
      result = result.replace(/{{#each issue\.labels}}[\s\S]*?{{\/each}}/g, labelsSection);
    } else {
      result = result.replace(/{{#each issue\.labels}}[\s\S]*?{{\/each}}/g, "");
    }

    if (context.recent_decisions && context.recent_decisions.length > 0) {
      const decisionsSection = context.recent_decisions
        .map((d) => `- ${new Date(d.timestamp).toISOString()}: ${d.decision} (${d.reasoning})`)
        .join("\n");
      result = result.replace(
        /{{#each recent_decisions}}[\s\S]*?{{\/each}}/g,
        decisionsSection
      );
    } else {
      result = result.replace(/{{#each recent_decisions}}[\s\S]*?{{\/each}}/g, "");
    }

    if (context.phase_history && context.phase_history.length > 0) {
      const historySection = context.phase_history
        .map((h) => {
          const base = `- ${h.phase} (Attempt ${h.attempt_number}): ${h.status} (${h.duration_ms}ms)`;
          return h.error ? `${base}\n    Error: ${h.error}` : base;
        })
        .join("\n");
      result = result.replace(/{{#each phase_history}}[\s\S]*?{{\/each}}/g, historySection);
    } else {
      result = result.replace(/{{#each phase_history}}[\s\S]*?{{\/each}}/g, "");
    }

    if (context.performance_context) {
      const perfSection = `- Average phase duration: ${context.performance_context.average_duration_ms}ms
- Total time spent: ${context.performance_context.total_duration_ms}ms
- Visits to current phase: ${context.performance_context.phase_visit_count}`;
      result = result.replace(/{{#performance_context}}[\s\S]*?{{\/performance_context}}/g, perfSection);
    } else {
      result = result.replace(/{{#performance_context}}[\s\S]*?{{\/performance_context}}/g, "");
    }

    if (context.outcome.warnings && context.outcome.warnings.length > 0) {
      const warningsSection = context.outcome.warnings.map((w) => `  - ${w}`).join("\n");
      result = result.replace(/{{#each outcome\.warnings}}[\s\S]*?{{\/each}}/g, warningsSection);
    } else {
      result = result.replace(/{{#each outcome\.warnings}}[\s\S]*?{{\/each}}/g, "");
    }

    if (context.allowed_destinations && context.allowed_destinations.length > 0) {
      const destSection = context.allowed_destinations.map((d) => `- **${d}**`).join("\n");
      result = result.replace(
        /{{#each allowed_destinations}}[\s\S]*?{{\/each}}/g,
        destSection
      );
    } else {
      result = result.replace(/{{#each allowed_destinations}}[\s\S]*?{{\/each}}/g, "");
    }

    return result;
  }

  /**
   * Build prompt using template
   */
  buildPrompt(
    templateName: string,
    context: TemplateContext
  ): { system_prompt: string; user_prompt: string } | null {
    if (!this.config) {
      console.warn("Decision prompts config not loaded");
      return null;
    }

    const template = this.config.templates[templateName];
    if (!template) {
      console.warn(`Template '${templateName}' not found`);
      return null;
    }

    const userPrompt = this.substituteVariables(template.prompt_template, context);

    return {
      system_prompt: template.system_prompt,
      user_prompt: userPrompt,
    };
  }

  /**
   * Get template by name or fallback
   */
  getTemplate(templateName?: string): {
    name: string;
    description: string;
    system_prompt: string;
    prompt_template: string;
  } | null {
    if (!this.config) {
      return null;
    }

    if (templateName && this.config.templates[templateName]) {
      return this.config.templates[templateName];
    }

    const defaultName = this.config.default_template || "fallback-template";
    return this.config.templates[defaultName] || null;
  }

  /**
   * Get available template names
   */
  getAvailableTemplates(): string[] {
    if (!this.config) {
      return [];
    }
    return Object.keys(this.config.templates);
  }

  /**
   * Sanitize response before parsing
   */
  sanitizeResponse(response: string): string {
    let sanitized = response.trim();

    sanitized = sanitized.replace(/^```json\s*/, "");
    sanitized = sanitized.replace(/^```\s*/, "");
    sanitized = sanitized.replace(/\s*```$/, "");

    sanitized = sanitized.replace(/\\"/g, '"');
    sanitized = sanitized.replace(/\\'/g, "'");

    sanitized = Array.from(sanitized)
      .filter((char) => {
        const code = char.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join("");

    sanitized = sanitized.trim();

    return sanitized;
  }

  /**
   * Validate decision response
   */
  validateResponse(
    response: string,
    allowedDestinations: string[],
    confidenceThresholds?: { auto_advance: number; require_approval: number }
  ): DecisionValidationResult {
    const result: DecisionValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    let parsed: any;
    try {
      const sanitized = this.sanitizeResponse(response);
      parsed = JSON.parse(sanitized);
    } catch (error) {
      result.valid = false;
      result.errors.push(
        `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`
      );
      return result;
    }

    if (!parsed.decision) {
      result.valid = false;
      result.errors.push("Missing required field: decision");
    }

    if (!parsed.reasoning) {
      result.valid = false;
      result.errors.push("Missing required field: reasoning");
    }

    if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) {
      result.valid = false;
      result.errors.push("Invalid confidence value: must be a number between 0.0 and 1.0");
    }

    if (parsed.decision) {
      const validActions = ["jump_to_", "advance_to_", "require_approval"];
      const isValidAction =
        parsed.decision === "require_approval" ||
        validActions.some((action) => parsed.decision.startsWith(action));

      if (!isValidAction) {
        result.valid = false;
        result.errors.push(
          `Invalid decision action: ${parsed.decision}. Must start with 'jump_to_', 'advance_to_', or be 'require_approval'`
        );
      }

      if (parsed.decision.startsWith("jump_to_") || parsed.decision.startsWith("advance_to_")) {
        const targetPhase = parsed.decision.replace(/^(jump_to_|advance_to_)/, "");
        
        if (!allowedDestinations.includes(targetPhase)) {
          result.valid = false;
          result.errors.push(
            `Target phase '${targetPhase}' not in allowed destinations: ${allowedDestinations.join(", ")}`
          );
        }
      }
    }

    if (parsed.recommendations && !Array.isArray(parsed.recommendations)) {
      result.valid = false;
      result.errors.push("Invalid recommendations: must be an array");
    }

    const thresholds = confidenceThresholds || { auto_advance: 0.8, require_approval: 0.6 };

    if (parsed.confidence !== undefined && parsed.confidence < thresholds.require_approval) {
      result.warnings.push(
        `Confidence ${parsed.confidence} below require_approval threshold ${thresholds.require_approval}`
      );
    }

    result.response = parsed as DecisionResponse;

    return result;
  }

  /**
   * Parse decision response with validation
   */
  parseDecisionResponse(
    response: string,
    allowedDestinations: string[],
    confidenceThresholds?: { auto_advance: number; require_approval: number }
  ): DecisionResponse | null {
    const validation = this.validateResponse(response, allowedDestinations, confidenceThresholds);

    if (!validation.valid || !validation.response) {
      console.error("Invalid decision response:", validation.errors.join(", "));
      return null;
    }

    this.trackDecision(validation.response);

    return validation.response;
  }

  /**
   * Track decision for analytics
   */
  private trackDecision(response: DecisionResponse): void {
    this.analytics.total_decisions++;

    const decisionType = response.decision.split("_")[0];
    this.analytics.decisions_by_type[decisionType] =
      (this.analytics.decisions_by_type[decisionType] || 0) + 1;

    if (response.confidence >= 0.8) {
      this.analytics.confidence_distribution.high++;
      this.analytics.approval_rate_by_confidence.high_total++;
      if (!response.decision.includes("approval")) {
        this.analytics.approval_rate_by_confidence.high_approved++;
      }
    } else if (response.confidence >= 0.5) {
      this.analytics.confidence_distribution.medium++;
      this.analytics.approval_rate_by_confidence.medium_total++;
      if (!response.decision.includes("approval")) {
        this.analytics.approval_rate_by_confidence.medium_approved++;
      }
    } else {
      this.analytics.confidence_distribution.low++;
      this.analytics.approval_rate_by_confidence.low_total++;
      if (!response.decision.includes("approval")) {
        this.analytics.approval_rate_by_confidence.low_approved++;
      }
    }

    const targetMatch = response.decision.match(/(jump_to_|advance_to_)(.+)/);
    if (targetMatch) {
      const target = targetMatch[2];
      const existing = this.analytics.most_common_targets.find((t) => t.target === target);
      if (existing) {
        existing.count++;
      } else {
        this.analytics.most_common_targets.push({ target, count: 1 });
      }
    }
  }

  /**
   * Get decision analytics
   */
  getAnalytics(): DecisionAnalytics {
    this.analytics.most_common_targets.sort((a, b) => b.count - a.count);

    return this.analytics;
  }

  /**
   * Reset analytics
   */
  resetAnalytics(): void {
    this.analytics = this.initAnalytics();
  }

  /**
   * Build enhanced decision instructions with template
   */
  buildDecisionInstructions(
    issue: BeadsIssue,
    capability: string,
    previousOutcome: RunOutcome,
    currentPhase: string,
    customInstructions: string,
    allowedDestinations: string[],
    context?: Partial<TemplateContext>
  ): string {
    const fullContext: TemplateContext = {
      issue,
      outcome: previousOutcome,
      current_phase: currentPhase,
      custom_instructions: customInstructions,
      allowed_destinations: allowedDestinations,
      ...context,
    };

    const promptData = this.buildPrompt(capability, fullContext);

    if (promptData) {
      return promptData.user_prompt;
    }

    const fallbackContext: TemplateContext = {
      issue,
      outcome: previousOutcome,
      current_phase: currentPhase,
      custom_instructions: customInstructions,
      allowed_destinations: allowedDestinations,
      ...context,
    };

    const fallbackData = this.buildPrompt("fallback-template", fallbackContext);
    return fallbackData?.user_prompt || "";
  }

  /**
   * Get system prompt for capability
   */
  getSystemPrompt(capability: string): string {
    const template = this.getTemplate(capability);
    return template?.system_prompt || "";
  }
}

let defaultDecisionPromptBuilder: DecisionPromptBuilder | null = null;

export function getDecisionPromptBuilder(
  configPath?: string
): DecisionPromptBuilder {
  if (!defaultDecisionPromptBuilder) {
    defaultDecisionPromptBuilder = new DecisionPromptBuilder(configPath);
  }
  return defaultDecisionPromptBuilder;
}
