#!/usr/bin/env node

// Example: How to access tokens sent from getToken.js

const API_BASE = 'http://localhost:3001/api';

// First, you need to authenticate with the server
async function authenticate() {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'BadApple!' })
  });
  
  const data = await response.json();
  if (!data.success) {
    throw new Error('Authentication failed');
  }
  
  return data.token;
}

// Get all pending tokens
async function getPendingTokens(authToken) {
  const response = await fetch(`${API_BASE}/tokens/pending`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  
  return response.json();
}

// Use a specific token
async function useToken(authToken, tokenId) {
  const response = await fetch(`${API_BASE}/tokens/use/${tokenId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  
  return response.json();
}

// Submit a new token (simulating what getToken.js would do)
async function submitToken(authToken, discordToken, username) {
  const response = await fetch(`${API_BASE}/token/submit`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ token: discordToken, username })
  });
  
  return response.json();
}

// Main example
async function main() {
  try {
    // 1. Authenticate
    console.log('Authenticating...');
    const authToken = await authenticate();
    console.log('✓ Authenticated');
    
    // 2. Check pending tokens
    console.log('\nChecking pending tokens...');
    const { tokens } = await getPendingTokens(authToken);
    console.log(`Found ${tokens.length} pending tokens:`);
    
    tokens.forEach(token => {
      const age = Math.round((Date.now() - token.timestamp) / 1000);
      console.log(`  - ID: ${token.id}, User: ${token.username || 'Unknown'}, Age: ${age}s`);
    });
    
    // 3. Use the first token if available
    if (tokens.length > 0) {
      const firstToken = tokens[0];
      console.log(`\nUsing token ${firstToken.id}...`);
      
      const tokenData = await useToken(authToken, firstToken.id);
      console.log('✓ Token retrieved:');
      console.log(`  - Discord Token: ${tokenData.token.substring(0, 20)}...`);
      console.log(`  - Username: ${tokenData.username}`);
      
      // Now you can create a bot instance with this token
      // ... create bot instance with tokenData.token
    } else {
      console.log('\nNo pending tokens available');
      
      // Example: Submit a test token
      console.log('\nExample: Submitting a test token...');
      const result = await submitToken(
        authToken,
        'YOUR_DISCORD_TOKEN_HERE',
        'test_user'
      );
      console.log('Token submitted with ID:', result.tokenId);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { authenticate, getPendingTokens, useToken, submitToken };