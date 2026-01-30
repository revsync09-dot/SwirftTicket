import { MessageFlags } from 'discord.js';
import {
  COMPONENTS_V2_FLAG,
  ComponentType,
  ContainerComponent,
  MessageComponent,
  SeparatorComponent,
  TextDisplayComponent,
  ActionRowComponent,
  ButtonComponent,
} from '../tickets/components.js';

export function renderWelcomeMessage(guildName: string) {
  const header: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content: `## Welcome to SwiftTickets`,
  };
  const subtitle: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content: `SwiftTickets is now active in **${guildName}**.`,
  };
  const setup: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content:
      `### Quick setup\n` +
      `- Run **/ticket setup** to pick your ticket category + staff role\n` +
      `- Run **/ticket panel** to configure categories & advanced controls\n` +
      `- Use **/mod log** to record warnings/mutes/bans`,
  };
  const features: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content:
      `### What you get\n` +
      `- Ticket lifecycle (Open → Claimed → Closed)\n` +
      `- Priority detection + moderation history\n` +
      `- Response tracking, transcripts, and smart replies\n` +
      `- Category builder + linked tickets`,
  };
  const separator: SeparatorComponent = { type: ComponentType.Separator };

  const supportButton: ButtonComponent = {
    type: ComponentType.Button,
    style: 5,
    url: 'https://discord.gg/FRMPgGTM',
    label: 'Support Server',
    emoji: { name: '💬' },
  };
  const actionRow: ActionRowComponent = {
    type: ComponentType.ActionRow,
    components: [supportButton],
  };

  const container: ContainerComponent = {
    type: ComponentType.Container,
    accent_color: 0x7c5cff,
    components: [header, separator, subtitle, separator, setup, separator, features, separator, actionRow],
  };

  const components: MessageComponent[] = [container];

  return {
    flags: (MessageFlags as any).IsComponentsV2 ?? COMPONENTS_V2_FLAG,
    components,
  };
}
