/**
 * Issue Picker
 * Smart issue selection with dependency-aware ordering
 */

import {
  getReadyIssues,
  type BeadsIssue,
  getAssignedWorker,
  isLeaseExpired,
} from "./beads.ts";
import { getCrashDetector, type CrashDetectionConfig } from "./crash-detector.js";

export interface DependencyEdge {
  from: string;
  to: string;
  type: "blocks" | "parent-child" | "related";
}

export interface DependencyGraph {
  nodes: Map<string, BeadsIssue>;
  edges: DependencyEdge[];
  indegree: Map<string, number>;
  depth: Map<string, number>;
}

export interface PickerConfig {
  mode: "simple" | "smart";
  max_issues?: number;
  prefer_epic_affinity?: boolean;
  crash_detection?: CrashDetectionConfig;
}

/**
 * Issue Picker for smart issue selection
 */
export class IssuePicker {
  private config: PickerConfig;

  constructor(config?: Partial<PickerConfig>) {
    this.config = {
      mode: "simple",
      max_issues: 3,
      prefer_epic_affinity: true,
      crash_detection: undefined,
      ...config,
    };
  }

  /**
   * Pick next issues based on configured mode
   */
  async pickNextIssues(): Promise<BeadsIssue[]> {
    const allReadyIssues = await getReadyIssues();

    if (this.config.mode === "simple") {
      return this.simplePick(allReadyIssues);
    }

    return this.smartPick(allReadyIssues);
  }

