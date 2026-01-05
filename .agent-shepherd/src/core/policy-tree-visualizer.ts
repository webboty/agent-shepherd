/**
 * Policy Tree Visualizer
 * Provides visual representations of policy-capability-agent relationships
 */

import { getPolicyEngine } from "./policy";
import { getAgentRegistry } from "./agent-registry";
import { policyCapabilityValidator } from "./policy-capability-validator";

export interface TreeNode {
  id: string;
  name: string;
  type: 'policy' | 'phase' | 'capability' | 'agent';
  status: 'valid' | 'warning' | 'error' | 'inactive';
  children?: TreeNode[];
  metadata?: {
    description?: string;
    priority?: number;
    active?: boolean;
    affectedBy?: string[];
    fallbackAgent?: string;
    fallbackLevel?: 'global' | 'policy' | 'phase';
    fallback?: boolean;
  };
}

export class PolicyTreeVisualizer {
  private policyEngine = getPolicyEngine();
  private agentRegistry = getAgentRegistry();

  /**
   * Generate a hierarchical tree structure
   */
  generateTree(): TreeNode[] {
    const roots: TreeNode[] = [];

    // Get all policies
    const policyNames = this.policyEngine.getPolicyNames();

    for (const policyName of policyNames) {
      const policy = this.policyEngine.getPolicy(policyName);
      if (!policy) continue;

      const policyNode: TreeNode = {
        id: `policy-${policyName}`,
        name: policyName,
        type: 'policy',
        status: this.getPolicyStatus(policyName),
        children: []
      };

      // Add phases
      for (const phase of policy.phases) {
        const phaseNode: TreeNode = {
          id: `phase-${policyName}-${phase.name}`,
          name: phase.name,
          type: 'phase',
          status: this.getPhaseStatus(phase),
          children: []
        };

         // Add capabilities
        if (phase.capabilities && phase.capabilities.length > 0) {
          for (const capability of phase.capabilities) {
            const capabilityNode: TreeNode = {
              id: `capability-${capability}`,
              name: capability,
              type: 'capability',
              status: this.getCapabilityStatus(capability),
              children: []
            };

            // Add agents for this capability
            const agentsWithCapability = this.agentRegistry.getAgentsByCapability(capability);
            for (const agent of agentsWithCapability) {
              const agentNode: TreeNode = {
                id: `agent-${agent.id}`,
                name: agent.name,
                type: 'agent',
                status: agent.active !== false ? 'valid' : 'inactive',
                metadata: {
                  priority: agent.priority,
                  active: agent.active !== false,
                  description: agent.description
                }
              };
              capabilityNode.children!.push(agentNode);
            }

            // If no agents, check for fallback
            if (agentsWithCapability.length === 0) {
              const fallbackInfo = this.getFallbackAgentForCapability(capability, policyName, phase.name);
              if (fallbackInfo) {
                capabilityNode.metadata = {
                  fallbackAgent: fallbackInfo.agentName,
                  fallbackLevel: fallbackInfo.level
                };
                capabilityNode.status = 'valid';

                const fallbackAgentNode: TreeNode = {
                  id: `fallback-agent-${fallbackInfo.agentId}`,
                  name: fallbackInfo.agentName,
                  type: 'agent',
                  status: 'valid',
                  metadata: {
                    fallback: true,
                    fallbackLevel: fallbackInfo.level
                  }
                };
                capabilityNode.children!.push(fallbackAgentNode);
              } else {
                capabilityNode.children!.push({
                  id: `no-agents-${capability}`,
                  name: 'No agents available',
                  type: 'agent',
                  status: 'error'
                });
              }
            }

            phaseNode.children!.push(capabilityNode);
          }
        }

        policyNode.children!.push(phaseNode);
      }

      roots.push(policyNode);
    }

    return roots;
  }

  /**
   * Generate ASCII tree representation
   */
  generateAsciiTree(): string {
    const tree = this.generateTree();
    const lines: string[] = [];

    lines.push('Policy-Capability-Agent Tree');
    lines.push('===========================');
    lines.push('');

    const renderNode = (node: TreeNode, prefix: string = '', isLast: boolean = true): void => {
      // Choose icon based on type and status
      const icon = this.getNodeIcon(node);

      // Add node line
      const connector = isLast ? '└──' : '├──';
      const line = `${prefix}${connector} ${icon} ${node.name}`;
      lines.push(line);

      // Add metadata if present
      if (node.metadata) {
        const metaParts = [];
        if (node.metadata.priority !== undefined) {
          metaParts.push(`priority: ${node.metadata.priority}`);
        }
        if (node.metadata.active !== undefined) {
          metaParts.push(node.metadata.active ? 'active' : 'inactive');
        }
        if (node.metadata.description) {
          metaParts.push(node.metadata.description);
        }

        if (metaParts.length > 0) {
          const metaConnector = isLast ? '    ' : '│   ';
          lines.push(`${prefix}${metaConnector}(${metaParts.join(', ')})`);
        }
      }

      // Render children
      if (node.children && node.children.length > 0) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        node.children.forEach((child, index) => {
          const isLastChild = index === node.children!.length - 1;
          renderNode(child, newPrefix, isLastChild);
        });
      }
    };

