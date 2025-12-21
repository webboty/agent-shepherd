#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');

const proposalId = process.argv[2];
if (!proposalId) {
  console.error('Usage: node tools/openspec-beads-converter.cjs <proposal-id>');
  process.exit(1);
}

const proposalDir = `openspec/changes/${proposalId}`;
const proposalPath = `${proposalDir}/proposal.md`;
const tasksPath = `${proposalDir}/tasks.md`;

if (!fs.existsSync(proposalPath) || !fs.existsSync(tasksPath)) {
  console.error('Proposal or tasks file not found');
  process.exit(1);
}

// Read proposal.md
const proposalContent = fs.readFileSync(proposalPath, 'utf8');
const titleMatch = proposalContent.match(/^# Change: (.+)$/m);
const title = titleMatch ? titleMatch[1].trim() : proposalId;

// Extract description from ## Why and ## What Changes
const whyMatch = proposalContent.match(/## Why\s*\n([\s\S]*?)(?=\n##|\n*$)/);
const whatMatch = proposalContent.match(/## What Changes\s*\n([\s\S]*?)(?=\n##|\n*$)/);
const description = [whyMatch ? whyMatch[1].trim() : '', whatMatch ? whatMatch[1].trim() : ''].filter(Boolean).join('\n\n');

// Check if epic already exists
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

let epic = issues.find(issue => issue.title === title && issue.status !== 'closed');
let epicId;
if (epic) {
  console.log(`Using existing epic: ${epic.id}`);
  epicId = epic.id;
} else {
  // Create epic
  console.log(`Creating epic for proposal: ${title}`);
  console.log(`Description length: ${description.length}`);
  try {
    const epicOutput = execSync(`bd create "${title.replace(/"/g, '\\"')}" --description "${description.replace(/"/g, '\\"')}" --silent`, { encoding: 'utf8' });
    epicId = epicOutput.trim();
    if (!epicId) {
      console.error('Failed to create epic - no ID in output');
      process.exit(1);
    }
    console.log(`Created epic: ${epicId}`);
  } catch (e) {
    console.error('Failed to create epic:', e.message);
    process.exit(1);
  }
}

// Read and parse tasks.md
const tasksContent = fs.readFileSync(tasksPath, 'utf8');
const lines = tasksContent.split('\n');

let currentSection = null;
const sectionTasks = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.startsWith('## ')) {
    // New section
    if (currentSection) {
      // Process previous section
      createSectionTasks(epicId, currentSection, sectionTasks);
      sectionTasks.length = 0;
    }
    currentSection = line.substring(3);
  } else if (line.startsWith('- [ ] ')) {
    // Task item
    if (currentSection) {
      sectionTasks.push(line.substring(6));
    }
  }
}

// Process last section
if (currentSection) {
  createSectionTasks(epicId, currentSection, sectionTasks);
}

function createSectionTasks(epicId, sectionTitle, taskList) {
  // Check if section task already exists
  const existingSection = issues.find(issue => issue.title === sectionTitle && issue.id.startsWith(epicId + '.'));
  let sectionId;
  if (existingSection) {
    console.log(`Using existing section task: ${sectionTitle} (${existingSection.id})`);
    sectionId = existingSection.id;
  } else {
    // Create section task with parent
    console.log(`Creating section task: ${sectionTitle}`);
    const sectionOutput = execSync(`bd create "${sectionTitle.replace(/"/g, '\\"')}" --parent ${epicId} --silent --force`, { encoding: 'utf8' });
    sectionId = sectionOutput.trim();
    if (!sectionId) {
      console.error(`Failed to create section task: ${sectionTitle}`);
      return;
    }
  }

  // Create sub-tasks with parent
  for (const task of taskList) {
    // Check if sub-task already exists
    const existingSub = issues.find(issue => issue.title === task && issue.id.startsWith(sectionId + '.'));
    if (existingSub) {
      console.log(`Skipping existing sub-task: ${task} (${existingSub.id})`);
    } else {
      console.log(`Creating sub-task: ${task}`);
      const taskOutput = execSync(`bd create "${task.replace(/"/g, '\\"')}" --parent ${sectionId} --silent --force`, { encoding: 'utf8' });
    }
  }
}

console.log('Conversion complete');