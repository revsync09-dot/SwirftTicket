import { MessageFlags } from 'discord.js';
import { GuildSettings } from '../guildConfig.js';
import { TicketCategory } from '../tickets/categoriesRepo.js';
import {
  COMPONENTS_V2_FLAG,
  ComponentType,
  ContainerComponent,
  MessageComponent,
  SelectActionRowComponent,
  SeparatorComponent,
  TextDisplayComponent,
  ActionRowComponent,
  ButtonComponent,
} from '../tickets/components.js';

function makeOptions(start: number, end: number, selected: number | null) {
  const options = [];
  for (let i = start; i <= end; i++) {
    options.push({
      label: `${i} categories`,
      value: String(i),
      default: selected === i,
    });
  }
  return options;
}

export function renderCategoryPanel(settings: GuildSettings | null, categories: TicketCategory[], page = 1) {
  const selected = settings?.category_slots ?? 1;
  const warnThreshold = settings?.warn_threshold ?? 3;
  const warnTimeout = settings?.warn_timeout_minutes ?? 10;
  const smart = settings?.enable_smart_replies ?? true;
  const ai = settings?.enable_ai_suggestions ?? true;
  const autoPriority = settings?.enable_auto_priority ?? true;

  const header: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content: page === 1 ? `## Ticket Category Slots` : `## Advanced Ticket Setup`,
  };
  const body: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content:
      page === 1
        ? `Choose how many ticket categories should be available in this server.\n` +
          `Select between **1 and 35** categories, then press **Add Category** to create names.`
        : `Configure advanced moderation and automation features.\n` +
          `Use the dashboard for full controls.`,
  };

  const listText = categories.length
    ? categories
        .map((cat, i) => {
          const desc = cat.description ? ` - ${cat.description}` : '';
          return `- **${i + 1}.** ${cat.name}${desc}`;
        })
        .join('\n')
    : '- No categories yet';
  const list: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content: `### Current categories (${categories.length}/${selected})\n${listText}`,
  };

  const advanced: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content:
      `### Enabled Features\n` +
      `- Moderation history in ticket UI\n` +
      `- Auto priority: ${autoPriority ? 'ON' : 'OFF'}\n` +
      `- Response tracking + staff ranking\n` +
      `- Ticket reopen system\n` +
      `- Ticket linking\n` +
      `- Smart replies: ${smart ? 'ON' : 'OFF'}\n` +
      `- AI suggestions: ${ai ? 'ON' : 'OFF'}\n` +
      `- Warn threshold: ${warnThreshold} -> ${warnTimeout}m timeout`,
  };

  const separator: SeparatorComponent = { type: ComponentType.Separator };

  const row1: SelectActionRowComponent = {
    type: ComponentType.ActionRow,
    components: [
      {
        type: 3,
        custom_id: 'ticket:slots:1',
        placeholder: 'Select 1-25 categories',
        min_values: 1,
        max_values: 1,
        options: makeOptions(1, 25, selected),
      },
    ],
  };

  const row2: SelectActionRowComponent = {
    type: ComponentType.ActionRow,
    components: [
      {
        type: 3,
        custom_id: 'ticket:slots:2',
        placeholder: 'Select 26-35 categories',
        min_values: 1,
        max_values: 1,
        options: makeOptions(26, 35, selected),
      },
    ],
  };

  const addButton: ButtonComponent = {
    type: ComponentType.Button,
    custom_id: 'ticket:category:add',
    style: 2,
  };
  const addRow: ActionRowComponent = { type: ComponentType.ActionRow, components: [addButton] };

  const warnButton: ButtonComponent = {
    type: ComponentType.Button,
    custom_id: 'ticket:settings:warn',
    style: 2,
  };
  const timeoutButton: ButtonComponent = {
    type: ComponentType.Button,
    custom_id: 'ticket:settings:timeout',
    style: 2,
  };
  const smartButton: ButtonComponent = {
    type: ComponentType.Button,
    custom_id: 'ticket:toggle:smart',
    style: 2,
  };
  const aiButton: ButtonComponent = {
    type: ComponentType.Button,
    custom_id: 'ticket:toggle:ai',
    style: 2,
  };
  const priorityButton: ButtonComponent = {
    type: ComponentType.Button,
    custom_id: 'ticket:toggle:priority',
    style: 2,
  };
  const settingsRow1: ActionRowComponent = {
    type: ComponentType.ActionRow,
    components: [warnButton, timeoutButton, smartButton, aiButton, priorityButton],
  };

  const prevButton: ButtonComponent = {
    type: ComponentType.Button,
    custom_id: 'ticket:panel:page:1',
    style: 2,
    disabled: page === 1,
  };
  const nextButton: ButtonComponent = {
    type: ComponentType.Button,
    custom_id: 'ticket:panel:page:2',
    style: 2,
    disabled: page === 2,
  };
  const navRow: ActionRowComponent = { type: ComponentType.ActionRow, components: [prevButton, nextButton] };

  const container: ContainerComponent = {
    type: ComponentType.Container,
    accent_color: 0x7c5cff,
    components:
      page === 1
        ? [
            header,
            separator,
            body,
            separator,
            list,
            separator,
            row1,
            row2,
            separator,
            addRow,
            separator,
            navRow,
          ]
        : [
            header,
            separator,
            body,
            separator,
            advanced,
            separator,
            settingsRow1,
            separator,
            navRow,
          ],
  };

  const components: MessageComponent[] = [container];

  return {
    flags: (MessageFlags as any).IsComponentsV2 ?? COMPONENTS_V2_FLAG,
    components,
  };
}
