/**
 * Policy-Capability-Agent Chain Validator
 * Validates that policies have valid capabilities and capabilities have active agents
 */

import { getPolicyEngine } from "./policy";
import { getAgentRegistry } from "./agent-registry";

export interface ValidationError {
  type: 'policy' | 'capability' | 'agent' | 'chain';
  severity: 'error' | 'warning';
  message: string;
  location?: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  summary: string;
}

export interface PolicyCapabilityMapping {
  policyName: string;
  phaseName: string;
  capabilities: string[];
  availableAgents: Array<{
    agentId: string;
    name: string;
    capabilities: string[];
    active: boolean;
    priority: number;
  }>;
}

export interface DeadEndInfo {
  type: 'capability' | 'policy';
  name: string;
  description: string;
  affectedPolicies?: string[];
  affectedPhases?: Array<{policy: string, phase: string}>;
}

export class PolicyCapabilityValidator {
  private policyEngine = getPolicyEngine();
  private agentRegistry = getAgentRegistry();

  /**
   * Validate the complete policy -> capability -> agent chain
   */
  async validateChain(): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    // Get all policies
    const policyNames = this.policyEngine.getPolicyNames();

    for (const policyName of policyNames) {
      const policy = this.policyEngine.getPolicy(policyName);
      if (!policy) {
        errors.push({
          type: 'policy',
          severity: 'error',
          message: `Policy '${policyName}' not found`,
          location: `policies.yaml: ${policyName}`
        });
        continue;
      }

      // Validate each phase's capabilities
      for (const phase of policy.phases) {
        const phaseErrors = this.validatePhaseCapabilities(policyName, phase);
        errors.push(...phaseErrors);
      }
    }

    const valid = errors.filter(e => e.severity === 'error').length === 0;
    const summary = this.generateValidationSummary(errors);

