/**
 * Preset Manager
 * Central management for preset operations: discovery, validation, installation, uninstallation
 */

import { existsSync, readFileSync, mkdirSync, copyFileSync, rmSync, statSync, readdirSync, writeFileSync } from "fs";
import { join, dirname, basename, sep } from "path";
import { findPresetsDir, findInstalledPresetsDir, scanRecursive, findAgentShepherdDir, findAgentsDir, findWorkflowsDir } from "./path-utils";
import { getLogger } from "./logging";

export interface PresetComponents {
  opencode_agents?: string[];
  agent_registries?: string[];
  workflows?: string[];
}

export interface PresetDependencies {
  opencode?: "installed" | string;
  beads?: "initialized" | string;
  [key: string]: string | undefined;
}

export interface PresetCompatibility {
  min_agent_shepherd_version?: string;
  [key: string]: string | undefined;
}

export interface PresetManifest {
  name: string;
  version: string;
  category: string;
  description: string;
  dependencies?: PresetDependencies;
  components?: PresetComponents;
  capabilities?: string[];
  tags?: string[];
  compatibility?: PresetCompatibility;
}

export interface PresetRegistryEntry {
  manifest: PresetManifest;
  path: string; // Path to the preset directory containing manifest.json
  installed: boolean;
  installed_version?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function compareVersions(v1: string, v2: string): number {
  const cleanV1 = v1.replace(/^v/, '');
  const cleanV2 = v2.replace(/^v/, '');
  const parts1 = cleanV1.split('.').map(p => parseInt(p, 10) || 0);
  const parts2 = cleanV2.split('.').map(p => parseInt(p, 10) || 0);

  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export class PresetManager {
  private presetsDir: string;
  private installedPresetsDir: string;

  constructor() {
    this.presetsDir = findPresetsDir();
    this.installedPresetsDir = findInstalledPresetsDir();
  }

  /**
   * List all available presets
   */
  list(): PresetRegistryEntry[] {
    if (!existsSync(this.presetsDir)) {
      return [];
    }

    const entries: PresetRegistryEntry[] = [];
    const jsonFiles = scanRecursive(this.presetsDir, [".json"]);
    
    // Filter for manifest.json files
    const manifestFiles = jsonFiles.filter(file => basename(file) === "manifest.json");

    for (const file of manifestFiles) {
      try {
        const content = readFileSync(file, "utf-8");
        const manifest = JSON.parse(content) as PresetManifest;
        
        // Basic validation
        if (!manifest.name || !manifest.version) {
          console.warn(`Skipping invalid preset manifest at ${file}: missing name or version`);
          continue;
        }

        const entry: PresetRegistryEntry = {
          manifest,
          path: dirname(file),
          installed: false
        };

        // Check installation status
        const installPath = join(this.installedPresetsDir, `${manifest.name}.json`);
        if (existsSync(installPath)) {
          try {
            const installedManifest = JSON.parse(readFileSync(installPath, "utf-8")) as PresetManifest;
            entry.installed = true;
            entry.installed_version = installedManifest.version;
          } catch (err) {
            console.warn(`Failed to read installed manifest for ${manifest.name}:`, err);
          }
        }

        entries.push(entry);
      } catch (error) {
        console.warn(`Failed to load preset manifest at ${file}:`, error);
      }
    }

    return entries;
  }

  /**
   * Get a specific preset by name
   */
  get(name: string): PresetRegistryEntry | null {
    const presets = this.list();
    return presets.find(p => p.manifest.name === name) || null;
  }

  /**
   * Validate a preset's dependencies and compatibility
   */
  validate(name: string, workspaceRoot: string = process.cwd()): ValidationResult {
    const entry = this.get(name);
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: []
    };

    if (!entry) {
      result.valid = false;
      result.errors.push(`Preset '${name}' not found`);
      return result;
    }

    const manifest = entry.manifest;

    // 1. Check dependencies
    if (manifest.dependencies) {
      // Check OpenCode
      if (manifest.dependencies.opencode) {
        const opencodePath = join(workspaceRoot, ".opencode");
        if (!existsSync(opencodePath)) {
          result.valid = false;
          result.errors.push("OpenCode is not installed (missing .opencode directory)");
        }
      }

      // Check Beads
      if (manifest.dependencies.beads) {
        const beadsPath = join(workspaceRoot, ".beads");
        if (!existsSync(beadsPath)) {
          result.valid = false;
          result.errors.push("Beads is not initialized (missing .beads directory)");
        }
      }
    }

    // 2. Check compatibility
    if (manifest.compatibility && manifest.compatibility.min_agent_shepherd_version) {
      try {
        const ashepDir = findAgentShepherdDir();
        const pkgPath = join(ashepDir, "package.json");
        
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
          const currentVersion = pkg.version;
          const minVersion = manifest.compatibility.min_agent_shepherd_version;

          if (compareVersions(currentVersion, minVersion) < 0) {
            result.valid = false;
            result.errors.push(`Agent Shepherd version incompatible. Required: >=${minVersion}, Current: ${currentVersion}`);
          }
        } else {
          result.warnings.push("Could not determine Agent Shepherd version (package.json not found)");
        }
      } catch (err) {
        result.warnings.push(`Failed to check Agent Shepherd version: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return result;
  }

  /**
   * Check for conflicts before installation
   */
  checkConflicts(manifest: PresetManifest, workspaceRoot: string = process.cwd()): string[] {
    const conflicts: string[] = [];
    const ashepDir = process.env.ASHEP_DIR || join(workspaceRoot, ".agent-shepherd");

    // Check OpenCode Agents
    if (manifest.components?.opencode_agents) {
      const dir = join(workspaceRoot, ".opencode", "agents");
      for (const f of manifest.components.opencode_agents) {
        if (existsSync(join(dir, f))) {
          // If it exists, we check if it's identical? Or just warn?
          // For now, simple existence check.
          // In real implementation, we might check content hash or ownership.
          // But "conflict" usually means "I will overwrite this".
          // The install logic skips if exists. So no destructive conflict, but maybe version mismatch?
        }
      }
    }

    // Check Agent IDs
    // We should parse the agent registry files in the preset and check if IDs already exist in the system.
    // This requires reading the YAML files from the preset source.
    // Since we don't have the preset source path easily available in `manifest` object (it's in `entry`),
    // we assume the caller handles this or we rely on file-level checks.
    
    return conflicts;
  }

  /**
   * Install a preset
   */
  install(name: string, workspaceRoot: string = process.cwd(), force: boolean = false): boolean {
    const validation = this.validate(name, workspaceRoot);
    if (!validation.valid) {
      console.error(`Cannot install preset '${name}':`, validation.errors);
      return false;
    }

    const entry = this.get(name);
    if (!entry) return false;
    const manifest = entry.manifest;
    const presetDir = entry.path;

    // Determine target ASHEP directory - prefer ASHEP_DIR or local .agent-shepherd
    // Strictly enforcing local project install
    const ashepDir = process.env.ASHEP_DIR || join(workspaceRoot, ".agent-shepherd");

    // 1. Install OpenCode Agents
    if (manifest.components?.opencode_agents) {
      const opencodeAgentsDir = join(workspaceRoot, ".opencode", "agents");
      if (!existsSync(opencodeAgentsDir)) {
        mkdirSync(opencodeAgentsDir, { recursive: true });
      }

      for (const agentFile of manifest.components.opencode_agents) {
        const srcPath = join(presetDir, "opencode-agents", agentFile);
        const destPath = join(opencodeAgentsDir, agentFile);

        if (existsSync(srcPath)) {
          if (existsSync(destPath)) {
            console.log(`Skipping existing OpenCode agent: ${agentFile}`);
          } else {
            copyFileSync(srcPath, destPath);
            console.log(`Installed OpenCode agent: ${agentFile}`);
          }
        } else {
          console.warn(`Source file not found for OpenCode agent: ${agentFile}`);
        }
      }
    }

    // 2. Install Agent Registry Files
    if (manifest.components?.agent_registries) {
      const agentsEnabledDir = join(ashepDir, "agents", "enabled");
      
      if (!existsSync(agentsEnabledDir)) {
        mkdirSync(agentsEnabledDir, { recursive: true });
      }

      for (const registryFile of manifest.components.agent_registries) {
        const srcPath = join(presetDir, "agents", registryFile);
        const destPath = join(agentsEnabledDir, registryFile);

        if (existsSync(srcPath)) {
          if (existsSync(destPath)) {
            console.log(`Skipping existing agent registry: ${registryFile}`);
          } else {
            copyFileSync(srcPath, destPath);
            console.log(`Installed agent registry: ${registryFile}`);
          }
        } else {
          console.warn(`Source file not found for agent registry: ${registryFile}`);
        }
      }
    }

    // 3. Install Workflow Files
    if (manifest.components?.workflows) {
      const workflowsEnabledDir = join(ashepDir, "workflows", "enabled");
      
      if (!existsSync(workflowsEnabledDir)) {
        mkdirSync(workflowsEnabledDir, { recursive: true });
      }

      for (const workflowFile of manifest.components.workflows) {
        const srcPath = join(presetDir, "workflows", workflowFile);
        const destPath = join(workflowsEnabledDir, workflowFile);

        if (existsSync(srcPath)) {
          if (existsSync(destPath)) {
            console.log(`Skipping existing workflow: ${workflowFile}`);
          } else {
            copyFileSync(srcPath, destPath);
            console.log(`Installed workflow: ${workflowFile}`);
          }
        } else {
          console.warn(`Source file not found for workflow: ${workflowFile}`);
        }
      }
    }

    // 4. Record Installation (with rollback support via try-catch block wrapping steps 1-3 ideally)
    // Current implementation checks existence before copy, so partial failure leaves safe state mostly.
    // Ideally we track what we copied and delete on error.
    
    try {
        const installedPresetsDir = join(ashepDir, "installed-presets");
        if (!existsSync(installedPresetsDir)) {
          mkdirSync(installedPresetsDir, { recursive: true });
        }
        const installRecordPath = join(installedPresetsDir, `${manifest.name}.json`);
        writeFileSync(installRecordPath, JSON.stringify(manifest, null, 2));
        console.log(`Preset '${name}' installed successfully.`);
        return true;
    } catch (err) {
        console.error("Installation failed during finalization:", err);
        // Rollback?
        this.uninstall(name, workspaceRoot, true); 
        return false;
    }
  }

  /**
   * Check if an OpenCode agent is used by other presets
   */
  isOpencodeAgentUsed(agentFile: string, excludePreset: string, workspaceRoot: string = process.cwd()): boolean {
    // List all installed presets except the one being checked
    const installed = this.list().filter(p => p.installed && p.manifest.name !== excludePreset);
    
    for (const preset of installed) {
      if (preset.manifest.components?.opencode_agents?.includes(agentFile)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Uninstall a preset
   */
  uninstall(name: string, workspaceRoot: string = process.cwd(), force: boolean = false): boolean {
    const ashepDir = process.env.ASHEP_DIR || join(workspaceRoot, ".agent-shepherd");
    const installedPresetsDir = join(ashepDir, "installed-presets");
    const installPath = join(installedPresetsDir, `${name}.json`);
    
    if (!existsSync(installPath)) {
      console.error(`Preset '${name}' is not installed.`);
      return false;
    }

    try {
      // Read manifest to know what to remove
      const content = readFileSync(installPath, "utf-8");
      const manifest = JSON.parse(content) as PresetManifest;

      // 1. Remove OpenCode Agents (Shared Resource Check)
      if (manifest.components?.opencode_agents) {
        const opencodeAgentsDir = join(workspaceRoot, ".opencode", "agents");
        
        for (const agentFile of manifest.components.opencode_agents) {
          const agentPath = join(opencodeAgentsDir, agentFile);
          
          if (existsSync(agentPath)) {
            // Check if used by other presets
            if (!force && this.isOpencodeAgentUsed(agentFile, name, workspaceRoot)) {
              console.log(`Skipping shared OpenCode agent: ${agentFile} (used by other presets)`);
            } else {
              rmSync(agentPath);
              console.log(`Removed OpenCode agent: ${agentFile}`);
            }
          }
        }
      }

      // 2. Remove Agent Registry Files
      if (manifest.components?.agent_registries) {
        const agentsDir = join(ashepDir, "agents", "enabled");
        for (const file of manifest.components.agent_registries) {
          const filePath = join(agentsDir, file);
          if (existsSync(filePath)) {
            rmSync(filePath);
            console.log(`Removed agent registry: ${file}`);
          }
        }
      }

      // 3. Remove Workflow Files
      if (manifest.components?.workflows) {
        const workflowsDir = join(ashepDir, "workflows", "enabled");
        for (const file of manifest.components.workflows) {
          const filePath = join(workflowsDir, file);
          if (existsSync(filePath)) {
            rmSync(filePath);
            console.log(`Removed workflow: ${file}`);
          }
        }
      }

      // 4. Remove Install Record
      rmSync(installPath);
      console.log(`Preset '${name}' uninstalled successfully.`);
      return true;

    } catch (error) {
      console.error(`Failed to uninstall preset '${name}':`, error);
      return false;
    }
  }
}