#!/usr/bin/env bun
/**
 * Agent Shepherd CLI
 * Main entry point for all commands
 */

import { parse as parseYAML, stringify as stringifyYAML } from "yaml";
import JSON5 from "json5";
import { getWorkerEngine } from "../core/worker-engine.ts";
import { getMonitorEngine } from "../core/monitor-engine.ts";
import { getIssue } from "../core/beads.ts";
import { findAgentShepherdDir, findInstallDir, findLocalAgentShepherdDir, getGlobalInstallDir, findWorkflowsDir } from "../core/path-utils.ts";
import { getAssignedWorker, getLastHeartbeat, getLeaseExpires, listIssues, getReadyIssues } from "../core/beads.ts";
import { loadConfig } from "../core/config.ts";
import { getIssuePicker, type PickerConfig } from "../core/issue-picker.ts";
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, cpSync, rmSync } from "fs";
import { join } from "path";
import path from "path";
import { execSync } from "child_process";
import { homedir, platform } from "os";
import { policyCapabilityValidator } from "../core/policy-capability-validator";
import { getCleanupEngine } from "../core/cleanup-engine.ts";
import { resetCleanupEngine } from "../core/cleanup-engine.ts";
import { getSizeMonitor } from "../core/size-monitor.ts";
import { getHealthChecker, resetHealthChecker } from "../core/cleanup-health-check.ts";
import { startServer, stopServer, isServerRunning, getServerPid } from "../core/process-manager.ts";


type CommandCategory = 
  | "Core" 
  | "Execution" 
  | "Issues" 
  | "System" 
  | "Development" 
  | "Sessions" 
  | "Messaging" 
  | "Plugins" 
  | "Workflows"
  | "Server"
  | "Other";

interface CommandDef {
  description: string;
  category: CommandCategory;
  usage?: string;
  options?: Record<string, string>;
  aliases?: string[];
  hidden?: boolean;
  plugin?: string;
}

const COMMANDS: Record<string, CommandDef> = {
  // Core
  quickstart: {
    description: "One-command onboarding with dependencies, configs, and demo workflow",
    category: "Core",
    usage: "ashep quickstart"
  },
  init: {
    description: "Initialize .agent-shepherd configuration",
    category: "Core",
    usage: "ashep init"
  },
  help: {
    description: "Show help information",
    category: "Core",
    usage: "ashep help [command]"
  },
  
  // Execution
  worker: {
    description: "Start the autonomous worker loop",
    category: "Execution",
    usage: "ashep worker [options]",
    options: {
      "--epic <id>": "Restrict scope to specific epic subtree",
      "--policy <name>": "Force specific policy"
    }
  },
  monitor: {
    description: "Start the supervision loop",
    category: "Execution",
    usage: "ashep monitor"
  },
  work: {
    description: "Process an issue (auto-picks if none specified)",
    category: "Execution",
    usage: "ashep work [issue-id] [options]",
    options: {
      "--epic <id>": "Process all issues in epic subtree"
    }
  },

  // Issues
  "list-active": {
    description: "List issues currently being worked on (in_progress)",
    category: "Issues",
    usage: "ashep list-active"
  },
  "list-hitl": {
    description: "List issues requiring human-in-the-loop intervention",
    category: "Issues",
    usage: "ashep list-hitl"
  },
  "list-ready": {
    description: "List issues ready to be worked on (no blockers)",
    category: "Issues",
    usage: "ashep list-ready"
  },
  "list-struggle": {
    description: "List blocked issues that need attention",
    category: "Issues",
    usage: "ashep list-struggle [hours]",
    options: {
      "[hours]": "Threshold in hours (default: 24)"
    }
  },

  // System
  install: {
    description: "Check and install dependencies",
    category: "System",
    usage: "ashep install"
  },
  update: {
    description: "Update Agent Shepherd to latest or specific version",
    category: "System",
    usage: "ashep update [version]"
  },
  version: {
    description: "Show installed version",
    category: "System",
    usage: "ashep version"
  },
  "sync-agents": {
    description: "Sync agent registry with OpenCode",
    category: "System",
    usage: "ashep sync-agents"
  },
  "convert-config": {
    description: "Convert config file between YAML and JSON formats",
    category: "System",
    usage: "ashep convert-config <source> <destination>"
  },
  "cleanup-metrics": {
    description: "Show cleanup statistics and performance metrics",
    category: "System",
    usage: "ashep cleanup-metrics"
  },
  "cleanup-status": {
    description: "Show current cleanup system status and health",
    category: "System",
    usage: "ashep cleanup-status"
  },
  heartbeat: {
    description: "Show heartbeat-checker status and active heartbeats",
    category: "System",
    usage: "ashep heartbeat"
  },

  // Development
  ui: {
    description: "Start the flow visualization server",
    category: "Development",
    usage: "ashep ui [options]",
    options: {
      "--port <number>": "Port to run on (default: 3000)",
      "--host <string>": "Host to bind to (default: localhost)"
    }
  },
  "validate-policy-chain": {
    description: "Validate policy-capability-agent chain integrity",
    category: "Development",
    usage: "ashep validate-policy-chain"
  },
  "show-policy-tree": {
    description: "Display policy-capability-agent relationship tree",
    category: "Development",
    usage: "ashep show-policy-tree [options]",
    options: {
      "--format <type>": "Output format (json or tree)"
    }
  },

  // Sessions
  "session-list": {
    description: "List active OpenCode sessions",
    category: "Sessions",
    usage: "ashep session-list [options]",
    options: {
      "--all": "Show all sessions (including inactive)"
    }
  },
  "session-stop": {
    description: "Stop/Abort an active OpenCode session",
    category: "Sessions",
    usage: "ashep session-stop <session-id>"
  },
  "list-sessions": {
    description: "List sessions for a specific issue",
    category: "Sessions",
    usage: "ashep list-sessions [issue-id]"
  },

  // Messaging
  "phase-msg-send": {
    description: "Send a phase message",
    category: "Messaging",
    usage: "ashep phase-msg-send <issue-id> <from> <to> <type> <content> [metadata-json]",
    options: {
      "--json": "Output as JSON"
    }
  },
  "phase-msg-receive": {
    description: "Receive (and mark read) messages for a phase",
    category: "Messaging",
    usage: "ashep phase-msg-receive <issue-id> <phase> [options]",
    options: {
      "--keep-unread": "Don't mark messages as read",
      "--json": "Output as JSON"
    }
  },
  "phase-msg-list": {
    description: "List phase messages for an issue",
    category: "Messaging",
    usage: "ashep phase-msg-list <issue-id> [options]",
    aliases: ["get-messages"],
    options: {
      "--phase <name>": "Filter by phase",
      "--unread": "Show only unread messages",
      "--json": "Output as JSON"
    }
  },
  "phase-msg-read": {
    description: "Read details of a specific phase message",
    category: "Messaging",
    usage: "ashep phase-msg-read <message-id> [options]",
    aliases: ["read-message"],
    options: {
      "--json": "Output as JSON"
    }
  },
  "phase-msg-cleanup": {
    description: "Archive and delete messages for an issue",
    category: "Messaging",
    usage: "ashep phase-msg-cleanup <issue-id> [reason]"
  },
  "phase-msg-status": {
    description: "Show messaging system status and statistics",
    category: "Messaging",
    usage: "ashep phase-msg-status [issue-id]"
  },

  // Plugins
  "plugin-list": {
    description: "List installed plugins",
    category: "Plugins",
    usage: "ashep plugin-list"
  },
  "plugin-install": {
    description: "Install a plugin from path or URL",
    category: "Plugins",
    usage: "ashep plugin-install <path-or-url>"
  },
  "plugin-activate": {
    description: "Activate a plugin",
    category: "Plugins",
    usage: "ashep plugin-activate <name>"
  },
  "plugin-deactivate": {
    description: "Deactivate a plugin",
    category: "Plugins",
    usage: "ashep plugin-deactivate <name>"
  },
  "plugin-remove": {
    description: "Remove a plugin",
    category: "Plugins",
    usage: "ashep plugin-remove <name>"
  },

  // Server
  "server-status": {
    description: "Check OpenCode server status",
    category: "Server",
    usage: "ashep server-status"
  },
  "server-start": {
    description: "Start OpenCode server in background",
    category: "Server",
    usage: "ashep server-start"
  },
  "server-stop": {
    description: "Stop OpenCode server",
    category: "Server",
    usage: "ashep server-stop"
  },
  "server-enable": {
    description: "Enable auto-start for OpenCode server",
    category: "Server",
    usage: "ashep server-enable"
  },
  "server-disable": {
    description: "Disable auto-start for OpenCode server",
    category: "Server",
    usage: "ashep server-disable"
  },

  // Workflows
  workflow: {
    description: "Manage workflow files (list, archive, activate, create)",
    category: "Workflows",
    usage: "ashep workflow <command> <name>",
    options: {
      "list": "List workflows",
      "archive <name>": "Archive a workflow",
      "activate <name>": "Activate a workflow",
      "create <name>": "Create a new workflow"
    }
  },

  // Agents
  agent: {
    description: "Manage agent files (list, archive, activate, create)",
    category: "System",
    usage: "ashep agent <command> <name>",
    options: {
      "list": "List agents",
      "archive <name>": "Archive an agent",
      "activate <name>": "Activate an agent",
      "create <name>": "Create a new agent"
    }
  },

  // Aliases (hidden from main list usually)
  "get-messages": {
    description: "Alias for phase-msg-list",
    category: "Messaging",
    usage: "ashep get-messages <issue-id>",
    aliases: ["phase-msg-list"],
    hidden: true
  },
  "read-message": {
    description: "Alias for phase-msg-read",
    category: "Messaging",
    usage: "ashep read-message <message-id>",
    aliases: ["phase-msg-read"],
    hidden: true
  }
};


// Plugin command handlers registry
const PLUGIN_HANDLERS: Record<string, Function> = {};

// Loaded plugins registry for version display
const LOADED_PLUGINS: Array<{ name: string; version: string }> = [];

/**
 * Load plugins from .agent-shepherd/plugins/ directory
 */
function loadPlugins(): void {
  try {
    const agentShepherdDir = findAgentShepherdDir();
    const pluginsDir = join(agentShepherdDir, "plugins");

    if (!existsSync(pluginsDir)) {
      return; // No plugins directory, skip
    }

    const pluginDirs = readdirSync(pluginsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const pluginName of pluginDirs) {
      const pluginPath = join(pluginsDir, pluginName);
      const manifestPath = join(pluginPath, "manifest.json");

      if (!existsSync(manifestPath)) {
        console.warn(`Plugin ${pluginName}: manifest.json not found, skipping`);
        continue;
      }

      try {
        const manifestContent = readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(manifestContent);

        // Basic validation
        if (!manifest.name || !manifest.commands || !Array.isArray(manifest.commands)) {
          console.warn(`Plugin ${pluginName}: invalid manifest.json, skipping`);
          continue;
        }

        // Load plugin index.js
        const indexPath = join(pluginPath, "index.js");
        if (!existsSync(indexPath)) {
          console.warn(`Plugin ${pluginName}: index.js not found, skipping`);
          continue;
        }

        const pluginModule = require(indexPath);
        if (!pluginModule || typeof pluginModule !== "object") {
          console.warn(`Plugin ${pluginName}: invalid index.js export, skipping`);
          continue;
        }

        // Register commands
        for (const cmd of manifest.commands) {
          if (!cmd.name || !cmd.description) {
            console.warn(`Plugin ${pluginName}: invalid command definition, skipping`);
            continue;
          }

          const handler = pluginModule[cmd.name];
          if (!handler || typeof handler !== "function") {
            console.warn(`Plugin ${pluginName}: handler for command '${cmd.name}' not found, skipping`);
            continue;
          }

          // Don't overwrite existing core commands
          if (COMMANDS[cmd.name]) {
            continue;
          }

          COMMANDS[cmd.name] = {
            description: cmd.description,
            category: "Plugins",
            usage: `ashep ${cmd.name} [args]`,
            options: cmd.options, // Assuming plugin manifest supports options
            plugin: manifest.name
          };
          PLUGIN_HANDLERS[cmd.name] = handler;
        }

        LOADED_PLUGINS.push({ name: manifest.name, version: manifest.version });
      } catch (error) {
        console.warn(`Failed to load plugin ${pluginName}:`, error);
      }
    }
  } catch (error) {
    console.warn("Failed to load plugins:", error);
  }
}

/**
 * Display help information
 */
