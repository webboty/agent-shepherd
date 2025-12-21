/**
 * Tests for Agent Registry
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { AgentRegistry } from '../src/core/agent-registry.ts';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('AgentRegistry', () => {
  let agentRegistry: AgentRegistry;
  let tempDir: string;
  let agentsPath: string;

  beforeEach(() => {
    tempDir = join(process.cwd(), 'temp-test');
    agentsPath = join(tempDir, 'agents.yaml');
    
    // Create temp directory
    mkdirSync(tempDir, { recursive: true });
    
    // Create test agents file
    const testAgents = `
version: "1.0"
agents:
  - id: default-coder
    name: "Default Coding Agent"
    description: "General-purpose coding agent"
    capabilities: [coding, refactoring, planning]
    provider_id: anthropic
    model_id: claude-3-5-sonnet-20241022
    priority: 10
    constraints:
      performance_tier: balanced
  
  - id: test-specialist
    name: "Testing Specialist"
    description: "Agent specialized in testing"
    capabilities: [testing, qa]
    provider_id: anthropic
    model_id: claude-3-5-sonnet-20241022
    priority: 15
    constraints:
      performance_tier: fast
  
  - id: architect-expert
    name: "Architect Expert"
    description: "High-level architecture specialist"
    capabilities: [architecture, planning, design]
    provider_id: anthropic
    model_id: claude-3-5-sonnet-20241022
    priority: 20
    constraints:
      performance_tier: thorough
      max_complexity: 8
      specialized_domains: [enterprise, scalability]
    `.trim();
    
    writeFileSync(agentsPath, testAgents);
    agentRegistry = new AgentRegistry(agentsPath);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Agent Loading', () => {
    it('should load agents from YAML file', () => {
      const agents = agentRegistry.getAllAgents();
      expect(agents).toHaveLength(3);
      
      const agentIds = agents.map(agent => agent.id);
      expect(agentIds).toContain('default-coder');
      expect(agentIds).toContain('test-specialist');
      expect(agentIds).toContain('architect-expert');
    });

    it('should get agent by ID', () => {
      const agent = agentRegistry.getAgent('default-coder');
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('Default Coding Agent');
      expect(agent?.capabilities).toEqual(['coding', 'refactoring', 'planning']);
      expect(agent?.priority).toBe(10);
    });

    it('should return null for non-existent agent', () => {
      const agent = agentRegistry.getAgent('non-existent');
      expect(agent).toBeNull();
    });
  });

  describe('Capability Matching', () => {
    it('should find agents matching single capability', () => {
      const agents = agentRegistry.findByCapabilities(['testing']);
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('test-specialist');
    });

    it('should find agents matching multiple capabilities', () => {
      const agents = agentRegistry.findByCapabilities(['coding', 'refactoring']);
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('default-coder');
    });

    it('should return empty array for no matches', () => {
      const agents = agentRegistry.findByCapabilities(['non-existent-capability']);
      expect(agents).toHaveLength(0);
    });
  });

  describe('Agent Selection', () => {
    it('should select best agent for capability', () => {
      const agent = agentRegistry.selectAgent({
        required_capabilities: ['coding']
      });
      expect(agent).toBeDefined();
      expect(agent?.id).toBe('default-coder');
    });

    it('should handle multiple capabilities with best match', () => {
      const agent = agentRegistry.selectAgent({
        required_capabilities: ['architecture', 'planning']
      });
      expect(agent).toBeDefined();
      expect(agent?.id).toBe('architect-expert'); // Higher priority
    });

    it('should return null for no matching agents', () => {
      const agent = agentRegistry.selectAgent({
        required_capabilities: ['non-existent']
      });
      expect(agent).toBeNull();
    });
  });

  describe('OpenCode Sync', () => {
    it('should have syncWithOpenCode method', async () => {
      // Test that the method exists and can be called
      // (Full integration test would require mocking OpenCode CLI)
      expect(typeof agentRegistry.syncWithOpenCode).toBe('function');

      // For now, we'll test the method signature and basic functionality
      // A full test would require mocking the Bun.spawn functionality
      const result = await agentRegistry.syncWithOpenCode();
      expect(result).toHaveProperty('added');
      expect(result).toHaveProperty('updated');
      expect(result).toHaveProperty('removed');
      expect(typeof result.added).toBe('number');
      expect(typeof result.updated).toBe('number');
      expect(typeof result.removed).toBe('number');
    });

    it('should handle agent names with hyphens and underscores', () => {
      const registry = agentRegistry as any;

      const output = `build (primary)
openspec-planner (primary)
test_agent (subagent)
complex-agent_name (primary)`;

      const agents = registry.parseOpenCodeAgentList(output);

      expect(agents).toHaveLength(4);
      expect(agents[1].id).toBe('openspec-planner');
      expect(agents[1].type).toBe('primary');
      expect(agents[2].id).toBe('test_agent');
      expect(agents[2].type).toBe('subagent');
      expect(agents[3].id).toBe('complex-agent_name');
      expect(agents[3].type).toBe('primary');
    });

    it('should parse OpenCode agent list format', () => {
      // Test the parsing logic by calling the private method
      // This is a bit of a hack but allows us to test the core parsing logic
      const registry = agentRegistry as any; // Cast to any to access private method

      const mockOutput = `build (primary)
explore (subagent)
general (subagent)
plan (primary)`;

      const agents = registry.parseOpenCodeAgentList(mockOutput);

      expect(agents).toHaveLength(4);

      // Check build agent
      const buildAgent = agents.find((a: any) => a.id === 'build');
      expect(buildAgent).toBeDefined();
      expect(buildAgent.type).toBe('primary');
      expect(buildAgent.config.metadata?.agent_type).toBe('primary');
      expect(buildAgent.config.capabilities).toEqual(['coding', 'refactoring', 'building']);

      // Check explore agent
      const exploreAgent = agents.find((a: any) => a.id === 'explore');
      expect(exploreAgent).toBeDefined();
      expect(exploreAgent.type).toBe('subagent');
      expect(exploreAgent.config.metadata?.agent_type).toBe('subagent');
      expect(exploreAgent.config.capabilities).toEqual(['exploration', 'analysis', 'discovery']);
    });

    it('should handle malformed agent list output', () => {
      const registry = agentRegistry as any;

      const malformedOutput = `invalid format
another invalid line
build (primary)`;

      const agents = registry.parseOpenCodeAgentList(malformedOutput);

      // Should only parse the valid line
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('build');
      expect(agents[0].type).toBe('primary');
    });

    it('should create agents with correct metadata', () => {
      const registry = agentRegistry as any;

      const config = registry.createAgentConfig('test-agent', 'subagent');

      expect(config.id).toBe('test-agent');
      expect(config.metadata?.agent_type).toBe('subagent');
      expect(config.capabilities).toEqual(['general']); // Default for unknown agent
      expect(config.priority).toBe(10);
      expect(config.constraints?.performance_tier).toBe('balanced');
    });
  });
});