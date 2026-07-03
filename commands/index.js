import { REST, Routes } from 'discord.js';
import { setHelpCommandMention } from '../lib/commandMeta.js';
import * as clean from './clean.js';
import * as copy from './copy.js';
import * as help from './help.js';
import * as paste from './paste.js';
import * as reset from './reset.js';

export const commandModules = [copy, paste, reset, clean, help];

const commandMap = new Map(commandModules.map((module) => [module.data.name, module]));

export function getCommand(name) {
  return commandMap.get(name) ?? null;
}

export function getSlashCommandData() {
  return commandModules.map((module) => module.data.toJSON());
}

export async function registerSlashCommands(token, clientId) {
  const rest = new REST({ version: '10' }).setToken(token);
  const registered = await rest.put(Routes.applicationCommands(clientId), {
    body: getSlashCommandData(),
  });

  const helpCommand = registered.find((command) => command.name === 'help');
  if (helpCommand) {
    setHelpCommandMention(helpCommand.id);
  }

  return registered;
}
