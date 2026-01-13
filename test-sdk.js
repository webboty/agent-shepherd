/**
 * SDK Test Script
 * Test basic SDK functionality for session creation and agent execution
 */

import { createOpencodeClient } from '@opencode-ai/sdk';

async function testSDK() {
  console.log('Testing OpenCode SDK connection...');

  try {
    const client = createOpencodeClient({
      baseUrl: 'http://localhost:4096'
    });

    console.log('Client created successfully');

    // Test listing sessions first
    console.log('Testing session listing...');
    const sessions = await client.session.list();
    console.log('Sessions found:', sessions.length);

    // Test session creation
    console.log('Testing session creation...');
    const session = await client.session.create({
      body: {
        title: 'SDK Test Session'
      }
    });
    console.log('Session created:', session);
    console.log('Session data:', session.data);
    const sessionId = session.data?.id || session.id;

    // Test sending a prompt
    console.log('Testing prompt sending...');
    const result = await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: 'text', text: 'Hello, this is a test message from SDK' }]
      }
    });
    console.log('Prompt result:', result);
    console.log('Prompt data:', result.data);

    // Test getting messages
    console.log('Testing message retrieval...');
    const messages = await client.session.messages({
      path: { id: sessionId }
    });
    console.log('Messages:', messages);
    console.log('Messages data:', messages.data);

    console.log('SDK test completed successfully!');

  } catch (error) {
    console.error('SDK test failed:', error);
    console.error('Error details:', error.message);
  }
}

testSDK();