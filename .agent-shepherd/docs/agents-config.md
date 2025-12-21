# Agent Configuration Reference

The `agents.yaml` file defines the available agents that Agent Shepherd can use for task execution. This registry is automatically maintained through `ashep sync-agents` but can be manually customized.

## File Location

```
.agent-shepherd/config/agents.yaml
```

## Structure

```yaml
version: "1.0"
agents:
  - id: "agent-id"
    name: "Display Name"
    description: "Brief description of agent's purpose"
    capabilities: ["capability1", "capability2"]
    provider_id: "provider-name"
    model_id: "model-identifier"
    priority: 10
    constraints:
      performance_tier: "balanced"
      read_only: false
      max_file_size: 1048576
      allowed_tags: ["tag1", "tag2"]
    metadata:
      agent_type: "primary"
```

## Field Reference

### `version` (string)
**Required**: Yes  
**Purpose**: Configuration format version for compatibility  
**Impact**: Ensures proper parsing of agent definitions  
**Values**: Currently "1.0"

### `agents` (array)
**Required**: Yes  
**Purpose**: List of all available agents  
**Impact**: Defines the complete set of agents Agent Shepherd can select from

### Agent Object Fields

#### `id` (string)
**Required**: Yes  
**Purpose**: Unique identifier for the agent  
**Impact**: Used in policies and CLI commands to reference specific agents  
**Values**: Letters, numbers, underscores, hyphens  
**Examples**: `build`, `plan`, `code-reviewer`, `my_custom_agent`

#### `name` (string)
**Required**: Yes  
**Purpose**: Human-readable display name  
**Impact**: Shown in UI and logs for agent identification  
**Values**: Any descriptive string

#### `description` (string)
**Required**: No  
**Purpose**: Detailed explanation of agent's purpose and capabilities  
**Impact**: Helps users understand when to use each agent  
**Values**: Any descriptive text

#### `capabilities` (array of strings)
**Required**: Yes  
**Purpose**: Defines what the agent can do  
**Impact**: Critical for agent selection - policies match required capabilities to available agents  
**Values**: Predefined capability names

##### Available Capabilities

| Capability | Description | Use Case |
|------------|-------------|----------|
| `coding` | General code writing and editing | Any development task |
| `refactoring` | Code restructuring and optimization | Improving code quality |
| `building` | Compilation and build processes | Setting up build systems |
| `planning` | Analysis and planning | Architecture and design |
| `architecture` | System design and structure | High-level design decisions |
| `analysis` | Code and data analysis | Understanding existing codebases |
| `exploration` | Codebase discovery | Finding files and patterns |
| `discovery` | Information gathering | Research and investigation |
| `documentation` | Writing docs and comments | Documentation tasks |
| `summary` | Creating summaries | Condensing information |
| `naming` | Generating names and titles | Naming conventions |
| `testing` | Test creation and validation | Quality assurance |
| `qa` | Quality assurance processes | Testing and validation |
| `review` | Code and content review | Quality control |

#### `provider_id` (string)
**Required**: No (uses OpenCode agent default if omitted)  
**Purpose**: AI provider for the agent (anthropic, openai, etc.)  
**Impact**: Determines which API is called for agent execution. If not specified, uses the provider configured in the OpenCode agent.  
**Values**: Must match configured providers in OpenCode

#### `model_id` (string)
**Required**: No (uses OpenCode agent default if omitted)  
**Purpose**: Specific model identifier within the provider  
**Impact**: Controls AI model capabilities, speed, and cost. If not specified, uses the model configured in the OpenCode agent.  
**Values**: Valid model IDs for the specified provider

#### `priority` (number)
**Required**: No (defaults to 10)  
**Purpose**: Selection priority when multiple agents match capabilities  
**Impact**: Higher priority agents are preferred in agent selection  
**Values**: 1-20 (higher = more preferred)  
**Examples**:
- `20`: Critical/high-priority agents
- `15`: Primary workflow agents
- `10`: Standard agents (default)
- `5`: Fallback/specialized agents

#### `active` (boolean)
**Required**: No (defaults to true)  
**Purpose**: Controls whether agent is available for automated workflows  
**Impact**: Inactive agents are excluded from automatic agent selection but can still be used manually  
**Values**:
- `true` or omitted: Agent available for automation (default)
- `false`: Agent excluded from automated workflows
**Use Cases**:
- Disable problematic agents temporarily
- Reserve specialized agents for manual use only
- Test agent configurations before enabling automation
- Maintain agent definitions while preventing automated usage

