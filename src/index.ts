import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  PermissionFlagsBits,
  ButtonInteraction,
  GuildMemberRoleManager,
  TextBasedChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { config } from './config.js';
import { getGuildSettings, upsertGuildSettings } from './guildConfig.js';
import {
  claimTicket,
  closeTicket,
  createTicket,
  getTicketByChannel,
  getTicketByMessage,
  setTicketMessageId,
  getUserTicketHistorySummary,
  countRecentTicketsByCreator,
  updateTicketMetrics,
  reopenTicket,
  getGuildTicketStats,
} from './tickets/repo.js';
import { renderTicketMessage } from './tickets/render.js';
import { buildTranscript } from './tickets/transcript.js';
import { handleInfoCommand } from './analytics/infoCommand.js';
import { buildNotice } from './ui/notice.js';
import { renderCategoryPanel } from './ui/panel.js';
import { createTicketCategory, listTicketCategories } from './tickets/categoriesRepo.js';
import { getModHistorySummary } from './mod/modRepo.js';
import { listLinks, createLink } from './tickets/linksRepo.js';
import { analyzePriority, findAggressiveWords, getSuggestionsFromText } from './tickets/analysis.js';
import { createModAction } from './mod/modRepo.js';
import { renderWelcomeMessage } from './ui/welcome.js';
import { renderTicketOpenPanel } from './ui/openPanel.js';
import { renderStatusPanel } from './ui/status.js';
import http from 'http';

const COMPONENTS_V2 = (MessageFlags as any).IsComponentsV2 ?? 1 << 15;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

client.once('ready', () => {
  console.log(`SwiftTicket ready as ${client.user?.tag}`);
});

const statusServer = http.createServer((req, res) => {
  if (!req.url) return;
  if (req.url.startsWith('/status')) {
    const uptimeMs = process.uptime() * 1000;
    const hours = Math.floor(uptimeMs / 3600000);
    const minutes = Math.floor((uptimeMs % 3600000) / 60000);
    const status = {
      botTag: client.user?.tag ?? 'SwiftTicket',
      latencyMs: Math.round(client.ws.ping),
      guilds: client.guilds.cache.size,
      uptime: `${hours}h ${minutes}m`,
    };
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(status));
    return;
  }
  if (req.url.startsWith('/dashboard-data')) {
    (async () => {
      const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
      const guildIdParam = url.searchParams.get('guild_id');
      const selectedGuild = guildIdParam || process.env.GUILD_ID || client.guilds.cache.first()?.id || '';
      const guild = selectedGuild ? client.guilds.cache.get(selectedGuild) : null;
      const settings = selectedGuild ? await getGuildSettings(selectedGuild).catch(() => null) : null;
      const stats = selectedGuild ? await getGuildTicketStats(selectedGuild).catch(() => null) : null;
      const categories = selectedGuild ? await listTicketCategories(selectedGuild).catch(() => []) : [];
      const staffRoleId = settings?.staff_role_id ?? null;
      const staffCount = staffRoleId && guild ? guild.roles.cache.get(staffRoleId)?.members?.size ?? 0 : 0;
      const guilds = client.guilds.cache.map((g) => ({
        id: g.id,
        name: g.name,
        memberCount: g.memberCount ?? 0,
        iconURL: g.iconURL() ?? null,
        status: 'installed',
      }));
      const payload = {
        botTag: client.user?.tag ?? 'SwiftTicket',
        latencyMs: Math.round(client.ws.ping),
        uptime: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
        guilds,
        selectedGuild,
        stats,
        categories,
        staffRoleId,
        staffCount,
        inviteUrl: `https://discord.com/api/oauth2/authorize?client_id=${config.appId}&permissions=268693568&scope=bot%20applications.commands`,
      };
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(payload));
    })().catch((err) => {
      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ error: err?.message ?? 'Unknown error' }));
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
  res.end('Not found');
});

const statusPort = Number(process.env.STATUS_PORT ?? process.env.PORT ?? 8080);
statusServer.listen(statusPort, '0.0.0.0', () => {
  console.log(`Status server running on :${statusPort}`);
});

client.on('guildCreate', async (guild) => {
  try {
    const payload = renderWelcomeMessage(guild.name);
    const systemChannel = guild.systemChannel;
    if (systemChannel?.isTextBased()) {
      await systemChannel.send(payload);
      return;
    }
    const channel = guild.channels.cache
      .filter((c) => c.isTextBased())
      .find((c: any) => c?.viewable && c?.permissionsFor(guild.members.me!)?.has(['SendMessages', 'ViewChannel']));
    if (channel && channel.isTextBased()) {
      await channel.send(payload);
    }
  } catch (err) {
    console.error('Failed to send welcome message', err);
  }
});

const DEFAULT_SETTINGS = {
  warn_threshold: 3,
  warn_timeout_minutes: 10,
  enable_smart_replies: true,
  enable_ai_suggestions: true,
  enable_auto_priority: true,
};

