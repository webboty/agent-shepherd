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
    const { getConfigDir, findAgentShepherdDir } = await import('./path-utils');
    const baseDir = configDir || getConfigDir();
    const agentShepherdDir = findAgentShepherdDir();
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
      const schemaPath = join(agentShepherdDir, task.schema);

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

    return results;
  }

  /**
   * Validate configuration at startup
   */
  async validateAtStartup(configDir?: string): Promise<void> {
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
      console.log('\n❌ Configuration validation failed');
      console.log('Please fix the errors above before proceeding');
      process.exit(1);
    } else {
      console.log('✅ All configuration files are valid');
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

      // Load schema
      const schemaContent = readFileSync(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);

      // Validate
      const validate = this.ajv.compile(schema);
      const valid = validate(config);

      return {
        valid: !!valid,
        errors: validate.errors || [],
        summary: this.formatValidationSummary(yamlPath, valid, validate.errors || [])
      };
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
export async function validateStartup(configDir?: string): Promise<void> {
  return configValidator.validateAtStartup(configDir);
}