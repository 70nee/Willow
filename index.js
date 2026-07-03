import { Client, Events, GatewayIntentBits, PermissionFlagsBits, MessageFlags } from 'discord.js';
import './env.js';
import { getCommand, registerSlashCommands } from './commands/index.js';
import { sendError } from './utils/interactions.js';
import { sendWelcomeMessage } from './lib/botMessages.js';
import { getHelpCommandMention } from './lib/commandMeta.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
});

let commandInProgress = false;
const welcomeInFlight = new Map();

async function handleBotJoinedGuild(guild) {
  if (welcomeInFlight.has(guild.id)) {
    return welcomeInFlight.get(guild.id);
  }

  const task = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await sendWelcomeMessage(guild, client);
  })().catch((error) => {
    console.error(`Failed to send welcome message (${guild.name}):`, error.message);
  });

  welcomeInFlight.set(guild.id, task);

  try {
    await task;
  } finally {
    welcomeInFlight.delete(guild.id);
  }
}

client.on(Events.GuildCreate, (guild) => {
  handleBotJoinedGuild(guild);
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (member.id === client.user?.id) {
    await handleBotJoinedGuild(member.guild);
  }
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  try {
    await registerSlashCommands(process.env.DISCORD_TOKEN, process.env.CLIENT_ID);
    console.log('Slash commands registered.');
  } catch (error) {
    console.error('Failed to register slash commands:', error.message);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.mentions.users.has(client.user?.id)) {
    return;
  }

  try {
    await message.reply(`Hey...dunno what's happening around? Use ${getHelpCommandMention()}`);
  } catch (error) {
    console.error('Failed to reply to mention:', error.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'These commands can only be used inside a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const command = getCommand(interaction.commandName);
  if (!command) {
    return;
  }

  if (!command.adminOnly) {
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      await sendError(interaction, `Something went wrong: ${error.message}`);
    }
    return;
  }

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: 'You need **Administrator** permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const botMember = interaction.guild.members.me;
  if (!botMember.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: 'I need **Administrator** permission in this server to manage channels and roles.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (command.longRunning && commandInProgress) {
    await interaction.reply({
      content: 'I am still working on another command. Please wait until it finishes.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    if (command.longRunning) {
      commandInProgress = true;
    }

    await command.execute(interaction, { botMember, client });
  } catch (error) {
    console.error(error);
    await sendError(interaction, `Something went wrong: ${error.message}`);
  } finally {
    if (command.longRunning) {
      commandInProgress = false;
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
