import { MessageFlags } from 'discord.js';
import {
  COMPONENTS_V2_FLAG,
  ComponentType,
  ContainerComponent,
  MessageComponent,
  SeparatorComponent,
  TextDisplayComponent,
} from '../tickets/components.js';

type NoticeKind = 'error' | 'info' | 'success';

const ACCENT: Record<NoticeKind, number> = {
  error: 0xef4444,
  info: 0x38bdf8,
  success: 0x22c55e,
};

export function buildNotice(kind: NoticeKind, title: string, body: string) {
  const header: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content: `### ${title}`,
  };
  const content: TextDisplayComponent = {
    type: ComponentType.TextDisplay,
    content: body,
  };
  const separator: SeparatorComponent = { type: ComponentType.Separator };
  const container: ContainerComponent = {
    type: ComponentType.Container,
    accent_color: ACCENT[kind],
    components: [header, separator, content],
  };
  const components: MessageComponent[] = [container];
  return {
    flags: (MessageFlags as any).IsComponentsV2 ?? COMPONENTS_V2_FLAG,
    components,
  };
}
