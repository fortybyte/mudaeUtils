#!/usr/bin/env node
'use strict';

// For Node.js < 18, uncomment the following line and install node-fetch:
// const fetch = require('node-fetch');

const fs = require('fs');
const path = require('path');

// Where we store bot configs
const BOTS_FILE = path.join(__dirname, 'bots.json');

// Minimal file-based storage to replicate GM_getValue / GM_setValue
function loadBots() {
	if (!fs.existsSync(BOTS_FILE)) {
		return [];
	}
	try {
		const raw = fs.readFileSync(BOTS_FILE, 'utf-8');
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed;
		}
		return [];
	} catch (err) {
		console.error('Error reading bots.json:', err);
		return [];
	}
}

function saveBots(botList) {
	try {
		fs.writeFileSync(BOTS_FILE, JSON.stringify(botList, null, 2), 'utf-8');
	} catch (err) {
		console.error('Error writing bots.json:', err);
	}
}

function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * If your token does NOT include "Bot ", uncomment this:
 *
 * function getAuthorizationHeader(bot) {
 *   return "Bot " + bot.token;
 * }
 */
function getAuthorizationHeader(bot) {
	// If your token already has "Bot ", just return it:
	return bot.token;
}

function log(bot, ...args) {
	if (bot.debug) {
		console.log(`[DEBUG] [Bot "${bot.name || 'Unnamed'}"]`, ...args);
	} else {
		console.log(`[Bot "${bot.name || 'Unnamed'}"]`, ...args);
	}
}

// ============== DISCORD API FUNCTIONS ==============
async function fetchOwnUserId(bot) {
	if (bot.ownUserId) return bot.ownUserId;

	const url = 'https://discord.com/api/v9/users/@me';
	try {
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				Authorization: getAuthorizationHeader(bot),
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			log(bot, `Failed to fetch own user ID. Status: ${response.status}`);
			return '';
		}

		const data = await response.json();
		if (data && data.id) {
			bot.ownUserId = data.id;
			log(bot, `Fetched own user ID: ${data.id}`);
			return data.id;
		}
	} catch (error) {
		log(bot, 'Error fetching own user ID:', error);
	}
	return '';
}

async function reactToMessage(bot, channelId, messageId) {
	const emojiEncoded = '%E2%9C%85'; // :white_check_mark:
	const url = `https://discord.com/api/v9/channels/${channelId}/messages/${messageId}/reactions/${emojiEncoded}/@me`;
	try {
		const response = await fetch(url, {
			method: 'PUT',
			headers: {
				Authorization: getAuthorizationHeader(bot),
				'Content-Type': 'application/json',
			},
		});
		if (!response.ok) {
			log(bot, `Failed to react. Status: ${response.status}`);
		} else {
			log(bot, `Reacted to message ${messageId} with checkmark.`);
		}
	} catch (err) {
		log(bot, 'Error reacting to message:', err);
	}
}

async function sendMessage(bot, content, channelId) {
	const url = `https://discord.com/api/v9/channels/${channelId}/messages`;
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: getAuthorizationHeader(bot),
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ content }),
		});

		if (!response.ok) {
			if (response.status === 401) {
				log(bot, '401 Unauthorized: Invalid token when sending a message. Check your token.');
			}
			throw new Error(`Message send failed with status: ${response.status}`);
		}

		const data = await response.json();
		log(bot, 'Message sent:', data);
		return data;
	} catch (error) {
		log(bot, 'Error sending message:', error);
		throw error;
	}
}

