#!/usr/bin/env bun
/**
 * Agent Shepherd CLI
 * Main entry point for all commands
 */

import { getWorkerEngine } from "../core/worker-engine.ts";
import { getMonitorEngine } from "../core/monitor-engine.ts";
import { getIssue } from "../core/beads.ts";
import { findAgentShepherdDir } from "../core/path-utils.ts";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const COMMANDS = {
  worker: "Start the autonomous worker loop",
  monitor: "Start the supervision loop",
  work: "Manually process a specific issue",
  init: "Initialize .agent-shepherd configuration",
  install: "Check and install dependencies",
  "sync-agents": "Sync agent registry with OpenCode",
  ui: "Start the flow visualization server",
  help: "Show help information",
};

/**
 * Display help information
 */
function showHelp(): void {
  console.log(`
Agent Shepherd - AI Coding Agent Orchestration System

Usage: ashep <command> [options]

Commands:
${Object.entries(COMMANDS)
  .map(([cmd, desc]) => `  ${cmd.padEnd(15)} ${desc}`)
  .join("\n")}

Examples:
  ashep init                # Initialize configuration
  ashep worker              # Start autonomous worker
  ashep work ISSUE-123      # Process specific issue
  ashep ui                  # Start visualization UI

For detailed documentation, see: README.md
Configuration guide: docs/cli-reference.md
`);
}

/**
 * Worker command - start autonomous processing
 */
async function cmdWorker(): Promise<void> {
  console.log("Starting Agent Shepherd Worker...");

  // Validate configuration first
  const { validateStartup } = await import("../core/config-validator.ts");
  await validateStartup();

  const worker = getWorkerEngine();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nStopping worker...");
    worker.stop();
    process.exit(0);
  });

  await worker.start();
}

/**
 * Monitor command - start supervision loop
 */
async function cmdMonitor(): Promise<void> {
  console.log("Starting Agent Shepherd Monitor...");

  // Validate configuration first
  const { validateStartup } = await import("../core/config-validator.ts");
  await validateStartup();

  const monitor = getMonitorEngine();

  // Resume any interrupted runs
  await monitor.resumeInterruptedRuns();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nStopping monitor...");
    monitor.stop();
    process.exit(0);
  });

  await monitor.start();
}

/**
 * Work command - process specific issue
 */
async function cmdWork(issueId: string): Promise<void> {
  if (!issueId) {
    console.error("Error: Issue ID required");
    console.log("Usage: ashep work <issue-id>");
    process.exit(1);
  }

  console.log(`Processing issue: ${issueId}`);

  const issue = await getIssue(issueId);
  if (!issue) {
    console.error(`Error: Issue ${issueId} not found`);
    process.exit(1);
  }

  const worker = getWorkerEngine();
  const result = await worker.processIssue(issue);

  console.log("\nResult:");
  console.log(`  Success: ${result.success}`);
  console.log(`  Run ID: ${result.run_id}`);
  if (result.message) {
    console.log(`  Message: ${result.message}`);
  }
  if (result.next_phase) {
    console.log(`  Next Phase: ${result.next_phase}`);
  }
}

/**
 * Init command - create default configuration
 */
function cmdInit(): void {
  console.log("Initializing Agent Shepherd configuration...");

  let configDir: string;
  try {
    configDir = findAgentShepherdDir();
  } catch {
    // No existing .agent-shepherd found, create in current directory
    configDir = join(process.cwd(), ".agent-shepherd");
  }
  const configSubDir = join(configDir, "config");

  // Create directory if it doesn't exist
  if (!existsSync(configSubDir)) {
    mkdirSync(configSubDir, { recursive: true });
    console.log(`Created directory: ${configSubDir}`);
  }

  // Create default policies.yaml
  const policiesPath = join(configSubDir, "policies.yaml");
  if (!existsSync(policiesPath)) {
    const defaultPolicies = `policies:
  default:
    name: default
    description: Default workflow policy
    phases:
      - name: plan
        description: Planning and design phase
        capabilities:
          - planning
          - architecture
        timeout_multiplier: 1.0
      
      - name: implement
        description: Implementation phase
        capabilities:
          - coding
          - refactoring
        timeout_multiplier: 2.0
      
      - name: test
        description: Testing phase
        capabilities:
          - testing
          - qa
        timeout_multiplier: 1.5
      
      - name: review
        description: Code review phase
        capabilities:
          - review
          - documentation
        timeout_multiplier: 1.0
        require_approval: true
    
    retry:
      max_attempts: 3
      backoff_strategy: exponential
      initial_delay_ms: 5000
      max_delay_ms: 300000
    
    timeout_base_ms: 300000
    stall_threshold_ms: 60000
    require_hitl: false

default_policy: default
`;
    writeFileSync(policiesPath, defaultPolicies);
    console.log(`Created: ${policiesPath}`);
  } else {
    console.log(`Skipped (exists): ${policiesPath}`);
  }

  // Create default agents.yaml
  const agentsPath = join(configSubDir, "agents.yaml");
  if (!existsSync(agentsPath)) {
    const defaultAgents = `version: "1.0"
agents:
  - id: default-coder
    name: Default Coding Agent
    description: General-purpose coding agent
    capabilities:
      - coding
      - refactoring
      - planning
      - architecture
    provider_id: anthropic
    model_id: claude-3-5-sonnet-20241022
    priority: 10
    constraints:
      performance_tier: balanced
  
  - id: test-specialist
    name: Testing Specialist
    description: Agent specialized in testing
    capabilities:
      - testing
      - qa
    provider_id: anthropic
    model_id: claude-3-5-sonnet-20241022
    priority: 15
    constraints:
      performance_tier: fast
  
  - id: reviewer
    name: Code Reviewer
    description: Agent for code review and documentation
    capabilities:
      - review
      - documentation
    provider_id: anthropic
    model_id: claude-3-5-sonnet-20241022
    priority: 10
    constraints:
      performance_tier: balanced
`;
    writeFileSync(agentsPath, defaultAgents);
    console.log(`Created: ${agentsPath}`);
  } else {
    console.log(`Skipped (exists): ${agentsPath}`);
  }

  // Create default config.yaml
  const configPath = join(configSubDir, "config.yaml");
  if (!existsSync(configPath)) {
    const defaultConfig = `version: "1.0"

worker:
  poll_interval_ms: 30000
  max_concurrent_runs: 3

monitor:
  poll_interval_ms: 10000
  stall_threshold_ms: 60000
  timeout_multiplier: 1.0

ui:
  port: 3000
  host: localhost
`;
    writeFileSync(configPath, defaultConfig);
    console.log(`Created: ${configPath}`);
  } else {
    console.log(`Skipped (exists): ${configPath}`);
  }

  console.log("\nInitialization complete!");
  console.log("You can now run: ashep worker");
}