    tree.forEach((root, index) => {
      const isLastRoot = index === tree.length - 1;
      renderNode(root, '', isLastRoot);
      lines.push(''); // Empty line between root nodes
    });

    return lines.join('\n');
  }

  /**
   * Generate JSON representation for programmatic use
   */
  generateJsonTree(): string {
    const tree = this.generateTree();
    return JSON.stringify(tree, null, 2);
  }

  /**
   * Get fallback agent for a capability
   */
  private getFallbackAgentForCapability(
    capability: string,
    policyName: string,
    phaseName: string
  ): { agentId: string; agentName: string; level: 'global' | 'policy' | 'phase' } | null {
    const fallbackUsages = policyCapabilityValidator.getFallbackCapabilities();

    for (const usage of fallbackUsages) {
      if (usage.capability === capability &&
          usage.policyName === policyName &&
          usage.phaseName === phaseName) {
        return {
          agentId: usage.fallbackAgent,
          agentName: usage.fallbackAgent,
          level: 'global'
        };
      }
    }

    return null;
  }

  /**
   * Generate summary statistics
   */
   generateSummary(): {
     totalPolicies: number;
     totalPhases: number;
     totalCapabilities: number;
     totalAgents: number;
     validPolicies: number;
     policiesWithWarnings: number;
     policiesWithErrors: number;
     deadEndCapabilities: string[];
     inactiveAgents: string[];
   } {
    const tree = this.generateTree();

    let totalPolicies = 0;
    let totalPhases = 0;
    let totalCapabilities = 0;
    let totalAgents = 0;
    let validPolicies = 0;
    let policiesWithWarnings = 0;
    let policiesWithErrors = 0;
    const deadEndCapabilities: string[] = [];
    const inactiveAgents: string[] = [];

    const traverse = (node: TreeNode): void => {
      switch (node.type) {
        case 'policy':
          totalPolicies++;
          if (node.status === 'valid') validPolicies++;
          else if (node.status === 'warning') policiesWithWarnings++;
          else if (node.status === 'error') policiesWithErrors++;
          break;
        case 'phase':
          totalPhases++;
          break;
        case 'capability':
          totalCapabilities++;
          if (node.status === 'error') {
            deadEndCapabilities.push(node.name);
          }
          break;
        case 'agent':
          totalAgents++;
          if (node.status === 'inactive') {
            inactiveAgents.push(node.name);
          }
          break;
      }

      if (node.children) {
        node.children.forEach(traverse);
      }
    };

    tree.forEach(traverse);

    return {
      totalPolicies,
      totalPhases,
      totalCapabilities,
      totalAgents,
      validPolicies,
      policiesWithWarnings,
      policiesWithErrors,
      deadEndCapabilities,
      inactiveAgents
    };
  }

  /**
   * Get status for a policy node
   */
  private getPolicyStatus(policyName: string): 'valid' | 'warning' | 'error' {
    const policy = this.policyEngine.getPolicy(policyName);
    if (!policy) return 'error';

    let hasWarnings = false;
    let hasErrors = false;

    for (const phase of policy.phases) {
      const phaseStatus = this.getPhaseStatus(phase);
      if (phaseStatus === 'error') hasErrors = true;
      else if (phaseStatus === 'warning') hasWarnings = true;
    }

    if (hasErrors) return 'error';
    if (hasWarnings) return 'warning';
    return 'valid';
  }

  /**
   * Get status for a phase node
   */
  private getPhaseStatus(phase: { name: string; capabilities?: string[] }): 'valid' | 'warning' | 'error' {
    if (!phase.capabilities || phase.capabilities.length === 0) return 'warning';

    let hasErrors = false;
    let hasWarnings = false;

    for (const capability of phase.capabilities) {
      const capStatus = this.getCapabilityStatus(capability);
      if (capStatus === 'error') hasErrors = true;
      else if (capStatus === 'warning') hasWarnings = true;
    }

    if (hasErrors) return 'error';
    if (hasWarnings) return 'warning';
    return 'valid';
  }

  /**
   * Get status for a capability node
   */
  private getCapabilityStatus(capability: string): 'valid' | 'warning' | 'error' {
    const agents = this.agentRegistry.getAgentsByCapability(capability);
    const activeAgents = agents.filter(a => a.active !== false);

    if (activeAgents.length === 0) return 'error';
    if (activeAgents.length === 1) return 'warning';
    return 'valid';
  }

  /**
   * Get icon for a node based on type and status
   */
  private getNodeIcon(node: TreeNode): string {
    const icons = {
      policy: { valid: '📋', warning: '⚠️📋', error: '❌📋', inactive: '📋' },
      phase: { valid: '🔄', warning: '⚠️🔄', error: '❌🔄', inactive: '🔄' },
      capability: { valid: '🎯', warning: '⚠️🎯', error: '❌🎯', inactive: '🎯' },
      agent: { valid: '🤖', warning: '⚠️🤖', error: '❌🤖', inactive: '⚪' }
    };

    return icons[node.type][node.status] || '❓';
  }
}

// Global visualizer instance
export const policyTreeVisualizer = new PolicyTreeVisualizer();