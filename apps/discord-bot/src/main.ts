import { ActionRowBuilder, ActivityType, ButtonBuilder, ButtonStyle, Client, Events, GatewayIntentBits, ModalBuilder, REST, Routes, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder, type ButtonInteraction, type ChatInputCommandInteraction, type Guild, type GuildMember, type ModalSubmitInteraction, type StringSelectMenuInteraction, type UserSelectMenuInteraction } from 'discord.js';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { PrismaClient } from '../generated/prisma/index.js';
import { accountStatusPayload, handleOnboardingCommand } from './commands/onboarding.js';
import { ticketCommandInput } from './commands/tickets.js';
import { handleSetup, handleSetupButton, handleSetupRefresh } from './commands/setup.js';
import { loadConfig } from './config.js';
import { createDiscordTicketAuthorization } from './discord-ticket-authorization.js';
import { SliceEmbed } from './embeds/slice-embed.js';
import { Logger } from './logger.js';
import { FAQ, SliceWebsiteHandoffClient, type SliceDestination } from './onboarding.js';
import { PrismaSetupRepository } from './persistence/setup-repository.js';
import { PrismaTicketRepository } from './persistence/ticket-repository.js';
import { SetupProvisioner } from './setup/provisioner.js';
import { TicketCreationError, TicketCreationService } from './ticket-creation.js';
import { createTicketDiscordBoundary, lockTicketChannel, refreshTicketMessage, type TicketControlMessage } from './ticket-discord.js';
import { TicketLifecycleService } from './ticket-lifecycle.js';
import { parseTicketControlId, ticketControlId, TicketInteractionRouter, type TicketRouteAction, type TicketRouteContext, type TicketRouteResult } from './ticket-routing.js';
import { TicketTranscriptService, type TicketHistory } from './ticket-transcripts.js';
import { handleModerationCommand } from './commands/moderation.js';
import { DiscordModerationAuthorization, evaluateAutomod, ManualModerationService, ModerationService } from './moderation.js';
import { PrismaModerationRepository } from './persistence/moderation-repository.js';
import { createDiscordModerationTransport } from './discord-moderation.js';
import { PrismaProgressionRepository } from './persistence/progression-repository.js';
import { MemberProgressionService } from './progression.js';
import { handleProgressionCommand } from './commands/progression.js';
import { handleCommunityCommand, pollPayload, suggestionPayload } from './commands/community.js';
import { PrismaCommunityRepository } from './persistence/community-repository.js';
import { CUSTOMER_NOTIFICATION_CATALOG, NotificationRoleReconciliationService, NotificationRoleUnavailableError, customerNotificationMenu, notificationMenu } from './notification-roles.js';
import { handleMarketCommand } from './commands/market.js';
import { SliceBackendClient } from './slice-backend-client.js';
import { PrismaInvestorProfileRepository } from './persistence/investor-profile-repository.js';
import { handlePriceAlert } from './commands/price-alerts.js';
import { PrismaDiscordDeliveryRepository } from './persistence/discord-delivery-repository.js';
import { handleIntelligence } from './commands/intelligence.js';
import { SliceAiService } from './slice-ai.js';
import { handleGapSweep } from './commands/gap-sweep.js';
import { handleConfigurationCommand } from './commands/configuration.js';
import { presentationConfig, renderTemplate } from './presentation-config.js';
import { isSliceStaff, staffOperationsPayload, staffPanelPayload } from './staff-operations.js';
import { SliceAdminRouteBuilder } from './admin-routes.js';
import { discordCommandInventory } from './command-inventory.js';
import { SliceCustomerRouteBuilder } from './customer-routes.js';
import { connectPayload, mySliceActionsPayload, mySlicePayload } from './my-slice.js';
import { DiscordHumanVerification } from './discord-human-verification.js';
import { DiscordPaginator } from './paginator.js';
import { handleGiveawayButton, handleGiveawayCommand, publishGiveawayCompletion, refreshGiveawayMessage } from './commands/giveaway.js';
import { PrismaGiveawayRepository } from './persistence/giveaway-repository.js';
import { handleMemeCommand } from './commands/meme.js';
import { PrismaMemeCompetitionRepository } from './persistence/meme-competition-repository.js';
import { publishMemeResult, resolveMemeCompetition } from './meme-competition-worker.js';
import { builderControls, canManageEmbeds, renderEmbed, validateEmbed, type EmbedPayload } from './embed-builder.js';
import { PrismaEmbedRepository } from './persistence/embed-repository.js';
import { publishEmbed, publishableChannel } from './embed-publication.js';
import { PrismaAnnouncementScheduleRepository } from './persistence/announcement-schedule-repository.js';
import { handleScheduleButton, handleScheduleCommand, type ScheduleSessions } from './schedule-command-handler.js';
import { parseWeekdays, validateTiming, type ScheduleTiming } from './announcement-schedule.js';

