#!/usr/bin/env bun
/**
 * Agent Shepherd CLI
 * Main entry point for all commands
 */

import { getWorkerEngine } from "../core/worker-engine.ts";
import { getMonitorEngine } from "../core/monitor-engine.ts";
import { getIssue } from "../core/beads.ts";
import { findAgentShepherdDir } from "../core/path-utils.ts";
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import path from "path";
import { execSync } from "child_process";

const COMMANDS: Record<string, string> = {
  worker: "Start the autonomous worker loop",
  monitor: "Start the supervision loop",
  work: "Manually process a specific issue",
  init: "Initialize .agent-shepherd configuration",
  install: "Check and install dependencies",
  "sync-agents": "Sync agent registry with OpenCode",
  ui: "Start the flow visualization server",
  "validate-policy-chain": "Validate policy-capability-agent chain integrity",
  "show-policy-tree": "Display policy-capability-agent relationship tree",
  quickstart: "One-command onboarding with dependencies, configs, and demo workflow",
  "plugin-install": "Install a plugin from path or URL",
  "plugin-activate": "Activate a plugin",
  "plugin-deactivate": "Deactivate a plugin",
  "plugin-remove": "Remove a plugin",
  "plugin-list": "List installed plugins",
  help: "Show help information",
};

// Plugin command handlers registry
const PLUGIN_HANDLERS: Record<string, Function> = {};

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

          COMMANDS[cmd.name] = cmd.description;
          PLUGIN_HANDLERS[cmd.name] = handler;
        }

        console.log(`Loaded plugin: ${manifest.name} v${manifest.version}`);
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
function showHelp(): void {
  console.log(`
Agent Shepherd - AI Coding Agent Orchestration System

Usage: ashep <command> [options]

Commands:
${Object.entries(COMMANDS)
  .map(([cmd, desc]) => `  ${cmd.padEnd(15)} ${desc}`)
  .join("\n")}

 Examples:
    ashep quickstart          # One-command onboarding
    ashep init                # Initialize configuration
    ashep worker              # Start autonomous worker
    ashep work ISSUE-123      # Process specific issue
    ashep ui                  # Start visualization UI
    ashep validate-policy-chain  # Validate policy relationships
    ashep show-policy-tree    # Show relationship tree

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
  const pluginsDir = join(configDir, "plugins");

  // Create directories if they don't exist
  if (!existsSync(configSubDir)) {
    mkdirSync(configSubDir, { recursive: true });
    console.log(`Created directory: ${configSubDir}`);
  }

  if (!existsSync(pluginsDir)) {
    mkdirSync(pluginsDir, { recursive: true });
    console.log(`Created directory: ${pluginsDir}`);
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
 * Validate policy chain command - validate policy-capability-agent relationships
 */
async function cmdValidatePolicyChain(): Promise<void> {
  console.log("🔍 Validating policy-capability-agent chain...");

  try {
    // First validate basic configuration
    const { validateStartup } = await import("../core/config-validator.ts");
    await validateStartup();

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

      process.exit(1);
    } else {
      console.log("✅ All policy-capability-agent chains are valid");
    }
  } catch (error) {
    console.error("❌ Validation failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
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
      console.log(`  Capabilities: ${summary.totalCapabilities}`);
      console.log(`  Agents: ${summary.totalAgents}`);

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

      execSync(`cp -r "${sourcePath}" "${pluginPath}"`, { stdio: "inherit" });
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

    execSync(`rm -rf "${pluginPath}"`, { stdio: "inherit" });
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

      try {
        execSync("curl -fsSL https://get.beads.dev | bash", { stdio: "inherit" });
        // Update PATH for current session
        process.env.PATH = `${process.env.HOME}/.beads/bin:${process.env.PATH}`;
        console.log("✅ Beads installed successfully");
      } catch (error) {
        console.error("❌ Failed to install Beads:", error);
        console.log("   Please install Beads manually: curl -fsSL https://get.beads.dev | bash");
        dependenciesOk = false;
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

    // Step 4: Validate configuration
    console.log("\n🔍 Validating configuration...");
    await cmdValidatePolicyChain();

    // Step 5: Show demo workflow instructions
    console.log("\n📝 Demo workflow ready!");
    console.log("   To try a demo:");
    console.log("   1. Create an issue in Beads: bd create 'Demo: Implement greeting function'");
    console.log("   2. Process it: ashep work <issue-id>");
    console.log("   3. View progress: ashep ui");

    // Step 6: Show next steps
    console.log("\n🎉 Quickstart complete!");
    console.log("\nNext steps:");
    console.log("• Start the worker: ashep worker");
    console.log("• Start monitoring: ashep monitor");
    console.log("• View UI: ashep ui");
    console.log("• Process issues: ashep work <issue-id>");
    console.log("\nFor more help: ashep help");

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
 * Main CLI entry point
 */
async function main(): Promise<void> {
  // Load plugins first
  loadPlugins();

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

    case "plugin-list":
      cmdPluginList();
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
