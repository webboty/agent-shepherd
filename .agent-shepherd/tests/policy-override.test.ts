/**
 * Tests for forced policy overrides in WorkerEngine
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { WorkerEngine } from "../src/core/worker-engine";
import type { BeadsIssue } from "../src/core/beads";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

// Define LoggerMock class
class LoggerMock {
  static instance: LoggerMock;
  static getInstance() {
    if (!LoggerMock.instance) LoggerMock.instance = new LoggerMock();
    return LoggerMock.instance;
  }
  getPhaseRetryCount() { return 0; }
  getPhaseTotalDuration() { return 0; }
  createRun() { 
    return { 
      id: `run-${Date.now()}`,
      status: 'pending',
      metadata: {}
    }; 
  }
  updateRun() {}
  logDecision() {}
  logInfo() {}
  logError() {}
  queryRuns() { return []; }
  getPhaseVisitCount() { return 0; }
  close() {}
}

// Mock PolicyEngine
const mockMatchPolicy = mock(() => "default-policy");
const mockGetPhaseSequence = mock(() => ["phase1"]);
const mockGetPhaseConfig = mock(() => ({ capabilities: ["coding"] }));

const mockPolicyEngine = {
  matchPolicy: mockMatchPolicy,
  getPhaseSequence: mockGetPhaseSequence,
  getPhaseConfig: mockGetPhaseConfig,
};

// Mock AgentRegistry
const mockSelectAgent = mock(() => ({ 
  id: "test-agent", 
  name: "Test Agent", 
  capabilities: ["coding"] 
}));

const mockAgentRegistry = {
  selectAgent: mockSelectAgent,
};

// Mock IssuePicker
const mockPickNextIssues = mock(async () => []);
const mockIssuePicker = {
  pickNextIssues: mockPickNextIssues
};

// Mock dependencies
mock.module("../src/core/policy", () => ({
  getPolicyEngine: () => mockPolicyEngine,
}));

mock.module("../src/core/agent-registry", () => ({
  getAgentRegistry: () => mockAgentRegistry,
}));

// We DON'T mock logging globally to avoid breaking other tests
// We will inject the mock logger into the worker instance manually

mock.module("../src/core/issue-picker", () => ({
  getIssuePicker: () => mockIssuePicker,
}));

// Mock Beads functions
mock.module("../src/core/beads", () => ({
  getCurrentPhase: async () => null,
  setPhaseLabel: async () => {},
  hasAshepManagedLabel: async () => true,
  setAshepManagedLabel: async () => {},
  updateIssue: async () => {},
  getIssue: async () => null
}));

const __dirname = import.meta.dir;
const TEMP_DIR = join(__dirname, "..", "..", "tmp_test");

describe("WorkerEngine Policy Override", () => {
  let worker: WorkerEngine;
  let testDataDir: string;

  beforeEach(() => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testDataDir = join(TEMP_DIR, `.test-policy-override-${timestamp}-${random}`);
    mkdirSync(testDataDir, { recursive: true });
    process.env.ASHEP_DIR = testDataDir;
    
    // Create instance (mocks will be injected)
    worker = new WorkerEngine();
    
    // Inject mock logger manually to avoid global mock leakage
    (worker as any).logger = LoggerMock.getInstance();
    
    // Reset mocks
    mockMatchPolicy.mockClear();
    mockGetPhaseSequence.mockClear();
    mockGetPhaseConfig.mockClear();
  });

  afterEach(() => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    delete process.env.ASHEP_DIR;
  });

  it("should use matched policy when no force policy is set", async () => {
    const issue: BeadsIssue = {
      id: "TEST-1",
      title: "Test Issue",
      description: "Test",
      status: "open",
      priority: 1,
      issue_type: "task",
      created_at: "",
      updated_at: ""
    };

    // We can't easily run full processIssue due to complex dependencies (OpenCode, etc)
    // But we can check internal state if we could access it, or spy on the policy engine.
    // Since we mocked the policy engine, we can check if matchPolicy was called.
    
    // However, processIssue does a lot. Let's try to run it and expect it to fail 
    // at a later step (agent selection or execution) but check the policy call first.
    
    // Mock AgentRegistry to return an agent so it proceeds
    mockSelectAgent.mockReturnValue({ id: "agent1", name: "Agent", capabilities: [] });
    
    // We expect processIssue to fail at OpenCode execution because we didn't mock OpenCode properly
    // in the WorkerEngine constructor. WorkerEngine imports getOpenCodeClient.
    // Let's rely on the fact that we can modify the worker instance to test the logic block.
    
    // Actually, simpler: The new logic is at the very top of processIssue.
    // We can't partially mock the class easily.
    // Let's assume the integration test style is better or we mock everything.
    
    try {
      await worker.processIssue(issue);
    } catch (e) {
      // Ignore subsequent errors
    }

    // Check that matchPolicy WAS called
    expect(mockMatchPolicy).toHaveBeenCalledWith(issue);
  });

  it("should SKIP matchPolicy when force policy is set", async () => {
    const issue: BeadsIssue = {
      id: "TEST-2",
      title: "Test Issue 2",
      description: "Test",
      status: "open",
      priority: 1,
      issue_type: "task",
      created_at: "",
      updated_at: ""
    };

    worker.setForcePolicy("forced-policy-name");

    try {
      await worker.processIssue(issue);
    } catch (e) {
      // Ignore subsequent errors
    }

    // matchPolicy should NOT be called because we forced it
    expect(mockMatchPolicy).not.toHaveBeenCalled();
    
    // getPhaseSequence SHOULD be called with the forced policy name
    expect(mockGetPhaseSequence).toHaveBeenCalledWith("forced-policy-name");
  });
});
