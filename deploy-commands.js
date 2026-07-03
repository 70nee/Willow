import './env.js';
import { registerSlashCommands } from './commands/index.js';

await registerSlashCommands(process.env.DISCORD_TOKEN, process.env.CLIENT_ID);
console.log('Slash commands registered.');
