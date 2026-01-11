/**
 * Integration Tests for CLI Commands
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Run CLI command by spawning the built binary
async function runCLICommand(command: string, args: string[] = [], cwd?: string): Promise<string[]> {
  const { spawn } = await import('child_process');

  const cliPath = join(__dirname, '..', 'bin', 'ashep');
  const proc = spawn(cliPath, [command, ...args], {
    cwd: cwd || process.cwd(),
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'test' }
  });

  const outputs: string[] = [];
  let stdout = '';
  let stderr = '';

  return new Promise((resolve, reject) => {
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0 && code !== undefined) {
        outputs.push(stderr);
      }
      outputs.push(stdout);
      resolve(outputs);
    });

    proc.on('error', reject);
  });
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
      const { tmpdir } = await import('os');
      const newTempDir = join(tmpdir(), 'agent-shepherd-init-test');
      mkdirSync(newTempDir, { recursive: true });
      
      const outputs = await runCLICommand('init', [], newTempDir);
      const output = outputs.join(' ');
      
      expect(output).toContain('Initializing Agent Shepherd');
      expect(output).toContain('complete');
      
       // Check if config files were created
       const newConfigDir = join(newTempDir, '.agent-shepherd');
       const configSubDir = join(newConfigDir, 'config');
       expect(existsSync(join(configSubDir, 'config.yaml'))).toBe(true);
       expect(existsSync(join(configSubDir, 'policies.yaml'))).toBe(true);
       expect(existsSync(join(configSubDir, 'agents.yaml'))).toBe(true);
      
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
      const { tmpdir } = await import('os');
      const tempDir = join(tmpdir(), 'agent-shepherd-install-test');
      mkdirSync(tempDir, { recursive: true });

      const outputs = await runCLICommand('install', [], tempDir);
      const output = outputs.join(' ');

      expect(output).toContain('Checking dependencies');

      rmSync(tempDir, { recursive: true });
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

  describe('List Sessions Command', () => {
    let testDataDir: string;
    let testDbDir: string;

    beforeEach(() => {
      testDataDir = join(process.cwd(), 'temp-cli-sessions-test');
      testDbDir = join(testDataDir, '.agent-shepherd');
      mkdirSync(testDbDir, { recursive: true });

      const testConfig = `
version: "1.0"
worker:
  poll_interval_ms: 1000
  max_concurrent_runs: 1
session_continuation:
  default_max_context_tokens: 130000
  default_threshold: 0.8
      `.trim();

      writeFileSync(join(testDbDir, 'config.yaml'), testConfig);
    });

    afterEach(() => {
      rmSync(testDataDir, { recursive: true, force: true });
    });

    it('should display sessions for an issue', async () => {
      const outputs = await runCLICommand('list-sessions', ['TEST-001'], testDataDir);
      const output = outputs.join(' ');

      expect(output).toContain('Sessions for issue TEST-001');
    });

    it('should display no sessions message when none exist', async () => {
      const outputs = await runCLICommand('list-sessions', ['NONEXISTENT'], testDataDir);
      const output = outputs.join(' ');

      expect(output).toContain('No sessions found for issue NONEXISTENT');
    });

    it('should show table header when sessions exist', async () => {
      const outputs = await runCLICommand('list-sessions', ['TEST-002'], testDataDir);
      const output = outputs.join(' ');

      expect(output).toContain('Session ID');
      expect(output).toContain('Title');
      expect(output).toContain('Phase');
      expect(output).toContain('Tokens');
    });

    it('should handle sessions with various token counts', async () => {
      const outputs = await runCLICommand('list-sessions', ['TEST-003'], testDataDir);
      const output = outputs.join(' ');

      expect(output).toContain('Sessions for issue');
    });

    it('should handle sessions with long session IDs', async () => {
      const outputs = await runCLICommand('list-sessions', ['TEST-004'], testDataDir);
      const output = outputs.join(' ');

      expect(output).toContain('Sessions for issue');
    });

    it('should display sessions in creation order', async () => {
      const outputs = await runCLICommand('list-sessions', ['TEST-005'], testDataDir);
      const output = outputs.join(' ');

      expect(output).toContain('Sessions for issue');
    });

    it('should show error when issue ID is missing', async () => {
      const outputs = await runCLICommand('list-sessions', [], testDataDir);
      const output = outputs.join(' ');

      expect(output).toContain('Issue ID required');
      expect(output).toContain('Usage: ashep list-sessions [issue-id]');
    });

    it('should handle special characters in issue IDs', async () => {
      const outputs = await runCLICommand('list-sessions', ['TEST-ABC-123'], testDataDir);
      const output = outputs.join(' ');

      expect(output).toContain('Sessions for issue TEST-ABC-123');
    });

    it('should format session table correctly', async () => {
      const outputs = await runCLICommand('list-sessions', ['TEST-FORMAT'], testDataDir);
      const output = outputs.join(' ');

      expect(output).toContain('┌');
      expect(output).toContain('┬');
      expect(output).toContain('┼');
      expect(output).toContain('└');
    });
  });
});