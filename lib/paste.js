import {
  ChannelType,
  GuildExplicitContentFilter,
  GuildVerificationLevel,
  Routes,
} from 'discord.js';
import {
  findExistingCommunityChannels,
  getMappedCommunityChannelIds,
  isCommunityManagedChannel,
  isCommunityChannelName,
  shouldEnableCommunity,
  shouldReuseCommunityChannels,
} from './communityChannels.js';

const ANNOUNCEMENT_CHANNEL_TYPE = ChannelType.GuildAnnouncement;
const CATEGORY_CHANNEL_TYPE = ChannelType.GuildCategory;

function channelTypeOf(channel) {
  return Number(channel.type);
}

function isCategoryChannel(channel) {
  return channelTypeOf(channel) === CATEGORY_CHANNEL_TYPE;
}

function isAnnouncementChannel(channel) {
  return channelTypeOf(channel) === ANNOUNCEMENT_CHANNEL_TYPE;
}

function needsAnnouncementChannels(snapshot) {
  return snapshot.channels.some(isAnnouncementChannel);
}

async function removeDuplicateCommunityChannels(guild, snapshot, createdChannelMap) {
  const mappedIds = getMappedCommunityChannelIds(guild, snapshot, createdChannelMap);

  for (const channel of guild.channels.cache.values()) {
    if (mappedIds.has(channel.id) || !channel.deletable || !isCommunityChannelName(channel.name)) {
      continue;
    }

    await channel.delete('Removed duplicate Discord Community channel').catch(() => {});
  }
}

function resolveOverwriteTarget(overwrite, guild, roleMap) {
  if (overwrite.type === 0) {
    if (overwrite.targetId === overwrite.sourceGuildId) {
      return guild.id;
    }

    if (overwrite.targetName === '@everyone') {
      return guild.id;
    }

    const mappedRoleId = roleMap.get(overwrite.targetName);
    if (mappedRoleId) {
      return mappedRoleId;
    }

    const existingRole = guild.roles.cache.find((role) => role.name === overwrite.targetName);
    return existingRole?.id ?? null;
  }

  const member =
    guild.members.cache.find((entry) => entry.user.tag === overwrite.targetName) ??
    guild.members.cache.get(overwrite.targetId);

  return member?.id ?? null;
}

function buildPermissionOverwrites(overwrites, guild, roleMap, sourceGuildId) {
  const result = [];

  for (const overwrite of overwrites) {
    const id = resolveOverwriteTarget({ ...overwrite, sourceGuildId }, guild, roleMap);
    if (!id) {
      continue;
    }

    result.push({
      id,
      type: overwrite.type,
      allow: BigInt(overwrite.allow),
      deny: BigInt(overwrite.deny),
    });
  }

  return result;
}

function buildChannelOptions(channelData, snapshot, guild, roleMap, parentId, typeOverride) {
  const channelType = typeOverride ?? channelTypeOf(channelData);
  const permissionOverwrites = buildPermissionOverwrites(
    channelData.permissionOverwrites,
    guild,
    roleMap,
    snapshot.sourceGuildId,
  );

  const options = {
    name: channelData.name,
    type: channelType,
    parent: parentId,
    permissionOverwrites,
    reason: `Pasted from ${snapshot.sourceGuildName}`,
  };

  if (channelType === ChannelType.GuildText || channelType === ChannelType.GuildAnnouncement) {
    options.topic = channelData.topic ?? undefined;
    options.nsfw = channelData.nsfw;
    options.rateLimitPerUser = channelData.rateLimitPerUser ?? undefined;
  }

  if (channelType === ChannelType.GuildVoice || channelType === ChannelType.GuildStageVoice) {
    options.bitrate = channelData.bitrate ?? undefined;
    options.userLimit = channelData.userLimit ?? undefined;
  }

  if (channelType === ChannelType.GuildForum) {
    options.topic = channelData.topic ?? undefined;
    options.nsfw = channelData.nsfw;
    options.rateLimitPerUser = channelData.rateLimitPerUser ?? undefined;
  }

  return options;
}

function resolveParentId(channelData, createdChannelMap) {
  if (!channelData.parentKey) {
    return null;
  }

  return createdChannelMap.get(channelData.parentKey) ?? null;
}

