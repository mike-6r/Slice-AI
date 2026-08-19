import { ActionRowBuilder, ActivityType, ButtonBuilder, ButtonStyle, Client, Events, GatewayIntentBits, ModalBuilder, PermissionFlagsBits, REST, Routes, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder, type ButtonInteraction, type ChatInputCommandInteraction, type Guild, type GuildMember, type ModalSubmitInteraction, type StringSelectMenuInteraction, type UserSelectMenuInteraction } from 'discord.js';
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
import { PrismaAdvancedTicketRepository, type TicketFormVersion } from './persistence/advanced-ticket-repository.js';
import { INTAKE_SAFETY_WARNING, normalizedForm, type TicketIntakeField, validateAnswers } from './advanced-ticket-forms.js';
import { SetupProvisioner } from './setup/provisioner.js';
import { TicketCreationError, TicketCreationService } from './ticket-creation.js';
import { createTicketDiscordBoundary, lockTicketChannel, refreshTicketMessage, type TicketControlMessage } from './ticket-discord.js';
import { TicketLifecycleService } from './ticket-lifecycle.js';
import { parseTicketControlId, ticketControlId, TicketInteractionRouter, type TicketRouteAction, type TicketRouteContext, type TicketRouteResult } from './ticket-routing.js';
import { StaffTicketTranscriptService, TicketTranscriptService, type TicketHistory } from './ticket-transcripts.js';
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
import { DiscordAnalyticsService, type AnalyticsOutcome, type AnalyticsPeriod } from './analytics.js';
import { PrismaSpotlightRepository } from './persistence/spotlight-repository.js';
import { handleSpotlightCommand } from './spotlight-command-handler.js';

