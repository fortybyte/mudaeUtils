# WaifuGames Bot Manager

A persistent bot manager that allows you to run Discord bots even when the website is closed. The server maintains bot instances and saves their state to disk.

## Features

- **Persistent Bot Instances**: Bots continue running on the server even when the website is closed
- **Session Statistics**: Track total rolls and claimed characters per session (resets on pause)
- **Daily Commands**: Automatically executes `$dk` and `$daily` commands every 24 hours
- **Real-time Updates**: WebSocket communication for live logs and statistics
- **Auto-recovery**: Saved instances automatically restart when the server restarts

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server and client:
```bash
npm run dev
```

This will start:
- Backend server on `http://localhost:3001`
- Frontend on `http://localhost:5173`

## Usage

1. Click "Create New Instance"
2. Enter your Discord token and channel ID
3. Enable logging if desired
4. Click "Save Instance"

The bot will start running on the server and continue even if you close the browser.

## Session Statistics

Each instance displays:
- **Session Rolls**: Total number of rolls used in the current session
- **Claimed Characters**: List of characters claimed in the current session

Note: Session stats reset when you pause the bot.

## Persistence

Bot instances are saved to `server/instances.json` and will automatically restart when the server restarts.