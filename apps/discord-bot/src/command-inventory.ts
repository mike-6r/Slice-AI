import { configurationCommand } from './commands/configuration.js';
import { setupCommand } from './commands/setup.js';
import { accountCommand, faqCommand, rolesCommand, supportCommand } from './commands/onboarding.js';
import { ticketCommand } from './commands/tickets.js';
import { ticketConfigCommand, ticketsCommand } from './commands/advanced-tickets.js';
import { banCommand, modcaseCommand, modhistoryCommand, noteCommand, timeoutCommand, unbanCommand, untimeoutCommand, warnCommand } from './commands/moderation.js';
import { achievementsCommand, dailyCommand, leaderboardCommand, levelCommand, repCommand, reputationCommand } from './commands/progression.js';
import { birthdayCommand, notificationsCommand, pollCommand, suggestCommand, suggestionCommand } from './commands/community.js';
import { giveawayCommand } from './commands/giveaway.js';
import { memeCommand } from './commands/meme.js';
import { assetCommand, balanceCommand, cardCommand, collectorCommand, historyCommand, marketCommand, portfolioCommand, priceCommand, profileCommand, searchCommand, topCommand, transactionsCommand, valueCommand, vaultCommand, watchlistCommand } from './commands/market.js';
import { priceAlertCommand } from './commands/price-alerts.js';
import { aboutCommand, askCommand, helpCommand, insightsCommand, statusCommand, summaryCommand, trendingCommand } from './commands/intelligence.js';
import { announceCommand, inviteCommand, offerCommand, requestCommand, roadmapCommand } from './commands/gap-sweep.js';
import { opsCommand } from './staff-operations.js';
import { sliceCommand } from './my-slice.js';
import { embedCommand } from './commands/embed.js';
import { scheduleCommand } from './commands/schedule.js';
import { analyticsCommand } from './commands/analytics.js';
import { spotlightCommand } from './commands/spotlight.js';

/** Single source of truth for runtime registration and deployment synchronization. */
export const discordCommandInventory = [
  setupCommand, configurationCommand, accountCommand, sliceCommand, rolesCommand, faqCommand, supportCommand, opsCommand, ticketCommand, ticketsCommand, ticketConfigCommand,
  warnCommand, noteCommand, timeoutCommand, untimeoutCommand, banCommand, unbanCommand, modcaseCommand, modhistoryCommand,
  levelCommand, leaderboardCommand, repCommand, reputationCommand, achievementsCommand, dailyCommand,
  notificationsCommand, suggestCommand, suggestionCommand, pollCommand, birthdayCommand, giveawayCommand, memeCommand,
  cardCommand, searchCommand, valueCommand, priceCommand, historyCommand, topCommand, assetCommand, marketCommand, collectorCommand, vaultCommand, portfolioCommand, balanceCommand, transactionsCommand, watchlistCommand, profileCommand, priceAlertCommand,
  askCommand, helpCommand, summaryCommand, insightsCommand, trendingCommand, aboutCommand, statusCommand,
  inviteCommand, roadmapCommand, announceCommand, requestCommand, offerCommand,
  embedCommand,
  scheduleCommand,
  analyticsCommand,
  spotlightCommand,
];
