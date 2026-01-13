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
import { loadConfig, type ContainerHandlingMode, type LevelPolicy } from "./config";

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
  level: Map<string, number>;
}

export interface ScoredIssue {
  issue: BeadsIssue;
  depScore: number;
  hierarchyScore: number;
  composite_score: number;
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
     * Check if an epic is a container (has children but no actual work)
     * Uses multi-factor analysis based on configuration
     */
   private async isContainer(issue: BeadsIssue): Promise<{
     is_container: boolean;
     confidence: number;
     reasons: string[];
   }> {
     const config = loadConfig();
     const containerConfig = config.container_handling;

     if (!containerConfig?.enabled) {
       return { is_container: false, confidence: 0, reasons: ["Container handling disabled"] };
     }

     const reasons: string[] = [];
     let confidenceScore = 0;
     let totalFactors = 0;

     // Factor 1: Issue type (epic)
     if (issue.issue_type === "epic") {
       confidenceScore += 0.5;
       reasons.push("Issue type is epic");
       totalFactors++;
     } else {
       reasons.push(`Issue type is ${issue.issue_type}, not epic`);
     }

     // Factor 2: Children check
     if (containerConfig.container_detection?.check_children) {
       const children = await this.getContainerChildren(issue.id);
       if (children.length >= (containerConfig.container_detection.min_children || 2)) {
         confidenceScore += 0.3;
         reasons.push(`Has ${children.length} children`);
         totalFactors++;
       } else {
         reasons.push(`Insufficient children (${children.length})`);
       }
     }

     // Factor 3: Description pattern check
     if (containerConfig.container_detection?.check_description) {
       const description = (issue.description || "").toLowerCase();
       const containerIndicators = [
         "contains", "phase", "group", "subtasks", "children",
         "when assigned this epic", "select the next available child",
         "this epic contains", "work in this epic"
       ];

       const hasContainerLanguage = containerIndicators.some(indicator =>
         description.includes(indicator)
       );

       if (hasContainerLanguage) {
         confidenceScore += 0.15;
         reasons.push("Description contains container language");
         totalFactors++;
       }
     }

     // Factor 4: Dependency pattern check
     if (containerConfig.container_detection?.check_dependencies) {
       const dependencies = await this.getIssueDependencies(issue.id);
       if (dependencies.length > 0) {
         const hasParentChildDeps = dependencies.some(dep =>
           dep.dependency_type === "parent-child"
         );

         if (hasParentChildDeps) {
           confidenceScore += 0.2;
           reasons.push("Has parent-child dependencies");
           totalFactors++;
         }
       }
     }

     // Normalize confidence score
     const normalizedConfidence = totalFactors > 0 ? confidenceScore / totalFactors : 0;

     // Container threshold: 0.6 or higher confidence
     const isContainer = normalizedConfidence >= 0.6;

     return {
       is_container: isContainer,
       confidence: normalizedConfidence,
       reasons
     };
   }

    /**
     * Get children that this issue contains as a container
     */
    private async getContainerChildren(issueId: string): Promise<BeadsIssue[]> {
      try {
        const { execBeadsCommand } = await import("./beads.ts");
        const output = await execBeadsCommand(["dep", "list", issueId, "--json"]);
        const deps = JSON.parse(output);

        if (!Array.isArray(deps)) {
          return [];
        }

        // Filter for parent-child dependencies (children)
        const childIds = deps
          .filter((dep: any) => dep.dependency_type === "parent-child")
          .map((dep: any) => dep.id);

        // Get full issue details for each child
        const children: BeadsIssue[] = [];
        for (const childId of childIds) {
          try {
            const childOutput = await execBeadsCommand(["show", childId, "--json"]);
            const childIssue = JSON.parse(childOutput);
            children.push(childIssue);
          } catch (error) {
            console.warn(`Failed to get child issue ${childId}: ${error}`);
          }
        }

        return children;
      } catch (error) {
        console.warn(`Failed to get container children for ${issueId}: ${error}`);
        return [];
      }
    }