async function fetchChatLogs(bot, channelId) {
	if (!bot.lastMessageIds) {
		bot.lastMessageIds = {};
	}
	const afterMessageId = bot.lastMessageIds[channelId];
	let url = `https://discord.com/api/v9/channels/${channelId}/messages?limit=5`;
	if (afterMessageId) {
		url += `&after=${afterMessageId}`;
	}

	try {
		const pretime = Date.now();
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				Authorization: getAuthorizationHeader(bot),
				'Content-Type': 'application/json',
			},
		});

		// Rate limit
		if (response.status === 429) {
			const json = await response.json();
			const retryAfter = json.retry_after || 15;
			log(bot, `Rate limited. Retry in ${retryAfter} sec.`);
			await wait(retryAfter * 1000);
			return fetchChatLogs(bot, channelId); // retry
		}

		if (!response.ok) {
			if (response.status === 401) {
				log(bot, '401 Unauthorized: Invalid or expired token. Please verify the token is correct.');
			} else {
				const errText = await response.text();
				log(bot, `Failed to fetch messages. Status: ${response.status}`, errText);
			}
			return [];
		}

		const data = await response.json();
		if (Array.isArray(data) && data.length > 0) {
			log(bot, 'Messages received:', data);
			log(bot, 'Message received in:', Date.now() - pretime, 'ms');
			const newest = data[0];
			if (newest && newest.id) {
				bot.lastMessageIds[channelId] = newest.id;
			}
		}
		return data || [];
	} catch (error) {
		log(bot, 'Error fetching messages:', error);
		await wait(15000);
		return [];
	}
}

// ============== BLACK TEA GAME HANDLER ==============

const BLACK_TEA_USER_ID = '432610292342587392';
// We'll load the map from GitHub:
const MAP_URL = 'https://fortybyte.github.io/wordMap/map.json';
let comboMap = {};
let comboMapLoaded = false;

async function initComboMap() {
	try {
		const resp = await fetch(MAP_URL);
		if (!resp.ok) {
			throw new Error(`Failed to load map.json: ${resp.status}`);
		}
		comboMap = await resp.json();
		comboMapLoaded = true;
		console.log(`Loaded comboMap with ${Object.keys(comboMap).length} 3-letter combos`);
	} catch (err) {
		console.error('Error loading comboMap:', err);
	}
}

async function handleBlackTeaGame(bot, msg, channelId) {
	// If the message is from ourselves, skip
	if (msg.author && msg.author.id === bot.ownUserId) {
		return false;
	}
	// 1) Check for embed with "The Black Teaword will start!" or "The Red Teaword will start!"
	if (Array.isArray(msg.embeds) && msg.embeds.length > 0) {
		for (const embed of msg.embeds) {
			if (
				(embed.title && embed.title.includes('The Black Teaword will start!')) ||
				(embed.title && embed.title.includes('The Red Teaword will start!'))
			) {
				log(bot, 'Tea game detected! Mark inBlackTeaGame = true');
				await reactToMessage(bot, channelId, msg.id);
				bot.inBlackTeaGame = true;
				return true;
			}
		}
	}

	// 2) If in a Black Tea game, respond if we see the coffee format
	if (bot.inBlackTeaGame && msg.author.id === BLACK_TEA_USER_ID && comboMapLoaded) {
		const coffeeRegex = new RegExp(
			`^:coffee:\\s+<@!?${bot.ownUserId}>\\s+Type a word containing:\\s+\\*\\*(.{3})\\*\\*`,
			'i'
		);
		const match = msg.content.match(coffeeRegex);
		if (match && match[1]) {
			const threeChars = match[1].toLowerCase();
			let result = comboMap[threeChars];
			if (!result) {
				result = 'give up';
			}
			await sendMessage(bot, result, channelId);
			return true;
		}
		// Fallback if the coffeeRegex doesn't match exactly
		const fallbackPattern = /\*\*(.{3})\*\*/;
		const fallbackMatch = fallbackPattern.exec(msg.content);
		if (fallbackMatch && fallbackMatch[1]) {
			const threeChars = fallbackMatch[1].toLowerCase();
			let result = comboMap[threeChars];
			if (!result) {
				result = 'give up';
			}
			await sendMessage(bot, result, channelId);
			return true;
		}
	}

	return false;
}

// ============== POLLING ==============

async function pollChannelsForBot(bot) {
	if (!bot.active || !bot.token) return;

	const channels = bot.channelIds
		.split(',')
		.map(id => id.trim())
		.filter(Boolean);
	if (channels.length === 0) return;

	// Make sure we have ownUserId
	if (!bot.ownUserId) {
		await fetchOwnUserId(bot);
	}

	for (const channelId of channels) {
		const messages = await fetchChatLogs(bot, channelId);
		if (!messages || messages.length === 0) continue;

		for (const msg of messages) {
			await handleBlackTeaGame(bot, msg, channelId);
		}
	}
}

