const EventEmitter = require('events');

class MudaeBot extends EventEmitter {
  constructor(token, channelId, loggingEnabled = true) {
    super();
    this.token = token;
    this.channelId = channelId;
    this.loggingEnabled = loggingEnabled;
    this.isRunning = false;
    this.isPaused = false;
    this.logs = [];
    
    // Bot settings
    this.MUDAE_ID = "432610292342587392";
    this.CLAIM_STRING_CHECK = "\nReact with any emoji to claim!";
    this.MAX_ROLLS = 10;
    this.AUTO_REACTION_EMOJI = "👍";
    
    this.remainingRolls = this.MAX_ROLLS;
    this.autoResetMinute = null;
    this.currentTime = Date.now();
    this.lastMessageId = null;
    this.reactTriggerKeywords = [];
    
    // Session statistics
    this.sessionStats = {
      totalRolls: 0,
      claimedCharacters: [],
      sessionStartTime: null
    };
    
    // Daily command tracking
    this.lastDailyCommandTime = null;
    this.dailyCommandInterval = null;
    
    // User info
    this.userInfo = {
      id: null,
      username: null,
      discriminator: null,
      avatar: null
    };
    
    // Auto-recovery
    this.failureCount = 0;
    this.maxFailures = 3;
    this.lastHealthCheck = Date.now();
    
    // Load characters
    this.loadCharacters();
  }

  log(level, ...args) {
    const timestamp = new Date().toISOString();
    const message = args.join(' ');
    const logEntry = {
      timestamp,
      level,
      message
    };
    
    this.logs.push(logEntry);
    if (this.logs.length > 1000) {
      this.logs.shift(); // Keep only last 1000 logs
    }
    
    if (this.loggingEnabled || level === 'error') {
      console.log(`[${timestamp}] [${level.toUpperCase()}]`, message);
      this.emit('log', logEntry);
    }
  }

