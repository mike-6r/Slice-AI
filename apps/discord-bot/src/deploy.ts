import { REST, Routes } from 'discord.js';
import { loadConfig } from './config.js';
import { discordCommandInventory } from './command-inventory.js';
const config = loadConfig();
const rest = new REST({ version: '10' }).setToken(config.DISCORD_BOT_TOKEN);
const route = config.DISCORD_DEV_GUILD_ID ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_DEV_GUILD_ID) : Routes.applicationCommands(config.DISCORD_CLIENT_ID);
const commands = discordCommandInventory;
await rest.put(route, { body: commands.map((command) => command.toJSON()) });
process.stdout.write(`Slice AI commands synchronized (${commands.length} commands).\n`);
