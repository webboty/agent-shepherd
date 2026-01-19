# Migration Guide: YAML to JSON Configuration

Agent Shepherd now supports both YAML and JSON (including JSON5) for all configuration files. This guide explains how to migrate your existing YAML configuration to JSON if desired.

## Why Migrate?

While YAML is excellent for human readability, JSON formats offer distinct advantages:

- **Robustness**: JSON parsing is stricter and less prone to indentation errors.
- **Programmatic Generation**: Easier to generate and modify configuration programmatically.
- **Tooling Support**: Ubiquitous support in all programming languages and tools.
- **JSON5**: Supports comments like YAML but with JSON structure, offering the best of both worlds.

## Supported Formats

- **YAML** (`.yaml`, `.yml`): Default, human-readable.
- **JSON** (`.json`): Strict, programmatic.
- **JSON5** (`.json5`): Human-readable JSON with comments.

## Migration Steps

We provide a CLI tool to automate the conversion.

### 1. Backup Your Configuration

Always backup your configuration directory before making changes:

```bash
cp -r .agent-shepherd/config .agent-shepherd/config.bak
```

### 2. Convert Files

Use the `ashep convert-config` command to convert each file.

**Convert `config.yaml`:**
```bash
ashep convert-config .agent-shepherd/config/config.yaml .agent-shepherd/config/config.json
# OR for JSON5 (preserves structure better)
ashep convert-config .agent-shepherd/config/config.yaml .agent-shepherd/config/config.json5
```

**Convert `policies.yaml`:**
```bash
ashep convert-config .agent-shepherd/config/policies.yaml .agent-shepherd/config/policies.json
```

**Convert `agents.yaml`:**
```bash
ashep convert-config .agent-shepherd/config/agents.yaml .agent-shepherd/config/agents.json
```

### 3. Verify and Switch

1. Check the generated JSON files to ensure correctness.
2. Remove or rename the old YAML files. Agent Shepherd prioritizes existing files but will pick up `.json` if `.yaml` is missing.

```bash
# Rename to keep as backup, or delete
mv .agent-shepherd/config/config.yaml .agent-shepherd/config/config.yaml.old
```

3. Run `ashep validate-policy-chain` to verify the new configuration is valid.

```bash
ashep validate-policy-chain
```

### 4. Update Git Ignore (Optional)

If you are committing config files, ensure your `.gitignore` allows the new extensions.

## Backward Compatibility

- **No Action Required**: If you prefer YAML, you can keep your existing files. No changes are needed.
- **Mixed Formats**: You can mix formats (e.g., `config.json` and `policies.yaml`).
- **Priority**: If both exist (e.g., `config.yaml` and `config.json`), Agent Shepherd prioritizes `.yaml`. To use `.json`, you must remove or rename the `.yaml` file.

## Risks & Trade-offs

- **Comments**: Standard `.json` does not support comments. Any comments in your YAML will be lost during conversion to `.json`. Use `.json5` if you need to preserve comments.
- **Strictness**: JSON is stricter about trailing commas and quotes. Manual editing requires more care than YAML.

## Troubleshooting

If `ashep` fails to load configuration:
1. Ensure only one active config file exists per type to avoid confusion.
2. Run `ashep validate-policy-chain` to check for syntax errors.
3. Verify file permissions.
