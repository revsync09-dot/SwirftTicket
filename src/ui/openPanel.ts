import { MessageFlags } from 'discord.js';
import { TicketCategory } from '../tickets/categoriesRepo.js';
import {
  COMPONENTS_V2_FLAG,
  ComponentType,
  ContainerComponent,
  MessageComponent,
  SelectActionRowComponent,
  SeparatorComponent,
  TextDisplayComponent,
} from '../tickets/components.js';

function makeOptions(categories: TicketCategory[]) {
  return categories.map((cat) => ({
    label: cat.name.slice(0, 100),
    value: String(cat.id),
    description: cat.description ? cat.description.slice(0, 50) : undefined,
  }));
}

export function renderTicketOpenPanel(categories: TicketCategory[]) {
  const header: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content: '## Open a SwiftTicket',
  };
  const body: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content:
      'Select a category below to open a new ticket. You will be asked for a short description after selecting.',
  };

  const separator: SeparatorComponent = { type: ComponentType.Separator };

  const components: MessageComponent[] = [header, separator, body, separator];

  if (!categories.length) {
    components.push({
      type: ComponentType.TextDisplay,
      content: 'No categories are configured yet. Please contact an admin.',
    });
  } else {
    const first = categories.slice(0, 25);
    const second = categories.slice(25, 35);
    const row1: SelectActionRowComponent = {
      type: ComponentType.ActionRow,
      components: [
        {
          type: 3,
          custom_id: 'ticket:open:1',
          placeholder: 'Choose a category (1-25)',
          min_values: 1,
          max_values: 1,
          options: makeOptions(first),
        },
      ],
    };
    components.push(row1);
    if (second.length) {
      const row2: SelectActionRowComponent = {
        type: ComponentType.ActionRow,
        components: [
          {
            type: 3,
            custom_id: 'ticket:open:2',
            placeholder: 'Choose a category (26-35)',
            min_values: 1,
            max_values: 1,
            options: makeOptions(second),
          },
        ],
      };
      components.push(separator, row2);
    }
  }

  const container: ContainerComponent = {
    type: ComponentType.Container,
    accent_color: 0x7c5cff,
    components,
  };

  return {
    flags: (MessageFlags as any).IsComponentsV2 ?? COMPONENTS_V2_FLAG,
    components: [container],
  };
}
