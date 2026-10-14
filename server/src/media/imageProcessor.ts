import sharp from 'sharp';
import type { ThumbSize } from '@eikon/shared';

export interface ProcessedImage {
  width: number;
  height: number;
  format: string;
  animated: boolean;
  /** base64 of a 3x3 RGB bitmap. */
  placeholder: string;
  thumbnails: Record<ThumbSize, Buffer>;
}

/** Turns original image bytes into everything Eikon stores about them. */
export interface ImageProcessor {
  process(bytes: Buffer): Promise<ProcessedImage>;
}

export const PLACEHOLDER_SIZE = 3;

/** EXIF orientations 5–8 rotate by 90°, swapping width and height. */
export function orientedSize(
  width: number,
  height: number,
  orientation = 1,
): { width: number; height: number } {
  return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}

export class SharpImageProcessor implements ImageProcessor {
  async process(bytes: Buffer): Promise<ProcessedImage> {
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height || !meta.format) throw new Error('Unreadable image');
    const [placeholder, sm, lg] = await Promise.all([
      this.placeholder(bytes),
      this.oriented(bytes)
        .resize({ height: 480, width: 1440, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer(),
      this.oriented(bytes)
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer(),
    ]);
    return {
      ...orientedSize(meta.width, meta.height, meta.orientation),
      format: meta.format,
      animated: (meta.pages ?? 1) > 1,
      placeholder,
      thumbnails: { sm, lg },
    };
  }

  private oriented(bytes: Buffer) {
    return sharp(bytes, { limitInputPixels: false }).rotate();
  }

  private async placeholder(bytes: Buffer): Promise<string> {
    const raw = await this.oriented(bytes)
      .flatten({ background: '#1c1c1e' })
      .resize(PLACEHOLDER_SIZE, PLACEHOLDER_SIZE, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();
    return raw.toString('base64');
  }
}