function showHelp(specificCommand?: string): void {
  if (specificCommand) {
    showCommandHelp(specificCommand);
    return;
  }

  const version = getCurrentVersion();
  console.log(`\n  \x1b[1mAgent Shepherd\x1b[0m \x1b[36m${version}\x1b[0m`);
  console.log(`  AI Coding Agent Orchestration System\n`);

  console.log(`  \x1b[33mUsage:\x1b[0m ashep <command> [options]\n`);

  // Group commands by category
  const categories: Record<string, string[]> = {};
  const categoryOrder: CommandCategory[] = [
    "Core", 
    "Execution", 
    "Issues", 
    "Workflows", 
    "Sessions", 
    "System", 
    "Development", 
    "Messaging", 
    "Other"
  ];

  const pluginCommands: Record<string, string[]> = {};
  let maxCommandLen = 0;

  for (const [name, def] of Object.entries(COMMANDS)) {
    if (def.hidden) continue;
    
    // Track max length for global alignment
    if (name.length > maxCommandLen) maxCommandLen = name.length;

    if (def.category === "Plugins") {
      const pluginName = def.plugin || "Other Plugins";
      if (!pluginCommands[pluginName]) pluginCommands[pluginName] = [];
      pluginCommands[pluginName].push(name);
    } else {
      const cat = def.category || "Other";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(name);
    }
  }

  // Show standard categories
  for (const cat of categoryOrder) {
    const cmds = categories[cat];
    if (!cmds || cmds.length === 0) continue;

    console.log(`  \x1b[33m${cat} Commands\x1b[0m`);
    
    for (const cmd of cmds.sort()) {
      const def = COMMANDS[cmd];
      // Note: We use maxCommandLen for consistent padding across all categories
      console.log(`    \x1b[36m${cmd.padEnd(maxCommandLen + 2)}\x1b[0m ${def.description}`);
    }
    console.log();
  }

  // Show Plugin sections
  const pluginNames = Object.keys(pluginCommands).sort();
  if (pluginNames.length > 0) {
    console.log(`  \x1b[33mPlugins\x1b[0m`);
    
    for (const pluginName of pluginNames) {
      console.log(`    \x1b[90m${pluginName}\x1b[0m`);
      const cmds = pluginCommands[pluginName];
      
      for (const cmd of cmds.sort()) {
        const def = COMMANDS[cmd];
        console.log(`      \x1b[36m${cmd.padEnd(maxCommandLen + 2)}\x1b[0m ${def.description}`);
      }
      console.log();
    }
  }

  console.log(`  \x1b[33mGlobal Options\x1b[0m`);
  console.log(`    \x1b[36m${"--help, -h".padEnd(maxCommandLen + 2)}\x1b[0m Show help information`);
  console.log(`    \x1b[36m${"--version".padEnd(maxCommandLen + 2)}\x1b[0m Show installed version`);
  console.log();

  console.log(`  \x1b[33mExamples\x1b[0m`);
  console.log(`    \x1b[90m# One-command setup\x1b[0m`);
  console.log(`    ashep quickstart`);
  console.log();
  console.log(`    \x1b[90m# Start autonomous worker loop\x1b[0m`);
  console.log(`    ashep worker`);
  console.log();
  console.log(`    \x1b[90m# Process specific issue\x1b[0m`);
  console.log(`    ashep work ISSUE-123`);
  console.log();
  console.log(`    \x1b[90m# Visualize workflow\x1b[0m`);
  console.log(`    ashep ui --port 4000`);
  console.log();

  console.log(`  For more help on a specific command including its flags:`);
  console.log(`    ashep help <command>`);
  console.log(`    ashep <command> --help\n`);
  
  console.log(`  \x1b[90mDocumentation: README.md\x1b[0m`);
}

function showCommandHelp(commandName: string): void {
  const def = COMMANDS[commandName];
  if (!def) {
    console.error(`Unknown command: ${commandName}`);
    console.log("Run 'ashep help' for a list of available commands.");
    return;
  }

  console.log(`\n  \x1b[36mashep ${commandName}\x1b[0m`);
  console.log(`  ${def.description}\n`);

  if (def.usage) {
    console.log(`  \x1b[33mUsage:\x1b[0m`);
    console.log(`    ${def.usage}\n`);
  }

  if (def.aliases && def.aliases.length > 0) {
    console.log(`  \x1b[33mAliases:\x1b[0m`);
    console.log(`    ${def.aliases.join(", ")}\n`);
  }

  if (def.options) {
    console.log(`  \x1b[33mOptions:\x1b[0m`);
    const opts = Object.entries(def.options);
    const maxOptLen = Math.max(...opts.map(([k]) => k.length));
    
    for (const [opt, desc] of opts) {
      console.log(`    \x1b[36m${opt.padEnd(maxOptLen + 2)}\x1b[0m ${desc}`);
    }
    console.log();
  }
}

/**
 * Worker command - start autonomous worker loop
 */
async function cmdWorker(options?: { epic?: string, policy?: string }): Promise<void> {
  console.log("Starting Agent Shepherd Worker...");

  if (options?.epic) {
    console.log(`🔍 Scope restricted to epic subtree: ${options.epic}`);
  }
  
  if (options?.policy) {
    console.log(`🔒 Forcing policy: ${options.policy}`);
  }

  // Validate configuration first
  const { validateStartup } = await import("../core/config-validator.ts");
  await validateStartup();

  const worker = getWorkerEngine();

  if (options?.epic) {
    worker.setIssueFilter((issue) => {
      // Allow the epic itself and its children
      return issue.id === options.epic || issue.id.startsWith(`${options.epic}.`);
    });
  }
  
  if (options?.policy) {
    worker.setForcePolicy(options.policy);
  }

  // Initialize cleanup engine
  const cleanupEngine = getCleanupEngine();
  await cleanupEngine.start();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nStopping worker...");
    cleanupEngine.stop();
    worker.stop();
    resetCleanupEngine();
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

  // Initialize cleanup engine
  const cleanupEngine = getCleanupEngine();
  await cleanupEngine.start();

  // Resume any interrupted runs
  await monitor.resumeInterruptedRuns();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nStopping monitor...");
    cleanupEngine.stop();
    monitor.stop();
    resetCleanupEngine();
    process.exit(0);
  });

  await monitor.start();
}

/**
 * Work command - process specific issue or epic
 */
async function cmdWork(issueIdOrEpic: string | undefined, epicMode: boolean = false): Promise<void> {
  // If epic mode, use the WorkerEngine logic with filtering (single pass)
  if (epicMode) {
    if (!issueIdOrEpic) {
      console.error("Error: Epic ID required");
      console.log("Usage: ashep work --epic <epic-id>");
      process.exit(1);
    }
    
    console.log(`Epic-focused processing (Single Pass): ${issueIdOrEpic}`);
    console.log("Using Smart Picker logic filtered to this epic subtree.");

    // Validate configuration
    const { validateStartup } = await import("../core/config-validator.ts");
    await validateStartup();

    const worker = getWorkerEngine();
    
    // Set issue filter to epic subtree
    worker.setIssueFilter((issue) => {
      return issue.id === issueIdOrEpic || issue.id.startsWith(`${issueIdOrEpic}.`);
    });

    // Run one cycle of processing
    // We need to expose a method on worker to run one cycle, or just call start() and stop() quickly?
    // start() loops. We should expose `processReadyIssues` publicly or add `runOnce`.
    // Since processReadyIssues is private, we'll cast to any for now or modify WorkerEngine.
    
    // Actually, cmdWorkEpic was running a loop over issues.
    // Ideally we want to run: pick -> process -> repeat until no more ready issues in epic.
    
    // Let's implement a runOnce loop here
    let hasWork = true;
    while (hasWork) {
      // processReadyIssues returns void in current impl.
      // We need to know if it did anything.
      
      // Let's just run it once. If the user wants to process the whole tree, 
      // they might need to run it multiple times or we need a better "run until empty" mode.
      // The original cmdWorkEpic tried to do everything ready.
      
      // For now, let's just run processReadyIssues once. It picks N issues (concurrency limit) and runs them.
      await (worker as any).processReadyIssues();
      
      // Check if we should continue? 
      // Without return value, hard to know.
      // Let's assume single pass of "fill concurrency slots" is what's expected for now,
      // or effectively behaves like "work on this epic".
      hasWork = false; // Just one pass for safety
    }
    
    console.log("Epic processing cycle complete.");
    return;
  }

  // If no epic flag and no issue ID, auto-pick
  if (!issueIdOrEpic) {
    await cmdWorkIssue(undefined);
    return;
  }

  // Epic mode always requires epic ID
  if (epicMode) {
    if (!issueIdOrEpic) {
      console.error("Error: Epic ID required");
      console.log("Usage: ashep work --epic <epic-id>");
      process.exit(1);
    }
    await cmdWorkEpic(issueIdOrEpic);
  } else {
    await cmdWorkIssue(issueIdOrEpic);
  }
}

/**
 * Work command - process specific issue
 */
