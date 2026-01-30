import { MessageFlags } from 'discord.js';
import { COMPONENTS_V2_FLAG, ComponentType, } from '../tickets/components.js';
export function renderStatusPanel(data) {
    const header = {
        type: ComponentType.TextDisplay,
        content: `## SwiftTicket Status`,
    };
    const body = {
        type: ComponentType.TextDisplay,
        content: `- **Bot:** ${data.botTag}\n` +
            `- **Latency:** ${data.latencyMs} ms\n` +
            `- **Servers:** ${data.guilds}\n` +
            `- **Uptime:** ${data.uptime}`,
    };
    const separator = { type: ComponentType.Separator };
    const container = {
        type: ComponentType.Container,
        accent_color: 0x7c5cff,
        components: [header, separator, body],
    };
    const components = [container];
    return {
        flags: MessageFlags.IsComponentsV2 ?? COMPONENTS_V2_FLAG,
        components,
    };
}
