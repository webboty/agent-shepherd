/**
 * Integration Tests for CLI Commands
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { Logger } from '../src/core/logging.ts';
import { OpenCodeClient } from '../src/core/opencode.ts';
import { setupBeadsIsolation, type BeadsTestEnv } from './helpers/beads-test-isolation.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = join(__dirname, '..', 'tmp_test');

// Run CLI command by spawning the built binary
async function runCLICommand(command: string, args: string[] = [], testDir?: string, stdinInput?: string, beadsDir?: string): Promise<string[]> {
  const cliPath = join(__dirname, '..', 'bin', 'ashep');
  const workingDir = testDir || process.cwd();
  console.log(`DEBUG: Spawning CLI with ASHEP_DIR=${workingDir}, BEADS_DIR=${beadsDir}`);
  const proc = spawn(cliPath, [command, ...args], {
    cwd: workingDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { 
      ...process.env, 
      NODE_ENV: 'test', 
      ASHEP_DIR: workingDir,
      ...(beadsDir && { BEADS_DIR: beadsDir }),
      BD_NO_DAEMON: 'true',
      BD_SANDBOX: 'true'
    }
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
  let logger: Logger;

  beforeEach(async () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testDataDir = join(TEMP_DIR, `temp-cli-test-${timestamp}-${random}`);
    configDir = join(testDataDir, '.agent-shepherd');

    mkdirSync(configDir, { recursive: true });

    const testConfig = `
version: "1.0"
worker:
  poll_interval_ms: 1000
  max_concurrent_runs: 1
    `.trim();

    writeFileSync(join(configDir, 'config.yaml'), testConfig);

    logger = new Logger(configDir);

    console.log('Test configDir:', configDir);
    console.log('Test jsonlPath:', (logger as any).jsonlPath);
    console.log('CLI will run with cwd:', configDir);

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

    console.log('runs.jsonl exists after createRun:', existsSync((logger as any).jsonlPath));
    console.log('runs.db exists after createRun:', existsSync(join(configDir, 'runs.db')));
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
      // Create a temp directory with existing config files
      const skipTestDir = join(testDataDir, 'skip-test');
      const skipConfigDir = join(skipTestDir, '.agent-shepherd', 'config');
      mkdirSync(skipConfigDir, { recursive: true });

      // Create existing config files
      writeFileSync(join(skipConfigDir, 'config.yaml'), 'version: "1.0"');
      writeFileSync(join(skipConfigDir, 'policies.yaml'), 'policies: []');
      writeFileSync(join(skipConfigDir, 'agents.yaml'), 'agents: []');

      const outputs = await runCLICommand('init', [], skipTestDir);
      const output = outputs.join(' ');

      expect(output).toContain('Skipped (exists)');
    });
  });

  describe('Work Command', () => {
    it('should auto-pick issue when no ID provided', async () => {
      // Set up isolated Beads database with a ready issue
      const beadsEnv = setupBeadsIsolation();
      await beadsEnv.initialize();

      // Create a ready issue with ashep-managed label
      const testIssueId = await beadsEnv.createIssue(
        'Test ready issue for auto-pick',
        'task',
        ['ashep-managed']
      );

      try {
        // Create test directory structure
        const testDir = join(testDataDir, 'work-test');
        const configDir = join(testDir, '.agent-shepherd', 'config');
        mkdirSync(configDir, { recursive: true });

        // Create minimal config files
        const testConfig = `
version: "1.0"
worker:
  poll_interval_ms: 1000
  max_concurrent_runs: 1
        `.trim();
        writeFileSync(join(configDir, 'config.yaml'), testConfig);

        const testPolicies = `
policies:
  simple:
    name: simple
    description: Simple test policy
    phases:
      - name: implement
        description: Implement
        capabilities:
          - coding
    retry:
      max_attempts: 1
      backoff_strategy: exponential
      initial_delay_ms: 1000
      max_delay_ms: 5000
    timeout_base_ms: 30000
    stall_threshold_ms: 10000
    require_hitl: false
default_policy: simple
        `.trim();
        writeFileSync(join(configDir, 'policies.yaml'), testPolicies);

        const testAgents = `
version: "1.0"
agents:
  - id: test-agent
    name: Test Agent
    capabilities:
      - coding
    provider_id: test
    model_id: test-model
    priority: 10
    constraints:
      performance_tier: balanced
        `.trim();
        writeFileSync(join(configDir, 'agents.yaml'), testAgents);

        // Run CLI work command without arguments with isolated Beads database
        const outputs = await runCLICommand('work', [], testDir, undefined, beadsEnv.beadsDir);
        const output = outputs.join(' ');

        // Should show auto-pick message instead of error
        expect(output).toContain('Auto-picking next issue');
        expect(output).toContain('Picked issue:');
        expect(output).not.toContain('Error: Issue ID or Epic ID required');
      } finally {
        await beadsEnv.cleanup();
      }
    });

    it('should show message when no ready issues available', async () => {
      // Set up isolated Beads database with issues but none are ready
      const beadsEnv = setupBeadsIsolation();
      await beadsEnv.initialize();

      // Create issues but exclude them all
      await beadsEnv.createIssue('Excluded issue 1', 'task', ['ashep-excluded']);
      await beadsEnv.createIssue('Excluded issue 2', 'task', ['ashep-excluded']);

      try {
        // Create config for test
        const testDir = join(testDataDir, 'work-no-ready');
        const configDir = join(testDir, '.agent-shepherd', 'config');
        mkdirSync(configDir, { recursive: true });

        const testConfig = `
version: "1.0"
worker:
  poll_interval_ms: 1000
  max_concurrent_runs: 1
        `.trim();
        writeFileSync(join(configDir, 'config.yaml'), testConfig);

        const testPolicies = `
policies:
  simple:
    name: simple
    description: Simple test policy
    phases:
      - name: implement
        description: Implement
        capabilities:
          - coding
    retry:
      max_attempts: 1
      backoff_strategy: exponential
      initial_delay_ms: 1000
      max_delay_ms: 5000
    timeout_base_ms: 30000
    stall_threshold_ms: 10000
    require_hitl: false
default_policy: simple
        `.trim();
        writeFileSync(join(configDir, 'policies.yaml'), testPolicies);

        const testAgents = `
version: "1.0"
agents:
  - id: test-agent
    name: Test Agent
    capabilities:
      - coding
    provider_id: test
    model_id: test-model
    priority: 10
    constraints:
      performance_tier: balanced
        `.trim();
        writeFileSync(join(configDir, 'agents.yaml'), testAgents);

        // Run CLI work command without arguments with isolated Beads database
        const outputs = await runCLICommand('work', [], testDir, undefined, beadsEnv.beadsDir);
        const output = outputs.join(' ');

        // Should show helpful message when no ready issues
        expect(output).toContain('No ready issues found');
        expect(output).toContain('Use \'ashep list-ready\' to see available work');
      } finally {
        await beadsEnv.cleanup();
      }
    });

    it('should respect picker mode from config (simple)', async () => {
      // Set up isolated Beads database with multiple ready issues
      const beadsEnv = setupBeadsIsolation();
      await beadsEnv.initialize();

      // Create multiple ready issues
      await beadsEnv.createIssue('Low priority test issue', 'task', ['ashep-managed', 'ashep-excluded']);
      await beadsEnv.createIssue('High priority test issue', 'task', ['ashep-managed']);

      try {
        // Create config with simple picker mode
        const testDir = join(testDataDir, 'work-simple-mode');
        const configDir = join(testDir, '.agent-shepherd', 'config');
        mkdirSync(configDir, { recursive: true });

        const testConfig = `
version: "1.0"
worker:
  poll_interval_ms: 1000
  max_concurrent_runs: 1
  picking:
    mode: simple
        `.trim();
        writeFileSync(join(configDir, 'config.yaml'), testConfig);

        const testPolicies = `
policies:
  simple:
    name: simple
    description: Simple test policy
    phases:
      - name: implement
        description: Implement
        capabilities:
          - coding
    retry:
      max_attempts: 1
      backoff_strategy: exponential
      initial_delay_ms: 1000
      max_delay_ms: 5000
    timeout_base_ms: 30000
    stall_threshold_ms: 10000
    require_hitl: false
default_policy: simple
        `.trim();
        writeFileSync(join(configDir, 'policies.yaml'), testPolicies);

        const testAgents = `
version: "1.0"
agents:
  - id: test-agent
    name: Test Agent
    capabilities:
      - coding
    provider_id: test
    model_id: test-model
    priority: 10
    constraints:
      performance_tier: balanced
        `.trim();
        writeFileSync(join(configDir, 'agents.yaml'), testAgents);

        // Run CLI work command with isolated Beads database
        const outputs = await runCLICommand('work', [], testDir, undefined, beadsEnv.beadsDir);
        const output = outputs.join(' ');

        // Should show simple picker mode in output
        expect(output).toContain('Auto-picking next issue');
        expect(output).toContain('Picker mode: simple');
      } finally {
        await beadsEnv.cleanup();
      }
    });

    it('should respect picker mode from config (smart)', async () => {
      // Set up isolated Beads database
      const beadsEnv = setupBeadsIsolation();
      await beadsEnv.initialize();

      // Create ready issue
      await beadsEnv.createIssue('Test issue for smart picker', 'task', ['ashep-managed']);

      try {
        // Create config with smart picker mode
        const testDir = join(testDataDir, 'work-smart-mode');
        const configDir = join(testDir, '.agent-shepherd', 'config');
        mkdirSync(configDir, { recursive: true });

        const testConfig = `
version: "1.0"
worker:
  poll_interval_ms: 1000
  max_concurrent_runs: 1
  picking:
    mode: smart
        `.trim();
        writeFileSync(join(configDir, 'config.yaml'), testConfig);

        const testPolicies = `
policies:
  simple:
    name: simple
    description: Simple test policy
    phases:
      - name: implement
        description: Implement
        capabilities:
          - coding
    retry:
      max_attempts: 1
      backoff_strategy: exponential
      initial_delay_ms: 1000
      max_delay_ms: 5000
    timeout_base_ms: 30000
    stall_threshold_ms: 10000
    require_hitl: false
default_policy: simple
        `.trim();
        writeFileSync(join(configDir, 'policies.yaml'), testPolicies);

        const testAgents = `
version: "1.0"
agents:
  - id: test-agent
    name: Test Agent
    capabilities:
      - coding
    provider_id: test
    model_id: test-model
    priority: 10
    constraints:
      performance_tier: balanced
        `.trim();
        writeFileSync(join(configDir, 'agents.yaml'), testAgents);

        // Run CLI work command with isolated Beads database
        const outputs = await runCLICommand('work', [], testDir, undefined, beadsEnv.beadsDir);
        const output = outputs.join(' ');

        // Should show smart picker mode in output
        expect(output).toContain('Auto-picking next issue');
        expect(output).toContain('Picker mode: smart');
      } finally {
        await beadsEnv.cleanup();
      }
    });
  });

  describe('Workflow Commands', () => {
    it('should list, archive, activate and create workflows', async () => {
      // Setup
      const workflowsDir = join(configDir, 'workflows');
      const enabledDir = join(workflowsDir, 'enabled');
      const availableDir = join(workflowsDir, 'available');
      
      mkdirSync(enabledDir, { recursive: true });
      mkdirSync(availableDir, { recursive: true });
      
      // 1. Create Workflow
      const createOutputs = await runCLICommand('workflow', ['create', 'test-wf'], configDir);
      const createOutput = createOutputs.join(' ');
      expect(createOutput).toContain('Created workflow file');
      expect(existsSync(join(enabledDir, 'test-wf.yaml'))).toBe(true);
      
      // 2. List Workflows (verify enabled)
      const listOutputs1 = await runCLICommand('workflow', ['list'], configDir);
      const listOutput1 = listOutputs1.join(' ');
      expect(listOutput1).toContain('test-wf');
      expect(listOutput1).toContain('Enabled Workflows');
      
      // 3. Archive Workflow
      const archiveOutputs = await runCLICommand('workflow', ['archive', 'test-wf'], configDir);
      const archiveOutput = archiveOutputs.join(' ');
      expect(archiveOutput).toContain('Archived workflow');
      expect(existsSync(join(enabledDir, 'test-wf.yaml'))).toBe(false);
      expect(existsSync(join(availableDir, 'test-wf.yaml'))).toBe(true);
      
      // 4. List Workflows (verify archived)
      const listOutputs2 = await runCLICommand('workflow', ['list'], configDir);
      const listOutput2 = listOutputs2.join(' ');
      expect(listOutput2).toContain('test-wf');
      expect(listOutput2).toContain('Available Workflows');
      
      // 5. Activate Workflow
      const activateOutputs = await runCLICommand('workflow', ['activate', 'test-wf'], configDir);
      const activateOutput = activateOutputs.join(' ');
      expect(activateOutput).toContain('Activated workflow');
      expect(existsSync(join(enabledDir, 'test-wf.yaml'))).toBe(true);
      expect(existsSync(join(availableDir, 'test-wf.yaml'))).toBe(false);
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

  describe('Phase Messenger Commands', () => {
    it('should list and read messages', async () => {
      // Setup phase messenger db with a message
      const { PhaseMessenger } = await import('../src/core/phase-messenger.ts');
      // Create a temporary data dir for this test
      const pmDataDir = join(testDataDir, 'pm-test');
      const messenger = new PhaseMessenger(pmDataDir);
      
      const msg = messenger.sendMessage({
        issue_id: 'PM-TEST-001',
        from_phase: 'plan',
        to_phase: 'implement',
        message_type: 'context',
        content: 'This is a test message content that is long enough to verify reading',
        metadata: { key: 'value' }
      });
      
      // Close db connection to release lock for CLI
      (messenger as any).close();

      // Test list command (using aliases for now as they map to same handler)
      // Note: We need to pass the custom ASHEP_DIR to the CLI so it finds the DB
      // But the CLI uses hardcoded .agent-shepherd path relative to CWD or env var.
      // In this test setup, configDir is passed as ASHEP_DIR.
      // So we need to put the DB where the CLI expects it.
      
      // Re-setup in the standard location expected by CLI test setup
      // The CLI runs in configDir (which is .../.agent-shepherd)
      // The CLI initializes PhaseMessenger without args, so it uses CWD + .agent-shepherd
      // So it looks in .../.agent-shepherd/.agent-shepherd
      const cliDataDir = join(configDir, '.agent-shepherd');
      const standardMessenger = new PhaseMessenger(cliDataDir);
      
      const standardMsg = standardMessenger.sendMessage({
        issue_id: 'PM-TEST-001',
        from_phase: 'plan',
        to_phase: 'implement',
        message_type: 'context',
        content: 'Standard location test message',
        metadata: { foo: 'bar' }
      });
      (standardMessenger as any).close();

      // 1. Test phase-msg-list
      const listOutputs = await runCLICommand('phase-msg-list', ['PM-TEST-001'], configDir);
      const listOutput = listOutputs.join(' ');
      
      expect(listOutput).toContain('Messages (1)');
      expect(listOutput).toContain('Standard location test message');
      expect(listOutput).toContain('plan');
      expect(listOutput).toContain('implement');

      // 2. Test phase-msg-read
      const readOutputs = await runCLICommand('phase-msg-read', [standardMsg.id], configDir);
      const readOutput = readOutputs.join(' ');
      
      expect(readOutput).toContain('Message Details:');
      expect(readOutput).toContain(standardMsg.id);
      expect(readOutput).toContain('Standard location test message');
      expect(readOutput).toContain('Metadata:');
      expect(readOutput).toContain('"foo": "bar"');

      // 3. Test phase-msg-list --json
      const jsonListOutputs = await runCLICommand('phase-msg-list', ['PM-TEST-001', '--json'], configDir);
      const jsonListOutput = jsonListOutputs.join(' ');
      
      // Parse JSON output (robustly handle potential prefixes)
      try {
        const jsonStartIndex = jsonListOutput.indexOf('[');
        const cleanJson = jsonStartIndex >= 0 ? jsonListOutput.substring(jsonStartIndex) : jsonListOutput;
        const messages = JSON.parse(cleanJson);
        
        expect(Array.isArray(messages)).toBe(true);
        expect(messages).toHaveLength(1);
        expect(messages[0].issue_id).toBe('PM-TEST-001');
        expect(messages[0].content).toBe('Standard location test message');
      } catch (e) {
        throw new Error(`Failed to parse JSON output: ${jsonListOutput}`);
      }

      // 4. Test phase-msg-read --json
      const jsonReadOutputs = await runCLICommand('phase-msg-read', [standardMsg.id, '--json'], configDir);
      const jsonReadOutput = jsonReadOutputs.join(' ');
      
      try {
        const jsonStartIndex = jsonReadOutput.indexOf('{');
        const cleanJson = jsonStartIndex >= 0 ? jsonReadOutput.substring(jsonStartIndex) : jsonReadOutput;
        const message = JSON.parse(cleanJson);
        
        expect(message.id).toBe(standardMsg.id);
        expect(message.content).toBe('Standard location test message');
        expect(message.metadata.foo).toBe('bar');
      } catch (e) {
        throw new Error(`Failed to parse JSON output: ${jsonReadOutput}`);
      }
    });
  });
});
