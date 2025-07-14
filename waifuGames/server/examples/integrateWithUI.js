#!/usr/bin/env node

// Example: Integrate pending tokens with the UI

const API_BASE = 'http://localhost:3001/api';

// Quick script to create bot instances from all pending tokens
async function createBotsFromPendingTokens(authToken, channelId) {
  try {
    // Get all pending tokens
    const pendingResponse = await fetch(`${API_BASE}/tokens/pending`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const { tokens } = await pendingResponse.json();
    
    console.log(`Found ${tokens.length} pending tokens`);
    
    // Process each token
    for (const pendingToken of tokens) {
      console.log(`\nProcessing token ${pendingToken.id} (${pendingToken.username})...`);
      
      // 1. Retrieve the actual token
      const useResponse = await fetch(`${API_BASE}/tokens/use/${pendingToken.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      
      if (!useResponse.ok) {
        console.error(`Failed to retrieve token ${pendingToken.id}`);
        continue;
      }
      
      const { token } = await useResponse.json();
      
      // 2. Create bot instance
      const instanceId = Date.now().toString();
      const createResponse = await fetch(`${API_BASE}/instances`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: instanceId,
          token: token,
          channelId: channelId,
          loggingEnabled: true
        })
      });
      
      if (createResponse.ok) {
        console.log(`✓ Created bot instance ${instanceId} for ${pendingToken.username}`);
      } else {
        const error = await createResponse.json();
        console.error(`✗ Failed to create instance:`, error.error);
      }
      
      // Wait a bit between creating instances
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\nDone processing all pending tokens');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Example usage
async function main() {
  // First authenticate
  const authResponse = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'BadApple!' })
  });
  
  const { token: authToken } = await authResponse.json();
  
  // Create bots from pending tokens
  const CHANNEL_ID = '1315554678972481546'; // Your channel ID
  await createBotsFromPendingTokens(authToken, CHANNEL_ID);
}

if (require.main === module) {
  main();
}

module.exports = { createBotsFromPendingTokens };