function getProtectedChannelIds(guild) {
  return new Set(
    [
      guild.rulesChannelId,
      guild.publicUpdatesChannelId,
      guild.systemChannelId,
      guild.safetyAlertsChannelId,
    ].filter(Boolean),
  );
}

function isProtectedChannel(channel, guild) {
  return getProtectedChannelIds(guild).has(channel.id);
}

function isCommunityActive(guild) {
  return (
    guild.features.includes('COMMUNITY') &&
    Boolean(guild.rulesChannelId) &&
    Boolean(guild.publicUpdatesChannelId)
  );
}

async function refreshGuildState(guild) {
  await guild.fetch(true);
  await guild.channels.fetch();
}

function mapCommunityChannelsFromGuild(guild, snapshot, createdChannelMap) {
  const { rulesChannel, updatesChannel, safetyAlertsChannel } = findExistingCommunityChannels(guild);

  if (snapshot.rulesChannelKey) {
    const rulesChannelId = guild.rulesChannelId ?? rulesChannel?.id;
    if (rulesChannelId) {
      createdChannelMap.set(snapshot.rulesChannelKey, rulesChannelId);
    }
  }

  if (snapshot.publicUpdatesChannelKey) {
    const updatesChannelId = guild.publicUpdatesChannelId ?? updatesChannel?.id;
    if (updatesChannelId) {
      createdChannelMap.set(snapshot.publicUpdatesChannelKey, updatesChannelId);
    }
  }

  if (snapshot.safetyAlertsChannelKey && safetyAlertsChannel) {
    createdChannelMap.set(snapshot.safetyAlertsChannelKey, safetyAlertsChannel.id);
  }
}

function getSnapshotChannel(snapshot, key) {
  return snapshot.channels.find((channel) => channel.key === key) ?? null;
}

async function applySnapshotSettingsToCommunityChannels(guild, snapshot, createdChannelMap, roleMap, reason) {
  const channelMappings = [
    {
      key: snapshot.rulesChannelKey,
      channelId: createdChannelMap.get(snapshot.rulesChannelKey) ?? guild.rulesChannelId,
    },
    {
      key: snapshot.publicUpdatesChannelKey,
      channelId: createdChannelMap.get(snapshot.publicUpdatesChannelKey) ?? guild.publicUpdatesChannelId,
    },
  ];

  for (const mapping of channelMappings) {
    if (!mapping.key || !mapping.channelId) {
      continue;
    }

    const channelData = getSnapshotChannel(snapshot, mapping.key);
    const channel = guild.channels.cache.get(mapping.channelId);
    if (!channelData || !channel) {
      continue;
    }

    const permissionOverwrites = buildPermissionOverwrites(
      channelData.permissionOverwrites,
      guild,
      roleMap,
      snapshot.sourceGuildId,
    );

    await channel
      .edit({
        name: channelData.name,
        topic: channelData.topic ?? undefined,
        nsfw: channelData.nsfw,
        rateLimitPerUser: channelData.rateLimitPerUser ?? undefined,
        permissionOverwrites,
        reason,
      })
      .catch((error) => {
        console.error(`Failed to configure #${channelData.name}:`, error.message);
      });
  }
}

async function patchCommunityFeature(guild, snapshot, reason, rulesChannelId, updatesChannelId) {
  const body = {
    features: [...new Set([...guild.features, 'COMMUNITY'])],
    verification_level: GuildVerificationLevel.Low,
    default_message_notifications: 1,
    explicit_content_filter: GuildExplicitContentFilter.AllMembers,
    preferred_locale: snapshot.preferredLocale ?? 'en-US',
  };

  if (rulesChannelId) {
    body.rules_channel_id = rulesChannelId;
  }

  if (updatesChannelId) {
    body.public_updates_channel_id = updatesChannelId;
  }

  await guild.client.rest.patch(Routes.guild(guild.id), { body, reason });
}

async function createCommunityChannelIfMissing(
  guild,
  snapshot,
  roleMap,
  createdChannelMap,
  failures,
  channelKey,
) {
  if (!channelKey || createdChannelMap.has(channelKey)) {
    return;
  }

  const existing = guild.channels.cache.find(
    (channel) => channel.id === createdChannelMap.get(channelKey),
  );
  if (existing) {
    return;
  }

  const channelData = getSnapshotChannel(snapshot, channelKey);
  if (!channelData) {
    return;
  }

  await createChannel(guild, channelData, snapshot, roleMap, createdChannelMap, failures, {
    allowAnnouncements: false,
  });
}