const config = loadConfig();
const logger = new Logger();
const prisma = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } } });
const repository = new PrismaSetupRepository(prisma);
const tickets = new PrismaTicketRepository(prisma);
const advancedTickets = new PrismaAdvancedTicketRepository(prisma);
const lifecycle = new TicketLifecycleService(tickets);
const transcripts = new TicketTranscriptService(tickets);
const staffTranscripts = new StaffTicketTranscriptService(tickets);
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
const analytics = new DiscordAnalyticsService(prisma);
const spotlights = new PrismaSpotlightRepository(prisma);
const gatewayInstanceId = crypto.randomUUID();
const embedSessions = new Map<string, { guildId: string; actorId: string; draftId: string; expiresAt: number }>();
const scheduleSessions: ScheduleSessions = new Map();
const ticketIntakeSessions = new Map<string, { guildId: string; actorId: string; category: string; form: TicketFormVersion; answers: Record<string, string>; expiresAt: number }>();
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const categories = new Set(presentationConfig()['tickets.yml'].categories.map((category) => category.key));
const messageSafetyWindow = new Map<string, { timestamps: number[]; messages: Array<{ content: string; at: number }> }>();
const health = createServer((request, response) => { const ok = request.url === '/health' || request.url === '/ready' && client.isReady(); response.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' }); response.end(JSON.stringify({ status: ok ? 'ok' : 'not_ready' })); });

client.once(Events.ClientReady, (ready) => { logger.info('discord.ready', { user: ready.user.tag }); void analytics.capture(() => analytics.heartbeat({ workerName: 'slice-discord-gateway', instanceId: gatewayInstanceId, successfulScan: true })); void reconcileNotificationRoles(); const presence = ['the Slice Market', 'community discussions', 'Slice support']; let index = 0; ready.user.setPresence({ activities: [{ name: presence[index]!, type: ActivityType.Watching }], status: 'online' }); setInterval(() => { index = (index + 1) % presence.length; ready.user.setPresence({ activities: [{ name: presence[index]!, type: ActivityType.Watching }], status: 'online' }); }, 10 * 60_000); setInterval(() => void analytics.capture(() => analytics.heartbeat({ workerName: 'slice-discord-gateway', instanceId: gatewayInstanceId, successfulScan: true })), 60_000); });
client.on(Events.GuildMemberAdd, (member) => { void reconcileNotificationMember(member); void analytics.capture(() => analytics.memberChange(member.guild.id, true)); });
client.on(Events.GuildMemberRemove, (member) => { void analytics.capture(() => analytics.memberChange(member.guild.id, false)); });
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild || !message.guildId) return;
  const blocked = await isAutomodBlocked(message);
  const ticket = await tickets.findByChannel(message.guildId, message.channelId);
  void analytics.capture(() => analytics.message({ guildId: message.guildId!, channelId: message.channelId, actorId: message.author.id, support: Boolean(ticket) }));
  if (ticket) {
    const actor = await createDiscordTicketAuthorization(message.guild, repository).actor(ticket, message.author.id);
    if (ticket.creatorId === message.author.id || actor.staff) await tickets.recordActivity(message.guildId, message.channelId);
    if (actor.staff) await advancedTickets.markFirstStaffResponse(ticket.id, message.guildId, message.author.id).catch((error) => logger.warn('ticket.first_staff_response_failed', { ticketId: ticket.id, name: error instanceof Error ? error.name : 'unknown' }));
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
  const startedAt = Date.now(); const command = interaction.isChatInputCommand() && interaction.guildId ? { guildId: interaction.guildId, actorId: interaction.user.id, commandName: interaction.commandName, subcommand: interaction.options.getSubcommand(false) ?? undefined } : null; const communityInteraction = !command && interaction.guildId && !interaction.user.bot ? { guildId: interaction.guildId, actorId: interaction.user.id } : null; let commandOutcome: AnalyticsOutcome = 'SUCCESS';
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') return void await handleSetup(interaction, repository, provisioner);
    if (interaction.isChatInputCommand() && interaction.commandName === 'config') return void await handleConfigurationCommand(interaction);
    if (interaction.isChatInputCommand() && interaction.commandName === 'slice') return void await handleMySlice(interaction);
    if (interaction.isChatInputCommand() && interaction.commandName === 'ops') return void await handleStaffOperations(interaction);
    if (interaction.isChatInputCommand() && ['account', 'roles', 'faq', 'support'].includes(interaction.commandName)) return void await handleOnboardingCommand(interaction, links, market);
    if (interaction.isChatInputCommand() && interaction.commandName === 'ticket') return void await handleTicketCommand(interaction);
    if (interaction.isChatInputCommand() && interaction.commandName === 'tickets') return void await handleTicketsOperations(interaction);
    if (interaction.isChatInputCommand() && interaction.commandName === 'ticket-config') return void await handleTicketConfig(interaction);
    if (interaction.isChatInputCommand() && interaction.commandName === 'analytics') return void await handleAnalytics(interaction);
    if (interaction.isChatInputCommand() && interaction.commandName === 'spotlight') return void await handleSpotlightCommand(interaction, spotlights, market, embeds, client);
    if (interaction.isChatInputCommand() && ['warn', 'note', 'timeout', 'untimeout', 'ban', 'unban', 'modcase', 'modhistory'].includes(interaction.commandName)) return void await handleModerationCommand(interaction, moderationForGuild(interaction.guild!), await moderationActor(interaction), (id, action) => moderationTarget(interaction.guild!, id, action));
    if (interaction.isChatInputCommand() && ['level', 'leaderboard', 'rep', 'reputation', 'achievements', 'daily'].includes(interaction.commandName)) return void await handleProgressionCommand(interaction, progression);
    if (interaction.isChatInputCommand() && ['notifications', 'suggest', 'suggestion', 'poll', 'birthday'].includes(interaction.commandName)) return void await handleCommunityCommand(interaction, community, config, communityChannel(interaction.guild!), async () => notificationResponse(interaction), refreshSuggestion);
    if (interaction.isChatInputCommand() && interaction.commandName === 'giveaway') return void await handleGiveawayCommand(interaction, giveaways, () => communityChannel(interaction.guild!)('general'), (giveaway) => publishGiveawayCompletion(client, giveaways, giveaway), (giveaway) => refreshGiveawayMessage(client, giveaway));
    if (interaction.isChatInputCommand() && interaction.commandName === 'meme') return void await handleMemeCommand(interaction, memes, config.MEME_COMPETITION_VOTE_EMOJI, async (competition, actorDiscordId, automatic) => { const result = await resolveMemeCompetition(client, memes, competition, actorDiscordId, automatic, config.MEME_COMPETITION_VOTE_EMOJI); if (result?.closedNow && !(await publishMemeResult(client, memes, result.competition, config.MEME_COMPETITION_VOTE_EMOJI))) logger.warn('meme.result_announcement_failed', { competitionId: result.competition.id }); return result; });
    if (interaction.isChatInputCommand() && interaction.commandName === 'embed') return void await handleEmbedCommand(interaction);
    if (interaction.isChatInputCommand() && interaction.commandName === 'schedule') return void await handleScheduleCommand(interaction, announcementSchedules, embeds, scheduleSessions, paginator);
    if (interaction.isChatInputCommand() && ['card', 'search', 'value', 'price', 'history', 'top', 'asset', 'market', 'collector', 'vault', 'portfolio', 'balance', 'transactions', 'watchlist', 'profile'].includes(interaction.commandName)) return void await handleMarketCommand(interaction, market, links, progression, investorProfiles, paginator);
    if (interaction.isChatInputCommand() && interaction.commandName === 'pricealert') return void await handlePriceAlert(interaction, discordDeliveries, market);
    if (interaction.isChatInputCommand() && ['ask', 'help', 'summary', 'insights', 'trending', 'about', 'status'].includes(interaction.commandName)) return void await handleIntelligence(interaction, ai, market);
    if (interaction.isChatInputCommand() && ['invite', 'roadmap', 'announce', 'request', 'offer'].includes(interaction.commandName)) return void await handleGapSweep(interaction, repository, config.OFFICIAL_DISCORD_INVITE_URL);
    if (interaction.isButton() && interaction.customId === 'slice:setup:refresh') { if (!interaction.guild) return; if (!interaction.memberPermissions?.has('Administrator')) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Administrator required', 'Only a Discord server administrator can review setup updates.')] }); return void await handleSetupRefresh(interaction, provisioner); }
    if (interaction.isButton() && interaction.customId.startsWith('slice:page:')) return void await paginator.handle(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('slice:setup:')) { if (!interaction.guild) return; await interaction.deferUpdate(); const result = await handleSetupButton(interaction.customId, interaction.user.id, interaction.guild.id, { apply: async () => provisioner.apply(interaction.guild!), reset: async () => provisioner.reset(interaction.guild!) }); return void await interaction.editReply({ embeds: [SliceEmbed.success(result.title, result.body)], components: [] }); }
    if (interaction.isButton() && interaction.customId === 'slice:ticket:open') return void await openTicketPicker(interaction);
    if (interaction.isButton() && interaction.customId === 'slice:ticket:mine') return void await listMyTickets(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('slice:ticket-config:')) return void await handleTicketConfigButton(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('slice:ticket:intake-next:')) return void await continueTicketIntake(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('slice:ticket:')) return void await handleTicketButton(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('slice:giveaway:')) return void await handleGiveawayButton(interaction, giveaways, (giveaway) => refreshGiveawayMessage(client, giveaway));
    if (interaction.isStringSelectMenu() && interaction.customId === 'slice:ticket:create') return void await handleTicketCreationCategory(interaction);
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('slice:ticket-config:')) return void await handleTicketConfigSelect(interaction);
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('slice:ticket:intake-choice:')) return void await handleTicketIntakeChoice(interaction);
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('slice:ticket:')) return void await handleTicketPriority(interaction);
    if (interaction.isUserSelectMenu() && interaction.customId.startsWith('slice:ticket:')) return void await handleTicketTransfer(interaction);
    if (interaction.isModalSubmit() && interaction.customId.startsWith('slice:ticket:intake:')) return void await handleTicketIntake(interaction);
    if (interaction.isModalSubmit() && interaction.customId.startsWith('slice:ticket-config:')) return void await handleTicketConfigModal(interaction);
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
    commandOutcome = 'INTERNAL_ERROR';
    const ref = `SLC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    logger.error('interaction.failed', { reference: ref, name: error instanceof Error ? error.name : 'unknown', message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    const payload = { ephemeral: true, embeds: [SliceEmbed.error('Interaction unavailable', `Reference: ${ref}\n\nSlice couldn't complete that request right now. Try again shortly.`)] };
    if (interaction.isRepliable()) await (interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload));
  } finally {
    if (command) void analytics.capture(() => analytics.command({ ...command, outcome: commandOutcome, durationMs: Date.now() - startedAt }));
    if (communityInteraction) void analytics.capture(() => analytics.communityInteraction(communityInteraction.guildId, communityInteraction.actorId));
  }
});

