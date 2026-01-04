# Beads Crash Course - Adding Your First Issue

This guide helps you add your first issue to Beads so Agent Shepherd can process it.

## Quick Start

For an interactive guided experience:
```bash
bd quickstart
```

This walks you through creating your first issue step-by-step.

## Manual Issue Creation

### Create a Simple Task

```bash
bd create \
  --type task \
  --title "Create animated hello world" \
  --description "Create index.html with animated 'Hello World' text. Use CSS for smooth pulsing animation. Add JavaScript click handler to change text color randomly." \
  --labels quickstart,documentation
```

### Create a Bug Report

```bash
bd create \
  --type bug \
  --title "Fix login button not responding" \
  --description "Login button on homepage does not respond to clicks. Expected: opens login modal. Actual: nothing happens. Browser: Chrome latest." \
  --priority high \
  --labels frontend,critical
```

### Create a Feature Request

```bash
bd create \
  --type feature \
  --title "Add dark mode toggle" \
  --description "Add toggle button in settings to switch between light and dark themes. Persist preference in localStorage." \
  --priority medium \
  --labels feature,ui
```

## Issue Types

Beads supports these issue types:
- **task**: General work item
- **bug**: Software defect or error
- **feature**: New functionality to add
- **chore**: Maintenance or refactoring
- **epic**: Large feature broken into smaller issues

## Priorities

Set priority to help Agent Shepherd choose what to work on first:
- **low**: Nice to have, can wait
- **medium**: Important, work on soon
- **high**: Urgent, work on now
- **critical**: Blocking, immediate attention

## Labels

Use labels to organize and categorize issues:
```bash
--labels frontend,urgent
--labels backend,api
--labels documentation,quickstart
```

Common useful labels:
- By component: `frontend`, `backend`, `api`, `database`, `ui`
- By type: `bug`, `feature`, `refactor`, `test`
- By status: `ready`, `in-progress`, `blocked`
- Custom: Any tag relevant to your project

## Viewing Issues

```bash
# List all issues
bd list

# Show details for specific issue
bd show <issue-id>

# List issues by status
bd list --status open
bd list --status in-progress
```

## Updating Issues

```bash
# Update status
bd update <issue-id> --status in-progress

# Add a comment/note
bd update <issue-id> --note "Found that issue - it's a CSS z-index problem"

# Change priority
bd update <issue-id> --priority high
```

## Closing Issues

```bash
# Mark issue as completed
bd close <issue-id>
```

## Integration with Agent Shepherd

After creating an issue:
1. **Note** issue ID (e.g., `bd-1` or `task-42`)
2. **Start Agent Shepherd worker**: `ashep worker`
3. **Agent Shepherd automatically picks up** your issue and processes it

## Tips

- **Write clear descriptions**: More detail = better implementation
- **Set realistic priorities**: Helps agent work on right things first
- **Use labels**: Makes it easier to find and filter issues later
- **Break down large tasks**: Create multiple small issues instead of one giant one
- **Reference dependencies**: Mention related issue IDs if tasks depend on each other

## Next Steps

After adding issues, you can:
```bash
# Start processing issues
ashep worker

# Process a specific issue
ashep work <issue-id>

# View progress in browser
ashep ui
```

## Learn More About Beads

- **Official Beads Repository**: https://github.com/steveyegge/beads
- **Beads Documentation**: Check the repository docs for advanced commands and features

