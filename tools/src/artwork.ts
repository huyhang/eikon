import type { Random } from './random';

export interface ArtworkSpec {
  width: number;
  height: number;
  label: string;
  /** Palette family so an illustrator's works feel related. */
  baseHue: number;
}

const ASPECTS: [number, number][] = [
  [2, 3],
  [3, 4],
  [4, 5],
  [9, 16],
  [1, 1],
  [3, 2],
  [4, 3],
  [16, 9],
  [21, 9],
  [1, 2],
];

/** Picks a pleasant size with a varied aspect ratio, long side 1200–2400 px. */
export function pickSize(random: Random): { width: number; height: number } {
  const [w, h] = ASPECTS[Math.floor(random() * ASPECTS.length)]!;
  const longSide = 1200 + Math.floor(random() * 1200);
  const scale = longSide / Math.max(w, h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

export function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(((h % 360) + 360) % 360)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Abstract "illustration": gradient sky, soft glowing orbs, layered hills, and a caption. */
export function artworkSvg(spec: ArtworkSpec, random: Random): string {
  const { width: w, height: h, baseHue } = spec;
  const hue = baseHue + (random() - 0.5) * 60;
  const orbColors: string[] = [];
  const orbs = Array.from({ length: 3 + Math.floor(random() * 4) }, (_, i) => {
    const r = (0.1 + random() * 0.3) * Math.min(w, h);
    orbColors.push(hsl(hue + 40 + random() * 80, 90, 72));
    return `<circle cx="${random() * w}" cy="${random() * h * 0.7}" r="${r}" fill="url(#orb${i})" opacity="${0.45 + random() * 0.45}"/>`;
  }).join('');
  // Radial gradients fade to transparent: the soft glow of a blur filter at a fraction of the cost.
  const orbGradients = orbColors
    .map(
      (color, i) =>
        `<radialGradient id="orb${i}"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`,
    )
    .join('');
  const hills = Array.from({ length: 3 }, (_, i) => {
    const base = h * (0.62 + i * 0.12);
    const peaks = Array.from(
      { length: 5 },
      (_unused, k) => `${(w / 4) * k},${base - random() * h * 0.18}`,
    ).join(' L');
    return `<path d="M0,${h} L${peaks} L${w},${base} L${w},${h} Z" fill="${hsl(hue + 180 + i * 10, 35, 18 + i * 8)}" opacity="0.92"/>`;
  }).join('');
  const fontSize = Math.round(Math.min(w, h) * 0.045);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="${hsl(hue, 70, 22)}"/>
      <stop offset="0.6" stop-color="${hsl(hue + 30, 75, 50)}"/>
      <stop offset="1" stop-color="${hsl(hue + 60, 85, 75)}"/>
    </linearGradient>
    ${orbGradients}
  </defs>
  <rect width="100%" height="100%" fill="url(#sky)"/>
  ${orbs}
  ${hills}
  <text x="${fontSize}" y="${h - fontSize}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" fill="rgba(255,255,255,0.75)">${escapeXml(spec.label)}</text>
</svg>`;
}