const config = loadConfig();
const logger = new Logger();
const prisma = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } } });
const repository = new PrismaSetupRepository(prisma);
const tickets = new PrismaTicketRepository(prisma);
const lifecycle = new TicketLifecycleService(tickets);
const transcripts = new TicketTranscriptService(tickets);
const moderationRepository = new PrismaModerationRepository(prisma);
const progressionPresentation = presentationConfig()['progression.yml'];
const progression = new MemberProgressionService(new PrismaProgressionRepository(prisma), { ...config, XP_MESSAGE_MIN: progressionPresentation.xp.minimum, XP_MESSAGE_MAX: progressionPresentation.xp.maximum, XP_COOLDOWN_SECONDS: progressionPresentation.xp.cooldown_seconds, XP_MIN_MESSAGE_LENGTH: progressionPresentation.xp.minimum_message_length, REPUTATION_COOLDOWN_HOURS: progressionPresentation.reputation.cooldown_hours, DAILY_XP_REWARD: progressionPresentation.daily.reward });
const community = new PrismaCommunityRepository(prisma);
const notificationRoles = new NotificationRoleReconciliationService(repository, (event, fields) => logger.warn(event, fields));
const market = new SliceBackendClient({ baseUrl: config.SLICE_API_BASE_URL, serviceToken: config.SLICE_BOT_SERVICE_TOKEN });
const investorProfiles = new PrismaInvestorProfileRepository(prisma);
const discordDeliveries = new PrismaDiscordDeliveryRepository(prisma);
const ai = new SliceAiService(config);
const provisioner = new SetupProvisioner(repository, join(process.cwd(), 'assets', 'generated'));
const links = new SliceWebsiteHandoffClient(config.SLICE_WEB_BASE_URL);
const adminRoutes = new SliceAdminRouteBuilder(config.SLICE_WEB_BASE_URL);
const customerRoutes = new SliceCustomerRouteBuilder(config.SLICE_WEB_BASE_URL);
const humanVerification = new DiscordHumanVerification();
const paginator = new DiscordPaginator();
const giveaways = new PrismaGiveawayRepository(prisma);
const memes = new PrismaMemeCompetitionRepository(prisma);
const embeds = new PrismaEmbedRepository(prisma);
const announcementSchedules = new PrismaAnnouncementScheduleRepository(prisma);
const embedSessions = new Map<string, { guildId: string; actorId: string; draftId: string; expiresAt: number }>();
const scheduleSessions: ScheduleSessions = new Map();
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const categories = new Set(presentationConfig()['tickets.yml'].categories.map((category) => category.key));
const messageSafetyWindow = new Map<string, { timestamps: number[]; messages: Array<{ content: string; at: number }> }>();
const health = createServer((request, response) => { const ok = request.url === '/health' || request.url === '/ready' && client.isReady(); response.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' }); response.end(JSON.stringify({ status: ok ? 'ok' : 'not_ready' })); });

client.once(Events.ClientReady, (ready) => { logger.info('discord.ready', { user: ready.user.tag }); void reconcileNotificationRoles(); const presence = ['the Slice Market', 'community discussions', 'Slice support']; let index = 0; ready.user.setPresence({ activities: [{ name: presence[index]!, type: ActivityType.Watching }], status: 'online' }); setInterval(() => { index = (index + 1) % presence.length; ready.user.setPresence({ activities: [{ name: presence[index]!, type: ActivityType.Watching }], status: 'online' }); }, 10 * 60_000); });
client.on(Events.GuildMemberAdd, (member) => { void reconcileNotificationMember(member); });
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild || !message.guildId) return;
  const blocked = await isAutomodBlocked(message);
  const ticket = await tickets.findByChannel(message.guildId, message.channelId);
  if (ticket) {
    const actor = await createDiscordTicketAuthorization(message.guild, repository).actor(ticket, message.author.id);
    if (ticket.creatorId === message.author.id || actor.staff) await tickets.recordActivity(message.guildId, message.channelId);
  }
  // This is deliberately last in the message pipeline: any future safety blocker
  // must set blocked before this community-only progression authority is reached.
  const result = await progression.awardMessageXp({ guildId: message.guildId, discordUserId: message.author.id, content: message.content, isBot: message.author.bot, isSystem: message.system, isCommand: message.content.startsWith('/'), blocked });
  if (!result) return;
  if (result.leveledUp) {
    await applyLevelMilestoneRole(message.guild, message.author.id, result.progression.level);
    if (config.LEVEL_UP_ANNOUNCEMENTS_ENABLED && message.channel.isSendable()) { const template = presentationConfig()['progression.yml'].messages.level_up; await message.channel.send({ embeds: [SliceEmbed.success(renderTemplate(template.title, { level: result.progression.level }), renderTemplate(template.description, { user: message.author.id, level: result.progression.level }))] }); }
  }
  if (result.unlocked.length && message.channel.isSendable()) { const template = presentationConfig()['progression.yml'].messages.achievement; await message.channel.send({ embeds: [SliceEmbed.info(renderTemplate(template.title, { count: result.unlocked.length }), renderTemplate(template.description, { user: message.author.id, count: result.unlocked.length }))] }); }
});
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') return void await handleSetup(interaction, repository, provisioner);
    if (interaction.isChatInputCommand() && interaction.commandName === 'config') return void await handleConfigurationCommand(interaction);
    if (interaction.isChatInputCommand() && interaction.commandName === 'slice') return void await handleMySlice(interaction);
    if (interaction.isChatInputCommand() && interaction.commandName === 'ops') return void await handleStaffOperations(interaction);
    if (interaction.isChatInputCommand() && ['account', 'roles', 'faq', 'support'].includes(interaction.commandName)) return void await handleOnboardingCommand(interaction, links, market);
    if (interaction.isChatInputCommand() && interaction.commandName === 'ticket') return void await handleTicketCommand(interaction);
    if (interaction.isChatInputCommand() && ['warn', 'note', 'timeout', 'untimeout', 'ban', 'unban', 'modcase', 'modhistory'].includes(interaction.commandName)) return void await handleModerationCommand(interaction, moderationForGuild(interaction.guild!), await moderationActor(interaction), (id, action) => moderationTarget(interaction.guild!, id, action));
    if (interaction.isChatInputCommand() && ['level', 'leaderboard', 'rep', 'reputation', 'achievements', 'daily'].includes(interaction.commandName)) return void await handleProgressionCommand(interaction, progression);
    if (interaction.isChatInputCommand() && ['notifications', 'suggest', 'suggestion', 'poll', 'birthday'].includes(interaction.commandName)) return void await handleCommunityCommand(interaction, community, config, communityChannel(interaction.guild!), async () => notificationResponse(interaction), refreshSuggestion);
    if (interaction.isChatInputCommand() && interaction.commandName === 'giveaway') return void await handleGiveawayCommand(interaction, giveaways, () => communityChannel(interaction.guild!)('general'), (giveaway) => publishGiveawayCompletion(client, giveaways, giveaway), (giveaway) => refreshGiveawayMessage(client, giveaway));
    if (interaction.isChatInputCommand() && interaction.commandName === 'meme') return void await handleMemeCommand(interaction, memes, config.MEME_COMPETITION_VOTE_EMOJI, async (competition, actorDiscordId, automatic) => { const result = await resolveMemeCompetition(client, memes, competition, actorDiscordId, automatic, config.MEME_COMPETITION_VOTE_EMOJI); if (result?.closedNow && !(await publishMemeResult(client, memes, result.competition, config.MEME_COMPETITION_VOTE_EMOJI))) logger.warn('meme.result_announcement_failed', { competitionId: result.competition.id }); return result; });
    if (interaction.isChatInputCommand() && interaction.commandName === 'embed') return void await handleEmbedCommand(interaction);
    if (interaction.isChatInputCommand() && interaction.commandName === 'schedule') return void await handleScheduleCommand(interaction, announcementSchedules, embeds, scheduleSessions);
    if (interaction.isChatInputCommand() && ['card', 'search', 'value', 'price', 'history', 'top', 'asset', 'market', 'collector', 'vault', 'portfolio', 'balance', 'transactions', 'watchlist', 'profile'].includes(interaction.commandName)) return void await handleMarketCommand(interaction, market, links, progression, investorProfiles, paginator);
    if (interaction.isChatInputCommand() && interaction.commandName === 'pricealert') return void await handlePriceAlert(interaction, discordDeliveries, market);
    if (interaction.isChatInputCommand() && ['ask', 'help', 'summary', 'insights', 'trending', 'about', 'status'].includes(interaction.commandName)) return void await handleIntelligence(interaction, ai, market);
    if (interaction.isChatInputCommand() && ['invite', 'roadmap', 'announce', 'request', 'offer'].includes(interaction.commandName)) return void await handleGapSweep(interaction, repository, config.OFFICIAL_DISCORD_INVITE_URL);
    if (interaction.isButton() && interaction.customId === 'slice:setup:refresh') { if (!interaction.guild) return; if (!interaction.memberPermissions?.has('Administrator')) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Administrator required', 'Only a Discord server administrator can review setup updates.')] }); return void await handleSetupRefresh(interaction, provisioner); }
    if (interaction.isButton() && interaction.customId.startsWith('slice:page:')) return void await paginator.handle(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('slice:setup:')) { if (!interaction.guild) return; await interaction.deferUpdate(); const result = await handleSetupButton(interaction.customId, interaction.user.id, interaction.guild.id, { apply: async () => provisioner.apply(interaction.guild!), reset: async () => provisioner.reset(interaction.guild!) }); return void await interaction.editReply({ embeds: [SliceEmbed.success(result.title, result.body)], components: [] }); }
    if (interaction.isButton() && interaction.customId === 'slice:ticket:open') return void await openTicketPicker(interaction);
    if (interaction.isButton() && interaction.customId === 'slice:ticket:mine') return void await listMyTickets(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('slice:ticket:')) return void await handleTicketButton(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('slice:giveaway:')) return void await handleGiveawayButton(interaction, giveaways, (giveaway) => refreshGiveawayMessage(client, giveaway));
    if (interaction.isStringSelectMenu() && interaction.customId === 'slice:ticket:create') return void await handleTicketCreationCategory(interaction);
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('slice:ticket:')) return void await handleTicketPriority(interaction);
    if (interaction.isUserSelectMenu() && interaction.customId.startsWith('slice:ticket:')) return void await handleTicketTransfer(interaction);
    if (interaction.isModalSubmit() && interaction.customId.startsWith('slice:ticket:intake:')) return void await handleTicketIntake(interaction);
    if (interaction.isStringSelectMenu() && interaction.customId === 'slice:roles:notifications') return void await handleNotificationRoles(interaction);
    if (interaction.isStringSelectMenu() && interaction.customId === 'slice:notifications:customer') return void await handleCustomerNotifications(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('slice:community:suggestion:')) return void await handleSuggestionVote(interaction);
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('slice:community:poll:')) return void await handlePollVote(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('slice:staff:')) return void await handleStaffPanel(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('slice:my-slice:')) return void await handleMySliceButton(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('slice:verify:human:')) return void await handleHumanVerification(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('slice:onboarding:')) return void await handleOnboardingButton(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('slice:embed:')) return void await handleEmbedButton(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('slice:schedule:')) return void await handleScheduleButton(interaction, announcementSchedules, scheduleSessions);
    if (interaction.isModalSubmit() && interaction.customId.startsWith('slice:embed:')) return void await handleEmbedModal(interaction);
  } catch (error) {
    const ref = `SLC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    logger.error('interaction.failed', { reference: ref, name: error instanceof Error ? error.name : 'unknown', message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    const payload = { ephemeral: true, embeds: [SliceEmbed.error('Interaction unavailable', `Reference: ${ref}\n\nSlice couldn't complete that request right now. Try again shortly.`)] };
    if (interaction.isRepliable()) await (interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload));
  }
});

