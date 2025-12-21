/**
 * Tests for Agent Registry
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
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
});