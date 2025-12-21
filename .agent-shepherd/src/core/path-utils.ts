import { existsSync } from "fs";
import { join, dirname } from "path";

/**
 * Find the .agent-shepherd directory by walking up from the current working directory
 * @returns The absolute path to the .agent-shepherd directory
 * @throws Error if .agent-shepherd directory is not found
 */
export function findAgentShepherdDir(): string {
  let currentDir = process.cwd();

  while (true) {
    const agentShepherdDir = join(currentDir, ".agent-shepherd");
    if (existsSync(agentShepherdDir)) {
      return agentShepherdDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached root without finding .agent-shepherd
      break;
    }
    currentDir = parentDir;
  }

  throw new Error(".agent-shepherd directory not found. Please run 'ashep init' or ensure you're in a project with Agent Shepherd initialized.");
}

/**
 * Get the config directory path
 * @returns The absolute path to the config directory
 */
export function getConfigDir(): string {
  return join(findAgentShepherdDir(), "config");
}

/**
 * Get the path to a config file
 * @param filename The config filename (e.g., "config.yaml")
 * @returns The absolute path to the config file
 */
export function getConfigPath(filename: string): string {
  const newPath = join(getConfigDir(), filename);
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