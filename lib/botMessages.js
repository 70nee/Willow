import {
  AuditLogEvent,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { EMBED_COLOR } from '../config.js';
import { getHelpCommandMention } from './commandMeta.js';

function getHelpLines() {
  const helpMention = getHelpCommandMention();
  return [
    '`/copy` — Copies the entire server completely',
    '`/paste` — Paste the saved layout into this server (`clean_server` to wipe first)',
    '`/reset` — Clear the stored server copy',
    '`/clean` — Delete all channels, categories, and roles',
    `${helpMention} — Show this list`,
  ];
}

function buildContainer(...parts) {
  const container = new ContainerBuilder().setAccentColor(EMBED_COLOR);

  for (const part of parts) {
    if (part instanceof SectionBuilder) {
      container.addSectionComponents(part);
    } else if (part instanceof SeparatorBuilder) {
      container.addSeparatorComponents(part);
    } else if (part instanceof TextDisplayBuilder) {
      container.addTextDisplayComponents(part);
    }
  }

  return container;
}

export function buildWelcomePayload(mentionUserId, guildName, botAvatarUrl) {
  const components = [];

  if (mentionUserId) {
    components.push(new TextDisplayBuilder().setContent(`<@${mentionUserId}>`));
  }

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Thanks for adding me to **${guildName}**!`),
      new TextDisplayBuilder().setContent(
        'Drag my role to the highest hierarchy so I can do the work<3',
      ),
    )
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatarUrl));

  const footer = new TextDisplayBuilder().setContent(
    '-# Only people with administrator permissions can use me  ><',
  );

  components.push(buildContainer(section, new SeparatorBuilder(), footer));

  return {
    components,
    flags: MessageFlags.IsComponentsV2,
    ...(mentionUserId ? { allowedMentions: { users: [mentionUserId] } } : {}),
  };
}

export function buildHelpPayload() {
  const body = new TextDisplayBuilder().setContent(
    '**Commands**\n' + getHelpLines().map((line) => `• ${line}`).join('\n'),
  );

  const footer = new TextDisplayBuilder().setContent(
    '-# Administrator permission is required for copy, paste, reset, and clean.',
  );

  return {
    components: [buildContainer(body, new SeparatorBuilder(), footer)],
    flags: MessageFlags.IsComponentsV2,
  };
}

export async function findBotInviter(guild, botUserId) {
  try {
    const auditLogs = await guild.fetchAuditLogs({ limit: 10, type: AuditLogEvent.BotAdd });
    const entry = auditLogs.entries.find((log) => log.target?.id === botUserId);
    return entry?.executor ?? null;
  } catch {
    return null;
  }
}

async function resolveBotMember(guild) {
  if (guild.members.me) {
    return guild.members.me;
  }

  return guild.members.fetchMe().catch(() => null);
}

export async function findWelcomeChannel(guild) {
  await guild.channels.fetch();
  const me = await resolveBotMember(guild);
  if (!me) {
    return null;
  }

  const canSend = (channel) => {
    if (!channel?.isTextBased()) {
      return false;
    }

    const permissions = channel.permissionsFor(me);
    return (
      permissions?.has(PermissionFlagsBits.ViewChannel) &&
      permissions?.has(PermissionFlagsBits.SendMessages)
    );
  };

  if (canSend(guild.systemChannel)) {
    return guild.systemChannel;
  }

  const textChannels = [...guild.channels.cache.values()]
    .filter(canSend)
    .sort((a, b) => a.rawPosition - b.rawPosition);

  const preferred = textChannels.find((channel) => /general|welcome|chat|lobby/i.test(channel.name));
  return preferred ?? textChannels[0] ?? null;
}

async function resolveInviter(guild, botUserId) {
  for (const delayMs of [0, 1500, 3000]) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const inviter = await findBotInviter(guild, botUserId);
    if (inviter) {
      return inviter;
    }
  }

  return null;
}

export async function sendWelcomeMessage(guild, client) {
  await guild.fetch();
  await resolveBotMember(guild);

  const inviter = await resolveInviter(guild, client.user.id);
  const mentionUserId = inviter?.id ?? guild.ownerId ?? null;

  const payload = buildWelcomePayload(
    mentionUserId,
    guild.name,
    client.user.displayAvatarURL({ size: 256 }),
  );

  const channel = await findWelcomeChannel(guild);
  if (channel) {
    try {
      await channel.send(payload);
      console.log(`Welcome message sent in #${channel.name} (${guild.name})`);
      return;
    } catch (error) {
      console.error(`Welcome channel send failed (${guild.name}):`, error.message);
    }
  } else {
    console.warn(`No writable channel found for welcome message (${guild.name})`);
  }

  if (inviter) {
    try {
      await inviter.send(payload);
      console.log(`Welcome DM sent to ${inviter.tag} (${guild.name})`);
      return;
    } catch (error) {
      console.error(`Welcome DM failed (${guild.name}):`, error.message);
    }
  }

  console.warn(`Could not send welcome message for ${guild.name}`);
}
