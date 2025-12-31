import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  Handle,
  Position,
  NodeProps,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange
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

interface PhaseData {
  id: string;
  name: string;
  description?: string;
  capabilities?: string[];
  status: string;
  runCount: number;
}

interface PhaseNode extends Node {
  data: PhaseData;
}

const PhaseNodeComponent: React.FC<NodeProps<PhaseData>> = ({ data }) => {
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'active': return '#3b82f6';
      case 'idle': return '#6b7280';
      default: return '#94a3b8';
    }
  };

  const statusColor = getStatusColor(data.status);
  const isDark = window.localStorage.getItem('ashep-colormode') === 'dark';

  return (
    <div style={{
      padding: '16px',
      borderRadius: '12px',
      minWidth: '280px',
      maxWidth: '320px',
      background: isDark ? '#1e293b' : 'white',
      border: `2px solid ${isDark ? '#334155' : '#e2e8f0'}`,
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <Handle type="target" position={Position.Top} style={{ background: statusColor }} />

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '16px',
          fontWeight: '700',
          color: isDark ? '#e2e8f0' : '#1e293b'
        }}>
          {data.name}
        </h3>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: isDark ? '#94a3b8' : '#64748b'
        }}>
          <span style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: statusColor
          }} />
          {data.status}
        </div>
      </div>

      {data.description && (
        <p style={{
          margin: '0 0 12px 0',
          fontSize: '13px',
          color: isDark ? '#94a3b8' : '#64748b',
          lineHeight: '1.5'
        }}>
          {data.description}
        </p>
      )}

      {data.capabilities && data.capabilities.length > 0 && (
        <div style={{
          marginBottom: '12px'
        }}>
          <div style={{
            fontSize: '11px',
            fontWeight: '600',
            color: isDark ? '#64748b' : '#94a3b8',
            textTransform: 'uppercase',
            marginBottom: '6px',
            letterSpacing: '0.05em'
          }}>
            Capabilities
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px'
          }}>
            {data.capabilities.map((capability, index) => (
              <span key={index} style={{
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '500',
                background: isDark ? '#334155' : '#f1f5f9',
                color: isDark ? '#cbd5e1' : '#475569',
                border: `1px solid ${isDark ? '#475569' : '#e2e8f0'}`
              }}>
                {capability}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: '12px',
        borderTop: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`
      }}>
        <span style={{
          fontSize: '11px',
          color: isDark ? '#64748b' : '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: '600'
        }}>
          Total Runs
        </span>
        <span style={{
          fontSize: '13px',
          fontWeight: '600',
          color: isDark ? '#e2e8f0' : '#1e293b',
          background: isDark ? '#0f172a' : '#f8fafc',
          padding: '2px 8px',
          borderRadius: '4px'
        }}>
          {data.runCount}
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: statusColor }} />
    </div>
  );
};

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

const nodeTypes = {
  phase: PhaseNodeComponent,
};

const AgentShepherdFlow: React.FC = () => {
  const [nodes, setNodes] = useState<(PhaseNode | RunNode)[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<string>('');
  const [colorMode, setColorMode] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('ashep-colormode');
    return (saved as 'light' | 'dark' | 'system') || 'light';
  });
  const nodePositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const updatedNodes = applyNodeChanges(changes, nds as Node[]);
        // Update positions ref when nodes change
        updatedNodes.forEach(node => {
          if (node.id) {
            nodePositionsRef.current[node.id] = node.position;
          }
        });
        return updatedNodes;
      });
    },
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

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
      const phaseNodes: PhaseNode[] = phases.map((phase: any, index: number) => {
        const nodeId = `phase-${phase.id}`;
        const savedPosition = nodePositionsRef.current[nodeId];
        
        return {
          id: nodeId,
          type: 'phase',
          position: savedPosition || { x: 50 + (index * 350), y: 100 },
          draggable: true,
          data: {
            id: phase.id,
            name: phase.name,
            description: phase.description,
            capabilities: phase.capabilities,
            status: phase.status,
            runCount: runs.filter((r: Run) => r.phase === phase.id).length
          }
        };
      });

      // Create run nodes positioned below their respective phases
      const runNodes: RunNode[] = runs.map((run: Run) => {
        const savedPosition = nodePositionsRef.current[run.id];
        const phaseIndex = phases.findIndex((p: any) => p.id === run.phase);
        const phaseX = 50 + (phaseIndex * 350);
        const runsInPhase = runs.filter((r: Run) => r.phase === run.phase);
        const runIndexInPhase = runsInPhase.findIndex((r: Run) => r.id === run.id);
        
        return {
          id: run.id,
          type: 'default',
          position: savedPosition || { x: phaseX + (runIndexInPhase % 3) * 110, y: 300 + Math.floor(runIndexInPhase / 3) * 80 },
          draggable: true,
          data: {
            label: `${run.agentId}`,
            run
          }
        };
      });

      // Create edges between phases
      const phaseEdges: Edge[] = [];
      for (let i = 0; i < phases.length - 1; i++) {
        phaseEdges.push({
          id: `phase-edge-${i}`,
          source: `phase-${phases[i].id}`,
          target: `phase-${phases[i + 1].id}`,
          animated: true,
          style: { stroke: '#94a3b8' }
        });
      }

      // Create edges from phases to runs
      const runEdges: Edge[] = runs.map((run: Run) => ({
        id: `${run.id}-edge`,
        source: `phase-${run.phase}`,
        target: run.id,
        animated: true,
        style: { stroke: '#94a3b8' }
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
      nodePositionsRef.current = {};
      setNodes([]);
      setEdges([]);
      loadFlowData(selectedPolicy);
    }
  }, [selectedPolicy]);

  useEffect(() => {
    localStorage.setItem('ashep-colormode', colorMode);
  }, [colorMode]);

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
        background: colorMode === 'dark' ? '#1e293b' : 'white',
        padding: '10px',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        minWidth: '250px',
        color: colorMode === 'dark' ? '#e2e8f0' : '#1e293b'
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: 'inherit' }}>Agent Shepherd Flow</h3>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px', color: 'inherit' }}>Policy:</label>
          <select
            value={selectedPolicy}
            onChange={(e) => setSelectedPolicy(e.target.value)}
            style={{ width: '100%', padding: '4px', background: colorMode === 'dark' ? '#0f172a' : '#ffffff', color: 'inherit', border: `1px solid ${colorMode === 'dark' ? '#334155' : '#e2e8f0'}` }}
          >
            {policies.map(policy => (
              <option key={policy.id} value={policy.id}>
                {policy.name} {policy.isDefault ? '(Default)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'inherit' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto Refresh
          </label>
          <button
            onClick={() => setColorMode(colorMode === 'dark' ? 'light' : 'dark')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: `1px solid ${colorMode === 'dark' ? '#334155' : '#e2e8f0'}`,
              background: colorMode === 'dark' ? '#0f172a' : '#f8fafc',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'inherit'
            }}
          >
            {colorMode === 'dark' ? '☀️' : '🌙'}
            {colorMode === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>

      {selectedRun && (
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1000,
          background: colorMode === 'dark' ? '#1e293b' : 'white',
          padding: '15px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          minWidth: '250px',
          color: colorMode === 'dark' ? '#e2e8f0' : '#1e293b'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: 'inherit' }}>Run Details</h4>
          <p style={{ color: 'inherit' }}><strong>ID:</strong> {selectedRun.id}</p>
          <p style={{ color: 'inherit' }}><strong>Agent:</strong> {selectedRun.agentId}</p>
          <p style={{ color: 'inherit' }}><strong>Phase:</strong> {selectedRun.phase}</p>
          <p style={{ color: 'inherit' }}><strong>Status:</strong> {selectedRun.status}</p>
          <p style={{ color: 'inherit' }}><strong>Issue:</strong> {selectedRun.issueId}</p>
          {selectedRun.sessionId && (
            <p style={{ color: 'inherit' }}><strong>Session:</strong> {selectedRun.sessionId}</p>
          )}
          {selectedRun.outcome && (
            <p style={{ color: 'inherit' }}><strong>Outcome:</strong> {selectedRun.outcome}</p>
          )}
          <button
            onClick={() => setSelectedRun(null)}
            style={{
              marginTop: '10px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: `1px solid ${colorMode === 'dark' ? '#334155' : '#e2e8f0'}`,
              background: colorMode === 'dark' ? '#0f172a' : '#f8fafc',
              cursor: 'pointer',
              color: 'inherit'
            }}
          >
            Close
          </button>
        </div>
      )}

      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: colorMode === 'dark' ? '#111827' : '#ffffff',
        zIndex: -1
      }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes.map(node => {
              if (node.type === 'default') {
                return {
                  ...node,
                  style: {
                    ...node.style,
                    backgroundColor: getNodeColor(node),
                    color: 'white',
                    border: 'none'
                  }
                };
              }
              return node;
            })}
            edges={edges}
            onNodeClick={onNodeClick}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background color={colorMode === 'dark' ? '#111827' : '#f8fafc'} />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
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
