# 📚 **Reference URLs for Agent Shepherd — Official Documentation Bundle**

Below is a curated list of **authoritative URLs** that provide additional context, technical details, and reference material for all technologies involved in building **Agent Shepherd**.
You may use this list inside OpenCode, especially with BMAD v6, to deepen its understanding and allow it to pull accurate implementation details when generating the full system.

These URLs cover:

* Beads issue tracker
* Agent Mail
* OpenCode platform
* BMAD method
* OpenSpec (specification-driven development)
* SpecKitty
* MCP servers
* BasicMemory
* Architecture inspirations from Steve Yegge’s articles
* ReactFlow (UI visualization)
* Bun + TypeScript ecosystem recommendations

All links are **official and up to date**.

---

# 🌐 **1. Beads — Coordination Layer**

**Beads repository & docs**
[https://github.com/steveyegge/beads](https://github.com/steveyegge/beads)

**Beads Best Practices article**
[https://steve-yegge.medium.com/beads-best-practices-2db636b9760](https://steve-yegge.medium.com/beads-best-practices-2db636b9760)

**Agent Mail overview**
[https://github.com/steveyegge/beads/blob/main/docs/AGENT_MAIL.md](https://github.com/steveyegge/beads/blob/main/docs/AGENT_MAIL.md)

**Agent Mail quickstart**
[https://github.com/steveyegge/beads/blob/main/docs/AGENT_MAIL_QUICKSTART.md](https://github.com/steveyegge/beads/blob/main/docs/AGENT_MAIL_QUICKSTART.md)

**MCP Agent Mail helper implementation**
[https://github.com/Dicklesworthstone/mcp_agent_mail](https://github.com/Dicklesworthstone/mcp_agent_mail)

These URLs describe the mechanisms and semantics that Agent Shepherd will rely on for issue coordination, dependencies, and (future) multi-agent parallelism.

---

# 🤖 **2. BMAD — Planning and Coding Method**

**BMAD Method (official repo)**
[https://github.com/bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)

**BMAD agents**
[https://github.com/bmad-code-org/BMAD-METHOD/tree/main/src/modules/bmm](https://github.com/bmad-code-org/BMAD-METHOD/tree/main/src/modules/bmm)

**OpenCode + BMAD information**
[https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/ide-info/opencode.md](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/ide-info/opencode.md)

These links give BMAD access to all its own internal structures, expected file conventions, and agent behaviors.

---

# 📋 **3. OpenSpec — Specification-Driven Development**

**OpenSpec repository**
[https://github.com/Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)

OpenSpec provides the framework for creating and managing change proposals, specifications, and deltas used in this project's development process.

---

# 🧠 **4. OpenCode — Execution Layer for Agents**

**OpenCode website & homepage**
[https://opencode.ai/](https://opencode.ai/)

**CLI documentation**
[https://opencode.ai/docs/cli/](https://opencode.ai/docs/cli/)

**Server API documentation**
[https://opencode.ai/docs/server/](https://opencode.ai/docs/server/)

**SDK documentation**
[https://opencode.ai/docs/sdk/](https://opencode.ai/docs/sdk/)

**MCP servers in OpenCode**
[https://opencode.ai/docs/mcp-servers/](https://opencode.ai/docs/mcp-servers/)

Agent Shepherd relies heavily on OpenCode sessions, message handling, provider selection, and execution environment features.

---

# 🧩 **5. SpecKitty — Structured Specifications & Deltas**

**SpecKitty repository**
[https://github.com/Priivacy-ai/spec-kitty](https://github.com/Priivacy-ai/spec-kitty)

This is important for OpenSpec-style implementation phases, delta specs, and code-change instructions.

---

# 🧬 **6. BasicMemory (Optional Memory Layer)**

**BasicMemory docs**
[https://docs.basicmemory.com/](https://docs.basicmemory.com/)

Relevant later for storing summaries, tagging long-term reasoning, and referencing prior decisions.

---

# 🛠️ **7. Bun, TypeScript, React, ReactFlow (Foundation Tools for Shepherd UI)**

**Bun runtime**
[https://bun.sh/](https://bun.sh/)

**TypeScript**
[https://www.typescriptlang.org/docs/](https://www.typescriptlang.org/docs/)

**React**
[https://react.dev/](https://react.dev/)

**ReactFlow (visual workflow/graph library)**
[https://reactflow.dev/](https://reactflow.dev/)

**Rete.js (alternative node-editor UI)**
[https://retejs.org](https://retejs.org)

**GoJS (graph visualization library)**
[https://gojs.net](https://gojs.net)

These technologies power the optional Shepherd UI server that visualizes workflow timelines, agent runs, and phase transitions.

---

# 🧩 **8. Steve Yegge’s Articles (Architectural Inspiration)**

These two blog posts are especially relevant for OpenCode agents and Beads workflows:

**Six New Tips for Better Coding with Agents**
[https://steve-yegge.medium.com/six-new-tips-for-better-coding-with-agents-d4e9c86e42a9](https://steve-yegge.medium.com/six-new-tips-for-better-coding-with-agents-d4e9c86e42a9)

**Beads Best Practices (deep dive)**
[https://steve-yegge.medium.com/beads-best-practices-2db636b9760](https://steve-yegge.medium.com/beads-best-practices-2db636b9760)

These articles contain insights on:

* Agent autonomy
* Multi-step development
* How LLM agents should interact with codebases
* Why Beads enables parallelism and automation

---

# 📡 **9. Additional Infrastructure / Ecosystem Links (General Reference)**

**OpenAI MCP (Model Context Protocol)**
[https://modelcontextprotocol.io](https://modelcontextprotocol.io)

MCP is relevant because Shepherd may implement MPC servers to expose its own internal APIs to agents.