async function handleTicketCreationCategory(interaction: StringSelectMenuInteraction): Promise<void> {
  const category = interaction.values[0];
  if (!interaction.guildId || !categories.has(category)) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Invalid ticket category', 'Choose a category from the Slice ticket panel.')] });
  const modal = new ModalBuilder().setCustomId(`slice:ticket:intake:${category}`).setTitle('Create support ticket').addComponents(row('subject', 'Subject', TextInputStyle.Short, true, 120), row('description', 'Short description', TextInputStyle.Paragraph, true, 1800), row('reference', 'Optional safe reference ID', TextInputStyle.Short, false, 120));
  await interaction.showModal(modal);
}

async function handleEmbedCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!canManageEmbeds(interaction) || !interaction.guildId) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Embed publishing required', 'Only staff with Manage Server can build or publish embeds.')] });
  const sub = interaction.options.getSubcommand();
  if (sub === 'list') { const drafts = await embeds.list(interaction.guildId); return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.info('Embed drafts', drafts.length ? drafts.map((draft) => `\`${draft.id.slice(0, 8)}\` · **${draft.name}** · v${draft.version}${draft.lastPublishedAt ? ' · published' : ''}`).join('\n') : 'No saved drafts.')] }); }
  if (sub === 'clone') { const draft = await embeds.clone(interaction.options.getString('draft', true), interaction.guildId, interaction.user.id, interaction.options.getString('name', true)); return void await interaction.reply({ ephemeral: true, embeds: [draft ? SliceEmbed.success('Draft cloned', `Created **${draft.name}**.`) : SliceEmbed.error('Draft unavailable', 'That draft is unavailable.')] }); }
  let draft;
  if (sub === 'edit') draft = await embeds.get(interaction.options.getString('draft', true), interaction.guildId);
  else if (sub === 'import') { try { const parsed = JSON.parse(interaction.options.getString('json', true)) as { payload?: EmbedPayload; linkButtons?: unknown[] }; const payload = parsed.payload ?? parsed as EmbedPayload; const buttons = Array.isArray(parsed.linkButtons) ? parsed.linkButtons as Array<{ label: string; url: string; emoji?: string }> : []; const errors = validateEmbed(payload, buttons); if (errors.length) throw new Error(errors[0]); draft = await embeds.create(interaction.guildId, interaction.user.id, interaction.options.getString('name', true), payload, buttons); } catch { return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Import unavailable', 'Provide only a valid, Discord-safe embed payload.')] }); } }
  else draft = await embeds.create(interaction.guildId, interaction.user.id, interaction.options.getString('name', true));
  if (!draft) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Draft unavailable', 'That saved draft is unavailable.')] });
  const target = interaction.channel?.isTextBased() ? interaction.channelId : null; if (target) draft = (await embeds.save(draft.id, interaction.guildId, interaction.user.id, draft.version, { payload: draft.payload, buttons: draft.buttons, targetChannelId: target })) ?? draft;
  embedSessions.set(draft.id, { guildId: interaction.guildId, actorId: interaction.user.id, draftId: draft.id, expiresAt: Date.now() + 15 * 60_000 });
  await interaction.reply({ ephemeral: true, embeds: [embedDashboard(draft)], components: builderControls(draft.id) });
}
async function handleEmbedButton(interaction: ButtonInteraction): Promise<void> {
  const [, , id, action] = interaction.customId.split(':'); const session = id ? embedSessions.get(id) : undefined;
  if (!session || session.actorId !== interaction.user.id || session.guildId !== interaction.guildId || session.expiresAt < Date.now() || !canManageEmbeds(interaction)) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Builder unavailable', 'This private builder session has expired or belongs to another staff member.')] });
  const draft = await embeds.get(session.draftId, session.guildId); if (!draft) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Draft unavailable', 'This draft is unavailable.')] });
  if (action === 'preview') return void await interaction.reply({ ephemeral: true, embeds: [renderEmbed(draft.payload)], components: [] });
  if (action === 'title' || action === 'description' || action === 'color') { const modal = new ModalBuilder().setCustomId(`slice:embed:${draft.id}:${action}:modal`).setTitle(`Edit ${action}`); modal.addComponents(row('value', action === 'description' ? 'Description' : action === 'color' ? 'Hex color' : 'Title', action === 'description' ? TextInputStyle.Paragraph : TextInputStyle.Short, false, action === 'description' ? 4000 : 256)); return void await interaction.showModal(modal); }
  if (action === 'schedule') { if (!draft.targetChannelId) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Choose a target first', 'This draft needs a publishable target channel before it can be scheduled.')] }); const modal = new ModalBuilder().setCustomId(`slice:embed:${draft.id}:schedule:modal`).setTitle('Schedule this embed'); modal.addComponents(row('name', 'Schedule name', TextInputStyle.Short, true, 100), row('type', 'ONE_TIME, DAILY, WEEKLY, MONTHLY, CUSTOM_WEEKDAYS', TextInputStyle.Short, true, 20), row('time', 'Local time (HH:mm)', TextInputStyle.Short, true, 5), row('timezone', 'IANA timezone (e.g. America/New_York)', TextInputStyle.Short, true, 64), row('details', 'Date YYYY-MM-DD, weekdays, or monthly day', TextInputStyle.Short, false, 64)); return void await interaction.showModal(modal); }
  if (action === 'publish') { const errors = validateEmbed(draft.payload, draft.buttons); if (errors.length || !draft.targetChannelId) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Needs attention', errors[0] ?? 'Choose a text channel before publishing.')] }); try { const published = await publishEmbed({ client, guildId: draft.guildId, draft, actorId: interaction.user.id, channelId: draft.targetChannelId, payload: draft.payload, buttons: draft.buttons, repository: embeds }); return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.success('Embed published', `Published to <#${published.channelId}>.`)] }); } catch { return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Publication unavailable', 'The selected channel is unavailable or bot cannot post there.')] }); } }
}
async function handleEmbedModal(interaction: ModalSubmitInteraction): Promise<void> { const [, , id, action] = interaction.customId.split(':'); const session = id ? embedSessions.get(id) : undefined; if (!session || session.actorId !== interaction.user.id || session.guildId !== interaction.guildId || session.expiresAt < Date.now() || !canManageEmbeds(interaction)) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Builder unavailable', 'This private builder session has expired.')] }); const draft = await embeds.get(session.draftId, session.guildId); if (!draft) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Draft unavailable', 'This draft is unavailable.')] }); if (action === 'schedule') { const type = interaction.fields.getTextInputValue('type').trim().toUpperCase() as ScheduleTiming['type']; const details = interaction.fields.getTextInputValue('details').trim(); const timing: ScheduleTiming = { type, localTime: interaction.fields.getTextInputValue('time').trim(), timezone: interaction.fields.getTextInputValue('timezone').trim(), ...(type === 'ONE_TIME' ? { date: details } : type === 'MONTHLY' ? { dayOfMonth: Number(details) } : { weekdays: parseWeekdays(details) }) }; const errors = validateTiming(timing); const channel = draft.targetChannelId && interaction.guild ? await publishableChannel(interaction.guild, draft.targetChannelId) : null; if (errors.length || !channel || validateEmbed(draft.payload, draft.buttons).length) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Schedule needs attention', errors[0] ?? 'The draft target or content is not publishable.')] }); const key = crypto.randomUUID().slice(0, 12); scheduleSessions.set(key, { actorId: interaction.user.id, guildId: draft.guildId, expiresAt: Date.now() + 10 * 60_000, input: { guildId: draft.guildId, draftId: draft.id, actorId: interaction.user.id, name: interaction.fields.getTextInputValue('name').trim(), timing, payloadMode: 'SNAPSHOT', payloadSnapshot: draft.payload, linkButtonsSnapshot: draft.buttons, targetChannelId: channel.id } }); return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.info('Confirm scheduled announcement', `**${interaction.fields.getTextInputValue('name').trim()}**\n${type} · ${timing.localTime} ${timing.timezone}\nTarget: <#${channel.id}>\nContent: Snapshot of revision ${draft.version}`)], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`slice:schedule:create:${key}:confirm`).setLabel('Confirm schedule').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`slice:schedule:create:${key}:cancel`).setLabel('Cancel').setStyle(ButtonStyle.Secondary))] }); } const value = interaction.fields.getTextInputValue('value').trim(); const payload = { ...draft.payload, ...(action === 'title' ? { title: value || undefined } : action === 'description' ? { description: value || undefined } : { color: /^#[0-9a-f]{6}$/i.test(value) ? Number.parseInt(value.slice(1), 16) : draft.payload.color }) }; if (action === 'color' && !/^#[0-9a-f]{6}$/i.test(value)) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Invalid color', 'Use #RRGGBB.')] }); const errors = validateEmbed(payload, draft.buttons); if (errors.length) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Invalid embed', errors[0]!)] }); const saved = await embeds.save(draft.id, draft.guildId, interaction.user.id, draft.version, { payload, buttons: draft.buttons, targetChannelId: draft.targetChannelId }); if (!saved) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('Draft changed', 'This draft changed since you opened it. Reopen it before saving.')] }); await interaction.reply({ ephemeral: true, embeds: [embedDashboard(saved)], components: builderControls(saved.id) }); }
function embedDashboard(draft: import('./persistence/embed-repository.js').Draft) { const status = validateEmbed(draft.payload, draft.buttons); return SliceEmbed.info('Embed Builder', `**${draft.name}** · revision ${draft.version}\nTitle: ${draft.payload.title ? 'Ready' : 'Optional'}\nDescription: ${draft.payload.description ? 'Ready' : 'Optional'}\nFields: ${draft.payload.fields?.length ?? 0}\nFooter: ${draft.payload.footer === null ? 'None' : 'Slice default'}\nButtons: ${draft.buttons.length}\nTarget: ${draft.targetChannelId ? `<#${draft.targetChannelId}>` : 'Not selected'}\n\n**Status:** ${status.length || !draft.targetChannelId ? `Needs attention — ${status[0] ?? 'choose a target channel'}` : 'Ready to publish'}`); }

async function openTicketPicker(interaction: ButtonInteraction): Promise<void> {
  const config = presentationConfig()['tickets.yml'];
  await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.info('Open support ticket', 'Choose the support topic that best matches your request.')], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('slice:ticket:create').setPlaceholder('Choose the support path that fits best').addOptions(config.categories.map((category) => ({ label: category.label, value: category.key, description: renderTemplate(category.description), emoji: category.emoji }))))] });
}

