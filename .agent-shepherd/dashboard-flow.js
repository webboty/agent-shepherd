const { useState, useEffect } = React;

function AgentShepherdFlow() {
    const [policies, setPolicies] = useState([]);
    const [selectedPolicy, setSelectedPolicy] = useState('');
    const [phases, setPhases] = useState([]);
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);

    // Load policies on mount
    useEffect(() => {
        async function loadPolicies() {
            try {
                const policiesRes = await fetch('/api/policies');
                const policiesData = await policiesRes.json();
                setPolicies(policiesData);

                const defaultPolicy = policiesData.find(p => p.isDefault);
                if (defaultPolicy) {
                    setSelectedPolicy(defaultPolicy.id);
                }
            } catch (error) {
                console.error('Error loading policies:', error);
            }
        }
        loadPolicies();
    }, []);

    // Load data when policy changes
    useEffect(() => {
        if (!selectedPolicy) return;

        async function loadData() {
            try {
                setLoading(true);
                const [phasesRes, runsRes] = await Promise.all([
                    fetch('/api/phases?policy=' + selectedPolicy),
                    fetch('/api/runs')
                ]);

                const phasesData = await phasesRes.json();
                const runsData = await runsRes.json();

                setPhases(phasesData);
                setRuns(runsData);

                // Create React Flow nodes and edges
                const phaseNodes = phasesData.map((phase, index) => ({
                    id: 'phase-' + phase.id,
                    type: 'default',
                    position: { x: 200 + (index * 350), y: 100 },
                    data: {
                        label: React.createElement('div', { style: { textAlign: 'center', maxWidth: '200px' } }, [
                            React.createElement('div', {
                                key: 'num',
                                style: {
                                    background: '#6b7280',
                                    color: 'white',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    fontSize: '12px',
                                    display: 'inline-block',
                                    marginBottom: '8px'
                                }
                            }, 'Phase ' + (index + 1)),
                            React.createElement('h4', { key: 'name', style: { margin: '4px 0', fontSize: '14px' } }, phase.name),
                            React.createElement('p', { key: 'desc', style: { fontSize: '11px', color: '#666', margin: '2px 0' } }, phase.description || ''),
                            React.createElement('div', { key: 'caps', style: { fontSize: '10px', marginTop: '4px' } },
                                (phase.capabilities || []).slice(0, 2).join(', ') + ((phase.capabilities || []).length > 2 ? '...' : '')
                            ),
                            React.createElement('div', { key: 'timeout', style: { fontSize: '10px', color: '#888', marginTop: '2px' } },
                                '×' + (phase.timeout_multiplier || 1.0)
                            )
                        ])
                    },
                    style: {
                        background: '#f8fafc',
                        border: '2px solid #6b7280',
                        borderRadius: '8px',
                        padding: '15px',
                        minWidth: '180px'
                    }
                }));

                const runNodes = runsData.map((run, index) => ({
                    id: run.id,
                    type: 'default',
                    position: { x: 250 + (index * 350), y: 350 },
                    data: {
                        label: run.agentId + ' - ' + run.phase
                    },
                    style: {
                        background: run.status === 'completed' ? '#10b981' :
                                  run.status === 'running' ? '#3b82f6' :
                                  run.status === 'failed' ? '#ef4444' : '#6b7280',
                        color: 'white',
                        border: 'none',
                        padding: '10px',
                        borderRadius: '6px'
                    }
                }));

                const phaseEdges = [];
                for (let i = 0; i < phasesData.length - 1; i++) {
                    phaseEdges.push({
                        id: 'edge-' + i,
                        source: 'phase-' + phasesData[i].id,
                        target: 'phase-' + phasesData[i + 1].id,
                        type: 'smoothstep',
                        style: { stroke: '#6b7280', strokeWidth: 2 }
                    });
                }

                const runEdges = runsData.map(run => ({
                    id: run.id + '-edge',
                    source: 'phase-' + run.phase,
                    target: run.id,
                    type: 'smoothstep',
                    style: { stroke: '#3b82f6', strokeWidth: 2 }
                }));

                setNodes([...phaseNodes, ...runNodes]);
                setEdges([...phaseEdges, ...runEdges]);

            } catch (error) {
                console.error('Error loading data:', error);
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, [selectedPolicy]);

    if (loading) {
        return React.createElement('div', {
            style: {
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh'
            }
        }, 'Loading Agent Shepherd Flow...');
    }

    return React.createElement('div', { style: { width: '100vw', height: '100vh' } }, [
        React.createElement('div', {
            key: 'controls',
            style: {
                position: 'absolute',
                top: 10,
                left: 10,
                zIndex: 1000,
                background: 'white',
                padding: '15px',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                minWidth: '300px'
            }
        }, [
            React.createElement('h3', { key: 'title', style: { margin: '0 0 10px 0' } }, 'Agent Shepherd Flow'),
            React.createElement('div', { key: 'policy-selector', style: { marginBottom: '10px' } }, [
                React.createElement('label', {
                    key: 'policy-label',
                    style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' }
                }, 'Policy:'),
                React.createElement('select', {
                    key: 'policy-select',
                    value: selectedPolicy,
                    onChange: (e) => setSelectedPolicy(e.target.value),
                    style: { width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }
                }, policies.map(p =>
                    React.createElement('option', { key: p.id, value: p.id },
                        p.name + (p.isDefault ? ' (Default)' : '')
                    )
                ))
            ]),
            React.createElement('div', { key: 'stats' }, [
                React.createElement('div', { key: 'phases' }, 'Phases: ' + phases.length),
                React.createElement('div', { key: 'runs' }, 'Runs: ' + runs.length)
            ])
        ]),
        ReactFlow ? React.createElement(ReactFlow, {
            key: 'flow',
            nodes: nodes,
            edges: edges,
            fitView: true,
            style: { width: '100vw', height: '100vh' }
        }, [
            React.createElement(ReactFlow.Background, { key: 'bg' }),
            React.createElement(ReactFlow.Controls, { key: 'controls' }),
            React.createElement(ReactFlow.MiniMap, { key: 'minimap' })
        ]) : React.createElement('div', {
            style: {
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '50vh',
                color: '#666'
            }
        }, 'ReactFlow not available - using simplified view')
    ]);
}

// Wait for DOM to be ready
function initApp() {
    const rootElement = document.getElementById('root');
    if (!rootElement) {
        console.error('Root element not found');
        return;
    }

    try {
        const root = ReactDOM.createRoot(rootElement);
        root.render(React.createElement(AgentShepherdFlow));
        console.log('React app initialized successfully');
    } catch (error) {
        console.error('Error initializing React app:', error);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}