async function ensureCommunityEnabled(guild, snapshot, createdChannelMap, roleMap, failures, reason) {
  if (!shouldEnableCommunity(snapshot)) {
    return { enabled: isCommunityActive(guild), alreadyEnabled: isCommunityActive(guild) };
  }

  await refreshGuildState(guild);

  if (isCommunityActive(guild)) {
    mapCommunityChannelsFromGuild(guild, snapshot, createdChannelMap);
    return { enabled: true, alreadyEnabled: true };
  }

  await createCommunityChannelIfMissing(
    guild,
    snapshot,
    roleMap,
    createdChannelMap,
    failures,
    snapshot.rulesChannelKey,
  );
  await createCommunityChannelIfMissing(
    guild,
    snapshot,
    roleMap,
    createdChannelMap,
    failures,
    snapshot.publicUpdatesChannelKey,
  );

  await refreshGuildState(guild);

  let { rulesChannel, updatesChannel } = findExistingCommunityChannels(guild);

  if (!rulesChannel && snapshot.rulesChannelKey) {
    const channelId = createdChannelMap.get(snapshot.rulesChannelKey);
    rulesChannel = channelId ? guild.channels.cache.get(channelId) : null;
  }

  if (!updatesChannel && snapshot.publicUpdatesChannelKey) {
    const channelId = createdChannelMap.get(snapshot.publicUpdatesChannelKey);
    updatesChannel = channelId ? guild.channels.cache.get(channelId) : null;
  }

  if (rulesChannel && updatesChannel) {
    mapCommunityChannelsFromGuild(guild, snapshot, createdChannelMap);

    try {
      await patchCommunityFeature(guild, snapshot, reason, rulesChannel.id, updatesChannel.id);
      await refreshGuildState(guild);
      mapCommunityChannelsFromGuild(guild, snapshot, createdChannelMap);
      return { enabled: isCommunityActive(guild), alreadyEnabled: false };
    } catch (error) {
      console.warn('Could not enable Community:', error.message);
    }
  }

  console.error('No Community channels available to enable Community on this server.');
  return { enabled: false, alreadyEnabled: false };
}

async function canCreateAnnouncementChannels(guild) {
  return isCommunityActive(guild);
}

async function fixChannelParents(guild, snapshot, createdChannelMap) {
  for (const channelData of snapshot.channels) {
    const channelId = createdChannelMap.get(channelData.key);
    if (!channelId) {
      continue;
    }

    const expectedParentId = resolveParentId(channelData, createdChannelMap);
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      continue;
    }

    const currentParentId = channel.parentId ?? null;
    if (currentParentId === expectedParentId) {
      continue;
    }

    await channel.setParent(expectedParentId, { lockPermissions: false }).catch((error) => {
      console.error(`Failed to move #${channelData.name} into category:`, error.message);
    });
  }
}

async function applyChannelPositions(guild, snapshot, createdChannelMap) {
  const groups = new Map();

  for (const channelData of snapshot.channels) {
    const channelId = createdChannelMap.get(channelData.key);
    if (!channelId) {
      continue;
    }

    const groupKey = channelData.parentKey ?? '__root__';
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }

    groups.get(groupKey).push({
      channel: channelId,
      position: channelData.position ?? 0,
    });
  }

  for (const entries of groups.values()) {
    entries.sort((a, b) => a.position - b.position);

    if (entries.length === 0) {
      continue;
    }

    await guild.channels.setPositions(entries).catch((error) => {
      console.error('Failed to apply channel positions:', error.message);
    });
  }
}

