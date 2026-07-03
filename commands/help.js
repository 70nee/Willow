import { SlashCommandBuilder } from 'discord.js';
import { buildHelpPayload } from '../lib/botMessages.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('List all Willow commands');

export const adminOnly = false;

export async function execute(interaction) {
  await interaction.reply(buildHelpPayload());
}
