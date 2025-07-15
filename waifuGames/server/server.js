const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const MudaeBot = require('./bot');
const persistence = require('./persistence');
const encryption = require('./encryption');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://10.203.164.7:5173", "http://192.168.1.*:5173"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// Authentication
const AUTH_PASSWORD = 'BadApple!';
const authenticatedSessions = new Map();

// Generate session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}


// Authentication endpoint
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  
  if (password === AUTH_PASSWORD) {
    const token = generateSessionToken();
    const sessionData = {
      authenticated: true,
      timestamp: Date.now()
    };
    authenticatedSessions.set(token, sessionData);
    
    // Clean up old sessions (older than 24 hours)
    for (const [sessionToken, data] of authenticatedSessions) {
      if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
        authenticatedSessions.delete(sessionToken);
      }
    }
    
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Authentication middleware
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !authenticatedSessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Update session timestamp
  const session = authenticatedSessions.get(token);
  session.timestamp = Date.now();
  
  next();
}


// Store bot instances
const botInstances = new Map();

// Load saved instances on startup
async function loadSavedInstances() {
  try {
    const savedInstances = await persistence.loadInstances();
    const instanceEntries = Object.entries(savedInstances);
    
    console.log(`Found ${instanceEntries.length} saved instances to load`);
    
    // Load instances sequentially to avoid race conditions
    let successCount = 0;
    let failureCount = 0;
    
    for (const [id, instanceData] of instanceEntries) {
      // Skip instances that weren't running
      if (!instanceData.isRunning) {
        console.log(`Skipping instance ${id} - was not running`);
        await persistence.removeInstance(id);
        continue;
      }
      
      try {
        console.log(`Loading instance ${id} (${instanceData.userInfo?.username || 'Unknown'})`);
        
        // Decrypt token with error handling
        let decryptedToken;
        try {
          decryptedToken = await encryption.decrypt(instanceData.token);
          if (!decryptedToken || decryptedToken === instanceData.token) {
            throw new Error('Token decryption failed or returned encrypted token');
          }
        } catch (decryptError) {
          console.error(`Failed to decrypt token for instance ${id}:`, decryptError.message);
          console.log(`Removing instance ${id} due to decryption failure`);
          await persistence.removeInstance(id);
          failureCount++;
          continue;
        }
        
        // Create bot instance
        const bot = new MudaeBot(decryptedToken, instanceData.channelId, instanceData.loggingEnabled);
        
        // Restore session stats
        if (instanceData.sessionStats) {
          bot.sessionStats = instanceData.sessionStats;
        }
        
        // Restore rolls per hour
        if (instanceData.rollsPerHour !== undefined) {
          bot.rollsPerHour = instanceData.rollsPerHour;
          bot.MAX_ROLLS = Math.max(1, Math.floor(instanceData.rollsPerHour));
        }
        
        // Restore user info if available
        if (instanceData.userInfo) {
          bot.userInfo = instanceData.userInfo;
        }
        
        // Set up event handlers
        bot.on('log', (logEntry) => {
          io.emit(`logs-${id}`, logEntry);
        });
        
        bot.on('statsUpdate', async (stats) => {
          io.emit(`stats-${id}`, stats);
          // Save updated stats
          try {
            await persistence.saveInstance(id, {
              token: instanceData.token, // Already encrypted in storage
              channelId: instanceData.channelId,
              loggingEnabled: instanceData.loggingEnabled,
              sessionStats: stats,
              userInfo: bot.userInfo,
              rollsPerHour: bot.rollsPerHour,
              isRunning: bot.isRunning,
              isPaused: bot.isPaused
            });
          } catch (saveError) {
            console.error(`Failed to save stats for instance ${id}:`, saveError);
          }
        });
        
        bot.on('userInfoUpdate', async (userInfo) => {
          io.emit(`userInfo-${id}`, userInfo);
          io.emit(`avatarUrl-${id}`, bot.getUserAvatarUrl());
          // Save updated user info
          try {
            await persistence.saveInstance(id, {
              token: instanceData.token,
              channelId: instanceData.channelId,
              loggingEnabled: instanceData.loggingEnabled,
              sessionStats: bot.sessionStats,
              userInfo: userInfo,
              rollsPerHour: bot.rollsPerHour,
              isRunning: bot.isRunning,
              isPaused: bot.isPaused
            });
          } catch (saveError) {
            console.error(`Failed to save user info for instance ${id}:`, saveError);
          }
        });
        
        // Handle token invalidation
        // TEMPORARILY COMMENTED OUT
        /*
        bot.on('tokenInvalid', (info) => {
          handleTokenInvalid(bot, id, info);
        });
        */
        
        // Add to bot instances before starting
        botInstances.set(id, bot);
        
        // Start the bot with retry logic
        if (instanceData.isRunning) {
          try {
            await bot.start();
            console.log(`✓ Successfully loaded and started instance ${id} (${bot.userInfo?.username || 'Unknown'})`);
            successCount++;
            
            // Add delay between bot starts to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
            
          } catch (startError) {
            console.error(`Failed to start instance ${id}:`, startError.message);
            
            // If start fails, try one more time after a delay
            console.log(`Retrying start for instance ${id} in 5 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            try {
              await bot.start();
              console.log(`✓ Successfully started instance ${id} on retry`);
              successCount++;
            } catch (retryError) {
              console.error(`Failed to start instance ${id} on retry:`, retryError.message);
              // Remove failed instance
              botInstances.delete(id);
              await persistence.removeInstance(id);
              failureCount++;
            }
          }
        } else {
          console.log(`✓ Loaded instance ${id} (not auto-started)`);
          successCount++;
        }
        
      } catch (error) {
        console.error(`Failed to load instance ${id}:`, error.message);
        failureCount++;
        
        // Clean up any partial state
        if (botInstances.has(id)) {
          const bot = botInstances.get(id);
          if (bot) {
            bot.stop();
          }
          botInstances.delete(id);
        }
      }
    }
    
    console.log(`Instance loading complete: ${successCount} successful, ${failureCount} failed`);
    console.log(`Currently running ${botInstances.size} bot instances`);
    
  } catch (error) {
    console.error('Critical error loading saved instances:', error);
  }
}

// Initialize saved instances
loadSavedInstances().catch(error => {
  console.error('Failed to load saved instances:', error);
});

// API Routes
app.get('/api/instances', requireAuth, async (req, res) => {
  const instances = [];
  
  // Only return instances that are in botInstances (active instances)
  for (const [id, bot] of botInstances) {
    const savedInstance = await persistence.getInstance(id);
    // Skip if no saved data (shouldn't happen but safety check)
    if (!savedInstance) continue;
    
    instances.push({
      id,
      token: savedInstance.token || '',
      channelId: savedInstance.channelId || '',
      loggingEnabled: savedInstance.loggingEnabled || false,
      isRunning: bot.isRunning,
      isPaused: bot.isPaused,
      stats: bot.sessionStats,
      userInfo: bot.userInfo,
      avatarUrl: bot.getUserAvatarUrl(),
      rollsPerHour: bot.rollsPerHour
    });
  }
  
  res.json({ instances });
});

app.post('/api/instances', requireAuth, async (req, res) => {
  const { id, token, channelId, loggingEnabled } = req.body;
  
  if (!id || !token || !channelId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (botInstances.has(id)) {
    return res.status(409).json({ error: 'Instance already exists' });
  }
  
  try {
    const bot = new MudaeBot(token, channelId, loggingEnabled);
    
    // Set up log streaming
    bot.on('log', (logEntry) => {
      io.emit(`logs-${id}`, logEntry);
    });
    
    // Set up stats streaming
    bot.on('statsUpdate', async (stats) => {
      io.emit(`stats-${id}`, stats);
      // Save updated stats
      await persistence.saveInstance(id, {
        token: await encryption.encrypt(token),
        channelId,
        loggingEnabled,
        sessionStats: stats,
        userInfo: bot.userInfo,
        isRunning: true
      });
    });
    
    // Set up user info streaming
    bot.on('userInfoUpdate', async (userInfo) => {
      io.emit(`userInfo-${id}`, userInfo);
      // Update saved instance
      const instance = await persistence.getInstance(id);
      if (instance) {
        await persistence.saveInstance(id, {
          ...instance,
          userInfo: userInfo
        });
      }
    });
    
    // Handle token invalidation
    // TEMPORARILY COMMENTED OUT
    /*
    bot.on('tokenInvalid', (info) => {
      handleTokenInvalid(bot, id, info);
    });
    */
    
    
    botInstances.set(id, bot);
    bot.start();
    
    // Save instance to persistence with encrypted token
    await persistence.saveInstance(id, {
      token: await encryption.encrypt(token),
      channelId,
      loggingEnabled,
      isRunning: true,
      sessionStats: bot.sessionStats
    });
    
    res.json({ 
      success: true, 
      message: 'Bot instance created and started',
      logs: bot.getLogs(),
      stats: bot.sessionStats,
      userInfo: bot.userInfo,
      avatarUrl: bot.getUserAvatarUrl()
    });
    
    // Notify all connected clients about the new instance
    io.emit('instance-created', {
      id,
      token,
      channelId,
      loggingEnabled,
      isRunning: true,
      isPaused: false,
      stats: bot.sessionStats,
      userInfo: bot.userInfo,
      avatarUrl: bot.getUserAvatarUrl()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/instances/:id/pause', requireAuth, async (req, res) => {
  const { id } = req.params;
  const bot = botInstances.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  bot.pause();
  
  // Update persistence
  const instance = await persistence.getInstance(id);
  if (instance) {
    await persistence.saveInstance(id, {
      ...instance,
      isRunning: true,
      isPaused: true
    });
  }
  
  res.json({ success: true, message: 'Bot paused' });
});

app.post('/api/instances/:id/resume', requireAuth, async (req, res) => {
  const { id } = req.params;
  const bot = botInstances.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  bot.resume();
  
  // Update persistence
  const instance = await persistence.getInstance(id);
  if (instance) {
    await persistence.saveInstance(id, {
      ...instance,
      isRunning: true,
      isPaused: false
    });
  }
  
  res.json({ success: true, message: 'Bot resumed' });
});

app.post('/api/instances/:id/reset', requireAuth, async (req, res) => {
  const { id } = req.params;
  const bot = botInstances.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  // Reset the bot
  bot.resetSession();
  
  // Update persistence
  const instance = await persistence.getInstance(id);
  if (instance) {
    await persistence.saveInstance(id, {
      ...instance,
      sessionStats: bot.sessionStats
    });
  }
  
  res.json({ 
    success: true, 
    message: 'Instance reset successfully',
    stats: bot.sessionStats 
  });
  
  // Notify clients of the reset
  io.emit(`stats-${id}`, bot.sessionStats);
});

app.post('/api/instances/:id/startrolling', requireAuth, async (req, res) => {
  const { id } = req.params;
  const bot = botInstances.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  try {
    await bot.manualRoll();
    res.json({ 
      success: true, 
      message: 'Roll sent successfully!',
      stats: bot.sessionStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to roll' });
  }
});

app.post('/api/instances/:id/terminate', requireAuth, async (req, res) => {
  const { id } = req.params;
  const bot = botInstances.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  bot.stop();
  botInstances.delete(id); // Remove from active instances
  
  // Remove from persistence since it's terminated
  await persistence.removeInstance(id);
  
  res.json({ success: true, message: 'Bot terminated' });
  
  // Notify all connected clients
  io.emit('instance-deleted', { id });
});

app.delete('/api/instances/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const bot = botInstances.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  bot.stop();
  botInstances.delete(id);
  
  // Remove from persistence
  await persistence.removeInstance(id);
  
  res.json({ success: true, message: 'Bot instance deleted' });
  
  // Notify all connected clients
  io.emit('instance-deleted', { id });
});

app.get('/api/instances/:id/logs', requireAuth, (req, res) => {
  const { id } = req.params;
  const bot = botInstances.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  res.json({ logs: bot.getLogs() });
});

app.post('/api/instances/:id/logs/clear', requireAuth, (req, res) => {
  const { id } = req.params;
  const bot = botInstances.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  bot.clearLogs();
  res.json({ success: true, message: 'Logs cleared' });
});

app.get('/api/instances/:id/stats', requireAuth, (req, res) => {
  const { id } = req.params;
  const bot = botInstances.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  res.json({ stats: bot.sessionStats });
});

app.post('/api/instances/:id/message', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  const bot = botInstances.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  if (!message || message.trim() === '') {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }
  
  try {
    await bot.sendMessage(message);
    res.json({ success: true, message: 'Message sent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.post('/api/instances/:id/logging', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;
    const bot = botInstances.get(id);
    
    if (!bot) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    bot.loggingEnabled = enabled;
    
    // Update persistence
    const instance = await persistence.getInstance(id);
    if (instance) {
      await persistence.saveInstance(id, {
        ...instance,
        loggingEnabled: enabled
      });
    }
    
    res.json({ success: true, loggingEnabled: enabled });
  } catch (error) {
    console.error('Error updating logging:', error);
    res.status(500).json({ error: 'Failed to update logging: ' + error.message });
  }
});

app.post('/api/instances/:id/rollsPerHour', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { rollsPerHour } = req.body;
    const bot = botInstances.get(id);
    
    if (!bot) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    bot.setRollsPerHour(rollsPerHour);
    
    // Update persistence
    const instance = await persistence.getInstance(id);
    if (instance) {
      await persistence.saveInstance(id, {
        ...instance,
        rollsPerHour: bot.rollsPerHour
      });
    }
    
    res.json({ success: true, rollsPerHour: bot.rollsPerHour });
  } catch (error) {
    console.error('Error updating rolls per hour:', error);
    res.status(500).json({ error: 'Failed to update rolls per hour: ' + error.message });
  }
});

// Backup/Restore endpoints
app.get('/api/backup', requireAuth, async (req, res) => {
  try {
    const backup = {
      timestamp: new Date().toISOString(),
      instances: {}
    };
    
    // Get all saved instances
    const savedInstances = await persistence.loadInstances();
    
    // Include current runtime info
    for (const [id, data] of Object.entries(savedInstances)) {
      const bot = botInstances.get(id);
      backup.instances[id] = {
        ...data,
        isRunning: bot?.isRunning || false,
        isPaused: bot?.isPaused || false,
        stats: bot?.sessionStats || data.sessionStats
      };
    }
    
    res.json(backup);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

app.post('/api/restore', requireAuth, async (req, res) => {
  try {
    const { instances } = req.body;
    
    if (!instances || typeof instances !== 'object') {
      return res.status(400).json({ error: 'Invalid backup data' });
    }
    
    // Stop all current instances
    for (const [id, bot] of botInstances) {
      bot.stop();
    }
    botInstances.clear();
    
    // Restore instances
    for (const [id, instanceData] of Object.entries(instances)) {
      await persistence.saveInstance(id, instanceData);
      
      if (instanceData.isRunning) {
        try {
          const decryptedToken = await encryption.decrypt(instanceData.token);
          const bot = new MudaeBot(decryptedToken, instanceData.channelId, instanceData.loggingEnabled);
          
          // Set up event handlers
          bot.on('log', (logEntry) => {
            io.emit(`logs-${id}`, logEntry);
          });
          
          bot.on('statsUpdate', async (stats) => {
            io.emit(`stats-${id}`, stats);
            await persistence.saveInstance(id, {
              ...instanceData,
              sessionStats: stats
            });
          });
          
          bot.on('userInfoUpdate', async (userInfo) => {
            io.emit(`userInfo-${id}`, userInfo);
            await persistence.saveInstance(id, {
              ...instanceData,
              userInfo
            });
          });
          
          // TEMPORARILY COMMENTED OUT
          /*
          bot.on('tokenInvalid', (info) => {
            handleTokenInvalid(bot, id, info);
          });
          */
          
          botInstances.set(id, bot);
          bot.start();
        } catch (error) {
          console.error(`Failed to restore instance ${id}:`, error);
        }
      }
    }
    
    res.json({ success: true, message: 'Backup restored successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

// Health check endpoint to verify all bot tokens
// TEMPORARILY COMMENTED OUT
/*
app.get('/api/health/tokens', requireAuth, async (req, res) => {
  const results = [];
  
  for (const [id, bot] of botInstances) {
    try {
      const isValid = await bot.verifyToken();
      results.push({
        id,
        username: bot.userInfo?.username,
        isValid,
        lastHealthCheck: new Date(bot.lastHealthCheck).toISOString(),
        timeSinceLastCheck: Math.round((Date.now() - bot.lastHealthCheck) / 1000),
        isRunning: bot.isRunning,
        isPaused: bot.isPaused
      });
    } catch (error) {
      results.push({
        id,
        username: bot.userInfo?.username,
        isValid: false,
        error: error.message,
        isRunning: bot.isRunning,
        isPaused: bot.isPaused
      });
    }
  }
  
  res.json({ 
    totalInstances: botInstances.size,
    checkedAt: new Date().toISOString(),
    results 
  });
});
*/

// Avatar proxy endpoint to handle CORS

app.get('/api/avatar/:userId/:avatarHash', requireAuth, async (req, res) => {
  const { userId, avatarHash } = req.params;
  const format = avatarHash.startsWith('a_') ? 'gif' : 'png';
  const avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${format}?size=128`;
  
  try {
    const response = await fetch(avatarUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch avatar');
    }
    
    const buffer = await response.arrayBuffer();
    res.set('Content-Type', `image/${format}`);
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.send(Buffer.from(buffer));
  } catch (error) {
    // Send default avatar
    res.redirect(`https://cdn.discordapp.com/embed/avatars/0.png`);
  }
});

// WebSocket authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token || !authenticatedSessions.has(token)) {
    return next(new Error('Unauthorized'));
  }
  
  next();
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('Client connected');
  
  socket.on('subscribe-logs', (instanceId) => {
    socket.join(`logs-${instanceId}`);
  });
  
  socket.on('unsubscribe-logs', (instanceId) => {
    socket.leave(`logs-${instanceId}`);
  });
  
  socket.on('subscribe-stats', (instanceId) => {
    socket.join(`stats-${instanceId}`);
    // Send current stats immediately
    const bot = botInstances.get(instanceId);
    if (bot) {
      socket.emit(`stats-${instanceId}`, bot.sessionStats);
    }
  });
  
  socket.on('unsubscribe-stats', (instanceId) => {
    socket.leave(`stats-${instanceId}`);
  });
  
  socket.on('subscribe-userInfo', (instanceId) => {
    socket.join(`userInfo-${instanceId}`);
    // Send current user info immediately
    const bot = botInstances.get(instanceId);
    if (bot && bot.userInfo) {
      socket.emit(`userInfo-${instanceId}`, bot.userInfo);
    }
  });
  
  socket.on('unsubscribe-userInfo', (instanceId) => {
    socket.leave(`userInfo-${instanceId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Auto-recovery system with improved health monitoring
// TEMPORARILY COMMENTED OUT
/*
setInterval(async () => {
  for (const [id, bot] of botInstances) {
    if (bot.isRunning && !bot.isPaused) {
      const timeSinceLastCheck = Date.now() - bot.lastHealthCheck;
      
      // If no activity for 5 minutes, consider it potentially unresponsive
      if (timeSinceLastCheck > 5 * 60 * 1000) {
        console.log(`Instance ${id} (${bot.userInfo?.username}) has not logged activity for ${Math.round(timeSinceLastCheck / 60000)} minutes`);
        
        // First, try to verify if the token is still valid
        try {
          const tokenValid = await bot.verifyToken();
          if (!tokenValid) {
            console.error(`Instance ${id} has invalid token, removing from active instances`);
            bot.stop();
            botInstances.delete(id);
            
            // Update persistence to mark as not running
            const instance = await persistence.getInstance(id);
            if (instance) {
              await persistence.saveInstance(id, {
                ...instance,
                isRunning: false,
                stoppedReason: 'Invalid token'
              });
            }
            
            io.emit('instance-failed', { 
              id, 
              reason: 'Token invalid',
              username: bot.userInfo?.username 
            });
            continue;
          }
          
          // Token is valid, bot might just be idle
          console.log(`Instance ${id} token verified, bot is idle but healthy`);
          
        } catch (error) {
          console.error(`Instance ${id} health check failed:`, error.message);
          bot.failureCount++;
          
          if (bot.failureCount <= bot.maxFailures) {
            console.log(`Instance ${id} appears unresponsive, attempting recovery (attempt ${bot.failureCount}/${bot.maxFailures})...`);
            
            // Stop the bot
            bot.stop();
            
            // Wait a bit then restart
            setTimeout(async () => {
              try {
                await bot.start();
                console.log(`Instance ${id} successfully restarted`);
                bot.failureCount = 0; // Reset failure count on successful restart
              } catch (restartError) {
                console.error(`Instance ${id} failed to restart:`, restartError.message);
              }
            }, 3000);
            
          } else {
            console.error(`Instance ${id} exceeded max failure count (${bot.maxFailures}), stopping permanently`);
            bot.stop();
            botInstances.delete(id);
            
            // Update persistence
            const instance = await persistence.getInstance(id);
            if (instance) {
              await persistence.saveInstance(id, {
                ...instance,
                isRunning: false,
                stoppedReason: 'Exceeded max failures'
              });
            }
            
            io.emit('instance-failed', { 
              id, 
              reason: 'Exceeded maximum failure count',
              username: bot.userInfo?.username 
            });
          }
        }
      }
    }
  }
}, 60000); // Check every minute
*/

// Handle token invalid events from bots
// TEMPORARILY COMMENTED OUT
/*
const handleTokenInvalid = async function(bot, id, info) {
  console.error(`Token invalid for instance ${id} (${info.username})`);
  
  // Remove from active instances
  botInstances.delete(id);
  
  // Update persistence
  const instance = await persistence.getInstance(id);
  if (instance) {
    await persistence.saveInstance(id, {
      ...instance,
      isRunning: false,
      stoppedReason: 'Token invalid',
      tokenInvalidatedAt: new Date().toISOString()
    });
  }
  
  // Notify connected clients
  io.emit('instance-failed', {
    id,
    reason: 'Token invalid',
    username: info.username
  });
};
*/

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});