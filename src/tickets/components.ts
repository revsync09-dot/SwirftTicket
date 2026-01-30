export enum ComponentType {
  ActionRow = 1,
  Button = 2,
  Section = 9,
  TextDisplay = 10,
  Thumbnail = 11,
  MediaGallery = 12,
  File = 13,
  Separator = 14,
  Container = 17,
}

export const COMPONENTS_V2_FLAG = 1 << 15; // 32768

export interface TextDisplayComponent {
  type: ComponentType.TextDisplay;
  content: string;
}

export interface SeparatorComponent {
  type: ComponentType.Separator;
  spacing?: number;
}

export interface ButtonComponent {
  type: ComponentType.Button;
  custom_id?: string;
  url?: string;
  label?: string;
  style: 1 | 2 | 3 | 4 | 5; // primary, secondary, success, danger, link
  disabled?: boolean;
  emoji?: { name?: string; id?: string; animated?: boolean };
}

export interface ActionRowComponent {
  type: ComponentType.ActionRow;
  components: ButtonComponent[];
}

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
  default?: boolean;
}

export interface StringSelectComponent {
  type: 3;
  custom_id: string;
  options: SelectOption[];
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
}

export interface SelectActionRowComponent {
  type: ComponentType.ActionRow;
  components: StringSelectComponent[];
}

export interface ContainerComponent {
  type: ComponentType.Container;
  components: MessageComponent[];
  accent_color?: number;
  spoiler?: boolean;
}

export interface FileComponent {
  type: ComponentType.File;
  file: { url: string };
  spoiler?: boolean;
  id?: number;
}

export interface MediaGalleryItem {
  media: { url: string };
  spoiler?: boolean;
}

export interface MediaGalleryComponent {
  type: ComponentType.MediaGallery;
  items: MediaGalleryItem[] | readonly MediaGalleryItem[];
}

export type MessageComponent =
  | TextDisplayComponent
  | SeparatorComponent
  | ButtonComponent
  | ActionRowComponent
  | SelectActionRowComponent
  | ContainerComponent
  | FileComponent
  | MediaGalleryComponent;