export async function cleanGuild(guild, botMember) {
  await guild.fetch();
  await guild.channels.fetch();

  const protectedIds = getProtectedChannelIds(guild);
  const seen = new Set();
  const channelsToDelete = [];

  for (const channel of guild.channels.cache.values()) {
    if (seen.has(channel.id) || !channel.deletable || isProtectedChannel(channel, guild)) {
      continue;
    }

    seen.add(channel.id);
    channelsToDelete.push(channel);
  }

  channelsToDelete.sort((a, b) => b.rawPosition - a.rawPosition);

  for (const channel of channelsToDelete) {
    await channel.delete(`Clean server before paste by ${botMember.user.tag}`).catch(() => {});
  }

  const deletableRoles = [...guild.roles.cache.values()]
    .filter(
      (role) =>
        !role.managed &&
        role.id !== guild.id &&
        role.id !== botMember.roles.highest.id &&
        role.comparePositionTo(botMember.roles.highest) < 0,
    )
    .sort((a, b) => a.position - b.position);

  let deletedRoles = 0;
  for (const role of deletableRoles) {
    try {
      await role.delete(`Clean server before paste by ${botMember.user.tag}`);
      deletedRoles += 1;
    } catch {
      // skip roles the bot cannot delete
    }
  }

  return {
    preservedChannelIds: [...protectedIds],
    deletedChannels: channelsToDelete.length,
    deletedRoles,
  };
}

async function createChannel(
  guild,
  channelData,
  snapshot,
  roleMap,
  createdChannelMap,
  failures,
  { typeOverride, allowAnnouncements },
) {
  const parentId = resolveParentId(channelData, createdChannelMap);
  const wantsAnnouncement = isAnnouncementChannel(channelData);
  const canUseAnnouncement = wantsAnnouncement && allowAnnouncements;

  if (channelData.parentKey && !parentId) {
    console.warn(`Parent ${channelData.parentKey} missing for #${channelData.name}`);
  }

  if (wantsAnnouncement && !canUseAnnouncement && !typeOverride) {
    try {
      const fallbackChannel = await guild.channels.create(
        buildChannelOptions(channelData, snapshot, guild, roleMap, parentId, ChannelType.GuildText),
      );
      createdChannelMap.set(channelData.key, fallbackChannel.id);
      failures.push({
        name: channelData.name,
        type: channelData.type,
        error: 'Announcement channels unavailable, created as text instead',
      });
      return fallbackChannel;
    } catch (error) {
      failures.push({ name: channelData.name, type: channelData.type, error: error.message });
      return null;
    }
  }

  try {
    const createdChannel = await guild.channels.create(
      buildChannelOptions(channelData, snapshot, guild, roleMap, parentId, typeOverride ?? channelTypeOf(channelData)),
    );
    createdChannelMap.set(channelData.key, createdChannel.id);
    return createdChannel;
  } catch (error) {
    if (wantsAnnouncement && !typeOverride) {
      try {
        const fallbackChannel = await guild.channels.create(
          buildChannelOptions(channelData, snapshot, guild, roleMap, parentId, ChannelType.GuildText),
        );
        createdChannelMap.set(channelData.key, fallbackChannel.id);
        failures.push({
          name: channelData.name,
          type: channelData.type,
          error: `${error.message} (created as text channel instead)`,
        });
        return fallbackChannel;
      } catch (fallbackError) {
        failures.push({ name: channelData.name, type: channelData.type, error: fallbackError.message });
        return null;
      }
    }

    failures.push({ name: channelData.name, type: channelData.type, error: error.message });
    return null;
  }
}

