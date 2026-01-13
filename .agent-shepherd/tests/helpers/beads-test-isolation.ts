/**
 * Beads Test Isolation Helper
 *
 * Provides utilities to run tests with isolated Beads databases,
 * preventing test runs from polluting production issue tracker.
 *
 * Usage:
 *   import { setupBeadsIsolation, cleanupAllIsolatedTestDatabases } from './helpers/beads-test-isolation';
 *
 *   describe('My Beads Tests', () => {
 *     let beadsTestEnv: ReturnType<typeof setupBeadsIsolation>;
 *
 *     beforeEach(async () => {
 *       beadsTestEnv = setupBeadsIsolation();
 *       await beadsTestEnv.initialize();
 *     });
 *
 *     afterEach(async () => {
 *       await beadsTestEnv.cleanup();
 *     });
 *
 *     it('should create issues in isolated database', async () => {
 *       // Use beadsTestEnv.exec() instead of direct bd commands
 *       const output = await beadsTestEnv.exec(['create', '--type', 'task', '--title', 'Test issue']);
 *       // Issues are created in the isolated database
 *     });
 *   });
 */

import { mkdirSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMP_TEST_DIR = join(__dirname, '..', 'tmp_test', 'beads-isolation');

export interface BeadsTestEnv {
  tempDir: string;
  beadsDir: string;

  /**
   * Execute a bd command in isolated database
   */
  exec(args: string[]): Promise<string>;

  /**
   * Initialize the isolated Beads database
   */
  initialize(): Promise<void>;

  /**
   * Clean up isolated database and temp directory
   */
  cleanup(): Promise<void>;

  /**
   * Create a test issue and return its ID
   */
  createIssue(title: string, issueType?: string, labels?: string[]): Promise<string>;

  /**
   * Delete a test issue by ID
   */
  deleteIssue(issueId: string): Promise<void>;
}

function isStealthModeAvailable(): boolean {
  return true;
}

export function setupBeadsIsolation(useRealBeads: boolean = false): BeadsTestEnv {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const tempDir = join(TEMP_TEST_DIR, `beads-test-${timestamp}-${random}`);
  const beadsDir = join(tempDir, '.beads');

  async function execBeadsCommand(args: string[]): Promise<string> {
    const proc = Bun.spawn(["bd", ...args], {
      cwd: tempDir,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        BEADS_DIR: beadsDir,
        PATH: process.env.PATH,
        BD_NO_DAEMON: "true",
        BD_SANDBOX: "true",
      },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const error = await new Response(proc.stderr).text();
      throw new Error(`Beads command failed: ${error}\nCommand: bd ${args.join(' ')}\nCWD: ${tempDir}\nBEADS_DIR: ${beadsDir}`);
    }

    return output;
  }

  const env: BeadsTestEnv = {
    tempDir,
    beadsDir,

    async exec(args: string[]) {
      return execBeadsCommand(args);
    },

    async initialize() {
      mkdirSync(tempDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      const initArgs = ["init", "--prefix", "test-"];

      try {
        await execBeadsCommand(initArgs);
      } catch (error) {
        throw new Error(`Failed to initialize isolated Beads database: ${error}`);
      }
    },

    async cleanup() {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },

    async createIssue(title: string, issueType: string = "task", labels: string[] = []): Promise<string> {
      const args = ["create", "--type", issueType, "--title", title];

      for (const label of labels) {
        args.push("--labels", label);
      }

      const output = await execBeadsCommand(args);
      const issueId = output.match(/Created issue: ([^\s\n]+)/)?.[1];

      if (!issueId) {
        throw new Error(`Failed to create test issue: ${title}. Output: ${output}`);
      }

      return issueId;
    },

    async deleteIssue(issueId: string): Promise<void> {
      await execBeadsCommand(["delete", issueId]);
    },
  };

  return env;
}

export async function cleanupAllIsolatedTestDatabases(): Promise<void> {
  if (existsSync(TEMP_TEST_DIR)) {
    rmSync(TEMP_TEST_DIR, { recursive: true, force: true });
  }
}

export async function createIsolatedTestIssue(
  env: BeadsTestEnv,
  title: string,
  issueType: string = "task",
  labels: string[] = []
): Promise<string> {
  return env.createIssue(title, issueType, labels);
}

export async function cleanupTestIssues(
  env: BeadsTestEnv,
  prefix: string
): Promise<void> {
  try {
    const output = await env.exec(["list", "--json"]);
    const issues = JSON.parse(output);

    for (const issue of issues) {
      if (issue.title && issue.title.includes(prefix)) {
        await env.deleteIssue(issue.id);
      }
    }
  } catch (error) {
    console.warn(`Failed to cleanup test issues with prefix "${prefix}":`, error);
  }
}
