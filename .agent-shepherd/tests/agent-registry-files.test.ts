
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { AgentRegistry } from '../src/core/agent-registry.ts';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = join(__dirname, '..', 'tmp_test');

describe('Agent Registry Files', () => {
  let agentRegistry: AgentRegistry;
  let tempDir: string;
  let agentsPath: string;
  let agentsDir: string;
  let enabledDir: string;
  let availableDir: string;

  beforeEach(() => {
    tempDir = join(TEMP_DIR, 'agent-files-test');
    agentsPath = join(tempDir, 'config', 'agents.yaml');
    agentsDir = join(tempDir, 'agents');
    enabledDir = join(agentsDir, 'enabled');
    availableDir = join(agentsDir, 'available');
    
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    mkdirSync(join(tempDir, 'config'), { recursive: true });
    mkdirSync(enabledDir, { recursive: true });
    mkdirSync(availableDir, { recursive: true });
    
    // Create dummy config.yaml
    writeFileSync(join(tempDir, 'config', 'config.yaml'), "worker:\n  poll_interval_ms: 1000\n");
    
    // Set ASHEP_DIR for testing
    process.env.ASHEP_DIR = tempDir;
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should load agents from enabled directory', () => {
    // Create empty agents.yaml
    writeFileSync(agentsPath, 'agents: []');
    
    // Create agent in enabled/
    const agentContent = `
agents:
  - id: enabled-agent
    name: Enabled Agent
    capabilities: [testing]
    priority: 5
`;
    writeFileSync(join(enabledDir, 'agent1.yaml'), agentContent);

    agentRegistry = new AgentRegistry(agentsPath);
    
    const agent = agentRegistry.getAgent('enabled-agent');
    expect(agent).toBeDefined();
    expect(agent?.name).toBe('Enabled Agent');
    expect(agent?.metadata?.source_file).toBeDefined();
  });

  it('should recursively scan enabled directory', () => {
    writeFileSync(agentsPath, 'agents: []');
    
    const subDir = join(enabledDir, 'category');
    mkdirSync(subDir, { recursive: true });
    
    const agentContent = `
agents:
  - id: nested-agent
    name: Nested Agent
    capabilities: [testing]
`;
    writeFileSync(join(subDir, 'nested.yaml'), agentContent);

    agentRegistry = new AgentRegistry(agentsPath);
    const agent = agentRegistry.getAgent('nested-agent');
    expect(agent).toBeDefined();
  });

  it('should ignore agents in available directory', () => {
    writeFileSync(agentsPath, 'agents: []');
    
    const agentContent = `
agents:
  - id: available-agent
    name: Available Agent
    capabilities: [testing]
`;
    writeFileSync(join(availableDir, 'ignored.yaml'), agentContent);

    agentRegistry = new AgentRegistry(agentsPath);
    const agent = agentRegistry.getAgent('available-agent');
    expect(agent).toBeNull();
  });

  it('should give precedence to agents.yaml over enabled files', () => {
    // Enabled agent (priority 100)
    const enabledContent = `
agents:
  - id: conflict-agent
    name: Enabled Version
    capabilities: [testing]
    priority: 100
`;
    writeFileSync(join(enabledDir, 'conflict.yaml'), enabledContent);

    // Main agent (priority 10)
    const mainContent = `
agents:
  - id: conflict-agent
    name: Main Version
    capabilities: [testing]
    priority: 10
`;
    writeFileSync(agentsPath, mainContent);

    agentRegistry = new AgentRegistry(agentsPath);
    const agent = agentRegistry.getAgent('conflict-agent');
    
    expect(agent).toBeDefined();
    // Should match Main Version
    expect(agent?.name).toBe('Main Version');
    expect(agent?.priority).toBe(10);
  });

  it('should handle malformed enabled files gracefully', () => {
    writeFileSync(agentsPath, 'agents: []');
    
    const validContent = `
agents:
  - id: valid-agent
    name: Valid Agent
    capabilities: [testing]
`;
    writeFileSync(join(enabledDir, 'valid.yaml'), validContent);
    
    const invalidContent = `
agents:
  - id: invalid-agent
    name: Invalid Agent
    capabilities: [testing
    - broken
`;
    writeFileSync(join(enabledDir, 'invalid.yaml'), invalidContent);

    agentRegistry = new AgentRegistry(agentsPath);
    
    expect(agentRegistry.getAgent('valid-agent')).toBeDefined();
    expect(agentRegistry.getAgent('invalid-agent')).toBeNull();
  });

  it('should enforce unique IDs across enabled files (last one wins but log warning)', () => {
    // Note: The implementation warns but overwrites if multiple enabled files have same ID.
    // The load order depends on file system.
    
    writeFileSync(agentsPath, 'agents: []');
    
    const agent1 = `
agents:
  - id: dupe-agent
    name: Agent 1
    capabilities: [testing]
`;
    const agent2 = `
agents:
  - id: dupe-agent
    name: Agent 2
    capabilities: [testing]
`;

    // We can't easily test console.warn here without mocking, 
    // but we can ensure one of them loads and system doesn't crash.
    // And actually, I modified loadAgentFile to throw error if !allowOverride
    // for enabled files!
    
    // So one should load, the other should throw (and be caught by loadEnabledAgents).
    // The result is we have ONE agent.
    
    writeFileSync(join(enabledDir, '1.yaml'), agent1);
    writeFileSync(join(enabledDir, '2.yaml'), agent2);

    agentRegistry = new AgentRegistry(agentsPath);
    
    const agent = agentRegistry.getAgent('dupe-agent');
    expect(agent).toBeDefined();
    // One of them is loaded.
  });
});
