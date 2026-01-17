/**
 * Beads Integration
 * Handles shell commands for Beads issue operations
 */

export interface BeadsIssue {
  id: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "blocked" | "closed";
  priority: number;
  issue_type: string;
  created_at: string;
  updated_at: string;
  labels?: string[];
  dependency_count?: number;
  dependent_count?: number;
}

export interface BeadsUpdateOptions {
  status?: "open" | "in_progress" | "blocked" | "closed";
  priority?: number;
  assignee?: string;
  notes?: string;
}

/**
 * Execute a bd command and return output
 */
export async function execBeadsCommand(args: string[]): Promise<string> {
  const env: Record<string, string> = {};

  // Copy process.env but filter out undefined values
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  // Override with test isolation settings if set
  if (process.env.BEADS_DIR) {
    env.BEADS_DIR = process.env.BEADS_DIR;
  }
  if (process.env.BD_NO_DAEMON) {
    env.BD_NO_DAEMON = process.env.BD_NO_DAEMON;
  }
  if (process.env.BD_SANDBOX) {
    env.BD_SANDBOX = process.env.BD_SANDBOX;
  }

  const proc = Bun.spawn(["bd", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env,
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const error = await new Response(proc.stderr).text();
    throw new Error(`Beads command failed: ${error}`);
  }

  return output;
}

/**
 * Get ready issues from Beads
 */
export async function getReadyIssues(): Promise<BeadsIssue[]> {
  const output = await execBeadsCommand(["ready", "--json"]);
  const issues = JSON.parse(output);
  const issuesArray = Array.isArray(issues) ? issues : [];

  for (const issue of issuesArray) {
    issue.labels = await getIssueLabels(issue.id);
  }

  return issuesArray;
}

/**
 * Get issue details by ID
 */
export async function getIssue(issueId: string): Promise<BeadsIssue | null> {
  try {
    const output = await execBeadsCommand(["show", issueId, "--json"]);
    const result = JSON.parse(output);
    // Beads returns an array, so take the first element
    const issue = Array.isArray(result) ? result[0] || null : result;
    if (issue) {
      issue.labels = await getIssueLabels(issueId);
    }
    return issue;
  } catch {
    return null;
  }
}

/**
 * Update issue status and metadata
 */
export async function updateIssue(
  issueId: string,
  options: BeadsUpdateOptions
): Promise<void> {
  const args = ["update", issueId];

  if (options.status) {
    args.push("--status", options.status);
  }
  if (options.priority !== undefined) {
    args.push("--priority", options.priority.toString());
  }
  if (options.assignee) {
    args.push("--assignee", options.assignee);
  }
  if (options.notes) {
    args.push("--notes", options.notes);
  }

  await execBeadsCommand(args);
}

/**
 * Close an issue
 */
export async function closeIssue(
  issueId: string,
  reason?: string
): Promise<void> {
  const args = ["close", issueId];
  if (reason) {
    args.push("--reason", reason);
  }
  await execBeadsCommand(args);
}

/**
 * List all issues with optional filters
 */
export async function listIssues(filters?: {
  status?: string;
  priority?: number;
  assignee?: string;
}): Promise<BeadsIssue[]> {
  const args = ["list", "--json"];

  if (filters?.status) {
    args.push("--status", filters.status);
  }
  if (filters?.priority !== undefined) {
    args.push("--priority", filters.priority.toString());
  }
  if (filters?.assignee) {
    args.push("--assignee", filters.assignee);
  }

  const output = await execBeadsCommand(args);
  const issues = JSON.parse(output);
  return Array.isArray(issues) ? issues : [];
}

/**
 * Check if issue has blocking dependencies
 */
export async function hasBlockers(issueId: string): Promise<boolean> {
  const issue = await getIssue(issueId);
  if (!issue) {
    return true; // Treat missing issue as blocked
  }
  return (issue.dependency_count || 0) > 0;
}

/**
 * Get labels for an issue
 */
export async function getIssueLabels(issueId: string): Promise<string[]> {
  try {
    const output = await execBeadsCommand(["label", "list", issueId, "--json"]);
    const labels = JSON.parse(output);
    return Array.isArray(labels) ? labels : [];
  } catch {
    return [];
  }
}

/**
 * Update labels for an issue (add and remove)
 */
export async function updateIssueLabels(
  issueId: string,
  addLabels: string[] = [],
  removeLabels: string[] = []
): Promise<void> {
  for (const label of addLabels) {
    await addIssueLabel(issueId, label);
  }
  for (const label of removeLabels) {
    await removeIssueLabel(issueId, label);
  }
}

/**
 * Add a label to an issue
 */
export async function addIssueLabel(issueId: string, label: string): Promise<void> {
  await execBeadsCommand(["label", "add", issueId, label]);
}

/**
 * Remove a label from an issue
 */
export async function removeIssueLabel(issueId: string, label: string): Promise<void> {
  await execBeadsCommand(["label", "remove", issueId, label]);
}

/**
 * Set phase label for an issue (ashep-phase:<phase-name>)
 */
export async function setPhaseLabel(issueId: string, phaseName: string): Promise<void> {
  const label = `ashep-phase:${phaseName}`;
  await addIssueLabel(issueId, label);
}

/**
 * Remove all phase labels from an issue
 */
export async function removePhaseLabels(issueId: string): Promise<void> {
  const labels = await getIssueLabels(issueId);
  const phaseLabels = labels.filter((label) => label.startsWith("ashep-phase:"));
  
  for (const label of phaseLabels) {
    await removeIssueLabel(issueId, label);
  }
}

/**
 * Set HITL (Human-in-the-Loop) label for an issue (ashep-hitl:<reason>)
 */
export async function setHITLLabel(issueId: string, reason: string): Promise<void> {
  const label = `ashep-hitl:${reason}`;
  await addIssueLabel(issueId, label);
}

/**
 * Clear all HITL labels from an issue
 */
export async function clearHITLLabels(issueId: string): Promise<void> {
  const labels = await getIssueLabels(issueId);
  const hitlLabels = labels.filter((label) => label.startsWith("ashep-hitl:"));
  
  for (const label of hitlLabels) {
    await removeIssueLabel(issueId, label);
  }
}

/**
 * Get current phase from issue labels
 */
export async function getCurrentPhase(issueId: string): Promise<string | null> {
  const labels = await getIssueLabels(issueId);
  const phaseLabel = labels.find((label) => label.startsWith("ashep-phase:"));
  
  if (phaseLabel) {
    return phaseLabel.replace("ashep-phase:", "");
  }
  
  return null;
}

/**
 * Get HITL reason from issue labels
 */
export async function getHITLReason(issueId: string): Promise<string | null> {
  const labels = await getIssueLabels(issueId);
  const hitlLabel = labels.find((label) => label.startsWith("ashep-hitl:"));
  
  if (hitlLabel) {
    return hitlLabel.replace("ashep-hitl:", "");
  }
  
  return null;
}

/**
 * Check if issue has excluded label (ashep-excluded)
 */
export async function hasExcludedLabel(issueId: string): Promise<boolean> {
  const labels = await getIssueLabels(issueId);
  return labels.includes("ashep-excluded");
}

/**
 * Set ashep-managed label for an issue
 */
export async function setAshepManagedLabel(issueId: string): Promise<void> {
  await addIssueLabel(issueId, "ashep-managed");
}

/**
 * Remove ashep-managed label from an issue
 */
export async function removeAshepManagedLabel(issueId: string): Promise<void> {
  await removeIssueLabel(issueId, "ashep-managed");
}

  /**
   * Check if issue has ashep-managed label
   */
  export async function hasAshepManagedLabel(issueId: string): Promise<boolean> {
    const labels = await getIssueLabels(issueId);
    return labels.includes("ashep-managed");
  }

  /**
   * Set epic coordination state using bd set-state
   * 
   * Coordination states:
   * - assigned-worker: Worker ID currently assigned to epic
   * - last-heartbeat: Timestamp of last heartbeat activity
   * - lease-expires: Unix timestamp when lease expires
   * 
   * @param epicId - The epic issue ID
   * @param key - State dimension name (e.g., "assigned-worker", "last-heartbeat")
   * @param value - State value
   */
  export async function setEpicState(epicId: string, key: string, value: string): Promise<void> {
    const stateString = `${key}=${value}`;
    await execBeadsCommand(["set-state", epicId, stateString]);
  }

  /**
   * Get epic coordination state using bd state
   * 
   * @param epicId - The epic issue ID
   * @param key - State dimension name (e.g., "assigned-worker", "last-heartbeat")
   * @returns State value, or null if not set
   */
  export async function getEpicState(epicId: string, key: string): Promise<string | null> {
    try {
      const output = await execBeadsCommand(["state", epicId, key]);
      const trimmed = output.trim();

      if (trimmed === "" || trimmed === "null" || trimmed.startsWith("(no ") && trimmed.endsWith(" state set)")) {
        return null;
      }

      return trimmed;
    } catch {
      return null;
    }
  }

  /**
   * Set assigned worker state for an epic
   * 
   * @param epicId - The epic issue ID
   * @param workerId - Worker identifier
   */
  export async function setAssignedWorker(epicId: string, workerId: string): Promise<void> {
    await setEpicState(epicId, "assigned-worker", workerId);
  }

  /**
   * Get assigned worker for an epic
   * 
   * @param epicId - The epic issue ID
   * @returns Worker ID, or null if not assigned
   */
  export async function getAssignedWorker(epicId: string): Promise<string | null> {
    return await getEpicState(epicId, "assigned-worker");
  }

  /**
   * Set last heartbeat timestamp for an epic
   * 
   * @param epicId - The epic issue ID
   * @param timestamp - Unix timestamp in milliseconds
   */
  export async function setLastHeartbeat(epicId: string, timestamp: number): Promise<void> {
    await setEpicState(epicId, "last-heartbeat", timestamp.toString());
  }

  /**
   * Get last heartbeat timestamp for an epic
   * 
   * @param epicId - The epic issue ID
   * @returns Unix timestamp in milliseconds, or null if not set
   */
  export async function getLastHeartbeat(epicId: string): Promise<number | null> {
    const value = await getEpicState(epicId, "last-heartbeat");
    return value ? parseInt(value, 10) : null;
  }

  /**
   * Set lease expiration time for an epic
   * 
   * @param epicId - The epic issue ID
   * @param expiresAt - Unix timestamp in milliseconds
   */
  export async function setLeaseExpires(epicId: string, expiresAt: number): Promise<void> {
    await setEpicState(epicId, "lease-expires", expiresAt.toString());
  }

  /**
   * Get lease expiration time for an epic
   * 
   * @param epicId - The epic issue ID
   * @returns Unix timestamp in milliseconds, or null if not set
   */
  export async function getLeaseExpires(epicId: string): Promise<number | null> {
    const value = await getEpicState(epicId, "lease-expires");
    return value ? parseInt(value, 10) : null;
  }

  /**
   * Check if a lease has expired
   * 
   * @param epicId - The epic issue ID
   * @returns True if lease is expired or not set, false otherwise
   */
  export async function isLeaseExpired(epicId: string): Promise<boolean> {
    const expiresAt = await getLeaseExpires(epicId);
    if (expiresAt === null) {
      return true; // No lease means expired
    }
    return Date.now() > expiresAt;
  }

   /**
    * Clear all coordination states for an epic
    *
    * @param epicId - The epic issue ID
    */
   export async function clearEpicStates(epicId: string): Promise<void> {
     await Promise.all([
       setEpicState(epicId, "assigned-worker", ""),
       setEpicState(epicId, "last-heartbeat", ""),
       setEpicState(epicId, "lease-expires", ""),
     ]);
   }

   /**
    * Set container validation outcome label for an issue (ashep-validation:<outcome>)
    *
    * @param issueId - The issue ID
    * @param outcome - Validation outcome (DONE, NEEDS_WORK, UNCLEAR)
    */
   export async function setContainerValidationLabel(issueId: string, outcome: "DONE" | "NEEDS_WORK" | "UNCLEAR"): Promise<void> {
     const label = `ashep-validation:${outcome}`;
     await addIssueLabel(issueId, label);
   }

   /**
    * Clear all container validation labels from an issue
    *
    * @param issueId - The issue ID
    */
   export async function clearContainerValidationLabels(issueId: string): Promise<void> {
     const labels = await getIssueLabels(issueId);
     const validationLabels = labels.filter((label) => label.startsWith("ashep-validation:"));

     for (const label of validationLabels) {
       await removeIssueLabel(issueId, label);
     }
   }

   /**
    * Get container validation outcome from issue labels
    *
    * @param issueId - The issue ID
    * @returns Validation outcome, or null if not set
    */
   export async function getContainerValidationOutcome(issueId: string): Promise<"DONE" | "NEEDS_WORK" | "UNCLEAR" | null> {
     const labels = await getIssueLabels(issueId);
     const validationLabel = labels.find((label) => label.startsWith("ashep-validation:"));

     if (validationLabel) {
       const outcome = validationLabel.replace("ashep-validation:", "");
       if (["DONE", "NEEDS_WORK", "UNCLEAR"].includes(outcome)) {
         return outcome as "DONE" | "NEEDS_WORK" | "UNCLEAR";
       }
     }

     return null;
   }