#### `constraints` (object)
**Required**: No  
**Purpose**: Limitations and requirements for agent usage  
**Impact**: Filters agent selection and enforces system constraints

##### `performance_tier` (string)
**Required**: No (defaults to "balanced")  
**Purpose**: Performance characteristics of the agent  
**Impact**: Matches tasks to appropriate computational requirements  
**Values**:
- `"fast"`: Quick responses, lower quality, cost-effective
- `"balanced"`: Standard performance (default)
- `"slow"`: High quality, slower responses, higher cost

##### `read_only` (boolean)
**Required**: No (defaults to false)  
**Purpose**: Whether agent can modify files  
**Impact**: Safety mechanism for analysis-only agents  
**Values**: `true` = read-only, `false` = can modify files

##### `max_file_size` (number)
**Required**: No  
**Purpose**: Maximum file size agent can process (bytes)  
**Impact**: Prevents processing of extremely large files  
**Values**: File size in bytes (e.g., `1048576` = 1MB)

##### `allowed_tags` (array of strings)
**Required**: No  
**Purpose**: Tags that must be present for agent selection  
**Impact**: Advanced filtering for specialized agents  
**Values**: Custom tag strings defined in policies

#### `metadata` (object)
**Required**: No  
**Purpose**: Additional information about the agent  
**Impact**: Provides context for agent management and selection

##### `agent_type` (string)
**Required**: Auto-populated by sync  
**Purpose**: Classification from OpenCode (primary/subagent)  
**Impact**: Helps understand agent behavior in OpenCode sessions  
**Values**: `"primary"` or `"subagent"`

## Agent Selection Logic

When a policy requires specific capabilities, Agent Shepherd:

1. **Filters active agents only** (excludes agents with `active: false`)
2. **Filters by capabilities** (agents must have all required capabilities)
3. **Sorts by priority** (highest first)
4. **Applies constraints** (performance tier, read-only, etc.)
5. **Selects the best match**

**Note**: Inactive agents can still be used manually by explicitly specifying them in policies or through direct CLI usage.

## Examples

### Primary Build Agent (with defaults)
```yaml
- id: build
  name: "Build Agent"
  description: "Handles code building and compilation tasks"
  capabilities: ["coding", "refactoring", "building"]
  priority: 15
  constraints:
    performance_tier: balanced
  metadata:
    agent_type: primary
  # provider_id and model_id omitted - uses OpenCode agent defaults
```

### Specialized Agent with Custom Model
```yaml
- id: code-reviewer
  name: "Code Reviewer"
  description: "Reviews code for best practices and potential issues"
  capabilities: ["review", "analysis", "documentation"]
  provider_id: anthropic
  model_id: claude-3-5-haiku-20241022  # Cost-effective model for reviews
  priority: 12
  active: true
  constraints:
    performance_tier: fast
    read_only: true
  metadata:
    agent_type: subagent
```

### Inactive Agent (manual use only)
```yaml
- id: experimental-agent
  name: "Experimental Agent"
  description: "Testing new capabilities"
  capabilities: ["analysis", "research"]
  provider_id: openai
  model_id: gpt-4
  priority: 5
  active: false  # Excluded from automated workflows
  metadata:
    agent_type: primary
```

### Specialized Code Review Agent
```yaml
- id: code-reviewer
  name: "Code Reviewer"
  description: "Reviews code for best practices and potential issues"
  capabilities: ["review", "analysis", "documentation"]
  provider_id: "anthropic"
  model_id: "claude-3-5-haiku-20241022"
  priority: 12
  constraints:
    performance_tier: "fast"
    read_only: true
  metadata:
    agent_type: "subagent"
```

### High-Performance Planning Agent
```yaml
- id: architect
  name: "System Architect"
  description: "Handles complex system design and planning"
  capabilities: ["architecture", "planning", "analysis"]
  provider_id: "anthropic"
  model_id: "claude-3-5-sonnet-20241022"
  priority: 18
  constraints:
    performance_tier: "slow"
    max_file_size: 2097152  # 2MB limit
  metadata:
    agent_type: "primary"
```

## Management

### Automatic Sync
```bash
ashep sync-agents  # Updates registry from OpenCode
```

### Manual Customization
Edit the file directly to:
- Add custom capabilities
- Adjust priorities
- Modify constraints
- Add metadata

**Note**: Manual changes may be overwritten by `sync-agents` unless you modify the synced agent definitions.