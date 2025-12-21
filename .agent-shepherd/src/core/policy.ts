/**
 * Policy Engine
 * Handles YAML policy configuration, phase management, and transition logic
 */

import { parse as parseYAML } from "yaml";
import { readFileSync } from "fs";
import { getConfigPath } from "./path-utils";

export interface PhaseConfig {
  name: string;
  description?: string;
  capabilities?: string[];
  agent?: string;  // Specific agent to use for this phase
  model?: string;  // Model override in format "provider/model"
  timeout_multiplier?: number;
  require_approval?: boolean;
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
  phases: PhaseConfig[];
  retry?: RetryConfig;
  timeout_base_ms?: number;
  stall_threshold_ms?: number;
  require_hitl?: boolean;
}

export interface PoliciesFile {
  policies: {
    [key: string]: PolicyConfig;
  };
  default_policy?: string;
}

export type PhaseTransition = {
  type: "advance" | "retry" | "block" | "close";
  next_phase?: string;
  reason?: string;
};

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

    for (const phase of policy.phases) {
      if (!phase.name) {
        throw new Error(`Policy '${name}' has a phase without a name`);
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
  determineTransition(
    policyName: string,
    currentPhase: string,
    outcome: {
      success: boolean;
      retry_count?: number;
      requires_approval?: boolean;
    }
  ): PhaseTransition {
    const policy = this.getPolicy(policyName);
    if (!policy) {
      return { type: "block", reason: "Policy not found" };
    }

    const phaseConfig = this.getPhaseConfig(policyName, currentPhase);
    if (!phaseConfig) {
      return { type: "block", reason: "Phase not found" };
    }

    // Check if approval is required
    if (outcome.requires_approval || phaseConfig.require_approval) {
      return {
        type: "block",
        reason: "Human approval required",
      };
    }

    // Handle success
    if (outcome.success) {
      const nextPhase = this.getNextPhase(policyName, currentPhase);
      if (nextPhase) {
        return {
          type: "advance",
          next_phase: nextPhase,
          reason: "Phase completed successfully",
        };
      } else {
        return {
          type: "close",
          reason: "All phases completed",
        };
      }
    }

    // Handle failure with retry logic
    const retryConfig = policy.retry || {
      max_attempts: 3,
      backoff_strategy: "exponential",
    };

    const retryCount = outcome.retry_count || 0;

    if (retryCount < retryConfig.max_attempts - 1) {
      return {
        type: "retry",
        reason: `Retry ${retryCount + 1}/${retryConfig.max_attempts}`,
      };
    }

    // Max retries exceeded
    return {
      type: "block",
      reason: "Max retries exceeded",
    };
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
