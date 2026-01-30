import { ComponentType } from '../tickets/components.js';
const BANNER_URL = 'https://cdn.discordapp.com/emojis/1466595992945299528.png?size=160';
export function bannerSeparator() {
    return { type: ComponentType.Separator };
}
export function bannerMedia() {
    return {
        type: ComponentType.MediaGallery,
        items: [{ media: { url: BANNER_URL } }],
    };
}
