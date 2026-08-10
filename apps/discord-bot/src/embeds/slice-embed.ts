import { EmbedBuilder } from 'discord.js';
import { colorNumber, presentationConfig, renderTemplate, type PresentationConfig } from '../presentation-config.js';

export class SliceEmbed {
  static info(title: string, description: string): EmbedBuilder { return this.base('info', title, description); }
  static success(title: string, description: string): EmbedBuilder { return this.base('success', title, description); }
  static warning(title: string, description: string): EmbedBuilder { return this.base('warning', title, description); }
  static error(title: string, description: string): EmbedBuilder { return this.base('error', title, description); }
  static staff(title: string, description: string): EmbedBuilder { return this.base('staff', title, description); }
  static configured(file: keyof PresentationConfig, key: string, values: Record<string, string | number | undefined> = {}): EmbedBuilder {
    const source = presentationConfig()[file] as { messages?: Record<string, { title: string; description: string; color: 'info' | 'success' | 'warning' | 'error' | 'staff'; footer?: string; thumbnail?: string; image?: string; timestamp?: boolean }> };
    const message = source.messages?.[key];
    if (!message) throw new Error(`Configuration error: missing ${String(file)}.messages.${key}.`);
    const embed = this.base(message.color, renderTemplate(message.title, values), renderTemplate(message.description, values));
    if (message.footer) embed.setFooter({ text: renderTemplate(message.footer, values) });
    if (message.thumbnail) embed.setThumbnail(message.thumbnail);
    if (message.image) embed.setImage(message.image);
    if (message.timestamp === false) embed.setTimestamp(null);
    return embed;
  }
  private static base(kind: 'info' | 'success' | 'warning' | 'error' | 'staff', title: string, description: string): EmbedBuilder {
    const branding = presentationConfig()['branding.yml'];
    const embed = new EmbedBuilder().setColor(colorNumber(branding.colors[kind])).setTitle(title).setDescription(description).setFooter({ text: branding.footer.text }).setTimestamp();
    if (branding.images.thumbnail_url) embed.setThumbnail(branding.images.thumbnail_url);
    return embed;
  }
}