async function listMyTickets(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId) return void await interaction.reply(ticketError('This ticket control is unavailable.'));
  const rows = await tickets.listForCreator(interaction.guildId, interaction.user.id);
  const open = rows.filter((ticket) => ticket.status !== 'CLOSED');
  const closed = rows.filter((ticket) => ticket.status === 'CLOSED').slice(0, 3);
  const render = (ticket: import('./ticket-lifecycle.js').LifecycleTicket) => `• **${ticket.category.replace(/-/g, ' ')}** · ${ticket.status.replace(/_/g, ' ')}${ticket.channelId ? ` · <#${ticket.channelId}>` : ''}`;
  const body = rows.length ? [`**Open**`, open.length ? open.map(render).join('\n') : 'No open tickets.', '', `**Closed recently**`, closed.length ? closed.map(render).join('\n') : 'No recently closed tickets.'].join('\n') : 'You do not have any support tickets yet.';
  await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.info('My Tickets', body)] });
}

async function handleTicketIntake(interaction: ModalSubmitInteraction): Promise<void> {
  const category = interaction.customId.split(':')[3];
  if (!interaction.guild || !interaction.guildId || !categories.has(category)) throw new TicketCreationError('Invalid ticket request.');
  await interaction.deferReply({ ephemeral: true });
  const support = await repository.getResource(interaction.guildId, 'CATEGORY', 'private-support');
  if (!support) throw new TicketCreationError('Slice private support is not ready. Ask an administrator to run /setup repair.');
  const existing = (await tickets.findActive(interaction.guildId, interaction.user.id)).find((ticket) => ticket.category === category);
  if (existing?.channelId && !(await interaction.guild.channels.fetch(existing.channelId).catch(() => null))) await tickets.clearMissingChannel(existing.id, interaction.guildId, existing.channelId);
  const service = new TicketCreationService(tickets, createTicketDiscordBoundary(interaction.guild, support.discordId), { getRoleId: async (guildId, key) => (await repository.getResource(guildId, 'ROLE', key))?.discordId ?? null });
  const ticket = await service.create({ guildId: interaction.guildId, creatorDiscordId: interaction.user.id, category, subject: interaction.fields.getTextInputValue('subject'), description: interaction.fields.getTextInputValue('description'), referenceId: interaction.fields.getTextInputValue('reference') || undefined });
  await interaction.editReply({ embeds: [SliceEmbed.success('Ticket created', `Your private ticket is ready: <#${ticket.channelId}>`)] });
}