async function pollEngine() {
	const botList = loadBots();
	if (!comboMapLoaded) {
		// Wait for map to load
		return;
	}
	const now = Date.now();

	for (const bot of botList) {
		if (!bot.pollRate) {
			bot.pollRate = 5000;
		}
		if (!bot.nextPollTime) {
			bot.nextPollTime = 0;
		}
		if (now >= bot.nextPollTime) {
			try {
				await pollChannelsForBot(bot);
			} catch (err) {
				console.error(`[Bot "${bot.name}"] Polling Error:`, err);
			}
			bot.nextPollTime = now + bot.pollRate;
			log(bot, 'next poll in:', bot.pollRate);
		}
	}

	saveBots(botList);
}

// ============== CLI COMMANDS ==============

async function cmdList() {
	const botList = loadBots();
	if (botList.length === 0) {
		console.log('No bots configured.');
		return;
	}
	botList.forEach((b, idx) => {
		console.log(
			`[${idx}] Name="${b.name}", Active=${b.active}, Debug=${b.debug}, Channels="${b.channelIds}", PollRate=${b.pollRate}ms`
		);
	});
}

async function cmdAdd() {
	const botList = loadBots();
	// Minimal prompt using standard input (sync approach can be done with 'readline-sync' or 'prompt-sync')
	const readline = require('readline').createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const ask = question =>
		new Promise(resolve => readline.question(question, answer => resolve(answer.trim())));

	console.log('Adding a new bot...');
	const name = await ask('Bot Name: ');
	const token = await ask('Bot Token: ');
	const channels = await ask('Channel IDs (comma-separated): ');
	let pollRate = await ask('Poll Interval (ms, 50-20000) [default=5000]: ');
	pollRate = parseInt(pollRate, 10);
	if (isNaN(pollRate) || pollRate < 50 || pollRate > 20000) {
		pollRate = 5000;
	}

	readline.close();

	const newBot = {
		name,
		token,
		channelIds: channels,
		pollRate,
		active: false,
		debug: false,
		lastMessageIds: {},
		ownUserId: '',
		nextPollTime: 0,
		inBlackTeaGame: false,
	};

	botList.push(newBot);
	saveBots(botList);
	console.log(`Bot "${name}" added. Use "start" or "stop" to set activity.`);
}

async function cmdRemove(target) {
	const botList = loadBots();
	if (botList.length === 0) {
		console.log('No bots to remove.');
		return;
	}

	let removed = false;
	// Try match by name or index
	const newList = botList.filter((b, idx) => {
		if (`${idx}` === target || b.name === target) {
			removed = true;
			return false; // remove this bot
		}
		return true;
	});

	if (!removed) {
		console.log(`No bot found matching "${target}".`);
	} else {
		saveBots(newList);
		console.log(`Removed bot matching "${target}".`);
	}
}

async function cmdStart() {
	const botList = loadBots();
	botList.forEach(b => {
		// Start all bots
		b.active = true;
	});
	saveBots(botList);
	console.log('All bots set to active. Polling loop started.');

	// Start the poll loop
	await initComboMap();
	setInterval(pollEngine, 2500);
}

async function cmdStop() {
	const botList = loadBots();
	botList.forEach(b => {
		// Stop all bots
		b.active = false;
	});
	saveBots(botList);
	console.log('All bots set to inactive (stopped).');
}

// ============== MAIN ==============
(async function main() {
	const [,, cmd, ...args] = process.argv;
	switch (cmd) {
		case 'list':
			await cmdList();
			break;
		case 'add':
			await cmdAdd();
			break;
		case 'remove':
			if (!args[0]) {
				console.log('Usage: remove <botNameOrIndex>');
				return;
			}
			await cmdRemove(args[0]);
			break;
		case 'start':
			await cmdStart();
			break;
		case 'stop':
			await cmdStop();
			break;
		default:
			console.log('Usage:');
			console.log('  list                List all configured bots');
			console.log('  add                 Add a new bot (interactive prompt)');
			console.log('  remove <name|idx>   Remove a bot by name or index');
			console.log('  start               Start (activate) all bots and begin polling');
			console.log('  stop                Stop (deactivate) all bots');
			break;
	})();
