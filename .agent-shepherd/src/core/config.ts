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

export interface LoopPreventionConfig {
  enabled: boolean;
  max_visits_default: number;
  max_transitions_default: number;
  cycle_detection_enabled: boolean;
  cycle_detection_length: number;
  trigger_hitl: boolean;
}

export interface CleanupConfig {
  enabled: boolean;
  run_on_startup: boolean;
  archive_on_startup: boolean;
  delete_on_startup: boolean;
  schedule_interval_hours: number;
}

export interface RetentionPolicy {
  name: string;
  description?: string;
  enabled: boolean;
  age_days: number;
  max_runs: number;
  max_size_mb: number;
  archive_enabled: boolean;
  archive_after_days?: number;
  delete_after_days?: number;
  status_filter?: string[];
  phase_filter?: string[];
  keep_successful_runs?: boolean;
  keep_failed_runs?: boolean;
}

export interface RetentionConfig {
  enabled: boolean;
  policies: RetentionPolicy[];
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
  loop_prevention?: LoopPreventionConfig;
  cleanup?: CleanupConfig;
  retention?: RetentionConfig;
}

export interface RetentionConfig {
  enabled: boolean;
  policies: RetentionPolicy[];
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
  loop_prevention?: LoopPreventionConfig;
  retention?: RetentionConfig;
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
      } : undefined,
      loop_prevention: config.loop_prevention ? {
        enabled: config.loop_prevention.enabled ?? true,
        max_visits_default: config.loop_prevention.max_visits_default ?? 10,
        max_transitions_default: config.loop_prevention.max_transitions_default ?? 5,
        cycle_detection_enabled: config.loop_prevention.cycle_detection_enabled ?? true,
        cycle_detection_length: config.loop_prevention.cycle_detection_length ?? 3,
        trigger_hitl: config.loop_prevention.trigger_hitl ?? true
      } : {
        enabled: true,
        max_visits_default: 10,
        max_transitions_default: 5,
        cycle_detection_enabled: true,
        cycle_detection_length: 3,
        trigger_hitl: true
      },
      cleanup: config.cleanup ? {
        enabled: config.cleanup.enabled ?? true,
        run_on_startup: config.cleanup.run_on_startup ?? false,
        archive_on_startup: config.cleanup.archive_on_startup ?? false,
        delete_on_startup: config.cleanup.delete_on_startup ?? false,
        schedule_interval_hours: config.cleanup.schedule_interval_hours ?? 24,
      } : {
        enabled: true,
        run_on_startup: false,
        archive_on_startup: false,
        delete_on_startup: false,
        schedule_interval_hours: 24,
      },
      retention: config.retention ? {
        enabled: config.retention.enabled ?? true,
        policies: config.retention.policies ?? [],
      } : {
        enabled: true,
        policies: [],
      }
    };
  } catch (error) {
    throw new Error(
      `Failed to load configuration from ${configPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Load and validate retention configuration
 */
export function loadRetentionConfig(configDir?: string): RetentionConfig {
  const fullConfig = loadConfig(configDir);

  if (!fullConfig.retention) {
    throw new Error("Retention configuration not found");
  }

  const retention = fullConfig.retention;

  // Validate policies
  if (!retention.policies || !Array.isArray(retention.policies)) {
    throw new Error("Retention policies must be an array");
  }

  const policyNames = new Set<string>();

  for (const policy of retention.policies) {
    // Check unique policy names
    if (policyNames.has(policy.name)) {
      throw new Error(`Duplicate retention policy name: ${policy.name}`);
    }
    policyNames.add(policy.name);

    // Validate age_days
    if (!policy.age_days || policy.age_days <= 0) {
      throw new Error(
        `Policy '${policy.name}': age_days must be greater than 0`
      );
    }

    // Validate archive_after_days > age_days if specified
    if (
      policy.archive_after_days !== undefined &&
      policy.archive_after_days <= policy.age_days
    ) {
      throw new Error(
        `Policy '${policy.name}': archive_after_days must be greater than age_days`
      );
    }

    // Validate delete_after_days > archive_after_days if specified
    if (
      policy.delete_after_days !== undefined &&
      policy.archive_after_days !== undefined &&
      policy.delete_after_days <= policy.archive_after_days
    ) {
      throw new Error(
        `Policy '${policy.name}': delete_after_days must be greater than archive_after_days`
      );
    }

    // Validate delete_after_days > age_days if archive_after_days not specified
    if (
      policy.delete_after_days !== undefined &&
      policy.archive_after_days === undefined &&
      policy.delete_after_days <= policy.age_days
    ) {
      throw new Error(
        `Policy '${policy.name}': delete_after_days must be greater than age_days`
      );
    }

    // Validate max_runs
    if (policy.max_runs !== undefined && policy.max_runs < 0) {
      throw new Error(
        `Policy '${policy.name}': max_runs must be >= 0`
      );
    }

    // Validate max_size_mb
    if (policy.max_size_mb !== undefined && policy.max_size_mb < 0) {
      throw new Error(
        `Policy '${policy.name}': max_size_mb must be >= 0`
      );
    }
  }

  return retention;
}