    return {
      valid,
      errors,
      summary
    };
  }

  /**
   * Validate capabilities for a specific policy phase
   */
  private validatePhaseCapabilities(
    policyName: string,
    phase: { name: string; capabilities?: string[] }
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!phase.capabilities || phase.capabilities.length === 0) {
      errors.push({
        type: 'policy',
        severity: 'warning',
        message: `Phase '${phase.name}' in policy '${policyName}' has no capabilities defined`,
        location: `policies.yaml: ${policyName}.${phase.name}`,
        suggestion: 'Add capabilities array or specify specific agent'
      });
      return errors;
    }

    // Check each capability
    for (const capability of phase.capabilities) {
      const capabilityErrors = this.validateCapability(capability, policyName, phase.name);
      errors.push(...capabilityErrors);
    }

    return errors;
  }

  /**
   * Validate that a capability exists and has active agents
   */
  private validateCapability(
    capability: string,
    policyName: string,
    phaseName: string
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check if any agents have this capability
    const agentsWithCapability = this.agentRegistry.getAgentsByCapability(capability);
    const activeAgentsWithCapability = agentsWithCapability.filter(agent => agent.active !== false);

    if (agentsWithCapability.length === 0) {
      errors.push({
        type: 'capability',
        severity: 'error',
        message: `Capability '${capability}' is not provided by any agent`,
        location: `policies.yaml: ${policyName}.${phaseName}`,
        suggestion: 'Add this capability to an agent or remove from policy'
      });
    } else if (activeAgentsWithCapability.length === 0) {
      errors.push({
        type: 'capability',
        severity: 'error',
        message: `Capability '${capability}' is only provided by inactive agents`,
        location: `policies.yaml: ${policyName}.${phaseName}`,
        suggestion: 'Activate agents with this capability or add active agents'
      });
    } else if (activeAgentsWithCapability.length === 1) {
      errors.push({
        type: 'capability',
        severity: 'warning',
        message: `Capability '${capability}' has only one active agent (${activeAgentsWithCapability[0].name})`,
        location: `policies.yaml: ${policyName}.${phaseName}`,
        suggestion: 'Consider adding backup agents for redundancy'
      });
    }

    return errors;
  }

  /**
   * Get detailed mapping of policies to capabilities to agents
   */
  getPolicyCapabilityMappings(): PolicyCapabilityMapping[] {
    const mappings: PolicyCapabilityMapping[] = [];
    const policyNames = this.policyEngine.getPolicyNames();

    for (const policyName of policyNames) {
      const policy = this.policyEngine.getPolicy(policyName);
      if (!policy) continue;

      for (const phase of policy.phases) {
        if (!phase.capabilities || phase.capabilities.length === 0) continue;

        const availableAgents = phase.capabilities.flatMap(capability =>
          this.agentRegistry.getAgentsByCapability(capability).map(agent => ({
            agentId: agent.id,
            name: agent.name,
            capabilities: agent.capabilities,
            active: agent.active !== false,
            priority: agent.priority || 0
          }))
        );

        mappings.push({
          policyName,
          phaseName: phase.name,
          capabilities: phase.capabilities,
          availableAgents: [...new Map(availableAgents.map(a => [a.agentId, a])).values()] // Deduplicate
        });
      }
    }

    return mappings;
  }

  /**
   * Find dead ends in the policy-capability-agent chain
   */
  findDeadEnds(): DeadEndInfo[] {
    const deadEnds: DeadEndInfo[] = [];
    const mappings = this.getPolicyCapabilityMappings();

    // Find capabilities with no active agents
    const allCapabilities = new Set<string>();
    mappings.forEach(mapping => {
      mapping.capabilities.forEach(cap => allCapabilities.add(cap));
    });

    for (const capability of allCapabilities) {
      const agentsWithCapability = this.agentRegistry.getAgentsByCapability(capability);
      const activeAgents = agentsWithCapability.filter(agent => agent.active !== false);

      if (activeAgents.length === 0) {
        const affectedPhases = mappings
          .filter(m => m.capabilities.includes(capability))
          .map(m => ({ policy: m.policyName, phase: m.phaseName }));

        deadEnds.push({
          type: 'capability',
          name: capability,
          description: agentsWithCapability.length > 0
            ? `${agentsWithCapability.length} inactive agent(s) provide this capability`
            : 'No agents provide this capability',
          affectedPhases
        });
      }
    }

    // Find policies with no valid paths
    const policyNames = this.policyEngine.getPolicyNames();
    for (const policyName of policyNames) {
      const policy = this.policyEngine.getPolicy(policyName);
      if (!policy) continue;

      const hasValidPath = policy.phases.every(phase => {
        if (!phase.capabilities || phase.capabilities.length === 0) return false;

        return phase.capabilities.every(capability => {
          const activeAgents = this.agentRegistry.getAgentsByCapability(capability)
            .filter(agent => agent.active !== false);
          return activeAgents.length > 0;
        });
      });

      if (!hasValidPath) {
        deadEnds.push({
          type: 'policy',
          name: policyName,
          description: 'Policy has phases with capabilities that have no active agents',
          affectedPolicies: [policyName]
        });
      }
    }

    return deadEnds;
  }

  /**
   * Generate a visual tree representation of the policy-capability-agent chain
   */
  generateTreeVisualization(): string {
    const mappings = this.getPolicyCapabilityMappings();
    const lines: string[] = [];

    lines.push('Policy-Capability-Agent Chain Tree');
    lines.push('===================================');
    lines.push('');

    // Group by policy
    const policies = new Map<string, PolicyCapabilityMapping[]>();
    mappings.forEach(mapping => {
      if (!policies.has(mapping.policyName)) {
        policies.set(mapping.policyName, []);
      }
      policies.get(mapping.policyName)!.push(mapping);
    });

    for (const [policyName, policyMappings] of policies) {
      lines.push(`📋 ${policyName}`);

      for (const mapping of policyMappings) {
        lines.push(`  ├── 🔄 ${mapping.phaseName}`);

        for (const capability of mapping.capabilities) {
          const activeAgents = mapping.availableAgents.filter(a => a.active);
          const inactiveAgents = mapping.availableAgents.filter(a => !a.active);

          const status = activeAgents.length > 0 ? '✅' : '❌';
          lines.push(`  │   ├── ${status} ${capability}`);

          if (activeAgents.length > 0) {
            activeAgents.forEach(agent => {
              lines.push(`  │   │   ├── 🤖 ${agent.name} (active, priority: ${agent.priority})`);
            });
          }

          if (inactiveAgents.length > 0) {
            inactiveAgents.forEach(agent => {
              lines.push(`  │   │   ├── ⚪ ${agent.name} (inactive, priority: ${agent.priority})`);
            });
          }

          if (activeAgents.length === 0 && inactiveAgents.length === 0) {
            lines.push(`  │   │   └── 🚫 No agents available`);
          }
        }
      }
      lines.push('');
    }

    // Add dead ends section
    const deadEnds = this.findDeadEnds();
    if (deadEnds.length > 0) {
      lines.push('🚫 Dead Ends (Issues requiring attention)');
      lines.push('========================================');
      lines.push('');

      for (const deadEnd of deadEnds) {
        const icon = deadEnd.type === 'capability' ? '🎯' : '📋';
        lines.push(`${icon} ${deadEnd.name} (${deadEnd.type})`);
        lines.push(`  ${deadEnd.description}`);

        if (deadEnd.affectedPhases) {
          deadEnd.affectedPhases.forEach(phase => {
            lines.push(`  ├── Affected: ${phase.policy}.${phase.phase}`);
          });
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate validation summary
   */
  private generateValidationSummary(errors: ValidationError[]): string {
    const errorCount = errors.filter(e => e.severity === 'error').length;
    const warningCount = errors.filter(e => e.severity === 'warning').length;

    if (errorCount === 0 && warningCount === 0) {
      return '✅ All policy-capability-agent chains are valid';
    }

    const parts = [];
    if (errorCount > 0) {
      parts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`);
    }
    if (warningCount > 0) {
      parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
    }

    return `❌ Validation failed: ${parts.join(', ')} found`;
  }
}

// Global validator instance
export const policyCapabilityValidator = new PolicyCapabilityValidator();