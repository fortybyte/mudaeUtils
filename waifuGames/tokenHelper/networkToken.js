// Network Token Extractor for Discord
// This script monitors network requests to extract your token

(function() {
  console.log('🔍 Token Extractor: Starting network monitoring...');
  console.log('📝 Please navigate around Discord or refresh the page to trigger API calls');
  
  let tokenFound = false;
  let token = null;
  
  // Override fetch to capture Authorization headers
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const [url, config] = args;
    
    if (config && config.headers) {
      const auth = config.headers.Authorization || config.headers.authorization;
      if (auth && !tokenFound) {
        token = auth.replace('Bearer ', '');
        tokenFound = true;
        console.log('✅ Token found via fetch!');
        
        // Restore original fetch
        window.fetch = originalFetch;
        
        // Show the result
        showTokenUI(token);
      }
    }
    
    return originalFetch.apply(this, args);
  };
  
  // Also override XMLHttpRequest
  const originalXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    if ((header === 'Authorization' || header === 'authorization') && !tokenFound) {
      token = value.replace('Bearer ', '');
      tokenFound = true;
      console.log('✅ Token found via XMLHttpRequest!');
      
      // Restore original
      XMLHttpRequest.prototype.setRequestHeader = originalXHRSetHeader;
      
      // Show the result
      showTokenUI(token);
    }
    
    return originalXHRSetHeader.apply(this, arguments);
  };
  
  function showTokenUI(token) {
    // Copy to clipboard
    navigator.clipboard.writeText(token).then(() => {
      console.log('📋 Token copied to clipboard!');
    });
    
    // Create UI
    const div = document.createElement('div');
    div.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #5865F2;
      color: white;
      padding: 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 9999;
      max-width: 400px;
    `;
    
    div.innerHTML = `
      <h3 style="margin: 0 0 10px 0;">✅ Token Found!</h3>
      <p style="margin: 0 0 10px 0; font-size: 14px;">Your token has been copied to clipboard.</p>
      <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 4px; margin-bottom: 15px; word-break: break-all; font-family: monospace; font-size: 12px;">
        ${token.substring(0, 20)}...${token.substring(token.length - 10)}
      </div>
      <div style="display: flex; gap: 10px;">
        <button id="copy-token" style="
          background: white;
          color: #5865F2;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          flex: 1;
        ">Copy Again</button>
        <button id="close-token-ui" style="
          background: transparent;
          color: white;
          border: 1px solid white;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          flex: 1;
        ">Close</button>
      </div>
    `;
    
    document.body.appendChild(div);
    
    // Button handlers
    document.getElementById('copy-token').onclick = () => {
      navigator.clipboard.writeText(token);
      const btn = document.getElementById('copy-token');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Again'; }, 1000);
    };
    
    document.getElementById('close-token-ui').onclick = () => {
      div.remove();
    };
    
    // Auto-remove after 30 seconds
    setTimeout(() => {
      if (div.parentNode) {
        div.remove();
      }
    }, 30000);
  }
  
  // If no token found after 10 seconds, show instructions
  setTimeout(() => {
    if (!tokenFound) {
      console.log('⏱️ No token found yet. Please try:');
      console.log('1. Refresh the page (F5)');
      console.log('2. Switch channels');
      console.log('3. Send a message');
      console.log('Any of these actions should trigger an API call with your token.');
    }
  }, 10000);
})();