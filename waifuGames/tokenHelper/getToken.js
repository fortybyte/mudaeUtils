// Token Helper Script
// Run this in Discord's web console to get your token and send it to your bot manager

(function() {
  // Your bot manager server URL
  const SERVER_URL = `http://${window.location.hostname}:3001/api/token/submit`;
  
  // Get token - try multiple methods
  let token = null;
  
  // Method 1: Modern Discord token extraction
  try {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const localStorage = iframe.contentWindow.localStorage;
    token = JSON.parse(localStorage.token || localStorage.tokens || '{}');
    if (typeof token === 'string') {
      token = token.replace(/"/g, '');
    } else if (token && typeof token === 'object') {
      // Sometimes token is stored as an object
      token = Object.values(token)[0];
    }
    document.body.removeChild(iframe);
  } catch (e) {
    console.log('Method 1 failed:', e);
  }
  
  // Method 2: Search through webpack modules more thoroughly
  if (!token) {
    try {
      let modules = [];
      if (typeof webpackChunkdiscord_app !== 'undefined') {
        webpackChunkdiscord_app.push([[Symbol()], {}, req => {
          modules = req.c;
        }]);
        
        for (const m of Object.values(modules)) {
          if (!m.exports) continue;
          
          // Check for token in various places
          const exports = m.exports;
          if (exports.default?.getToken) {
            token = exports.default.getToken();
            break;
          }
          if (exports.getToken) {
            token = exports.getToken();
            break;
          }
          
          // Check nested exports
          for (const exp of Object.values(exports)) {
            if (exp && typeof exp === 'object' && exp.getToken) {
              token = exp.getToken();
              break;
            }
          }
          
          if (token) break;
        }
      }
    } catch (e) {
      console.log('Method 2 failed:', e);
    }
  }
  
  // Method 3: Try XMLHttpRequest override method
  if (!token) {
    try {
      const originalXHR = XMLHttpRequest.prototype.setRequestHeader;
      let capturedToken = null;
      
      XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
        if (header === 'Authorization' && value.includes('Bearer ')) {
          capturedToken = value.replace('Bearer ', '');
        }
        originalXHR.apply(this, arguments);
      };
      
      // Wait a moment for any requests to be made
      setTimeout(() => {
        XMLHttpRequest.prototype.setRequestHeader = originalXHR;
        if (capturedToken) {
          token = capturedToken;
        }
      }, 100);
    } catch (e) {
      console.log('Method 3 failed:', e);
    }
  }
  
  // Method 4: Search localStorage more thoroughly
  if (!token) {
    try {
      for (const key in localStorage) {
        const value = localStorage[key];
        if (key.includes('token') && value && value.length > 50) {
          token = value.replace(/"/g, '');
          break;
        }
      }
    } catch (e) {
      console.log('Method 4 failed:', e);
    }
  }
  
  if (!token) {
    console.error('❌ Could not find token automatically');
    console.log('💡 Try using the networkToken.js script instead:');
    console.log('1. Copy the contents of tokenHelper/networkToken.js');
    console.log('2. Paste it in the console and press Enter');
    console.log('3. Refresh the page or switch channels');
    console.log('4. Your token will be captured from network requests');
    
    // Show manual instructions UI
    const div = document.createElement('div');
    div.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ed4245;
      color: white;
      padding: 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 9999;
      max-width: 400px;
    `;
    
    div.innerHTML = `
      <h3 style="margin: 0 0 10px 0;">❌ Automatic Token Extraction Failed</h3>
      <p style="margin: 0 0 15px 0; font-size: 14px;">Discord has changed their structure. Please use one of these methods:</p>
      <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 4px; margin-bottom: 15px;">
        <h4 style="margin: 0 0 10px 0; font-size: 16px;">Method 1: Network Tab</h4>
        <ol style="margin: 0; padding-left: 20px; font-size: 13px;">
          <li>Press F12 to open DevTools</li>
          <li>Go to Network tab</li>
          <li>Filter by "api"</li>
          <li>Refresh page (F5)</li>
          <li>Click any discord.com/api request</li>
          <li>Find "Authorization" in Headers</li>
          <li>Copy the token value</li>
        </ol>
      </div>
      <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 4px;">
        <h4 style="margin: 0 0 10px 0; font-size: 16px;">Method 2: Network Script</h4>
        <p style="margin: 0; font-size: 13px;">Use the networkToken.js script which monitors network requests automatically.</p>
      </div>
      <button id="close-error" style="
        width: 100%;
        margin-top: 15px;
        background: white;
        color: #ed4245;
        border: none;
        padding: 10px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
      ">Close</button>
    `;
    
    document.body.appendChild(div);
    document.getElementById('close-error').onclick = () => div.remove();
    
    return;
  }
  
  console.log('✅ Token found! Length:', token.length);
  
  // Copy to clipboard
  navigator.clipboard.writeText(token).then(() => {
    console.log('📋 Token copied to clipboard!');
  });
  
  // Show a nice UI
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
    max-width: 300px;
  `;
  
  div.innerHTML = `
    <h3 style="margin: 0 0 10px 0;">Token Helper</h3>
    <p style="margin: 0 0 15px 0; font-size: 14px;">Your token has been copied to clipboard!</p>
    <div style="display: flex; gap: 10px;">
      <button id="send-to-manager" style="
        background: white;
        color: #5865F2;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
      ">Send to Bot Manager</button>
      <button id="close-helper" style="
        background: transparent;
        color: white;
        border: 1px solid white;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
      ">Close</button>
    </div>
  `;
  
  document.body.appendChild(div);
  
  // Button handlers
  document.getElementById('close-helper').onclick = () => div.remove();
  
  document.getElementById('send-to-manager').onclick = async () => {
    const button = document.getElementById('send-to-manager');
    button.textContent = 'Sending...';
    button.disabled = true;
    
    try {
      const authToken = prompt('Enter your Bot Manager password:');
      if (!authToken) {
        button.textContent = 'Cancelled';
        return;
      }
      
      // First authenticate
      const authResponse = await fetch(`http://localhost:3001/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: authToken })
      });
      
      if (!authResponse.ok) {
        throw new Error('Invalid password');
      }
      
      const { token: sessionToken } = await authResponse.json();
      
      // Then submit token
      const response = await fetch(SERVER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ 
          token: token,
          username: document.querySelector('[class*="username-"]')?.textContent || 'Unknown User'
        })
      });
      
      if (response.ok) {
        button.textContent = '✓ Sent!';
        setTimeout(() => div.remove(), 2000);
      } else {
        throw new Error('Failed to send');
      }
    } catch (error) {
      button.textContent = '✗ Error';
      console.error('Failed to send token:', error);
    }
  };
})();