# Stop Chatting. Start Shipping.
## The Operating System for Autonomous AI Development

You have the AI models. You have the IDE. You have the ideas.
**So why are you still copy-pasting code like it's 2023?**

### The Problem: The "Human Router" Bottleneck
We’ve all been there. You ask an AI to write a feature. It writes code. You run it. It errors. You paste the error back. It fixes it. You verify. You commit.
You aren't coding anymore. **You are a router.** You are the manual glue holding the intelligence together.

It’s exhausting. It’s unscalable. And frankly, it’s a waste of your talent.

### Enter Agent Shepherd.
**Agent Shepherd** is not another chat window. It is an **orchestration engine** that turns your AI models into a disciplined, autonomous workforce. It doesn't just "generate code"—it manages the entire lifecycle of software development, from ticket to test to pull request.

---

### Why Agent Shepherd? (The "Secret Sauce")

Most AI tools are **reactive**: You talk, they answer.
Agent Shepherd is **proactive**: You define the goal, it drives the process.

#### 1. True Autonomous Workflows (The "Policy Engine")
Don't just ask for code. Define a **Policy**.
*   **Phase 1: Plan.** The AI researches the repo and proposes a design.
*   **Phase 2: Implement.** The AI writes the code in your actual file system.
*   **Phase 3: Validate.** The AI runs the tests. If they fail, it **automatically retries**, fixes its own bugs, and loops until green.
*   **Phase 4: Human Review.** Only when it works does it ping you for approval.

*You define the rules in simple YAML. Shepherd enforces them.*

#### 2. Bulletproof Reliability (The "Crash-Proof" Promise)
AI agents get stuck. They hallucinate. They loop. Computers crash.
Shepherd is built for the real world:
*   **Stateless Architecture:** If your machine dies, the work isn't lost. Shepherd picks up *exactly* where it left off using persistent state.
*   **Smart Supervision:** Our **Monitor Engine** watches the watchers. If an agent stalls or goes rogue, Shepherd detects the heartbeat loss, kills the zombie process, and restarts the job.
*   **Loop Prevention:** Prevents the "Infinite Retry" nightmare. If an agent is spinning its wheels, Shepherd detects the pattern and blocks the issue for human intervention.

#### 3. Context-Aware Intelligence (The "Phase Messenger")
Shepherd doesn't just dump context. It passes **structured knowledge** between agents.
The "Planner" agent passes a design document to the "Coder" agent. The "Coder" passes test results to the "Validator".
It’s like a relay race where every runner knows exactly what the previous runner learned.

#### 4. Strict Concurrency Control
Don't burn your API credits or melt your CPU.
Shepherd enforces **global concurrency limits**. Whether you have 1 issue or 1,000, Shepherd ensures only `N` agents run simultaneously, queueing the rest. It respects your infrastructure limits while maximizing throughput.

---

### What's In It For You?

#### For the Solo Developer:
*   **The "Night Shift":** Queue up 10 tasks before bed. Shepherd works through the night. Wake up to 8 finished features and 2 blocking questions.
*   **No More Context Switching:** Let Shepherd handle the mundane "fix-test-repeat" loops while you focus on architecture.

#### For the Engineering Team:
*   **Standardization:** Enforce coding standards via Policies. Every feature goes through the same rigorous Plan -> Code -> Test flow.
*   **Transparency:** Every decision, every retry, and every transition is logged in the **Run Database**. You know *why* the AI made a decision.
*   **Integration:** Built directly on top of **Beads** (issue tracking) and **OpenCode** (agent execution). It fits into your existing ecosystem.

---

### The Technology Stack (Under the Hood)
We didn't just wrap an API. We built a system.
*   **Core:** TypeScript/Node.js based orchestration engine.
*   **State:** Dual-layer storage (JSONL for audit logs + SQLite for high-performance querying).
*   **Execution:** Deep integration with the **OpenCode SDK** for robust session management.
*   **Protocol:** Intelligent `parts`-based payload handling to ensure complex instructions are never lost.

### The Offer
You can keep manually shepherding your AI, acting as the glorified copy-paster.
Or you can hire **Agent Shepherd**.

It’s not just a tool. It’s your new Engineering Manager.

**Agent Shepherd.**
*Automate the Process. Keep the Control.*