async function handleTicketCreationCategory(interaction: StringSelectMenuInteraction): Promise<void> {
  const category = interaction.values[0];
  if (!interaction.guildId || !categories.has(category)) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Invalid ticket category', 'Choose a category from the Slice ticket panel.')] });
  const form = await advancedTickets.activeForm(interaction.guildId, category, interaction.user.id);
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  ticketIntakeSessions.set(id, { guildId: interaction.guildId, actorId: interaction.user.id, category, form, answers: {}, expiresAt: Date.now() + 15 * 60_000 });
  await showTicketIntakeStep(interaction, id);
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
  const id = interaction.customId.split(':')[3]; const session = intakeSession(id, interaction.guildId, interaction.user.id);
  if (!session) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('Intake expired', 'Start a new ticket from the support panel.')] });
  for (const field of nextTextFields(session)) session.answers[field.key] = interaction.fields.getTextInputValue(field.key);
  await interaction.deferReply({ ephemeral: true });
  await continueTicketIntakeAfterReply(interaction, id, session);
}

async function continueTicketIntake(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId.split(':')[3]; const session = intakeSession(id, interaction.guildId, interaction.user.id);
  if (!session) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('Intake expired', 'Start a new ticket from the support panel.')] });
  await showTicketIntakeStep(interaction, id);
}

async function handleTicketIntakeChoice(interaction: StringSelectMenuInteraction): Promise<void> {
  const [, , , id, key] = interaction.customId.split(':'); const session = intakeSession(id, interaction.guildId, interaction.user.id);
  const field = session && normalizedForm(session.form.fields).find((candidate) => candidate.key === key);
  if (!session || !field) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('Intake expired', 'Start a new ticket from the support panel.')] });
  session.answers[key] = interaction.values[0] === '__skip__' ? '' : interaction.values[0]!;
  await interaction.update({ embeds: [SliceEmbed.info('Answer saved', `${INTAKE_SAFETY_WARNING}\n\nContinue when you are ready.`)], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`slice:ticket:intake-next:${id}`).setLabel('Continue').setStyle(ButtonStyle.Primary))] });
}

function intakeSession(id: string | undefined, guildId: string | null, actorId: string) {
  const session = id ? ticketIntakeSessions.get(id) : undefined;
  if (!session || session.guildId !== guildId || session.actorId !== actorId || session.expiresAt < Date.now()) { if (id) ticketIntakeSessions.delete(id); return null; }
  return session;
}

function unansweredField(session: NonNullable<ReturnType<typeof intakeSession>>) { return normalizedForm(session.form.fields).find((field) => session.answers[field.key] === undefined); }
function nextTextFields(session: NonNullable<ReturnType<typeof intakeSession>>) { const fields: TicketIntakeField[] = []; for (const field of normalizedForm(session.form.fields)) { if (session.answers[field.key] !== undefined) continue; if (field.type === 'SELECT' || field.type === 'BOOLEAN') break; fields.push(field); if (fields.length === 5) break; } return fields; }
function textInput(field: TicketIntakeField) { const input = new TextInputBuilder().setCustomId(field.key).setLabel(field.label).setStyle(field.type === 'LONG_TEXT' ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(field.required).setMaxLength(field.maxLength ?? 1800); if (field.minLength) input.setMinLength(field.minLength); if (field.placeholder) input.setPlaceholder(field.placeholder); return new ActionRowBuilder<TextInputBuilder>().addComponents(input); }

async function showTicketIntakeStep(interaction: StringSelectMenuInteraction | ButtonInteraction, id: string): Promise<void> {
  const session = intakeSession(id, interaction.guildId, interaction.user.id); if (!session) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('Intake expired', 'Start a new ticket from the support panel.')] });
  const field = unansweredField(session);
  if (!field) { await interaction.deferReply({ ephemeral: true }); return void await createTicketFromIntake(interaction, id, session); }
  if (field.type === 'SELECT' || field.type === 'BOOLEAN') {
    const options = field.type === 'BOOLEAN' ? [{ label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }] : (field.options ?? []).map((value) => ({ label: value, value })); if (!field.required) options.push({ label: 'Skip this question', value: '__skip__' });
    const payload = { ephemeral: true, embeds: [SliceEmbed.info('Support intake', `${INTAKE_SAFETY_WARNING}\n\n**${field.label}**`)], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`slice:ticket:intake-choice:${id}:${field.key}`).setPlaceholder(field.placeholder ?? 'Choose an answer').setMinValues(field.required ? 1 : 0).setMaxValues(1).addOptions(options))] };
    if (interaction.isButton()) await interaction.update({ embeds: payload.embeds, components: payload.components }); else await interaction.reply(payload); return;
  }
  const fields = nextTextFields(session); const modal = new ModalBuilder().setCustomId(`slice:ticket:intake:${id}`).setTitle('Support intake').addComponents(...fields.map(textInput));
  await interaction.showModal(modal);
}

async function continueTicketIntakeAfterReply(interaction: ModalSubmitInteraction, id: string, session: NonNullable<ReturnType<typeof intakeSession>>): Promise<void> {
  const result = validateAnswers(session.form.fields, session.answers);
  const missing = normalizedForm(session.form.fields).find((field) => session.answers[field.key] === undefined);
  if (result.errors.length && !missing) return void await interaction.editReply({ embeds: [SliceEmbed.error('Intake needs attention', result.errors[0]!) ] });
  if (!missing) return void await createTicketFromIntake(interaction, id, session);
  await interaction.editReply({ embeds: [SliceEmbed.info('Support intake', `${INTAKE_SAFETY_WARNING}\n\nContinue to answer the next question.`)], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`slice:ticket:intake-next:${id}`).setLabel('Continue').setStyle(ButtonStyle.Primary))] });
}

