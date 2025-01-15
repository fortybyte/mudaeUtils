#!/usr/bin/env node
"use strict";

// If on Node < 18, install node-fetch and uncomment:
// const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// For Node 18+, fetch is available globally. Otherwise, do:
// const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

/***********************************************
 * 1. READ SETTINGS FROM CLI OR ENV
 ***********************************************/

// Usage:
//   node auto-react-bot.js --token=DISCORD_TOKEN --channels=12345,67890
//     [--logging true/false] [--debug true/false]
// Or use environment variables:
//   DISCORD_TOKEN=abc123 CHANNELS=1234,5678 node auto-react-bot.js
//
// Characters are loaded from "chars.json" by default.

function parseArgvFlag(flagName, defaultValue) {
	// e.g., parseArgvFlag('token') => 'abc123'
	const arg = process.argv.find(arg => arg.startsWith(`--${flagName}=`));
	if (arg) {
		const val = arg.split("=")[1];
		return val.trim();
	}
	// if not found in argv, try environment
	const envVar = process.env[flagName.toUpperCase()];
	if (envVar) {
		return envVar;
	}
	return defaultValue;
}

// 1) Load token, channel IDs, logging & debug flags
const DISCORD_TOKEN = parseArgvFlag("token", "");
const CHANNELS = parseArgvFlag("channels", ""); // comma-separated
const ENABLE_LOGGING = parseArgvFlag("logging", "true") === "true";
const ENABLE_DEBUG = parseArgvFlag("debug", "false") === "true";

// Basic sanity checks
if (!DISCORD_TOKEN) {
	console.error("[ERROR] No Discord token provided. Use --token=YourToken or set DISCORD_TOKEN env var.");
	process.exit(1);
}
if (!CHANNELS) {
	console.error("[ERROR] No channel IDs provided. Use --channels=12345,67890 or set CHANNELS env var.");
	process.exit(1);
}

// Split the channels string
const channelsToMonitor = CHANNELS.split(",").map(ch => ch.trim()).filter(Boolean);

/***********************************************
 * 2. LOAD CHARACTERS FROM JSON (chars.json)
 ***********************************************/
const CHAR_FILE = path.join(__dirname, "chars.json");
let reactTriggerKeywords = [];
try {
	const rawChars = fs.readFileSync(CHAR_FILE, "utf-8");
	reactTriggerKeywords = JSON.parse(rawChars);
	if (!Array.isArray(reactTriggerKeywords)) {
		throw new Error("chars.json is not an array.");
	}
} catch (err) {
	console.error("[ERROR] Could not load chars.json:", err);
	process.exit(1);
}

/***********************************************
 * 3. THE BOT LOGIC (Converted from Tampermonkey)
 ***********************************************/

// Hard-coded Mudae references:
const MUDAE_ID = "432610292342587392";
const CLAIM_STRING_CHECK = "\nReact with any emoji to claim!";

// Default values:
const MAX_ROLLS = 10;
const ROLL_TESTING_ACTIVE = false;
const AUTO_REACTION_EMOJI = "👍";

// Some placeholders:
let remainingRolls = MAX_ROLLS; // or from an external config
let isMonitoring = false;
let autoResetMinute = null; // the “auto-detected” minute for Mudae
let testRolls = ROLL_TESTING_ACTIVE;
let currentTime = Date.now();

// For $ru parsing
function parseMudaeUptime(text) {
	const pattern = /You have \*\*(\d+)\*\* rolls left\. Next rolls reset in \*\*(\d+)\*\* min\./;
	const match = text.match(pattern);
	if (!match) return 0;
	const timeLeft = parseInt(match[2], 10);
	return timeLeft;
}
function parseMudaeRolls(text) {
	const pattern = /You have \*\*(\d+)\*\* rolls left\. Next rolls reset in \*\*(\d+)\*\* min\./;
	const match = text.match(pattern);
	if (!match) return 0;
	const rolls = parseInt(match[1], 10);
	return rolls;
}

// Utility
function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
function log(...args) {
	if (ENABLE_LOGGING) {
		console.log("[Auto-React Bot]", ...args);
	}
}
function debug(...args) {
	if (ENABLE_DEBUG) {
		console.log("[DEBUG]", ...args);
	}
}

// For time manipulations
function timeUntilResetMinute(minute) {
	if (minute == null) {
		minute = 36; // fallback
		log("autoResetMinute not set yet; using fallback=36");
	}
	const now = new Date();
	const target = new Date();
	target.setMinutes(minute, 0, 0); // e.g. XX:36:00
	if (target.getTime() <= now.getTime()) {
		target.setHours(target.getHours() + 1);
	}
	return target.getTime() - now.getTime();
}