async function handleTicketButton(interaction: ButtonInteraction): Promise<void> {
  const control = parseTicketControlId(interaction.customId);
  if (!control || !interaction.guild) return void await interaction.reply(ticketError('This ticket control is unavailable.'));
  const router = ticketRouter(interaction.guild);
  const context = ticketContext(interaction, control.ticketId);
  if (control.action === 'priority') return void await openPriorityPicker(interaction, router, context);
  if (control.action === 'transfer') return void await openTransferPicker(interaction, router, context);
  if (control.action === 'resolve' || control.action === 'close') return void await openConfirmation(interaction, router, context, control.action);
  if (control.action === 'cancel') return void await interaction.update({ embeds: [SliceEmbed.info('Ticket action cancelled', 'No ticket state was changed.')], components: [] });
  const action = control.action as Extract<TicketRouteAction, 'claim' | 'waiting-user' | 'waiting-staff' | 'escalate' | 'resolve-confirm' | 'close-confirm'>;
  await executeTicketAction(interaction, router, context, action);
}

async function handleTicketPriority(interaction: StringSelectMenuInteraction): Promise<void> {
  const control = parseTicketControlId(interaction.customId);
  if (!control || control.action !== 'priority' || !interaction.guild) return void await interaction.reply(ticketError('This ticket control is unavailable.'));
  await executeTicketAction(interaction, ticketRouter(interaction.guild), ticketContext(interaction, control.ticketId), 'priority-submit', { priority: interaction.values[0] });
}

async function handleTicketTransfer(interaction: UserSelectMenuInteraction): Promise<void> {
  const control = parseTicketControlId(interaction.customId);
  if (!control || control.action !== 'transfer' || !interaction.guild) return void await interaction.reply(ticketError('This ticket control is unavailable.'));
  await executeTicketAction(interaction, ticketRouter(interaction.guild), ticketContext(interaction, control.ticketId), 'transfer-submit', { targetId: interaction.values[0] });
}

async function handleTicketCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) return void await interaction.reply(ticketError('Ticket controls are only available in a ticket channel.'));
  const router = ticketRouter(interaction.guild);
  const input = ticketCommandInput(interaction);
  const context = ticketContext(interaction);
  if (input.action === 'transcript') return void await handleTranscriptCommand(interaction, router, context);
  if (input.action === 'resolve-confirmation' || input.action === 'close-confirmation') {
    return void await openCommandConfirmation(interaction, router, context, input.action === 'resolve-confirmation' ? 'resolve' : 'close');
  }
  await executeTicketAction(interaction, router, context, input.action, input, true);
}

async function handleTranscriptCommand(interaction: ChatInputCommandInteraction, router: TicketInteractionRouter, context: TicketRouteContext): Promise<void> { const ticket = await tickets.findByChannel(context.guildId!, context.channelId!); if (!ticket) return void await interaction.reply(ticketError('This ticket control is unavailable.')); const authorized = await router.authorize({ ...context, ticketId: ticket.id }); if (!authorized.ok) return void await interaction.reply(ticketError(authorized.message)); await interaction.deferReply({ ephemeral: true }); try { await generateTranscript(interaction.guild!, ticket.id); await interaction.editReply({ embeds: [SliceEmbed.success('Transcript ready', 'The closed ticket transcript was generated or reused for staff audit.') ] }); } catch { await interaction.editReply(ticketError('Transcript generation could not be completed. The closed ticket remains authoritative.')); } }

function ticketRouter(guild: NonNullable<Parameters<typeof createDiscordTicketAuthorization>[0]>): TicketInteractionRouter { return new TicketInteractionRouter(lifecycle, tickets, createDiscordTicketAuthorization(guild, repository)); }
async function moderationActor(interaction: ChatInputCommandInteraction) { if (!interaction.guild) throw new Error('Guild unavailable'); const member=await interaction.guild.members.fetch(interaction.user.id); const roles=await Promise.all(['owner','administrator','operations','support'].map(key=>repository.getResource(interaction.guildId!,'ROLE',key))); const ids=new Set(member.roles.cache.keys()); const admin=member.permissions.has('Administrator')||Boolean(roles[0]&&ids.has(roles[0].discordId)); return {id:interaction.user.id,staff:admin||roles.slice(1).some(row=>row&&ids.has(row.discordId)),admin,position:member.roles.highest.position}; }
function moderationForGuild(guild: Guild) { return new ManualModerationService(new ModerationService(moderationRepository, createDiscordModerationTransport(guild, repository)), moderationRepository, new DiscordModerationAuthorization()); }
async function moderationTarget(guild: Guild,id:string,action:string) { if (action === 'unban') return { id, position: -1, protected: false, bot: false }; const member=await guild.members.fetch(id); const roles=await Promise.all(['owner','administrator'].map(key=>repository.getResource(guild.id,'ROLE',key))); const ids=new Set(member.roles.cache.keys()); return {id,position:member.roles.highest.position,protected:roles.some(row=>row&&ids.has(row.discordId)),bot:member.user.bot}; }
async function applyLevelMilestoneRole(guild: Guild, userId: string, level: number): Promise<void> { const milestone = [50, 30, 20, 10, 5].find((value) => level >= value); if (!milestone) return; const role = await repository.getResource(guild.id, 'ROLE', `level-${milestone}`); if (!role) return; try { const member = await guild.members.fetch(userId); await member.roles.add(role.discordId, `Slice community level ${milestone} milestone`); } catch (error) { logger.warn('progression.level_role_failed', { guildId: guild.id, userId, level: milestone, name: error instanceof Error ? error.name : 'unknown' }); } }
async function isAutomodBlocked(message: import('discord.js').Message): Promise<boolean> { const key = `${message.guildId}:${message.author.id}`; const now = Date.now(); const content = message.content.trim().toLowerCase(); const state = messageSafetyWindow.get(key) ?? { timestamps: [], messages: [] }; state.timestamps = state.timestamps.filter((at) => at > now - 60_000); state.messages = state.messages.filter((entry) => entry.at > now - 300_000); const duplicates = state.messages.filter((entry) => entry.content === content).length + 1; state.timestamps.push(now); state.messages.push({ content, at: now }); messageSafetyWindow.set(key, state); if (messageSafetyWindow.size > 10_000) messageSafetyWindow.delete(messageSafetyWindow.keys().next().value!); const decision = evaluateAutomod({ content: message.content, mentions: message.mentions.users.size, recent: state.timestamps.length, duplicates, staff: message.member?.permissions.has('ManageMessages') ?? false }); if (!decision.action) return false; await message.delete().catch((error) => logger.warn('automod.delete_failed', { guildId: message.guildId, messageId: message.id, name: error instanceof Error ? error.name : 'unknown' })); logger.warn('automod.blocked', { guildId: message.guildId, messageId: message.id, action: decision.action }); return true; }
function ticketContext(interaction: { guildId: string | null; channelId: string | null; user: { id: string } }, ticketId?: string): TicketRouteContext { return { guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id, ticketId }; }

async function openPriorityPicker(interaction: ButtonInteraction, router: TicketInteractionRouter, context: TicketRouteContext): Promise<void> {
  const authorized = await router.authorize(context);
  if (!authorized.ok) return void await interaction.reply(ticketError(authorized.message));
  await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.info('Set ticket priority', 'Choose an allowlisted priority.')], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(ticketControlId('priority', context.ticketId!)).setPlaceholder('Choose priority').addOptions(['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => ({ label: value, value }))))] });
}

async function openTransferPicker(interaction: ButtonInteraction, router: TicketInteractionRouter, context: TicketRouteContext): Promise<void> {
  const authorized = await router.authorize(context);
  if (!authorized.ok) return void await interaction.reply(ticketError(authorized.message));
  await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.info('Transfer ticket', 'Choose an eligible staff member.')], components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(new UserSelectMenuBuilder().setCustomId(ticketControlId('transfer', context.ticketId!)).setPlaceholder('Choose eligible staff').setMinValues(1).setMaxValues(1))] });
}

