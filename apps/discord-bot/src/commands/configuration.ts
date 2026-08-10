import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { SliceEmbed } from '../embeds/slice-embed.js';
import { presentationConfig, reloadPresentationConfig } from '../presentation-config.js';

export const configurationCommand = new SlashCommandBuilder().setName('config').setDescription(presentationConfig()['commands.yml'].descriptions.config).setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addSubcommand((subcommand) => subcommand.setName('reload').setDescription('Reload safe YAML presentation configuration'));
export async function handleConfigurationCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) { await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [SliceEmbed.error('Administrator required', 'Only a Discord server administrator can reload configuration.')] }); return; }
  try { reloadPresentationConfig(); await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [SliceEmbed.success('Configuration reloaded', 'Safe YAML presentation settings are active. Restart the bot for environment or credential changes.')] }); }
  catch (error) { await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [SliceEmbed.error('Configuration reload failed', error instanceof Error ? error.message.slice(0, 1500) : 'Configuration could not be loaded.')] }); }
}
