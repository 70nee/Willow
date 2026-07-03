import { EmbedBuilder, MessageFlags } from 'discord.js';
import { AUTO_DELETE_MS, EMBED_COLOR } from '../config.js';

const LOADING_EMOJI = '<a:loadingfriston:1522627826648486030>';

function formatProcessing(description) {
  return `${LOADING_EMOJI} ${description}`;
}

function buildProcessingPayload(description) {
  return {
    content: formatProcessing(description),
    embeds: [],
    files: [],
    flags: MessageFlags.None,
  };
}

function buildResultPayload(description, title) {
  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription(description);

  if (title) {
    embed.setTitle(title);
  }

  return {
    content: '',
    embeds: [embed],
    files: [],
    flags: MessageFlags.None,
  };
}

export async function replyProcessing(interaction, description) {
  const payload = buildProcessingPayload(description);

  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload);
    }

    return await interaction.reply(payload);
  } catch (error) {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload).catch(() => null);
    }

    throw error;
  }
}

export async function finishAndAutoDelete(interaction, description, title) {
  const message = await interaction.editReply(buildResultPayload(description, title));
  setTimeout(() => {
    message.delete().catch(() => {});
  }, AUTO_DELETE_MS);
  return message;
}

export async function replyResultAndAutoDelete(interaction, description, title) {
  const message = await interaction.reply(buildResultPayload(description, title));
  setTimeout(() => {
    message.delete().catch(() => {});
  }, AUTO_DELETE_MS);
  return message;
}