  /**
   * Simple picking mode: priority-based selection
   */
  private simplePick(issues: BeadsIssue[]): BeadsIssue[] {
    const filtered = this.filterExcluded(issues);

    filtered.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.id.localeCompare(b.id);
    });

    return filtered.slice(0, this.config.max_issues);
  }

  /**
   * Smart picking mode: dependency-aware selection
   */
  private async smartPick(issues: BeadsIssue[]): Promise<BeadsIssue[]> {
    const filtered = this.filterExcluded(issues);
    const available = await this.filterByCoordinationState(filtered);

    if (available.length === 0) {
      return [];
    }

    const graph = await this.buildDependencyGraph(available);
    const ordered = this.applySmartOrdering(graph);

    return ordered.slice(0, this.config.max_issues);
  }

  /**
   * Filter out excluded issues
   */
  private filterExcluded(issues: BeadsIssue[]): BeadsIssue[] {
    return issues.filter((issue) => !issue.labels?.includes("ashep-excluded"));
  }

  /**
     * Filter issues by coordination state (check epic assignments)
     */
  private async filterByCoordinationState(
    issues: BeadsIssue[]
  ): Promise<BeadsIssue[]> {
    const crashDetector = this.config.crash_detection
      ? getCrashDetector(this.config.crash_detection)
      : undefined;

    const workerId = process.env.ASHEP_WORKER_ID || "default";
    const available: BeadsIssue[] = [];
    const epicGroups = new Map<string, BeadsIssue[]>();

    for (const issue of issues) {
      const epicId = this.extractEpicId(issue.id);

      if (!epicId) {
        available.push(issue);
        continue;
      }

      if (!epicGroups.has(epicId)) {
        epicGroups.set(epicId, []);
      }
      epicGroups.get(epicId)!.push(issue);
    }

    for (const [epicId, epicIssues] of epicGroups.entries()) {
      const assignedWorker = await getAssignedWorker(epicId);

      if (!assignedWorker) {
        available.push(...epicIssues);
        continue;
      }

      if (assignedWorker === workerId) {
        const expired = await isLeaseExpired(epicId);
        if (expired) {
          available.push(...epicIssues);
        }
        continue;
      }

      // Another worker owns this epic, check for abandonment
      if (crashDetector) {
        const abandonment = await crashDetector.checkAbandonment(epicId);

        if (abandonment.abandoned) {
          console.log(`Epic ${epicId} abandoned by ${assignedWorker}: ${abandonment.reason}`);
          available.push(...epicIssues);
        }
      }
    }

    return available;
  }

  /**
   * Extract epic ID from issue ID
   */
  private extractEpicId(issueId: string): string | null {
    const parts = issueId.split(".");

    if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
      return parts[0];
    }

    return null;
  }

  /**
   * Build dependency graph from issues
   */
  async buildDependencyGraph(issues: BeadsIssue[]): Promise<DependencyGraph> {
    const nodes = new Map<string, BeadsIssue>();
    const edges: DependencyEdge[] = [];
    const indegree = new Map<string, number>();
    const depth = new Map<string, number>();

    for (const issue of issues) {
      nodes.set(issue.id, issue);
      indegree.set(issue.id, 0);
      depth.set(issue.id, this.calculateHierarchicalDepth(issue.id));
    }

    const allDeps = await Promise.all(
      issues.map(async (issue) => ({
        issue,
        deps: await this.getDependencies(issue.id),
      }))
    );

    for (const { issue, deps } of allDeps) {
      for (const dep of deps) {
        if (nodes.has(dep.id)) {
          edges.push({ from: dep.id, to: issue.id, type: dep.type });
          indegree.set(issue.id, (indegree.get(issue.id) || 0) + 1);
        }
      }
    }

    return { nodes, edges, indegree, depth };
  }

  /**
   * Get dependencies for an issue (queries Beads)
   */
  private async getDependencies(issueId: string): Promise<
    Array<{ id: string; type: "blocks" | "parent-child" | "related" }>
  > {
    const { execBeadsCommand } = await import("./beads.ts");

    try {
      const output = await execBeadsCommand(["dep", "list", issueId, "--json"]);
      const deps = JSON.parse(output);

      if (!Array.isArray(deps)) {
        return [];
      }

      return deps.map((dep: any) => ({
        id: dep.id,
        type: dep.dependency_type || "related",
      }));
    } catch (error) {
      console.warn(`Failed to fetch dependencies for ${issueId}: ${error}`);
      return [];
    }
  }

  /**
   * Calculate hierarchical depth from issue ID
   */
  private calculateHierarchicalDepth(issueId: string): number {
    const parts = issueId.split(".");
    let depth = 0;

    for (const part of parts.slice(1)) {
      if (/^\d+$/.test(part)) {
        depth++;
      }
    }

    return depth;
  }

  /**
   * Apply smart ordering using topological sort with secondary criteria
   */
  private applySmartOrdering(graph: DependencyGraph): BeadsIssue[] {
    const ordered: BeadsIssue[] = [];
    const queue = this.initializeQueue(graph);

    while (queue.length > 0) {
      queue.sort((a, b) => this.compareIssues(a, b, graph));
      const current = queue.shift()!;
      ordered.push(current);

      this.decrementIndegrees(graph, current.id, queue);
    }

    return ordered;
  }

  /**
   * Initialize queue with nodes that have no dependencies
   */
  private initializeQueue(graph: DependencyGraph): BeadsIssue[] {
    const queue: BeadsIssue[] = [];

    for (const [issueId, indegree] of graph.indegree.entries()) {
      if (indegree === 0) {
        const issue = graph.nodes.get(issueId);
        if (issue) {
          queue.push(issue);
        }
      }
    }

    return queue;
  }

  /**
   * Compare issues for ordering (hierarchical depth, priority, ID)
   */
  private compareIssues(
    a: BeadsIssue,
    b: BeadsIssue,
    graph: DependencyGraph
  ): number {
    const depthA = graph.depth.get(a.id) || 0;
    const depthB = graph.depth.get(b.id) || 0;

    if (depthA !== depthB) {
      return depthB - depthA;
    }

    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    return a.id.localeCompare(b.id);
  }

  /**
   * Decrement indegrees of dependent issues and add to queue if ready
   */
  private decrementIndegrees(
    graph: DependencyGraph,
    issueId: string,
    queue: BeadsIssue[]
  ): void {
    for (const edge of graph.edges) {
      if (edge.from === issueId) {
        const newIndegree = (graph.indegree.get(edge.to) || 0) - 1;
        graph.indegree.set(edge.to, newIndegree);

        if (newIndegree === 0) {
          const issue = graph.nodes.get(edge.to);
          if (issue && !queue.includes(issue)) {
            queue.push(issue);
          }
        }
      }
    }
  }

  /**
   * Update picker configuration
   */
  updateConfig(config: Partial<PickerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Claim an epic with crash detection and recovery
   * Checks for active assignments, recovers abandoned tasks, sets coordination states
   */
  async claimEpic(epicId: string, subtreeIssues: BeadsIssue[]): Promise<{
    claimed: boolean;
    reason?: string;
    recoveredIssues?: string[];
  }> {
    const crashDetector = this.config.crash_detection
      ? getCrashDetector(this.config.crash_detection)
      : null;

    if (!crashDetector) {
      // No crash detection, just set assignment
      const { setAssignedWorker, setLeaseExpires } = await import("./beads.ts");
      const workerId = process.env.ASHEP_WORKER_ID || "default";
      const leaseDurationMs = 30 * 60 * 1000; // 30 minutes default

      await setAssignedWorker(epicId, workerId);
      await setLeaseExpires(epicId, Date.now() + leaseDurationMs);

      return {
        claimed: true,
        reason: "Epic claimed without crash detection",
      };
    }

    return await crashDetector.claimEpic(epicId, subtreeIssues);
  }
}

/**
 * Create a singleton Issue Picker instance
 */
let defaultIssuePicker: IssuePicker | null = null;

export function getIssuePicker(config?: Partial<PickerConfig>): IssuePicker {
  if (!defaultIssuePicker) {
    defaultIssuePicker = new IssuePicker(config);
  }
  return defaultIssuePicker;
}

export function resetIssuePicker(): void {
  defaultIssuePicker = null;
}