  async loadCharacters() {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const charFile = path.join(__dirname, 'chars.json');
      
      try {
        const rawChars = await fs.readFile(charFile, 'utf-8');
        this.reactTriggerKeywords = JSON.parse(rawChars);
        this.log('info', `Loaded ${this.reactTriggerKeywords.length} character triggers`);
      } catch (err) {
        this.log('warn', 'chars.json not found, using empty trigger list');
        this.reactTriggerKeywords = [];
      }
    } catch (err) {
      this.log('error', 'Failed to load characters:', err.message);
    }
  }

  async start() {
    if (this.isRunning && !this.isPaused) {
      this.log('warn', 'Bot is already running');
      return;
    }
    
    this.isRunning = true;
    this.isPaused = false;
    
    // Initialize session if not already
    if (!this.sessionStats.sessionStartTime) {
      this.sessionStats.sessionStartTime = Date.now();
    }
    
    this.log('info', `Bot started for channel ${this.channelId}`);
    
    // Fetch user info
    await this.fetchUserInfo();
    
    // Initialize bot with delays
    await this.wait(2000); // 2 second delay before first command
    await this.checkRollUptime();
    
    // Check if we should run daily commands on startup
    const now = Date.now();
    if (!this.lastDailyCommandTime || now - this.lastDailyCommandTime >= 24 * 60 * 60 * 1000) {
      await this.wait(3000); // 3 second delay before daily commands
      await this.executeDailyCommands();
    }
    
    this.monitorLoop();
    
    // Start daily command scheduler
    this.startDailyCommandScheduler();
  }

  pause() {
    if (!this.isRunning) {
      this.log('warn', 'Bot is not running');
      return;
    }
    
    this.isPaused = true;
    
    // Reset session stats on pause
    this.sessionStats = {
      totalRolls: 0,
      claimedCharacters: [],
      sessionStartTime: Date.now()
    };
    this.emit('statsUpdate', this.sessionStats);
    
    this.log('info', 'Bot paused - session stats reset');
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
    
    // Clear daily command interval
    if (this.dailyCommandInterval) {
      clearInterval(this.dailyCommandInterval);
      this.dailyCommandInterval = null;
    }
    
    this.log('info', 'Bot stopped');
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  parseMudaeUptime(text) {
    const pattern = /You have \*\*(\d+)\*\* rolls left\. Next rolls reset in \*\*(\d+)\*\* min\./;
    const match = text.match(pattern);
    if (!match) return 0;
    return parseInt(match[2], 10);
  }

  parseMudaeRolls(text) {
    const pattern = /You have \*\*(\d+)\*\* rolls left\. Next rolls reset in \*\*(\d+)\*\* min\./;
    const match = text.match(pattern);
    if (!match) return 0;
    return parseInt(match[1], 10);
  }

  timeUntilResetMinute(minute) {
    if (minute == null) {
      minute = 36;
      this.log('debug', 'autoResetMinute not set yet; using fallback=36');
    }
    const now = new Date();
    const target = new Date();
    target.setMinutes(minute, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setHours(target.getHours() + 1);
    }
    return target.getTime() - now.getTime();
  }

  getRandomMinutesInMs() {
    const rand = Math.floor(Math.random() * 55) + 1;
    return rand * 60 * 1000;
  }

  resetRemainingRolls() {
    this.remainingRolls = this.MAX_ROLLS;
    const timeTil = this.timeUntilResetMinute(this.autoResetMinute);
    const randMs = this.getRandomMinutesInMs();
    this.currentTime = Date.now() + randMs + timeTil;
    
    this.log('info', 
      `Reset rolls. Next roll in ~${Math.round((this.currentTime - Date.now()) / 60000)} min`
    );
  }

  async sendMessage(content) {
    const url = `https://discord.com/api/v9/channels/${this.channelId}/messages`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: this.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          this.log('error', '401 Unauthorized sending message. Check your token.');
        }
        throw new Error(`sendMessage failed: status=${response.status}`);
      }
      
      const data = await response.json();
      this.log('debug', `Message sent: ${content}`);
      this.lastHealthCheck = Date.now(); // Update health check
      this.failureCount = 0; // Reset failure count on success
      return data;
    } catch (err) {
      this.log('error', 'sendMessage error:', err.message);
      return null;
    }
  }

  async addReaction(messageId, emoji) {
    const url = `https://discord.com/api/v9/channels/${this.channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`;
    
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: this.token,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          this.log('error', '401 Unauthorized adding reaction. Check your token!');
        } else {
          const errText = await response.text();
          this.log('error', 'Failed to add reaction:', errText);
        }
      } else {
        this.log('info', `Reacted with ${emoji} on message ${messageId}`);
      }
    } catch (err) {
      this.log('error', 'Error adding reaction:', err.message);
    }
  }

  async fetchChatLogs() {
    let url = `https://discord.com/api/v9/channels/${this.channelId}/messages?limit=5`;
    if (this.lastMessageId) {
      url += `&after=${this.lastMessageId}`;
    }
    
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: this.token,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 429) {
        const json = await response.json();
        const retryAfter = json.retry_after || 15;
        this.log('warn', `Rate-limited. Retrying in ${retryAfter} sec.`);
        await this.wait(retryAfter * 1000);
        return this.fetchChatLogs();
      }

      if (!response.ok) {
        if (response.status === 401) {
          this.log('error', '401 Unauthorized fetching messages. Invalid or expired token?');
        } else {
          const errText = await response.text();
          this.log('error', `fetchChatLogs error status=${response.status}:`, errText);
        }
        return null;
      }

      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        this.lastMessageId = data[0].id;
      }
      return data;
    } catch (err) {
      this.log('error', 'Error fetching messages:', err.message);
      await this.wait(15000);
      return null;
    }
  }

  containsTriggerKeyword(message) {
    if (!message || !Array.isArray(message.embeds) || message.embeds.length === 0) {
      return null;
    }

    if (message.content?.toLowerCase().includes("wished")) {
      this.log('debug', "found 'wished' in message");
      return null;
    }

    for (const embed of message.embeds) {
      if (embed.description && embed.description.toLowerCase().includes(this.CLAIM_STRING_CHECK.toLowerCase())) {
        this.log('info', 'Found a claimable message in the embed description!');
      } else {
        continue;
      }

      const authorName = embed.author?.name;
      if (authorName) {
        const normalizedAuthor = authorName.toLowerCase();
        for (const keyword of this.reactTriggerKeywords) {
          if (normalizedAuthor === keyword.toLowerCase()) {
            this.log('info', `Matched keyword: "${keyword}" in author: "${authorName}"`);
            return authorName; // Return the actual character name
          }
        }
      }
    }
    return null;
  }

  async checkRollUptime() {
    const msgData = await this.sendMessage("$ru");
    if (!msgData) {
      this.log('error', 'checkRollUptime: $ru message send failed.');
      return [0, 0];
    }
    
    await this.wait(2500);
    
    const logs = await this.fetchChatLogs();
    if (!logs) return [0, 0];

    for (const msg of logs) {
      if (msg.author?.id !== this.MUDAE_ID) {
        continue;
      }
      let timeLeft = this.parseMudaeUptime(msg.content);
      let rolls = this.parseMudaeRolls(msg.content);
      if (timeLeft > 0 || rolls > 0) {
        return [timeLeft, rolls];
      }
    }
    return [0, 0];
  }

  async monitorLoop() {
    const [timeLeft, rolls] = await this.checkRollUptime();
    const nowMin = new Date().getMinutes();
    
    this.autoResetMinute = (nowMin + timeLeft) % 60;
    this.remainingRolls = rolls;
    
    this.log('info', `autoResetMinute = ${this.autoResetMinute}, timeLeft = ${timeLeft} min, remainingRolls = ${rolls}`);
    
    if (timeLeft <= 0) {
      this.autoResetMinute = (nowMin + 36) % 60;
      this.log('info', `No timeLeft found; using fallback minute: ${this.autoResetMinute}`);
    }

    if (rolls <= 0) {
      this.resetRemainingRolls();
    } else {
      this.currentTime = Date.now() + 10_000;
    }

    while (this.isRunning) {
      if (this.isPaused) {
        await this.wait(1000);
        continue;
      }

      try {
        const now = Date.now();
        const shouldRoll = now >= this.currentTime;

        if (shouldRoll && this.remainingRolls > 0) {
          await this.sendMessage("$wa");
          this.remainingRolls--;
          this.sessionStats.totalRolls++;
          this.emit('statsUpdate', this.sessionStats);
          this.log('info', `Used a roll! remainingRolls=${this.remainingRolls}, totalRolls=${this.sessionStats.totalRolls}`);
        }

        if (this.remainingRolls === 0) {
          this.resetRemainingRolls();
        }

        const messages = await this.fetchChatLogs();
        if (messages && messages.length > 0) {
          for (const msg of messages) {
            const characterName = this.containsTriggerKeyword(msg);
            if (characterName) {
              this.log('info', `Found a trigger in message=${msg.id}, character=${characterName}`);
              await this.addReaction(msg.id, this.AUTO_REACTION_EMOJI);
              
              // Add to claimed characters
              if (!this.sessionStats.claimedCharacters.includes(characterName)) {
                this.sessionStats.claimedCharacters.push(characterName);
                this.emit('statsUpdate', this.sessionStats);
              }
            }
          }
        }

        if (this.remainingRolls > 0) {
          await this.wait(2500);
        }
      } catch (err) {
        this.log('error', 'Error in monitor loop:', err.message);
        await this.wait(15000);
      }
    }
  }

  getLogs() {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    this.log('info', 'Logs cleared');
  }

  startDailyCommandScheduler() {
    // Clear any existing interval
    if (this.dailyCommandInterval) {
      clearInterval(this.dailyCommandInterval);
    }

    // Execute daily commands immediately if it's been more than 24 hours
    const now = Date.now();
    if (!this.lastDailyCommandTime || now - this.lastDailyCommandTime >= 24 * 60 * 60 * 1000) {
      this.executeDailyCommands();
    }

    // Schedule daily commands every 24 hours
    this.dailyCommandInterval = setInterval(() => {
      if (!this.isPaused && this.isRunning) {
        this.executeDailyCommands();
      }
    }, 24 * 60 * 60 * 1000); // 24 hours

    this.log('info', 'Daily command scheduler started');
  }

  async executeDailyCommands() {
    try {
      this.log('info', 'Executing daily commands...');
      
      // Send $dk command
      await this.sendMessage("$dk");
      await this.wait(3000); // 3 second delay between commands
      
      // Send $daily command
      await this.sendMessage("$daily");
      
      this.lastDailyCommandTime = Date.now();
      this.log('info', 'Daily commands executed successfully');
    } catch (error) {
      this.log('error', 'Failed to execute daily commands:', error.message);
    }
  }

  async fetchUserInfo() {
    try {
      const url = 'https://discord.com/api/v9/users/@me';
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: this.token,
          'Content-Type': 'application/json',
        },
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

  getUserAvatarUrl() {
    if (!this.userInfo.id || !this.userInfo.avatar) {
      // Return default avatar
      const defaultIndex = this.userInfo.discriminator ? parseInt(this.userInfo.discriminator) % 5 : 0;
      return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
    }
    return `https://cdn.discordapp.com/avatars/${this.userInfo.id}/${this.userInfo.avatar}.png`;
  }
}

module.exports = MudaeBot;