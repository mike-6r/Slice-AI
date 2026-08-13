import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
const palettes = { bg: '#08090c', surface: '#0e1015', mint: '#22d3a5', muted: '#a2abba', white: '#f5f7fa' };
export const artworkNames = ['welcome', 'verification', 'roles', 'my-slice', 'collector-workspace', 'marketplace', 'support', 'roadmap', 'operations'] as const;
export async function renderArtwork(output: string, name: (typeof artworkNames)[number], title: string): Promise<string> {
  await mkdir(output, { recursive: true }); const path = join(output, `${name}-banner.png`);
  const svg = `<svg width="1200" height="400" viewBox="0 0 1200 400" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="${palettes.bg}"/><stop offset="1" stop-color="#0a201d"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="28"/></filter></defs><rect width="1200" height="400" fill="url(#g)"/><circle cx="1020" cy="80" r="180" fill="${palettes.mint}" opacity=".16" filter="url(#b)"/><path d="M740 370 1030 40l130 130-185 200z" fill="none" stroke="${palettes.mint}" stroke-opacity=".32" stroke-width="2"/><text x="72" y="106" fill="${palettes.mint}" font-size="18" font-family="Arial" letter-spacing="6">SLICE AI</text><text x="72" y="190" fill="${palettes.white}" font-size="56" font-family="Arial" font-weight="700">${escapeXml(title)}</text><text x="72" y="242" fill="${palettes.muted}" font-size="20" font-family="Arial">Collectibles, clearly.</text><rect x="72" y="288" width="205" height="2" fill="${palettes.mint}"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path); return path;
}
function escapeXml(value: string): string { return value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c); }
