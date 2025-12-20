/**
 * Agent Registry
 * Handles agent configuration, capability matching, and selection
 */

import { parse as parseYAML, stringify as stringifyYAML } from "yaml";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  capabilities: string[];
  provider_id: string;
  model_id: string;
  priority?: number;
  constraints?: {
    read_only?: boolean;
    max_file_size?: number;
    allowed_tags?: string[];
    performance_tier?: "fast" | "balanced" | "slow";
  };
  metadata?: {
    [key: string]: unknown;
  };
}

export interface AgentsFile {
  agents: AgentConfig[];
  version?: string;
}

export interface AgentSelectionCriteria {
  required_capabilities?: string[];
  tags?: string[];
  read_only?: boolean;
  performance_preference?: "fast" | "balanced" | "slow";
}

/**
 * Agent Registry for managing and selecting agents
 */
export class AgentRegistry {
  private agents: Map<string, AgentConfig>;
  private configPath: string;

  constructor(configPath?: string) {
    this.agents = new Map();
    this.configPath =
      configPath || join(process.cwd(), ".agent-shepherd", "agents.yaml");

    // Try to load agents if config exists
    try {
      this.loadAgents(this.configPath);
    } catch {
      // Config file doesn't exist yet, start with empty registry
    }
  }

  /**
   * Load agents from YAML file
   */
  loadAgents(filePath: string): void {
    try {
      const content = readFileSync(filePath, "utf-8");
      const config = parseYAML(content) as AgentsFile;

      if (!config.agents) {
        throw new Error("Invalid agents file: missing 'agents' key");
      }

      // Clear existing agents
      this.agents.clear();

      // Load all agents
      for (const agent of config.agents) {
        this.validateAgent(agent);
        this.agents.set(agent.id, agent);
      }
    } catch (error) {
      throw new Error(
        `Failed to load agents from ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Save agents to YAML file
   */
  saveAgents(): void {
    const config: AgentsFile = {
      version: "1.0",
      agents: Array.from(this.agents.values()),
    };

    const yaml = stringifyYAML(config);
    writeFileSync(this.configPath, yaml, "utf-8");
  }

  /**
   * Validate agent configuration
   */
  private validateAgent(agent: AgentConfig): void {
    if (!agent.id) {
      throw new Error("Agent must have an ID");
    }
    if (!agent.name) {
      throw new Error(`Agent '${agent.id}' must have a name`);
    }
    if (!agent.capabilities || agent.capabilities.length === 0) {
      throw new Error(`Agent '${agent.id}' must have at least one capability`);
    }
    if (!agent.provider_id) {
      throw new Error(`Agent '${agent.id}' must have a provider_id`);
    }
    if (!agent.model_id) {
      throw new Error(`Agent '${agent.id}' must have a model_id`);
    }
  }

  /**
   * Register a new agent
   */
  registerAgent(agent: AgentConfig): void {
    this.validateAgent(agent);
    this.agents.set(agent.id, agent);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): AgentConfig | null {
    return this.agents.get(agentId) || null;
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get all agent IDs
   */
  getAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Find agents matching capabilities
   */
  findByCapabilities(capabilities: string[]): AgentConfig[] {
    return this.getAllAgents().filter((agent) =>
      capabilities.every((cap) => agent.capabilities.includes(cap))
    );
  }

  /**
   * Find agents matching tags
   */
  findByTags(tags: string[]): AgentConfig[] {
    return this.getAllAgents().filter((agent) => {
      const allowedTags = agent.constraints?.allowed_tags;
      if (!allowedTags) {
        return true; // No tag constraints, matches all
      }
      return tags.some((tag) => allowedTags.includes(tag));
    });
  }

  /**
   * Select best agent based on criteria
   */
  selectAgent(criteria: AgentSelectionCriteria): AgentConfig | null {
    let candidates = this.getAllAgents();

    // Filter by required capabilities
    if (criteria.required_capabilities) {
      candidates = candidates.filter((agent) =>
        criteria.required_capabilities!.every((cap) =>
          agent.capabilities.includes(cap)
        )
      );
    }

    // Filter by tags
    if (criteria.tags && criteria.tags.length > 0) {
      candidates = candidates.filter((agent) => {
        const allowedTags = agent.constraints?.allowed_tags;
        if (!allowedTags) {
          return true; // No constraints
        }
        return criteria.tags!.some((tag) => allowedTags.includes(tag));
      });
    }

    // Filter by read-only constraint
    if (criteria.read_only) {
      candidates = candidates.filter(
        (agent) => !agent.constraints?.read_only === false
      );
    }

    // Filter by performance preference
    if (criteria.performance_preference) {
      candidates = candidates.filter(
        (agent) =>
          agent.constraints?.performance_tier ===
            criteria.performance_preference ||
          !agent.constraints?.performance_tier
      );
    }

    // If no candidates, return null
    if (candidates.length === 0) {
      return null;
    }

    // Sort by priority (higher is better)
    candidates.sort((a, b) => {
      const priorityA = a.priority || 0;
      const priorityB = b.priority || 0;
      return priorityB - priorityA;
    });

    // Return highest priority agent
    return candidates[0];
  }

  /**
   * Get agent model configuration for OpenCode
   */
  getModelConfig(agentId: string): {
    providerID: string;
    modelID: string;
    agent?: string;
  } | null {
    const agent = this.getAgent(agentId);
    if (!agent) {
      return null;
    }

    return {
      providerID: agent.provider_id,
      modelID: agent.model_id,
      agent: agent.id,
    };
  }

  /**
   * Sync registry with OpenCode agents
   * This would typically call OpenCode API to get available agents
   */
  async syncWithOpenCode(): Promise<{
    added: number;
    updated: number;
    removed: number;
  }> {
    // Placeholder for OpenCode sync logic
    // In a real implementation, this would:
    // 1. Query OpenCode for available agents
    // 2. Compare with current registry
    // 3. Add new agents, update existing ones, mark removed ones
    // 4. Save the updated registry

    return {
      added: 0,
      updated: 0,
      removed: 0,
    };
  }

  /**
   * Check if an agent has a specific capability
   */
  hasCapability(agentId: string, capability: string): boolean {
    const agent = this.getAgent(agentId);
    if (!agent) {
      return false;
    }
    return agent.capabilities.includes(capability);
  }

  /**
   * Get agents with a specific capability
   */
  getAgentsByCapability(capability: string): AgentConfig[] {
    return this.getAllAgents().filter((agent) =>
      agent.capabilities.includes(capability)
    );
  }

  /**
   * Get agent performance tier
   */
  getPerformanceTier(
    agentId: string
  ): "fast" | "balanced" | "slow" | undefined {
    const agent = this.getAgent(agentId);
    return agent?.constraints?.performance_tier;
  }
}

/**
 * Create a singleton Agent Registry instance
 */
let defaultAgentRegistry: AgentRegistry | null = null;

export function getAgentRegistry(configPath?: string): AgentRegistry {
  if (!defaultAgentRegistry) {
    defaultAgentRegistry = new AgentRegistry(configPath);
  }
  return defaultAgentRegistry;
}
