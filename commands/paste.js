import { SlashCommandBuilder } from 'discord.js';
import { cleanGuild, pasteGuild } from '../lib/paste.js';
import { finishAndAutoDelete, replyProcessing, replyResultAndAutoDelete } from '../lib/replyUi.js';
import { loadSnapshot } from '../lib/storage.js';

export const data = new SlashCommandBuilder()
  .setName('paste')
  .setDescription('Paste the previously copied server structure into this server')
  .addBooleanOption((option) =>
    option
      .setName('clean_server')
      .setDescription('If true, deletes all channels, categories, and roles before pasting')
      .setRequired(false),
  );

export const adminOnly = true;
export const longRunning = true;

export async function execute(interaction, { botMember }) {
  const snapshot = loadSnapshot();
  if (!snapshot) {
    await replyResultAndAutoDelete(
      interaction,
      'No server has been copied yet. Use `/copy` in the source server first.',
      'Paste',
    );
    return;
  }

  const cleanServer = interaction.options.getBoolean('clean_server') ?? false;

  await replyProcessing(interaction, 'Starting paste... this can take a few minutes.');

  if (cleanServer) {
    await replyProcessing(
      interaction,
      'Cleaning server... Discord Community channels (#rules, updates) will be kept.',
    );
    const cleanResult = await cleanGuild(interaction.guild, botMember);
    await replyProcessing(
      interaction,
      `Cleaned ${cleanResult.deletedChannels} channels. Kept ${cleanResult.preservedChannelIds.length} Discord system channel(s). Continuing paste...`,
    );
  }

  const result = await pasteGuild(
    interaction.guild,
    snapshot,
    botMember,
    async (message) => replyProcessing(interaction, message),
  );

  const failureSummary =
    result.failures.length > 0
      ? `\n- Failed channels: ${result.failures.length}\n` +
        result.failures.map((entry) => `  • #${entry.name}: ${entry.error}`).join('\n')
      : '';

  await finishAndAutoDelete(
    interaction,
    `Pasted structure from **${snapshot.sourceGuildName}** into **${interaction.guild.name}**.\n` +
      `- Clean server: ${cleanServer ? 'Yes' : 'No'}\n` +
      `- Community enabled: ${result.communityEnabled ? 'Yes' : 'No'}\n` +
      `- Community was already on: ${result.communityAlreadyEnabled ? 'Yes' : 'No'}\n` +
      `- Reused Discord #rules/updates: ${result.reusedDiscordCommunityChannels ? 'Yes' : 'No'}\n` +
      `- Roles processed: ${result.rolesCreated}\n` +
      `- Channels created: ${result.channelsCreated}` +
      failureSummary,
    'Paste complete',
  );

  const invokeChannel = interaction.channel;
  if (
    invokeChannel?.deletable &&
    !result.pastedChannelIds.includes(invokeChannel.id)
  ) {
    await invokeChannel.delete('Paste completed').catch(() => {});
  }
}
