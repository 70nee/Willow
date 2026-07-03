import { SlashCommandBuilder } from 'discord.js';
import { copyGuild } from '../lib/copy.js';
import { finishAndAutoDelete, replyProcessing } from '../lib/replyUi.js';
import { saveSnapshot } from '../lib/storage.js';

export const data = new SlashCommandBuilder()
  .setName('copy')
  .setDescription('Copies the entire server completely');

export const adminOnly = true;
export const longRunning = true;

export async function execute(interaction) {
  await replyProcessing(interaction, 'Copying server structure...');

  const snapshot = await copyGuild(interaction.guild);
  saveSnapshot(snapshot);

  await finishAndAutoDelete(
    interaction,
    `Server **${interaction.guild.name}** copied successfully.\n` +
      `- Roles: ${snapshot.roles.length}\n` +
      `- Channels: ${snapshot.channels.length}\n\n` +
      'Use `/paste` in another server to recreate this layout.',
    'Copy complete',
  );
}
