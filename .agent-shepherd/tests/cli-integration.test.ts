/**
 * Integration Tests for CLI Commands
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getLogger, Logger } from '../src/core/logging.ts';
import { OpenCodeClient } from '../src/core/opencode.ts';

// Run CLI command by spawning the built binary
async function runCLICommand(command: string, args: string[] = [], cwd?: string, stdinInput?: string): Promise<string[]> {
  const cliPath = join(__dirname, '..', 'bin', 'ashep');
  const proc = spawn(cliPath, [command, ...args], {
    cwd: cwd || (cliClient?.directory ?? process.cwd()),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test' }
  });

  if (stdinInput) {
    proc.stdin?.write(stdinInput);
    proc.stdin?.end();
  }

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
  let testDataDir: string;
  let configDir: string;
  let logger: ReturnType<typeof getLogger>;
  let cliClient: OpenCodeClient;

  beforeEach(async () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testDataDir = join(process.cwd(), '.agent-shepherd', `temp-cli-test-${timestamp}-${random}`);
    configDir = join(testDataDir, '.agent-shepherd');

    mkdirSync(configDir, { recursive: true });

    const testConfig = `
version: "1.0"
worker:
  poll_interval_ms: 1000
  max_concurrent_runs: 1
    `.trim();

    writeFileSync(join(configDir, 'config.yaml'), testConfig);

    logger = getLogger(configDir);
    cliClient = new OpenCodeClient({ directory: testDataDir });

    await new Promise(resolve => setTimeout(resolve, 50));

    logger.createRun({
        id: 'run-cli-test-001',
        issue_id: 'TEST-001',
        session_id: 'session-plan-abc123',
        agent_id: 'test-agent',
        policy_name: 'test-policy',
        phase: 'plan',
        status: 'completed',
        outcome: {
          success: true,
          message: 'Plan completed',
          metrics: { tokens_used: 5000 }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      logger.createRun({
        id: 'run-cli-test-002',
        issue_id: 'TEST-001',
        session_id: 'session-implement-def456',
        agent_id: 'test-agent',
        policy_name: 'test-policy',
        phase: 'implement',
        status: 'completed',
        outcome: {
          success: true,
          message: 'Implementation completed',
          metrics: { tokens_used: 15000 }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      logger.createRun({
        id: 'run-cli-test-003',
        issue_id: 'TEST-001',
        session_id: 'session-test-xyz789',
        agent_id: 'test-agent',
        policy_name: 'test-policy',
        phase: 'test',
        status: 'completed',
        outcome: {
          success: true,
          message: 'Tests passed',
          metrics: { tokens_used: 8000 }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(() => {
    try {
      if (logger) {
        (logger as any).close();
      }
    } catch (e) {
    }
    rmSync(testDataDir, { recursive: true, force: true });
  });

  describe('Help Command', () => {
    it('should display help information', async () => {
      const outputs = await runCLICommand('--help');
      const output = outputs.join(' ');

      expect(output).toContain('Agent Shepherd');
      expect(output).toContain('Usage: ashep');
    });
  });

  describe('Init Command', () => {
    it('should skip existing files', async () => {
      const outputs = await runCLICommand('init');
      const output = outputs.join(' ');

      expect(output).toContain('Skipped (exists)');
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
    it('should display sessions for an issue', async () => {
      const outputs = await runCLICommand('list-sessions', ['TEST-001'], configDir);
      const output = outputs.join(' ');

      expect(output).toContain('Sessions for issue TEST-001');
      expect(output).toContain('session-plan-abc');
      expect(output).toContain('session-implement-def');
      expect(output).toContain('session-test-xyz');
    });

    it('should display no sessions message when none exist', async () => {
      const outputs = await runCLICommand('list-sessions', ['NONEXISTENT-12345'], configDir);
      const output = outputs.join(' ');

      expect(output).toContain('No sessions found for issue NONEXISTENT-12345');
    });

    it('should show table header when sessions exist', async () => {
      const outputs = await runCLICommand('list-sessions', ['TEST-001'], configDir);
      const output = outputs.join(' ');

      expect(output).toContain('Session ID');
      expect(output).toContain('Phase');
      expect(output).toContain('Tokens');
    });

    it('should handle sessions with various token counts', async () => {
      const outputs = await runCLICommand('list-sessions', ['TEST-001'], configDir);
      const output = outputs.join(' ');

      expect(output).toContain('5000');
      expect(output).toContain('15000');
      expect(output).toContain('8000');
    });

    it('should handle sessions with long session IDs', async () => {
      const outputs = await runCLICommand('list-sessions', ['TEST-001'], configDir);
      const output = outputs.join(' ');

      expect(output).toContain('session-plan-abc123');
      expect(output).toContain('session-implement-def456');
      expect(output).toContain('session-test-xyz789');
    });

    it('should display sessions in creation order', async () => {
      const outputs = await runCLICommand('list-sessions', ['TEST-001'], configDir);
      const output = outputs.join(' ');

      const sessionPlanPos = output.indexOf('session-plan-abc');
      const sessionImplPos = output.indexOf('session-implement-def');
      const sessionTestPos = output.indexOf('session-test-xyz');

      expect(sessionPlanPos).toBeLessThan(sessionImplPos);
      expect(sessionImplPos).toBeLessThan(sessionTestPos);
    });

    it('should show error when issue ID is missing', async () => {
      const outputs = await runCLICommand('list-sessions', [], configDir, '\n');
      const output = outputs.join(' ');

      const hasError = output.includes('Error: Issue ID required') || output.toLowerCase().includes('error');
      expect(hasError).toBe(true);
    });

    it('should handle special characters in issue IDs', async () => {
      const outputs = await runCLICommand('list-sessions', ['TEST-ABC-123'], configDir);
      const output = outputs.join(' ');

      expect(output).toContain('No sessions found for issue TEST-ABC-123');
    });

    it('should format session table correctly', async () => {
      const outputs = await runCLICommand('list-sessions', ['TEST-001'], configDir);
      const output = outputs.join(' ');

      expect(output).toContain('Sessions for issue TEST-001');
      expect(output).toContain('3)');
    });
  });
});
