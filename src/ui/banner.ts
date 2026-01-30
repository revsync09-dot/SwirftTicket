import { ComponentType, MediaGalleryComponent, SeparatorComponent } from '../tickets/components.js';

const BANNER_URL = 'https://cdn.discordapp.com/emojis/1466595992945299528.png?size=160';

export function bannerSeparator(): SeparatorComponent {
  return { type: ComponentType.Separator };
}

export function bannerMedia(): MediaGalleryComponent {
  return {
    type: ComponentType.MediaGallery,
    items: [{ media: { url: BANNER_URL } }],
  };
}
