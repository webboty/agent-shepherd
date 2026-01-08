const { join } = require('path');
const { MessageStorage } = require('./message-storage.js');

const VALID_TYPES = ['context', 'result', 'decision', 'data'];

function printHelp() {
  console.log('Message Storage CLI');
  console.log('');
  console.log('Usage:');
  console.log('  node message-storage.cjs send <issue-id> <from-phase> <to-phase> <message-type> <content> [metadata-json]');
  console.log('  node message-storage.cjs receive <issue-id> <phase> [--keep-unread]');
  console.log('  node message-storage.cjs list <issue-id> [phase] [message-type]');
  console.log('');
  console.log('Message types: context, result, decision, data');
  console.log('');
  console.log('Examples:');
  console.log('  node message-storage.cjs send agent-shepherd-alg8.1 plan implement result "Task completed successfully"');
  console.log('  node message-storage.cjs send agent-shepherd-alg8.1 plan implement data \'{"metrics": {"latency": 45}}\'');
  console.log('  node message-storage.cjs receive agent-shepherd-alg8.1 implement');
  console.log('  node message-storage.cjs receive agent-shepherd-alg8.1 implement --keep-unread');
  console.log('  node message-storage.cjs list agent-shepherd-alg8.1');
  console.log('  node message-storage.cjs list agent-shepherd-alg8.1 implement');
  console.log('  node message-storage.cjs list agent-shepherd-alg8.1 implement result');
}

function formatDate(timestamp) {
  return new Date(timestamp).toISOString();
}

function formatMessage(message, verbose = false) {
  const lines = [];
  lines.push(`ID: ${message.id}`);
  lines.push(`From: ${message.from_phase} → To: ${message.to_phase}`);
  lines.push(`Type: ${message.message_type} | Run: ${message.run_counter}`);
  lines.push(`Status: ${message.read ? 'READ' : 'UNREAD'}`);
  lines.push(`Created: ${formatDate(message.created_at)}`);
  
  if (verbose) {
    if (message.metadata) {
      lines.push(`Metadata: ${JSON.stringify(message.metadata, null, 2)}`);
    }
  }

  const content = message.content.length > 200 && !verbose 
    ? message.content.substring(0, 200) + '...' 
    : message.content;

  lines.push(`Content: ${content}`);

  if (message.read_at) {
    lines.push(`Read at: ${formatDate(message.read_at)}`);
  }

  return lines.join('\n  ');
}

function commandSend(args) {
  if (args.length < 5) {
    console.error('Error: Missing required arguments for send command');
    console.error('Usage: send <issue-id> <from-phase> <to-phase> <message-type> <content> [metadata-json]');
    process.exit(1);
  }

  const [issueId, fromPhase, toPhase, messageType, content, metadataJson] = args;

  if (!VALID_TYPES.includes(messageType)) {
    console.error(`Error: Invalid message type '${messageType}'`);
    console.error(`Valid types: ${VALID_TYPES.join(', ')}`);
    process.exit(1);
  }

  const storage = new MessageStorage();

  try {
    const messageData = {
      issue_id: issueId,
      from_phase: fromPhase,
      to_phase: toPhase,
      message_type: messageType,
      content: content
    };

    if (metadataJson) {
      try {
        messageData.metadata = JSON.parse(metadataJson);
      } catch (e) {
        console.error('Error: Invalid JSON in metadata');
        process.exit(1);
      }
    }

    const message = storage.createMessage(messageData);

    console.log('✓ Message sent successfully');
    console.log('');
    console.log(`ID: ${message.id}`);
    console.log(`From: ${fromPhase} → To: ${toPhase}`);
    console.log(`Type: ${messageType}`);
    console.log(`Created: ${formatDate(message.created_at)}`);

    storage.close();
  } catch (error) {
    console.error('Error sending message:', error.message);
    storage.close();
    process.exit(1);
  }
}

function commandReceive(args) {
  if (args.length < 2) {
    console.error('Error: Missing required arguments for receive command');
    console.error('Usage: receive <issue-id> <phase> [--keep-unread]');
    process.exit(1);
  }

  const issueId = args[0];
  const phase = args[1];
  const keepUnread = args.includes('--keep-unread');

  const storage = new MessageStorage();

  try {
    const messages = storage.listMessages({
      issue_id: issueId,
      to_phase: phase,
      read: false
    });

    if (messages.length === 0) {
      console.log(`No unread messages for phase '${phase}' in issue '${issueId}'`);
      storage.close();
      return;
    }

    console.log(`Found ${messages.length} unread message(s) for phase '${phase}':\n`);

    messages.forEach((msg, index) => {
      console.log(`[${index + 1}/${messages.length}]`);
      console.log('  ' + formatMessage(msg, true));
      console.log('');

      if (!keepUnread) {
        storage.markAsRead(msg.id);
      }
    });

    if (!keepUnread) {
      console.log(`✓ Marked ${messages.length} message(s) as read`);
    }

    storage.close();
  } catch (error) {
    console.error('Error receiving messages:', error.message);
    storage.close();
    process.exit(1);
  }
}

function commandList(args) {
  if (args.length < 1) {
    console.error('Error: Missing required arguments for list command');
    console.error('Usage: list <issue-id> [phase] [message-type]');
    process.exit(1);
  }

  const issueId = args[0];
  const phase = args[1] || undefined;
  const messageType = args[2] || undefined;

  if (messageType && !VALID_TYPES.includes(messageType)) {
    console.error(`Error: Invalid message type '${messageType}'`);
    console.error(`Valid types: ${VALID_TYPES.join(', ')}`);
    process.exit(1);
  }

  const storage = new MessageStorage();

  try {
    const query = { issue_id: issueId };
    if (phase) query.to_phase = phase;
    if (messageType) query.message_type = messageType;

    const messages = storage.listMessages(query);

    if (messages.length === 0) {
      const filterDesc = [phase ? `phase '${phase}'` : '', messageType ? `type '${messageType}'` : '']
        .filter(Boolean)
        .join(', ');
      console.log(`No messages found for issue '${issueId}'${filterDesc ? ` (${filterDesc})` : ''}`);
      storage.close();
      return;
    }

    const unreadCount = storage.getUnreadCount(issueId, phase || '');

    console.log(`Found ${messages.length} message(s) (${unreadCount} unread)\n`);

    messages.forEach((msg, index) => {
      console.log(`[${index + 1}/${messages.length}] ${msg.read ? '✓' : '○'}`);
      console.log('  ' + formatMessage(msg, false));
      console.log('');
    });

    storage.close();
  } catch (error) {
    console.error('Error listing messages:', error.message);
    storage.close();
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  switch (command) {
    case 'send':
      commandSend(commandArgs);
      break;
    case 'receive':
      commandReceive(commandArgs);
      break;
    case 'list':
      commandList(commandArgs);
      break;
    default:
      console.error(`Error: Unknown command '${command}'`);
      console.error('');
      printHelp();
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, commandSend, commandReceive, commandList };
