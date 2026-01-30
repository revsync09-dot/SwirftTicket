import { AttachmentBuilder, MessageFlags } from 'discord.js';
import { getUserTicketHistorySummary, listUserTicketStats, ticketCountsRollingByCreator } from '../tickets/repo.js';
import { renderActivityChart } from './chart.js';
import { COMPONENTS_V2_FLAG, ComponentType, } from '../tickets/components.js';
function buildDailySeries(days, records, timezone) {
    const today = new Date();
    const map = new Map();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        const key = d.toISOString().slice(0, 10);
        map.set(key, 0);
    }
    for (const row of records) {
        const key = row.created_at.slice(0, 10);
        if (map.has(key)) {
            map.set(key, (map.get(key) ?? 0) + 1);
        }
    }
    return Array.from(map.entries()).map(([key, value]) => ({
        label: new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: timezone }).format(new Date(key)),
        value,
    }));
}
function fmtRelative(iso) {
    if (!iso)
        return '-';
    const epoch = Math.floor(new Date(iso).getTime() / 1000);
    return `<t:${epoch}:R>`;
}
export async function handleInfoCommand(interaction, timezone) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    await interaction.deferReply();
    const guildId = interaction.guildId;
    const [timeline, stats, history] = await Promise.all([
        ticketCountsRollingByCreator(target.id, guildId, 90),
        listUserTicketStats(target.id, guildId),
        getUserTicketHistorySummary(guildId, target.id),
    ]);
    const points90 = buildDailySeries(90, timeline, timezone);
    const points30 = points90.slice(-30);
    const points7 = points90.slice(-7);
    const chart7 = renderActivityChart(points7, { filename: 'activity-7d.png' });
    const chart30 = renderActivityChart(points30, { filename: 'activity-30d.png' });
    const chart90 = renderActivityChart(points90, { filename: 'activity-90d.png' });
    const attachments = [
        new AttachmentBuilder(chart7.buffer, { name: chart7.filename }),
        new AttachmentBuilder(chart30.buffer, { name: chart30.filename }),
        new AttachmentBuilder(chart90.buffer, { name: chart90.filename }),
    ];
    const chartGallery = {
        type: ComponentType.MediaGallery,
        items: [
            { media: { url: `attachment://${chart7.filename}` } },
            { media: { url: `attachment://${chart30.filename}` } },
            { media: { url: `attachment://${chart90.filename}` } },
        ],
    };
    const infoHeader = {
        type: ComponentType.TextDisplay,
        content: `## ${target.username}'s Ticket Summary`,
    };
    const infoBlock = {
        type: ComponentType.TextDisplay,
        content: `- **Total tickets:** ${history.totalTickets}\n` +
            `- **Created:** ${stats.created}\n` +
            `- **Claimed:** ${stats.claimed}\n` +
            `- **Closed:** ${stats.closed}\n` +
            `- **Last activity:** ${fmtRelative(history.lastSupportAt)}`,
    };
    const separator = { type: ComponentType.Separator };
    const container = {
        type: ComponentType.Container,
        accent_color: 0x22c55e,
        components: [infoHeader, infoBlock, separator, chartGallery],
    };
    const components = [container];
    await interaction.editReply({
        flags: MessageFlags.IsComponentsV2 ?? COMPONENTS_V2_FLAG,
        components,
        files: attachments,
    });
}
