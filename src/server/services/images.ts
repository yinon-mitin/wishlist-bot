import { createHash } from 'node:crypto';
import { access, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp, { type OutputInfo } from 'sharp';
import { HttpError } from '../deps';
import type { Db } from '../db/db';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_SIDE = 1200;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif', 'tiff']);
export const IMAGE_NAME = /^[0-9a-f]{16}\.webp$/;

export const imagesDir = (dataDir: string) => join(dataDir, 'images');

/**
 * Decodes any supported raster image (format is detected from the bytes, never from a name or MIME type),
 * applies EXIF orientation, drops all metadata, fits it into 1200px and stores it as WebP named by content hash.
 */
export async function processImage(buf: Buffer, dataDir: string): Promise<{ file: string; width: number; height: number }> {
  let data: Buffer;
  let info: OutputInfo;
  try {
    const img = sharp(buf, { limitInputPixels: 50_000_000, failOn: 'error' });
    const meta = await img.metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new Error('unsupported format');
    ({ data, info } = await img
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true }));
  } catch {
    throw new HttpError(415, 'unsupported_image');
  }
  const file = `${createHash('sha256').update(data).digest('hex').slice(0, 16)}.webp`;
  const dir = imagesDir(dataDir);
  await mkdir(dir, { recursive: true });
  const target = join(dir, file);
  const exists = await access(target).then(() => true, () => false);
  if (!exists) await writeFile(target, data);
  return { file, width: info.width, height: info.height };
}

/** Removes an image file once no item refers to it any more. */
export async function collectImage(db: Db, dataDir: string, file: string | null): Promise<void> {
  if (!file || !IMAGE_NAME.test(file)) return;
  const row = db.prepare('SELECT COUNT(*) AS c FROM items WHERE image_file = ?').get(file) as { c: number };
  if (row.c === 0) await unlink(join(imagesDir(dataDir), file)).catch(() => undefined);
}

export async function listImageFiles(dataDir: string): Promise<string[]> {
  return readdir(imagesDir(dataDir)).catch(() => []);
}