async function createTicketFromIntake(interaction: { guild: Guild | null; guildId: string | null; user: { id: string }; editReply(payload: { embeds: ReturnType<typeof SliceEmbed.success>[] }): Promise<unknown> }, id: string, session: NonNullable<ReturnType<typeof intakeSession>>): Promise<void> {
  const result = validateAnswers(session.form.fields, session.answers); if (result.errors.length) { await interaction.editReply({ embeds: [SliceEmbed.error('Intake needs attention', result.errors[0]!) ] }); return; }
  if (!interaction.guild || !interaction.guildId) throw new TicketCreationError('Ticket creation is available inside the Slice server only.');
  const support = await repository.getResource(interaction.guildId, 'CATEGORY', 'private-support'); if (!support) throw new TicketCreationError('Slice private support is not ready. Ask an administrator to run /setup repair.');
  const existing = (await tickets.findActive(interaction.guildId, interaction.user.id)).find((ticket) => ticket.category === session.category); if (existing?.channelId && !(await interaction.guild.channels.fetch(existing.channelId).catch(() => null))) await tickets.clearMissingChannel(existing.id, interaction.guildId, existing.channelId);
  const policy = await advancedTickets.policy(interaction.guildId, session.category);
  const subjectAnswer = result.answers.find((answer) => answer.fieldKey === 'subject' || answer.fieldKey === 'issue' || answer.fieldKey === 'incident') ?? result.answers[0];
  const service = new TicketCreationService(tickets, createTicketDiscordBoundary(interaction.guild, support.discordId), { getRoleId: async (guildId, key) => (await repository.getResource(guildId, 'ROLE', key))?.discordId ?? null });
  const ticket = await service.create({ guildId: interaction.guildId, creatorDiscordId: interaction.user.id, category: session.category, subject: subjectAnswer?.value.slice(0, 120) || 'Support request', description: result.answers.map((answer) => `${answer.fieldLabel}: ${answer.value}`).join('\n').slice(0, 1800), formVersionId: session.form.id, intakeResponses: result.answers, assignedTeamKey: policy?.routingRoleKey ?? undefined });
  ticketIntakeSessions.delete(id); await interaction.editReply({ embeds: [SliceEmbed.success('Ticket created', `Your private ticket is ready: <#${ticket.channelId}>`)] });
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
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'note' || subcommand === 'tag') {
    const ticket = await tickets.findByChannel(interaction.guildId!, interaction.channelId!); if (!ticket) return void await interaction.reply(ticketError('This ticket control is unavailable.'));
    const authorized = await router.authorize({ ...ticketContext(interaction), ticketId: ticket.id }); if (!authorized.ok) return void await interaction.reply(ticketError(authorized.message));
    if (subcommand === 'note') { const noteId = await advancedTickets.addInternalNote(ticket.id, interaction.guildId!, interaction.user.id, interaction.options.getString('content', true)); return void await interaction.reply({ ephemeral: true, embeds: [noteId ? SliceEmbed.success('Internal note saved', 'The note is private to authorized support staff and the staff transcript.') : SliceEmbed.error('Note unavailable', 'This ticket is no longer available.')] }); }
    const key = interaction.options.getString('key', true).toLowerCase(); const added = interaction.options.getString('action', true) === 'add' ? await advancedTickets.addTag(ticket.id, interaction.guildId!, interaction.user.id, key) : await advancedTickets.removeTag(ticket.id, interaction.guildId!, interaction.user.id, key); return void await interaction.reply({ ephemeral: true, embeds: [added ? SliceEmbed.success('Ticket tags updated', `#${key} was ${interaction.options.getString('action', true) === 'add' ? 'added to' : 'removed from'} this ticket.`) : SliceEmbed.warning('Tag unavailable', 'The tag is unavailable or was already in that state.')] });
  }
  const input = ticketCommandInput(interaction);
  const context = ticketContext(interaction);
  if (input.action === 'escalate') { const target = input.escalationTarget; if (!target || !(await repository.getResource(interaction.guildId!, 'ROLE', target))) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Escalation team unavailable', 'Choose an existing managed Slice staff role key.')] }); const ticket = await tickets.findByChannel(interaction.guildId!, interaction.channelId!); if (!ticket) return void await interaction.reply(ticketError('This ticket control is unavailable.')); const authorized = await router.authorize({ ...context, ticketId: ticket.id }); if (!authorized.ok) return void await interaction.reply(ticketError(authorized.message)); await advancedTickets.addInternalNote(ticket.id, interaction.guildId!, interaction.user.id, `Escalation to ${target}: ${input.reason ?? ''}`.slice(0, 1800)); }
  if (input.action === 'transcript') return void await handleTranscriptCommand(interaction, router, context);
  if (input.action === 'resolve-confirmation' || input.action === 'close-confirmation') {
    return void await openCommandConfirmation(interaction, router, context, input.action === 'resolve-confirmation' ? 'resolve' : 'close');
  }
  await executeTicketAction(interaction, router, context, input.action, input, true);
}

async function isTicketOperationsStaff(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guild || !interaction.guildId) return false;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null); if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const roleIds = new Set(member.roles.cache.keys());
  const resources = await Promise.all(['owner', 'administrator', 'operations', 'support'].map((key) => repository.getResource(interaction.guildId!, 'ROLE', key)));
  return resources.some((resource) => resource && roleIds.has(resource.discordId));
}

