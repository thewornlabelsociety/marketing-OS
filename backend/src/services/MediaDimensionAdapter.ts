import sharp from 'sharp';

export interface RenditionSpecs {
  width: number;
  height: number;
  scale: number;
}

export const TARGET_SPECS: Record<string, RenditionSpecs> = {
  '4:5': { width: 1080, height: 1350, scale: 0.85 },
  '1:1': { width: 1080, height: 1080, scale: 0.82 },
  '9:16': { width: 1080, height: 1920, scale: 0.70 },
  '16:9': { width: 1200, height: 675, scale: 0.85 },
};

export class MediaDimensionAdapter {
  public static async adaptImage(
    inputBuffer: Buffer,
    backgroundColorHex: string = '#F8FAFC'
  ): Promise<Record<string, string>> {
    const renditions: Record<string, string> = {};

    for (const [key, spec] of Object.entries(TARGET_SPECS)) {
      const maxW = Math.round(spec.width * spec.scale);
      const maxH = Math.round(spec.height * spec.scale);

      const resizedSubject = await sharp(inputBuffer)
        .resize({ width: maxW, height: maxH, fit: 'inside' })
        .toBuffer();

      const meta = await sharp(resizedSubject).metadata();
      const left = Math.round((spec.width - (meta.width || maxW)) / 2);
      const top = Math.round((spec.height - (meta.height || maxH)) / 2);

      const canvas = await sharp({
        create: {
          width: spec.width,
          height: spec.height,
          channels: 4,
          background: backgroundColorHex,
        },
      })
        .composite([{ input: resizedSubject, top, left }])
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer();

      renditions[key] = `data:image/jpeg;base64,${canvas.toString('base64')}`;
    }

    return renditions;
  }
}
