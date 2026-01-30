import { MessageFlags } from 'discord.js';
import { TicketRecord } from '../supabase.js';
import {
  ActionRowComponent,
  ButtonComponent,
  COMPONENTS_V2_FLAG,
  ComponentType,
  ContainerComponent,
  MessageComponent,
  SeparatorComponent,
  TextDisplayComponent,
} from './components.js';

const STATUS_COLOR: Record<TicketRecord['status'], number> = {
  OPEN: 0x3b82f6,
  CLAIMED: 0xfbbf24,
  CLOSED: 0x9ca3af,
};

const STATUS_LABEL: Record<TicketRecord['status'], string> = {
  OPEN: 'Open',
  CLAIMED: 'Claimed',
  CLOSED: 'Closed',
};

const dash = '-';

function fmtRelative(iso: string | null) {
  if (!iso) return dash;
  const epoch = Math.floor(new Date(iso).getTime() / 1000);
  return `<t:${epoch}:R>`;
}

function formatMs(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  const hr = Math.floor(min / 60);
  if (hr === 0) return `${min}m ${sec}s`;
  const rem = min % 60;
  return `${hr}h ${rem}m`;
}

function padId(id: number, size = 6) {
  return String(id).padStart(size, '0');
}

function bulletBlock(title: string, rows: [string, string][]): TextDisplayComponent {
  const header = `### ${title}`;
  const lines = rows.map(([k, v]) => `- **${k}:** ${v}`).join('\n');
  return { type: ComponentType.TextDisplay, content: `${header}\n${lines}` };
}

export function renderTicketMessage(
  ticket: TicketRecord,
  opts: {
    creatorMention: string;
    timezone: string;
    moderation?: {
      warnings: number;
      mutes: number;
      bans: number;
      previousTickets: number;
      lastSupportAt: string | null;
    };
    links?: number[];
    suggestions?: string[];
  },
) {
  const overviewRows: [string, string][] = [
    ['Ticket ID', padId(ticket.id)],
    ['Status', STATUS_LABEL[ticket.status]],
    ['Category', ticket.category_name ?? dash],
    ['Created', fmtRelative(ticket.created_at)],
  ];

  const handlingRows: [string, string][] = [
    ['Claimed by', ticket.claimed_by ? `<@${ticket.claimed_by}>` : dash],
    ['Claimed', fmtRelative(ticket.claimed_at)],
    ['Closed by', ticket.closed_by ? `<@${ticket.closed_by}>` : dash],
    ['Closed', fmtRelative(ticket.closed_at)],
    ['Reopened', fmtRelative(ticket.reopened_at ?? null)],
  ];

  const header: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content: `## New Ticket ${opts.creatorMention} opened!`,
  };

  const queryHeading: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content: `### Description`,
  };
  const queryBody: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content: ticket.query_text,
  };

  const separator: SeparatorComponent = { type: ComponentType.Separator };

  const moderationBlock: TextDisplayComponent | null = opts.moderation
    ? {
        type: ComponentType.TextDisplay,
        content:
          `### Moderation History\n` +
          `- **Warnings:** ${opts.moderation.warnings}\n` +
          `- **Mutes:** ${opts.moderation.mutes}\n` +
          `- **Bans:** ${opts.moderation.bans}\n` +
          `- **Previous tickets:** ${opts.moderation.previousTickets}\n` +
          `- **Last support:** ${fmtRelative(opts.moderation.lastSupportAt)}`,
      }
    : null;

  const priorityBlock: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content: `### Priority\n- **Level:** ${ticket.priority ?? 'NORMAL'}${
      ticket.suspicion_reason ? `\n- **Reason:** ${ticket.suspicion_reason}` : ''
    }`,
  };

  const categoryBlock: TextDisplayComponent | null = ticket.category_description
    ? {
        type: ComponentType.TextDisplay,
        content: `### Category Details\n${ticket.category_description}`,
      }
    : null;

  const linksBlock: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content:
      `### Linked Tickets\n` +
      (opts.links && opts.links.length ? opts.links.map((id) => `- #${padId(id)}`).join('\n') : '- None'),
  };

  const suggestionsBlock: TextDisplayComponent | null =
    opts.suggestions && opts.suggestions.length
      ? {
          type: ComponentType.TextDisplay,
          content: `### Suggested Replies\n${opts.suggestions.map((s) => `- ${s}`).join('\n')}`,
        }
      : null;

  const responseBlock: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content:
      `### Response Tracking\n` +
      `- **First response:** ${ticket.first_response_ms ? formatMs(ticket.first_response_ms) : dash}\n` +
      `- **Avg response:** ${ticket.avg_response_ms ? formatMs(ticket.avg_response_ms) : dash}\n` +
      `- **Responses tracked:** ${ticket.response_count ?? 0}`,
  };

  const container: ContainerComponent = {
    type: ComponentType.Container,
    accent_color: STATUS_COLOR[ticket.status],
    components: [
      header,
      separator,
      bulletBlock('Ticket Overview', overviewRows),
      separator,
      priorityBlock,
      ...(categoryBlock ? [separator, categoryBlock] : []),
      separator,
      queryHeading,
      queryBody,
      separator,
      bulletBlock('Handling', handlingRows),
      ...(moderationBlock ? [separator, moderationBlock] : []),
      separator,
      responseBlock,
      ...(suggestionsBlock ? [separator, suggestionsBlock] : []),
      separator,
      linksBlock,
    ],
  };

  const buttons: ButtonComponent[] = [];
  if (ticket.status === 'OPEN') {
    buttons.push({
      type: ComponentType.Button,
      custom_id: `ticket:claim:${ticket.id}`,
      emoji: { id: '1466560103216971970' },
      style: 2,
    });
  } else if (ticket.status === 'CLAIMED') {
    buttons.push(
      {
        type: ComponentType.Button,
        custom_id: `ticket:close:${ticket.id}`,
        emoji: { id: '1466560320800559225' },
        style: 2,
      },
      {
        type: ComponentType.Button,
        custom_id: `ticket:transcript:${ticket.id}`,
        emoji: { id: '1466560422592254068' },
        style: 2,
      },
    );
  } else if (ticket.status === 'CLOSED') {
    buttons.push({
      type: ComponentType.Button,
      custom_id: `ticket:transcript:${ticket.id}`,
      emoji: { id: '1466560422592254068' },
      style: 2,
    });
    buttons.push({
      type: ComponentType.Button,
      custom_id: `ticket:reopen:${ticket.id}`,
      emoji: { id: '1466560213145358376' },
      style: 2,
    });
  }

  buttons.push({
    type: ComponentType.Button,
    custom_id: `ticket:link:${ticket.id}`,
    emoji: { name: '🔗' },
    style: 2,
  });

  if (buttons.length) {
    const row: ActionRowComponent = { type: ComponentType.ActionRow, components: buttons };
    container.components.push(separator, row);
  }

  const components: MessageComponent[] = [container];

  return {
    flags: (MessageFlags as any).IsComponentsV2 ?? COMPONENTS_V2_FLAG,
    components,
  };
}