async function handleTicketsOperations(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !(await isTicketOperationsStaff(interaction))) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Staff access required', 'Only authorized Slice support staff can view ticket operations.')] });
  await interaction.deferReply({ ephemeral: true }); const sub = interaction.options.getSubcommand();
  if (sub === 'queue') {
    const filter = interaction.options.getString('filter', true) as 'OPEN' | 'UNASSIGNED' | 'MINE' | 'HIGH_PRIORITY' | 'SLA_RISK' | 'SLA_BREACHED' | 'CATEGORY' | 'ALL'; const rows = await advancedTickets.queue(interaction.guildId, filter, interaction.user.id, interaction.options.getString('category') ?? undefined, interaction.options.getString('status') ?? undefined, interaction.options.getUser('assignee')?.id);
    const body = rows.length ? rows.map((ticket) => `\`${ticket.id.slice(0, 8)}\` · **${ticket.priority}** · ${ticket.category.replace(/-/g, ' ')} · ${ticket.status.replace(/_/g, ' ')}\n<@${ticket.creatorDiscordId}> · ${ticket.assignedStaffId ? `<@${ticket.assignedStaffId}>` : ticket.assignedTeamKey ? `Team: ${ticket.assignedTeamKey}` : 'Unassigned'} · ${ticket.tags.map((tag) => `#${tag.key}`).join(' ') || 'No tags'} · ${ticketSlaState(ticket)}`).join('\n\n') : 'No tickets match this queue.';
    return void await interaction.editReply({ embeds: [SliceEmbed.info('Support queue', body.slice(0, 3900))] });
  }
  if (sub === 'search') {
    const days = interaction.options.getInteger('created-within-days'); const rows = await advancedTickets.search(interaction.guildId, { reference: interaction.options.getString('reference') ?? undefined, creatorDiscordId: interaction.options.getUser('member')?.id, category: interaction.options.getString('category') ?? undefined, tag: interaction.options.getString('tag') ?? undefined, status: interaction.options.getString('status') ?? undefined, assignedStaffId: interaction.options.getUser('assignee')?.id, ...(days ? { createdSince: new Date(Date.now() - days * 86_400_000) } : {}) });
    return void await interaction.editReply({ embeds: [SliceEmbed.info('Ticket search', rows.length ? rows.map((ticket) => `\`${ticket.id.slice(0, 8)}\` · **${ticket.category.replace(/-/g, ' ')}** · ${ticket.status} · ${ticket.priority} · <@${ticket.creatorDiscordId}>`).join('\n') : 'No tickets match that search.')] });
  }
  if (sub === 'view') {
    const reference = interaction.options.getString('reference', true); const matches = await advancedTickets.search(interaction.guildId, { reference, limit: 2 }); const ticket = matches.length === 1 ? await advancedTickets.ticketDetail(matches[0]!.id, interaction.guildId) : null;
    if (!ticket) return void await interaction.editReply({ embeds: [SliceEmbed.warning('Ticket unavailable', 'Use a unique ticket reference from the staff queue.')] });
    const intake = ticket.intakeResponses.length ? ticket.intakeResponses.map((answer) => `• **${answer.fieldLabel}**: ${answer.value}`).join('\n') : 'No recorded intake answers.';
    return void await interaction.editReply({ embeds: [SliceEmbed.info(`Ticket ${ticket.id.slice(0, 8)}`, `**${ticket.category.replace(/-/g, ' ')}** · ${ticket.status} · ${ticket.priority}\nRequester: <@${ticket.creatorDiscordId}>\nAssigned: ${ticket.assignedStaffId ? `<@${ticket.assignedStaffId}>` : 'Unassigned'}${ticket.assignedTeamKey ? ` · Team: ${ticket.assignedTeamKey}` : ''}\nSLA: ${ticketSlaState(ticket)}\nTags: ${ticket.tagAssignments.map((item) => `#${item.tag.key}`).join(' ') || 'None'}\nInternal notes: ${ticket.internalNotes.length}\n\n**Intake**\n${intake}`.slice(0, 3900))] });
  }
  const days = interaction.options.getString('period', true) === '30d' ? 30 : 7; const stats = await advancedTickets.stats(interaction.guildId, new Date(Date.now() - days * 86_400_000));
  await interaction.editReply({ embeds: [SliceEmbed.info(`Support operations · ${days} days`, `Opened: **${stats.opened}**\nOpen backlog: **${stats.open}**\nUnassigned: **${stats.unassigned}**\nAverage first response: **${formatDuration(stats.averageFirstResponseMs)}**\nAverage resolution: **${formatDuration(stats.averageResolutionMs)}**\nFirst-response SLA met: **${stats.firstResponseMet}**\nResolution SLA met: **${stats.resolutionMet}**\n\nBy category: ${formatCounts(stats.byCategory)}\nBy priority: ${formatCounts(stats.byPriority)}`)] });
}

async function handleTicketConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Manage Server required', 'Only Discord server managers can change support configuration.')] });
  await interaction.deferReply({ ephemeral: true }); const sub = interaction.options.getSubcommand(); const category = interaction.options.getString('category');
  if (category && !categories.has(category)) return void await interaction.editReply({ embeds: [SliceEmbed.error('Invalid category', 'Choose a configured Slice support category.')] });
  if (sub === 'categories') { const lines = await Promise.all([...categories].sort().map(async (key) => { const policy = await advancedTickets.policy(interaction.guildId!, key); return `• **${key.replace(/-/g, ' ')}** — ${policy?.routingRoleKey ?? 'Default support routing'} · ${policy?.firstResponseMinutes ?? 240}m first response · ${policy?.resolutionMinutes ?? 2880}m resolution`; })); return void await interaction.editReply({ embeds: [SliceEmbed.info('Ticket category policies', lines.join('\n').slice(0, 3900))] }); }
  if (sub === 'form') { const form = await advancedTickets.activeForm(interaction.guildId, category!, interaction.user.id); return void await interaction.editReply({ embeds: [SliceEmbed.info(`Intake form · ${category!.replace(/-/g, ' ')}`, `Version **${form.version}** · ${form.fields.length} configured questions\n\n${normalizedForm(form.fields).map((field) => `• \`${field.key}\` — **${field.label}** · ${field.type}${field.required ? ' · required' : ''}`).join('\n')}\n\n${INTAKE_SAFETY_WARNING}`)], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`slice:ticket-config:form-add:${category}`).setLabel('Add question').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`slice:ticket-config:form-disable:${category}`).setLabel('Disable question').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`slice:ticket-config:form-reset:${category}`).setLabel('Restore default form').setStyle(ButtonStyle.Danger))] }); }
  if (sub === 'form-edit' || sub === 'form-reorder') { const form = await advancedTickets.activeForm(interaction.guildId, category!, interaction.user.id); const key = interaction.options.getString('key', true); const index = form.fields.findIndex((field) => field.key === key); if (index < 0) return void await interaction.editReply({ embeds: [SliceEmbed.error('Question unavailable', 'That stable question key is not in the active form.')] }); let fields = [...form.fields]; if (sub === 'form-edit') { const current = fields[index]!; fields[index] = { ...current, label: interaction.options.getString('label', true).trim(), ...(interaction.options.getBoolean('required') === null ? {} : { required: interaction.options.getBoolean('required')! }) }; } else { const [field] = fields.splice(index, 1); fields.splice(Math.min(interaction.options.getInteger('position', true) - 1, fields.length), 0, field!); fields = fields.map((field, order) => ({ ...field, order: order + 1 })); } const version = await advancedTickets.createFormVersion(interaction.guildId, category!, fields, interaction.user.id); return void await interaction.editReply({ embeds: [SliceEmbed.success(sub === 'form-edit' ? 'Question updated' : 'Question reordered', `Form version **${version.version}** is active for new tickets; historic intake remains unchanged.`)] }); }
  if (sub === 'routing') { const value = interaction.options.getString('team', true); const team = value === 'clear' ? null : value; if (team && !(await repository.getResource(interaction.guildId, 'ROLE', team))) return void await interaction.editReply({ embeds: [SliceEmbed.error('Managed role unavailable', 'Use an existing managed Slice role key, or `clear`.')] }); const policy = await advancedTickets.upsertPolicy(interaction.guildId, category!, { routingRoleKey: team }); return void await interaction.editReply({ embeds: [SliceEmbed.success('Routing updated', `${category!.replace(/-/g, ' ')} routes to ${policy.routingRoleKey ?? 'the default support team'}.`)] }); }
  if (sub === 'sla') { const policy = await advancedTickets.upsertPolicy(interaction.guildId, category!, { firstResponseMinutes: interaction.options.getInteger('first-response-minutes', true), resolutionMinutes: interaction.options.getInteger('resolution-minutes', true) }); return void await interaction.editReply({ embeds: [SliceEmbed.success('SLA updated', `${category!.replace(/-/g, ' ')}: ${policy.firstResponseMinutes}m first response · ${policy.resolutionMinutes}m resolution.`)] }); }
  if (sub === 'inactivity') { const warning = interaction.options.getInteger('warning-hours', true); const close = interaction.options.getInteger('close-hours', true); if (close < warning) return void await interaction.editReply({ embeds: [SliceEmbed.error('Invalid inactivity policy', 'Close-after must be at least as long as warning-after.')] }); const policy = await advancedTickets.upsertPolicy(interaction.guildId, category!, { inactivityWarningHours: warning, inactivityCloseHours: close, protectedFromAutoClose: interaction.options.getBoolean('protected') ?? false }); return void await interaction.editReply({ embeds: [SliceEmbed.success('Inactivity policy updated', `${category!.replace(/-/g, ' ')}: warning at ${policy.inactivityWarningHours}h · close at ${policy.inactivityCloseHours}h${policy.protectedFromAutoClose ? ' · protected from automatic close' : ''}.`)] }); }
  const action = interaction.options.getString('action', true); const key = interaction.options.getString('key', true).toLowerCase(); if (!/^[a-z][a-z0-9-]{0,47}$/.test(key)) return void await interaction.editReply({ embeds: [SliceEmbed.error('Invalid tag key', 'Use 1–48 lowercase letters, numbers, and hyphens, beginning with a letter.')] }); if (action === 'DISABLE') { const changed = await advancedTickets.disableTag(interaction.guildId, key, interaction.user.id); return void await interaction.editReply({ embeds: [changed ? SliceEmbed.success('Tag disabled', `#${key} remains visible on historic tickets but cannot be added to new tickets.`) : SliceEmbed.warning('Tag unavailable', `#${key} is not an active tag.`)] }); } const label = interaction.options.getString('label'); if (!label || !label.trim() || label.length > 80) return void await interaction.editReply({ embeds: [SliceEmbed.error('Label required', 'Provide a tag label of up to 80 characters.')] }); if ((await advancedTickets.listTags(interaction.guildId)).filter((tag) => tag.enabled).length >= 50) return void await interaction.editReply({ embeds: [SliceEmbed.error('Tag limit reached', 'A guild may have up to 50 active support tags.')] }); await advancedTickets.upsertTag(interaction.guildId, key, label.trim(), interaction.user.id); await interaction.editReply({ embeds: [SliceEmbed.success('Tag saved', `#${key} is available to staff.`)] });
}

async function handleAnalytics(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !interaction.guildId || !(await isTicketOperationsStaff(interaction))) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Staff access required', 'Analytics are available only to authorized Slice staff.')] });
  const subcommand = interaction.options.getSubcommand(); const period = (subcommand === 'health' ? '7d' : interaction.options.getString('period', true)) as AnalyticsPeriod;
  if (subcommand === 'export' && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Manage Server required', 'Only server managers can export aggregate analytics.')] });
  await interaction.deferReply({ ephemeral: true });
  if (subcommand === 'health') { const workers = await analytics.health(); const health = workers.length ? workers.map((worker) => `• **${worker.workerName}** — ${worker.status} · <t:${Math.floor(worker.lastHeartbeatAt.getTime() / 1000)}:R>`).join('\n') : 'No durable worker heartbeat has been recorded yet.'; return void await interaction.editReply({ embeds: [SliceEmbed.info('Slice operations health', `Gateway: **${client.isReady() ? 'HEALTHY' : 'UNHEALTHY'}**\nDatabase: **HEALTHY** (analytics query succeeded)\n\n**Workers**\n${health}\n\nHealth data never includes URLs, credentials, or stack traces.`)] }); }
  if (subcommand === 'export') { const rows = await analytics.exportRows(interaction.guildId, period); const header = 'day,messages,support_messages,joins,leaves,command_runs,command_successes,command_user_errors,command_denied,command_failures'; const csv = [header, ...rows.map((row) => [row.day.toISOString().slice(0, 10), row.messages, row.supportMessages, row.joins, row.leaves, row.commandRuns, row.commandSuccesses, row.commandUserErrors, row.commandDenied, row.commandFailures].join(','))].join('\n'); return void await interaction.editReply({ embeds: [SliceEmbed.success('Analytics export ready', `${rows.length} aggregate daily rows. This file contains no message content, command arguments, ticket content, or financial data.`)], files: [{ attachment: Buffer.from(csv, 'utf8'), name: `slice-analytics-${period}.csv` }] }); }
  const data = await analytics.overview(interaction.guildId, period, interaction.guild.memberCount); const totals = data.totals; const trend = metricTrend(totals.messages ?? 0, data.priorTotals.messages ?? 0); const channels = data.channels.length ? data.channels.slice(0, 5).map((channel) => `• <#${channel.channelId}> — ${channel.messages} messages`).join('\n') : 'Message/channel collection begins after analytics deployment.'; const commands = data.commands.length ? data.commands.slice(0, 6).map((command) => `• **/${command.command}${command.subcommand ? ` ${command.subcommand}` : ''}** — ${command.runs}`).join('\n') : 'No command telemetry in this period.';
  if (subcommand === 'engagement') return void await interaction.editReply({ embeds: [SliceEmbed.info(`Engagement · ${period}`, `Active members: **${data.activeMembers}**\nEligible community messages: **${totals.messages ?? 0}** (${trend})\nMessages per active member: **${data.activeMembers ? ((totals.messages ?? 0) / data.activeMembers).toFixed(1) : '—'}**\nActive channels: **${data.channels.length}**\nCommand runs: **${totals.commandRuns ?? 0}**\n\n**Busiest managed channels**\n${channels}\n\nActive member = a non-bot member who messaged, used a command, or performed a tracked community interaction during the period.`)] });
  if (subcommand === 'community') return void await interaction.editReply({ embeds: [SliceEmbed.info(`Community activity · ${period}`, `Suggestions created: **${data.community.suggestions}**\nPolls created: **${data.community.polls}**\nGiveaways run: **${data.community.giveaways}**\nMeme competitions run: **${data.community.memes}**\n\nThese totals reuse bot-owned community records. They do not include financial, account, or investment data.`)] });
  if (subcommand === 'support') return void await interaction.editReply({ embeds: [SliceEmbed.info(`Support operations · ${period}`, `Open backlog: **${data.support.open}**\nUnassigned: **${data.support.unassigned}**\nOpened: **${data.support.opened}**\nResolved: **${data.support.resolved}**\n\nBy status: ${formatCounts(data.support.byStatus)}`)] });
  if (subcommand === 'commands') return void await interaction.editReply({ embeds: [SliceEmbed.info(`Command operations · ${period}`, `Runs: **${totals.commandRuns ?? 0}**\nSuccessful: **${totals.commandSuccesses ?? 0}**\nUser validation errors: **${totals.commandUserErrors ?? 0}**\nPermission denials: **${totals.commandDenied ?? 0}**\nInternal failures: **${totals.commandFailures ?? 0}**\n\n**Most used**\n${commands}`)] });
  if (subcommand === 'publishing') return void await interaction.editReply({ embeds: [SliceEmbed.info(`Publishing operations · ${period}`, `Publications sent: **${data.publishing.publications}**\nScheduled runs: ${formatCounts(data.publishing.runs)}\n\nDiscord records establish delivery attempts, not impressions, click-through, conversion, or revenue.`)] });
  await interaction.editReply({ embeds: [SliceEmbed.info(`Slice operations · ${period}`, `**Community**\nMembers: **${data.memberCount}** · Active: **${data.activeMembers}** · Messages: **${totals.messages ?? 0}**\nJoins: **${totals.joins ?? 0}** · Leaves: **${totals.leaves ?? 0}** · Commands: **${totals.commandRuns ?? 0}**\n\n**Support**\nOpen: **${data.support.open}** · Unassigned: **${data.support.unassigned}** · Resolved: **${data.support.resolved}**\n\n**Publishing**\nSent: **${data.publishing.publications}** · Scheduled: ${formatCounts(data.publishing.runs)}\n\n**Systems**\nGateway: **${client.isReady() ? 'HEALTHY' : 'UNHEALTHY'}** · Worker: use /analytics health for durable status.`)] });
}
function metricTrend(current: number, prior: number): string { if (!prior) return 'Prior-period data unavailable'; const percent = ((current - prior) / prior) * 100; return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}% vs prior period`; }

function ticketSlaState(ticket: { firstStaffResponseAt: Date | null; firstResponseDueAt: Date | null; resolutionDueAt: Date | null; createdAt?: Date; status?: string }): string { if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') return 'MET / recorded'; const now = Date.now(); if (!ticket.firstStaffResponseAt && ticket.firstResponseDueAt) { const riskAt = ticket.createdAt ? ticket.firstResponseDueAt.getTime() - (ticket.firstResponseDueAt.getTime() - ticket.createdAt.getTime()) * .25 : ticket.firstResponseDueAt.getTime(); return now > ticket.firstResponseDueAt.getTime() ? 'FIRST RESPONSE BREACHED' : now >= riskAt ? 'FIRST RESPONSE AT RISK' : 'ON TRACK'; } if (ticket.resolutionDueAt) return now > ticket.resolutionDueAt.getTime() ? 'RESOLUTION BREACHED' : 'ON TRACK'; return 'ON TRACK'; }
function formatDuration(value: number | null): string { return value === null ? '—' : value < 3_600_000 ? `${Math.round(value / 60_000)}m` : `${(value / 3_600_000).toFixed(1)}h`; }
function formatCounts(value: Record<string, number>): string { const entries = Object.entries(value); return entries.length ? entries.map(([key, count]) => `${key.replace(/-/g, ' ')} ${count}`).join(' · ') : 'None'; }

async function canConfigureTickets(interaction: { guildId: string | null; memberPermissions: { has(permission: bigint): boolean } | null }): Promise<boolean> { return Boolean(interaction.guildId && interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)); }
async function handleTicketConfigButton(interaction: ButtonInteraction): Promise<void> {
  const [, , action, category] = interaction.customId.split(':'); if (!category || !categories.has(category) || !(await canConfigureTickets(interaction))) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Manage Server required', 'Only Discord server managers can change support configuration.')] });
  if (action === 'form-add') { const modal = new ModalBuilder().setCustomId(`slice:ticket-config:form-save:${category}`).setTitle('Add intake question').addComponents(row('key', 'Stable key (lowercase-hyphen)', TextInputStyle.Short, true, 48), row('label', 'Question label', TextInputStyle.Short, true, 45), row('type', 'SHORT_TEXT, LONG_TEXT, SELECT, BOOLEAN, OPTIONAL_TEXT', TextInputStyle.Short, true, 20), row('required', 'Required? yes or no', TextInputStyle.Short, true, 3), row('options', 'Select options, comma-separated (if SELECT)', TextInputStyle.Paragraph, false, 500)); return void await interaction.showModal(modal); }
  const form = await advancedTickets.activeForm(interaction.guildId!, category, interaction.user.id);
  if (action === 'form-disable') { const fields = normalizedForm(form.fields); if (!fields.length) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('No active questions', 'This form has no enabled questions to disable.')] }); return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.info('Disable intake question', 'Disabled questions remain in prior version snapshots but are not asked on future tickets.')], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`slice:ticket-config:form-disable-select:${category}`).setPlaceholder('Choose a question').addOptions(fields.map((field) => ({ label: field.label, value: field.key }))))] }); }
  if (action === 'form-reset') { const { DEFAULT_TICKET_FORMS } = await import('./advanced-ticket-forms.js'); const defaults = DEFAULT_TICKET_FORMS[category]; if (!defaults) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('No default form', 'This category has no packaged default form.')] }); await advancedTickets.createFormVersion(interaction.guildId!, category, defaults, interaction.user.id); return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.success('Default form restored', 'New tickets use a fresh version of the packaged safe default form. Existing ticket snapshots were not changed.')] }); }
}
async function handleTicketConfigSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const [, , action, category] = interaction.customId.split(':'); if (action !== 'form-disable-select' || !category || !(await canConfigureTickets(interaction))) return; const form = await advancedTickets.activeForm(interaction.guildId!, category, interaction.user.id); const key = interaction.values[0]!; const fields = form.fields.map((field) => field.key === key ? { ...field, enabled: false } : field); if (!normalizedForm(fields).length) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('One question required', 'A ticket form must retain at least one enabled question.')] }); await advancedTickets.createFormVersion(interaction.guildId!, category, fields, interaction.user.id); await interaction.update({ embeds: [SliceEmbed.success('Question disabled', 'New tickets use the new form version. Existing ticket snapshots were not changed.')], components: [] });
}
async function handleTicketConfigModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [, , action, category] = interaction.customId.split(':'); if (action !== 'form-save' || !category || !(await canConfigureTickets(interaction))) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Manage Server required', 'Only Discord server managers can change support configuration.')] }); const type = interaction.fields.getTextInputValue('type').trim().toUpperCase(); if (!['SHORT_TEXT', 'LONG_TEXT', 'SELECT', 'BOOLEAN', 'OPTIONAL_TEXT'].includes(type)) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Unsupported question type', 'Use SHORT_TEXT, LONG_TEXT, SELECT, BOOLEAN, or OPTIONAL_TEXT.')] }); const options = interaction.fields.getTextInputValue('options').split(',').map((value) => value.trim()).filter(Boolean); const form = await advancedTickets.activeForm(interaction.guildId!, category, interaction.user.id); const key = interaction.fields.getTextInputValue('key').trim(); if (form.fields.some((field) => field.key === key)) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Duplicate key', 'Each question needs a unique stable key.')] }); const field: TicketIntakeField = { key, label: interaction.fields.getTextInputValue('label').trim(), type: type as TicketIntakeField['type'], required: interaction.fields.getTextInputValue('required').trim().toLowerCase() === 'yes', order: Math.max(0, ...form.fields.map((item) => item.order)) + 1, enabled: true, maxLength: type === 'LONG_TEXT' ? 1800 : 300, ...(type === 'SELECT' ? { options } : {}) }; try { const version = await advancedTickets.createFormVersion(interaction.guildId!, category, [...form.fields, field], interaction.user.id); await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.success('Question added', `Form version **${version.version}** is now active for new tickets.`)] }); } catch (error) { await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Question not saved', error instanceof Error ? error.message : 'The intake question is invalid.')] }); }
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

async function executeTicketAction(interaction: { guildId: string | null; channelId: string | null; user: { id: string }; deferReply(options: { ephemeral: true }): Promise<unknown>; editReply(payload: { embeds: ReturnType<typeof SliceEmbed.success>[] }): Promise<unknown>; channel?: unknown; guild?: Guild | null; message?: TicketControlMessage }, router: TicketInteractionRouter, context: TicketRouteContext, action: TicketRouteAction, options: { priority?: string; targetId?: string; escalationTarget?: string; reason?: string } = {}, refreshChannel = false): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const result = context.ticketId ? await router.execute(action, context, options) : await router.executeForChannel(action, context, options);
  if (!result.ok || !result.ticket) return void await interaction.editReply(ticketError(result.message));
  if (result.changed) {
    if (result.escalationTarget || options.escalationTarget) await applyEscalationPermission(interaction.channel, result.ticket.guildId, options.escalationTarget ?? result.escalationTarget!).catch((error) => logger.warn('ticket.escalation_permission_failed', { ticketId: result.ticket?.id, name: error instanceof Error ? error.name : 'unknown' }));
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

async function generateTranscript(guild: Guild, ticketId: string): Promise<void> { const history: TicketHistory = { read: async (ticket) => { const channel = await guild.channels.fetch(ticket.channelId); if (!channel?.isTextBased() || !('messages' in channel)) throw new Error('Ticket history unavailable.'); const messages = await channel.messages.fetch({ limit: 100 }); return { partial: messages.size === 100, messages: [...messages.values()].map((message) => ({ id: message.id, createdAt: message.createdAt, authorId: message.author.id, authorLabel: message.author.tag, content: message.content, bot: message.author.bot, attachments: [...message.attachments.values()].map((attachment) => ({ name: attachment.name ?? 'attachment', url: attachment.url })) })) }; } }; const result = await transcripts.generate(ticketId, guild.id, history); await staffTranscripts.generate(ticketId, guild.id, history); const log = await repository.getResource(guild.id, 'CHANNEL', 'support-log'); if (log && !result.reused) { const channel = await guild.channels.fetch(log.discordId).catch(() => null); if (channel?.isTextBased() && 'send' in channel) { await channel.send({ embeds: [SliceEmbed.info('Ticket transcript', `Ticket ${ticketId.slice(0, 8)} customer-safe transcript: **${result.transcript.status}**. A separate staff-only transcript is retained.`)] }); await tickets.markTranscriptDelivered(ticketId, log.discordId); } } }

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
