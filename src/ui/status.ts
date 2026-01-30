import { MessageFlags } from 'discord.js';
import {
  COMPONENTS_V2_FLAG,
  ComponentType,
  ContainerComponent,
  MessageComponent,
  SeparatorComponent,
  TextDisplayComponent,
} from '../tickets/components.js';

export function renderStatusPanel(data: {
  botTag: string;
  latencyMs: number;
  guilds: number;
  uptime: string;
}) {
  const header: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content: `## SwiftTicket Status`,
  };
  const body: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content:
      `- **Bot:** ${data.botTag}\n` +
      `- **Latency:** ${data.latencyMs} ms\n` +
      `- **Servers:** ${data.guilds}\n` +
      `- **Uptime:** ${data.uptime}`,
  };
  const separator: SeparatorComponent = { type: ComponentType.Separator };
  const container: ContainerComponent = {
    type: ComponentType.Container,
    accent_color: 0x7c5cff,
    components: [header, separator, body],
  };
  const components: MessageComponent[] = [container];
  return {
    flags: (MessageFlags as any).IsComponentsV2 ?? COMPONENTS_V2_FLAG,
    components,
  };
}
