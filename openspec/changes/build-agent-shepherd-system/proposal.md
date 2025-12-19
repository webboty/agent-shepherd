# Change: Build Agent Shepherd Orchestration System

## Why
The current agent ecosystem lacks effective orchestration for multi-step workflows, policy enforcement, and human-in-the-loop coordination. Agent Shepherd fills this gap by providing a production-ready TypeScript/Bun project that orchestrates AI coding agents across Beads issues, using OpenCode as the execution environment, enabling safe, explainable, and autonomous software development.

**Reference Documentation**: See @urls.md for authoritative links to Beads, OpenCode, OpenSpec, BMAD Method, ReactFlow, and architectural inspiration from Steve Yegge's articles on agent autonomy and multi-step development.

## What Changes
- Add full CLI interface with commands for worker, monitor, work, init, install, sync-agents, ui
- Implement Worker Engine to pull from Beads and launch agents in OpenCode sessions
- Add Monitor Engine for supervision, timeout detection, and HITL handling
- Create Policy Engine for workflow phase transitions and retries
- Build Agent Registry with capability-based agent selection
- Integrate logging with JSONL and SQLite dual storage like Beads
- Add OpenCode integration using @opencode-ai/sdk for session management
- Implement Beads integration via shell commands for issue management
- Develop minimal ReactFlow-based UI for flow visualization
- Include installer and init commands with default configs

## Impact
- Affected specs: New capabilities for cli, worker-engine, monitor-engine, policy-engine, agent-registry, logging, opencode-integration, beads-integration, ui, installer-init
- Affected code: New full project structure with src/, package.json, tsconfig.json, bunfig.toml
- **BREAKING**: This introduces a completely new system, no existing code impacted