import { MessageFlags } from 'discord.js';
import { COMPONENTS_V2_FLAG, ComponentType, } from './components.js';
const STATUS_COLOR = {
    OPEN: 0x3b82f6,
    CLAIMED: 0xfbbf24,
    CLOSED: 0x9ca3af,
};
const STATUS_LABEL = {
    OPEN: 'Open',
    CLAIMED: 'Claimed',
    CLOSED: 'Closed',
};
const dash = '—';
function fmtTime(iso, tz) {
    if (!iso)
        return dash;
    return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: tz,
    }).format(new Date(iso));
}
function tableBlock(title, rows) {
    const header = `### ${title}`;
    const body = rows.map(([k, v]) => `**${k}** | ${v}`).join('\n');
    return { type: ComponentType.TextDisplay, content: `${header}\n${body}` };
}
export function renderTicketMessage(ticket, opts) {
    const overviewRows = [
        ['Ticket ID', `#${ticket.id}`],
        ['Status', STATUS_LABEL[ticket.status]],
        ['Created', fmtTime(ticket.created_at, opts.timezone)],
    ];
    const handlingRows = [
        ['Claimed by', ticket.claimed_by ? `<@${ticket.claimed_by}>` : dash],
        ['Claimed at', fmtTime(ticket.claimed_at, opts.timezone)],
        ['Closed by', ticket.closed_by ? `<@${ticket.closed_by}>` : dash],
        ['Closed at', fmtTime(ticket.closed_at, opts.timezone)],
    ];
    const header = {
        type: ComponentType.TextDisplay,
        content: `## New Ticket ${opts.creatorMention} opened!`,
    };
    const queryHeading = {
        type: ComponentType.TextDisplay,
        content: `### User Query`,
    };
    const queryBody = {
        type: ComponentType.TextDisplay,
        content: ticket.query_text,
    };
    const separator = { type: ComponentType.Separator, spacing: 12 };
    const container = {
        type: ComponentType.Container,
        accent_color: STATUS_COLOR[ticket.status],
        components: [
            header,
            separator,
            tableBlock('Ticket Overview', overviewRows),
            separator,
            queryHeading,
            queryBody,
            separator,
            tableBlock('Handling', handlingRows),
        ],
    };
    const buttons = [];
    if (ticket.status === 'OPEN') {
        buttons.push({
            type: ComponentType.Button,
            custom_id: `ticket:claim:${ticket.id}`,
            label: 'Claim Ticket',
            style: 1,
        });
    }
    else if (ticket.status === 'CLAIMED') {
        buttons.push({
            type: ComponentType.Button,
            custom_id: `ticket:close:${ticket.id}`,
            label: 'Close Ticket',
            style: 4,
        }, {
            type: ComponentType.Button,
            custom_id: `ticket:transcript:${ticket.id}`,
            label: 'Generate Transcript',
            style: 2,
        });
    }
    else if (ticket.status === 'CLOSED') {
        buttons.push({
            type: ComponentType.Button,
            custom_id: `ticket:transcript:${ticket.id}`,
            label: 'Generate Transcript',
            style: 2,
        });
    }
    const components = [container];
    if (buttons.length) {
        const row = { type: ComponentType.ActionRow, components: buttons };
        components.push(row);
    }
    return {
        flags: MessageFlags.IsComponentsV2 ?? COMPONENTS_V2_FLAG,
        components,
    };
}
