import { SlashCommandBuilder, type SlashCommandSubcommandBuilder } from 'discord.js';

const period = (option: SlashCommandSubcommandBuilder) => option.addStringOption((input) => input.setName('period').setDescription('Reporting period').setRequired(true).addChoices({ name: '24 hours', value: '24h' }, { name: '7 days', value: '7d' }, { name: '30 days', value: '30d' }));
export const analyticsCommand = new SlashCommandBuilder().setName('analytics').setDescription('Staff operational analytics')
  .addSubcommand((sub) => period(sub.setName('overview').setDescription('View the operations overview')))
  .addSubcommand((sub) => period(sub.setName('engagement').setDescription('View community engagement')))
  .addSubcommand((sub) => period(sub.setName('community').setDescription('View community feature activity')))
  .addSubcommand((sub) => period(sub.setName('support').setDescription('View support operations')))
  .addSubcommand((sub) => period(sub.setName('commands').setDescription('View command usage')))
  .addSubcommand((sub) => period(sub.setName('publishing').setDescription('View publishing operations')))
  .addSubcommand((sub) => sub.setName('health').setDescription('View gateway and worker health'))
  .addSubcommand((sub) => period(sub.setName('export').setDescription('Export safe daily aggregate analytics')));
