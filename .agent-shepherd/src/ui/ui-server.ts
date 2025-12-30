import express from 'express';
import { join } from 'path';
import { readFileSync } from 'fs';
import { Server } from 'http';
import { getPolicyEngine } from '../core/policy';

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

  private setupRoutes(): void {
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
        const filePath = join(__dirname, '..', '..', 'dashboard.html');
        console.log('Serving dashboard from:', filePath);
        const content = readFileSync(filePath, 'utf8');
        res.setHeader('Content-Type', 'text/html');
        res.send(content);
      } catch (error) {
        console.error('Error reading dashboard file:', error);
        res.status(404).send('Dashboard file not found');
      }
    });

    // 404 handler
    this.app.use((_req, res) => {
      res.status(404).json({ error: 'Not found' });
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