export async function pasteGuild(guild, snapshot, botMember, onProgress) {
  await guild.roles.fetch();
  await guild.channels.fetch();

  const reason = `Pasted from ${snapshot.sourceGuildName}`;
  const roleMap = new Map();

  for (const roleData of snapshot.roles) {
    const existingRole = guild.roles.cache.find((role) => role.name === roleData.name && !role.managed);

    const role =
      existingRole ??
      (await guild.roles.create({
        name: roleData.name,
        color: roleData.color,
        hoist: roleData.hoist,
        mentionable: roleData.mentionable,
        permissions: BigInt(roleData.permissions),
        reason,
      }));

    if (existingRole) {
      await role
        .edit({
          color: roleData.color,
          hoist: roleData.hoist,
          mentionable: roleData.mentionable,
          permissions: BigInt(roleData.permissions),
          reason: `Updated from ${snapshot.sourceGuildName}`,
        })
        .catch(() => {});
    }

    roleMap.set(roleData.name, role.id);
  }

  if (snapshot.roles.length > 0) {
    const positionUpdates = snapshot.roles
      .map((roleData) => {
        const roleId = roleMap.get(roleData.name);
        if (!roleId) {
          return null;
        }

        return {
          role: roleId,
          position: roleData.position,
        };
      })
      .filter(Boolean);

    if (positionUpdates.length > 0) {
      await guild.roles.setPositions(positionUpdates).catch(() => {});
    }
  }

  const createdChannelMap = new Map();
  const failures = [];
  const handleCommunityChannels = shouldReuseCommunityChannels(snapshot);
  let communityResult = { enabled: isCommunityActive(guild), alreadyEnabled: isCommunityActive(guild) };

  const categories = snapshot.channels
    .filter(isCategoryChannel)
    .sort((a, b) => a.position - b.position);
  const announcementChannels = snapshot.channels.filter(isAnnouncementChannel);
  const standardChannels = snapshot.channels.filter((channel) => {
    if (isCategoryChannel(channel) || isAnnouncementChannel(channel)) {
      return false;
    }

    if (handleCommunityChannels && isCommunityManagedChannel(channel, snapshot)) {
      return false;
    }

    return true;
  });

  let processed = 0;
  const total =
    categories.length +
    standardChannels.length +
    announcementChannels.length +
    (shouldEnableCommunity(snapshot) ? 2 : 0);

  const reportProgress = async (step) => {
    processed += 1;
    if (onProgress && (processed % 5 === 0 || processed === total)) {
      await onProgress(`Pasting... ${processed}/${total} (${step})`).catch(() => {});
    }
  };

  if (onProgress) {
    await onProgress('Creating categories...').catch(() => {});
  }

  for (const channelData of categories) {
    await createChannel(guild, channelData, snapshot, roleMap, createdChannelMap, failures, {
      allowAnnouncements: false,
    });
    await reportProgress('categories');
  }

  if (shouldEnableCommunity(snapshot)) {
    if (onProgress) {
      await onProgress('Checking Community status...').catch(() => {});
    }

    await refreshGuildState(guild);
    communityResult = await ensureCommunityEnabled(
      guild,
      snapshot,
      createdChannelMap,
      roleMap,
      failures,
      reason,
    );
    await applySnapshotSettingsToCommunityChannels(guild, snapshot, createdChannelMap, roleMap, reason);
    await removeDuplicateCommunityChannels(guild, snapshot, createdChannelMap);

    if (snapshot.rulesChannelKey) {
      await reportProgress('community-rules');
    }
    if (snapshot.publicUpdatesChannelKey) {
      await reportProgress('community-updates');
    }

    if (onProgress) {
      await onProgress(
        communityResult.alreadyEnabled
          ? 'Reusing Discord Community rules/updates channels...'
          : 'Community channels linked...',
      ).catch(() => {});
    }
  }

  if (onProgress) {
    await onProgress('Creating text and voice channels...').catch(() => {});
  }

  for (const channelData of standardChannels) {
    await createChannel(guild, channelData, snapshot, roleMap, createdChannelMap, failures, {
      allowAnnouncements: false,
    });
    await reportProgress('channels');
  }

  const allowAnnouncements = await canCreateAnnouncementChannels(guild);
  if (onProgress) {
    await onProgress(
      allowAnnouncements
        ? 'Creating announcement channels...'
        : 'Creating announcement channels as text...',
    ).catch(() => {});
  }

  for (const channelData of announcementChannels) {
    await createChannel(guild, channelData, snapshot, roleMap, createdChannelMap, failures, {
      allowAnnouncements,
    });
    await reportProgress('announcements');
  }

  if (onProgress) {
    await onProgress('Placing channels into categories and order...').catch(() => {});
  }

  await refreshGuildState(guild);
  await fixChannelParents(guild, snapshot, createdChannelMap);
  await applyChannelPositions(guild, snapshot, createdChannelMap);

  const pastedChannelIds = getMappedCommunityChannelIds(guild, snapshot, createdChannelMap);
  for (const channelId of createdChannelMap.values()) {
    pastedChannelIds.add(channelId);
  }

  return {
    rolesCreated: snapshot.roles.length,
    channelsCreated: createdChannelMap.size,
    channelsFailed: failures.length,
    failures,
    communityEnabled: communityResult.enabled || isCommunityActive(guild),
    communityAlreadyEnabled: communityResult.alreadyEnabled,
    reusedDiscordCommunityChannels: shouldEnableCommunity(snapshot) && communityResult.alreadyEnabled,
    pastedChannelIds: [...pastedChannelIds],
  };
}
