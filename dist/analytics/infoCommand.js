import { AttachmentBuilder } from 'discord.js';
import { config } from '../config.js';
import { listUserTicketStats, ticketCountsRollingByCreator } from '../tickets/repo.js';
import { renderActivityChart } from './chart.js';
function buildDailySeries(days, records) {
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
        label: new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(key)),
        value,
    }));
}
export async function handleInfoCommand(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    await interaction.deferReply({ ephemeral: true });
    const [stats, timeline] = await Promise.all([
        listUserTicketStats(target.id),
        ticketCountsRollingByCreator(target.id, 30),
    ]);
    const chartPoints = buildDailySeries(30, timeline);
    const chart = renderActivityChart(chartPoints, { title: `${target.username} — last 30 days` });
    const attachment = new AttachmentBuilder(chart.buffer, { name: chart.filename });
    const total = stats.created + stats.claimed + stats.closed;
    const embed = {
        author: {
            name: `${target.username} (${target.id})`,
            icon_url: target.displayAvatarURL(),
        },
        description: `Ticket activity for the last 30 days in ${config.guildId}.`,
        color: 0x0ea5e9,
        fields: [
            { name: 'Tickets created', value: `${stats.created}`, inline: true },
            { name: 'Tickets claimed', value: `${stats.claimed}`, inline: true },
            { name: 'Tickets closed', value: `${stats.closed}`, inline: true },
            { name: 'Total touchpoints', value: `${total}`, inline: true },
        ],
        image: { url: `attachment://${chart.filename}` },
    };
    await interaction.editReply({
        embeds: [embed],
        files: [attachment],
    });
}
