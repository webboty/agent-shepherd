# Preset System

The Agent Shepherd Preset System allows for a "batteries included" experience by bundling OpenCode agents, Agent Shepherd agent registries, and workflow files into installable packages.

## Overview

Presets enable users to:
- Quickly bootstrap complex capabilities without manual configuration
- Share complete workflow setups (e.g., full-stack dev, DevOps automation)
- Manage dependencies between agents and workflows automatically

## Directory Structure

Presets are organized in `.agent-shepherd/presets/` and can be nested by category.

```
.agent-shepherd/
├── presets/                     # Available preset bundles
│   ├── coding/                  
│   │   └── full-stack-dev/      
│   │       ├── opencode-agents/ # OpenCode .md agent files
│   │       ├── agents/          # Agent Shepherd registry YAML files
│   │       ├── workflows/       # Workflow YAML files
│   │       ├── manifest.json    # Metadata & requirements
│   │       └── README.md        # Documentation
├── installed-presets/           # Tracks installed presets
│   └── full-stack-dev.json      # Copy of installed manifest
```

## Commands

### List Presets
List all available presets and their installation status.
```bash
ashep preset list
```

### Preset Info
View detailed information about a preset, including components and dependencies.
```bash
ashep preset info <name>
```

### Install Preset
Install a preset into your project. This copies agents and workflows to your configuration.
```bash
ashep preset install <name>
```

### Uninstall Preset
Remove a preset. This removes the associated files, unless they are used by other installed presets.
```bash
ashep preset uninstall <name>
```

## Creating a Preset

To create a new preset, organize your files in a directory under `.agent-shepherd/presets/<category>/<name>/`.

### manifest.json
The `manifest.json` file is required and defines the preset metadata.

```json
{
  "name": "my-preset",
  "version": "1.0.0",
  "category": "coding",
  "description": "My custom preset",
  "dependencies": {
    "opencode": "installed",
    "beads": "initialized"
  },
  "components": {
    "opencode_agents": ["my-agent.md"],
    "agent_registries": ["my-agent-registry.yaml"],
    "workflows": ["my-workflow.yaml"]
  },
  "compatibility": {
    "min_agent_shepherd_version": "1.0.0"
  }
}
```

## Shared Resources

The system automatically tracks usage of OpenCode agents. If multiple presets use the same OpenCode agent file, it will not be deleted until all presets using it are uninstalled.
