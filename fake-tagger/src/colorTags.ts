import sharp from 'sharp';
import type { TaggerTag } from '@eikon/shared';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Names the dominant colour the way boorus do ("blue_theme"), or null for muted colours. */
export function colorThemeTag({ r, g, b }: Rgb): string | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 40) return 'dark';
  if (max - min < 25) return min > 200 ? 'white_theme' : 'greyscale';
  const hue = hueOf(r, g, b, max, min);
  if (hue < 15 || hue >= 345) return 'red_theme';
  if (hue < 45) return 'orange_theme';
  if (hue < 70) return 'yellow_theme';
  if (hue < 165) return 'green_theme';
  if (hue < 200) return 'aqua_theme';
  if (hue < 255) return 'blue_theme';
  if (hue < 290) return 'purple_theme';
  return 'pink_theme';
}

function hueOf(r: number, g: number, b: number, max: number, min: number): number {
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Real image analysis for a touch of realism: the dominant colour becomes a tag. */
export async function colorTagsFor(bytes: Buffer): Promise<TaggerTag[]> {
  const { dominant } = await sharp(bytes).stats();
  const name = colorThemeTag(dominant);
  return name ? [{ name, category: 'general', confidence: 0.9 }] : [];
}
