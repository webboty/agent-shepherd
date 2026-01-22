import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { PresetManager } from "../src/core/preset-manager";

const TEMP_DIR = join(process.cwd(), "tmp_test_presets");

describe("PresetManager", () => {
  beforeEach(() => {
    if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true });
    mkdirSync(TEMP_DIR, { recursive: true });
    process.env.ASHEP_DIR = TEMP_DIR;
  });

  afterEach(() => {
    if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true });
    delete process.env.ASHEP_DIR;
  });

  test("should list available presets", () => {
    const presetsDir = join(TEMP_DIR, "presets", "coding", "test-preset");
    mkdirSync(presetsDir, { recursive: true });

    const manifest = {
      name: "test-preset",
      version: "1.0.0",
      category: "coding",
      description: "A test preset"
    };

    writeFileSync(join(presetsDir, "manifest.json"), JSON.stringify(manifest));

    const manager = new PresetManager();
    const presets = manager.list();

    expect(presets).toHaveLength(1);
    expect(presets[0].manifest.name).toBe("test-preset");
    expect(presets[0].path).toBe(presetsDir);
    expect(presets[0].installed).toBe(false);
  });

  test("should detect installed presets", () => {
    const presetsDir = join(TEMP_DIR, "presets", "coding", "test-preset");
    const installedDir = join(TEMP_DIR, "installed-presets");
    mkdirSync(presetsDir, { recursive: true });
    mkdirSync(installedDir, { recursive: true });

    const manifest = {
      name: "test-preset",
      version: "1.0.0",
      category: "coding",
      description: "A test preset"
    };

    writeFileSync(join(presetsDir, "manifest.json"), JSON.stringify(manifest));
    writeFileSync(join(installedDir, "test-preset.json"), JSON.stringify(manifest));

    const manager = new PresetManager();
    const presets = manager.list();

    expect(presets).toHaveLength(1);
    expect(presets[0].installed).toBe(true);
    expect(presets[0].installed_version).toBe("1.0.0");
  });

  test("should validate preset dependencies", () => {
    // Setup preset
    const presetsDir = join(TEMP_DIR, "presets", "coding", "test-preset");
    mkdirSync(presetsDir, { recursive: true });
    
    // Create mock package.json for version check in ASHEP_DIR
    writeFileSync(join(TEMP_DIR, "package.json"), JSON.stringify({ version: "1.0.0" }));

    const manifest = {
      name: "test-preset",
      version: "1.0.0",
      category: "coding",
      description: "A test preset",
      dependencies: {
        opencode: "installed",
        beads: "initialized"
      },
      compatibility: {
        min_agent_shepherd_version: "0.9.0"
      }
    };
    writeFileSync(join(presetsDir, "manifest.json"), JSON.stringify(manifest));

    // Mock dependencies in workspace root (TEMP_DIR)
    mkdirSync(join(TEMP_DIR, ".opencode"), { recursive: true });
    mkdirSync(join(TEMP_DIR, ".beads"), { recursive: true });

    const manager = new PresetManager();
    const result = manager.validate("test-preset", TEMP_DIR);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("should fail validation on missing dependencies", () => {
    // Setup preset
    const presetsDir = join(TEMP_DIR, "presets", "coding", "test-preset");
    mkdirSync(presetsDir, { recursive: true });
    
    writeFileSync(join(TEMP_DIR, "package.json"), JSON.stringify({ version: "1.0.0" }));

    const manifest = {
      name: "test-preset",
      version: "1.0.0",
      category: "coding",
      description: "A test preset",
      dependencies: {
        opencode: "installed",
        beads: "initialized"
      }
    };
    writeFileSync(join(presetsDir, "manifest.json"), JSON.stringify(manifest));

    // Don't create .opencode or .beads

    const manager = new PresetManager();
    const result = manager.validate("test-preset", TEMP_DIR);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.join(" ")).toContain("OpenCode");
    expect(result.errors.join(" ")).toContain("Beads");
  });

  test("should fail validation on incompatible version", () => {
    // Setup preset
    const presetsDir = join(TEMP_DIR, "presets", "coding", "test-preset");
    mkdirSync(presetsDir, { recursive: true });
    
    // Old version
    writeFileSync(join(TEMP_DIR, "package.json"), JSON.stringify({ version: "0.5.0" }));

    const manifest = {
      name: "test-preset",
      version: "1.0.0",
      category: "coding",
      description: "A test preset",
      compatibility: {
        min_agent_shepherd_version: "1.0.0"
      }
    };
    writeFileSync(join(presetsDir, "manifest.json"), JSON.stringify(manifest));

    const manager = new PresetManager();
    const result = manager.validate("test-preset", TEMP_DIR);

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("incompatible");
  });

  test("should install preset components", () => {
    // Setup preset
    const presetName = "full-stack";
    const presetsDir = join(TEMP_DIR, "presets", "coding", presetName);
    const opencodeDir = join(TEMP_DIR, ".opencode");
    const ashepDir = TEMP_DIR; // ASHEP_DIR env set to this

    mkdirSync(join(presetsDir, "opencode-agents"), { recursive: true });
    mkdirSync(join(presetsDir, "agents"), { recursive: true });
    mkdirSync(join(presetsDir, "workflows"), { recursive: true });
    
    // Create source files
    writeFileSync(join(presetsDir, "opencode-agents", "coder.md"), "# Coder Agent");
    writeFileSync(join(presetsDir, "agents", "coder.yaml"), "agent: coder");
    writeFileSync(join(presetsDir, "workflows", "dev.yaml"), "workflow: dev");

    // Manifest
    const manifest = {
      name: presetName,
      version: "1.0.0",
      category: "coding",
      description: "Full stack preset",
      dependencies: { opencode: "installed", beads: "initialized" },
      components: {
        opencode_agents: ["coder.md"],
        agent_registries: ["coder.yaml"],
        workflows: ["dev.yaml"]
      }
    };
    writeFileSync(join(presetsDir, "manifest.json"), JSON.stringify(manifest));

    // Mock dependencies
    mkdirSync(opencodeDir, { recursive: true });
    mkdirSync(join(TEMP_DIR, ".beads"), { recursive: true });
    writeFileSync(join(TEMP_DIR, "package.json"), JSON.stringify({ version: "1.0.0" }));

    // Run install
    const manager = new PresetManager();
    const result = manager.install(presetName, TEMP_DIR);

    expect(result).toBe(true);

    // Verify files copied
    expect(existsSync(join(opencodeDir, "agents", "coder.md"))).toBe(true);
    // agents/enabled is default for findAgentsDir() + "enabled"
    expect(existsSync(join(ashepDir, "agents", "enabled", "coder.yaml"))).toBe(true);
    expect(existsSync(join(ashepDir, "workflows", "enabled", "dev.yaml"))).toBe(true);
    
    // Verify install record
    expect(existsSync(join(ashepDir, "installed-presets", `${presetName}.json`))).toBe(true);
  });

  test("should handle nested categories in preset discovery", () => {
    const presetsDir = join(TEMP_DIR, "presets", "devops", "kubernetes", "k8s-deploy");
    mkdirSync(presetsDir, { recursive: true });

    const manifest = {
      name: "k8s-deploy",
      version: "1.0.0",
      category: "devops/kubernetes",
      description: "Kubernetes deployment"
    };

    writeFileSync(join(presetsDir, "manifest.json"), JSON.stringify(manifest));

    const manager = new PresetManager();
    const presets = manager.list();

    expect(presets).toHaveLength(1);
    expect(presets[0].manifest.category).toBe("devops/kubernetes");
  });

  test("should ignore invalid preset manifests", () => {
    const presetsDir = join(TEMP_DIR, "presets", "broken");
    mkdirSync(presetsDir, { recursive: true });

    // Missing required fields
    writeFileSync(join(presetsDir, "manifest.json"), JSON.stringify({ foo: "bar" }));

    const manager = new PresetManager();
    const presets = manager.list();

    expect(presets).toHaveLength(0);
  });

  test("should handle shared resources on uninstall", () => {
    const opencodeDir = join(TEMP_DIR, ".opencode");
    
    // Setup Preset 1
    const p1Dir = join(TEMP_DIR, "presets", "p1");
    mkdirSync(join(p1Dir, "opencode-agents"), { recursive: true });
    writeFileSync(join(p1Dir, "opencode-agents", "shared.md"), "shared agent");
    writeFileSync(join(p1Dir, "manifest.json"), JSON.stringify({
      name: "p1", version: "1.0", category: "test", 
      components: { opencode_agents: ["shared.md"] }
    }));

    // Setup Preset 2
    const p2Dir = join(TEMP_DIR, "presets", "p2");
    mkdirSync(join(p2Dir, "opencode-agents"), { recursive: true });
    writeFileSync(join(p2Dir, "opencode-agents", "shared.md"), "shared agent");
    writeFileSync(join(p2Dir, "manifest.json"), JSON.stringify({
      name: "p2", version: "1.0", category: "test",
      components: { opencode_agents: ["shared.md"] }
    }));

    // Create installed-presets dir so manager finds it locally
    mkdirSync(join(TEMP_DIR, "installed-presets"), { recursive: true });

    // Instantiate manager AFTER creating directories so it finds them
    const manager = new PresetManager();

    // Install both
    mkdirSync(join(TEMP_DIR, ".opencode"), { recursive: true });
    // Mock package.json for ASHEP_DIR validity if needed
    writeFileSync(join(TEMP_DIR, "package.json"), JSON.stringify({ version: "1.0.0" }));

    manager.install("p1", TEMP_DIR);
    manager.install("p2", TEMP_DIR);

    expect(existsSync(join(opencodeDir, "agents", "shared.md"))).toBe(true);

    // Uninstall p1
    manager.uninstall("p1", TEMP_DIR);

    // Shared agent should still exist because p2 uses it
    expect(existsSync(join(opencodeDir, "agents", "shared.md"))).toBe(true);
    // p1 manifest should be gone
    expect(existsSync(join(TEMP_DIR, "installed-presets", "p1.json"))).toBe(false);

    // Uninstall p2
    manager.uninstall("p2", TEMP_DIR);

    // Shared agent should be gone now
    expect(existsSync(join(opencodeDir, "agents", "shared.md"))).toBe(false);
  });

  test("should force uninstall shared resources", () => {
    // Setup shared scenario again
    const opencodeDir = join(TEMP_DIR, ".opencode");
    // Directories exist from previous test or are recreated if beforeEach runs
    // But since tests run in parallel or sequence with cleanup, we need to recreate
    
    // We rely on beforeEach cleaning up. So recreate structure.
    const p1Dir = join(TEMP_DIR, "presets", "p1");
    const p2Dir = join(TEMP_DIR, "presets", "p2");
    mkdirSync(join(p1Dir, "opencode-agents"), { recursive: true });
    mkdirSync(join(p2Dir, "opencode-agents"), { recursive: true });
    writeFileSync(join(p1Dir, "opencode-agents", "shared.md"), "shared agent");
    writeFileSync(join(p1Dir, "manifest.json"), JSON.stringify({
      name: "p1", version: "1.0", category: "test", components: { opencode_agents: ["shared.md"] }
    }));
    writeFileSync(join(p2Dir, "opencode-agents", "shared.md"), "shared agent");
    writeFileSync(join(p2Dir, "manifest.json"), JSON.stringify({
      name: "p2", version: "1.0", category: "test", components: { opencode_agents: ["shared.md"] }
    }));
    mkdirSync(join(TEMP_DIR, ".opencode"), { recursive: true });
    writeFileSync(join(TEMP_DIR, "package.json"), JSON.stringify({ version: "1.0.0" }));

    const manager = new PresetManager();
    
    // Re-install p1 and p2
    manager.install("p1", TEMP_DIR);
    manager.install("p2", TEMP_DIR);

    // Force uninstall p1
    manager.uninstall("p1", TEMP_DIR, true);

    // Shared agent should be GONE despite p2 using it
    expect(existsSync(join(opencodeDir, "agents", "shared.md"))).toBe(false);
  });
});
