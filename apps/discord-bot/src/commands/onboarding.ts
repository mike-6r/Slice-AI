import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { FAQ, SliceWebsiteHandoffClient } from '../onboarding.js';
import { SliceEmbed } from '../embeds/slice-embed.js';
import { presentationConfig } from '../presentation-config.js';

const copy = presentationConfig()['commands.yml'];

export const accountCommand = new SlashCommandBuilder()
  .setName('account')
  .setDescription(copy.descriptions.account);
export const rolesCommand = new SlashCommandBuilder()
  .setName('roles')
  .setDescription(copy.descriptions.roles);
export const faqCommand = new SlashCommandBuilder()
  .setName('faq')
  .setDescription(copy.descriptions.faq)
  .addStringOption((option) =>
    option
      .setName('topic')
      .setDescription(copy.options.topic)
      .setAutocomplete(true),
  );
export const supportCommand = new SlashCommandBuilder()
  .setName('support')
  .setDescription(copy.descriptions.support);

export async function handleOnboardingCommand(
  interaction: ChatInputCommandInteraction,
  website: SliceWebsiteHandoffClient,
): Promise<void> {
  if (interaction.commandName === 'account') {
    return void (await replyWithHandoff(
      interaction,
      website,
      'account',
      'My Slice account',
      'Open Slice to securely connect or manage your account. Discord never collects credentials or identity documents.',
    ));
  }
  if (interaction.commandName === 'roles') {
    await interaction.reply({
      ephemeral: true,
      embeds: [SliceEmbed.configured('onboarding.yml', 'roles')],
    });
    return;
  }
  if (interaction.commandName === 'faq') {
    const topic = interaction.options.getString('topic')?.toLowerCase();
    const body = topic
      ? FAQ[topic]
      : Object.entries(FAQ)
          .map(([key, value]) => `**${key}** — ${value}`)
          .join('\n\n');
    await interaction.reply({
      ephemeral: true,
      embeds: [
        topic && !FAQ[topic]
          ? SliceEmbed.configured('onboarding.yml', 'faq_unavailable')
          : SliceEmbed.configured('onboarding.yml', 'faq', { reason: body ?? '' }),
      ],
    });
    return;
  }
  await interaction.reply({
    ephemeral: true,
    embeds: [SliceEmbed.configured('onboarding.yml', 'support')],
  });
}

export async function replyWithHandoff(
  interaction: ChatInputCommandInteraction,
  website: SliceWebsiteHandoffClient,
  destination: Parameters<SliceWebsiteHandoffClient['handoff']>[0],
  title: string,
  description: string,
): Promise<void> {
  const handoff = website.handoff(destination);
  if (!handoff.available) {
    await interaction.reply({
      ephemeral: true,
      embeds: [SliceEmbed.warning('Slice unavailable', handoff.message)],
    });
    return;
  }
  await interaction.reply({
    ephemeral: true,
    embeds: [SliceEmbed.info(title, description)],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('Open Slice')
          .setStyle(ButtonStyle.Link)
          .setURL(handoff.url),
      ),
    ],
  });
}
