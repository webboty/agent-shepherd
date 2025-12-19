## Context
Agent Shepherd is a new orchestration layer for AI coding agents, coordinating between Beads (coordination), OpenCode (execution), and human developers. It must handle policy-controlled workflows, agent selection, supervision, and HITL steps while maintaining explainability and safety.

**Key Technology Integrations** (see @urls.md for detailed docs):
- **Beads** ([github.com/steveyegge/beads](https://github.com/steveyegge/beads)): Issue tracking and coordination substrate with dependencies and lifecycle management
- **OpenCode** ([opencode.ai](https://opencode.ai/)): Execution environment providing persistent sessions, agent management, and @opencode-ai/sdk for integration
- **OpenSpec** ([github.com/Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)): Specification-driven development framework used for this project's change management
- **BMAD Method** ([github.com/bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)): Planning and coding methodology for structured agent workflows
- **ReactFlow** ([reactflow.dev](https://reactflow.dev/)): UI library for workflow visualization
- **Steve Yegge Articles**: Architectural inspiration for agent autonomy and multi-step development

## Goals / Non-Goals
- Goals: Implement full TypeScript/Bun project with CLI, worker, monitor, policy engine, agent registry, logging, OpenCode/Beads integrations, UI placeholder, installer
- Non-Goals: Full UI implementation (placeholder only), BasicMemory integration (MVP), multi-repo parallelism (future)

## Decisions
- Decision: Use Bun for runtime due to speed and bundling; TypeScript for type safety
- Alternatives considered: Node.js (slower startup), Deno (less ecosystem maturity)
- Decision: JSONL as source of truth for logs with SQLite cache for performance, like Beads
- Alternatives considered: Pure JSONL (slower queries), pure SQLite (less git-trackable)
- Decision: Standalone React UI served via tiny HTTP server on configurable port
- Alternatives considered: CLI-based Ink (less visual), integrated web view (more complex)

## Risks / Trade-offs
- Risk: Complex orchestration logic → Mitigation: Modular design with clear separation of concerns
- Risk: Agent non-determinism → Mitigation: Structured RunOutcome JSON requirements
- Trade-off: Performance vs auditability → JSONL source of truth with SQLite cache

## Migration Plan
- No migration needed; this is a new project
- Rollback: Delete project directory

## Open Questions
- Exact timeout multipliers for different agent providers
- UI port conflict handling