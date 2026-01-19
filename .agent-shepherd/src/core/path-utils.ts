import { existsSync, readdirSync, statSync } from "fs";
import { join, dirname, extname, basename } from "path";
import { homedir } from "os";

export function getGlobalInstallDir(): string {
  return join(homedir(), ".agent-shepherd");
}

export function findLocalAgentShepherdDir(): string | null {
  let currentDir = process.cwd();
  
  // If we are already inside .agent-shepherd, return currentDir
  if (basename(currentDir) === ".agent-shepherd") {
    return currentDir;
  }

  const visited = new Set<string>();

  while (true) {
    // Prevent infinite loops
    if (visited.has(currentDir)) {
      break;
    }
    visited.add(currentDir);

    const agentShepherdDir = join(currentDir, ".agent-shepherd");
    if (existsSync(agentShepherdDir)) {
      // Found a .agent-shepherd directory - this is the local one we want
      // (regardless of whether it has src/ or not)
      return agentShepherdDir;
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
  // Check for local config (prioritize local project over global)
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

export function findWorkflowsDir(): string {
  const envOverride = process.env.ASHEP_DIR;
  if (envOverride && existsSync(join(envOverride, "workflows"))) {
    return join(envOverride, "workflows");
  }
  const local = findLocalAgentShepherdDir();
  if (local && existsSync(join(local, "workflows"))) {
    return join(local, "workflows");
  }
  const global = getGlobalInstallDir();
  return join(global, "workflows");
}

export function findAgentsDir(): string {
  const envOverride = process.env.ASHEP_DIR;
  if (envOverride && existsSync(join(envOverride, "agents"))) {
    return join(envOverride, "agents");
  }
  const local = findLocalAgentShepherdDir();
  if (local && existsSync(join(local, "agents"))) {
    return join(local, "agents");
  }
  const global = getGlobalInstallDir();
  return join(global, "agents");
}

// Legacy function - backward compatibility
export function findAgentShepherdDir(): string {
  const envOverride = process.env.ASHEP_DIR;
  if (envOverride && existsSync(envOverride)) {
    return envOverride;
  }
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

/**
 * Recursively scan directory for files with specific extensions
 */
export function scanRecursive(dir: string, extensions: string[] = []): string[] {
  let results: string[] = [];
  
  if (!existsSync(dir)) {
    return results;
  }

  const list = readdirSync(dir);
  
  for (const file of list) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    
    if (stat && stat.isDirectory()) {
      results = results.concat(scanRecursive(filePath, extensions));
    } else {
      if (extensions.length === 0) {
        results.push(filePath);
      } else {
        const ext = extname(file).toLowerCase();
        if (extensions.includes(ext)) {
          results.push(filePath);
        }
      }
    }
  }
  return results;
}
