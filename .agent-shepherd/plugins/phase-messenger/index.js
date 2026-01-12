const { execSync } = require('child_process');
const path = require('path');

async function phaseMsgSend(issueId, fromPhase, toPhase, messageType, content) {
  if (!issueId || !fromPhase || !toPhase || !messageType || !content) {
    console.error('Usage: ashep phase-msg-send <issue-id> <from-phase> <to-phase> <message-type> <content>');
    console.error('Message types: context, result, decision, data');
    console.error('Example: ashep phase-msg-send agent-shepherd-alg8.1 plan implement result "Task completed successfully"');
    process.exit(1);
  }

  try {
    const storagePath = path.join(__dirname, 'lib', 'message-storage.cjs');
    execSync(`bun "${storagePath}" send "${issueId}" "${fromPhase}" "${toPhase}" "${messageType}" "${content}"`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..', '..', '..')
    });
  } catch (error) {
    console.error('Failed to send message:', error.message);
    process.exit(1);
  }
}

async function phaseMsgReceive(issueId, phase, markAsReceived = true) {
  if (!issueId || !phase) {
    console.error('Usage: ashep phase-msg-receive <issue-id> <phase> [--keep-unread]');
    console.error('Example: ashep phase-msg-receive agent-shepherd-alg8.1 implement');
    process.exit(1);
  }

  try {
    const storagePath = path.join(__dirname, 'lib', 'message-storage.cjs');
    const keepUnreadFlag = markAsReceived === false ? '--keep-unread' : '';
    execSync(`bun "${storagePath}" receive "${issueId}" "${phase}" ${keepUnreadFlag}`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..', '..', '..')
    });
  } catch (error) {
    console.error('Failed to receive messages:', error.message);
    process.exit(1);
  }
}

async function phaseMsgList(issueId, phase, messageType) {
  if (!issueId) {
    console.error('Usage: ashep phase-msg-list <issue-id> [phase] [message-type]');
    console.error('Example: ashep phase-msg-list agent-shepherd-alg8.1');
    console.error('         ashep phase-msg-list agent-shepherd-alg8.1 implement');
    console.error('         ashep phase-msg-list agent-shepherd-alg8.1 implement result');
    process.exit(1);
  }

  try {
    const storagePath = path.join(__dirname, 'lib', 'message-storage.cjs');
    const phaseFilter = phase ? `"${phase}"` : '';
    const typeFilter = messageType ? `"${messageType}"` : '';
    execSync(`bun "${storagePath}" list "${issueId}" ${phaseFilter} ${typeFilter}`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..', '..', '..')
    });
  } catch (error) {
    console.error('Failed to list messages:', error.message);
    process.exit(1);
  }
}

async function phaseMsgCleanup(issueId, reason) {
  if (!issueId) {
    console.error('Usage: ashep phase-msg-cleanup <issue-id> [--reason <reason>]');
    console.error('Example: ashep phase-msg-cleanup agent-shepherd-alg8.1');
    console.error('         ashep phase-msg-cleanup agent-shepherd-alg8.1 --reason issue_closed');
    process.exit(1);
  }

  const cleanupReason = reason || 'manual';

  try {
    const storagePath = path.join(__dirname, 'lib', 'message-storage.cjs');
    execSync(`bun "${storagePath}" cleanup "${issueId}" "${cleanupReason}"`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..', '..', '..')
    });
  } catch (error) {
    console.error('Failed to cleanup messages:', error.message);
    process.exit(1);
  }
}

async function phaseMsgStatus(issueId) {
  try {
    const storagePath = path.join(__dirname, 'lib', 'message-storage.cjs');
    const issueIdArg = issueId ? `"${issueId}"` : '';
    execSync(`bun "${storagePath}" status ${issueIdArg}`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..', '..', '..')
    });
  } catch (error) {
    console.error('Failed to get status:', error.message);
    process.exit(1);
  }
}

module.exports = {
  'phase-msg-send': phaseMsgSend,
  'phase-msg-receive': phaseMsgReceive,
  'phase-msg-list': phaseMsgList,
  'phase-msg-cleanup': phaseMsgCleanup,
  'phase-msg-status': phaseMsgStatus
};
