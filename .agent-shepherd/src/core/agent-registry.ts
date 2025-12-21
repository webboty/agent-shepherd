/**
 * Agent Registry
 * Handles agent configuration, capability matching, and selection
 */

import { parse as parseYAML, stringify as stringifyYAML } from "yaml";
import { readFileSync, writeFileSync } from "fs";
import { getConfigPath } from "./path-utils";

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  capabilities: string[];
  provider_id?: string;  // Optional - uses OpenCode agent default if not specified
  model_id?: string;     // Optional - uses OpenCode agent default if not specified
  priority?: number;
  active?: boolean;      // Optional - defaults to true, controls automation usage
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
    this.configPath = configPath || getConfigPath("agents.yaml");

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
    // provider_id and model_id are now optional - will use OpenCode defaults if not specified
    // active field is optional and defaults to true
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
  findByCapabilities(capabilities: string[], includeInactive = false): AgentConfig[] {
    let candidates = this.getAllAgents();
    if (!includeInactive) {
      candidates = candidates.filter(agent => agent.active !== false);
    }
    return candidates.filter((agent) =>
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
    let candidates = this.getAllAgents().filter(agent => agent.active !== false); // Only consider active agents

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
    providerID?: string;
    modelID?: string;
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
    const { spawn } = await import("bun");

    try {
      // Run opencode agent list
      const proc = spawn(["opencode", "agent", "list"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      let stdout = "";
      let stderr = "";

      // Collect stdout
      const stdoutReader = proc.stdout?.getReader();
      if (stdoutReader) {
        try {
          while (true) {
            const { done, value } = await stdoutReader.read();
            if (done) break;
            stdout += new TextDecoder().decode(value);
          }
        } finally {
          stdoutReader.releaseLock();
        }
      }

      // Collect stderr
      const stderrReader = proc.stderr?.getReader();
      if (stderrReader) {
        try {
          while (true) {
            const { done, value } = await stderrReader.read();
            if (done) break;
            stderr += new TextDecoder().decode(value);
          }
        } finally {
          stderrReader.releaseLock();
        }
      }

      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        console.error(`Failed to list OpenCode agents: ${stderr}`);
        return { added: 0, updated: 0, removed: 0 };
      }

      // Parse the output
      const availableAgents = this.parseOpenCodeAgentList(stdout);

      // Get current agents
      const currentAgents = this.getAllAgents();

      let added = 0;
      let updated = 0;
      let removed = 0;

      // Track which agents should remain
      const agentsToKeep = new Set<string>();

      // Process available agents
      for (const agentInfo of availableAgents) {
        agentsToKeep.add(agentInfo.id);

        const existingAgent = currentAgents.find(a => a.id === agentInfo.id);

        if (existingAgent) {
          // Check if needs update
          if (this.needsUpdate(existingAgent, agentInfo.config)) {
            this.updateAgent(agentInfo.config);
            updated++;
          }
        } else {
          // Add new agent
          this.addAgent(agentInfo.config);
          added++;
        }
      }

      // Remove agents that are no longer available
      for (const currentAgent of currentAgents) {
        if (!agentsToKeep.has(currentAgent.id)) {
          this.removeAgent(currentAgent.id);
          removed++;
        }
      }

      // Save the updated registry
      this.saveAgents();

      return { added, updated, removed };

    } catch (error) {
      console.error(`Error syncing with OpenCode: ${error}`);
      return { added: 0, updated: 0, removed: 0 };
    }
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

  /**
   * Parse OpenCode agent list output
   */
  private parseOpenCodeAgentList(output: string): Array<{id: string, type: string, config: AgentConfig}> {
    const lines = output.trim().split('\n');
    const agents: Array<{id: string, type: string, config: AgentConfig}> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Parse format: "agent-name (type)"
      const match = trimmed.match(/^([\w-]+)\s+\((\w+)\)$/);
      if (match) {
        const [, agentId, agentType] = match;
        const config = this.createAgentConfig(agentId, agentType);
        agents.push({ id: agentId, type: agentType, config });
      }
    }

    return agents;
  }

  /**
   * Create agent config from OpenCode agent info
   */
  private createAgentConfig(agentId: string, agentType: string): AgentConfig {
    // Map agent IDs to capabilities and settings
    const agentMappings: Record<string, Partial<AgentConfig>> = {
      'build': {
        name: 'Build Agent',
        description: 'Handles code building and compilation tasks',
        capabilities: ['coding', 'refactoring', 'building'],
        priority: 15,
        constraints: { performance_tier: 'balanced' }
      },
      'plan': {
        name: 'Planning Agent',
        description: 'Handles planning and architecture design',
        capabilities: ['planning', 'architecture', 'analysis'],
        priority: 12,
        constraints: { performance_tier: 'balanced' }
      },
      'explore': {
        name: 'Exploration Agent',
        description: 'Handles code exploration and analysis',
        capabilities: ['exploration', 'analysis', 'discovery'],
        priority: 8,
        constraints: { performance_tier: 'fast' }
      },
      'general': {
        name: 'General Agent',
        description: 'General purpose agent for various tasks',
        capabilities: ['coding', 'planning', 'analysis'],
        priority: 10,
        constraints: { performance_tier: 'balanced' }
      },
      'compaction': {
        name: 'Compaction Agent',
        description: 'Handles code compaction and optimization',
        capabilities: ['refactoring', 'optimization', 'compaction'],
        priority: 10,
        constraints: { performance_tier: 'balanced' }
      },
      'summary': {
        name: 'Summary Agent',
        description: 'Handles summarization and documentation',
        capabilities: ['documentation', 'summary', 'analysis'],
        priority: 8,
        constraints: { performance_tier: 'fast' }
      },
      'title': {
        name: 'Title Agent',
        description: 'Handles title generation and naming',
        capabilities: ['naming', 'documentation'],
        priority: 5,
        constraints: { performance_tier: 'fast' }
      }
    };

    const mapping = agentMappings[agentId] || {
      name: `${agentId.charAt(0).toUpperCase() + agentId.slice(1)} Agent`,
      description: `Agent for ${agentId} tasks`,
      capabilities: ['general'],
      priority: 10,
      constraints: { performance_tier: 'balanced' }
    };

    return {
      id: agentId,
      name: mapping.name!,
      description: mapping.description,
      capabilities: mapping.capabilities!,
      // provider_id and model_id are omitted - will use OpenCode agent defaults
      priority: mapping.priority!,
      active: true, // New agents are active by default
      constraints: mapping.constraints!,
      metadata: {
        agent_type: agentType // Store whether it's primary or subagent
      }
    };
  }

  /**
   * Check if an agent needs updating
   */
  private needsUpdate(existing: AgentConfig, updated: AgentConfig): boolean {
    // Check if capabilities changed
    if (existing.capabilities.length !== updated.capabilities.length) return true;
    if (!existing.capabilities.every(cap => updated.capabilities.includes(cap))) return true;

    // Check if priority changed
    if (existing.priority !== updated.priority) return true;

    // Check if metadata changed (including agent_type)
    // Note: We don't check for provider_id, model_id, or active changes during sync
    // as these are user-controlled and should not be overwritten
    const existingMetadata = existing.metadata || {};
    const updatedMetadata = updated.metadata || {};
    if (JSON.stringify(existingMetadata) !== JSON.stringify(updatedMetadata)) return true;

    return false;
  }

  /**
   * Add a new agent to the registry
   */
  private addAgent(agent: AgentConfig): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * Update an existing agent
   */
  private updateAgent(agent: AgentConfig): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * Remove an agent from the registry
   */
  private removeAgent(agentId: string): void {
    this.agents.delete(agentId);
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
