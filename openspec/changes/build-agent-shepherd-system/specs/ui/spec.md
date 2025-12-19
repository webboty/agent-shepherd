## ADDED Requirements
### Requirement: UI Provides Flow Visualization
The UI SHALL display workflow phases, runs, and transitions using ReactFlow.

#### Scenario: Flow display
- **WHEN** user opens UI
- **THEN** shows nodes for phases and edges for transitions

### Requirement: UI Shows Run Timeline
The UI SHALL visualize run history with agent assignments and outcomes.

#### Scenario: Timeline view
- **WHEN** issue selected
- **THEN** displays chronological run sequence

### Requirement: UI Links to Sessions
The UI SHALL provide links to OpenCode sessions and Beads issues.

#### Scenario: Session links
- **WHEN** run node clicked
- **THEN** opens OpenCode session in browser

### Requirement: UI Runs on Configurable Port
The UI SHALL start tiny HTTP server on user-configured port.

#### Scenario: Server start
- **WHEN** ashep ui runs
- **THEN** serves React app on specified port

### Requirement: UI Updates in Real-time
The UI SHALL poll for updates or use websockets for live data.

#### Scenario: Live updates
- **WHEN** runs change
- **THEN** refreshes visualization automatically

### Requirement: UI is Placeholder MVP
The UI SHALL be minimal working visualization, not full-featured app.

#### Scenario: MVP scope
- **WHEN** UI loads
- **THEN** shows basic flow without advanced features