import { describe, expect, it } from 'vitest';
import { applyTemplate, parseFields, parseLinkButtons, validateEmbed } from '../../src/embed-builder.js';

describe('Embed Builder composer', () => {
  it('supports complete field and link-button lists within Discord limits', () => {
    const fields = parseFields('Status | Live | inline\nOwner | Slice')!;
    const buttons = parseLinkButtons('Open Slice | https://slice.ai | ✨')!;
    expect(fields).toEqual([{ name: 'Status', value: 'Live', inline: true }, { name: 'Owner', value: 'Slice' }]);
    expect(buttons).toEqual([{ label: 'Open Slice', url: 'https://slice.ai', emoji: '✨' }]);
    expect(validateEmbed({ title: 'Release', author: { name: 'Slice', url: 'https://slice.ai' }, footer: { text: 'Slice' }, image: 'https://cdn.slice.ai/release.png', thumbnail: 'https://cdn.slice.ai/icon.png', fields, timestamp: true }, buttons)).toEqual([]);
  });

  it('rejects malformed custom field and link layouts', () => {
    expect(parseFields('Missing value |')).toBeNull();
    expect(parseLinkButtons('Missing URL |')).toBeNull();
    expect(validateEmbed({ title: 'Safe' }, [{ label: 'Unsafe', url: 'http://127.0.0.1/private' }])[0]).toContain('Link buttons');
  });

  it('creates independent preset payloads that callers can safely customize', () => {
    const first = applyTemplate('EVENT'); const second = applyTemplate('EVENT');
    first.title = 'Changed';
    expect(second.title).toBe('Slice community event');
    expect(second.fields).toHaveLength(2);
  });
});
