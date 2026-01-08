/**
 * Policy Engine
 * Handles YAML policy configuration, phase management, and transition logic
 */

import { parse as parseYAML } from "yaml";
import { readFileSync } from "fs";
import { getConfigPath } from "./path-utils";
import { type BeadsIssue } from "./beads.ts";
import { type HITLConfig, loadConfig } from "./config.ts";
import { getAgentRegistry } from "./agent-registry.ts";
import { getLogger, type RunOutcome } from "./logging.ts";
import { getDecisionPromptBuilder, type TemplateContext } from "./decision-builder.ts";

export interface PhaseConfig {
  name: string;
  description?: string;
  capabilities?: string[];
  agent?: string;
  model?: string;
  timeout_multiplier?: number;
  require_approval?: boolean;
  fallback_agent?: string;
  fallback_enabled?: boolean;
  transitions?: TransitionBlock;
  max_visits?: number;
}

export interface TransitionConfig {
  capability: string;
  prompt: string;
  allowed_destinations: string[];
  messaging?: boolean;
  confidence_thresholds?: {
    auto_advance: number;
    require_approval: number;
  };
}

export interface TransitionBlock {
  on_success?: string | TransitionConfig;
  on_failure?: string | TransitionConfig;
  on_partial_success?: TransitionConfig;
  on_unclear?: TransitionConfig;
}

export interface RetryConfig {
  max_attempts: number;
  backoff_strategy: "exponential" | "linear" | "fixed";
  initial_delay_ms?: number;
  max_delay_ms?: number;
}

export interface PolicyConfig {
  name: string;
  description?: string;
  issue_types?: string[];
  priority?: number;
  phases: PhaseConfig[];
  retry?: RetryConfig;
  timeout_base_ms?: number;
  stall_threshold_ms?: number;
  require_hitl?: boolean;
  fallback_enabled?: boolean;
  fallback_agent?: string;
  fallback_mappings?: Record<string, string>;
}

export interface PoliciesFile {
  policies: {
    [key: string]: PolicyConfig;
  };
  default_policy?: string;
}

export type PhaseTransition = {
  type: "advance" | "retry" | "block" | "close" | "jump_back" | "dynamic_decision";
  next_phase?: string;
  reason?: string;
  jump_target_phase?: string;
  dynamic_agent?: string;
  decision_config?: any;
};

export interface DecisionResult {
  action: string;
  target_phase?: string;
  reasoning: string;
  confidence: number;
  requires_approval: boolean;
  recommendations?: string[];
}

/**
 * Map outcome types to transition configuration keys
 */
export function getTransitionKey(outcome: {
  success: boolean;
  result_type?: 'success' | 'failure' | 'partial_success' | 'unclear';
}): string {
  if (outcome.result_type) {
    return `on_${outcome.result_type}`;
  }
  return outcome.success ? 'on_success' : 'on_failure';
}

/**
 * Policy Engine for managing workflow phases and transitions
 */
export class PolicyEngine {
  private policies: Map<string, PolicyConfig>;
  private defaultPolicy: string;

  constructor(configPath?: string) {
    this.policies = new Map();
    this.defaultPolicy = "default";
    
    if (configPath) {
      this.loadPolicies(configPath);
    }
  }