async function openConfirmation(interaction: ButtonInteraction, router: TicketInteractionRouter, context: TicketRouteContext, action: 'resolve' | 'close'): Promise<void> {
  const authorized = action === 'close' ? await router.authorizeClose(context) : await router.authorize(context);
  if (!authorized.ok) return void await interaction.reply(ticketError(authorized.message));
  await interaction.reply(confirmationPayload(action, context.ticketId!));
}

async function openCommandConfirmation(interaction: ChatInputCommandInteraction, router: TicketInteractionRouter, context: TicketRouteContext, action: 'resolve' | 'close'): Promise<void> {
  const ticket = await tickets.findByChannel(context.guildId!, context.channelId!);
  if (!ticket) return void await interaction.reply(ticketError('This ticket control is unavailable.'));
  const authorized = await router.authorize({ ...context, ticketId: ticket.id });
  if (!authorized.ok) return void await interaction.reply(ticketError(authorized.message));
  await interaction.reply(confirmationPayload(action, ticket.id));
}

function confirmationPayload(action: 'resolve' | 'close', ticketId: string) { const confirm = `${action}-confirm` as 'resolve-confirm' | 'close-confirm'; return { ephemeral: true, embeds: [SliceEmbed.warning(`Confirm ticket ${action}`, `Confirm ${action.toUpperCase()} for this ticket. This does not delete the channel.`)], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(ticketControlId(confirm, ticketId)).setLabel(`Confirm ${action}`).setStyle(action === 'close' ? ButtonStyle.Danger : ButtonStyle.Success), new ButtonBuilder().setCustomId(ticketControlId('cancel', ticketId)).setLabel('Cancel').setStyle(ButtonStyle.Secondary))] }; }

async function executeTicketAction(interaction: { guildId: string | null; channelId: string | null; user: { id: string }; deferReply(options: { ephemeral: true }): Promise<unknown>; editReply(payload: { embeds: ReturnType<typeof SliceEmbed.success>[] }): Promise<unknown>; channel?: unknown; guild?: Guild | null; message?: TicketControlMessage }, router: TicketInteractionRouter, context: TicketRouteContext, action: TicketRouteAction, options: { priority?: string; targetId?: string } = {}, refreshChannel = false): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const result = context.ticketId ? await router.execute(action, context, options) : await router.executeForChannel(action, context, options);
  if (!result.ok || !result.ticket) return void await interaction.editReply(ticketError(result.message));
  if (result.changed) {
    if (result.escalationTarget) await applyEscalationPermission(interaction.channel, result.ticket.guildId, result.escalationTarget).catch((error) => logger.warn('ticket.escalation_permission_failed', { ticketId: result.ticket?.id, name: error instanceof Error ? error.name : 'unknown' }));
    try {
      if (interaction.message) await refreshTicketMessage(interaction.message, result.ticket);
      else if (refreshChannel) await refreshTicketChannel(interaction.channel, result.ticket);
    } catch (error) {
      logger.warn('ticket.refresh_failed', { ticketId: result.ticket.id, name: error instanceof Error ? error.name : 'unknown' });
    }
    if (action === 'close-confirm' && interaction.guild) { await generateTranscript(interaction.guild, result.ticket.id); await lockTicketChannel(interaction.guild, result.ticket).catch((error) => logger.warn('ticket.lock_failed', { ticketId: result.ticket?.id, name: error instanceof Error ? error.name : 'unknown' })); }
  }
  await interaction.editReply({ embeds: [SliceEmbed.success(result.changed ? 'Ticket updated' : 'No ticket change', result.message)] });
}

async function generateTranscript(guild: Guild, ticketId: string): Promise<void> { const history: TicketHistory = { read: async (ticket) => { const channel = await guild.channels.fetch(ticket.channelId); if (!channel?.isTextBased() || !('messages' in channel)) throw new Error('Ticket history unavailable.'); const messages = await channel.messages.fetch({ limit: 100 }); return { partial: messages.size === 100, messages: [...messages.values()].map((message) => ({ id: message.id, createdAt: message.createdAt, authorId: message.author.id, authorLabel: message.author.tag, content: message.content, bot: message.author.bot, attachments: [...message.attachments.values()].map((attachment) => ({ name: attachment.name ?? 'attachment', url: attachment.url })) })) }; } }; const result = await transcripts.generate(ticketId, guild.id, history); const log = await repository.getResource(guild.id, 'CHANNEL', 'support-log'); if (log && !result.reused) { const channel = await guild.channels.fetch(log.discordId).catch(() => null); if (channel?.isTextBased() && 'send' in channel) { await channel.send({ embeds: [SliceEmbed.info('Ticket transcript', `Ticket ${ticketId.slice(0, 8)} transcript: **${result.transcript.status}**.`)] }); await tickets.markTranscriptDelivered(ticketId, log.discordId); } } }

async function applyEscalationPermission(channel: unknown, guildId: string, logicalRole: string): Promise<void> {
  const role = await repository.getResource(guildId, 'ROLE', logicalRole);
  if (!role || !channel || typeof channel !== 'object' || !('permissionOverwrites' in channel)) throw new Error('Escalation route unavailable.');
  const overwrite = channel.permissionOverwrites as { edit(id: string, permissions: Record<string, boolean>, options: { reason: string }): Promise<unknown> };
  await overwrite.edit(role.discordId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }, { reason: 'Slice ticket escalation routing' });
}

async function refreshTicketChannel(channel: unknown, ticket: NonNullable<TicketRouteResult['ticket']>): Promise<void> {
  if (!channel || typeof channel !== 'object' || !('messages' in channel)) throw new Error('Ticket message unavailable.');
  const messages = await (channel.messages as { fetch(options: { limit: number }): Promise<{ find(predicate: (message: { components: readonly { components: readonly { customId?: string }[] }[] }) => boolean): TicketControlMessage | undefined }> }).fetch({ limit: 50 });
  const message = messages.find((candidate) => candidate.components.some((row) => row.components.some((component) => component.customId === ticketControlId('claim', ticket.id))));
  if (!message) throw new Error('Ticket control message unavailable.');
  await refreshTicketMessage(message, ticket);
}

