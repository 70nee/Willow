import { ChannelType } from 'discord.js';

export const RULES_CHANNEL_NAMES = new Set(['rules']);
export const PUBLIC_UPDATES_CHANNEL_NAMES = new Set(['moderator-only', 'community-updates']);

export function isRulesChannelName(name) {
  return RULES_CHANNEL_NAMES.has(name);
}

export function isPublicUpdatesChannelName(name) {
  return PUBLIC_UPDATES_CHANNEL_NAMES.has(name);
}

export function isCommunityChannelName(name) {
  return isRulesChannelName(name) || isPublicUpdatesChannelName(name);
}

export function shouldEnableCommunity(snapshot) {
  return Boolean(snapshot.communityEnabled);
}

export function shouldReuseCommunityChannels(snapshot) {
  return (
    shouldEnableCommunity(snapshot) ||
    Boolean(snapshot.rulesChannelKey) ||
    Boolean(snapshot.publicUpdatesChannelKey) ||
    Boolean(snapshot.safetyAlertsChannelKey)
  );
}

export function needsCommunitySetup(snapshot) {
  return (
    shouldReuseCommunityChannels(snapshot) ||
    snapshot.channels.some((channel) => channel.type === ChannelType.GuildAnnouncement)
  );
}

export function isCommunityManagedChannel(channelData, snapshot) {
  if (
    channelData.key === snapshot.rulesChannelKey ||
    channelData.key === snapshot.publicUpdatesChannelKey ||
    channelData.key === snapshot.safetyAlertsChannelKey
  ) {
    return true;
  }

  if (snapshot.publicUpdatesChannelKey && isPublicUpdatesChannelName(channelData.name)) {
    return channelData.key !== snapshot.publicUpdatesChannelKey;
  }

  if (snapshot.rulesChannelKey && isRulesChannelName(channelData.name)) {
    return channelData.key !== snapshot.rulesChannelKey;
  }

  if (snapshot.safetyAlertsChannelKey && channelData.name === 'mod-log') {
    return channelData.key !== snapshot.safetyAlertsChannelKey;
  }

  return false;
}

export function findExistingCommunityChannels(guild) {
  const rulesChannel = guild.rulesChannelId
    ? guild.channels.cache.get(guild.rulesChannelId)
    : guild.channels.cache.find(
        (channel) => channel.type === ChannelType.GuildText && isRulesChannelName(channel.name),
      );

  const updatesChannel = guild.publicUpdatesChannelId
    ? guild.channels.cache.get(guild.publicUpdatesChannelId)
    : guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildText && isPublicUpdatesChannelName(channel.name),
      );

  const safetyAlertsChannel = guild.safetyAlertsChannelId
    ? guild.channels.cache.get(guild.safetyAlertsChannelId)
    : null;

  return { rulesChannel, updatesChannel, safetyAlertsChannel };
}

export function getMappedCommunityChannelIds(guild, snapshot, createdChannelMap) {
  return new Set(
    [
      createdChannelMap.get(snapshot.rulesChannelKey),
      createdChannelMap.get(snapshot.publicUpdatesChannelKey),
      createdChannelMap.get(snapshot.safetyAlertsChannelKey),
      guild.rulesChannelId,
      guild.publicUpdatesChannelId,
      guild.safetyAlertsChannelId,
    ].filter(Boolean),
  );
}
