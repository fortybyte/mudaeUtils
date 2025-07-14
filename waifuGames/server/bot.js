const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class MudaeBot extends EventEmitter {
  constructor(token, channelId, loggingEnabled = true) {
    super();
    
    // Core configuration
    this.token = token;
    this.channelId = channelId;
    this.loggingEnabled = loggingEnabled;
    
    // Bot state
    this.isRunning = false;
    this.isPaused = false;
    this.logs = [];
    this.isMonitoring = false;
    
    // Constants from old bot
    this.MUDAE_ID = "432610292342587392";
    this.CLAIM_STRING_CHECK = "React with any emoji to claim!";
    this.AUTO_REACTION_EMOJI = "👍";
    
    // Roll management from old bot
    this.MAX_ROLLS = 10;
    this.remainingRolls = this.MAX_ROLLS;
    this.rollsPerHour = 10; // Default, can be configured
    this.autoResetMinute = null; // Auto-detected minute for Mudae reset
    this.nextRollTime = Date.now();
    
    // Session statistics
    this.sessionStats = {
      totalRolls: 0,
      claimedCharacters: [],
      sessionStartTime: null
    };
    
    // User info
    this.userInfo = {
      id: null,
      username: null,
      discriminator: null,
      avatar: null
    };
    
    // Character triggers
    this.characterTriggers = [];
    
    // Daily commands
    this.dailyCommands = ['$dk', '$daily'];
    this.lastDailyExecution = null;
    
    // Tracking for message polling
    this.lastMessageId = null;
    
    // Health check for auto-recovery
    this.lastHealthCheck = Date.now();
    this.failureCount = 0;
    this.maxFailures = 3;
    
    // Load character list
    this.loadCharacters();
  }

  // Logging system
  log(level, ...args) {
    const timestamp = new Date().toISOString();
    const botName = this.userInfo?.username || 'Bot';
    const message = `[${botName}] ${args.join(' ')}`;
    const logEntry = { timestamp, level, message };
    
    this.logs.push(logEntry);
    if (this.logs.length > 1000) {
      this.logs.shift(); // Keep only last 1000 logs
    }
    
    if (this.loggingEnabled || level === 'error') {
      console.log(`[${timestamp}] [${level.toUpperCase()}]`, message);
      this.emit('log', logEntry);
    }
    
    // Update health check on any log
    this.lastHealthCheck = Date.now();
  }

  // Load character triggers from chars.json
  async loadCharacters() {
    try {
      const charFile = path.join(__dirname, 'chars.json');
      
      try {
        const data = await fs.readFile(charFile, 'utf-8');
        this.characterTriggers = JSON.parse(data);
        this.log('info', `Loaded ${this.characterTriggers.length} character triggers`);
      } catch (err) {
        this.log('warn', 'chars.json not found, using empty trigger list');
        this.characterTriggers = [];
      }
    } catch (err) {
      this.log('error', 'Failed to load characters:', err.message);
    }
  }

  // Parse Mudae uptime response (from old bot)
  parseMudaeUptime(text) {
    const pattern = /You have \*\*(\d+)\*\* rolls left\. Next rolls reset in \*\*(\d+)\*\* min\./;
    const match = text.match(pattern);
    if (!match) return 0;
    const timeLeft = parseInt(match[2], 10);
    return timeLeft;
  }

  // Parse Mudae rolls (from old bot)
  parseMudaeRolls(text) {
    const pattern = /You have \*\*(\d+)\*\* rolls left\. Next rolls reset in \*\*(\d+)\*\* min\./;
    const match = text.match(pattern);
    if (!match) return 0;
    const rolls = parseInt(match[1], 10);
    return rolls;
  }

  // Calculate time until reset minute (from old bot)
  timeUntilResetMinute(minute) {
    if (minute == null) {
      minute = 36; // fallback
      this.log('debug', 'autoResetMinute not set yet; using fallback=36');
    }
    const now = new Date();
    const target = new Date();
    target.setMinutes(minute, 0, 0); // e.g. XX:36:00
    if (target.getTime() <= now.getTime()) {
      target.setHours(target.getHours() + 1);
    }
    return target.getTime() - now.getTime();
  }

  // Get random minutes in ms (from old bot)
  getRandomMinutesInMs() {
    const rand = Math.floor(Math.random() * 55) + 1; // 1..55
    return rand * 60 * 1000; // convert to ms
  }

  // Reset remaining rolls and schedule next roll (from old bot)
  resetRemainingRolls() {
    this.remainingRolls = this.MAX_ROLLS;
    
    // Time until official Mudae reset
    const timeTil = this.timeUntilResetMinute(this.autoResetMinute);
    
    const randMs = this.getRandomMinutesInMs();
    this.nextRollTime = Date.now() + randMs + timeTil;
    
    this.log('info', 
      `Reset rolls. Next roll in ~${Math.round((this.nextRollTime - Date.now()) / 60000)} min,`,
      `(random + timeTilReset(${this.autoResetMinute}))`
    );
  }

  // Check roll uptime (from old bot)
  async checkRollUptime() {
    // Send $ru to see how many rolls/time left
    const msgData = await this.sendMessage('$ru');
    if (!msgData) {
      this.log('error', 'checkRollUptime: $ru message send failed.');
      return [0, 0];
    }
    
    // Wait for Mudae to respond
    await this.wait(2500);
    
    // Fetch the latest messages
    const messages = await this.fetchRecentMessages(5);
    if (!messages) return [0, 0];
    
    for (const msg of messages) {
      if (msg.author?.id !== this.MUDAE_ID) {
        continue;
      }
      const timeLeft = this.parseMudaeUptime(msg.content);
      const rolls = this.parseMudaeRolls(msg.content);
      if (timeLeft > 0 || rolls > 0) {
        return [timeLeft, rolls];
      }
    }
    return [0, 0];
  }

  // Start the bot
  async start() {
    if (this.isRunning) {
      this.log('warn', 'Bot is already running');
      return;
    }
    
    this.isRunning = true;
    this.isPaused = false;
    this.isMonitoring = true;
    this.sessionStats.sessionStartTime = Date.now();
    
    this.log('info', `Bot started for channel ${this.channelId}`);
    
    // Fetch user info
    await this.fetchUserInfo();
    
    // Auto-detect the next reset minute from $ru (from old bot)
    const [timeLeft, rolls] = await this.checkRollUptime();
    const nowMin = new Date().getMinutes();
    
    this.autoResetMinute = (nowMin + timeLeft) % 60;
    this.remainingRolls = rolls;
    
    this.log('info', `autoResetMinute = ${this.autoResetMinute}, timeLeft = ${timeLeft} min, remainingRolls = ${rolls}`);
    
    if (timeLeft <= 0) {
      this.autoResetMinute = (nowMin + 36) % 60; // fallback
      this.log('info', `No timeLeft found; using fallback minute: ${this.autoResetMinute}`);
    }
    
    if (rolls <= 0) {
      this.resetRemainingRolls();
    } else {
      // If we still have rolls, schedule to use them
      this.nextRollTime = Date.now() + 10000; // in 10s we can do a roll
    }
    
    // Run daily commands
    await this.runDailyCommands();
    this.lastDailyExecution = Date.now();
    
    // Start monitoring loop
    this.monitorLoop();
    
    this.log('info', 'Bot initialization complete');
  }

  // Main monitoring loop (from old bot)
  async monitorLoop() {
    while (this.isRunning && this.isMonitoring) {
      if (this.isPaused) {
        await this.wait(1000);
        continue;
      }
      
      try {
        const now = Date.now();
        const shouldRoll = now >= this.nextRollTime;
        
        // If time to roll & we have rolls left
        if (shouldRoll && this.remainingRolls > 0) {
          await this.sendMessage('$wa');
          this.remainingRolls--;
          this.sessionStats.totalRolls++;
          this.emit('statsUpdate', this.sessionStats);
          this.log('info', `Used a roll! remainingRolls=${this.remainingRolls}`);
        }
        
        // If out of rolls, schedule next reset
        if (this.remainingRolls === 0) {
          this.resetRemainingRolls();
        }
        
        // Fetch last ~5 new messages
        const messages = await this.fetchRecentMessages(5);
        if (messages && messages.length > 0) {
          for (const msg of messages) {
            // Skip if we already processed
            if (this.lastMessageId && BigInt(msg.id) <= BigInt(this.lastMessageId)) {
              continue;
            }
            
            // Check for claimable characters
            if (this.containsTriggerKeyword(msg)) {
              this.log('info', `Found a trigger in message ${msg.id}`);
              await this.addReaction(msg.id, this.AUTO_REACTION_EMOJI);
              
              // Extract and track claimed character
              const character = this.extractCharacterName(msg);
              if (character && !this.sessionStats.claimedCharacters.includes(character)) {
                this.sessionStats.claimedCharacters.push(character);
                this.emit('statsUpdate', this.sessionStats);
              }
            }
            
            // Update last processed
            if (!this.lastMessageId || BigInt(msg.id) > BigInt(this.lastMessageId)) {
              this.lastMessageId = msg.id;
            }
          }
        }
        
        // Check if we should run daily commands
        if (this.shouldRunDailyCommands(now)) {
          await this.runDailyCommands();
          this.lastDailyExecution = now;
        }
        
        // Small delay between iterations
        await this.wait(this.remainingRolls > 0 ? 2500 : 5000);
        
      } catch (error) {
        this.log('error', 'Error in monitor loop:', error.message);
        await this.wait(15000);
      }
    }
  }

  // Check if message contains trigger keyword (from old bot)
  containsTriggerKeyword(message) {
    if (!message || !Array.isArray(message.embeds) || message.embeds.length === 0) {
      return false;
    }
    
    // Check if message is from Mudae
    if (message.author?.id !== this.MUDAE_ID) {
      return false;
    }
    
    // Check embed for claim string and character
    for (const embed of message.embeds) {
      // Check if it's a claimable message
      if (embed.description && embed.description.includes(this.CLAIM_STRING_CHECK)) {
        // Check the embed author name for any of the characterTriggers
        const authorName = embed.author?.name;
        if (authorName) {
          const normalizedAuthor = authorName.toLowerCase();
          for (const keyword of this.characterTriggers) {
            if (normalizedAuthor === keyword.toLowerCase()) {
              this.log('info', `Matched keyword: "${keyword}" in author: "${authorName}"`);
              return true;
            }
          }
        }
      }
    }
    
    return false;
  }

  // Extract character name from Mudae message
  extractCharacterName(message) {
    if (!message.embeds || message.embeds.length === 0) return null;
    
    for (const embed of message.embeds) {
      // Check if it's a claimable character
      if (embed.description && embed.description.includes(this.CLAIM_STRING_CHECK)) {
        return embed.author?.name || null;
      }
    }
    
    return null;
  }

  // Check if we should run daily commands
  shouldRunDailyCommands(now) {
    if (!this.lastDailyExecution) return true;
    
    const timeSinceLastDaily = now - this.lastDailyExecution;
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    return timeSinceLastDaily >= twentyFourHours;
  }

  // Run daily commands
  async runDailyCommands() {
    this.log('info', 'Running daily commands');
    
    for (const cmd of this.dailyCommands) {
      await this.sendMessage(cmd);
      await this.wait(3000); // Wait between commands
    }
  }

  // Send a message to Discord
  async sendMessage(content) {
    const url = `https://discord.com/api/v9/channels/${this.channelId}/messages`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          this.log('error', '401 Unauthorized sending message. Check your token.');
        }
        throw new Error(`Failed to send message: ${response.status}`);
      }
      
      const data = await response.json();
      this.log('debug', `Message sent: ${content}`);
      return data;
      
    } catch (error) {
      this.log('error', 'Error sending message:', error.message);
      throw error;
    }
  }

  // Add reaction to a message
  async addReaction(messageId, emoji) {
    const url = `https://discord.com/api/v9/channels/${this.channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`;
    
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': this.token,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        this.log('info', `Reacted with ${emoji} to message ${messageId}`);
      } else if (response.status === 401) {
        this.log('error', '401 Unauthorized adding reaction. Check your token!');
      } else {
        const errText = await response.text();
        this.log('error', 'Failed to add reaction:', errText);
      }
    } catch (error) {
      this.log('error', 'Error adding reaction:', error.message);
    }
  }

  // Fetch recent messages from channel
  async fetchRecentMessages(limit = 10) {
    let url = `https://discord.com/api/v9/channels/${this.channelId}/messages?limit=${limit}`;
    if (this.lastMessageId) {
      url += `&after=${this.lastMessageId}`;
    }
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': this.token,
          'Content-Type': 'application/json'
        }
      });
      
      // Handle rate limit
      if (response.status === 429) {
        const json = await response.json();
        const retryAfter = json.retry_after || 15;
        this.log('warn', `Rate-limited. Retrying in ${retryAfter} sec.`);
        await this.wait(retryAfter * 1000);
        return this.fetchRecentMessages(limit);
      }
      
      if (!response.ok) {
        if (response.status === 401) {
          this.log('error', '401 Unauthorized fetching messages. Invalid or expired token?');
        }
        throw new Error(`Failed to fetch messages: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
      
    } catch (error) {
      this.log('error', 'Error fetching messages:', error.message);
      return [];
    }
  }

  // Fetch user info
  async fetchUserInfo() {
    try {
      const url = 'https://discord.com/api/v9/users/@me';
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': this.token,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }
      
      const userData = await response.json();
      this.userInfo = {
        id: userData.id,
        username: userData.username,
        discriminator: userData.discriminator,
        avatar: userData.avatar
      };
      
      this.log('info', `Logged in as ${userData.username}#${userData.discriminator}`);
      this.emit('userInfoUpdate', this.userInfo);
      
    } catch (error) {
      this.log('error', 'Failed to fetch user info:', error.message);
    }
  }

  // Get user avatar URL
  getUserAvatarUrl() {
    if (!this.userInfo.id || !this.userInfo.avatar) {
      const defaultIndex = this.userInfo.discriminator ? 
        parseInt(this.userInfo.discriminator) % 5 : 0;
      return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
    }
    return `/api/avatar/${this.userInfo.id}/${this.userInfo.avatar}`;
  }

  // Utility: wait for milliseconds
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Control methods
  pause() {
    if (!this.isRunning) {
      this.log('warn', 'Bot is not running');
      return;
    }
    
    this.isPaused = true;
    this.log('info', 'Bot paused');
  }

  resume() {
    if (!this.isRunning) {
      this.log('warn', 'Bot is not running');
      return;
    }
    
    this.isPaused = false;
    this.log('info', 'Bot resumed');
  }

  stop() {
    this.isRunning = false;
    this.isPaused = false;
    this.isMonitoring = false;
    this.log('info', 'Bot stopped');
  }

  // Set rolls per hour (compatibility with UI)
  setRollsPerHour(value) {
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 60) {
      this.rollsPerHour = numValue;
      // Adjust MAX_ROLLS based on rolls per hour
      this.MAX_ROLLS = Math.max(1, Math.floor(numValue));
      this.log('info', `Rolls per hour updated to ${this.rollsPerHour}, MAX_ROLLS set to ${this.MAX_ROLLS}`);
    }
  }

  // Get logs
  getLogs() {
    return [...this.logs];
  }

  // Clear logs
  clearLogs() {
    this.logs = [];
    this.log('info', 'Logs cleared');
  }

  // Reset session
  resetSession() {
    this.sessionStats = {
      totalRolls: 0,
      claimedCharacters: [],
      sessionStartTime: Date.now()
    };
    
    if (this.loggingEnabled) {
      this.logs = [];
    }
    
    // Force a new roll check
    this.remainingRolls = 0;
    this.resetRemainingRolls();
    
    this.log('info', 'Session reset');
    this.emit('statsUpdate', this.sessionStats);
  }

  // Manual roll (for UI button)
  async manualRoll() {
    if (!this.isRunning || this.isPaused) {
      throw new Error('Bot is not running or is paused');
    }
    
    await this.sendMessage('$wa');
    this.sessionStats.totalRolls++;
    this.emit('statsUpdate', this.sessionStats);
    
    // If we manually rolled, use one of our remaining rolls
    if (this.remainingRolls > 0) {
      this.remainingRolls--;
      this.log('info', `Manual roll used! remainingRolls=${this.remainingRolls}`);
    }
  }
}

module.exports = MudaeBot;