function communityChannel(guild: Guild) { return async (key: string) => { const resource = await repository.getResource(guild.id, 'CHANNEL', key); const channel = resource ? await guild.channels.fetch(resource.discordId).catch(() => null) : null; return channel?.isTextBased() && 'send' in channel ? channel : null; }; }
async function notificationResponse(interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<void> { if (!interaction.guild || !config.NOTIFICATION_ROLES_ENABLED) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Notifications unavailable', 'Notification preferences are currently disabled.')] }); const member = await interaction.guild.members.fetch(interaction.user.id); await notificationRoles.reconcile(interaction.guild, member); const selected = await notificationRoles.selected(interaction.guild.id, interaction.user.id); const customer = await notificationRoles.customerSelected(interaction.guild.id, interaction.user.id); const customerLines = CUSTOMER_NOTIFICATION_CATALOG.map(([key, label, description]) => `• **${label}** — ${customer.includes(key) ? 'Enabled' : 'Disabled'}\n${description}`); await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.info('Your notification preferences', `${selected.length ? selected.map((key) => `• ${key.replace(/-/g, ' ')}`).join('\n') : 'No community notification roles selected.'}\n\n**Private Slice notifications**\n${customerLines.join('\n')}`)], components: [...notificationMenu(selected), ...customerNotificationMenu(customer)] }); }
async function handleNotificationRoles(interaction: StringSelectMenuInteraction): Promise<void> { if (!interaction.guild || !config.NOTIFICATION_ROLES_ENABLED) return; const member = await interaction.guild.members.fetch(interaction.user.id); try { const selected = await notificationRoles.update(interaction.guild, member, new Set(interaction.values)); await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.success('Notification preferences updated', selected.length ? `Enabled: ${selected.map((key) => key.replace(/-/g, ' ')).join(', ')}.` : 'No notification categories selected.')] }); } catch (error) { if (error instanceof NotificationRoleUnavailableError) { await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('Role unavailable', error.message)] }); return; } throw error; } }
async function handleCustomerNotifications(interaction: StringSelectMenuInteraction): Promise<void> { if (!interaction.guild || !config.NOTIFICATION_ROLES_ENABLED) return; const selected = await notificationRoles.updateCustomer(interaction.guild.id, interaction.user.id, new Set(interaction.values)); await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.success('Private notification preferences updated', selected.length ? `Enabled: ${selected.map((key) => CUSTOMER_NOTIFICATION_CATALOG.find(([candidate]) => candidate === key)?.[1]).join(', ')}.` : 'All private Slice notification categories are disabled.')] }); }
async function reconcileNotificationRoles(): Promise<void> { if (!config.NOTIFICATION_ROLES_ENABLED) return; for (const configRow of await repository.listGuildConfigs()) { const guild = await client.guilds.fetch(configRow.guildId).catch(() => null); if (!guild) continue; const userIds = new Set((await repository.listGuildNotificationPreferences(guild.id)).map((row) => row.discordUserId)); for (const userId of userIds) { const member = await guild.members.fetch(userId).catch(() => null); if (member) await reconcileNotificationMember(member); } } }
async function reconcileNotificationMember(member: GuildMember): Promise<void> { if (config.NOTIFICATION_ROLES_ENABLED) await notificationRoles.reconcile(member.guild, member); }
async function refreshSuggestion(suggestion: import('./persistence/community-repository.js').Suggestion): Promise<void> { if (!suggestion.channelId || !suggestion.messageId) return; const guild = await client.guilds.fetch(suggestion.guildId); const channel = await guild.channels.fetch(suggestion.channelId).catch(() => null); if (!channel?.isTextBased() || !('messages' in channel)) return; const message = await channel.messages.fetch(suggestion.messageId).catch(() => null); if (message) await message.edit(suggestionPayload(suggestion, await community.suggestionCounts(suggestion.id))); }
async function handleSuggestionVote(interaction: ButtonInteraction): Promise<void> { const [, , , id, choice] = interaction.customId.split(':'); if (!id || (choice !== 'up' && choice !== 'down')) return; const suggestion = await community.suggestion(id); if (!suggestion || suggestion.guildId !== interaction.guildId) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Suggestion unavailable', 'This suggestion is unavailable.')] }); await community.suggestionVote(id, interaction.user.id, choice === 'up' ? 1 : -1); const updated = await community.suggestion(id); if (updated) await interaction.update(suggestionPayload(updated, await community.suggestionCounts(id))); }
async function handlePollVote(interaction: StringSelectMenuInteraction): Promise<void> { const id = interaction.customId.split(':')[3]; const poll = id ? await community.pollVote(id, interaction.user.id, Number(interaction.values[0])) : null; if (!poll || poll.guildId !== interaction.guildId) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Poll unavailable', 'This poll is closed or unavailable.')] }); await interaction.update(pollPayload(poll, await community.pollCounts(poll.id, poll.options.length))); }
async function handleStaffOperations(interaction: ChatInputCommandInteraction): Promise<void> { await interaction.deferReply({ ephemeral: true }); const status = await market.getLinkStatus(interaction.user.id); if (!status.ok || !status.value.linked) return void await interaction.editReply({ embeds: [SliceEmbed.warning('Connect your Slice account', 'Connect the Slice account that holds your staff role to use operations shortcuts.')] }); const summary = status.value.user.roles.includes('ADMIN') ? await market.getAdminOpsSummary(interaction.user.id) : undefined; await interaction.editReply(staffOperationsPayload(status.value.user.roles, adminRoutes, summary)); }
async function handleStaffPanel(interaction: ButtonInteraction): Promise<void> { const action = interaction.customId.split(':')[2]; await interaction.deferReply({ ephemeral: true }); const status = await market.getLinkStatus(interaction.user.id); if (!status.ok || !status.value.linked) return void await interaction.editReply({ embeds: [SliceEmbed.warning('Connect your Slice account', 'Connect the Slice account that holds your staff role to use operations shortcuts.')] }); if (action === 'ops') { const summary = status.value.user.roles.includes('ADMIN') ? await market.getAdminOpsSummary(interaction.user.id) : undefined; return void await interaction.editReply(staffOperationsPayload(status.value.user.roles, adminRoutes, summary)); } if (!isSliceStaff(status.value.user.roles)) return void await interaction.editReply({ embeds: [SliceEmbed.warning('Staff access required', 'Your linked Slice account does not have staff operations access.')] }); await interaction.editReply(staffPanelPayload(action, adminRoutes)); }
async function mySliceResponse(discordUserId: string) {
  const status = await market.getLinkStatus(discordUserId);
  if ((status.ok && !status.value.linked) || (!status.ok && status.code === 'ACCOUNT_NOT_LINKED')) return connectPayload();
  if (!status.ok) return { embeds: [SliceEmbed.warning('My Slice unavailable', status.message)] };
  return mySlicePayload(await market.getMySliceSummary(discordUserId), customerRoutes);
}
async function handleMySlice(interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<void> { await interaction.deferReply({ ephemeral: true }); await interaction.editReply(await mySliceResponse(interaction.user.id)); }
async function handleMySliceButton(interaction: ButtonInteraction): Promise<void> {
  const action = interaction.customId.split(':')[2];
  if (action === 'notifications') return void await notificationResponse(interaction);
  await interaction.deferUpdate();
  if (action === 'actions') {
    const status = await market.getLinkStatus(interaction.user.id);
    if ((status.ok && !status.value.linked) || (!status.ok && status.code === 'ACCOUNT_NOT_LINKED')) return void await interaction.editReply(connectPayload());
    if (!status.ok) return void await interaction.editReply({ embeds: [SliceEmbed.warning('My Slice unavailable', status.message)] });
    return void await interaction.editReply(mySliceActionsPayload(await market.getCollectorActions(interaction.user.id), customerRoutes));
  }
  await interaction.editReply(await mySliceResponse(interaction.user.id));
}
async function handleHumanVerification(interaction: ButtonInteraction): Promise<void> {
  const [, , , nonce, selection] = interaction.customId.split(':');
  if (!interaction.guild || !interaction.guildId || !nonce || !selection || !/^[1-9]$/.test(selection)) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Verification unavailable', 'Start a new visual check from #🔐・verify.')] });
  const result = humanVerification.complete(nonce, interaction.guildId, interaction.user.id, selection);
  if (!result.ok) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning(result.reason === 'INCORRECT' ? 'That answer did not match' : 'Check expired', result.reason === 'INCORRECT' ? 'Try again. After three attempts, start a new visual check.' : 'Start a new visual check.')] });
  const verified = await repository.getResource(interaction.guildId, 'ROLE', 'verified');
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!verified || !member) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('Verification setup unavailable', 'The verification role is not ready yet. Ask an administrator to run `/setup repair`.')] });
  if (!member.roles.cache.has(verified.discordId)) await member.roles.add(verified.discordId, 'Discord human verification');
  await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.success('You are verified', 'Welcome to Slice. The server is now available to you.')] });
}
async function handleOnboardingButton(interaction: ButtonInteraction): Promise<void> {
  const action = interaction.customId.split(':')[2];
  if (action === 'connect') {
    await interaction.deferReply({ ephemeral: true });
    const status = await market.getLinkStatus(interaction.user.id);
    if (status.ok && status.value.linked) {
      await syncLinkedAccountRoles(interaction, status.value.user.roles);
      await interaction.editReply(accountStatusPayload(status, links));
      return;
    }
    const challenge = await market.createLinkChallenge({ discordUserId: interaction.user.id, discordUsername: interaction.user.username, discordDisplayName: interaction.user.globalName, guildId: interaction.guildId });
    if (!challenge.ok) {
      await interaction.editReply({ embeds: [SliceEmbed.warning('Slice unavailable', challenge.message)] });
      return;
    }
    await interaction.editReply({ embeds: [SliceEmbed.info('Connect your Slice account', 'Continue on Slice to securely connect your Discord account.')], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel('Connect account').setStyle(ButtonStyle.Link).setURL(challenge.value.challengeUrl))] });
    return;
  }
  if (action === 'unlink') {
    await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('Disconnect Slice account', 'Disconnecting removes only Slice-managed display roles. Your Slice account and history stay intact.')], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('slice:onboarding:unlink-confirm').setLabel('Confirm disconnect').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('slice:onboarding:unlink-cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary))] });
    return;
  }
  if (action === 'unlink-cancel') {
    await interaction.update({ embeds: [SliceEmbed.info('Disconnect cancelled', 'Your Slice account remains connected.')], components: [] });
    return;
  }
  if (action === 'unlink-confirm') {
    await interaction.deferUpdate();
    const result = await market.unlink(interaction.user.id);
    if (!result.ok) {
      await interaction.editReply({ embeds: [SliceEmbed.warning('Disconnect unavailable', result.message)], components: [] });
      return;
    }
    await syncLinkedAccountRoles(interaction, []);
    await interaction.editReply({ embeds: [SliceEmbed.success('Slice account disconnected', 'Your Slice account and history were not changed.')], components: [] });
    return;
  }
  if (action === 'verify') {
    const guildId = interaction.guildId;
    if (!guildId || !interaction.guild) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Verification unavailable', 'Verification is available inside the Slice server only.')] });
    const challenge = await humanVerification.begin(guildId, interaction.user.id);
    if (!challenge.ok) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('Please wait before trying again', `Too many verification checks were started. Try again in about **${challenge.retryAfterSeconds} seconds**.`)] });
    const choiceButtons = Array.from({ length: 9 }, (_, index) => new ButtonBuilder().setCustomId(`slice:verify:human:${challenge.nonce}:${index + 1}`).setLabel(String(index + 1)).setStyle(ButtonStyle.Secondary));
    await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.info('Complete the human check', 'Match the symbol in the reference tile on the left to one tile in the 3 × 3 grid. Then select its number: left to right, top to bottom.\n\nThis check protects Discord access only. It does not verify your identity or Slice account.')], files: [{ attachment: challenge.image, name: 'slice-human-check.png' }], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(choiceButtons.slice(0, 5)), new ActionRowBuilder<ButtonBuilder>().addComponents(choiceButtons.slice(5))] });
    return;
  }
  if (action === 'why-verify') { await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.info('Why verify?', 'This short visual human check helps limit automated joins and spam. It grants only Discord server access; it does not link or verify your Slice account.')] }); return; }
  if (action === 'my-slice') return void await handleMySlice(interaction);
  const handoffs: Partial<Record<string, { destination: SliceDestination; title: string; description: string }>> = { verify: { destination: 'account', title: 'Verify on Slice', description: 'Identity and verification steps are handled only on the official Slice website.' }, 'my-slice': { destination: 'account', title: 'My Slice', description: 'Open Slice to view your account and linked services.' }, marketplace: { destination: 'marketplace', title: 'Marketplace', description: 'Open Slice for current listings and market activity.' }, portfolio: { destination: 'portfolio', title: 'Portfolio', description: 'Open Slice to view your private portfolio.' }, orders: { destination: 'orders', title: 'Orders', description: 'Open Slice to view your private order activity.' }, transactions: { destination: 'transactions', title: 'Transactions', description: 'Open Slice to view your private transaction activity.' }, 'collector-workspace': { destination: 'collector-workspace', title: 'Collector Workspace', description: 'Open Slice to view your collector workspace, if enabled for your account.' }, 'your-actions': { destination: 'your-actions', title: 'Your Actions', description: 'Open Slice to see the collector actions that currently need your attention.' }, membership: { destination: 'membership', title: 'Collector Membership', description: 'Open Slice to view membership and capacity information.' }, list: { destination: 'list', title: 'List an Asset', description: 'Open Slice to start a submission using the current review workflow.' }, 'admin-console': { destination: 'admin-console', title: 'Slice Admin Console', description: 'Open Slice to review authorized operational queues.' } };
  const handoff = handoffs[action];
  if (handoff) {
    const response = links.handoff(handoff.destination);
    if (!response.available) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('Slice unavailable', response.message)] });
    await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.info(handoff.title, handoff.description)], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel('Open Slice').setStyle(ButtonStyle.Link).setURL(response.url))] });
    return;
  }
  if (action === 'faq') { await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.info('Slice FAQ', Object.entries(FAQ).slice(0, 6).map(([key, value]) => `**${key}** — ${value}`).join('\n\n'))] }); return; }
  await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.info('Support', 'Choose a category in #🎫・support to open private support.')] });
}