/**
 * Install command - check dependencies
 */
async function cmdInstall(): Promise<void> {
  console.log("Checking dependencies...\n");

  let allGood = true;

  // Check for bd (Beads)
  try {
    const proc = Bun.spawn(["bd", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    console.log("✓ Beads (bd) is installed");
  } catch {
    console.log("✗ Beads (bd) is NOT installed");
    console.log(
      "  Install from: https://github.com/steveyegge/beads"
    );
    allGood = false;
  }

  // Check for Bun
  console.log(`✓ Bun ${Bun.version} is installed`);

  // Check configuration
  try {
    findAgentShepherdDir();
    console.log("✓ Configuration directory exists");
  } catch {
    console.log("✗ Configuration directory NOT found");
    console.log("  Run: ashep init");
    allGood = false;
  }

  console.log();
  if (allGood) {
    console.log("All dependencies are installed!");
  } else {
    console.log("Some dependencies are missing. Please install them.");
    process.exit(1);
  }
}

/**
 * Sync agents command - update registry from OpenCode
 */
async function cmdSyncAgents(): Promise<void> {
  console.log("Syncing agents with OpenCode...");

  const { getAgentRegistry } = await import("../core/agent-registry.ts");
  const registry = getAgentRegistry();

  const result = await registry.syncWithOpenCode();

  console.log("\nSync complete:");
  console.log(`  Added: ${result.added}`);
  console.log(`  Updated: ${result.updated}`);
  console.log(`  Removed: ${result.removed}`);
}

/**
 * UI command - start visualization server
 */
async function cmdUI(port?: number, host?: string): Promise<void> {
  console.log("Starting Agent Shepherd UI...");

  try {
    // Validate and load configuration
    const { validateStartup } = await import("../core/config-validator.ts");
    await validateStartup();

    const { loadConfig } = await import("../core/config.ts");
    const config = loadConfig();

    const { UIServer } = await import("../ui/ui-server.ts");
    const uiServer = new UIServer({
      port: port || config.ui?.port || 3000,
      host: host || config.ui?.host || 'localhost'
    });

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\nStopping UI server...");
      uiServer.stop().then(() => {
        process.exit(0);
      });
    });

    await uiServer.start();
  } catch (error) {
    console.error("Failed to start UI server:", error);
    console.log("Make sure configuration is initialized: ashep init");
    process.exit(1);
  }
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "-h" || command === "--help") {
    showHelp();
    return;
  }

  switch (command) {
    case "worker":
      await cmdWorker();
      break;

    case "monitor":
      await cmdMonitor();
      break;

    case "work":
      await cmdWork(args[1]);
      break;

    case "init":
      cmdInit();
      break;

    case "install":
      await cmdInstall();
      break;

    case "sync-agents":
      await cmdSyncAgents();
      break;

    case "ui": {
      // Parse UI arguments: --port <number> --host <string>
      let port: number | undefined;
      let host: string | undefined;

      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--port' && i + 1 < args.length) {
          port = parseInt(args[i + 1], 10);
          i++; // skip the next arg
        } else if (args[i] === '--host' && i + 1 < args.length) {
          host = args[i + 1];
          i++; // skip the next arg
        }
      }

      await cmdUI(port, host);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log("Run 'ashep help' for usage information");
      process.exit(1);
  }
}

// Run CLI
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
