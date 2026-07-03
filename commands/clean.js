import { SlashCommandBuilder } from 'discord.js';
import { cleanGuild } from '../lib/paste.js';
import { finishAndAutoDelete, replyProcessing } from '../lib/replyUi.js';

export const data = new SlashCommandBuilder()
  .setName('clean')
  .setDescription('Delete all channels, categories, and roles from this server');

export const adminOnly = true;
export const longRunning = true;

export async function execute(interaction, { botMember }) {
  await replyProcessing(
    interaction,
    'Cleaning server... deleting channels, categories, and roles.',
  );

  const cleanResult = await cleanGuild(interaction.guild, botMember);
  const preservedNote =
    cleanResult.preservedChannelIds.length > 0
      ? `\n- Kept ${cleanResult.preservedChannelIds.length} Discord system channel(s) (required by Discord)`
      : '';

  await finishAndAutoDelete(
    interaction,
    `**${interaction.guild.name}** has been cleaned.\n` +
      `- Channels deleted: ${cleanResult.deletedChannels}\n` +
      `- Roles deleted: ${cleanResult.deletedRoles}` +
      preservedNote,
    'Clean complete',
  );
}
