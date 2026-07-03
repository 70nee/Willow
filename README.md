Willow ><

A discord beast that copies a server's structure (roles, categories, channels, permissions, and order) and pastes it into another server. Basically copying an entire server, making a work of hours to work of seconds.

## Requirements

- Node.js 18+
- A Discord bot with the **Server Members Intent** enabled (for welcome messages)
- **Administrator** permission in any server where you run copy, paste, clean, or reset

## Setup

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

3. Invite the bot with Administrator permission.

4. Start the bot:

```bash
npm start
```

Optionally register slash commands without starting the bot:

```bash
npm run deploy
```

## Commands

| Command | Description |
|---------|-------------|
| `/copy` | Save the current server's layout to a local snapshot |
| `/paste` | Recreate the saved layout in this server (`clean_server` to wipe first) |
| `/reset` | Clear the stored snapshot |
| `/clean` | Delete all channels, categories, and roles (keeps Discord system channels) |
| `/help` | List commands |

## Project structure

```
commands/     Slash command definitions and handlers
lib/          Copy, paste, storage, UI, and welcome message logic
utils/        Instance lock and shared interaction helpers
config.js     Optional environment-based customization
data/         Local snapshot storage (gitignored)
```

## Notes

- Only one bot instance should run at a time.
- Community servers: Willow reuses Discord's official `#rules` and `#community-updates` / `#moderator-only` channels instead of duplicating them.
- Snapshots are stored in `data/snapshot.json` on the machine running the bot.

## License

MIT
