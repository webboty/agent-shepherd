#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');

const proposalId = process.argv[2];
if (!proposalId) {
  console.error('Usage: node tools/openspec-beads-sync.js <proposal-id>');
  process.exit(1);
}

const proposalDir = `openspec/changes/${proposalId}`;
const proposalPath = `${proposalDir}/proposal.md`;
const tasksPath = `${proposalDir}/tasks.md`;

if (!fs.existsSync(proposalPath) || !fs.existsSync(tasksPath)) {
  console.error('Proposal or tasks file not found');
  process.exit(1);
}

// Read proposal.md to get title
const proposalContent = fs.readFileSync(proposalPath, 'utf8');
const titleMatch = proposalContent.match(/^# Change: (.+)$/m);
const title = titleMatch ? titleMatch[1].trim() : proposalId;

// Find the epic by title
let listOutput;
try {
  listOutput = execSync('bd list --json', { encoding: 'utf8' });
} catch (e) {
  console.error('Failed to list Beads issues');
  process.exit(1);
}
let issues;
try {
  issues = JSON.parse(listOutput);
} catch (e) {
  console.error('Failed to parse Beads list output');
  process.exit(1);
}

const epic = issues.find(issue => issue.title === title && issue.status !== 'closed');
if (!epic) {
  console.error('Epic not found');
  process.exit(1);
}

const epicId = epic.id;

// Find all descendants of epic (IDs starting with epicId.)
const tasks = issues.filter(issue => issue.id.startsWith(epicId + '.') && issue.id.split('.').length === 2);
const subTasks = issues.filter(issue => issue.id.startsWith(epicId + '.') && issue.id.split('.').length === 3);

// Read tasks.md
let tasksContent = fs.readFileSync(tasksPath, 'utf8');
const lines = tasksContent.split('\n');

// Closed titles
const closedTitles = [];
for (const issue of [...tasks, ...subTasks]) {
  if (issue.status === 'closed') {
    closedTitles.push(issue.title);
  }
}

// Update tasks.md
let updated = false;
const updatedLines = lines.map(line => {
  if (line.trim().startsWith('- [ ] ')) {
    const taskTitle = line.trim().substring(6);
    if (closedTitles.includes(taskTitle)) {
      updated = true;
      return line.replace('- [ ] ', '- [x] ');
    }
  }
  return line;
});

if (updated) {
  fs.writeFileSync(tasksPath, updatedLines.join('\n'));
}

// Now, sync from OpenSpec to Beads
const openTitles = [];
for (const line of lines) {
  if (line.trim().startsWith('- [x] ')) {
    openTitles.push(line.trim().substring(6));
  }
}

for (const issue of [...tasks, ...subTasks]) {
  if (openTitles.includes(issue.title) && issue.status !== 'closed') {
    try {
      execSync(`bd update ${issue.id} --status closed`);
      console.log(`Closed Beads task: ${issue.title}`);
    } catch (e) {
      console.error(`Failed to close Beads task: ${issue.title}`);
    }
  }
}

console.log('Sync complete');