const { execSync } = require('child_process');
const path = require('path');

async function openspecConvert(proposalId) {
  if (!proposalId) {
    console.error('Usage: ashep openspec-convert <proposal-id>');
    console.error('Example: ashep openspec-convert integrate-beads-sync');
    process.exit(1);
  }

  try {
    const converterPath = path.join(__dirname, 'tools', 'openspec-beads-converter.cjs');
    execSync(`node "${converterPath}" "${proposalId}"`, { stdio: 'inherit', cwd: path.join(__dirname, '..', '..', '..') });
  } catch (error) {
    console.error('Failed to convert proposal:', error.message);
    process.exit(1);
  }
}

async function openspecSync(proposalId) {
  if (!proposalId) {
    console.error('Usage: ashep openspec-sync <proposal-id>');
    console.error('Example: ashep openspec-sync integrate-beads-sync');
    process.exit(1);
  }

  try {
    const syncPath = path.join(__dirname, 'tools', 'openspec-beads-sync.cjs');
    execSync(`node "${syncPath}" "${proposalId}"`, { stdio: 'inherit', cwd: path.join(__dirname, '..', '..', '..') });
  } catch (error) {
    console.error('Failed to sync proposal:', error.message);
    process.exit(1);
  }
}

async function openspecParse(proposalId) {
  if (!proposalId) {
    console.error('Usage: ashep openspec-parse <proposal-id>');
    console.error('Example: ashep openspec-parse integrate-beads-sync');
    process.exit(1);
  }

  try {
    const parserPath = path.join(__dirname, 'tools', 'openspec-beads-parser.cjs');
    execSync(`node "${parserPath}" "${proposalId}"`, { stdio: 'inherit', cwd: path.join(__dirname, '..', '..', '..') });
  } catch (error) {
    console.error('Failed to parse proposal:', error.message);
    process.exit(1);
  }
}

module.exports = {
  'openspec-convert': openspecConvert,
  'openspec-sync': openspecSync,
  'openspec-parse': openspecParse
};