function withDefaults(settings: any) {
  const base = settings ?? {};
  return {
    ...base,
    warn_threshold: base.warn_threshold ?? DEFAULT_SETTINGS.warn_threshold,
    warn_timeout_minutes: base.warn_timeout_minutes ?? DEFAULT_SETTINGS.warn_timeout_minutes,
    enable_smart_replies: base.enable_smart_replies ?? DEFAULT_SETTINGS.enable_smart_replies,
    enable_ai_suggestions: base.enable_ai_suggestions ?? DEFAULT_SETTINGS.enable_ai_suggestions,
    enable_auto_priority: base.enable_auto_priority ?? DEFAULT_SETTINGS.enable_auto_priority,
  };
}

const SMART_REPLIES: { keyword: string; response: string }[] = [
  {
    keyword: 'banned',
    response:
      'It looks like you mentioned a ban. Please include your username, the reason you believe you were banned, and any relevant context.',
  },
  {
    keyword: 'refund',
    response: 'For refunds, please share your order ID, payment method, and date of purchase.',
  },
  {
    keyword: 'scam',
    response:
      'If this is a scam report, include screenshots, user IDs involved, and any transaction links.',
  },
];

function getSmartReply(message: string) {
  const lower = message.toLowerCase();
  return SMART_REPLIES.find((r) => lower.includes(r.keyword))?.response ?? null;
}

function isOwner(interaction: any) {
  const userId = interaction?.user?.id;
  if (!userId) return false;
  const guildId = interaction?.guildId ?? interaction?.guild?.id;
  const guild = interaction?.guild ?? (guildId ? client.guilds.cache.get(guildId) : null);
  const ownerId = guild?.ownerId;
  return Boolean(ownerId && userId === ownerId);
}

function hasRole(interaction: any, roleId: string) {
  if (!roleId) return false;
  const member: any = interaction.member;
  if (!member) return false;
  const roles = member.roles;
  if (roles?.cache?.has) return roles.cache.has(roleId);
  if (Array.isArray(roles)) return roles.includes(roleId);
  return false;
}

function hasPermission(interaction: any, perm: bigint) {
  return (
    interaction.memberPermissions?.has(perm) ||
    interaction.member?.permissions?.has?.(perm) ||
    false
  );
}

function isStaff(interaction: any, staffRoleId: string) {
  if (isOwner(interaction)) return true;
  return hasRole(interaction, staffRoleId);
}

function isAdminOrOwner(interaction: any) {
  if (isOwner(interaction)) return true;
  return hasPermission(interaction, PermissionFlagsBits.Administrator) || hasPermission(interaction, PermissionFlagsBits.ManageGuild);
}

async function respondNotice(
  interaction: any,
  kind: 'error' | 'info' | 'success',
  title: string,
  body: string,
  ephemeral = true,
) {
  const payload = buildNotice(kind, title, body);
  const compFlag = (MessageFlags as any).IsComponentsV2 ?? 1 << 15;
  const ephFlag = (MessageFlags as any).Ephemeral ?? 1 << 6;
  payload.flags = compFlag | (ephemeral ? ephFlag : 0);
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply({ ...payload });
}