    /**
     * Get dependencies for an issue
     */
    private async getIssueDependencies(issueId: string): Promise<any[]> {
      try {
        const { execBeadsCommand } = await import("./beads.ts");
        const output = await execBeadsCommand(["dep", "list", issueId, "--json"]);
        const deps = JSON.parse(output);

        if (!Array.isArray(deps)) {
          return [];
        }

        return deps;
      } catch (error) {
        console.warn(`Failed to get dependencies for ${issueId}: ${error}`);
        return [];
      }
    }

    /**
     * Get container handling policy for an issue based on hierarchy level
     */
    private getContainerHandlingPolicy(issue: BeadsIssue): {
      mode: ContainerHandlingMode;
      workflow_override?: string;
      level: number;
    } {
      const config = loadConfig();
      const containerConfig = config.container_handling;

      if (!containerConfig?.enabled) {
        return {
          mode: containerConfig?.default_mode || "auto-close",
          level: 0
        };
      }

      // Calculate hierarchy level from issue ID
      const level = this.calculateHierarchicalDepth(issue.id);

      // Check for level-specific policy
      if (containerConfig.level_policies && containerConfig.level_policies[level.toString()]) {
        const levelPolicy = containerConfig.level_policies[level.toString()] as LevelPolicy;
        return {
          mode: levelPolicy.mode,
          workflow_override: levelPolicy.workflow_override,
          level
        };
      }

      // Fall back to default mode
      return {
        mode: containerConfig.default_mode || "auto-close",
        level
      };
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

     // Filter out containers that should be auto-closed
     const nonContainers: BeadsIssue[] = [];
     for (const issue of available) {
       const containerCheck = await this.isContainer(issue);
       const policy = this.getContainerHandlingPolicy(issue);

       // Skip containers in auto-close mode
       if (containerCheck.is_container && policy.mode === "auto-close") {
         console.log(
           `Skipping container ${issue.id} (confidence: ${containerCheck.confidence.toFixed(2)}): ${containerCheck.reasons.join(", ")}`
         );
         continue;
       }
       nonContainers.push(issue);
     }

     if (nonContainers.length === 0) {
       return [];
     }

     const graph = await this.buildDependencyGraph(nonContainers);
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
    * Build dependency graph from issues with level tracking
    */
   async buildDependencyGraph(issues: BeadsIssue[]): Promise<DependencyGraph> {
     const nodes = new Map<string, BeadsIssue>();
     const edges: DependencyEdge[] = [];
     const indegree = new Map<string, number>();
     const depth = new Map<string, number>();
     const level = new Map<string, number>();

     for (const issue of issues) {
       nodes.set(issue.id, issue);
       indegree.set(issue.id, 0);
       const depthValue = this.calculateHierarchicalDepth(issue.id);
       depth.set(issue.id, depthValue);
       level.set(issue.id, depthValue);
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

     return { nodes, edges, indegree, depth, level };
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
    * Apply smart ordering using configured strategy
    */
   private applySmartOrdering(graph: DependencyGraph): BeadsIssue[] {
     const config = loadConfig();
     const orderingStrategy = config.container_handling?.ordering?.strategy || "hybrid";

     switch (orderingStrategy) {
       case "dependency":
         return this.applyDependencyOrdering(graph);
       case "hierarchy":
         return this.applyHierarchyOrdering(graph);
       case "hybrid":
       default:
         return this.applyHybridOrdering(graph);
     }
   }

   /**
    * Apply dependency-only ordering (topological sort)
    */
   private applyDependencyOrdering(graph: DependencyGraph): BeadsIssue[] {
     const ordered: BeadsIssue[] = [];
     const queue = this.initializeQueue(graph);

     while (queue.length > 0) {
       queue.sort((a, b) => this.compareByPriorityAndId(a, b));
       const current = queue.shift()!;
       ordered.push(current);

       this.decrementIndegrees(graph, current.id, queue);
     }

     return ordered;
   }

   /**
     * Apply hierarchy-only ordering (depth-based)
     */
   private applyHierarchyOrdering(graph: DependencyGraph): BeadsIssue[] {
      const queue: BeadsIssue[] = [];

      // Add all nodes to queue
      for (const [, issue] of graph.nodes.entries()) {
        queue.push(issue);
      }

      // Sort by hierarchical depth, priority, then ID
      queue.sort((a, b) => this.compareByHierarchy(a, b, graph));

      return queue;
   }

   /**
    * Apply hybrid ordering (dependency primary + hierarchy fallback)
    */
   private applyHybridOrdering(graph: DependencyGraph): BeadsIssue[] {
     const config = loadConfig();
     const dependencyWeight = config.container_handling?.ordering?.dependency_weight || 0.7;

     const scoredIssues = Array.from(graph.nodes.values()).map(issue => ({
       issue,
       depScore: this.calculateDependencyCompleteness(issue.id, graph),
       hierarchyScore: this.calculateHierarchicalPriority(issue.id, graph),
       composite_score: 0
     }));

     // Combine scores with weights
     scoredIssues.forEach(scored => {
       scored.composite_score =
         scored.depScore * dependencyWeight +
         scored.hierarchyScore * (1 - dependencyWeight);
     });

     // Separate into dependency-ordered and hierarchy-ordered groups
     const fullyAvailable = scoredIssues.filter(s => s.depScore === 1.0);
     const partiallyAvailable = scoredIssues.filter(s => s.depScore < 1.0);

     // Sort fully available by hierarchy
     fullyAvailable.sort((a, b) => b.hierarchyScore - a.hierarchyScore);

     // Sort partially available by dependency score, then hierarchy
     partiallyAvailable.sort((a, b) => {
       if (b.depScore !== a.depScore) {
         return b.depScore - a.depScore;
       }
       return b.hierarchyScore - a.hierarchyScore;
     });

     // Combine: partially available first, then fully available
     const combined = [...partiallyAvailable, ...fullyAvailable];
     return combined.map(s => s.issue);
   }

   /**
    * Calculate dependency completeness score (0.0 to 1.0)
    * Higher score = more dependencies satisfied
    */
   private calculateDependencyCompleteness(issueId: string, graph: DependencyGraph): number {
     const indegree = graph.indegree.get(issueId) || 0;

     // If no dependencies, fully available
     if (indegree === 0) {
       return 1.0;
     }

     // Calculate how many dependencies are closed/completed
     const edges = graph.edges.filter(e => e.to === issueId);
     let completedDeps = 0;

     for (const edge of edges) {
       const depIssue = graph.nodes.get(edge.from);
       if (depIssue && depIssue.status === "closed") {
         completedDeps++;
       }
     }

     return completedDeps / indegree;
   }

   /**
    * Calculate hierarchical priority score (0.0 to 1.0)
    * Deeper issues get higher priority based on prefer_depth setting
    */
   private calculateHierarchicalPriority(issueId: string, graph: DependencyGraph): number {
     const depth = graph.depth.get(issueId) || 0;
     const issue = graph.nodes.get(issueId);

     if (!issue) {
       return 0;
     }

     // Normalize depth to 0-1 range (assuming max depth of 10)
     const normalizedDepth = Math.min(depth / 10, 1.0);

     // Normalize priority (P1=1.0, P20=0.05)
     const normalizedPriority = Math.max(0, 1.0 - (issue.priority - 1) / 19);

     // Combine depth and priority
     // Higher depth preference means depth matters more
     const depthWeight = 0.5;
     const priorityWeight = 0.5;

     const score =
       normalizedDepth * depthWeight +
       normalizedPriority * priorityWeight;

     return score;
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
    * Compare issues by priority and ID only
    */
   private compareByPriorityAndId(a: BeadsIssue, b: BeadsIssue): number {
     if (a.priority !== b.priority) {
       return a.priority - b.priority;
     }
     return a.id.localeCompare(b.id);
   }

   /**
    * Compare issues by hierarchy depth and priority
    */
   private compareByHierarchy(
     a: BeadsIssue,
     b: BeadsIssue,
     graph: DependencyGraph
   ): number {
     const depthA = graph.depth.get(a.id) || 0;
     const depthB = graph.depth.get(b.id) || 0;

     if (depthA !== depthB) {
       return depthB - depthA; // Deeper first
     }

     if (a.priority !== b.priority) {
       return a.priority - b.priority; // Lower priority number first
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