// Random delay to spread out next roll
function getRandomMinutesInMs() {
	const rand = Math.floor(Math.random() * 55) + 1; // 1..55
	return rand * 60 * 1000; // convert to ms
}

// A function to recalc and schedule next “roll time”
function resetRemainingRolls() {
	remainingRolls = MAX_ROLLS;

	// Time until official Mudae reset
	const timeTil = timeUntilResetMinute(autoResetMinute);

	const randMs = getRandomMinutesInMs();
	currentTime = Date.now() + randMs + timeTil;

	log(
		`Reset rolls. Next roll in ~${Math.round((currentTime - Date.now()) / 60000)} min,`,
		`(random + timeTilReset(${autoResetMinute}))`
	);
}

/***********************************************
 * 4. DISCORD API CALLS (Using fetch)
 ***********************************************/

async function sendMessage(content, channelId) {
	const url = `https://discord.com/api/v9/channels/${channelId}/messages`;
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: DISCORD_TOKEN, // or "Bot <token>" if needed
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ content }),
		});
		if (!response.ok) {
			if (response.status === 401) {
				log("401 Unauthorized sending message. Check your token.");
			}
			throw new Error(`sendMessage failed: status=${response.status}`);
		}
		const data = await response.json();
		debug("sendMessage response:", data);
		return data;
	} catch (err) {
		log("sendMessage error:", err);
		return null;
	}
}

async function addReaction(channelId, messageId, emoji) {
	const url = `https://discord.com/api/v9/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(
		emoji
	)}/@me`;

	try {
		const response = await fetch(url, {
			method: "PUT",
			headers: {
				Authorization: DISCORD_TOKEN,
				"Content-Type": "application/json",
			},
		});
		if (!response.ok) {
			if (response.status === 401) {
				log("401 Unauthorized adding reaction. Check your token!");
			} else {
				const errText = await response.text();
				log("Failed to add reaction:", errText);
			}
		} else {
			debug(`Reacted with ${emoji} on message ${messageId}`);
		}
	} catch (err) {
		log("Error adding reaction:", err);
	}
}

let afterMessageId; // track which messages we've seen
async function fetchChatLogs(channelId) {
	let url = `https://discord.com/api/v9/channels/${channelId}/messages?limit=5`;
	if (afterMessageId) {
		url += `&after=${afterMessageId}`;
	}
	try {
		const pretime = Date.now();
		const response = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: DISCORD_TOKEN,
				"Content-Type": "application/json",
			},
		});

		// Rate limit
		if (response.status === 429) {
			const json = await response.json();
			const retryAfter = json.retry_after || 15;
			log(`Rate-limited. Retrying in ${retryAfter} sec.`);
			await wait(retryAfter * 1000);
			return fetchChatLogs(channelId);
		}

		if (!response.ok) {
			if (response.status === 401) {
				log("401 Unauthorized fetching messages. Invalid or expired token?");
			} else {
				const errText = await response.text();
				log(`fetchChatLogs error status=${response.status}:`, errText);
			}
			return null;
		}

		const data = await response.json();
		if (Array.isArray(data) && data.length > 0) {
			debug("Messages fetched in (ms):", Date.now() - pretime);
			afterMessageId = data[0].id;
		}
		return data;
	} catch (err) {
		log("Error fetching messages:", err);
		await wait(15000);
		return null;
	}
}

/***********************************************
 * 5. BOT LOGIC: DETECT KEYWORDS & AUTO-REACT
 ***********************************************/

function containsTriggerKeyword(message) {
	if (!message || !Array.isArray(message.embeds) || message.embeds.length === 0) {
		return false;
	}
	// If debug mode is on, we might react to everything that matches "claimStringCheck"
	// or "wished" in the content:
	if (ENABLE_DEBUG && message.content?.toLowerCase().includes("wished")) {
		debug("found 'wished' in debug mode");
		return true;
	}

	// If not in debug mode, also check embed.description for the claim string
	for (const embed of message.embeds) {
		if (!ENABLE_DEBUG && embed.description) {
			if (embed.description.toLowerCase().includes(CLAIM_STRING_CHECK.toLowerCase())) {
				log("Found a claimable message in the embed description!");
				return true;
			}
		}

		// Then check the embed author name for any of the reactTriggerKeywords
		const authorName = embed.author?.name;
		if (authorName) {
			const normalizedAuthor = authorName.toLowerCase();
			for (const keyword of reactTriggerKeywords) {
				if (normalizedAuthor === keyword.toLowerCase()) {
					log(`Matched keyword: "${keyword}" in author: "${authorName}"`);
					return true;
				}
			}
		}
	}
	return false;
}

