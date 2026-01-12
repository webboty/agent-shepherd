import { existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

export function getGlobalInstallDir(): string {
  return join(homedir(), ".agent-shepherd");
}

export function findLocalAgentShepherdDir(): string | null {
  let currentDir = process.cwd();
  const visited = new Set<string>();
  
  while (true) {
    // Prevent infinite loops
    if (visited.has(currentDir)) {
      break;
    }
    visited.add(currentDir);
    
    const agentShepherdDir = join(currentDir, ".agent-shepherd");
    if (existsSync(agentShepherdDir)) {
      // Check if this has src/ (to distinguish install directory from runtime directory)
      const hasSrc = existsSync(join(agentShepherdDir, "src"));
      if (hasSrc) {
        return agentShepherdDir;
      }
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return null;
}

export function findInstallDir(): string {
  const envOverride = process.env.ASHEP_DIR;
  if (envOverride && existsSync(envOverride)) {
    return envOverride;
  }
  // Check for local full install (has src/)
  const local = findLocalAgentShepherdDir();
  if (local && existsSync(join(local, "src"))) {
    return local;
  }
  // Fall back to global
  const global = getGlobalInstallDir();
  if (existsSync(global)) {
    return global;
  }
  throw new Error("Agent Shepherd not installed. Run the installer or 'ashep init'");
}

export function findConfigDir(): string {
  const envOverride = process.env.ASHEP_DIR;
  if (envOverride && existsSync(join(envOverride, "config"))) {
    return join(envOverride, "config");
  }
  // Check for local config
  const local = findLocalAgentShepherdDir();
  if (local && existsSync(join(local, "config"))) {
    return join(local, "config");
  }
  // Fall back to global config
  const global = getGlobalInstallDir();
  const globalConfig = join(global, "config");
  if (existsSync(globalConfig)) {
    return globalConfig;
  }
  throw new Error("No configuration found. Run 'ashep init' in your project.");
}

export function findPluginsDir(): string {
  const envOverride = process.env.ASHEP_DIR;
  if (envOverride && existsSync(join(envOverride, "plugins"))) {
    return join(envOverride, "plugins");
  }
  const local = findLocalAgentShepherdDir();
  if (local && existsSync(join(local, "plugins"))) {
    return join(local, "plugins");
  }
  const global = getGlobalInstallDir();
  return join(global, "plugins");
}

// Legacy function - backward compatibility
export function findAgentShepherdDir(): string {
  const envOverride = process.env.ASHEP_DIR;
  if (envOverride && existsSync(envOverride)) {
    console.error(`DEBUG: Using ASHEP_DIR override: ${envOverride}`);
    return envOverride;
  }
  console.error(`DEBUG: ASHEP_DIR not set or path invalid, searching locally...`);
  const local = findLocalAgentShepherdDir();
  if (local) return local;
  const global = getGlobalInstallDir();
  if (existsSync(global)) return global;
  throw new Error(".agent-shepherd directory not found. Run the installer or 'ashep init'");
}

// Keep old functions for backward compatibility
export function getConfigDir(): string {
  return findConfigDir();
}

export function getConfigPath(filename: string): string {
  const newPath = join(findConfigDir(), filename);
  if (existsSync(newPath)) {
    return newPath;
  }

  // Fallback to old location for backward compatibility
  const agentShepherdDir = findAgentShepherdDir();
  const oldPath = join(agentShepherdDir, filename);
  if (existsSync(oldPath)) {
    return oldPath;
  }

  // Return new path (will be created when needed)
  return newPath;
}