# Agent Shepherd - Continue Implementation Session

## Context

This is the Agent Shepherd project - an orchestration system for AI coding agents that coordinates between Beads (issue tracking), OpenCode (execution environment), and human developers.

**Project Location**: `/Users/tonyhartmann/DevShare/JS/agent-shepherd`

## Current Status

### ✅ Completed Sections (Tasks 1.1 - 3.3)

**Section 1: Project Setup** - DONE
- package.json, tsconfig.json, bunfig.toml configured
- Directory structure created
- Dependencies installed (Bun, TypeScript, @opencode-ai/sdk, React, ReactFlow, YAML, Ajv)

**Section 2: Core Modules** - DONE
- `src/core/beads.ts` - Beads integration (shell commands, issue management)
- `src/core/opencode.ts` - OpenCode integration (sessions, messages)
- `src/core/policy.ts` - Policy engine (YAML policies, phase transitions, retry logic)
- `src/core/agent-registry.ts` - Agent registry (capability matching, selection)
- `src/core/logging.ts` - Logging system (JSONL + SQLite dual storage)

**Section 3: Engines** - DONE
- `src/core/worker-engine.ts` - Autonomous issue processing
- `src/core/monitor-engine.ts` - Supervision, stall detection, HITL
- `src/cli/index.ts` - CLI with 7 commands (worker, monitor, work, init, install, sync-agents, ui)

**Git Commits**:
- c58f40c - feat: implement Worker Engine, Monitor Engine, and CLI
- c0f68c1 - feat: implement core orchestration modules
- bad8527 - feat: implement OpenCode integration module
- 36db7de - feat: initialize Agent Shepherd project structure

**Beads Tracking**: Using `bd` for issue management. Epic ID: `agent-shepherd-zkc`

### 🎯 Next Tasks (Sections 4-7)

**Section 4: UI and Installer** (Tasks 4.1-4.4)
- [ ] 4.1 Create placeholder ReactFlow UI with basic flow visualization
- [ ] 4.2 Implement UI server with configurable port
- [ ] 4.3 Implement installer (check dependencies, suggest installs) - PARTIALLY DONE in CLI
- [ ] 4.4 Implement init (create .agent-shepherd with defaults) - ALREADY DONE in CLI

**Section 5: Configuration and Schemas** (Tasks 5.1-5.3)
- [ ] 5.1 Create JSON schemas for config, policies, agents, run outcomes
- [ ] 5.2 Create default config.yaml, policies.yaml, agents.yaml - ALREADY DONE in CLI
- [ ] 5.3 Validate configurations at startup

**Section 6: Testing and Validation** (Tasks 6.1-6.4)
- [ ] 6.1 Add unit tests for core modules
- [ ] 6.2 Add integration tests for CLI commands
- [ ] 6.3 Validate with linting and type checking
- [ ] 6.4 Test end-to-end workflow (mock Beads/OpenCode)

**Section 7: Documentation** (Tasks 7.1-7.3)
- [ ] 7.1 Create README.md with setup and usage
- [ ] 7.2 Expand docs/architecture.md
- [ ] 7.3 Document CLI commands and configs

## Implementation Instructions

### Step 1: Setup
```bash
cd /Users/tonyhartmann/DevShare/JS/agent-shepherd
git status  # Verify you're on dev_core branch
bd ready    # Check ready tasks
```

### Step 2: Continue Implementation

Start with the remaining tasks. Note that some tasks in sections 4-5 are already partially complete:
- **Task 4.4** (init command) is DONE - the CLI already implements `ashep init`
- **Task 5.2** (default configs) is DONE - `ashep init` creates default YAML files
- **Task 4.3** (installer) is PARTIALLY DONE - `ashep install` checks dependencies

You should focus on:
1. **Section 4: UI** - Implement ReactFlow visualization (tasks 4.1-4.2)
2. **Section 5: Schemas** - Create JSON schemas and validation (tasks 5.1, 5.3)
3. **Section 6: Testing** - Add tests (tasks 6.1-6.4)
4. **Section 7: Documentation** - Write docs (tasks 7.1-7.3)

### Step 3: Follow the Process
For each task:
1. Read the spec from `openspec/changes/build-agent-shepherd-system/specs/<module>/spec.md`
2. Implement the module
3. Run `bun run type-check` to verify types
4. Update Beads: `bd update agent-shepherd-zkc.X.Y --status closed`
5. Commit with detailed message
6. When complete: `bd sync` (but NOT `git push` - user has restricted it)

### Step 4: Reference Files

Key specs location:
- `openspec/changes/build-agent-shepherd-system/proposal.md` - Overall proposal
- `openspec/changes/build-agent-shepherd-system/design.md` - Design decisions
- `openspec/changes/build-agent-shepherd-system/specs/*/spec.md` - Individual module specs
- `openspec/changes/build-agent-shepherd-system/tasks.md` - Task checklist

### Architecture Overview

The system architecture:
```
Beads Issues → Worker Engine → Agent Registry → OpenCode Sessions
                     ↓              ↓                 ↓
                Policy Engine → Agent Selection → Agent Execution
                     ↓              ↓                 ↓
                Monitor Engine → Logging System → Run Outcomes
```

### Important Notes

1. **Use Bun's built-in SQLite**: `import { Database } from "bun:sqlite"`
2. **No better-sqlite3**: Removed due to compilation issues
3. **Strict TypeScript**: All code must pass `bun run type-check`
4. **JSONL + SQLite**: Dual storage pattern (JSONL = source of truth, SQLite = cache)
5. **OpenCode SDK**: Version 1.0.171 installed
6. **Git push restricted**: User has configured git push as denied, don't try to push

## Prompt for New Session

Copy-paste this entire message to continue:

---

I need to continue implementing the Agent Shepherd project. We've completed sections 1-3 (project setup, core modules, and engines) with tasks 1.1 through 3.3 all done and committed.

**Please continue with the remaining sections 4-7**:
- Section 4: UI and Installer (noting that tasks 4.3-4.4 are mostly done in CLI)
- Section 5: Configuration and Schemas (noting that task 5.2 is done)
- Section 6: Testing and Validation
- Section 7: Documentation

The project uses:
- Bun runtime with TypeScript
- OpenCode SDK v1.0.171 for agent execution
- Beads (bd) for issue tracking - epic ID: `agent-shepherd-zkc`
- Dual JSONL/SQLite storage pattern
- Strict type checking required

Project location: `/Users/tonyhartmann/DevShare/JS/agent-shepherd`

Read the context from `CONTINUE_SESSION.md` in the project root, then:
1. Start with Section 4 (UI) - implement ReactFlow visualization (tasks 4.1-4.2)
2. Continue with Section 5 (Schemas) - JSON schemas and validation (tasks 5.1, 5.3)
3. Then Section 6 (Testing) and Section 7 (Documentation)

Follow the implementation process: read specs → implement → type-check → update Beads → commit.

See `openspec/changes/build-agent-shepherd-system/` for all specs and design docs.
