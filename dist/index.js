import { ChannelType, Client, GatewayIntentBits, MessageFlags, Partials, PermissionFlagsBits, } from 'discord.js';
import { config } from './config.js';
import { claimTicket, closeTicket, createTicket, getTicketByMessage, setTicketMessageId, } from './tickets/repo.js';
import { renderTicketMessage } from './tickets/render.js';
import { buildTranscript } from './tickets/transcript.js';
import { handleInfoCommand } from './analytics/infoCommand.js';
const COMPONENTS_V2 = MessageFlags.IsComponentsV2 ?? 1 << 15;
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
function isStaff(interaction) {
    const roles = interaction.member?.roles;
    return roles?.cache?.has(config.staffRoleId) ?? false;
}
async function createSurface(interaction) {
    const guild = interaction.guild;
    if (!guild)
        throw new Error('Guild unavailable');
    const parent = await client.channels.fetch(config.ticketParentChannelId);
    if (!parent)
        throw new Error('TICKET_PARENT_CHANNEL_ID not found');
    const overwrites = [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        {
            id: config.staffRoleId,
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
    if (parent.type === ChannelType.GuildCategory) {
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
    if (parent.type === ChannelType.GuildText || parent.type === ChannelType.GuildAnnouncement) {
        const thread = await parent.threads.create({
            name: `ticket-${Date.now()}`,
            type: ChannelType.PrivateThread,
            reason: 'Ticket created',
            invitable: false,
        });
        await thread.members.add(interaction.user.id);
        await thread.send('Booting ticket UI…'); // placeholder starter
        return { channel: thread };
    }
    if (parent.type === ChannelType.GuildForum) {
        const thread = await parent.threads.create({
            name: `ticket-${Date.now()}`,
            message: { content: 'Booting ticket UI…' },
            reason: 'Ticket created',
        });
        await thread.members.add(interaction.user.id).catch(() => { });
        return { channel: thread };
    }
    throw new Error(`Unsupported parent channel type ${parent.type}`);
}
async function handleTicketCreate(interaction) {
    const query = interaction.options.getString('reason', true);
    await interaction.deferReply({ ephemeral: true });
    const surface = await createSurface(interaction);
    const ticket = await createTicket({
        guildId: interaction.guildId,
        channelId: surface.channel.id,
        creatorId: interaction.user.id,
        queryText: query,
    });
    if (surface.channel.type === ChannelType.GuildText || surface.channel.type === ChannelType.GuildForum) {
        await surface.channel.setName(`ticket-${ticket.id}`).catch(() => { });
    }
    else if (surface.channel.type === ChannelType.PrivateThread || surface.channel.type === ChannelType.PublicThread) {
        await surface.channel.setName(`ticket-${ticket.id}`).catch(() => { });
    }
    const rendered = renderTicketMessage(ticket, {
        creatorMention: `<@${interaction.user.id}>`,
        timezone: config.timezone,
    });
    let messageId;
    const starter = await surface.channel.messages.fetch({ limit: 1 }).then((x) => x.first()).catch(() => null);
    if (starter && starter.author.id === client.user?.id && starter.content.includes('Booting ticket')) {
        const edited = await starter.edit({ flags: COMPONENTS_V2, components: rendered.components });
        messageId = edited.id;
    }
    else {
        const sent = await surface.channel.send({ flags: COMPONENTS_V2, components: rendered.components });
        messageId = sent.id;
    }
    await setTicketMessageId(ticket.id, messageId);
    await interaction.editReply({
        content: `Ticket #${ticket.id} created in ${surface.channel.toString()}`,
    });
}
async function rerender(interactionMessageId, channelId, mention) {
    const ticket = await getTicketByMessage(interactionMessageId);
    if (!ticket)
        throw new Error('Ticket not found for message');
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased())
        throw new Error('Channel not text based');
    const targetMessage = await channel.messages.fetch(interactionMessageId);
    const rendered = renderTicketMessage(ticket, { creatorMention: mention, timezone: config.timezone });
    await targetMessage.edit({ flags: COMPONENTS_V2, components: rendered.components });
}
async function handleClaim(interaction, ticketId) {
    if (!isStaff(interaction)) {
        await interaction.reply({ content: 'Only staff can claim tickets.', ephemeral: true });
        return;
    }
    const current = await getTicketByMessage(interaction.message.id);
    if (!current) {
        await interaction.reply({ content: 'Ticket not found.', ephemeral: true });
        return;
    }
    if (current.status !== 'OPEN') {
        await interaction.reply({ content: 'Ticket is not open.', ephemeral: true });
        return;
    }
    const updated = await claimTicket(ticketId, interaction.user.id);
    const mention = `<@${updated.creator_id}>`;
    await rerender(interaction.message.id, interaction.channelId, mention);
    await interaction.reply({ content: `Ticket #${updated.id} claimed by ${interaction.user}`, ephemeral: true });
}
async function handleClose(interaction, ticketId) {
    const ticket = await getTicketByMessage(interaction.message.id);
    if (!ticket) {
        await interaction.reply({ content: 'Ticket not found.', ephemeral: true });
        return;
    }
    if (ticket.status !== 'CLAIMED') {
        await interaction.reply({ content: 'Ticket is not claimed.', ephemeral: true });
        return;
    }
    if (ticket.claimed_by !== interaction.user.id && !isStaff(interaction)) {
        await interaction.reply({ content: 'Only the claimer or staff can close this ticket.', ephemeral: true });
        return;
    }
    const updated = await closeTicket(ticketId, interaction.user.id);
    await rerender(interaction.message.id, interaction.channelId, `<@${ticket.creator_id}>`);
    const channel = await client.channels.fetch(ticket.channel_id);
    if (channel?.isTextBased() && 'permissionOverwrites' in channel) {
        await channel.permissionOverwrites.edit(ticket.creator_id, { SendMessages: false }).catch(() => { });
    }
    await interaction.reply({ content: `Ticket #${ticket.id} closed.`, ephemeral: true });
}
async function handleTranscript(interaction, ticketId) {
    const ticket = await getTicketByMessage(interaction.message.id);
    if (!ticket) {
        await interaction.reply({ content: 'Ticket not found.', ephemeral: true });
        return;
    }
    if (!interaction.channel || !interaction.channel.isTextBased()) {
        await interaction.reply({ content: 'Channel not accessible.', ephemeral: true });
        return;
    }
    await interaction.deferReply({ ephemeral: true });
    const transcript = await buildTranscript(interaction.channel, ticket);
    const posted = await interaction.channel.send({
        content: `Transcript for ticket #${ticket.id}`,
        files: [{ attachment: transcript.buffer, name: transcript.filename }],
    });
    await interaction.editReply({ content: `Transcript generated: ${posted.url}` });
}
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'ticket' && interaction.options.getSubcommand() === 'create') {
                await handleTicketCreate(interaction);
            }
            if (interaction.commandName === 'info') {
                await handleInfoCommand(interaction);
            }
        }
        else if (interaction.isButton()) {
            const [scope, action, idRaw] = interaction.customId.split(':');
            if (scope !== 'ticket')
                return;
            const ticketId = Number(idRaw);
            if (!Number.isFinite(ticketId))
                return;
            if (action === 'claim')
                await handleClaim(interaction, ticketId);
            if (action === 'close')
                await handleClose(interaction, ticketId);
            if (action === 'transcript')
                await handleTranscript(interaction, ticketId);
        }
    }
    catch (err) {
        console.error(err);
        if (interaction.isRepliable()) {
            const content = 'Something went wrong. Please try again or contact an admin.';
            if (interaction.deferred)
                await interaction.editReply({ content });
            else
                await interaction.reply({ content, ephemeral: true });
        }
    }
});
client.login(config.discordToken);
