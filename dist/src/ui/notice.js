import { MessageFlags } from 'discord.js';
import { COMPONENTS_V2_FLAG, ComponentType, } from '../tickets/components.js';
import { bannerMedia, bannerSeparator } from './banner.js';
const ACCENT = {
    error: 0xef4444,
    info: 0x38bdf8,
    success: 0x22c55e,
};
export function buildNotice(kind, title, body) {
    const header = {
        type: ComponentType.TextDisplay,
        content: `### ${title}`,
    };
    const content = {
        type: ComponentType.TextDisplay,
        content: body,
    };
    const separator = { type: ComponentType.Separator };
    const container = {
        type: ComponentType.Container,
        accent_color: ACCENT[kind],
        components: [header, separator, content, bannerSeparator(), bannerMedia()],
    };
    const components = [container];
    return {
        flags: MessageFlags.IsComponentsV2 ?? COMPONENTS_V2_FLAG,
        components,
    };
}
