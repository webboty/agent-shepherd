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
async function execBeadsCommand(args: string[]): Promise<string> {
  const proc = Bun.spawn(["bd", ...args], {
    stdout: "pipe",
    stderr: "pipe",
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
  return Array.isArray(issues) ? issues : [];
}

/**
 * Get issue details by ID
 */
export async function getIssue(issueId: string): Promise<BeadsIssue | null> {
  try {
    const output = await execBeadsCommand(["show", issueId, "--json"]);
    const result = JSON.parse(output);
    // Beads returns an array, so take the first element
    return Array.isArray(result) ? result[0] || null : result;
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