async function syncLinkedAccountRoles(interaction: ButtonInteraction, sliceRoles: string[]): Promise<void> {
  if (!interaction.guild) return;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;
  for (const [key, enabled] of [['slice-member', sliceRoles.length > 0], ['collector', sliceRoles.includes('COLLECTOR')]] as const) {
    const managed = await repository.getResource(interaction.guild.id, 'ROLE', key);
    if (!managed) continue;
    if (enabled && !member.roles.cache.has(managed.discordId)) await member.roles.add(managed.discordId, 'Slice account link role sync').catch(() => undefined);
    if (!enabled && member.roles.cache.has(managed.discordId)) await member.roles.remove(managed.discordId, 'Slice account unlink role sync').catch(() => undefined);
  }
}
function ticketError(message: string) { return { ephemeral: true, embeds: [SliceEmbed.error('Ticket action unavailable', message)] }; }
function row(id: string, label: string, style: TextInputStyle, required: boolean, maxLength: number): ActionRowBuilder<TextInputBuilder> { return new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(maxLength)); }
async function start(): Promise<void> { await repository.connect(); health.listen(config.HEALTH_PORT); const rest = new REST({ version: '10' }).setToken(config.DISCORD_BOT_TOKEN); const commands = discordCommandInventory.map((command) => command.toJSON()); const route = config.DISCORD_DEV_GUILD_ID ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_DEV_GUILD_ID) : Routes.applicationCommands(config.DISCORD_CLIENT_ID); await rest.put(route, { body: commands }); await client.login(config.DISCORD_BOT_TOKEN); }
void start();
