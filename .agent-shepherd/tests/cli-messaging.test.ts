
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { Database } from 'bun:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = join(__dirname, '..', 'tmp_test');

// Helper to run CLI
async function runCLI(args: string[], cwd: string): Promise<{ stdout: string, stderr: string, code: number }> {
  const cliPath = join(__dirname, '..', 'bin', 'ashep');
  
  return new Promise((resolve) => {
    const proc = spawn(cliPath, args, {
      cwd,
      env: { 
        ...process.env, 
        ASHEP_DIR: cwd, // Point ASHEP_DIR to the test directory
        NODE_ENV: 'test',
        BD_NO_DAEMON: 'true',
        BD_SANDBOX: 'true'
      }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => stdout += d.toString());
    proc.stderr.on('data', (d) => stderr += d.toString());

    proc.on('close', (code) => {
      resolve({ stdout, stderr, code: code || 0 });
    });
  });
}

describe('CLI Messaging Integration', () => {
  let testDir: string;
  let ashepDir: string;

  beforeEach(() => {
    // Create isolated test environment
    const id = Math.random().toString(36).substring(7);
    testDir = join(TEMP_DIR, `msg-test-${id}`);
    ashepDir = join(testDir, '.agent-shepherd');
    
    mkdirSync(ashepDir, { recursive: true });
    // We don't need full config structure for messaging as it just needs the DB dir
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should send and receive messages via CLI', async () => {
    const issueId = 'MSG-TEST-01';
    
    // 1. Send a message
    const sendResult = await runCLI([
      'phase-msg-send', 
      issueId, 
      'plan', 
      'implement', 
      'context', 
      'This is a test message',
      '{"priority":"high"}'
    ], testDir); // Note: passing testDir, but CLI will use .agent-shepherd inside it due to ASHEP_DIR env

    expect(sendResult.code).toBe(0);
    expect(sendResult.stdout).toContain('Message sent successfully');
    expect(sendResult.stdout).toContain('ID: msg-');

    // 2. Verify database content directly (Core integration check)
    const dbPath = join(ashepDir, 'messages.db');
    expect(existsSync(dbPath)).toBe(true);
    
    const db = new Database(dbPath);
    const row = db.prepare('SELECT * FROM messages WHERE issue_id = ?').get(issueId) as any;
    expect(row).toBeDefined();
    expect(row.content).toBe('This is a test message');
    expect(row.read).toBe(0); // Should be unread
    db.close();

    // 3. Receive message (mark as read)
    const receiveResult = await runCLI([
      'phase-msg-receive',
      issueId,
      'implement'
    ], testDir);

    expect(receiveResult.code).toBe(0);
    expect(receiveResult.stdout).toContain('Received 1 messages');
    expect(receiveResult.stdout).toContain('This is a test message');
    
    // 4. Verify it is now read
    const db2 = new Database(dbPath);
    const row2 = db2.prepare('SELECT * FROM messages WHERE issue_id = ?').get(issueId) as any;
    expect(row2.read).toBe(1);
    db2.close();
  });

  it('should list messages with filters', async () => {
    const issueId = 'MSG-TEST-02';
    
    // Send two messages
    await runCLI(['phase-msg-send', issueId, 'plan', 'implement', 'context', 'Msg 1'], testDir);
    await runCLI(['phase-msg-send', issueId, 'implement', 'test', 'result', 'Msg 2'], testDir);

    // List all for issue
    const listAll = await runCLI(['phase-msg-list', issueId], testDir);
    expect(listAll.stdout).toContain('Msg 1');
    expect(listAll.stdout).toContain('Msg 2');

    // Filter by phase
    const listPhase = await runCLI(['phase-msg-list', issueId, '--phase', 'implement'], testDir);
    expect(listPhase.stdout).toContain('Msg 1'); // Sent TO implement
    expect(listPhase.stdout).not.toContain('Msg 2'); // Sent TO test
  });

  it('should support JSON output for machine parsing', async () => {
    const issueId = 'MSG-TEST-03';
    await runCLI(['phase-msg-send', issueId, 'plan', 'code', 'data', 'JSON Test'], testDir);

    const result = await runCLI(['phase-msg-list', issueId, '--json'], testDir);
    expect(result.code).toBe(0);
    
    const messages = JSON.parse(result.stdout);
    expect(Array.isArray(messages)).toBe(true);
    expect(messages[0].content).toBe('JSON Test');
    expect(messages[0].issue_id).toBe(issueId);
  });

  it('should cleanup messages', async () => {
    const issueId = 'MSG-TEST-04';
    await runCLI(['phase-msg-send', issueId, 'p1', 'p2', 'data', 'To be deleted'], testDir);

    const cleanup = await runCLI(['phase-msg-cleanup', issueId, 'test-cleanup'], testDir);
    expect(cleanup.stdout).toContain('Cleanup complete');
    expect(cleanup.stdout).toContain('Archived: 1');
    expect(cleanup.stdout).toContain('Deleted:  1');

    // Verify gone from DB
    const dbPath = join(ashepDir, 'messages.db');
    const db = new Database(dbPath);
    const count = db.prepare('SELECT COUNT(*) as c FROM messages WHERE issue_id = ?').get(issueId) as any;
    expect(count.c).toBe(0);
    db.close();
  });
});
