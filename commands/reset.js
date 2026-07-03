import { SlashCommandBuilder } from 'discord.js';
import { replyResultAndAutoDelete } from '../lib/replyUi.js';
import { clearSnapshot, loadSnapshot } from '../lib/storage.js';

export const data = new SlashCommandBuilder()
  .setName('reset')
  .setDescription('Clear the stored server copy so you can copy a new server');

export const adminOnly = true;

export async function execute(interaction) {
  const existing = loadSnapshot();
  if (!existing) {
    await replyResultAndAutoDelete(
      interaction,
      'There is no stored server copy to reset.',
      'Reset',
    );
    return;
  }

  clearSnapshot();
  await replyResultAndAutoDelete(
    interaction,
    `Stored copy of **${existing.sourceGuildName}** has been cleared. You can \`/copy\` a new server now.`,
    'Reset complete',
  );
}