async function checkRollUptime(channelId) {
	// Send $ru to see how many rolls/time left
	const msgData = await sendMessage("$ru", channelId);
	if (!msgData) {
		log("checkRollUptime: $ru message send failed.");
		return [0, 0];
	}
	// Wait for Mudae to respond
	await wait(2500);

	// Fetch the latest messages
	const logs = await fetchChatLogs(channelId);
	if (!logs) return [0, 0];

	for (const msg of logs) {
		if (msg.author?.id !== MUDAE_ID) {
			continue;
		}
		let timeLeft = parseMudaeUptime(msg.content);
		let rolls = parseMudaeRolls(msg.content);
		if (timeLeft > 0 || rolls > 0) {
			return [timeLeft, rolls];
		}
	}
	return [0, 0];
}

/***********************************************
 * 6. MAIN MONITOR LOOP
 ***********************************************/
async function monitorChannels() {
	let lastMessageIds = {}; // track last seen message per channel
	isMonitoring = true;

	// 1) Attempt to auto-detect the next reset minute from $ru (first channel)
	const mainChannel = channelsToMonitor[0];
	const [timeLeft, rolls] = await checkRollUptime(mainChannel);
	const nowMin = new Date().getMinutes();

	autoResetMinute = (nowMin + timeLeft) % 60;
	remainingRolls = rolls;

	log(`autoResetMinute = ${autoResetMinute}, timeLeft = ${timeLeft} min, remainingRolls = ${rolls}`);
	if (timeLeft <= 0) {
		autoResetMinute = (nowMin + 36) % 60; // fallback
		log(`No timeLeft found; using fallback minute: ${autoResetMinute}`);
	}

	if (rolls <= 0) {
		resetRemainingRolls();
		testRolls = true; // Force rolling after reset
	} else {
		// If we still have rolls, schedule normal
		currentTime = Date.now() + 10_000; // in 10s we can do a roll
	}

	log("Monitoring started. Press CTRL+C to stop.");

	// Now, poll the channels in a loop
	while (isMonitoring) {
		try {
			const now = Date.now();
			const shouldRoll = now >= currentTime;

			for (const channelId of channelsToMonitor) {
				// If time to roll & we have rolls left
				if (shouldRoll && remainingRolls > 0) {
					await sendMessage("$wa", channelId);
					remainingRolls--;
					log(`Used a roll! remainingRolls=${remainingRolls}`);
				}

				// If out of rolls, schedule next reset
				if (remainingRolls === 0) {
					resetRemainingRolls();
					testRolls = true;
				}

				// Fetch last ~5 new messages
				const messages = await fetchChatLogs(channelId);
				if (!messages || messages.length === 0) continue;

				for (const msg of messages) {
					// skip if we already processed or older
					const msgId = msg.id;
					if (lastMessageIds[channelId] && BigInt(msgId) <= BigInt(lastMessageIds[channelId])) {
						continue;
					}

					// Check triggers
					if (containsTriggerKeyword(msg)) {
						log(`Found a trigger in channel=${channelId}, msg=${msgId}`);
						await addReaction(channelId, msgId, AUTO_REACTION_EMOJI);
					}

					// Update last processed
					if (!lastMessageIds[channelId] || BigInt(msgId) > BigInt(lastMessageIds[channelId])) {
						lastMessageIds[channelId] = msgId;
					}
				}
				// small delay between channels
				if (remainingRolls > 0) {
					await wait(2500);
				}
			}

			// If we just rolled
			if (shouldRoll) {
				currentTime = Date.now() + 60_000; // next roll in 1 min or so
			}

			// Sleep a bit before next poll iteration
			await wait(3000);
		} catch (err) {
			log("Error in monitor loop:", err);
			await wait(15000);
		}
	}
}

/***********************************************
 * 7. STARTUP & CLEANUP
 ***********************************************/
async function main() {
	await monitorChannels();
}

// Listen for Ctrl+C to gracefully stop
process.on("SIGINT", () => {
	isMonitoring = false;
	console.log("\n[Auto-React Bot] Caught interrupt signal (SIGINT). Stopping gracefully...");
	setTimeout(() => process.exit(0), 2000);
});

// Start
main().catch(err => {
	console.error("[Auto-React Bot] Fatal error:", err);
	process.exit(1);
});