  /**
   * Load policies from YAML file
   */
  loadPolicies(filePath: string): void {
    try {
      const content = readFileSync(filePath, "utf-8");
      const config = parseYAML(content) as PoliciesFile;

      if (!config.policies) {
        throw new Error("Invalid policies file: missing 'policies' key");
      }

      // Clear existing policies
      this.policies.clear();

      // Load all policies
      for (const [name, policy] of Object.entries(config.policies)) {
        this.validatePolicy(name, policy);
        this.policies.set(name, policy);
      }

      // Set default policy
      if (config.default_policy) {
        if (!this.policies.has(config.default_policy)) {
          throw new Error(
            `Default policy '${config.default_policy}' not found`
          );
        }
        this.defaultPolicy = config.default_policy;
      }
    } catch (error) {
      throw new Error(
        `Failed to load policies from ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validate policy configuration
   */
  private validatePolicy(name: string, policy: PolicyConfig): void {
    if (!policy.phases || policy.phases.length === 0) {
      throw new Error(`Policy '${name}' must have at least one phase`);
    }

    const phaseNames = policy.phases.map(p => p.name);

    for (const phase of policy.phases) {
      if (!phase.name) {
        throw new Error(`Policy '${name}' has a phase without a name`);
      }

      if (phase.transitions) {
        this.validateTransitionBlock(phase.name, phase.transitions, phaseNames);
      }
    }
  }

  /**
   * Validate transition block configuration
   */
  private validateTransitionBlock(
    phaseName: string,
    transitions: TransitionBlock,
    policyPhases: string[]
  ): void {
    for (const [key, transition] of Object.entries(transitions)) {
      if (key === 'on_partial_success' || key === 'on_unclear') {
        // These must be objects only, not strings
        if (typeof transition === 'string') {
          throw new Error(
            `Invalid ${key} transition in phase '${phaseName}': must be object, not string`
          );
        }
      }

      if (typeof transition === 'string') {
        if (!policyPhases.includes(transition) && transition !== 'close') {
          throw new Error(
            `Invalid ${key} transition in phase '${phaseName}': phase '${transition}' not found in policy`
          );
        }
      } else if (typeof transition === 'object' && transition !== null) {
        if (!transition.capability || !transition.prompt || !transition.allowed_destinations) {
          throw new Error(
            `Invalid ${key} transition in phase '${phaseName}': missing required fields (capability, prompt, allowed_destinations)`
          );
        }

        for (const dest of transition.allowed_destinations) {
          if (!policyPhases.includes(dest) && dest !== 'close') {
            throw new Error(
              `Invalid ${key} transition in phase '${phaseName}': destination '${dest}' not found in policy`
            );
          }
        }

        if (transition.confidence_thresholds) {
          const { auto_advance, require_approval } = transition.confidence_thresholds;
          if (auto_advance !== undefined && (auto_advance < 0 || auto_advance > 1)) {
            throw new Error(
              `Invalid auto_advance threshold in ${key} transition for phase '${phaseName}': must be 0.0-1.0`
            );
          }
          if (require_approval !== undefined && (require_approval < 0 || require_approval > 1)) {
            throw new Error(
              `Invalid require_approval threshold in ${key} transition for phase '${phaseName}': must be 0.0-1.0`
            );
          }
        }
      }
    }
  }

  /**
   * Get a policy by name
   */
  getPolicy(name?: string): PolicyConfig | null {
    const policyName = name || this.defaultPolicy;
    return this.policies.get(policyName) || null;
  }

  /**
   * Get all policy names
   */
  getPolicyNames(): string[] {
    return Array.from(this.policies.keys());
  }

  /**
   * Get the default policy name
   */
  getDefaultPolicyName(): string {
    return this.defaultPolicy;
  }

  /**
   * Match a policy to an issue based on labels and issue type
   * Priority order:
   * 1. Explicit workflow label (ashep-workflow:<name>)
   * 2. Issue type matching (highest priority first, ties broken by config order)
   * 3. Default policy
   */
  matchPolicy(issue: BeadsIssue): string {
    const labels = issue.labels || [];

    // Check for explicit workflow label
    const workflowLabel = labels.find(label => label.startsWith("ashep-workflow:"));
    if (workflowLabel) {
      const workflowName = workflowLabel.replace("ashep-workflow:", "");
      
      // Validate that the workflow exists
      if (this.policies.has(workflowName)) {
        return workflowName;
      } else {
        // Handle invalid workflow label based on config
        const strategy = this.getInvalidLabelStrategy();
        
        if (strategy === "error") {
          throw new Error(`Invalid workflow label: ${workflowLabel}. Policy '${workflowName}' does not exist.`);
        } else if (strategy === "warning") {
          console.warn(`Invalid workflow label: ${workflowLabel}. Policy '${workflowName}' does not exist. Falling back to default.`);
        }
        // For "ignore", silently fall through to default
      }
    }

    // Match by issue type (if defined)
    if (issue.issue_type) {
      const matchingPolicies: Array<{ name: string; priority: number; index: number }> = [];
      
      for (const [name, policy] of this.policies.entries()) {
        if (policy.issue_types && policy.issue_types.includes(issue.issue_type)) {
          const priority = policy.priority || 50;
          const index = Array.from(this.policies.keys()).indexOf(name);
          matchingPolicies.push({ name, priority, index });
        }
      }

      // Sort by priority (highest first), then by config order (earliest first)
      if (matchingPolicies.length > 0) {
        matchingPolicies.sort((a, b) => {
          if (b.priority !== a.priority) {
            return b.priority - a.priority; // Higher priority first
          }
          return a.index - b.index; // Earlier in config first (tie-breaker)
        });
        return matchingPolicies[0].name;
      }
    }

    // Fall back to default policy
    return this.defaultPolicy;
  }

  /**
   * Get the invalid label strategy from configuration
   */
  private getInvalidLabelStrategy(): "error" | "warning" | "ignore" {
    try {
      const { loadConfig } = require("./config.ts");
      const config = loadConfig();
      return config.workflow?.invalid_label_strategy || "error";
    } catch {
      return "error";
    }
  }

  /**
   * Get phase sequence for a policy
   */
  getPhaseSequence(policyName?: string): string[] {
    const policy = this.getPolicy(policyName);
    if (!policy) {
      return [];
    }
    return policy.phases.map((p) => p.name);
  }

  /**
   * Get phase configuration
   */
  getPhaseConfig(
    policyName: string,
    phaseName: string
  ): PhaseConfig | null {
    const policy = this.getPolicy(policyName);
    if (!policy) {
      return null;
    }
    return policy.phases.find((p) => p.name === phaseName) || null;
  }

  /**
   * Get next phase in sequence
   */
  getNextPhase(policyName: string, currentPhase: string): string | null {
    const sequence = this.getPhaseSequence(policyName);
    const currentIndex = sequence.indexOf(currentPhase);

    if (currentIndex === -1 || currentIndex === sequence.length - 1) {
      return null;
    }

    return sequence[currentIndex + 1];
  }

  /**
   * Determine phase transition based on run outcome
   */
  async determineTransition(
    policyName: string,
    currentPhase: string,
    outcome: {
      success: boolean;
      retry_count?: number;
      requires_approval?: boolean;
      result_type?: 'success' | 'failure' | 'partial_success' | 'unclear';
    },
    issueId?: string
  ): Promise<PhaseTransition> {
    const policy = this.getPolicy(policyName);
    if (!policy) {
      return { type: "block", reason: "Policy not found" };
    }

    const phaseConfig = this.getPhaseConfig(policyName, currentPhase);
    if (!phaseConfig) {
      return { type: "block", reason: "Phase not found" };
    }

    if (issueId) {
      const phaseValidation = await this.validatePhaseLimits(policyName, issueId, currentPhase);
      if (!phaseValidation.valid) {
        return { type: "block", reason: phaseValidation.reason };
      }
    }

    // Determine the transition
    let transition: PhaseTransition;

    // Check for custom transitions (OPTIONAL - only if defined)
    if (phaseConfig.transitions) {
      const transitionKey = getTransitionKey(outcome);
      const transitionConfig = (phaseConfig.transitions as Record<string, string | TransitionConfig>)[transitionKey];

      if (transitionConfig !== undefined) {
        if (typeof transitionConfig === 'string') {
          // DIRECT JUMP: on_success: "validate"
          transition = {
            type: 'advance' as const,
            next_phase: transitionConfig,
            reason: `Direct transition to ${transitionConfig}`
          };
        } else {
          // AI ROUTING: on_failure: {capability: "...", prompt: "..."}
          transition = {
            type: 'dynamic_decision' as const,
            dynamic_agent: transitionConfig.capability,
            decision_config: transitionConfig,
            reason: `AI routing for ${transitionKey}`
          };
        }
        this.validateTransition(policyName, currentPhase, transition);
        return await this.applyLoopPrevention(transition, issueId, currentPhase);
      }
    }

    // DEFAULT LINEAR BEHAVIOR (no transitions block or no matching key)
    // Check if approval is required
    if (outcome.requires_approval || phaseConfig.require_approval) {
      transition = {
        type: "block" as const,
        reason: "Human approval required",
      };
      this.validateTransition(policyName, currentPhase, transition);
      return transition;
    }

    // Handle success
    if (outcome.success) {
      const nextPhase = this.getNextPhase(policyName, currentPhase);
      if (nextPhase) {
        transition = {
          type: "advance" as const,
          next_phase: nextPhase,
          reason: "Phase completed successfully",
        };
      } else {
        transition = {
          type: "close" as const,
          reason: "All phases completed",
        };
      }
      this.validateTransition(policyName, currentPhase, transition);
      return await this.applyLoopPrevention(transition, issueId, currentPhase);
    }

    // Handle failure with retry logic
    const retryConfig = policy.retry || {
      max_attempts: 3,
      backoff_strategy: "exponential",
    };

    const retryCount = outcome.retry_count ?? 0;

    if (retryCount < retryConfig.max_attempts - 1) {
      transition = {
        type: "retry" as const,
        reason: `Retry ${retryCount + 1}/${retryConfig.max_attempts}`,
      };
      this.validateTransition(policyName, currentPhase, transition);
      return transition;
    }

    // Max retries exceeded
    transition = {
      type: "block" as const,
      reason: `Max retries exceeded (${retryConfig.max_attempts})`,
    };
    this.validateTransition(policyName, currentPhase, transition);
    return transition;
  }

  /**
   * Apply loop prevention checks to a transition
   */
  private async applyLoopPrevention(
    transition: PhaseTransition,
    issueId: string | undefined,
    currentPhase: string
  ): Promise<PhaseTransition> {
    if (!issueId) {
      return transition;
    }

    // Check transition limits for advance and jump_back transitions
    const nextPhase = transition.next_phase || transition.jump_target_phase;
    if (nextPhase && (transition.type === 'advance' || transition.type === 'jump_back')) {
      const transitionValidation = await this.validateTransitionLimits(issueId, currentPhase, nextPhase);
      if (!transitionValidation.valid) {
        return { type: "block", reason: transitionValidation.reason };
      }
    }

    // Check for oscillating cycles
    const cycleDetection = await this.detectCycles(issueId);
    if (cycleDetection.detected) {
      return { type: "block", reason: cycleDetection.reason };
    }

    return transition;
  }

  /**
   * Calculate retry delay based on policy
   */
  calculateRetryDelay(
    policyName: string,
    attemptNumber: number
  ): number {
    const policy = this.getPolicy(policyName);
    if (!policy || !policy.retry) {
      return 5000; // Default 5 seconds
    }

    const retry = policy.retry;
    const initialDelay = retry.initial_delay_ms || 5000;
    const maxDelay = retry.max_delay_ms || 300000; // 5 minutes

    let delay: number;

    switch (retry.backoff_strategy) {
      case "exponential":
        delay = initialDelay * Math.pow(2, attemptNumber);
        break;
      case "linear":
        delay = initialDelay * (attemptNumber + 1);
        break;
      case "fixed":
        delay = initialDelay;
        break;
      default:
        delay = initialDelay;
    }

    return Math.min(delay, maxDelay);
  }

  /**
   * Calculate timeout for a phase
   */
  calculateTimeout(
    policyName: string,
    phaseName: string
  ): number {
    const policy = this.getPolicy(policyName);
    if (!policy) {
      return 300000; // Default 5 minutes
    }

    const baseTimeout = policy.timeout_base_ms || 300000;
    const phaseConfig = this.getPhaseConfig(policyName, phaseName);
    const multiplier = phaseConfig?.timeout_multiplier || 1.0;

    return baseTimeout * multiplier;
  }

  /**
   * Get stall threshold for a policy
   */
  getStallThreshold(policyName: string): number {
    const policy = this.getPolicy(policyName);
    return policy?.stall_threshold_ms || 60000; // Default 1 minute
  }

  /**
   * Check if HITL is required for a policy
   */
  requiresHITL(policyName: string): boolean {
    const policy = this.getPolicy(policyName);
    return policy?.require_hitl || false;
  }

  /**
   * Validate phase visit limits
   * Returns false if phase has exceeded max_visits, true otherwise
   */
  async validatePhaseLimits(
    policyName: string,
    issueId: string,
    phaseName: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const phaseConfig = this.getPhaseConfig(policyName, phaseName);
    if (!phaseConfig) {
      return { valid: false, reason: "Phase not found" };
    }

    const config = loadConfig();
    const maxVisits = phaseConfig.max_visits || config.loop_prevention?.max_visits_default || 10;
    const logger = getLogger();
    const visitCount = logger.getPhaseVisitCount(issueId, phaseName);

    if (visitCount >= maxVisits) {
      return {
        valid: false,
        reason: `Phase '${phaseName}' exceeded max_visits (${maxVisits}) with ${visitCount} visits`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate transition limits
   * Checks if a specific transition pattern has exceeded allowed count
   */
  async validateTransitionLimits(
    issueId: string,
    fromPhase: string,
    toPhase: string,
    maxTransitions?: number
  ): Promise<{ valid: boolean; reason?: string }> {
    const config = loadConfig();
    const maxTrans = maxTransitions || config.loop_prevention?.max_transitions_default || 5;
    const logger = getLogger();
    const transitionCount = logger.getTransitionCount(issueId, fromPhase, toPhase);

    if (transitionCount >= maxTrans) {
      return {
        valid: false,
        reason: `Transition ${fromPhase}→${toPhase} exceeded max_transitions (${maxTrans}) with ${transitionCount} occurrences`,
      };
    }

    return { valid: true };
  }

  /**
   * Detect oscillating patterns in recent transitions
   * Looks for patterns like develop→test→develop→test
   */
  async detectCycles(
    issueId: string,
    cycleLength?: number
  ): Promise<{ detected: boolean; reason?: string }> {
    const config = loadConfig();

    if (!config.loop_prevention?.cycle_detection_enabled) {
      return { detected: false };
    }

    const length = cycleLength || config.loop_prevention?.cycle_detection_length || 3;
    const logger = getLogger();
    const recentDecisions = logger.getDecisionsForIssue(issueId, { limit: 20 });

    const transitions = recentDecisions
      .filter((d) => d.type === "phase_transition")
      .map((d) => {
        const fromPhase = d.metadata?.from_phase as string;
        const toPhase = d.metadata?.to_phase as string;
        return fromPhase && toPhase ? `${fromPhase}→${toPhase}` : null;
      })
      .filter((t): t is string => t !== null)
      .slice(-10);

    for (let i = 0; i <= transitions.length - length; i++) {
      const pattern = transitions.slice(i, i + length);

      const reversePattern = [...pattern].reverse();

      if (pattern.join(",") === reversePattern.join(",")) {
        return {
          detected: true,
          reason: `Oscillating cycle detected: ${pattern.join(" → ")}`,
        };
      }
    }

    return { detected: false };
  }

  /**
   * Build comprehensive prompt for decision agents
   * Combines issue data, previous results, and decision parameters
   */
  buildDecisionInstructions(
    issue: BeadsIssue,
    transitionConfig: TransitionConfig,
    previousOutcome: RunOutcome,
    currentPhase: string,
    context?: Partial<TemplateContext>
  ): string {
    const builder = getDecisionPromptBuilder();

    return builder.buildDecisionInstructions(
      issue,
      transitionConfig.capability,
      previousOutcome,
      currentPhase,
      transitionConfig.prompt,
      transitionConfig.allowed_destinations,
      context
    );
  }

  /**
   * Parse and validate AI decision responses
   * Ensures decisions are safe, valid, and actionable
   */
  parseDecisionResponse(
    response: string,
    transitionConfig: TransitionConfig
  ): DecisionResult {
    const builder = getDecisionPromptBuilder();

    const parsedResponse = builder.parseDecisionResponse(
      response,
      transitionConfig.allowed_destinations,
      transitionConfig.confidence_thresholds
    );

    if (!parsedResponse) {
      console.error('Failed to parse decision response');
      return {
        action: 'require_approval',
        reasoning: 'Failed to parse AI decision response',
        confidence: 0,
        requires_approval: true
      };
    }

    const validation = (builder as any).validateResponse(
      response,
      transitionConfig.allowed_destinations,
      transitionConfig.confidence_thresholds
    );

    if (validation.warnings && validation.warnings.length > 0) {
      console.warn('Decision response warnings:', validation.warnings.join(', '));
    }

    let targetPhase: string | undefined;
    if (parsedResponse.decision.startsWith('jump_to_')) {
      targetPhase = parsedResponse.decision.replace('jump_to_', '');
    } else if (parsedResponse.decision.startsWith('advance_to_')) {
      targetPhase = parsedResponse.decision.replace('advance_to_', '');
    }

    return {
      action: parsedResponse.decision,
      target_phase: targetPhase,
      reasoning: parsedResponse.reasoning,
      confidence: parsedResponse.confidence,
      requires_approval: parsedResponse.decision === 'require_approval' ||
        (parsedResponse.confidence < (transitionConfig.confidence_thresholds?.require_approval || 0.6)),
      recommendations: parsedResponse.recommendations
    };
  }

  /**
   * Validate transition before returning it
   * Ensures jump_target_phase exists and dynamic_agent is valid
   */
  private validateTransition(
    policyName: string,
    currentPhase: string,
    transition: PhaseTransition
  ): void {
    if (transition.type === "jump_back") {
      const targetPhase = transition.jump_target_phase || transition.next_phase;
      if (!targetPhase) {
        throw new Error("jump_back transition requires jump_target_phase or next_phase");
      }

      const policy = this.getPolicy(policyName);
      if (!policy) {
        throw new Error(`Policy '${policyName}' not found`);
      }

      const phaseExists = policy.phases.some((p) => p.name === targetPhase);
      if (!phaseExists) {
        throw new Error(`Target phase '${targetPhase}' not found in policy '${policyName}'`);
      }

      if (targetPhase === currentPhase) {
        throw new Error(`Cannot jump from phase '${currentPhase}' to itself`);
      }
    }

    if (transition.type === "dynamic_decision") {
      if (!transition.dynamic_agent) {
        throw new Error("dynamic_decision transition requires dynamic_agent");
      }

      const agentRegistry = getAgentRegistry();
      const agents = agentRegistry.getAgentsByCapability(transition.dynamic_agent);
      const activeAgents = agents.filter((agent) => agent.active !== false);

      if (activeAgents.length === 0) {
        throw new Error(
          `No active agents found with capability '${transition.dynamic_agent}'`
        );
      }
    }
  }
}

/**
 * Create a singleton Policy Engine instance
 */
let defaultPolicyEngine: PolicyEngine | null = null;

export function getPolicyEngine(configPath?: string): PolicyEngine {
  if (!defaultPolicyEngine) {
    const defaultPath = configPath || getConfigPath("policies.yaml");
    defaultPolicyEngine = new PolicyEngine(defaultPath);
  }
  return defaultPolicyEngine;
}

/**
 * Validate HITL reason against predefined list and custom validation rules
 */
export function validateHITLReason(reason: string, config?: HITLConfig): boolean {
  const hitlConfig = config || loadConfig().hitl;
  
  if (!hitlConfig) {
    return true;
  }
  
  const { predefined, allow_custom, custom_validation } = hitlConfig.allowed_reasons;
  
  if (predefined.includes(reason)) {
    return true;
  }
  
  if (allow_custom) {
    switch (custom_validation) {
      case "none":
        return true;
      case "alphanumeric":
        return /^[a-z0-9]+$/i.test(reason);
      case "alphanumeric-dash-underscore":
      default:
        return /^[a-z][a-z0-9_-]*$/i.test(reason);
    }
  }
  
  return false;
}