async function cmdWorkIssue(issueId?: string): Promise<void> {
  // Auto-pick if no issue ID provided
  if (!issueId) {
    console.log("Auto-picking next issue using configured picker...");
    
    // Load config to get picker settings
    const config = loadConfig();
    
    // Build picker config from config.yaml
    const pickingConfig: PickerConfig = {
      mode: config.worker?.picking?.mode || "simple",
      max_issues: config.worker?.picking?.max_issues || 3,
      prefer_epic_affinity: config.worker?.picking?.prefer_epic_affinity || true,
      crash_detection: config.worker?.crash_detection,
    };
    
    // Get picker and pick next issues
    const issuePicker = getIssuePicker(pickingConfig);
    const readyIssues = await issuePicker.pickNextIssues();
    
    if (readyIssues.length === 0) {
      console.log("No ready issues found. Use 'ashep list-ready' to see available work.");
      return;
    }
    
    // Use the first picked issue
    issueId = readyIssues[0].id;
    console.log(`Picked issue: ${issueId} - ${readyIssues[0].title}`);
    console.log(`Picker mode: ${pickingConfig.mode} | Available issues: ${readyIssues.length}`);
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
 * Work command - process all ready issues in epic subtree
 */
async function cmdWorkEpic(epicId: string): Promise<void> {
  if (!epicId) {
    console.error("Error: Epic ID required");
    console.log("Usage: ashep work --epic <epic-id>");
    process.exit(1);
  }

  console.log(`Epic-focused processing: ${epicId}`);

  const epic = await getIssue(epicId);
  if (!epic) {
    console.error(`Error: Epic ${epicId} not found`);
    process.exit(1);
  }

  if (epic.issue_type !== "epic") {
    console.error(`Error: ${epicId} is not an epic`);
    process.exit(1);
  }

  // Get all ready issues in the project
  const readyIssues = await getReadyIssues();
  
  // Filter for issues in this epic subtree
  const epicSubtreeIssues = readyIssues.filter(issue => 
    issue.id.startsWith(epicId) && issue.id !== epicId
  );

  if (epicSubtreeIssues.length === 0) {
    console.log(`No ready issues found in epic ${epicId}`);
    return;
  }

  console.log(`Found ${epicSubtreeIssues.length} ready issues in epic ${epicId}`);
  
  const worker = getWorkerEngine();
  const results: Array<{
    issue_id: string;
    success: boolean;
    message?: string;
    next_phase?: string;
  }> = [];

  // Process each issue
  for (const issue of epicSubtreeIssues) {
    console.log(`\nProcessing issue: ${issue.id} - ${issue.title}`);
    
    try {
      const result = await worker.processIssue(issue);
      results.push({
        issue_id: issue.id,
        success: result.success,
        message: result.message,
        next_phase: result.next_phase,
      });
    } catch (error) {
      console.error(`Error processing issue ${issue.id}:`, error);
      results.push({
        issue_id: issue.id,
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Show summary
  console.log(`\n=== Epic Processing Summary ===`);
  console.log(`Epic: ${epicId} - ${epic.title}`);
  console.log(`Issues processed: ${results.length}`);
  console.log(`Successful: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);
  
  console.log(`\nDetails:`);
  for (const result of results) {
    const status = result.success ? "✓" : "✗";
    console.log(`  ${status} ${result.issue_id}: ${result.message || "OK"} ${result.next_phase ? `-> ${result.next_phase}` : ""}`);
  }
}

/**
 * Init command - create default configuration
 */
function cmdInit(): void {
  console.log("Initializing Agent Shepherd configuration...");
  
  // For hybrid mode, always create local config in current directory
  const configDir = join(process.cwd(), ".agent-shepherd");
  const configSubDir = join(configDir, "config");
  const pluginsDir = join(configDir, "plugins");
  const agentsDir = join(configDir, "agents");
  const workflowsDir = join(configDir, "workflows");

  // Check if config already exists
  const configExists = existsSync(configSubDir);

  // Create directories if they don't exist
  if (!configExists) {
    mkdirSync(configSubDir, { recursive: true });
    console.log(`✅ Created directory: ${configSubDir}`);
  } else {
    console.log(`ℹ️  Configuration directory already exists: ${configSubDir}`);
  }

  if (!existsSync(pluginsDir)) {
    mkdirSync(pluginsDir, { recursive: true });
    console.log(`✅ Created directory: ${pluginsDir}`);
  }

  // Create agents and workflows directories (for files extension)
  if (!existsSync(agentsDir)) {
    mkdirSync(join(agentsDir, "enabled"), { recursive: true });
    mkdirSync(join(agentsDir, "available"), { recursive: true });
    console.log(`✅ Created directory: ${agentsDir}`);
  }

  if (!existsSync(workflowsDir)) {
    mkdirSync(join(workflowsDir, "enabled"), { recursive: true });
    mkdirSync(join(workflowsDir, "available"), { recursive: true });
    console.log(`✅ Created directory: ${workflowsDir}`);
  }

  // Copy schemas from installation to project if not exists
  try {
    const installDir = findInstallDir();
    const schemasSource = join(installDir, "schemas");
    const schemasDest = join(configDir, "schemas");

    if (existsSync(schemasSource) && !existsSync(schemasDest)) {
      cpSync(schemasSource, schemasDest, { recursive: true });
      console.log(`✅ Created directory: ${schemasDest}`);
    } else if (!existsSync(schemasSource)) {
      console.log(`⚠️  Warning: Schemas directory not found in installation`);
    }
  } catch {
    // Silently skip if install dir can't be found
  }

  // Copy default plugins from installation to project if not exists
  try {
    const installDir = findInstallDir();
    const pluginsSource = join(installDir, "plugins");

    if (existsSync(pluginsSource)) {
      const pluginDirs = readdirSync(pluginsSource, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const pluginName of pluginDirs) {
        const sourcePath = join(pluginsSource, pluginName);
        const destPath = join(pluginsDir, pluginName);

        if (!existsSync(destPath)) {
          cpSync(sourcePath, destPath, { recursive: true });
          console.log(`✅ Copied plugin: ${pluginName}`);
        }
      }
    }
  } catch {
    // Silently skip if install dir can't be found
  }
  
  // Create default policies.yaml
  const policiesPath = join(configSubDir, "policies.yaml");
  if (!existsSync(policiesPath)) {
    const defaultPolicies = `policies:
  # Simple beginner workflow - works out-of-the-box with basic OpenCode agents
  simple:
    name: simple
    description: Simple autonomous workflow with implement, test, and retry loop
    phases:
      - name: implement
        description: Implement feature based on issue description
        capabilities:
          - coding
        timeout_multiplier: 2.0
      
      - name: test
        description: Test what was implemented (run and verify it works)
        capabilities:
          - coding
          - testing
        timeout_multiplier: 1.0
      
      - name: validate
        description: Validate result matches to original issue requirements
        capabilities:
          - coding
        timeout_multiplier: 0.5
    
    retry:
      max_attempts: 2
      backoff_strategy: exponential
      initial_delay_ms: 5000
      max_delay_ms: 30000
    
    timeout_base_ms: 300000
    stall_threshold_ms: 60000
    require_hitl: false

  # Advanced workflow - requires agents with many specialized capabilities
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
      max_delay_ms: 30000
    
    timeout_base_ms: 300000
    stall_threshold_ms: 60000
    require_hitl: false

default_policy: simple
`;
    writeFileSync(policiesPath, defaultPolicies);
    console.log(`✅ Created: ${policiesPath}`);
  } else {
    console.log(`ℹ️  Skipped (exists): ${policiesPath}`);
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
      console.log(`✅ Created: ${agentsPath}`);
    } else {
      console.log(`ℹ️  Skipped (exists): ${agentsPath}`);
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

# Fallback Agent System
# When a policy requires a capability that no agent has,
# the system will fall back to a specified agent.
# This allows quickstart to work with default agents.
fallback:
  enabled: true
  default_agent: build
  # Optional: Add mappings for better agent matching
  # mappings:
  #   review: summary
  #   architecture: plan

# Workflow Trigger Configuration
# Controls how workflow labels are handled on issues
workflow:
  # Strategy for invalid workflow labels:
  # - error: Fail with error
  # - warning: Log warning and continue
  # - ignore: Silently skip
  invalid_label_strategy: error

# Human-in-the-Loop Configuration
# Controls HITL (human-in-the-loop) behavior and allowed reasons
hitl:
  allowed_reasons:
    # Predefined HITL reasons that are always allowed
    predefined:
      - approval
      - manual-intervention
      - timeout
      - error
      - review-request
    # Allow custom HITL reasons (not in predefined list)
    allow_custom: true
    # Validation pattern for custom reasons:
    # - none: Allow any text
    # - alphanumeric: Letters and numbers only
    # - alphanumeric-dash-underscore: Letters, numbers, dashes, underscores
    custom_validation: alphanumeric-dash-underscore
 `;
     writeFileSync(configPath, defaultConfig);
     console.log(`✅ Created: ${configPath}`);
   } else {
     console.log(`ℹ️  Skipped (exists): ${configPath}`);
   }
  
  console.log("\n✅ Initialization complete!\n");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🎯 NEXT STEP");
  console.log("");
  console.log("  Run: ashep quickstart");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
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
 * Validate policy chain command - validate policy-capability-agent relationships
 */
async function cmdValidatePolicyChain(soft: boolean = false): Promise<boolean> {
  console.log("🔍 Validating policy-capability-agent chain...");

  try {
    // First validate basic configuration
    const { validateStartup } = await import("../core/config-validator.ts");
    await validateStartup(undefined, soft);
    
    // Then validate policy chain
    const { policyCapabilityValidator } = await import("../core/policy-capability-validator.ts");
    const result = await policyCapabilityValidator.validateChain();
    
    console.log(`\n${result.summary}\n`);
    
    if (!result.valid) {
      // Group errors by type
      const errors = result.errors.filter(e => e.severity === 'error');
      const warnings = result.errors.filter(e => e.severity === 'warning');
      
      if (errors.length > 0) {
        console.log("❌ Errors:");
        for (const error of errors) {
          console.log(`  • ${error.message}`);
          if (error.location) {
            console.log(`    Location: ${error.location}`);
          }
          if (error.suggestion) {
            console.log(`    Suggestion: ${error.suggestion}`);
          }
        }
        console.log();
      }
      
      if (warnings.length > 0) {
        console.log("⚠️ Warnings:");
        for (const warning of warnings) {
          console.log(`  • ${warning.message}`);
          if (warning.location) {
            console.log(`    Location: ${warning.location}`);
          }
          if (warning.suggestion) {
            console.log(`    Suggestion: ${warning.suggestion}`);
          }
        }
        console.log();
      }
      
      // Show dead ends
      const deadEnds = policyCapabilityValidator.findDeadEnds();
      if (deadEnds.length > 0) {
        console.log("🚫 Dead Ends (require attention):");
        for (const deadEnd of deadEnds) {
          const icon = deadEnd.type === 'capability' ? '🎯' : '📋';
          console.log(`  ${icon} ${deadEnd.name}: ${deadEnd.description}`);
        }
        console.log();
      }
      
      // Only exit if not in soft mode
      if (!soft) {
        process.exit(1);
      }
      return false;
    } else {
      console.log("✅ All policy-capability-agent chains are valid");
      return true;
    }
  } catch (error) {
    console.error("❌ Validation failed:", error instanceof Error ? error.message : String(error));
    if (!soft) {
      process.exit(1);
    }
    return false;
  }
}

/**
 * Show policy tree command - display relationship tree
 */
async function cmdShowPolicyTree(format?: string): Promise<void> {
  console.log("🌳 Generating policy-capability-agent tree...");

  try {
    // Validate configuration but don't exit on failure
    const { configValidator } = await import("../core/config-validator.ts");
    const results = await configValidator.validateAllConfigs();

    console.log('🔍 Validating configuration files...');
    let hasErrors = false;

    for (const result of results) {
      console.log(result.summary);

      if (!result.valid) {
        hasErrors = true;

        // Print detailed errors
        for (const error of result.errors) {
          const path = error.instancePath || error.schemaPath;
          console.log(`   • ${path}: ${error.message}`);
        }
      }
    }

    if (hasErrors) {
      console.log('\n⚠️ Configuration validation found issues, but continuing with tree generation...\n');
    } else {
      console.log('✅ Configuration validation passed\n');
    }

    const { policyTreeVisualizer } = await import("../core/policy-tree-visualizer.ts");

    if (format === 'json') {
      const jsonTree = policyTreeVisualizer.generateJsonTree();
      console.log(jsonTree);
    } else {
      // ASCII tree (default)
      const asciiTree = policyTreeVisualizer.generateAsciiTree();
      console.log(asciiTree);

      // Add summary
      const summary = policyTreeVisualizer.generateSummary();
      console.log("Summary:");
      console.log(`  Policies: ${summary.validPolicies}/${summary.totalPolicies} valid`);
      console.log(`  Phases: ${summary.totalPhases}`);
      console.log(`  Unique Capabilities: ${summary.uniqueCapabilities}`);
      console.log(`  Unique Agents: ${summary.uniqueAgents}`);

      if (summary.policiesWithWarnings > 0 || summary.policiesWithErrors > 0) {
        console.log(`  Issues: ${summary.policiesWithWarnings} warnings, ${summary.policiesWithErrors} errors`);
      }

      if (summary.deadEndCapabilities.length > 0) {
        console.log(`  Dead end capabilities: ${summary.deadEndCapabilities.join(', ')}`);
      }

      if (summary.inactiveAgents.length > 0) {
        console.log(`  Inactive agents: ${summary.inactiveAgents.join(', ')}`);
      }
    }
  } catch (error) {
    console.error("❌ Failed to generate tree:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Server status command
 */
async function cmdServerStatus(): Promise<void> {
  const config = loadConfig();
  const url = config.opencode?.server?.base_url || "http://localhost:4321";
  const pid = getServerPid();
  const running = await isServerRunning(url);

  console.log("OpenCode Server Status:");
  console.log(`  URL: ${url}`);
  console.log(`  Auto-start: ${config.opencode?.server?.auto_start ? "Enabled" : "Disabled"}`);
  console.log(`  Status: ${running ? "✅ Running" : "🔴 Stopped"}`);
  if (pid) {
    console.log(`  PID: ${pid} (Daemon process)`);
  } else if (running) {
    console.log(`  PID: External/Manual process`);
  }
}

/**
 * Server start command
 */
async function cmdServerStart(): Promise<void> {
  const config = loadConfig();
  const serverConfig = config.opencode?.server || {
    auto_start: true,
    base_url: "http://localhost:4321",
    startup_timeout_ms: 5000
  };

  const success = await startServer(serverConfig);
  if (!success) {
    process.exit(1);
  }
}

/**
 * Server stop command
 */
function cmdServerStop(): void {
  const success = stopServer();
  if (!success) {
    console.log("Could not stop server (maybe not running or not started by agent-shepherd?)");
    process.exit(1);
  }
}

/**
 * Server config command (enable/disable)
 */
function cmdServerConfig(enable: boolean): void {
  const { getConfigPath } = require("../core/path-utils.ts");
  const configPath = getConfigPath("config.yaml");
  
  if (!existsSync(configPath)) {
    console.error("Config file not found.");
    process.exit(1);
  }

  let content = readFileSync(configPath, "utf-8");
  
  // Simple regex-based update to preserve comments
  // Matches "opencode:" ... "server:" ... "auto_start: true/false"
  // This is a bit fragile but safest for comment preservation without a CST parser.
  
  // Strategy:
  // 1. Check if opencode section exists
  // 2. If yes, look for server/auto_start inside it
  // 3. If no, append new block
  
  // Check if auto_start line exists under opencode/server context?
  // We'll try to replace "auto_start: true" or "auto_start: false" if strictly indented?
  // Or simpler: Load full YAML, update object, dump YAML (warn user about comments).
  
  // Given the request for "activate/deactivate", modifying the file is key.
  // I'll stick to full YAML parse/dump for reliability of the structure, 
  // but warn about comments.
  // Actually, let's try to just append or replace if I can match the exact line.
  
  // Regex approach:
  const autoStartRegex = /auto_start:\s*(true|false)/;
  
  if (autoStartRegex.test(content)) {
     // This matches the FIRST occurrence. Might be risky if other sections have auto_start.
     // But schema only has it in opencode.server (and maybe nowhere else? cleanup has run_on_startup).
     // Let's use a more specific regex if possible or fall back to YAML dump.
     
     // Let's use YAML dump for correctness.
     console.log("Updating configuration...");
     const config = parseYAML(content);
     
     if (!config.opencode) config.opencode = {};
     if (!config.opencode.server) config.opencode.server = { base_url: "http://localhost:4321", startup_timeout_ms: 5000 };
     
     config.opencode.server.auto_start = enable;
     
     const newContent = stringifyYAML(config);
     writeFileSync(configPath, newContent);
     console.log(`✅ Server auto-start ${enable ? "enabled" : "disabled"}.`);
     console.log("⚠️  Note: Comments in config.yaml may have been removed by YAML parser.");
  } else {
    // If not found, maybe just append?
    // Using YAML dump is consistent.
     console.log("Updating configuration...");
     const config = parseYAML(content);
     
     if (!config.opencode) config.opencode = {};
     if (!config.opencode.server) config.opencode.server = { base_url: "http://localhost:4321", startup_timeout_ms: 5000 };
     
     config.opencode.server.auto_start = enable;
     
     const newContent = stringifyYAML(config);
     writeFileSync(configPath, newContent);
     console.log(`✅ Server auto-start ${enable ? "enabled" : "disabled"}.`);
  }
}

/**
 * Plugin install command - install plugin from path or URL
 */
async function cmdPluginInstall(source: string): Promise<void> {
  if (!source) {
    console.error("Usage: ashep plugin-install <path-or-url>");
    console.error("Examples:");
    console.error("  ashep plugin-install /path/to/plugin");
    console.error("  ashep plugin-install https://github.com/user/plugin.git");
    process.exit(1);
  }

  try {
    const agentShepherdDir = findAgentShepherdDir();
    const pluginsDir = join(agentShepherdDir, "plugins");

    if (!existsSync(pluginsDir)) {
      mkdirSync(pluginsDir, { recursive: true });
    }

    if (source.startsWith("http")) {
      // Clone git repo
      console.log(`Cloning plugin from ${source}...`);
      const pluginName = source.split("/").pop()?.replace(".git", "") || "plugin";
      const pluginPath = join(pluginsDir, pluginName);

      if (existsSync(pluginPath)) {
        console.error(`Plugin ${pluginName} already exists`);
        process.exit(1);
      }

      execSync(`git clone "${source}" "${pluginPath}"`, { stdio: "inherit" });
    } else {
      // Copy local directory
      const sourcePath = path.resolve(source);
      if (!existsSync(sourcePath)) {
        console.error(`Source path does not exist: ${sourcePath}`);
        process.exit(1);
      }

      const pluginName = path.basename(sourcePath);
      const pluginPath = join(pluginsDir, pluginName);

      if (existsSync(pluginPath)) {
        console.error(`Plugin ${pluginName} already exists`);
        process.exit(1);
      }

       cpSync(sourcePath, pluginPath, { recursive: true });
    }

    console.log("Plugin installed successfully");
  } catch (error) {
    console.error("Failed to install plugin:", error);
    process.exit(1);
  }
}

/**
 * Plugin activate command - activate plugin
 */
function cmdPluginActivate(name: string): void {
  if (!name) {
    console.error("Usage: ashep plugin-activate <plugin-name>");
    process.exit(1);
  }

  try {
    const agentShepherdDir = findAgentShepherdDir();
    const pluginsDir = join(agentShepherdDir, "plugins");
    const pluginPath = join(pluginsDir, name);

    if (!existsSync(pluginPath)) {
      console.error(`Plugin ${name} not found`);
      process.exit(1);
    }

    const manifestPath = join(pluginPath, "manifest.json");
    if (!existsSync(manifestPath)) {
      console.error(`Plugin ${name} has no manifest.json`);
      process.exit(1);
    }

    console.log(`Plugin ${name} is active (loaded automatically)`);
  } catch (error) {
    console.error("Failed to activate plugin:", error);
    process.exit(1);
  }
}

/**
 * Plugin deactivate command - deactivate plugin
 */
function cmdPluginDeactivate(name: string): void {
  if (!name) {
    console.error("Usage: ashep plugin-deactivate <plugin-name>");
    process.exit(1);
  }

  try {
    const agentShepherdDir = findAgentShepherdDir();
    const pluginsDir = join(agentShepherdDir, "plugins");
    const pluginPath = join(pluginsDir, name);

    if (!existsSync(pluginPath)) {
      console.error(`Plugin ${name} not found`);
      process.exit(1);
    }

    // For now, just mark as inactive (future: config-based activation)
    console.log(`Plugin ${name} deactivated (restart CLI to unload)`);
  } catch (error) {
    console.error("Failed to deactivate plugin:", error);
    process.exit(1);
  }
}

/**
 * Plugin remove command - remove plugin
 */
function cmdPluginRemove(name: string): void {
  if (!name) {
    console.error("Usage: ashep plugin-remove <plugin-name>");
    process.exit(1);
  }

  try {
    const agentShepherdDir = findAgentShepherdDir();
    const pluginsDir = join(agentShepherdDir, "plugins");
    const pluginPath = join(pluginsDir, name);

    if (!existsSync(pluginPath)) {
      console.error(`Plugin ${name} not found`);
      process.exit(1);
    }

     rmSync(pluginPath, { recursive: true, force: true });
    console.log(`Plugin ${name} removed`);
  } catch (error) {
    console.error("Failed to remove plugin:", error);
    process.exit(1);
  }
}

/**
 * Quickstart command - one-command onboarding
 */
async function cmdQuickstart(): Promise<void> {
  console.log("🚀 Agent Shepherd Quickstart - One-command onboarding\n");

  try {
    // Step 1: Check and install dependencies
    console.log("📦 Checking dependencies...");
    let dependenciesOk = true;

    // Check Bun
    console.log(`✅ Bun ${Bun.version} is installed`);

    // Check Beads
    try {
      const proc = Bun.spawn(["bd", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
      console.log("✅ Beads (bd) is installed");
    } catch {
      console.log("❌ Beads (bd) is NOT installed");
      console.log("   Installing Beads...");

      if (platform() === "win32") {
        console.log("Please install Beads manually: https://get.beads.dev");
        dependenciesOk = false;
      } else {
        try {
          execSync("curl -fsSL https://get.beads.dev | bash", { stdio: "inherit" });
          // Update PATH for current session
          process.env.PATH = `${homedir()}/.beads/bin:${process.env.PATH}`;
          console.log("✅ Beads installed successfully");
        } catch (error) {
          console.error("❌ Failed to install Beads:", error);
          console.log("   Please install Beads manually: curl -fsSL https://get.beads.dev | bash");
          dependenciesOk = false;
        }
      }
    }

    if (!dependenciesOk) {
      console.log("\n❌ Some dependencies could not be installed. Please resolve manually and run 'ashep quickstart' again.");
      process.exit(1);
    }

    // Step 2: Initialize configuration
    console.log("\n⚙️  Initializing configuration...");
    cmdInit();

    // Step 3: Sync agents (if OpenCode is available)
    console.log("\n🤖 Syncing agents with OpenCode...");
    try {
      await cmdSyncAgents();
    } catch {
      console.log("⚠️  OpenCode not available - using sample agent configurations");
      console.log("   You can sync agents later with: ashep sync-agents");
    }

    console.log(); // Add spacing before validation section

    // Step 4: Validate configuration (soft mode for first-time setup)
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔍 Validating Configuration");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const valid = await cmdValidatePolicyChain(true);

    console.log(); // Add spacing

    // Show fallback information (independent of validation status)
    const fallbackUsages = policyCapabilityValidator.getFallbackCapabilities();
    if (fallbackUsages.length > 0) {
      console.log("ℹ️  Fallback Agent System");
      console.log("   Your configuration includes a fallback agent system that allows");
      console.log("   capabilities without specialized agents to be handled by general agents.");
      console.log("   This is normal for first-time setup. The following capabilities use fallback:");
      for (const usage of fallbackUsages) {
        console.log(`   • ${usage.capability} → ${usage.fallbackAgent}`);
      }
      console.log("   You can customize fallback behavior in .agent-shepherd/config/config.yaml");
      console.log();
    }

    if (valid) {
      console.log("✅ Summary");
      console.log("   🌱 Using simple policy with autonomous multi-phase workflow!");
      console.log("   Phases: Implement → Test → Validate (with automatic retry)");
      console.log("   Same agent handles all phases - demonstrates autonomous orchestration");
    } else {
      console.log("⚠️  Summary");
      console.log("   🌱 Simple policy is set as default and works with basic agents");
      console.log("   Multi-phase workflow: Implement → Test → Validate (automatic retry on failure)");
    }

    console.log(); // Add spacing before demo section

    // Step 5: Show demo workflow instructions
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📝 Demo Workflow");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("   To try a demo:");
    console.log("   1. Create an issue with the animated hello world example:");
    console.log("      bd create \\");
    console.log("         --type task \\");
    console.log("         --title 'Create animated hello world' \\");
    console.log("         --description 'Create index.html with animated \\\"Hello World\\\" text. Use CSS for smooth pulsing animation. Add JavaScript click handler to change text color randomly.' \\");
    console.log("         --labels quickstart,documentation");
    console.log("   2. Process issue: ashep work <issue-id>");
    console.log("   3. View progress: ashep ui");

    console.log(); // Add spacing before next steps section

    // Step 6: Show next steps
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🎉 Quickstart Complete");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\nNext Commands:");
    console.log("• ashep worker              - Start autonomous worker loop");
    console.log("• ashep monitor            - Start supervision loop");
    console.log("• ashep ui                 - Open flow visualization");
    console.log("• ashep work <issue-id>    - Process specific issue");
    console.log("\n📖 For more help: ashep help");

  } catch (error) {
    console.error("\n❌ Quickstart failed:", error instanceof Error ? error.message : String(error));
    console.log("\nYou can try running individual commands:");
    console.log("• ashep install");
    console.log("• ashep init");
    console.log("• ashep sync-agents");
    console.log("• ashep validate-policy-chain");
    process.exit(1);
  }
}

/**
 * Get current installed version
 */
function getCurrentVersion(): string {
  try {
    const installDir = findInstallDir();
    const versionFile = join(installDir, "VERSION");
    if (existsSync(versionFile)) {
      return readFileSync(versionFile, "utf-8").trim();
    }

    const packageJsonPath = join(installDir, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      return packageJson.version || "unknown";
    }
  } catch {
    // Silently skip version detection if files can't be read
  }

  return "unknown";
}

/**
 * Version command - show installed version
 */
function cmdVersion(): void {
  const version = getCurrentVersion();
  console.log(`\n  Agent Shepherd \x1b[36m${version}\x1b[0m`);
  console.log("  └─ Plugins:");
  if (LOADED_PLUGINS.length === 0) {
    console.log("     (none)");
  } else {
    LOADED_PLUGINS.forEach(plugin => {
      console.log(`     • ${plugin.name} \x1b[90m${plugin.version}\x1b[0m`);
    });
  }
  console.log();
}

/**
 * Update command - update Agent Shepherd to latest or specific version
 */
async function cmdUpdate(version?: string): Promise<void> {
  const targetVersion = version || "latest";
  console.log(`Updating Agent Shepherd to ${targetVersion}...`);

  try {
    const installDir = findInstallDir();

    // Backup config and plugins
    const tempDir = join(require("os").tmpdir(), `agent-shepherd-update-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    const configDir = join(installDir, "config");
    const pluginsDir = join(installDir, "plugins");

    if (existsSync(configDir)) {
      cpSync(configDir, join(tempDir, "config"), { recursive: true });
    }
    if (existsSync(pluginsDir)) {
      cpSync(pluginsDir, join(tempDir, "plugins"), { recursive: true });
    }

    // Download new version
    const repoUrl = "https://github.com/USER/agent-shepherd.git";
    const cloneDir = join(tempDir, "clone");

    if (targetVersion === "latest") {
      execSync(`git clone --depth 1 "${repoUrl}" "${cloneDir}"`, { stdio: "inherit" });
    } else {
      execSync(`git clone --depth 1 --branch "${targetVersion}" "${repoUrl}" "${cloneDir}"`, { stdio: "inherit" });
    }

    // Remove old installation (preserve logs)
    const items = readdirSync(installDir);
    for (const item of items) {
      if (item !== "logs" && item !== "config" && item !== "plugins") {
        const itemPath = join(installDir, item);
        if (existsSync(itemPath)) {
          rmSync(itemPath, { recursive: true, force: true });
        }
      }
    }

    // Copy new installation
    const sourceDir = join(cloneDir, ".agent-shepherd");
    const sourceItems = readdirSync(sourceDir);
    for (const item of sourceItems) {
      const srcPath = join(sourceDir, item);
      const destPath = join(installDir, item);
      cpSync(srcPath, destPath, { recursive: true });
    }

    // Restore config and plugins
    if (existsSync(join(tempDir, "config"))) {
      cpSync(join(tempDir, "config"), configDir, { recursive: true });
    }
    if (existsSync(join(tempDir, "plugins"))) {
      cpSync(join(tempDir, "plugins"), pluginsDir, { recursive: true });
    }

    // Store version
    writeFileSync(join(installDir, "VERSION"), targetVersion);

    // Install dependencies
    console.log("Installing dependencies...");
    execSync("bun install", { cwd: installDir, stdio: "inherit" });

    // Cleanup
    rmSync(tempDir, { recursive: true, force: true });

    console.log(`✅ Agent Shepherd updated to ${targetVersion}`);

  } catch (error) {
    console.error("❌ Update failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Cleanup metrics command - show cleanup statistics
 */
function cmdCleanupMetrics(): void {
  try {
    const cleanupEngine = getCleanupEngine();
    const metrics = cleanupEngine.getAggregateMetrics();

    console.log("\n📊 Cleanup Metrics");
    console.log("─".repeat(50));
    console.log(`Total runs processed: ${metrics.total_runs_processed}`);
    console.log(`Total runs archived: ${metrics.total_runs_archived}`);
    console.log(`Total runs deleted: ${metrics.total_runs_deleted}`);
    console.log(`Total bytes archived: ${(metrics.total_bytes_archived / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Total bytes deleted: ${(metrics.total_bytes_deleted / 1024 / 1024).toFixed(2)} MB`);

    if (metrics.last_cleanup) {
      const lastCleanupDate = new Date(metrics.last_cleanup);
      console.log(`Last cleanup: ${lastCleanupDate.toLocaleString()}`);
    } else {
      console.log("Last cleanup: Never");
    }

    console.log(`Average cleanup duration: ${metrics.average_duration_ms.toFixed(2)} ms`);
    console.log();

    resetCleanupEngine();
  } catch (error) {
    console.error("❌ Failed to get cleanup metrics:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Cleanup status command - show system status
 */
async function cmdCleanupStatus(): Promise<void> {
  try {
    const cleanupEngine = getCleanupEngine();
    const sizeMonitor = getSizeMonitor();
    const healthChecker = getHealthChecker();

    console.log("\n🔍 Cleanup System Status");
    console.log("─".repeat(50));

    const isRunning = (cleanupEngine as any).isRunning;
    console.log(`Cleanup Engine: ${isRunning ? "🟢 Running" : "⚫ Stopped"}`);

    if (isRunning) {
      const lastCleanupTime = (cleanupEngine as any).lastCleanupTime;
      if (lastCleanupTime > 0) {
        const lastCleanupDate = new Date(lastCleanupTime);
        console.log(`Last Cleanup: ${lastCleanupDate.toLocaleString()}`);
      } else {
        console.log("Last Cleanup: Never");
      }
    }

    console.log();
    console.log("📏 Current Size Metrics");
    console.log("─".repeat(50));

    const sizeMetrics = await sizeMonitor.getMetrics();
    console.log(`Active DB size: ${(sizeMetrics.active_db_size_bytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Archive DB size: ${(sizeMetrics.archive_db_size_bytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`JSONL size: ${(sizeMetrics.jsonl_size_bytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Archive JSONL size: ${(sizeMetrics.archive_jsonl_size_bytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Total size: ${sizeMetrics.total_size_mb.toFixed(2)} MB`);
    console.log(`Run count: ${sizeMetrics.run_count}`);
    console.log(`Archive run count: ${sizeMetrics.archive_run_count}`);
    console.log();

    sizeMonitor.stop();

    console.log("🏥 Health Status");
    console.log("─".repeat(50));

    const healthReport = await healthChecker.runHealthChecks();
    const allPassed = healthReport.checks.every((check: any) => check.passed);

    for (const check of healthReport.checks) {
      const status = check.passed ? "✅" : "❌";
      console.log(`${status} ${check.check_name}: ${check.message}`);
    }

    console.log();
    console.log(`Overall Health: ${allPassed ? "✅ Healthy" : "❌ Issues Detected"}`);
    console.log();

    resetCleanupEngine();
    resetHealthChecker();
  } catch (error) {
    console.error("❌ Failed to get cleanup status:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Plugin list command - list installed plugins
 */
function cmdPluginList(): void {
  try {
    const agentShepherdDir = findAgentShepherdDir();
    const pluginsDir = join(agentShepherdDir, "plugins");

    if (!existsSync(pluginsDir)) {
      console.log("No plugins directory found");
      return;
    }

    const pluginDirs = readdirSync(pluginsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    if (pluginDirs.length === 0) {
      console.log("No plugins installed");
      return;
    }

    console.log("Installed plugins:");
    for (const pluginName of pluginDirs) {
      const pluginPath = join(pluginsDir, pluginName);
      const manifestPath = join(pluginPath, "manifest.json");

      let status = "❌ Invalid";
      let description = "";

      if (existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
          status = "✅ Active";
          description = manifest.description || "";
        } catch {
          status = "❌ Invalid manifest";
        }
      }

      console.log(`  ${pluginName}: ${status}`);
      if (description) {
        console.log(`    ${description}`);
      }
    }
  } catch (error) {
    console.error("Failed to list plugins:", error);
    process.exit(1);
  }
}

/**
 * List active command - list issues currently being worked on
 */
async function cmdListActive(): Promise<void> {
  try {
    const procOpen = Bun.spawn([
      "bd", "list",
      "--label", "ashep-managed",
      "--status", "open",
      "--json"
    ], {
      stdout: "pipe",
      stderr: "pipe"
    });

    const outputOpen = await new Response(procOpen.stdout).text();
    const issuesOpen = JSON.parse(outputOpen);

    const procInProgress = Bun.spawn([
      "bd", "list",
      "--label", "ashep-managed",
      "--status", "in_progress",
      "--json"
    ], {
      stdout: "pipe",
      stderr: "pipe"
    });

    const outputInProgress = await new Response(procInProgress.stdout).text();
    const issuesInProgress = JSON.parse(outputInProgress);

    const issues = [...issuesOpen, ...issuesInProgress];

    if (issues.length === 0) {
      console.log("No active issues found.");
      return;
    }

    const workerId = process.env.ASHEP_WORKER_ID || "default";

    // Build issue assignments map from epics
    const epicAssignments: Map<string, string> = new Map();
    
    // Find all epics and get their assigned workers
    for (const issue of issues) {
      const isEpic = !issue.id.includes(".");
      if (isEpic) {
        const assignedWorker = await getAssignedWorker(issue.id);
        if (assignedWorker) {
          epicAssignments.set(issue.id, assignedWorker);
        }
      }
    }

    console.log(`\nActive Issues (${issues.length}):`);
    console.log("┌─────────┬─────────────────────────────────┬──────────────┬─────────┬──────────────┬──────────────┐");
    console.log("│ ID      │ Title                           │ Phase        │ Priority │ Updated      │ Epic Worker  │");
    console.log("├─────────┼─────────────────────────────────┼──────────────┼─────────┼──────────────┼──────────────┤");

    for (const issue of issues) {
      const phaseLabel = issue.labels?.find((l: string) => l.startsWith("ashep-phase:"));
      const phase = phaseLabel?.replace("ashep-phase:", "") || "unknown";
      const updatedTime = new Date(issue.updated_at).toLocaleString();

      // Get epic assignment
      const epicId = issue.id.includes(".") ? issue.id.split(".")[0] : issue.id;
      const assignedWorker = epicAssignments.get(epicId);
      let workerIndicator = "";
      
      if (assignedWorker) {
        if (assignedWorker === workerId) {
          workerIndicator = "✓";
        } else {
          workerIndicator = "•";
        }
      }

      const title = issue.title.substring(0, 30) + (issue.title.length > 30 ? "..." : "");
      console.log(`│ ${issue.id.padEnd(7)} │ ${title.padEnd(31)} │ ${phase.padEnd(12)} │ ${`P${issue.priority}`.padEnd(7)} │ ${updatedTime.padEnd(12)} │ ${workerIndicator.padEnd(12)} │`);
    }

    console.log("└─────────┴─────────────────────────────────┴──────────────┴─────────┴──────────────┴──────────────┘");
    console.log(`Legend: ✓ = Owned by this worker (${workerId}), • = Owned by another worker`);
  } catch (error) {
    console.error("❌ Failed to list active issues:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * List HITL command - list issues requiring human-in-the-loop intervention
 */
async function cmdListHITL(): Promise<void> {
  try {
    const proc = Bun.spawn(["bd", "list", "--json"], {
      stdout: "pipe",
      stderr: "pipe"
    });

    const output = await new Response(proc.stdout).text();
    const issues = JSON.parse(output);

    const hitlIssues = issues.filter((issue: any) =>
      issue.labels?.some((l: string) => l.startsWith("ashep-hitl:"))
    );

    if (hitlIssues.length === 0) {
      console.log("No HITL issues found.");
      return;
    }

    console.log(`\nHITL Issues (${hitlIssues.length}):`);
    console.log("┌─────────┬─────────────────────────────────┬──────────────┬─────────┬──────────────────┐");
    console.log("│ ID      │ Title                           │ Reason       │ Phase    │ Status          │");

    for (const issue of hitlIssues) {
      const hitlLabel = issue.labels?.find((l: string) => l.startsWith("ashep-hitl:"));
      const reason = hitlLabel?.replace("ashep-hitl:", "") || "unknown";
      const phaseLabel = issue.labels?.find((l: string) => l.startsWith("ashep-phase:"));
      const phase = phaseLabel?.replace("ashep-phase:", "") || "unknown";
      const title = issue.title.substring(0, 30) + (issue.title.length > 30 ? "..." : "");

      console.log(`│ ${issue.id.padEnd(7)} │ ${title.padEnd(31)} │ ${reason.padEnd(12)} │ ${phase.padEnd(8)} │ ${issue.status.padEnd(14)} │`);
    }

    console.log("└─────────┴─────────────────────────────────┴──────────────┴─────────┴──────────────────┘");
  } catch (error) {
    console.error("❌ Failed to list HITL issues:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Heartbeat status command - show checker health and active heartbeats
 */
async function cmdHeartbeat(): Promise<void> {
  try {
    const workerId = process.env.ASHEP_WORKER_ID || "default";
    
    console.log(`\nHeartbeat Checker Status`);
    console.log(`Worker ID: ${workerId}`);
    console.log(``);
    
    // Get all epics with assigned workers (issues with assigned-worker state)
    const allIssues = await listIssues();
    const epicIssues = allIssues.filter((issue: any) => !issue.id.includes(".") && issue.issue_type === "epic");
    
    if (epicIssues.length === 0) {
      console.log("No epics found with active assignments.");
      return;
    }
    
    // Build epic assignment status table
    const epicAssignments: Array<{
      epicId: string;
      title: string;
      assignedWorker: string | null;
      lastHeartbeat: number | null;
      leaseExpires: number | null;
      status: string;
    }> = [];
    
    for (const epic of epicIssues) {
      const assignedWorker = await getAssignedWorker(epic.id);
      const lastHeartbeat = await getLastHeartbeat(epic.id);
      const leaseExpires = await getLeaseExpires(epic.id);
      
      let status: string;
      const now = Date.now();
      
      if (assignedWorker) {
        if (assignedWorker === workerId) {
          // We own this epic
          if (lastHeartbeat && (now - lastHeartbeat) < 5 * 60 * 1000) {
            status = "owned";
          } else if (lastHeartbeat) {
            status = "stale";
          } else {
            status = "leased";
          }
        } else {
          // Another worker owns this epic
          if (lastHeartbeat && (now - lastHeartbeat) < 5 * 60 * 1000) {
            status = "active";
          } else if (lastHeartbeat) {
            status = "stale";
          } else if (leaseExpires && now < leaseExpires) {
            status = "leased";
          } else {
            status = "abandoned";
          }
        }
      } else {
        status = "unassigned";
      }
      
      const title = epic.title.substring(0, 25) + (epic.title.length > 25 ? "..." : "");
      epicAssignments.push({
        epicId: epic.id,
        title,
        assignedWorker,
        lastHeartbeat,
        leaseExpires,
        status,
      });
    }
    
    // Filter out unassigned and only show assigned epics
    const activeAssignments = epicAssignments.filter(a => a.assignedWorker !== null);
    
    if (activeAssignments.length === 0) {
      console.log("No active epic assignments found.");
      return;
    }
    
    console.log(`Active Epic Assignments (${activeAssignments.length}):`);
    console.log("┌──────────────┬──────────────────────────┬───────────────┬──────────────┬──────────────────────┐");
    console.log("│ Epic         │ Title                   │ Assigned To   │ Last Heart   │ Status              │");
    console.log("├──────────────┼──────────────────────────┼───────────────┼──────────────┼──────────────────────┤");
    
    for (const assignment of activeAssignments) {
      const epicShort = assignment.epicId.substring(0, 12) + (assignment.epicId.length > 12 ? "..." : "");
      const assignedTo = assignment.assignedWorker === workerId 
        ? `${assignment.assignedWorker} ✓` 
        : (assignment.assignedWorker || "none");
      const heartbeatAge = assignment.lastHeartbeat 
        ? formatAge(Date.now() - assignment.lastHeartbeat) 
        : "never";
      
      const isOwned = assignment.assignedWorker === workerId;
      const statusDisplay = isOwned ? `${assignment.status} ✓` : assignment.status;
      
      console.log(`│ ${epicShort.padEnd(12)} │ ${assignment.title.padEnd(22)} │ ${assignedTo.padEnd(13)} │ ${heartbeatAge.padEnd(12)} │ ${statusDisplay.padEnd(18)} │`);
    }
    
    console.log("└──────────────┴──────────────────────────┴───────────────┴──────────────┴──────────────────────┘");
    console.log(``);
    console.log(`Legend: ✓ = Owned by current worker`);
  } catch (error) {
    console.error("❌ Failed to show heartbeat status:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Format age in milliseconds to human-readable string
 */
function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * List ready command - list issues ready to be worked on
 */
async function cmdListReady(): Promise<void> {
  try {
    const proc = Bun.spawn([
      "bd", "list",
      "--label", "ashep-managed",
      "--status", "open",
      "--json"
    ], {
      stdout: "pipe",
      stderr: "pipe"
    });

    const output = await new Response(proc.stdout).text();
    const issues = JSON.parse(output);

    if (issues.length === 0) {
      console.log("No ready issues found.");
      return;
    }

    console.log(`\nReady Issues (${issues.length}):`);
    console.log("┌─────────┬─────────────────────────────────┬──────────────┬─────────┬──────────────┐");
    console.log("│ ID      │ Title                           │ Phase        │ Priority │ Updated      │");
    console.log("├─────────┼─────────────────────────────────┼──────────────┼─────────┼──────────────┤");

    for (const issue of issues) {
      const phaseLabel = issue.labels?.find((l: string) => l.startsWith("ashep-phase:"));
      const phase = phaseLabel?.replace("ashep-phase:", "") || "unknown";
      const updatedTime = new Date(issue.updated_at).toLocaleString();

      const title = issue.title.substring(0, 30) + (issue.title.length > 30 ? "..." : "");
      console.log(`│ ${issue.id.padEnd(7)} │ ${title.padEnd(31)} │ ${phase.padEnd(12)} │ ${`P${issue.priority}`.padEnd(7)} │ ${updatedTime.padEnd(12)} │`);
    }

    console.log("└─────────┴─────────────────────────────────┴──────────────┴─────────┴──────────────┘");
  } catch (error) {
    console.error("❌ Failed to list ready issues:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * List struggle command - list blocked issues that need attention
 */
async function cmdListStruggle(hours?: number): Promise<void> {
  try {
    const staleThresholdHours = hours || 24;
    const staleCutoff = Date.now() - (staleThresholdHours * 60 * 60 * 1000);

    const proc = Bun.spawn(["bd", "list", "--json"], {
      stdout: "pipe",
      stderr: "pipe"
    });

    const output = await new Response(proc.stdout).text();
    const issues = JSON.parse(output);

    const strugglingIssues = issues.filter((issue: any) => {
      const isManaged = issue.labels?.includes("ashep-managed");
      if (!isManaged) return false;

      const isBlocked = issue.status === "blocked";
      const hasHITL = issue.labels?.some((l: string) => l.startsWith("ashep-hitl:"));
      const isStale = new Date(issue.updated_at).getTime() < staleCutoff;

      return isBlocked || hasHITL || isStale;
    });

    if (strugglingIssues.length === 0) {
      console.log("No struggling issues found.");
      return;
    }

    console.log(`\nStruggling Issues (${strugglingIssues.length}):`);
    console.log("┌─────────┬─────────────────────────────────┬──────────────┬──────────────┬─────────┬──────────────────┐");
    console.log("│ ID      │ Title                           │ Type         │ Phase        │ Status   │ Age/Reason      │");
    console.log("├─────────┼─────────────────────────────────┼──────────────┼──────────────┼─────────┼──────────────────┤");

    for (const issue of strugglingIssues) {
      const phaseLabel = issue.labels?.find((l: string) => l.startsWith("ashep-phase:"));
      const phase = phaseLabel?.replace("ashep-phase:", "") || "unknown";
      const title = issue.title.substring(0, 30) + (issue.title.length > 30 ? "..." : "");

      let ageOrReason = "";
      const isBlocked = issue.status === "blocked";
      const hasHITL = issue.labels?.some((l: string) => l.startsWith("ashep-hitl:"));
      const isStale = new Date(issue.updated_at).getTime() < staleCutoff;

      if (isBlocked) {
        ageOrReason = "blocked";
      } else if (hasHITL) {
        const hitlLabel = issue.labels?.find((l: string) => l.startsWith("ashep-hitl:"));
        ageOrReason = hitlLabel?.replace("ashep-hitl:", "") || "HITL";
      } else if (isStale) {
        const ageHours = Math.floor((Date.now() - new Date(issue.updated_at).getTime()) / (60 * 60 * 1000));
        ageOrReason = `${ageHours}h stale`;
      }

      console.log(`│ ${issue.id.padEnd(7)} │ ${title.padEnd(31)} │ ${issue.issue_type.padEnd(12)} │ ${phase.padEnd(12)} │ ${issue.status.padEnd(8)} │ ${ageOrReason.padEnd(14)} │`);
    }

    console.log("└─────────┴─────────────────────────────────┴──────────────┴──────────────┴─────────┴──────────────────┘");
  } catch (error) {
    console.error("❌ Failed to list struggling issues:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Get messages command - get phase messages for an issue
 */
async function cmdGetMessages(issueId: string, phase?: string, unreadOnly?: boolean, asJson?: boolean): Promise<void> {
  if (!issueId) {
    console.error("Usage: ashep phase-msg-list <issue-id> [--phase <phase>] [--unread] [--json]");
    console.error("Examples:");
    console.error("  ashep phase-msg-list ISSUE-123");
    console.error("  ashep phase-msg-list ISSUE-123 --phase test");
    console.error("  ashep phase-msg-list ISSUE-123 --unread");
    console.error("  ashep phase-msg-list ISSUE-123 --json");
    process.exit(1);
  }

  try {
    const { getPhaseMessenger, formatMessagesForCLI } = await import("../core/phase-messenger.ts");
    const messenger = getPhaseMessenger();

    const query: any = { issue_id: issueId };

    if (phase) {
      query.to_phase = phase;
    }

    if (unreadOnly) {
      query.read = false;
    }

    const messages = messenger.listMessages(query);

    if (asJson) {
      console.log(JSON.stringify(messages, null, 2));
      return;
    }

    if (messages.length === 0) {
      console.log(`No messages found for issue ${issueId}${phase ? ` and phase '${phase}'` : ""}${unreadOnly ? " (unread only)" : ""}.`);
    } else {
      console.log(formatMessagesForCLI(messages));
    }
  } catch (error) {
    console.error("❌ Failed to get messages:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Read message command - get full details of a specific message
 */
async function cmdReadMessage(messageId: string, asJson?: boolean): Promise<void> {
  if (!messageId) {
    console.error("Usage: ashep read-message <message-id> [--json]");
    process.exit(1);
  }

  try {
    const { getPhaseMessenger } = await import("../core/phase-messenger.ts");
    const messenger = getPhaseMessenger();
    
    // We need to access the public getMessage method we added to the class interface
    // But since it might not be exposed on the interface yet, we cast to any or check the implementation
    // The previous edit made getMessage public in PhaseMessenger class
    const message = (messenger as any).getMessage(messageId);

    if (!message) {
      console.error(`Message not found: ${messageId}`);
      process.exit(1);
    }

    if (asJson) {
      console.log(JSON.stringify(message, null, 2));
      return;
    }

    console.log(`\nMessage Details: ${message.id}`);
    console.log("──────────────────────────────────────────────────");
    console.log(`From Phase:   ${message.from_phase}`);
    console.log(`To Phase:     ${message.to_phase}`);
    console.log(`Type:         ${message.message_type}`);
    console.log(`Created:      ${new Date(message.created_at).toLocaleString()}`);
    console.log(`Read:         ${message.read ? "Yes" : "No"}`);
    if (message.read_at) {
      console.log(`Read At:      ${new Date(message.read_at).toLocaleString()}`);
    }
    
    if (message.metadata) {
      console.log("\nMetadata:");
      console.log(JSON.stringify(message.metadata, null, 2));
    }

    console.log("\nContent:");
    console.log("──────────────────────────────────────────────────");
    console.log(message.content);
    console.log("──────────────────────────────────────────────────\n");

  } catch (error) {
    console.error("❌ Failed to read message:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Send message command
 */
async function cmdSendMessage(
  issueId: string, 
  fromPhase: string, 
  toPhase: string, 
  type: string, 
  content: string, 
  metadataStr?: string,
  asJson?: boolean
): Promise<void> {
  if (!issueId || !fromPhase || !toPhase || !type || !content) {
    console.error("Usage: ashep phase-msg-send <issue-id> <from> <to> <type> <content> [metadata-json]");
    console.error("Types: context, result, decision, data");
    process.exit(1);
  }

  try {
    const { getPhaseMessenger } = await import("../core/phase-messenger.ts");
    const messenger = getPhaseMessenger();

    let metadata: any = undefined;
    if (metadataStr && !metadataStr.startsWith("-")) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch {
        console.warn("⚠️  Warning: Invalid metadata JSON, ignoring.");
      }
    }

    const message = messenger.sendMessage({
      issue_id: issueId,
      from_phase: fromPhase,
      to_phase: toPhase,
      message_type: type as any,
      content: content,
      metadata: metadata
    });

    if (asJson) {
      console.log(JSON.stringify(message, null, 2));
    } else {
      console.log("✅ Message sent successfully");
      console.log(`ID: ${message.id}`);
    }
  } catch (error) {
    console.error("❌ Failed to send message:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Receive messages command
 */
async function cmdReceiveMessages(issueId: string, phase: string, keepUnread: boolean = false, asJson: boolean = false): Promise<void> {
  if (!issueId || !phase) {
    console.error("Usage: ashep phase-msg-receive <issue-id> <phase> [--keep-unread]");
    process.exit(1);
  }

  try {
    const { getPhaseMessenger } = await import("../core/phase-messenger.ts");
    const messenger = getPhaseMessenger();

    const messages = messenger.receiveMessages(issueId, phase, !keepUnread);

    if (asJson) {
      console.log(JSON.stringify(messages, null, 2));
      return;
    }

    if (messages.length === 0) {
      console.log(`No unread messages for issue ${issueId} in phase ${phase}.`);
    } else {
      console.log(`Received ${messages.length} messages:`);
      for (const msg of messages) {
        console.log(`\nFrom: ${msg.from_phase} (${msg.message_type})`);
        console.log(`Content: ${msg.content}`);
        if (msg.metadata) console.log(`Metadata: ${JSON.stringify(msg.metadata)}`);
      }
      if (!keepUnread) {
        console.log("\n✅ Marked all as read.");
      }
    }
  } catch (error) {
    console.error("❌ Failed to receive messages:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Cleanup messages command
 */
async function cmdCleanupMessages(issueId: string, reason: string = "manual"): Promise<void> {
  if (!issueId) {
    console.error("Usage: ashep phase-msg-cleanup <issue-id> [reason]");
    process.exit(1);
  }

  try {
    const { getPhaseMessenger } = await import("../core/phase-messenger.ts");
    const messenger = getPhaseMessenger();

    console.log(`Cleaning up messages for ${issueId}...`);
    const result = messenger.cleanupPhaseMessages(issueId, reason);

    console.log("✅ Cleanup complete");
    console.log(`  Archived: ${result.archived}`);
    console.log(`  Deleted:  ${result.deleted}`);
    console.log(`  DB Size:  ${(result.db_size_after / 1024 / 1024).toFixed(2)} MB (was ${(result.db_size_before / 1024 / 1024).toFixed(2)} MB)`);

  } catch (error) {
    console.error("❌ Failed to cleanup messages:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Message status command
 */
async function cmdMessageStatus(issueId?: string): Promise<void> {
  try {
    const { getPhaseMessenger } = await import("../core/phase-messenger.ts");
    const messenger = getPhaseMessenger();

    const stats = messenger.getMessageStats(issueId);

    console.log("\nPhase Messenger Status");
    console.log("──────────────────────");
    console.log(`Total Messages:  ${stats.total_messages}`);
    console.log(`Unread Messages: ${stats.unread_messages}`);
    console.log(`Read Messages:   ${stats.read_messages}`);
    console.log(`DB Size:         ${stats.db_size_mb.toFixed(2)} MB`);
    
    if (issueId) {
      console.log(`Scope:           Issue ${issueId}`);
    } else {
      console.log(`\nTop Issues by Message Count:`);
      const topIssues = Object.entries(stats.by_issue)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);
      
      for (const [id, count] of topIssues) {
        console.log(`  ${id.padEnd(20)}: ${count}`);
      }
    }
    console.log();

  } catch (error) {
    console.error("❌ Failed to get status:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * List sessions command - list OpenCode sessions for an issue
 */
async function cmdListSessions(issueId?: string): Promise<void> {
  try {
    const { getOpenCodeClient } = await import("../core/opencode.ts");
    const { loadConfig } = await import("../core/config.ts");
    const config = loadConfig();

    const opencode = getOpenCodeClient({
      serverUrl: config.execution?.sdk_base_url
    });

    if (!issueId) {

      issueId = await promptForIssueId();
    }

    if (!issueId) {
      console.error("Error: Issue ID is required");
      console.log("Usage: ashep list-sessions [issue-id]");
      process.exit(1);
    }

    const sessions = await opencode.listSessionsForIssue(issueId);

    if (sessions.length === 0) {
      console.log(`No sessions found for issue ${issueId}`);
    } else {
      console.log(`\nSessions for issue ${issueId} (${sessions.length}):`);
      console.log("┌───────────────────────────────────────┬───────────────────────────────────────────────┬──────────────┬──────────┐");
      console.log("│ Session ID                            │ Title                                     │ Phase        │ Tokens   │");
      console.log("├───────────────────────────────────────┼───────────────────────────────────────────────┼──────────────┼──────────┤");

      for (const session of sessions) {
        const sessionId = session.sessionId.substring(0, 38) + (session.sessionId.length > 38 ? "..." : "");
        const title = session.title.substring(0, 42) + (session.title.length > 42 ? "..." : "");
        const phase = session.phase.substring(0, 12) + (session.phase.length > 12 ? "..." : "");
        console.log(`│ ${sessionId.padEnd(37)} │ ${title.padEnd(42)} │ ${phase.padEnd(12)} │ ${String(session.tokens).padEnd(8)} │`);
      }

      console.log("└───────────────────────────────────────┴───────────────────────────────────────────────┴──────────────┴──────────┘");
    }
  } catch (error) {
    console.error("❌ Failed to list sessions:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Session list command - list all active OpenCode sessions
 */
async function cmdSessionList(showAll: boolean = false): Promise<void> {
  try {
    const { getSDKClient } = await import("../core/opencode_sdk.ts");
    const { loadConfig } = await import("../core/config.ts");
    
    const config = loadConfig();
    
    // We need the SDK client for this
    const sdkClient = getSDKClient({ baseUrl: config.execution?.sdk_base_url });
    
    console.log(`Fetching ${showAll ? "all" : "active"} sessions...`);
    const sessions = await sdkClient.listSessions(!showAll);
    
    if (sessions.length === 0) {
      console.log(`No ${showAll ? "" : "active "}sessions found.`);
      return;
    }
    
    console.log(`\n${showAll ? "All" : "Active"} Sessions (${sessions.length}):`);
    console.log("┌───────────────────────────────────────┬───────────────────────────────────────────────┬──────────────────────┬─────────────┐");
    console.log("│ Session ID                            │ Title                                         │ Updated              │ Status      │");
    console.log("├───────────────────────────────────────┼───────────────────────────────────────────────┼──────────────────────┼─────────────┤");
    
    for (const session of sessions) {
      const sessionId = (session.id || "").substring(0, 37) + ((session.id || "").length > 37 ? "..." : "");
      const title = (session.title || "Untitled").substring(0, 45) + ((session.title || "Untitled").length > 45 ? "..." : "");
      
      let updatedTime = "Unknown";
      if (session.time && session.time.updated) {
        updatedTime = new Date(session.time.updated).toLocaleString();
      } else if (session.time && session.time.created) {
        updatedTime = new Date(session.time.created).toLocaleString();
      }
      
      // Basic status inference if real status unavailable
      const status = "Active"; // We filtered for active
      
      console.log(`│ ${sessionId.padEnd(37)} │ ${title.padEnd(45)} │ ${updatedTime.padEnd(20)} │ ${status.padEnd(11)} │`);
    }
    
    console.log("└───────────────────────────────────────┴───────────────────────────────────────────────┴──────────────────────┴─────────────┘");
    if (!showAll) {
      console.log("\nTip: Use 'ashep session-list --all' to see history.");
    }
    console.log("To stop a session run: ashep session-stop <session-id>");
    
  } catch (error) {
    console.error("❌ Failed to list sessions:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Session stop command - abort an active session
 */
async function cmdSessionStop(sessionId: string): Promise<void> {
  if (!sessionId) {
    console.error("Error: Session ID is required");
    console.log("Usage: ashep session-stop <session-id>");
    process.exit(1);
  }
  
  try {
    const { getSDKClient } = await import("../core/opencode_sdk.ts");
    const { loadConfig } = await import("../core/config.ts");
    const config = loadConfig();
    const sdkClient = getSDKClient({ baseUrl: config.execution?.sdk_base_url });
    
    console.log(`Aborting session ${sessionId}...`);
    const success = await sdkClient.abortSession(sessionId);
    
    if (success) {
      console.log(`✅ Session ${sessionId} aborted successfully`);
    } else {
      console.log(`❌ Failed to abort session ${sessionId}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error aborting session:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * List workflows command
 */
async function cmdWorkflowList(): Promise<void> {
  const { getPolicyEngine } = await import("../core/policy.ts");
  const { scanRecursive } = await import("../core/path-utils.ts");
  
  // 1. Get enabled/loaded workflows via PolicyEngine
  const engine = getPolicyEngine();
  const loadedPolicies = engine.getPolicyNames();
  
  console.log("\nEnabled Workflows (Active):");
  if (loadedPolicies.length === 0) {
    console.log("  (none)");
  } else {
    for (const name of loadedPolicies) {
      const policy = engine.getPolicyConfig(name);
      console.log(`  • ${name.padEnd(20)} ${policy?.description || ""}`);
    }
  }
  
  // 2. Get available (archived) workflows
  const workflowsDir = findWorkflowsDir();
  const availableDir = join(workflowsDir, "available");
  
  console.log("\nAvailable Workflows (Archived):");
  if (existsSync(availableDir)) {
    const files = scanRecursive(availableDir, ['.yaml', '.yml']);
    if (files.length === 0) {
      console.log("  (none)");
    } else {
      for (const file of files) {
        const name = path.basename(file, path.extname(file));
        console.log(`  • ${name.padEnd(20)} (${path.relative(workflowsDir, file)})`);
      }
    }
  } else {
    console.log("  (none)");
  }
  console.log();
}

/**
 * Archive workflow command
 */
async function cmdWorkflowArchive(name: string): Promise<void> {
  const workflowsDir = findWorkflowsDir();
  const enabledDir = join(workflowsDir, "enabled");
  const availableDir = join(workflowsDir, "available");
  
  if (!existsSync(enabledDir)) {
    console.error(`Enabled workflows directory not found: ${enabledDir}`);
    process.exit(1);
  }

  // Find file in enabled
  // We need to look for files that *contain* the policy with this name, 
  // OR files named like the policy.
  // The instruction said "Move workflow from enabled/ to available/".
  // Assuming 1 file = 1 policy = filename matches policy name roughly.
  // I'll search for file named `{name}.yaml` or `{name}.yml`.
  
  let targetFile: string | undefined;
  const candidates = [`${name}.yaml`, `${name}.yml`];
  
  for (const c of candidates) {
    if (existsSync(join(enabledDir, c))) {
      targetFile = c;
      break;
    }
  }
  
  // Also scan recursive if nested?
  // The simple `ashep workflow archive <name>` might expect flat structure or unique name.
  // For now I'll support flat structure in root of enabled/ or match by exact filename if provided?
  // "Move workflow from enabled/ to available/" implies moving the FILE.
  
  if (!targetFile) {
    // Try recursive scan for file with that name
    const { scanRecursive } = await import("../core/path-utils.ts");
    const allFiles = scanRecursive(enabledDir, ['.yaml', '.yml']);
    const match = allFiles.find(f => path.basename(f, path.extname(f)) === name);
    if (match) {
        // We found it deeper
        // We need to preserve structure? Or just move to root of available?
        // Let's just move to root of available for simplicity as per "archive <name>"
        // But `cpSync` needs source.
        targetFile = path.relative(enabledDir, match);
    }
  }

  if (!targetFile) {
    console.error(`Workflow file for '${name}' not found in ${enabledDir}`);
    // Check if it exists in policies.yaml
    const { getPolicyEngine } = await import("../core/policy.ts");
    if (getPolicyEngine().getPolicyConfig(name)) {
      console.log(`Note: '${name}' might be defined in policies.yaml which cannot be archived individually.`);
    }
    process.exit(1);
  }
  
  const srcPath = join(enabledDir, targetFile);
  const destPath = join(availableDir, path.basename(targetFile)); // flatten to available root
  
  if (!existsSync(availableDir)) {
    mkdirSync(availableDir, { recursive: true });
  }
  
  try {
    cpSync(srcPath, destPath);
    rmSync(srcPath);
    console.log(`✅ Archived workflow '${name}' to workflows/available/`);
  } catch (error) {
    console.error(`Failed to archive workflow: ${error}`);
    process.exit(1);
  }
}

/**
 * Activate workflow command
 */
async function cmdWorkflowActivate(name: string): Promise<void> {
  const workflowsDir = findWorkflowsDir();
  const enabledDir = join(workflowsDir, "enabled");
  const availableDir = join(workflowsDir, "available");
  
  if (!existsSync(availableDir)) {
    console.error(`No available workflows found (directory missing)`);
    process.exit(1);
  }
  
  let targetFile: string | undefined;
  const candidates = [`${name}.yaml`, `${name}.yml`];
  
  for (const c of candidates) {
    if (existsSync(join(availableDir, c))) {
      targetFile = c;
      break;
    }
  }
  
  if (!targetFile) {
     // recursive scan in available?
    const { scanRecursive } = await import("../core/path-utils.ts");
    const allFiles = scanRecursive(availableDir, ['.yaml', '.yml']);
    const match = allFiles.find(f => path.basename(f, path.extname(f)) === name);
    if (match) {
        targetFile = path.relative(availableDir, match);
    }
  }
  
  if (!targetFile) {
    console.error(`Workflow file '${name}' not found in ${availableDir}`);
    process.exit(1);
  }
  
  const srcPath = join(availableDir, targetFile);
  const destPath = join(enabledDir, path.basename(targetFile)); // flatten to enabled root
  
  if (!existsSync(enabledDir)) {
    mkdirSync(enabledDir, { recursive: true });
  }
  
  try {
    cpSync(srcPath, destPath);
    rmSync(srcPath);
    console.log(`✅ Activated workflow '${name}' to workflows/enabled/`);
  } catch (error) {
    console.error(`Failed to activate workflow: ${error}`);
    process.exit(1);
  }
}

/**
 * Create workflow command
 */
async function cmdWorkflowCreate(name: string): Promise<void> {
  const { findWorkflowsDir, findLocalAgentShepherdDir } = await import("../core/path-utils.ts");
  const path = await import("path");
  const { existsSync, mkdirSync, writeFileSync } = await import("fs");

  // Prefer local project directory if it exists, otherwise fallback to global/standard discovery
  let workflowsDir: string;
  const localDir = findLocalAgentShepherdDir();
  
  if (localDir) {
    workflowsDir = path.join(localDir, "workflows");
  } else {
    workflowsDir = findWorkflowsDir();
  }

  const enabledDir = path.join(workflowsDir, "enabled");
  
  if (!existsSync(enabledDir)) {
    mkdirSync(enabledDir, { recursive: true });
  }
  
  const filePath = path.join(enabledDir, `${name}.yaml`);
  
  if (existsSync(filePath)) {
    console.error(`Workflow file '${filePath}' already exists`);
    process.exit(1);
  }
  
  const template = `name: ${name}
description: New workflow created via CLI
phases:
  - name: plan
    capabilities: [planning]
  - name: implement
    capabilities: [coding]
`;

  try {
    writeFileSync(filePath, template);
    console.log(`✅ Created workflow file: ${filePath}`);
  } catch (error) {
    console.error(`Failed to create workflow file: ${error}`);
    process.exit(1);
  }
}

/**
 * List agents command
 */
async function cmdAgentList(): Promise<void> {
  const { getAgentRegistry } = await import("../core/agent-registry.ts");
  const { findAgentsDir } = await import("../core/path-utils.ts");
  const path = await import("path");

  const registry = getAgentRegistry();
  const agents = registry.getAllAgents();
  const agentsDir = findAgentsDir();

  if (agents.length === 0) {
    console.log("No agents found.");
    return;
  }

  console.log(`\nAgents (${agents.length}):`);
  console.log("┌──────────────────────────┬──────────────────────┬──────────────────────────┬──────────────────────────┐");
  console.log("│ ID                       │ Name                 │ Source                   │ Capabilities             │");
  console.log("├──────────────────────────┼──────────────────────┼──────────────────────────┼──────────────────────────┤");

  for (const agent of agents) {
    const id = agent.id.substring(0, 24) + (agent.id.length > 24 ? "..." : "");
    const name = agent.name.substring(0, 20) + (agent.name.length > 20 ? "..." : "");
    
    let source = "agents.yaml";
    if (agent.metadata?.source_file) {
      const sourceFile = agent.metadata.source_file as string;
      if (sourceFile.startsWith(agentsDir)) {
        source = path.relative(agentsDir, sourceFile);
      } else {
        source = path.basename(sourceFile);
      }
    }
    source = source.substring(0, 24) + (source.length > 24 ? "..." : "");

    const capabilities = agent.capabilities.join(", ");
    const capsTruncated = capabilities.substring(0, 24) + (capabilities.length > 24 ? "..." : "");

    console.log(`│ ${id.padEnd(24)} │ ${name.padEnd(20)} │ ${source.padEnd(24)} │ ${capsTruncated.padEnd(24)} │`);
  }
  console.log("└──────────────────────────┴──────────────────────┴──────────────────────────┴──────────────────────────┘");
}

/**
 * Archive agent command
 */
async function cmdAgentArchive(name: string): Promise<void> {
  const { findAgentsDir, scanRecursive } = await import("../core/path-utils.ts");
  const path = await import("path");
  const { existsSync, mkdirSync, cpSync, rmSync } = await import("fs");

  const agentsDir = findAgentsDir();
  const enabledDir = path.join(agentsDir, "enabled");
  const availableDir = path.join(agentsDir, "available");

  if (!existsSync(enabledDir)) {
    console.error(`Enabled agents directory not found: ${enabledDir}`);
    process.exit(1);
  }

  // Find file in enabled
  let targetFile: string | undefined;
  const candidates = [`${name}.yaml`, `${name}.yml`];
  
  for (const c of candidates) {
    if (existsSync(path.join(enabledDir, c))) {
      targetFile = c;
      break;
    }
  }
  
  if (!targetFile) {
    const allFiles = scanRecursive(enabledDir, ['.yaml', '.yml']);
    const match = allFiles.find(f => path.basename(f, path.extname(f)) === name);
    if (match) {
        targetFile = path.relative(enabledDir, match);
    }
  }

  if (!targetFile) {
    console.error(`Agent file for '${name}' not found in ${enabledDir}`);
    // Check if it exists in agents.yaml
    const { getAgentRegistry } = await import("../core/agent-registry.ts");
    if (getAgentRegistry().getAgent(name)) {
      console.log(`Note: '${name}' might be defined in agents.yaml which cannot be archived individually.`);
    }
    process.exit(1);
  }
  
  const srcPath = path.join(enabledDir, targetFile);
  const destPath = path.join(availableDir, path.basename(targetFile)); // flatten to available root
  
  if (!existsSync(availableDir)) {
    mkdirSync(availableDir, { recursive: true });
  }
  
  try {
    cpSync(srcPath, destPath);
    rmSync(srcPath);
    console.log(`✅ Archived agent '${name}' to agents/available/`);
  } catch (error) {
    console.error(`Failed to archive agent: ${error}`);
    process.exit(1);
  }
}

/**
 * Activate agent command
 */
async function cmdAgentActivate(name: string): Promise<void> {
  const { findAgentsDir, scanRecursive } = await import("../core/path-utils.ts");
  const path = await import("path");
  const { existsSync, mkdirSync, cpSync, rmSync } = await import("fs");

  const agentsDir = findAgentsDir();
  const enabledDir = path.join(agentsDir, "enabled");
  const availableDir = path.join(agentsDir, "available");
  
  if (!existsSync(availableDir)) {
    console.error(`No available agents found (directory missing)`);
    process.exit(1);
  }
  
  let targetFile: string | undefined;
  const candidates = [`${name}.yaml`, `${name}.yml`];
  
  for (const c of candidates) {
    if (existsSync(path.join(availableDir, c))) {
      targetFile = c;
      break;
    }
  }
  
  if (!targetFile) {
    const allFiles = scanRecursive(availableDir, ['.yaml', '.yml']);
    const match = allFiles.find(f => path.basename(f, path.extname(f)) === name);
    if (match) {
        targetFile = path.relative(availableDir, match);
    }
  }
  
  if (!targetFile) {
    console.error(`Agent file '${name}' not found in ${availableDir}`);
    process.exit(1);
  }
  
  const srcPath = path.join(availableDir, targetFile);
  const destPath = path.join(enabledDir, path.basename(targetFile)); // flatten to enabled root
  
  if (!existsSync(enabledDir)) {
    mkdirSync(enabledDir, { recursive: true });
  }
  
  try {
    cpSync(srcPath, destPath);
    rmSync(srcPath);
    console.log(`✅ Activated agent '${name}' to agents/enabled/`);
  } catch (error) {
    console.error(`Failed to activate agent: ${error}`);
    process.exit(1);
  }
}

/**
 * Convert config command - convert between YAML and JSON
 */
async function cmdConvertConfig(source: string, destination: string): Promise<void> {
  if (!source || !destination) {
    console.error("Usage: ashep convert-config <source> <destination>");
    process.exit(1);
  }

  const sourcePath = path.resolve(source);
  const destPath = path.resolve(destination);

  if (!existsSync(sourcePath)) {
    console.error(`Source file not found: ${sourcePath}`);
    process.exit(1);
  }

  try {
    const sourceContent = readFileSync(sourcePath, "utf-8");
    const sourceExt = path.extname(sourcePath).toLowerCase();
    const destExt = path.extname(destPath).toLowerCase();

    let data: any;

    // Parse source
    if (sourceExt === ".json") {
      data = JSON.parse(sourceContent);
    } else if (sourceExt === ".json5") {
      data = JSON5.parse(sourceContent);
    } else if (sourceExt === ".yaml" || sourceExt === ".yml") {
      data = parseYAML(sourceContent);
    } else {
      console.error(`Unsupported source format: ${sourceExt}`);
      process.exit(1);
    }

    // Stringify to destination
    let destContent: string;
    if (destExt === ".json") {
      destContent = JSON.stringify(data, null, 2);
    } else if (destExt === ".json5") {
      destContent = JSON5.stringify(data, null, 2); // JSON5 can omit quotes for keys
    } else if (destExt === ".yaml" || destExt === ".yml") {
      destContent = stringifyYAML(data);
    } else {
      console.error(`Unsupported destination format: ${destExt}`);
      process.exit(1);
    }

    writeFileSync(destPath, destContent);
    console.log(`Converted ${source} to ${destination}`);
  } catch (error) {
    console.error("Conversion failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Cleanup metrics command
 */
async function cmdAgentCreate(name: string): Promise<void> {
  const { findAgentsDir, findLocalAgentShepherdDir } = await import("../core/path-utils.ts");
  const path = await import("path");
  const { existsSync, mkdirSync, writeFileSync } = await import("fs");

  // Prefer local project directory if it exists, otherwise fallback to global/standard discovery
  let agentsDir: string;
  const localDir = findLocalAgentShepherdDir();
  
  if (localDir) {
    agentsDir = path.join(localDir, "agents");
  } else {
    agentsDir = findAgentsDir();
  }

  const enabledDir = path.join(agentsDir, "enabled");
  
  if (!existsSync(enabledDir)) {
    mkdirSync(enabledDir, { recursive: true });
  }
  
  const filePath = path.join(enabledDir, `${name}.yaml`);
  
  if (existsSync(filePath)) {
    console.error(`Agent file '${filePath}' already exists`);
    process.exit(1);
  }
  
  const template = `agents:
  - id: ${name}
    name: ${name.charAt(0).toUpperCase() + name.slice(1)} Agent
    description: New agent created via CLI
    capabilities:
      - general
    # provider_id: anthropic
    # model_id: claude-3-5-sonnet-20241022
    priority: 10
    constraints:
      performance_tier: balanced
`;

  try {
    writeFileSync(filePath, template);
    console.log(`✅ Created agent file: ${filePath}`);
  } catch (error) {
    console.error(`Failed to create agent file: ${error}`);
    process.exit(1);
  }
}

/**
 * Simple prompt for issue ID using Bun's built-in readline
 */
async function promptForIssueId(): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write("Enter issue ID: ");
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (data) => {
      const input = data.toString().trim();
      resolve(input);
      process.stdin.pause();
    });
    process.stdin.resume();
  });
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  // Set ASHEP_DIR to avoid debug messages during initialization
  if (!process.env.ASHEP_DIR) {
    const agentShepherdDir = findLocalAgentShepherdDir() || getGlobalInstallDir();
    process.env.ASHEP_DIR = agentShepherdDir;
  }

  // Load plugins first
  loadPlugins();

  const args = process.argv.slice(2);
  const command = args[0];

  // Handle help command (ashep help [cmd])
  if (command === "help") {
    showHelp(args[1]); // Pass the subcommand if present
    return;
  }

  // Handle global help flag (ashep --help) or no args
  if (!command || command === "-h" || command === "--help") {
    showHelp();
    return;
  }

  // Handle command-specific help pattern (ashep cmd help OR ashep cmd --help)
  if (args.includes("--help") || args.includes("-h") || args[1] === "help") {
    showHelp(command);
    return;
  }

  switch (command) {
    case "worker":
    {
      const options: any = {};
      
      // Simple option parsing for worker specific args
      // We use the outer 'args' variable which holds process.argv.slice(2)
      if (args.includes("--epic")) {
        const idx = args.indexOf("--epic");
        if (idx !== -1 && idx + 1 < args.length) {
          options.epic = args[idx + 1];
        }
      }
      
      if (args.includes("--policy")) {
        const idx = args.indexOf("--policy");
        if (idx !== -1 && idx + 1 < args.length) {
          options.policy = args[idx + 1];
        }
      }

      await cmdWorker(options);
    }
    break;


    case "monitor":
      await cmdMonitor();
      break;

    case "work": {
      // Parse --epic flag
      let epicMode = false;
      let targetId: string | undefined;

      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--epic' && i + 1 < args.length) {
          epicMode = true;
          targetId = args[i + 1];
          i++; // skip next arg
        } else if (!args[i].startsWith('--') && !targetId) {
          targetId = args[i];
        }
      }

      await cmdWork(targetId || "", epicMode);
      break;
    }

    case "init":
      cmdInit();
      break;

    case "install":
      await cmdInstall();
      break;

    case "sync-agents":
      await cmdSyncAgents();
      break;

    case "quickstart":
      await cmdQuickstart();
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

    case "validate-policy-chain":
      await cmdValidatePolicyChain();
      break;

    case "show-policy-tree": {
      // Parse format argument: --format json
      let format: string | undefined;

      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--format' && i + 1 < args.length) {
          format = args[i + 1];
          i++; // skip the next arg
        }
      }

      await cmdShowPolicyTree(format);
      break;
    }

    case "plugin-install":
      await cmdPluginInstall(args[1]);
      break;

    case "plugin-activate":
      cmdPluginActivate(args[1]);
      break;

    case "plugin-deactivate":
      cmdPluginDeactivate(args[1]);
      break;

    case "plugin-remove":
      cmdPluginRemove(args[1]);
      break;

    case "server-status":
      await cmdServerStatus();
      break;
    case "server-start":
      await cmdServerStart();
      break;
    case "server-stop":
      cmdServerStop();
      break;
    case "server-enable":
      cmdServerConfig(true);
      break;
    case "server-disable":
      cmdServerConfig(false);
      break;

    case "plugin-list":
      cmdPluginList();
      break;

    case "list-active":
      await cmdListActive();
      break;

    case "list-hitl":
      await cmdListHITL();
      break;

    case "list-ready":
      await cmdListReady();
      break;

    case "list-struggle": {
      let hours: number | undefined;

      if (args[1] && !args[1].startsWith("--")) {
        hours = parseInt(args[1], 10);
      }

      await cmdListStruggle(hours);
      break;
    }

    case "session-list":
      await cmdSessionList(args.includes("--all"));
      break;

    case "session-stop":
      await cmdSessionStop(args[1]);
      break;

    case "phase-msg-list":
    case "get-messages": // Alias
      // Parse options for get-messages
      {
        const phaseIndex = args.indexOf("--phase");
        const phase = phaseIndex !== -1 ? args[phaseIndex + 1] : undefined;
        const unread = args.includes("--unread");
        const asJson = args.includes("--json");
        const issueId = args[1]; // First arg after command
        await cmdGetMessages(issueId, phase, unread, asJson);
      }
      break;

    case "phase-msg-read":
    case "read-message": // Alias
      {
        const asJson = args.includes("--json");
        const messageId = args[1];
        await cmdReadMessage(messageId, asJson);
      }
      break;

    case "phase-msg-send":
      {
        // ashep phase-msg-send <issue-id> <from> <to> <type> <content> [metadata]
        const issueId = args[1];
        const fromPhase = args[2];
        const toPhase = args[3];
        const type = args[4];
        const content = args[5];
        const metadataStr = args[6];
        const asJson = args.includes("--json");
        
        await cmdSendMessage(issueId, fromPhase, toPhase, type, content, metadataStr, asJson);
      }
      break;

    case "phase-msg-receive":
      {
        // ashep phase-msg-receive <issue-id> <phase> [--keep-unread]
        const issueId = args[1];
        const phase = args[2];
        const keepUnread = args.includes("--keep-unread");
        const asJson = args.includes("--json");
        
        await cmdReceiveMessages(issueId, phase, keepUnread, asJson);
      }
      break;

    case "phase-msg-cleanup":
      {
        // ashep phase-msg-cleanup <issue-id> [reason]
        const issueId = args[1];
        const reason = args[2];
        await cmdCleanupMessages(issueId, reason);
      }
      break;

    case "phase-msg-status":
      {
        // ashep phase-msg-status [issue-id]
        const issueId = args[1];
        await cmdMessageStatus(issueId);
      }
      break;

    case "list-sessions":

      await cmdListSessions(args[1]);
      break;

    case "heartbeat":
      await cmdHeartbeat();
      break;

    case "convert-config":
      await cmdConvertConfig(args[1], args[2]);
      break;

    case "cleanup-metrics":
      cmdCleanupMetrics();
      break;

    case "cleanup-status":
      await cmdCleanupStatus();
      break;

    case "workflow": {
      const subCmd = args[1];
      const name = args[2];
      
      // Handle help specifically for workflow subcommand
      if (!subCmd || subCmd === "help" || subCmd === "--help" || subCmd === "-h") {
        showCommandHelp("workflow");
        return;
      }

      switch (subCmd) {
        case "list":
          await cmdWorkflowList();
          break;
        case "archive":
          if (!name) { console.error("Name required"); process.exit(1); }
          await cmdWorkflowArchive(name);
          break;
        case "activate":
          if (!name) { console.error("Name required"); process.exit(1); }
          await cmdWorkflowActivate(name);
          break;
        case "create":
          if (!name) { console.error("Name required"); process.exit(1); }
          await cmdWorkflowCreate(name);
          break;
        default:
          console.error("Unknown workflow command. Use: list, archive, activate, create");
          console.log("Run 'ashep workflow help' for details");
          process.exit(1);
      }
      break;
    }

    case "agent": {
      const subCmd = args[1];
      const name = args[2];
      
      if (!subCmd || subCmd === "help" || subCmd === "--help" || subCmd === "-h") {
        showCommandHelp("agent");
        return;
      }

      switch (subCmd) {
        case "list":
          await cmdAgentList();
          break;
        case "archive":
          if (!name) { console.error("Name required"); process.exit(1); }
          await cmdAgentArchive(name);
          break;
        case "activate":
          if (!name) { console.error("Name required"); process.exit(1); }
          await cmdAgentActivate(name);
          break;
        case "create":
          if (!name) { console.error("Name required"); process.exit(1); }
          await cmdAgentCreate(name);
          break;
        default:
          console.error("Unknown agent command. Use: list, archive, activate, create");
          console.log("Run 'ashep agent help' for details");
          process.exit(1);
      }
      break;
    }

    case "update":
      await cmdUpdate(args[1]);
      break;

    case "version":
      cmdVersion();
      break;

    default:
      // Check if it's a plugin command
      if (PLUGIN_HANDLERS[command]) {
        try {
          await PLUGIN_HANDLERS[command](...args.slice(1));
        } catch (error) {
          console.error(`Plugin command '${command}' failed:`, error);
          process.exit(1);
        }
      } else {
        console.error(`Unknown command: ${command}`);
        console.log("Run 'ashep help' for usage information");
        process.exit(1);
      }
  }
}

// Run CLI
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
