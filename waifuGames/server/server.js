const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const MudaeBot = require('./bot');
const persistence = require('./persistence');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Store bot instances
const botInstances = new Map();

// Load saved instances on startup
async function loadSavedInstances() {
  const savedInstances = await persistence.loadInstances();
  for (const [id, instanceData] of Object.entries(savedInstances)) {
    try {
      const bot = new MudaeBot(instanceData.token, instanceData.channelId, instanceData.loggingEnabled);
      
      // Restore session stats
      if (instanceData.sessionStats) {
        bot.sessionStats = instanceData.sessionStats;
      }
      
      bot.on('log', (logEntry) => {
        io.emit(`logs-${id}`, logEntry);
      });
      
      bot.on('statsUpdate', async (stats) => {
        io.emit(`stats-${id}`, stats);
        // Save updated stats
        await persistence.saveInstance(id, {
          token: instanceData.token,
          channelId: instanceData.channelId,
          loggingEnabled: instanceData.loggingEnabled,
          sessionStats: stats,
          userInfo: bot.userInfo
        });
      });
      
      bot.on('userInfoUpdate', async (userInfo) => {
        io.emit(`userInfo-${id}`, userInfo);
        // Save updated user info
        await persistence.saveInstance(id, {
          token: instanceData.token,
          channelId: instanceData.channelId,
          loggingEnabled: instanceData.loggingEnabled,
          sessionStats: bot.sessionStats,
          userInfo: userInfo
        });
      });
      
      botInstances.set(id, bot);
      
      // Auto-start if it was running
      if (instanceData.isRunning) {
        bot.start();
      }
      
      console.log(`Loaded saved instance: ${id}`);
    } catch (error) {
      console.error(`Failed to load instance ${id}:`, error);
    }
  }
}

// Initialize saved instances
loadSavedInstances().catch(error => {
  console.error('Failed to load saved instances:', error);
});

// API Routes
app.get('/api/instances', async (req, res) => {
  const instances = [];
  
  for (const [id, bot] of botInstances) {
    const savedInstance = await persistence.getInstance(id);
    instances.push({
      id,
      token: savedInstance?.token || '',
      channelId: savedInstance?.channelId || '',
      loggingEnabled: savedInstance?.loggingEnabled || false,
      isRunning: bot.isRunning,
      isPaused: bot.isPaused,
      stats: bot.sessionStats,
      userInfo: bot.userInfo,
      avatarUrl: bot.getUserAvatarUrl()
    });
  }
  
  res.json({ instances });
});

app.post('/api/instances', async (req, res) => {
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
        token,
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
    
    botInstances.set(id, bot);
    bot.start();
    
    // Save instance to persistence
    await persistence.saveInstance(id, {
      token,
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

app.post('/api/instances/:id/pause', async (req, res) => {
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

app.post('/api/instances/:id/resume', async (req, res) => {
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

app.post('/api/instances/:id/terminate', async (req, res) => {
  const { id } = req.params;
  const bot = botInstances.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  bot.stop();
  
  // Update persistence
  const instance = await persistence.getInstance(id);
  if (instance) {
    await persistence.saveInstance(id, {
      ...instance,
      isRunning: false,
      isPaused: false
    });
  }
  
  res.json({ success: true, message: 'Bot terminated' });
});

app.delete('/api/instances/:id', async (req, res) => {
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

app.get('/api/instances/:id/logs', (req, res) => {
  const { id } = req.params;
  const bot = botInstances.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  res.json({ logs: bot.getLogs() });
});

app.post('/api/instances/:id/logs/clear', (req, res) => {
  const { id } = req.params;
  const bot = botInstances.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  bot.clearLogs();
  res.json({ success: true, message: 'Logs cleared' });
});

app.get('/api/instances/:id/stats', (req, res) => {
  const { id } = req.params;
  const bot = botInstances.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  res.json({ stats: bot.sessionStats });
});

app.post('/api/instances/:id/message', async (req, res) => {
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});