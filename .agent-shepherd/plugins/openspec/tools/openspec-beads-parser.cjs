const fs = require('fs');
const path = require('path');

/**
 * Parse OpenSpec tasks.md to extract hierarchical task structure
 * @param {string} tasksMdPath - Path to tasks.md file
 * @returns {Object} Parsed structure
 */
function parseTasksMd(tasksMdPath) {
  const content = fs.readFileSync(tasksMdPath, 'utf8');
  const lines = content.split('\n');

  const tasks = [];
  let currentTask = null;
  let currentSubtasks = [];

  for (const line of lines) {
    // Match ## section headers (main tasks)
    const sectionMatch = line.match(/^## (.+)$/);
    if (sectionMatch) {
      // Save previous task if exists
      if (currentTask) {
        currentTask.subtasks = currentSubtasks;
        tasks.push(currentTask);
      }
      // Start new task
      currentTask = {
        title: sectionMatch[1],
        subtasks: []
      };
      currentSubtasks = [];
    }
    // Match - [ ] subtasks
    else if (line.match(/^- \[ \] (.+)$/)) {
      const subtaskMatch = line.match(/^- \[ \] (.+)$/);
      if (subtaskMatch) {
        currentSubtasks.push({
          title: subtaskMatch[1],
          completed: false
        });
      }
    }
    // Match - [x] completed subtasks
    else if (line.match(/^- \[x\] (.+)$/)) {
      const subtaskMatch = line.match(/^- \[x\] (.+)$/);
      if (subtaskMatch) {
        currentSubtasks.push({
          title: subtaskMatch[1],
          completed: true
        });
      }
    }
  }

  // Add last task
  if (currentTask) {
    currentTask.subtasks = currentSubtasks;
    tasks.push(currentTask);
  }

  return tasks;
}

/**
 * Generate Beads commands to create epic and subtasks
 * @param {string} proposalTitle - Title of the proposal (for epic)
 * @param {Array} tasks - Parsed tasks array
 * @returns {Array} Array of bd commands
 */
function generateBeadsCommands(proposalTitle, tasks) {
  const commands = [];

  // Create epic
  commands.push(`bd create "${proposalTitle}" -p 0`);

  let taskIndex = 1;
  for (const task of tasks) {
    // Create task
    commands.push(`bd create "${task.title}" -p 0`);
    // Assume the last created is the task, add dependency to epic (placeholder)
    // We'll need to track IDs, but for now, use placeholders
    commands.push(`# bd dep add <task_id> <epic_id>`);

    let subtaskIndex = 1;
    for (const subtask of task.subtasks) {
      commands.push(`bd create "${subtask.title}" -p 0`);
      commands.push(`# bd dep add <subtask_id> <task_id>`);
      subtaskIndex++;
    }
    taskIndex++;
  }

  return commands;
}

// Example usage
if (require.main === module) {
  const proposalName = process.argv[2];
  const tasksPath = proposalName ? path.join(process.cwd(), 'openspec', 'changes', proposalName, 'tasks.md') : path.join(process.cwd(), 'openspec', 'changes', 'integrate-beads-sync', 'tasks.md');
  const proposalTitle = proposalName ? proposalName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Integrate Beads Task Sync'; // From proposal.md

  try {
    const tasks = parseTasksMd(tasksPath);
    console.log('Parsed tasks:', JSON.stringify(tasks, null, 2));

    const commands = generateBeadsCommands(proposalTitle, tasks);
    console.log('\nBeads commands:');
    commands.forEach(cmd => console.log(cmd));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

module.exports = { parseTasksMd, generateBeadsCommands };