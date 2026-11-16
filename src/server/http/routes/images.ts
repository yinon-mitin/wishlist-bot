import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { getItem, updateItem } from '../../domain/items';
import { toItemDto } from '../../domain/views';
import { HttpError, type AppDeps, type AppEnv } from '../../deps';
import { IMAGE_NAME, MAX_IMAGE_BYTES, collectImage, imagesDir, processImage } from '../../services/images';
import { SafeFetchError, safeFetch } from '../../services/ssrf';
import { requireOwner } from '../guards';

/** Owner-only image management under /api. */
export function imageRoutes(deps: AppDeps): Hono<AppEnv> {
  const { db, config, clock } = deps;
  const r = new Hono<AppEnv>();

  async function attach(itemId: number, buf: Buffer, viewer: AppEnv['Variables']['viewer']) {
    const { file } = await processImage(buf, config.dataDir);
    const before = getItem(db, itemId);
    if (!before) throw new HttpError(404, 'not_found');
    const updated = updateItem(db, itemId, { imageFile: file }, clock())!;
    if (before.image_file !== file) await collectImage(db, config.dataDir, before.image_file);
    return toItemDto(updated, [], viewer, config);
  }

  const itemId = (raw: string | undefined) => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0 || !getItem(db, id)) throw new HttpError(404, 'not_found');
    return id;
  };

  r.post(
    '/items/:id/image',
    requireOwner,
    bodyLimit({ maxSize: MAX_IMAGE_BYTES + 1024 * 1024, onError: (c) => c.json({ error: 'too_large' }, 413) }),
    async (c) => {
      const id = itemId(c.req.param('id'));
      const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
      const file = form['file'];
      if (!(file instanceof File)) throw new HttpError(400, 'invalid_body');
      if (file.size > MAX_IMAGE_BYTES) throw new HttpError(413, 'too_large');
      return c.json(await attach(id, Buffer.from(await file.arrayBuffer()), c.get('viewer')));
    },
  );

  r.post('/items/:id/image-from-url', requireOwner, async (c) => {
    const id = itemId(c.req.param('id'));
    const parsed = z.object({ url: z.string().max(2000) }).strict().safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, 'invalid_body');
    let fetched;
    try {
      fetched = await (deps.safeFetcher ?? safeFetch)(parsed.data.url, { maxBytes: MAX_IMAGE_BYTES });
    } catch (err) {
      if (err instanceof SafeFetchError) {
        if (err.code === 'blocked') throw new HttpError(400, 'blocked');
        if (err.code === 'too_large') throw new HttpError(413, 'too_large');
      }
      throw new HttpError(422, 'unreachable');
    }
    return c.json(await attach(id, fetched.body, c.get('viewer')));
  });

  return r;
}

/** Public, cacheable image files (an <img> tag cannot send the Authorization header). */
export function publicImageRoutes(deps: AppDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.get('/images/*', async (c) => {
    const name = c.req.path.slice('/images/'.length);
    if (!IMAGE_NAME.test(name)) return c.json({ error: 'not_found' }, 404);
    try {
      const data = await readFile(join(imagesDir(deps.config.dataDir), name));
      return c.body(new Uint8Array(data), 200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' });
    } catch {
      return c.json({ error: 'not_found' }, 404);
    }
  });
  return r;
}
