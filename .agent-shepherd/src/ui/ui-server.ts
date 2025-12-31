import express from 'express';
import { join, dirname, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { Server } from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { getPolicyEngine } from '../core/policy';

// Get directory where this module is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try multiple possible project root locations
const possibleRoots = [
  resolve(__dirname, '..', '..'),           // From .agent-shepherd/src/ui/ to .agent-shepherd/
  resolve(process.cwd(), '.agent-shepherd'),  // From project/ to .agent-shepherd/
  process.cwd(),                           // Fallback to current directory
];

const PROJECT_ROOT = possibleRoots.find(root => existsSync(join(root, 'src', 'ui', 'index.html'))) || possibleRoots[0];

// UI directory is src/ui relative to project root
const UI_DIR = join(PROJECT_ROOT, 'src', 'ui');

interface UIServerConfig {
  port: number;
  host: string;
}

export class UIServer {
  private app: express.Application;
  private server: Server | null = null;
  private config: UIServerConfig;

  constructor(config: UIServerConfig) {
    this.config = config;
    this.app = express();
    this.setupRoutes();
  }

  private async ensureUIBuilt(): Promise<void> {
    const distDir = join(PROJECT_ROOT, 'dist');

    if (!existsSync(join(distDir, 'AgentShepherdFlow.js'))) {
      console.log('Building UI...');
      return new Promise((resolve, reject) => {
        const build = spawn('bun', ['run', 'build:ui'], {
          cwd: PROJECT_ROOT,
          stdio: 'inherit'
        });

        build.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`UI build failed with code ${code}`));
          }
        });

        build.on('error', (err) => {
          reject(err);
        });
      });
    }
  }

  private setupRoutes(): void {
    // Log all incoming requests for debugging
    this.app.use((req, _res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
      next();
    });

    // Only try to build if we're in development (running from source)
    const isDev = existsSync(join(PROJECT_ROOT, 'package.json'));
    if (isDev) {
      this.ensureUIBuilt().catch((err) => {
        console.error('Failed to build UI:', err);
      });
    }

    // Serve static files from the UI directory
    this.app.use(express.static(PROJECT_ROOT));

    // API routes
    this.app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.get('/api/runs', async (_req, res) => {
      try {
        // TODO: Fetch from actual data source (beads database)
        // For now, return empty array
        const runs: any[] = [];
        res.json(runs);
        return;
      } catch (error) {
        console.error('Error fetching runs:', error);
        res.status(500).json({ error: 'Failed to fetch runs' });
        return;
      }
    });

    this.app.get('/api/policies', async (_req, res) => {
      try {
        const policyEngine = getPolicyEngine();
        const policyNames = policyEngine.getPolicyNames();
        const policies = policyNames.map(name => {
          const policy = policyEngine.getPolicy(name);
          return {
            id: name,
            name: policy?.name || name,
            description: policy?.description || '',
            isDefault: name === policyEngine.getDefaultPolicyName()
          };
        });
        res.json(policies);
        return;
      } catch (error) {
        console.error('Error fetching policies:', error);
        res.status(500).json({ error: 'Failed to fetch policies' });
        return;
      }
    });

    this.app.get('/api/phases', async (req, res) => {
      try {
        const policyEngine = getPolicyEngine();
        const policyName = req.query.policy as string || policyEngine.getDefaultPolicyName();
        const policy = policyEngine.getPolicy(policyName);

        if (!policy) {
          return res.status(404).json({ error: 'Policy not found' });
        }

        const phases = policy.phases.map(phase => ({
          id: phase.name,
          name: phase.name,
          description: phase.description || '',
          capabilities: phase.capabilities || [],
          timeout_multiplier: phase.timeout_multiplier || 1.0,
          status: 'idle' // TODO: Get real status from runs
        }));
        res.json(phases);
        return;
      } catch (error) {
        console.error('Error fetching phases:', error);
        res.status(500).json({ error: 'Failed to fetch phases' });
        return;
      }
    });

    // Serve React app
    this.app.get('/', (_req, res) => {
      try {
        const filePath = join(UI_DIR, 'index.html');
        console.log('Serving dashboard from:', filePath);
        if (!existsSync(filePath)) {
          console.error('index.html not found at:', filePath);
          res.status(404).send('index.html not found');
          return;
        }
        const content = readFileSync(filePath, 'utf8');
        res.setHeader('Content-Type', 'text/html');
        res.send(content);
      } catch (error) {
        console.error('Error serving index.html:', error);
        res.status(500).send('Error serving dashboard');
      }
    });

    // 404 handler
    this.app.use((_req, res) => {
      console.log('404 Not Found:', _req.url);
      res.status(404).json({ error: 'Not found', path: _req.url });
    });

    // Error handler (must be last)
    this.app.use((err: Error, _req: any, res: any) => {
      console.error('Server error:', err);
      res.status(500).json({ error: 'Internal Server Error', message: err.message });
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, this.config.host, () => {
        console.log(`🚀 Agent Shepherd UI started:`);
        console.log(`   URL: http://${this.config.host}:${this.config.port}`);
        console.log(`   API: http://${this.config.host}:${this.config.port}/api`);
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('UI server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
