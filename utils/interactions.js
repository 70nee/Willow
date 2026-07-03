import { EmbedBuilder, MessageFlags } from 'discord.js';
import { AUTO_DELETE_MS, EMBED_COLOR } from '../config.js';

function errorPayload(message) {
  return {
    content: '',
    files: [],
    embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Error').setDescription(message)],
    flags: MessageFlags.None,
  };
}

export async function sendError(interaction, message) {
  if (interaction.deferred || interaction.replied) {
    const reply = await interaction.editReply(errorPayload(message)).catch(() => null);
    if (reply) {
      setTimeout(() => reply.delete().catch(() => {}), AUTO_DELETE_MS);
    }
    return;
  }

  const reply = await interaction.reply(errorPayload(message)).catch(() => null);
  if (reply) {
    setTimeout(() => reply.delete().catch(() => {}), AUTO_DELETE_MS);
  }
}
