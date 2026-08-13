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
import { SliceBackendClient, type BackendResult, type DiscordLinkStatus } from '../slice-backend-client.js';

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
  backend: SliceBackendClient,
): Promise<void> {
  if (interaction.commandName === 'account') {
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply(accountStatusPayload(await backend.getLinkStatus(interaction.user.id), website));
    return;
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

export function accountStatusPayload(result: BackendResult<DiscordLinkStatus>, website: SliceWebsiteHandoffClient) {
  if (!result.ok) return { embeds: [SliceEmbed.warning('Slice unavailable', result.message)] };
  if (!result.value.linked) return { embeds: [SliceEmbed.info('Connect your Slice account', 'Connect your account through the secure Slice handoff. Discord never collects credentials, codes, or identity documents.')], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('slice:onboarding:connect').setLabel('Connect account').setStyle(ButtonStyle.Primary))] };
  const account = result.value.user;
  const handoff = website.handoff('account');
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...(handoff.available ? [new ButtonBuilder().setLabel('Account settings').setStyle(ButtonStyle.Link).setURL(handoff.url)] : []), new ButtonBuilder().setCustomId('slice:onboarding:unlink').setLabel('Disconnect').setStyle(ButtonStyle.Secondary));
  return { embeds: [SliceEmbed.success('Slice account connected', [account.username ? `@${account.username}` : 'Slice account connected', account.roles.join(' / ') || 'Investor', account.preferredCurrency ? `Preferred currency: ${account.preferredCurrency}` : null].filter(Boolean).join('\n'))], components: [row] };
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
