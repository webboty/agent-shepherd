# Agent Shepherd Plugin System

The Agent Shepherd Plugin System enables extensible functionality through optional, dynamically-loaded plugins. This allows adding new features and integrations without modifying the core codebase, maintaining the KISS principle.

## Overview

Plugins are self-contained packages that extend Agent Shepherd with additional commands and capabilities. The system supports:

- **Dynamic Loading**: Plugins are discovered and loaded automatically on startup
- **Command Registration**: Plugins can register new CLI commands
- **Simple Structure**: Minimal boilerplate required for plugin development
- **Isolated Execution**: Plugins run in their own context without affecting core functionality

## Plugin Structure

Each plugin is a directory in `.agent-shepherd/plugins/` with the following structure:

```
my-plugin/
├── manifest.json    # Plugin metadata and command definitions
├── index.js         # Command implementations
└── README.md        # Plugin documentation (recommended)
```

### manifest.json

The manifest file defines plugin metadata and available commands:

```json
{
  "name": "my-plugin",
  "description": "Brief description of what this plugin does",
  "version": "1.0.0",
  "commands": [
    {
      "name": "my-command",
      "description": "Description of what this command does"
    }
  ],
  "author": "Your Name",
  "license": "MIT"
}
```

**Required Fields:**
- `name`: Unique plugin identifier
- `description`: Brief description
- `version`: Semantic version string
- `commands`: Array of command definitions

**Optional Fields:**
- `author`: Plugin author
- `license`: License type

### index.js

The main plugin file exports command handler functions:

```javascript
async function myCommand(arg1, arg2) {
  // Command implementation
  console.log(`Hello from my plugin! Args: ${arg1}, ${arg2}`);
}

module.exports = {
  'my-command': myCommand
};
```

**Requirements:**
- Export an object where keys match command names from manifest.json
- Each command handler is an async function
- Use `process.argv` or function parameters for command arguments
- Exit with `process.exit(code)` for errors

## Plugin Management

### Installing Plugins

#### From Local Path
```bash
ashep plugin-install /path/to/my-plugin
```

#### From Git Repository
```bash
ashep plugin-install https://github.com/user/my-plugin.git
```

### Managing Plugins

```bash
# List installed plugins
ashep plugin-list

# Activate a plugin (loaded on next startup)
ashep plugin-activate my-plugin

# Deactivate a plugin (unloaded on next startup)
ashep plugin-deactivate my-plugin

# Remove a plugin completely
ashep plugin-remove my-plugin
```

### Plugin Discovery

Plugins are automatically discovered when Agent Shepherd starts:

1. Scans `.agent-shepherd/plugins/` directory
2. Validates each plugin's `manifest.json`
3. Loads `index.js` and registers commands
4. Commands become available as `ashep <command-name>`

## Built-in Plugins

### OpenSpec Plugin

The OpenSpec plugin provides integration between OpenSpec proposals and Beads issue tracking. See [plugins/openspec/README.md](plugins/openspec/README.md) for details.

**Commands:**
- `ashep openspec-convert <proposal-id>` - Convert OpenSpec proposal to Beads issues
- `ashep openspec-sync <proposal-id>` - Sync task status between OpenSpec and Beads
- `ashep openspec-parse <proposal-id>` - Parse OpenSpec tasks.md structure

## Developing Plugins

### Best Practices

1. **Error Handling**: Always handle errors gracefully and provide meaningful messages
2. **Documentation**: Include a README.md with usage examples
3. **Dependencies**: Bundle dependencies or declare them clearly
4. **Testing**: Test commands independently before integration
5. **Versioning**: Use semantic versioning for releases

### Example Plugin

Create a simple greeting plugin:

```bash
# Create plugin directory
mkdir -p .agent-shepherd/plugins/greeter
cd .agent-shepherd/plugins/greeter
```

**manifest.json:**
```json
{
  "name": "greeter",
  "description": "Simple greeting commands",
  "version": "1.0.0",
  "commands": [
    {
      "name": "hello",
      "description": "Print a greeting message"
    },
    {
      "name": "goodbye",
      "description": "Print a farewell message"
    }
  ]
}
```

**index.js:**
```javascript
async function hello(name = "world") {
  console.log(`Hello, ${name}!`);
}

async function goodbye(name = "world") {
  console.log(`Goodbye, ${name}!`);
}

module.exports = {
  'hello': hello,
  'goodbye': goodbye
};
```

**Usage:**
```bash
ashep hello Alice
# Output: Hello, Alice!

ashep goodbye
# Output: Goodbye, world!
```

### Plugin Validation

Agent Shepherd validates plugins on load:

- **Manifest Schema**: JSON structure must match expected format
- **Command Registration**: All commands in manifest must have handlers in index.js
- **Function Signatures**: Handlers must be async functions
- **Naming**: Plugin and command names must be valid identifiers

Invalid plugins are skipped with warning messages.

## Security Considerations

- Plugins execute with the same permissions as Agent Shepherd
- Review plugin code before installation
- Plugins can access configuration and project files
- Consider plugin source reputation for production use

## Troubleshooting

### Plugin Not Loading

**Symptoms:** Plugin commands not available in `ashep help`

**Possible Causes:**
- Invalid `manifest.json` (check with `cat .agent-shepherd/plugins/my-plugin/manifest.json`)
- Missing `index.js` file
- Command handler not exported
- Plugin name conflicts

**Debug:**
```bash
# Check plugin structure
ls -la .agent-shepherd/plugins/my-plugin/

# Validate manifest
cat .agent-shepherd/plugins/my-plugin/manifest.json | jq .

# Test plugin loading
DEBUG=agent-shepherd ashep help
```

### Command Errors

**Symptoms:** Plugin command fails with errors

**Debug:**
- Check error messages for specific issues
- Verify command arguments match handler signature
- Test plugin code independently
- Check file permissions and paths

## Future Extensions

The plugin system is designed for growth:

- **UI Extensions**: Plugins could add React components to the visualization UI
- **Agent Providers**: Custom AI agent integrations
- **Workflow Phases**: Additional processing steps
- **Monitoring Rules**: Custom supervision logic
- **Data Sources**: Integration with external systems

## Related Documentation

- [Architecture Overview](architecture.md) - Core system design
- [CLI Reference](cli-reference.md) - Complete command documentation
- [Configuration](config-config.md) - Configuration options
- [OpenSpec Plugin](../plugins/openspec/README.md) - Built-in plugin documentation