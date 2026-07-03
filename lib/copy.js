import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { isCommunityChannelName } from './communityChannels.js';

const COPYABLE_CHANNEL_TYPES = new Set([
  ChannelType.GuildCategory,
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
]);

function serializeOverwrites(overwrites, guild) {
  return overwrites.map((overwrite) => {
    let targetName = null;

    if (overwrite.type === 0) {
      const role = guild.roles.cache.get(overwrite.id);
      targetName = role?.name ?? (overwrite.id === guild.id ? '@everyone' : null);
    } else {
      const member = guild.members.cache.get(overwrite.id);
      targetName = member?.user.tag ?? null;
    }

    return {
      type: overwrite.type,
      targetId: overwrite.id,
      targetName,
      allow: overwrite.allow.bitfield.toString(),
      deny: overwrite.deny.bitfield.toString(),
    };
  });
}

export async function copyGuild(guild) {
  await guild.roles.fetch();
  await guild.channels.fetch();

  const channelEntries = [...guild.channels.cache.values()]
    .filter((channel) => COPYABLE_CHANNEL_TYPES.has(channel.type))
    .sort((a, b) => a.rawPosition - b.rawPosition);

  const keyByChannelId = new Map();
  channelEntries.forEach((channel, index) => {
    keyByChannelId.set(channel.id, `channel-${index}`);
  });

  const roles = [...guild.roles.cache.values()]
    .filter((role) => !role.managed && role.id !== guild.id)
    .sort((a, b) => a.position - b.position)
    .map((role) => ({
      name: role.name,
      color: role.color,
      hoist: role.hoist,
      mentionable: role.mentionable,
      permissions: role.permissions.bitfield.toString(),
      position: role.position,
    }));

  const channels = channelEntries
    .filter((channel) => {
      if (channel.id === guild.rulesChannelId) {
        return true;
      }

      if (channel.id === guild.publicUpdatesChannelId) {
        return true;
      }

      if (channel.id === guild.safetyAlertsChannelId) {
        return true;
      }

      if (isCommunityChannelName(channel.name)) {
        return false;
      }

      return true;
    })
    .map((channel) => ({
    key: keyByChannelId.get(channel.id),
    name: channel.name,
    type: channel.type,
    position: channel.position,
    parentKey: channel.parentId ? keyByChannelId.get(channel.parentId) ?? null : null,
    topic: 'topic' in channel ? channel.topic : null,
    nsfw: 'nsfw' in channel ? channel.nsfw : false,
    bitrate: 'bitrate' in channel ? channel.bitrate : null,
    userLimit: 'userLimit' in channel ? channel.userLimit : null,
    rateLimitPerUser: 'rateLimitPerUser' in channel ? channel.rateLimitPerUser : null,
    permissionOverwrites: serializeOverwrites(channel.permissionOverwrites.cache, guild),
  }));

  return {
    sourceGuildId: guild.id,
    sourceGuildName: guild.name,
    copiedAt: new Date().toISOString(),
    communityEnabled: guild.features.includes('COMMUNITY'),
    preferredLocale: guild.preferredLocale,
    rulesChannelKey: guild.rulesChannelId ? keyByChannelId.get(guild.rulesChannelId) ?? null : null,
    publicUpdatesChannelKey: guild.publicUpdatesChannelId
      ? keyByChannelId.get(guild.publicUpdatesChannelId) ?? null
      : null,
    safetyAlertsChannelKey: guild.safetyAlertsChannelId
      ? keyByChannelId.get(guild.safetyAlertsChannelId) ?? null
      : null,
    roles,
    channels,
  };
}
