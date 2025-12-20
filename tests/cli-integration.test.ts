/**
 * Integration Tests for CLI Commands
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Simple CLI function test that imports CLI directly
async function runCLICommand(command: string, args: string[] = [], cwd?: string): Promise<string[]> {
  const originalProcessArgv = process.argv;
  const originalCwd = process.cwd();
  
  // Mock process arguments
  process.argv = ['bun', 'src/cli/index.ts', command, ...args];
  
  // Change to test directory if provided
  if (cwd) {
    process.chdir(cwd);
  }
  
  // Capture console output
  const outputs: string[] = [];
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalProcessExit = process.exit;
  
  let exitCode = 0;
  console.log = (...args: any[]) => outputs.push(args.join(' '));
  console.error = (...args: any[]) => outputs.push(args.join(' '));
  process.exit = (code?: number) => {
    exitCode = code || 0;
    throw new Error(`Exit with code ${exitCode}`);
  };
  
  try {
    await import('../src/cli/index.ts');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Exit with code')) {
      // Expected exit
    } else {
      throw error;
    }
  }
  
  return outputs;
}

describe('CLI Integration Tests', () => {
  let tempDir: string;
  let configDir: string;
  
  beforeEach(async () => {
    tempDir = join(process.cwd(), 'temp-integration-test');
    configDir = join(tempDir, '.agent-shepherd');
    
    // Create temp directory
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    
    // Create minimal config files
    writeFileSync(join(configDir, 'config.yaml'), `
version: "1.0"
worker:
  poll_interval_ms: 1000
  max_concurrent_runs: 1
ui:
  port: 3001
  host: localhost
    `.trim());

    writeFileSync(join(configDir, 'policies.yaml'), `
policies:
  default:
    name: "Default Policy"
    phases:
      - name: test
        capabilities: [test]
default_policy: default
    `.trim());

    writeFileSync(join(configDir, 'agents.yaml'), `
version: "1.0"
agents:
  - id: test-agent
    name: "Test Agent"
    capabilities: [test]
    provider_id: test
    model_id: test-model
    priority: 10
    `.trim());
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Help Command', () => {
    it('should display help information', async () => {
      const outputs = await runCLICommand('--help');
      const output = outputs.join(' ');
      
      expect(output).toContain('Agent Shepherd');
      expect(output).toContain('Usage: ashep');
      expect(output).toContain('worker');
      expect(output).toContain('monitor');
      expect(output).toContain('ui');
    });

    it('should display help with -h flag', async () => {
      const outputs = await runCLICommand('-h');
      const output = outputs.join(' ');
      
      expect(output).toContain('Agent Shepherd');
    });
  });

  describe('Init Command', () => {
    it('should create configuration directory', async () => {
      const newTempDir = join(process.cwd(), 'temp-init-test');
      mkdirSync(newTempDir, { recursive: true });
      
      const outputs = await runCLICommand('init', [], newTempDir);
      const output = outputs.join(' ');
      
      expect(output).toContain('Initializing Agent Shepherd');
      expect(output).toContain('complete');
      
      // Check if config files were created
      const newConfigDir = join(newTempDir, '.agent-shepherd');
      expect(existsSync(join(newConfigDir, 'config.yaml'))).toBe(true);
      expect(existsSync(join(newConfigDir, 'policies.yaml'))).toBe(true);
      expect(existsSync(join(newConfigDir, 'agents.yaml'))).toBe(true);
      
      rmSync(newTempDir, { recursive: true, force: true });
    });

    it('should skip existing files', async () => {
      const outputs = await runCLICommand('init');
      const output = outputs.join(' ');
      
      expect(output).toContain('Skipped (exists)');
    });
  });

  describe('Install Command', () => {
    it('should check dependencies', async () => {
      const outputs = await runCLICommand('install');
      const output = outputs.join(' ');
      
      expect(output).toContain('Checking dependencies');
      expect(output).toContain('Bun');
    });

    it('should suggest installing missing dependencies', async () => {
      // Mock missing .agent-shepherd directory
      rmSync(configDir, { recursive: true });
      
      const outputs = await runCLICommand('install');
      const output = outputs.join(' ');
      
      expect(output).toContain('Configuration directory NOT found');
      
      // Restore
      mkdirSync(configDir, { recursive: true });
    });
  });

  describe('Work Command', () => {
    it('should require issue ID', async () => {
      const outputs = await runCLICommand('work');
      const output = outputs.join(' ');
      
      expect(output).toContain('Issue ID required');
    });
  });

  describe('Invalid Command', () => {
    it('should show error for unknown command', async () => {
      const outputs = await runCLICommand('unknown-command');
      const output = outputs.join(' ');
      
      expect(output).toContain('Unknown command: unknown-command');
      expect(output).toContain('Run \'ashep help\' for usage');
    });
  });
});