import React, { useState, useEffect } from 'react';
import ReactFlow, { 
  Node, 
  Edge, 
  Background, 
  Controls, 
  MiniMap,
  ReactFlowProvider 
} from 'reactflow';
import 'reactflow/dist/style.css';

interface Run {
  id: string;
  issueId: string;
  agentId: string;
  phase: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  sessionId?: string;
  outcome?: string;
}

interface PhaseNode extends Node {
  data: {
    label: string;
    phase: string;
    status: string;
    runCount: number;
  };
}

interface RunNode extends Node {
  data: {
    label: string;
    run: Run;
  };
}

const AgentShepherdFlow: React.FC = () => {
  const [nodes, setNodes] = useState<(PhaseNode | RunNode)[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Generate mock data for MVP
  const generateMockData = (): void => {
    const mockRuns: Run[] = [
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
      },
      {
        id: 'run-2',
        issueId: 'agent-shepherd-002',
        agentId: 'code-reviewer',
        phase: 'review',
        status: 'running',
        startTime: '2025-12-20T11:00:00Z',
        sessionId: 'session-def456'
      },
      {
        id: 'run-3',
        issueId: 'agent-shepherd-003',
        agentId: 'test-runner',
        phase: 'testing',
        status: 'pending',
        startTime: ''
      }
    ];

    const phaseNodes: PhaseNode[] = [
      {
        id: 'phase-planning',
        type: 'default',
        position: { x: 100, y: 100 },
        data: { 
          label: 'Planning Phase', 
          phase: 'planning', 
          status: 'idle',
          runCount: 0 
        }
      },
      {
        id: 'phase-implementation',
        type: 'default',
        position: { x: 300, y: 100 },
        data: { 
          label: 'Implementation Phase', 
          phase: 'implementation', 
          status: 'active',
          runCount: 1 
        }
      },
      {
        id: 'phase-review',
        type: 'default',
        position: { x: 500, y: 100 },
        data: { 
          label: 'Review Phase', 
          phase: 'review', 
          status: 'active',
          runCount: 1 
        }
      },
      {
        id: 'phase-testing',
        type: 'default',
        position: { x: 700, y: 100 },
        data: { 
          label: 'Testing Phase', 
          phase: 'testing', 
          status: 'idle',
          runCount: 1 
        }
      }
    ];

    const runNodes: RunNode[] = mockRuns.map((run, index) => ({
      id: run.id,
      type: 'default',
      position: { x: 200 + (index * 150), y: 250 },
      data: { 
        label: `${run.agentId} - ${run.phase}`,
        run
      }
    }));

    const flowEdges: Edge[] = [
      { id: 'e1', source: 'phase-planning', target: 'phase-implementation' },
      { id: 'e2', source: 'phase-implementation', target: 'phase-review' },
      { id: 'e3', source: 'phase-review', target: 'phase-testing' },
      { id: 'run-1-edge', source: 'phase-implementation', target: 'run-1' },
      { id: 'run-2-edge', source: 'phase-review', target: 'run-2' },
      { id: 'run-3-edge', source: 'phase-testing', target: 'run-3' }
    ];

    setNodes([...phaseNodes, ...runNodes]);
    setEdges(flowEdges);
  };

  // Poll for updates (placeholder)
  const pollForUpdates = async (): Promise<void> => {
    // In real implementation, this would fetch from the backend
    console.log('Polling for updates...');
  };

  useEffect(() => {
    generateMockData();
    
    if (autoRefresh) {
      const interval = setInterval(pollForUpdates, 5000);
      return () => clearInterval(interval);
    }
    return;
  }, [autoRefresh]);

  const onNodeClick = (_event: React.MouseEvent, node: Node) => {
    if ('run' in node.data) {
      setSelectedRun(node.data.run);
      if (node.data.run.sessionId) {
        // Open OpenCode session (placeholder)
        console.log(`Opening session: ${node.data.run.sessionId}`);
      }
    }
  };

  const getNodeColor = (node: Node): string => {
    if ('run' in node.data) {
      const run = node.data.run;
      switch (run.status) {
        case 'completed': return '#10b981';
        case 'running': return '#3b82f6';
        case 'failed': return '#ef4444';
        case 'pending': return '#6b7280';
        default: return '#94a3b8';
      }
    } else {
      const status = node.data.status;
      switch (status) {
        case 'active': return '#3b82f6';
        case 'idle': return '#6b7280';
        default: return '#94a3b8';
      }
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <div style={{ 
        position: 'absolute', 
        top: 10, 
        left: 10, 
        zIndex: 1000, 
        background: 'white', 
        padding: '10px', 
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h3>Agent Shepherd Flow</h3>
        <label>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto Refresh
        </label>
      </div>

      {selectedRun && (
        <div style={{ 
          position: 'absolute', 
          top: 10, 
          right: 10, 
          zIndex: 1000, 
          background: 'white', 
          padding: '15px', 
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          minWidth: '250px'
        }}>
          <h4>Run Details</h4>
          <p><strong>ID:</strong> {selectedRun.id}</p>
          <p><strong>Agent:</strong> {selectedRun.agentId}</p>
          <p><strong>Phase:</strong> {selectedRun.phase}</p>
          <p><strong>Status:</strong> {selectedRun.status}</p>
          <p><strong>Issue:</strong> {selectedRun.issueId}</p>
          {selectedRun.sessionId && (
            <p><strong>Session:</strong> {selectedRun.sessionId}</p>
          )}
          {selectedRun.outcome && (
            <p><strong>Outcome:</strong> {selectedRun.outcome}</p>
          )}
          <button 
            onClick={() => setSelectedRun(null)}
            style={{ marginTop: '10px' }}
          >
            Close
          </button>
        </div>
      )}

      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes.map(node => ({
            ...node,
            style: {
              ...node.style,
              backgroundColor: getNodeColor(node),
              color: 'white',
              border: 'none'
            }
          }))}
          edges={edges}
          onNodeClick={onNodeClick}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
};

export default AgentShepherdFlow;