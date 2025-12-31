import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
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

interface Policy {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
}

const AgentShepherdFlow: React.FC = () => {
  const [nodes, setNodes] = useState<(PhaseNode | RunNode)[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<string>('');

  // Load data from API
  const loadFlowData = async (policyId?: string): Promise<void> => {
    try {
      const [runsResponse, phasesResponse] = await Promise.all([
        fetch('/api/runs'),
        fetch(`/api/phases${policyId ? `?policy=${policyId}` : ''}`)
      ]);

      const runs = await runsResponse.json();
      const phases = await phasesResponse.json();

      // Create phase nodes
      const phaseNodes: PhaseNode[] = phases.map((phase: any, index: number) => ({
        id: `phase-${phase.id}`,
        type: 'default',
        position: { x: 100 + (index * 200), y: 100 },
        data: {
          label: phase.name,
          phase: phase.id,
          status: phase.status,
          runCount: runs.filter((r: Run) => r.phase === phase.id).length
        }
      }));

      // Create run nodes
      const runNodes: RunNode[] = runs.map((run: Run, index: number) => ({
        id: run.id,
        type: 'default',
        position: { x: 150 + (index * 200), y: 250 },
        data: {
          label: `${run.agentId} - ${run.phase}`,
          run
        }
      }));

      // Create edges between phases
      const phaseEdges: Edge[] = [];
      for (let i = 0; i < phases.length - 1; i++) {
        phaseEdges.push({
          id: `phase-edge-${i}`,
          source: `phase-${phases[i].id}`,
          target: `phase-${phases[i + 1].id}`
        });
      }

      // Create edges from phases to runs
      const runEdges: Edge[] = runs.map((run: Run) => ({
        id: `${run.id}-edge`,
        source: `phase-${run.phase}`,
        target: run.id
      }));

      setNodes([...phaseNodes, ...runNodes]);
      setEdges([...phaseEdges, ...runEdges]);
    } catch (error) {
      console.error('Error loading flow data:', error);
    }
  };

  // Load policies
  const loadPolicies = async (): Promise<void> => {
    try {
      const response = await fetch('/api/policies');
      const policiesData = await response.json();
      setPolicies(policiesData);
      const defaultPolicy = policiesData.find((p: Policy) => p.isDefault);
      if (defaultPolicy) {
        setSelectedPolicy(defaultPolicy.id);
      }
    } catch (error) {
      console.error('Error loading policies:', error);
    }
  };



  useEffect(() => {
    loadPolicies();
  }, []);

  useEffect(() => {
    if (selectedPolicy) {
      loadFlowData(selectedPolicy);
    }
  }, [selectedPolicy]);

  useEffect(() => {
    if (autoRefresh && selectedPolicy) {
      const interval = setInterval(() => loadFlowData(selectedPolicy), 5000);
      return () => clearInterval(interval);
    }
    return;
  }, [autoRefresh, selectedPolicy]);

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
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        minWidth: '250px'
      }}>
        <h3>Agent Shepherd Flow</h3>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Policy:</label>
          <select
            value={selectedPolicy}
            onChange={(e) => setSelectedPolicy(e.target.value)}
            style={{ width: '100%', padding: '4px' }}
          >
            {policies.map(policy => (
              <option key={policy.id} value={policy.id}>
                {policy.name} {policy.isDefault ? '(Default)' : ''}
              </option>
            ))}
          </select>
        </div>
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

// Auto-mount when loaded in browser
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    try {
      const root = createRoot(rootElement);
      root.render(<AgentShepherdFlow />);
    } catch (err) {
      console.error('Failed to mount React app:', err);
    }
  }
}