async function createSurface(interaction: ChatInputCommandInteraction, parentId: string, staffRoleId: string) {
  const guild = interaction.guild;
  if (!guild) throw new Error('Guild unavailable');

  const parent = await client.channels.fetch(parentId);
  if (!parent) throw new Error('TICKET_PARENT_CHANNEL_ID not found');

  const overwrites = [
    { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  if (parent.type !== ChannelType.GuildCategory) {
    throw new Error('Ticket parent must be a category channel.');
  }

  const channel = await guild.channels.create({
    name: `ticket-${Date.now()}`,
    parent: parent.id,
    type: ChannelType.GuildText,
    permissionOverwrites: overwrites,
    topic: `SwiftTicket for ${interaction.user.tag}`,
    reason: 'Ticket created',
  });
  return { channel };
}

async function buildRenderContext(
  ticket: { id: number; guild_id: string; creator_id: string; query_text: string },
  settings: any,
) {
  const [mod, history, links] = await Promise.all([
    getModHistorySummary(ticket.guild_id, ticket.creator_id),
    getUserTicketHistorySummary(ticket.guild_id, ticket.creator_id),
    listLinks(ticket.id),
  ]);
  return {
    moderation: {
      warnings: mod.warnings,
      mutes: mod.mutes,
      bans: mod.bans,
      previousTickets: history.totalTickets,
      lastSupportAt: history.lastSupportAt,
    },
    links: links.map((l) => l.linked_ticket_id),
    suggestions: settings.enable_ai_suggestions ? getSuggestionsFromText(ticket.query_text) : [],
  };
}

async function createTicketWithReason(
  interaction: any,
  guildSettings: { ticket_parent_channel_id: string; staff_role_id: string; timezone: string | null },
  reason: string,
  category?: { id: number; name: string; description?: string | null } | null,
) {
  await interaction.deferReply({ flags: (MessageFlags as any).Ephemeral ?? 1 << 6 });
  let surface;
  try {
    surface = await createSurface(interaction, guildSettings.ticket_parent_channel_id, guildSettings.staff_role_id);
  } catch (err: any) {
    await respondNotice(
      interaction,
      'error',
      'Ticket creation failed',
      err?.message ?? 'Unable to create ticket channel.',
    );
    return;
  }

  const normalized = withDefaults(guildSettings);
  const recentTickets = await countRecentTicketsByCreator(interaction.guildId!, interaction.user.id, 24);
  const analysis = normalized.enable_auto_priority
    ? analyzePriority({ text: reason, recentTickets, repeatedReports: 0 })
    : { priority: 'NORMAL', reason: null };
  const ticket = await createTicket({
    guildId: interaction.guildId!,
    channelId: surface.channel.id,
    creatorId: interaction.user.id,
    queryText: reason,
    priority: analysis.priority as any,
    suspicionReason: analysis.reason,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    categoryDescription: category?.description ?? null,
  });

  if ('setName' in surface.channel) {
    await (surface.channel as any).setName(`ticket-${ticket.id}`).catch(() => {});
  }

  const context = await buildRenderContext(ticket, normalized);
  const rendered = renderTicketMessage(ticket, {
    creatorMention: `<@${interaction.user.id}>`,
    timezone: guildSettings.timezone ?? config.timezone,
    moderation: context.moderation,
    links: context.links,
    suggestions: context.suggestions,
  });

  let messageId: string;
  const starter = await surface.channel.messages.fetch({ limit: 1 }).then((x) => x.first()).catch(() => null);
  if (starter && starter.author.id === client.user?.id && starter.content.includes('Booting ticket')) {
    const edited = await starter.edit({ flags: COMPONENTS_V2, components: rendered.components });
    messageId = edited.id;
  } else {
    const sent = await surface.channel.send({ flags: COMPONENTS_V2, components: rendered.components });
    messageId = sent.id;
  }

  await setTicketMessageId(ticket.id, messageId);

  await respondNotice(
    interaction,
    'success',
    'Ticket created',
    `Ticket ${ticket.id} created in ${surface.channel.toString()}.`,
    true,
  );
}

async function handleTicketCreate(
  interaction: ChatInputCommandInteraction,
  guildSettings: { ticket_parent_channel_id: string; staff_role_id: string; timezone: string | null },
) {
  const query = interaction.options.getString('reason', true);
  await createTicketWithReason(interaction, guildSettings, query);
}

async function rerender(interactionMessageId: string, channelId: string, mention: string, timezone: string) {
  const ticket = await getTicketByMessage(interactionMessageId);
  if (!ticket) throw new Error('Ticket not found for message');
  const settings = interactionMessageId ? await getGuildSettings(ticket.guild_id) : null;
  const context = await buildRenderContext(ticket, withDefaults(settings));
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) throw new Error('Channel not text based');
  const targetMessage = await channel.messages.fetch(interactionMessageId);
  const rendered = renderTicketMessage(ticket, {
    creatorMention: mention,
    timezone,
    moderation: context.moderation,
    links: context.links,
    suggestions: context.suggestions,
  });
  await targetMessage.edit({ flags: COMPONENTS_V2, components: rendered.components });
}

async function handleClaim(interaction: ButtonInteraction, ticketId: number, staffRoleId: string, timezone: string) {
  if (!isStaff(interaction, staffRoleId)) {
    await respondNotice(interaction, 'error', 'Not allowed', 'Only staff can claim tickets.');
    return;
  }
  const current = await getTicketByMessage(interaction.message.id);
  if (!current) {
    await respondNotice(interaction, 'error', 'Ticket missing', 'This ticket could not be found.');
    return;
  }
  if (current.status !== 'OPEN') {
    await respondNotice(interaction, 'error', 'Invalid state', 'This ticket is not open.');
    return;
  }
  const updated = await claimTicket(ticketId, interaction.user.id);
  const mention = `<@${updated.creator_id}>`;
  await rerender(interaction.message.id, interaction.channelId, mention, timezone);
  await respondNotice(interaction, 'success', 'Ticket claimed', `Ticket ${updated.id} claimed by ${interaction.user}.`);
}

async function handleClose(interaction: ButtonInteraction, ticketId: number, staffRoleId: string, timezone: string) {
  const ticket = await getTicketByMessage(interaction.message.id);
  if (!ticket) {
    await respondNotice(interaction, 'error', 'Ticket missing', 'This ticket could not be found.');
    return;
  }
  if (ticket.status !== 'CLAIMED') {
    await respondNotice(interaction, 'error', 'Invalid state', 'This ticket is not claimed.');
    return;
  }
  if (ticket.claimed_by !== interaction.user.id && !isStaff(interaction, staffRoleId)) {
    await respondNotice(interaction, 'error', 'Not allowed', 'Only the claimer or staff can close this ticket.');
    return;
  }
  const updated = await closeTicket(ticketId, interaction.user.id);
  await rerender(interaction.message.id, interaction.channelId, `<@${ticket.creator_id}>`, timezone);

  const channel = await client.channels.fetch(ticket.channel_id);
  if (channel?.isTextBased() && 'permissionOverwrites' in channel) {
    await channel.permissionOverwrites.edit(ticket.creator_id, { SendMessages: false }).catch(() => {});
  }

  await respondNotice(interaction, 'success', 'Ticket closed', `Ticket ${ticket.id} closed.`);
}

async function handleTranscript(interaction: ButtonInteraction, ticketId: number, timezone: string) {
  const ticket = await getTicketByMessage(interaction.message.id);
  if (!ticket) {
    await respondNotice(interaction, 'error', 'Ticket missing', 'This ticket could not be found.');
    return;
  }
  const channel = interaction.channel as TextBasedChannel | null;
  if (!channel || !channel.isTextBased()) {
    await respondNotice(interaction, 'error', 'Channel error', 'Channel not accessible.');
    return;
  }

  await interaction.deferReply({ flags: (MessageFlags as any).Ephemeral ?? 1 << 6 });
  const transcript = await buildTranscript(channel, ticket);
  const posted = await (channel as any).send({
    content: `Transcript for ticket #${ticket.id}`,
    files: [{ attachment: transcript.buffer, name: transcript.filename }],
  });
  await respondNotice(interaction, 'success', 'Transcript ready', `Transcript generated: ${posted.url}`);
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (!interaction.guildId) {
        await respondNotice(interaction, 'error', 'Guild only', 'This command can only be used in servers.');
        return;
      }

      const settings = await getGuildSettings(interaction.guildId);

      if (interaction.commandName === 'ticket') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'create') {
          if (!settings) {
            await respondNotice(
              interaction,
              'error',
              'Not configured',
              'Ticket system not configured for this server. Run /ticket setup first.',
            );
            return;
          }
          await handleTicketCreate(interaction, settings);
        }
        if (sub === 'panelset') {
          if (!isAdminOrOwner(interaction)) {
            await respondNotice(interaction, 'error', 'Not allowed', 'Admin only.');
            return;
          }
          if (!settings) {
            await respondNotice(
              interaction,
              'error',
              'Not configured',
              'Ticket system not configured for this server. Run /ticket setup first.',
            );
            return;
          }
          const channel = (interaction.options.getChannel('channel') ?? interaction.channel) as any;
          if (!channel || !channel.isTextBased?.()) {
            await respondNotice(interaction, 'error', 'Invalid channel', 'Choose a text channel.');
            return;
          }
          const categories = await listTicketCategories(interaction.guildId!);
          const panel = renderTicketOpenPanel(categories);
          await channel.send(panel);
          await respondNotice(interaction, 'success', 'Panel sent', `Ticket panel sent to ${channel.toString()}.`, true);
        }
        if (sub === 'panel') {
          if (!isAdminOrOwner(interaction)) {
            await respondNotice(interaction, 'error', 'Not allowed', 'Admin only.');
            return;
          }
          const categories = interaction.guildId ? await listTicketCategories(interaction.guildId) : [];
          const panel = renderCategoryPanel(settings, categories, 1);
          await interaction.reply({ ...panel });
        }
        if (sub === 'setup') {
          if (!isAdminOrOwner(interaction)) {
            await respondNotice(interaction, 'error', 'Not allowed', 'Admin only.');
            return;
          }
          const parent = interaction.options.getChannel('parent', true);
          const staffRole = interaction.options.getRole('staff_role', true);
          const parentGuildId = (parent as any).guildId ?? interaction.guildId;
          if (parentGuildId !== interaction.guildId) {
            await respondNotice(interaction, 'error', 'Invalid parent', 'Parent channel must be in this guild.');
            return;
          }
          if (parent.type !== ChannelType.GuildText && parent.type !== ChannelType.GuildAnnouncement) {
            await respondNotice(interaction, 'error', 'Invalid channel', 'Please choose a text channel (#) only.');
            return;
          }
          const parentCategoryId = (parent as any).parentId;
          if (!parentCategoryId) {
            await respondNotice(
              interaction,
              'error',
              'Missing category',
              'Selected channel must be inside a category.',
            );
            return;
          }
          const timezone = interaction.options.getString('timezone') ?? config.timezone;
          const normalized = withDefaults(settings);
          const saved = await upsertGuildSettings({
            guild_id: interaction.guildId,
            ticket_parent_channel_id: parentCategoryId,
            staff_role_id: staffRole.id,
            timezone,
            category_slots: normalized.category_slots ?? 1,
            warn_threshold: normalized.warn_threshold,
            warn_timeout_minutes: normalized.warn_timeout_minutes,
            enable_smart_replies: normalized.enable_smart_replies,
            enable_ai_suggestions: normalized.enable_ai_suggestions,
            enable_auto_priority: normalized.enable_auto_priority,
          });
          await respondNotice(
            interaction,
            'success',
            'Setup complete',
            `Configured tickets. Category: <#${parentCategoryId}> | Staff role: ${staffRole.toString()} | TZ: ${saved.timezone}`,
          );
        }
      }
      if (interaction.commandName === 'info') {
        if (!settings) {
          await respondNotice(
            interaction,
            'error',
            'Not configured',
            'Ticket system not configured for this server. Run /ticket setup first.',
          );
          return;
        }
        await handleInfoCommand(interaction, settings.timezone ?? config.timezone);
      }
      if (interaction.commandName === 'ping') {
        const uptimeMs = process.uptime() * 1000;
        const hours = Math.floor(uptimeMs / 3600000);
        const minutes = Math.floor((uptimeMs % 3600000) / 60000);
        const payload = renderStatusPanel({
          botTag: client.user?.tag ?? 'SwiftTicket',
          latencyMs: Math.round(client.ws.ping),
          guilds: client.guilds.cache.size,
          uptime: `${hours}h ${minutes}m`,
        });
        await interaction.reply(payload);
      }
      if (interaction.commandName === 'mod') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'log') {
          if (!isAdminOrOwner(interaction) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await respondNotice(interaction, 'error', 'Not allowed', 'Manage Server permission required.');
            return;
          }
          const user = interaction.options.getUser('user', true);
          const actionType = interaction.options.getString('action', true) as 'WARN' | 'MUTE' | 'BAN';
          const reason = interaction.options.getString('reason') ?? null;
          await createModAction({
            guildId: interaction.guildId!,
            userId: user.id,
            actionType,
            reason,
            createdBy: interaction.user.id,
          });
          const settings = withDefaults(await getGuildSettings(interaction.guildId!));
          if (actionType === 'WARN') {
            const summary = await getModHistorySummary(interaction.guildId!, user.id);
            if (summary.warnings >= settings.warn_threshold) {
              try {
                const member = await interaction.guild?.members.fetch(user.id);
                if (member) {
                  await member.timeout(settings.warn_timeout_minutes * 60 * 1000, 'Auto-timeout threshold reached');
                }
              } catch (err) {
                console.error('Failed to timeout member', err);
                await respondNotice(
                  interaction,
                  'error',
                  'Timeout failed',
                  'Warn logged but timeout could not be applied (check bot permissions).',
                );
                return;
              }
            }
          }
          await respondNotice(interaction, 'success', 'Action logged', `${actionType} logged for ${user}.`);
        }
        if (sub === 'config') {
          if (!isAdminOrOwner(interaction) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await respondNotice(interaction, 'error', 'Not allowed', 'Manage Server permission required.');
            return;
          }
          const threshold = interaction.options.getInteger('warn_threshold', true);
          const minutes = interaction.options.getInteger('timeout_minutes', true);
          const current = await getGuildSettings(interaction.guildId!);
          if (!current) {
            await respondNotice(
              interaction,
              'error',
              'Not configured',
              'Ticket system not configured. Run /ticket setup first.',
            );
            return;
          }
          await upsertGuildSettings({
            ...current,
            warn_threshold: threshold,
            warn_timeout_minutes: minutes,
          });
          await respondNotice(
            interaction,
            'success',
            'Moderation configured',
            `Auto-timeout after ${threshold} warnings for ${minutes} minutes.`,
          );
        }
      }
    } else if (interaction.isButton()) {
      const parts = interaction.customId.split(':');
      const scope = parts[0];
      const action = parts[1];
      const idRaw = parts[2];
      if (scope !== 'ticket') return;
      if (action === 'category' && idRaw === 'add') {
        if (!isAdminOrOwner(interaction)) {
          await respondNotice(interaction, 'error', 'Not allowed', 'Admin only.');
          return;
        }
        const modal = new ModalBuilder()
          .setCustomId(`ticket:category:create:${interaction.message.id}`)
          .setTitle('Add Ticket Category');
        const nameInput = new TextInputBuilder()
          .setCustomId('category_name')
          .setLabel('Category name')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(60)
          .setPlaceholder('e.g., Game Night');
        const descInput = new TextInputBuilder()
          .setCustomId('category_description')
          .setLabel('Category description (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(200)
          .setPlaceholder('Short context shown when users open a ticket.');
        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
        const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(descInput);
        modal.addComponents(row, row2);
        await interaction.showModal(modal);
        return;
      }
      if (action === 'panel' && idRaw === 'page') {
        if (!interaction.guildId) return;
        const page = Number(parts[3]);
        const settings = await getGuildSettings(interaction.guildId);
        const categories = await listTicketCategories(interaction.guildId);
        const panel = renderCategoryPanel(settings, categories, Number.isFinite(page) ? page : 1);
        await interaction.update(panel);
        return;
      }
      if (action === 'settings' && idRaw === 'warn') {
        if (!isAdminOrOwner(interaction)) {
          await respondNotice(interaction, 'error', 'Not allowed', 'Admin only.');
          return;
        }
        const modal = new ModalBuilder()
          .setCustomId(`ticket:settings:warn:${interaction.message.id}`)
          .setTitle('Warn Threshold');
        const input = new TextInputBuilder()
          .setCustomId('warn_threshold')
          .setLabel('Warnings before timeout')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(3)
          .setPlaceholder('e.g., 3');
        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
        modal.addComponents(row);
        await interaction.showModal(modal);
        return;
      }
      if (action === 'settings' && idRaw === 'timeout') {
        if (!isAdminOrOwner(interaction)) {
          await respondNotice(interaction, 'error', 'Not allowed', 'Admin only.');
          return;
        }
        const modal = new ModalBuilder()
          .setCustomId(`ticket:settings:timeout:${interaction.message.id}`)
          .setTitle('Timeout Duration');
        const input = new TextInputBuilder()
          .setCustomId('warn_timeout_minutes')
          .setLabel('Timeout minutes')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(4)
          .setPlaceholder('e.g., 10');
        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
        modal.addComponents(row);
        await interaction.showModal(modal);
        return;
      }
      if (action === 'toggle' && idRaw) {
        if (!interaction.guildId) return;
        if (!isAdminOrOwner(interaction)) {
          await respondNotice(interaction, 'error', 'Not allowed', 'Admin only.');
          return;
        }
        const settings = await getGuildSettings(interaction.guildId);
        if (!settings) {
          await respondNotice(
            interaction,
            'error',
            'Not configured',
            'Ticket system not configured. Run /ticket setup first.',
          );
          return;
        }
        const normalized = withDefaults(settings);
        if (idRaw === 'smart') normalized.enable_smart_replies = !normalized.enable_smart_replies;
        if (idRaw === 'ai') normalized.enable_ai_suggestions = !normalized.enable_ai_suggestions;
        if (idRaw === 'priority') normalized.enable_auto_priority = !normalized.enable_auto_priority;
        await upsertGuildSettings({ ...settings, ...normalized });
        const categories = await listTicketCategories(interaction.guildId);
        const panel = renderCategoryPanel({ ...settings, ...normalized }, categories, 2);
        await interaction.update(panel);
        return;
      }
      if (action === 'link') {
        const settings = interaction.guildId ? await getGuildSettings(interaction.guildId) : null;
        const staffRoleId = settings?.staff_role_id ?? '';
        if (!isStaff(interaction, staffRoleId)) {
          await respondNotice(interaction, 'error', 'Not allowed', 'Only staff can link tickets.');
          return;
        }
        const modal = new ModalBuilder()
          .setCustomId(`ticket:link:create:${interaction.message.id}:${idRaw}`)
          .setTitle('Link Ticket');
        const linkInput = new TextInputBuilder()
          .setCustomId('linked_ticket_id')
          .setLabel('Ticket ID to link')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(12)
          .setPlaceholder('e.g., 1280');
        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(linkInput);
        modal.addComponents(row);
        await interaction.showModal(modal);
        return;
      }
      if (action === 'reopen') {
        const ticketId = Number(idRaw);
        if (!Number.isFinite(ticketId)) return;
        const ticket = await getTicketByMessage(interaction.message.id);
        if (!ticket) {
          await respondNotice(interaction, 'error', 'Ticket missing', 'This ticket could not be found.');
          return;
        }
        if (ticket.status !== 'CLOSED') {
          await respondNotice(interaction, 'error', 'Invalid state', 'Ticket is not closed.');
          return;
        }
        const settings = interaction.guildId ? await getGuildSettings(interaction.guildId) : null;
        const staffRoleId = settings?.staff_role_id ?? '';
        const allowed = ticket.creator_id === interaction.user.id || isStaff(interaction, staffRoleId);
        if (!allowed) {
          await respondNotice(interaction, 'error', 'Not allowed', 'Only the creator or staff can reopen.');
          return;
        }
        const keepClaimer = Boolean(ticket.claimed_by);
        const newStatus = keepClaimer ? 'CLAIMED' : 'OPEN';
        await reopenTicket(ticketId, interaction.user.id, newStatus, keepClaimer);
        const channel = await client.channels.fetch(ticket.channel_id);
        if (channel?.isTextBased() && 'permissionOverwrites' in channel) {
          await channel.permissionOverwrites.edit(ticket.creator_id, { SendMessages: true }).catch(() => {});
        }
        const timezone = settings?.timezone ?? config.timezone;
        await rerender(interaction.message.id, interaction.channelId, `<@${ticket.creator_id}>`, timezone);
        await respondNotice(interaction, 'success', 'Ticket reopened', `Ticket ${ticketId} reopened.`);
        return;
      }
      const ticketId = Number(idRaw);
      if (!Number.isFinite(ticketId)) return;
      const settings = interaction.guildId ? await getGuildSettings(interaction.guildId) : null;
      const timezone = settings?.timezone ?? config.timezone;
      const staffRoleId = settings?.staff_role_id;
      if (!staffRoleId) {
        await respondNotice(interaction, 'error', 'Not configured', 'Ticket system not configured for this server.');
        return;
      }
      if (action === 'claim') await handleClaim(interaction, ticketId, staffRoleId, timezone);
      if (action === 'close') await handleClose(interaction, ticketId, staffRoleId, timezone);
      if (action === 'transcript') await handleTranscript(interaction, ticketId, timezone);
    }
    if (interaction.isStringSelectMenu()) {
      if (!interaction.guildId) return;
      const parts = interaction.customId.split(':');
      const scope = parts[0];
      const kind = parts[1];
      if (scope !== 'ticket') return;
      if (kind === 'open') {
        const categoryId = Number(interaction.values?.[0]);
        if (!Number.isFinite(categoryId)) {
          await respondNotice(interaction, 'error', 'Invalid selection', 'Please choose a valid category.');
          return;
        }
        const categories = await listTicketCategories(interaction.guildId);
        const category = categories.find((c) => c.id === categoryId);
        if (!category) {
          await respondNotice(interaction, 'error', 'Invalid category', 'Category not found.');
          return;
        }
        const modal = new ModalBuilder()
          .setCustomId(`ticket:open:create:${category.id}`)
          .setTitle(`Open Ticket - ${category.name}`.slice(0, 45));
        const input = new TextInputBuilder()
          .setCustomId('ticket_reason')
          .setLabel('Describe your issue')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setPlaceholder('Give a short summary so staff can help you faster.');
        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
        modal.addComponents(row);
        await interaction.showModal(modal);
        return;
      }
      if (kind !== 'slots') return;
      if (!isAdminOrOwner(interaction)) {
        await respondNotice(interaction, 'error', 'Not allowed', 'Admin only.');
        return;
      }
      const value = Number(interaction.values?.[0]);
      if (!Number.isFinite(value) || value < 1 || value > 35) {
        await respondNotice(interaction, 'error', 'Invalid value', 'Please choose between 1 and 35.');
        return;
      }
      const current = await getGuildSettings(interaction.guildId);
      if (!current) {
        await respondNotice(
          interaction,
          'error',
          'Not configured',
          'Ticket system not configured. Run /ticket setup first.',
        );
        return;
      }
      await upsertGuildSettings({
        ...current,
        category_slots: value,
      });
      const categories = await listTicketCategories(interaction.guildId);
      const updatedPanel = renderCategoryPanel({ ...current, category_slots: value }, categories, 1);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(updatedPanel);
      } else {
        await interaction.update(updatedPanel);
      }
    }
    if (interaction.isModalSubmit()) {
      const parts = interaction.customId.split(':');
      const scope = parts[0];
      const kind = parts[1];
      const action = parts[2];
      const messageId = parts[3];
      if (!interaction.guildId) return;
      if (scope === 'ticket' && kind === 'open' && action === 'create') {
        const categoryId = Number(messageId);
        const reason = interaction.fields.getTextInputValue('ticket_reason')?.trim();
        if (!reason) {
          await respondNotice(interaction, 'error', 'Missing reason', 'Please add a short description.');
          return;
        }
        const settings = await getGuildSettings(interaction.guildId);
        if (!settings) {
          await respondNotice(
            interaction,
            'error',
            'Not configured',
            'Ticket system not configured. Run /ticket setup first.',
          );
          return;
        }
        const categories = await listTicketCategories(interaction.guildId);
        const category = categories.find((c) => c.id === categoryId) ?? null;
        await createTicketWithReason(interaction, settings, reason, category);
        return;
      }
      if (scope === 'ticket' && kind === 'category' && action === 'create') {
      if (!isAdminOrOwner(interaction)) {
        await respondNotice(interaction, 'error', 'Not allowed', 'Admin only.');
        return;
      }
        const name = interaction.fields.getTextInputValue('category_name')?.trim();
        const description = interaction.fields.getTextInputValue('category_description')?.trim() || null;
        if (!name) {
          await respondNotice(interaction, 'error', 'Invalid name', 'Category name is required.');
          return;
        }
        const settings = await getGuildSettings(interaction.guildId);
        if (!settings) {
          await respondNotice(
            interaction,
            'error',
            'Not configured',
            'Ticket system not configured. Run /ticket setup first.',
          );
          return;
        }
        const categories = await listTicketCategories(interaction.guildId);
        const limit = settings.category_slots ?? 1;
        if (categories.length >= limit) {
          await respondNotice(
            interaction,
            'error',
            'Slot limit reached',
            `You can only have ${limit} categories. Increase slots first.`,
          );
          return;
        }
        await createTicketCategory(interaction.guildId, name, description);
        const updated = await listTicketCategories(interaction.guildId);
        const panel = renderCategoryPanel(settings, updated, 1);
        const channel = interaction.channel;
        if (channel?.isTextBased() && messageId) {
          const msg = await channel.messages.fetch(messageId).catch(() => null);
          if (msg) {
            await msg.edit({ ...panel });
          }
        }
        await respondNotice(interaction, 'success', 'Category added', `Added: ${name}`);
        return;
      }

      if (scope === 'ticket' && kind === 'settings' && (action === 'warn' || action === 'timeout')) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          await respondNotice(interaction, 'error', 'Not allowed', 'Admin only.');
          return;
        }
        const settings = await getGuildSettings(interaction.guildId);
        if (!settings) {
          await respondNotice(
            interaction,
            'error',
            'Not configured',
            'Ticket system not configured. Run /ticket setup first.',
          );
          return;
        }
        const normalized = withDefaults(settings);
        if (action === 'warn') {
          const raw = interaction.fields.getTextInputValue('warn_threshold');
          const value = Number(raw);
          if (!Number.isFinite(value) || value < 1 || value > 50) {
            await respondNotice(interaction, 'error', 'Invalid value', 'Use a number between 1 and 50.');
            return;
          }
          normalized.warn_threshold = value;
        }
        if (action === 'timeout') {
          const raw = interaction.fields.getTextInputValue('warn_timeout_minutes');
          const value = Number(raw);
          if (!Number.isFinite(value) || value < 1 || value > 10080) {
            await respondNotice(interaction, 'error', 'Invalid value', 'Use minutes between 1 and 10080.');
            return;
          }
          normalized.warn_timeout_minutes = value;
        }
        await upsertGuildSettings({ ...settings, ...normalized });
        const categories = await listTicketCategories(interaction.guildId);
        const panel = renderCategoryPanel({ ...settings, ...normalized }, categories, 2);
        const channel = interaction.channel;
        if (channel?.isTextBased() && messageId) {
          const msg = await channel.messages.fetch(messageId).catch(() => null);
          if (msg) {
            await msg.edit({ ...panel });
          }
        }
        await respondNotice(interaction, 'success', 'Settings updated', 'Your settings have been saved.');
        return;
      }

      if (scope === 'ticket' && kind === 'link' && action === 'create') {
        const linkedRaw = interaction.fields.getTextInputValue('linked_ticket_id')?.trim();
        const linkedId = Number(linkedRaw);
        if (!Number.isFinite(linkedId)) {
          await respondNotice(interaction, 'error', 'Invalid ID', 'Please provide a numeric ticket ID.');
          return;
        }
        const parts = interaction.customId.split(':');
        const sourceTicketId = Number(parts[4]);
        if (!Number.isFinite(sourceTicketId)) {
          await respondNotice(interaction, 'error', 'Invalid ID', 'Source ticket not found.');
          return;
        }
        await createLink(interaction.guildId, sourceTicketId, linkedId, interaction.user.id);
        await createLink(interaction.guildId, linkedId, sourceTicketId, interaction.user.id).catch(() => {});
        const settings = await getGuildSettings(interaction.guildId);
        if (settings && interaction.channel?.isTextBased() && messageId) {
          const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
          const ticket = await getTicketByMessage(messageId);
          if (msg && ticket) {
            const context = await buildRenderContext(ticket, withDefaults(settings));
            const rendered = renderTicketMessage(ticket, {
              creatorMention: `<@${ticket.creator_id}>`,
              timezone: settings.timezone ?? config.timezone,
              moderation: context.moderation,
              links: context.links,
              suggestions: context.suggestions,
            });
            await msg.edit({ ...rendered });
          }
        }
        await respondNotice(interaction, 'success', 'Linked', `Linked ticket #${linkedId}.`);
      }
    }
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) {
      await respondNotice(
        interaction,
        'error',
        'Unexpected error',
        'Something went wrong. Please try again or contact an admin.',
      );
    }
  }
});

