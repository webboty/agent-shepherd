import express from 'express';
import { join } from 'path';
import { Server } from 'http';

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
    // Serve static files
    this.app.use(express.static(join(__dirname, '../ui/public')));

    // API routes
    this.app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.get('/api/runs', async (_req, res) => {
      try {
        // Placeholder - fetch from actual data source
        const runs = [
          {
            id: 'run-1',
            issueId: 'agent-shepherd-001',
            agentId: 'bmad-master',
            phase: 'implementation',
            status: 'completed',
            startTime: '2025-12-20T10:00:00Z',
            endTime: '2025-12-20T10:45:00Z',
            sessionId: 'session-abc123',
            outcome: 'Successfully implemented core modules'
          }
        ];
        res.json(runs);
      } catch (error) {
        console.error('Error fetching runs:', error);
        res.status(500).json({ error: 'Failed to fetch runs' });
      }
    });

    this.app.get('/api/phases', async (_req, res) => {
      try {
        // Placeholder - fetch from policy engine
        const phases = [
          { id: 'planning', name: 'Planning Phase', status: 'idle' },
          { id: 'implementation', name: 'Implementation Phase', status: 'active' },
          { id: 'review', name: 'Review Phase', status: 'active' },
          { id: 'testing', name: 'Testing Phase', status: 'idle' }
        ];
        res.json(phases);
      } catch (error) {
        console.error('Error fetching phases:', error);
        res.status(500).json({ error: 'Failed to fetch phases' });
      }
    });

    // Serve React app
    this.app.get('/', (_req, res) => {
      res.send(this.generateHTML());
    });

    // 404 handler
    this.app.use((_req, res) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  private generateHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agent Shepherd - Flow Visualization</title>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://unpkg.com/reactflow@11.11.4/dist/umd/index.js"></script>
    <link rel="stylesheet" href="https://unpkg.com/reactflow@11.11.4/dist/style.css">
    <style>
        body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
                'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
                sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        .react-flow {
            background: #f8fafc;
        }
    </style>
</head>
<body>
    <div id="root"></div>

    <script type="text/babel">
        const { useState, useEffect } = React;
        const { createElement: el } = React;

        // Simplified Flow component using ReactFlow
        function AgentShepherdFlow() {
            const [nodes, setNodes] = useState([]);
            const [edges, setEdges] = useState([]);
            const [loading, setLoading] = useState(true);

            useEffect(() => {
                // Load initial data
                const loadFlowData = async () => {
                    try {
                        const [runsResponse, phasesResponse] = await Promise.all([
                            fetch('/api/runs'),
                            fetch('/api/phases')
                        ]);

                        const runs = await runsResponse.json();
                        const phases = await phasesResponse.json();

                        // Create phase nodes
                        const phaseNodes = phases.map((phase, index) => ({
                            id: \`phase-\${phase.id}\`,
                            type: 'default',
                            position: { x: 100 + (index * 200), y: 100 },
                            data: {
                                label: phase.name,
                                phase: phase.id,
                                status: phase.status,
                                runCount: runs.filter(r => r.phase === phase.id).length
                            },
                            style: {
                                backgroundColor: phase.status === 'active' ? '#3b82f6' : '#6b7280',
                                color: 'white',
                                border: 'none'
                            }
                        }));

                        // Create run nodes
                        const runNodes = runs.map((run, index) => ({
                            id: run.id,
                            type: 'default',
                            position: { x: 150 + (index * 200), y: 250 },
                            data: {
                                label: \`\${run.agentId} - \${run.phase}\`,
                                run: run
                            },
                            style: {
                                backgroundColor: run.status === 'completed' ? '#10b981' : 
                                                 run.status === 'running' ? '#3b82f6' : 
                                                 run.status === 'failed' ? '#ef4444' : '#6b7280',
                                color: 'white',
                                border: 'none'
                            }
                        }));

                        // Create edges
                        const flowEdges = [
                            { id: 'e1', source: 'phase-planning', target: 'phase-implementation' },
                            { id: 'e2', source: 'phase-implementation', target: 'phase-review' },
                            { id: 'e3', source: 'phase-review', target: 'phase-testing' },
                            ...runs.map(run => ({
                                id: \`\${run.id}-edge\`,
                                source: \`phase-\${run.phase}\`,
                                target: run.id
                            }))
                        ];

                        setNodes([...phaseNodes, ...runNodes]);
                        setEdges(flowEdges);
                    } catch (error) {
                        console.error('Error loading flow data:', error);
                    } finally {
                        setLoading(false);
                    }
                };

                loadFlowData();
                
                // Set up polling for updates
                const interval = setInterval(loadFlowData, 5000);
                return () => clearInterval(interval);
            }, []);

            if (loading) {
                return el('div', { 
                    style: { 
                        display: 'flex', 
                        justifyContent: 'center', 
                        alignItems: 'center', 
                        height: '100vh' 
                    } 
                }, 'Loading Agent Shepherd Flow...');
            }

            const reactFlowProps = {
                nodes: nodes,
                edges: edges,
                fitView: true,
                style: { width: '100vw', height: '100vh' }
            };

            return el('div', { style: { width: '100vw', height: '100vh' } }, [
                el('div', { 
                    key: 'controls',
                    style: { 
                        position: 'absolute', 
                        top: 10, 
                        left: 10, 
                        zIndex: 1000, 
                        background: 'white', 
                        padding: '10px', 
                        borderRadius: '8px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    } 
                }, [
                    el('h3', { key: 'title' }, 'Agent Shepherd Flow'),
                    el('div', { key: 'auto-refresh' }, [
                        el('label', { key: 'label' }, [
                            el('input', { 
                                key: 'checkbox',
                                type: 'checkbox',
                                defaultChecked: true,
                                readOnly: true
                            }),
                            ' Auto Refresh (5s)'
                        ])
                    ])
                ]),
                el(ReactFlow.default, { key: 'flow', ...reactFlowProps }, [
                    el(ReactFlow.Background, { key: 'bg' }),
                    el(ReactFlow.Controls, { key: 'controls' }),
                    el(ReactFlow.MiniMap, { key: 'minimap' })
                ])
            ]);
        }

        // Render the app
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(el(AgentShepherdFlow));
    </script>
</body>
</html>
    `;
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