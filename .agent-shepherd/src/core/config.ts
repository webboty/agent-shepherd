import { parse as parseYAML } from "yaml";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getConfigPath } from "./path-utils";

export interface UIConfig {
  port: number;
  host: string;
}

export interface FallbackConfig {
  enabled: boolean;
  default_agent?: string;
  mappings?: Record<string, string>;
}

export interface WorkflowConfig {
  invalid_label_strategy: "error" | "warning" | "ignore";
}

export interface AllowedReasonsConfig {
  predefined: string[];
  allow_custom: boolean;
  custom_validation: "none" | "alphanumeric" | "alphanumeric-dash-underscore";
}

export interface HITLConfig {
  allowed_reasons: AllowedReasonsConfig;
}

export interface AgentShepherdConfig {
  version: string;
  worker?: {
    poll_interval_ms?: number;
    max_concurrent_runs?: number;
  };
  monitor?: {
    poll_interval_ms?: number;
    stall_threshold_ms?: number;
    timeout_multiplier?: number;
  };
  ui?: UIConfig;
  fallback?: FallbackConfig;
  workflow?: WorkflowConfig;
  hitl?: HITLConfig;
}

/**
 * Load configuration from .agent-shepherd/config.yaml
 */
export function loadConfig(configDir?: string): AgentShepherdConfig {
  const configPath = configDir
    ? join(configDir, ".agent-shepherd", "config.yaml")
    : getConfigPath("config.yaml");
  
  if (!existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = parseYAML(content) as AgentShepherdConfig;
    
    // Set defaults for missing values
    return {
      version: config.version || "1.0",
      worker: {
        poll_interval_ms: 30000,
        max_concurrent_runs: 3,
        ...config.worker
      },
      monitor: {
        poll_interval_ms: 10000,
        stall_threshold_ms: 60000,
        timeout_multiplier: 1.0,
        ...config.monitor
      },
      ui: {
        port: 3000,
        host: "localhost",
        ...config.ui
      },
      fallback: config.fallback ? {
        enabled: config.fallback.enabled ?? false,
        default_agent: config.fallback.default_agent,
        mappings: config.fallback.mappings
      } : undefined,
      workflow: {
        invalid_label_strategy: "error",
        ...config.workflow
      },
      hitl: config.hitl ? {
        allowed_reasons: {
          predefined: config.hitl.allowed_reasons?.predefined ?? ["approval", "manual-intervention", "timeout", "error", "review-request"],
          allow_custom: config.hitl.allowed_reasons?.allow_custom ?? true,
          custom_validation: config.hitl.allowed_reasons?.custom_validation ?? "alphanumeric-dash-underscore"
        }
      } : undefined
    };
  } catch (error) {
    throw new Error(
      `Failed to load configuration from ${configPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}