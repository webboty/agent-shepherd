import Ajv, { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

interface ValidationResult {
  valid: boolean;
  errors: ErrorObject[];
  summary: string;
}

export class ConfigurationValidator {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: true
    });
    addFormats(this.ajv);
  }

  /**
   * Validate configuration file against its schema
   */
  async validateConfig(
    configPath: string,
    schemaPath: string
  ): Promise<ValidationResult> {
    try {
      // Load configuration file
      const configContent = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      // Load schema
      const schemaContent = readFileSync(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);

      // Validate
      const validate = this.ajv.compile(schema);
      const valid = validate(config);

      return {
        valid: !!valid,
        errors: validate.errors || [],
        summary: this.formatValidationSummary(configPath, valid, validate.errors || [])
      };
    } catch (error) {
      return {
        valid: false,
        errors: [{
          keyword: 'file-error',
          instancePath: '',
          schemaPath: '',
          params: {},
          message: error instanceof Error ? error.message : String(error)
        }],
        summary: `Failed to validate ${configPath}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate all configuration files
   */
  async validateAllConfigs(configDir?: string): Promise<ValidationResult[]> {
    const { getConfigDir, findInstallDir, findWorkflowsDir, scanRecursive, findAgentShepherdDir } = await import('./path-utils');
    const baseDir = configDir || getConfigDir();
    const installDir = findInstallDir();
    const results: ValidationResult[] = [];

    // Define validation tasks
    const validationTasks = [
      {
        config: 'config.yaml',
        schema: 'schemas/config.schema.json',
        description: 'Main configuration'
      },
      {
        config: 'policies.yaml',
        schema: 'schemas/policies.schema.json',
        description: 'Policy definitions'
      },
      {
        config: 'agents.yaml',
        schema: 'schemas/agents.schema.json',
        description: 'Agent registry'
      }
    ];

    for (const task of validationTasks) {
      const configPath = join(baseDir, task.config);
      // Try to find schema in multiple locations (local first, then installation dir)
      const localAgentShepherdDir = findAgentShepherdDir();
      let schemaPath = join(localAgentShepherdDir, task.schema);
      if (!existsSync(schemaPath)) {
        schemaPath = join(installDir, task.schema);
      }

      if (!existsSync(configPath)) {
        results.push({
          valid: false,
          errors: [{
            keyword: 'missing-file',
            instancePath: '',
            schemaPath: '',
            params: { file: task.config },
            message: `Configuration file ${task.config} not found`
          }],
          summary: `❌ ${task.description}: File not found`
        });
        continue;
      }

      if (!existsSync(schemaPath)) {
        results.push({
          valid: false,
          errors: [{
            keyword: 'missing-schema',
            instancePath: '',
            schemaPath: '',
            params: { file: task.schema },
            message: `Schema file ${task.schema} not found`
          }],
          summary: `❌ ${task.description}: Schema not found`
        });
        continue;
      }

      const result = await this.validateYAMLConfig(configPath, schemaPath);
      result.summary = `${result.valid ? '✅' : '❌'} ${task.description}: ${result.summary}`;
      results.push(result);
    }

    // Validate workflow files
    const workflowsDir = findWorkflowsDir();
    const enabledDir = join(workflowsDir, 'enabled');
    
    if (existsSync(enabledDir)) {
      const workflowFiles = scanRecursive(enabledDir, ['.yaml', '.yml']);
      
      // Find policies schema
      const localAgentShepherdDir = findAgentShepherdDir();
      let policiesSchemaPath = join(localAgentShepherdDir, 'schemas/policies.schema.json');
      if (!existsSync(policiesSchemaPath)) {
        policiesSchemaPath = join(installDir, 'schemas/policies.schema.json');
      }

      if (existsSync(policiesSchemaPath)) {
        for (const file of workflowFiles) {
          const result = await this.validateWorkflowFile(file, policiesSchemaPath);
          result.summary = `${result.valid ? '✅' : '❌'} Workflow ${file}: ${result.summary}`;
          results.push(result);
        }
      }
    }

    // Add policy chain validation
    const chainResult = await this.validatePolicyChain();
    results.push(chainResult);

    return results;
  }

  /**
   * Validate configuration at startup
   */
  async validateAtStartup(configDir?: string, soft: boolean = false): Promise<void> {
    console.log('🔍 Validating configuration files...');

    const results = await this.validateAllConfigs(configDir);
    let hasErrors = false;

    for (const result of results) {
      console.log(result.summary);

      if (!result.valid) {
        hasErrors = true;

        // Print detailed errors
        for (const error of result.errors) {
          const path = error.instancePath || error.schemaPath;
          console.log(`   • ${path}: ${error.message}`);
        }
      }
    }

    if (hasErrors) {
      if (!soft) {
        console.log('\n❌ Configuration validation failed');
        console.log('Please fix errors above before proceeding');
        process.exit(1);
      } else {
        console.log('⚠️  Configuration validation found errors (continuing in soft mode)');
      }
    } else {
      console.log('✅ All configuration files are valid');
    }
  }

  /**
   * Validate configuration object against schema
   */
  async validateConfigObject(
    config: any,
    schemaPath: string,
    contextPath: string
  ): Promise<ValidationResult> {
    try {
      // Load schema
      const schemaContent = readFileSync(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);

      // Validate
      const validate = this.ajv.compile(schema);
      const valid = validate(config);

      return {
        valid: !!valid,
        errors: validate.errors || [],
        summary: this.formatValidationSummary(contextPath, !!valid, validate.errors || [])
      };
    } catch (error) {
       return {
        valid: false,
        errors: [{
          keyword: 'validation-error',
          instancePath: '',
          schemaPath: '',
          params: {},
          message: error instanceof Error ? error.message : String(error)
        }],
        summary: `Failed to validate ${contextPath}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate YAML configuration (convert to JSON for validation)
   */
  async validateYAMLConfig(
    yamlPath: string,
    schemaPath: string
  ): Promise<ValidationResult> {
    try {
      // Load and parse YAML
      const yamlContent = readFileSync(yamlPath, 'utf-8');
      const { parse } = await import('yaml');
      const config = parse(yamlContent);

      return this.validateConfigObject(config, schemaPath, yamlPath);
    } catch (error) {
      return {
        valid: false,
        errors: [{
          keyword: 'yaml-error',
          instancePath: '',
          schemaPath: '',
          params: {},
          message: error instanceof Error ? error.message : String(error)
        }],
        summary: `Failed to validate ${yamlPath}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate individual workflow file
   */
  async validateWorkflowFile(
    yamlPath: string,
    schemaPath: string
  ): Promise<ValidationResult> {
    try {
      // Load and parse YAML
      const yamlContent = readFileSync(yamlPath, 'utf-8');
      const { parse } = await import('yaml');
      const config = parse(yamlContent);

      if (!config || typeof config !== 'object') {
        return {
          valid: false,
          errors: [{
            keyword: 'type',
            instancePath: '',
            schemaPath: '',
            params: {},
            message: 'File content must be an object'
          }],
          summary: 'File content must be an object'
        };
      }

      if (!config.name) {
        return {
          valid: false,
          errors: [{
            keyword: 'required',
            instancePath: '',
            schemaPath: '',
            params: { missingProperty: 'name' },
            message: "Missing required property 'name'"
          }],
          summary: "Missing required property 'name'"
        };
      }

      // Wrap in policies object to match main schema
      const wrappedConfig = {
        policies: {
          [config.name]: config
        }
      };

      return this.validateConfigObject(wrappedConfig, schemaPath, yamlPath);
    } catch (error) {
      return {
        valid: false,
        errors: [{
          keyword: 'yaml-error',
          instancePath: '',
          schemaPath: '',
          params: {},
          message: error instanceof Error ? error.message : String(error)
        }],
        summary: `Failed to validate ${yamlPath}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate policy-capability-agent chain
   */
  async validatePolicyChain(): Promise<ValidationResult> {
    try {
      const { policyCapabilityValidator } = await import('./policy-capability-validator');
      const result = await policyCapabilityValidator.validateChain();

      return {
        valid: result.valid,
        errors: result.errors.map(error => ({
          keyword: 'policy-chain',
          instancePath: error.location || '',
          schemaPath: '',
          params: {},
          message: error.message
        })),
        summary: `${result.valid ? '✅' : '❌'} Policy chain validation: ${result.summary}`
      };
    } catch (error) {
      return {
        valid: false,
        errors: [{
          keyword: 'policy-chain-error',
          instancePath: '',
          schemaPath: '',
          params: {},
          message: `Failed to validate policy chain: ${error instanceof Error ? error.message : String(error)}`
        }],
        summary: '❌ Policy chain validation: Failed to execute'
      };
    }
  }

  /**
   * Format validation summary for display
   */
  private formatValidationSummary(
    _filePath: string,
    valid: boolean,
    errors: ErrorObject[]
  ): string {
    if (valid) {
      return 'Valid';
    }

    const errorCount = errors.length;
    const summary = errors[0]?.message || 'Unknown error';

    if (errorCount === 1) {
      return `Invalid: ${summary}`;
    } else {
      return `Invalid: ${summary} (+${errorCount - 1} more errors)`;
    }
  }
}

// Global validator instance
export const configValidator = new ConfigurationValidator();

/**
 * Quick validation utility for startup
 */
export async function validateStartup(configDir?: string, soft: boolean = false): Promise<void> {
  return configValidator.validateAtStartup(configDir, soft);
}