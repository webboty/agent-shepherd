#!/usr/bin/env node

/**
 * Cross-platform cleanup script for test artifacts
 * Works on Windows, macOS, and Linux
 */

const { execSync } = require('child_process');
const { platform } = require('os');
const path = require('path');

function runCommand(command) {
  try {
    console.log(`🧹 Running: ${command}`);
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    // Ignore errors - cleanup should be best effort
    console.log(`⚠️  Command failed (continuing): ${command}`);
  }
}

function cleanup() {
  console.log('🧹 Running posttest cleanup...');

  const isWindows = platform() === 'win32';
  const projectRoot = path.resolve(__dirname);

  // Clean project tmp_test directory
  if (isWindows) {
    runCommand('if exist tmp_test rmdir /s /q tmp_test 2>nul');
  } else {
    runCommand('rm -rf tmp_test 2>/dev/null || true');
  }

  // Clean nested .agent-shepherd directories (but not the main one)
  if (isWindows) {
    // On Windows, we need to be careful not to delete the main directory
    runCommand('for /d %i in (".agent-shepherd\\*") do if exist "%i\\.beads" rmdir /s /q "%i" 2>nul');
  } else {
    runCommand("find . -name '.agent-shepherd' -type d -mindepth 2 -exec rm -rf {} + 2>/dev/null || true");
  }

  // Clean /tmp directories (Unix-like systems only, Windows doesn't have /tmp)
  if (!isWindows) {
    runCommand('rm -rf /tmp/*agent* /tmp/*test* 2>/dev/null || true');
  } else {
    // On Windows, clean temp directories
    runCommand('for /d %i in ("%TEMP%\\*agent*") do rmdir /s /q "%i" 2>nul');
    runCommand('for /d %i in ("%TEMP%\\*test*") do rmdir /s /q "%i" 2>nul');
  }

  console.log('✅ Cleanup completed');
}

if (require.main === module) {
  cleanup();
}