client.on('messageCreate', async (message) => {
  try {
    if (!message.guildId || message.author.bot) return;
    const ticket = await getTicketByChannel(message.channelId);
    if (!ticket) return;

    const settings = withDefaults(await getGuildSettings(message.guildId));
    const isOwnerMsg = message.guild?.ownerId === message.author.id;
    const isStaffMsg = isOwnerMsg || (message.member?.roles?.cache?.has(settings.staff_role_id) ?? false);
    const isCreator = message.author.id === ticket.creator_id;
    const now = new Date().toISOString();
    const text = message.cleanContent || message.content || '';

    const aggressive = text ? findAggressiveWords(text) : [];
    if (aggressive.length && !isStaffMsg) {
      try {
        await createModAction({
          guildId: message.guildId,
          userId: message.author.id,
          actionType: 'WARN',
          reason: `Flagged keywords: ${aggressive.slice(0, 4).join(', ')}`,
          createdBy: client.user?.id ?? null,
        });
        const summary = await getModHistorySummary(message.guildId, message.author.id);
        if (summary.warnings >= settings.warn_threshold) {
          const member = await message.guild?.members.fetch(message.author.id).catch(() => null);
          if (member) {
            await member.timeout(settings.warn_timeout_minutes * 60 * 1000, 'Auto-timeout threshold reached');
          }
        }
        const alert = buildNotice(
          'error',
          'Safety Alert',
          `Message flagged for keywords: ${aggressive.slice(0, 4).join(', ')}`,
        );
        const mention = settings.staff_role_id ? `<@&${settings.staff_role_id}>` : undefined;
        await message.channel.send({ content: mention, ...alert });
      } catch (err) {
        console.error('Auto-moderation failed', err);
      }
    }

    if (text) {
      const analysis = settings.enable_auto_priority
        ? analyzePriority({ text, recentTickets: 0, repeatedReports: 0 })
        : { priority: 'NORMAL', reason: null };
      if (analysis.priority === 'HIGH' && ticket.priority !== 'HIGH') {
        await updateTicketMetrics(ticket.id, {
          priority: 'HIGH',
          suspicion_reason: analysis.reason ?? ticket.suspicion_reason ?? null,
        });
      }
    }

    if (isCreator) {
      await updateTicketMetrics(ticket.id, { last_user_message_at: now });
      const smart = settings.enable_smart_replies ? getSmartReply(text) : null;
      if (smart) {
        const panel = buildNotice('info', 'Smart Reply', smart);
        await message.channel.send(panel);
      }
      return;
    }

    if (isStaffMsg) {
      const update: any = { last_staff_message_at: now };
      if (!ticket.first_staff_response_at) {
        update.first_staff_response_at = now;
        update.first_response_ms = Math.max(
          0,
          new Date(now).getTime() - new Date(ticket.created_at).getTime(),
        );
      }
      if (ticket.last_user_message_at) {
        const delta =
          new Date(now).getTime() - new Date(ticket.last_user_message_at).getTime();
        const count = (ticket.response_count ?? 0) + 1;
        const prevAvg = ticket.avg_response_ms ?? 0;
        update.response_count = count;
        update.avg_response_ms = Math.round((prevAvg * (count - 1) + delta) / count);
      }
      await updateTicketMetrics(ticket.id, update);
    }
  } catch (err) {
    console.error('messageCreate handler failed', err);
  }
});

client.login(config.discordToken);
