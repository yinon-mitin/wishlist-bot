import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { processImage } from '../../src/server/services/images';
import type { SafeFetch } from '../../src/server/services/ssrf';
import { createTestApp, guest, owner } from '../helpers/testApp';

let gpsJpeg: Buffer;
let redPng: Buffer;
beforeAll(async () => {
  gpsJpeg = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#c33' } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'someone' }, IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' } })
    .toBuffer();
  redPng = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#f00' } }).png().toBuffer();
});

const imageForm = (buf: Buffer, name = 'pen.jpg', type = 'image/jpeg') => {
  const f = new FormData();
  f.append('file', new File([new Uint8Array(buf)], name, { type }));
  return f;
};

const status = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return `${(e as { status?: number }).status}:${(e as { code?: string }).code}`;
  }
};

describe('processImage', () => {
  it('turns a big JPEG with GPS EXIF into a WebP of at most 1200px with no metadata', async () => {
    const t = createTestApp();
    const out = await processImage(gpsJpeg, t.dataDir);
    expect(out).toMatchObject({ width: 1200, height: 900 });
    expect(out.file).toMatch(/^[0-9a-f]{16}\.webp$/);
    const meta = await sharp(join(t.dataDir, 'images', out.file)).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
  });

  it('gives the same name to the same input and does not enlarge small images', async () => {
    const t = createTestApp();
    const a = await processImage(redPng, t.dataDir);
    const b = await processImage(redPng, t.dataDir);
    expect(b.file).toBe(a.file);
    expect(a).toMatchObject({ width: 64, height: 32 });
    expect(readdirSync(join(t.dataDir, 'images'))).toEqual([a.file]);
  });

  it('rejects SVG, text and garbage with 415', async () => {
    const t = createTestApp();
    expect(await status(processImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), t.dataDir))).toBe('415:unsupported_image');
    expect(await status(processImage(Buffer.from('just text, not a jpeg'), t.dataDir))).toBe('415:unsupported_image');
    expect(await status(processImage(Buffer.alloc(0), t.dataDir))).toBe('415:unsupported_image');
  });
});

describe('image routes', () => {
  async function withItem() {
    const t = createTestApp();
    const item = (await (await t.call('/api/items', { as: owner, json: { title: 'Pen' } })).json()) as { id: number };
    return { t, id: item.id };
  }

  it('uploads, attaches and serves the image publicly with immutable caching', async () => {
    const { t, id } = await withItem();
    const up = await t.call(`/api/items/${id}/image`, { as: owner, body: imageForm(redPng) });
    expect(up.status).toBe(200);
    const dto = await up.json();
    expect(dto.imageUrl).toMatch(/^\/images\/[0-9a-f]{16}\.webp$/);
    const img = await t.call(dto.imageUrl, { as: 'anon' });
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/webp');
    expect(img.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('forbids guests and answers 404 for a missing item', async () => {
    const { t, id } = await withItem();
    expect((await t.call(`/api/items/${id}/image`, { as: guest(1), body: imageForm(redPng) })).status).toBe(403);
    expect((await t.call('/api/items/999/image', { as: owner, body: imageForm(redPng) })).status).toBe(404);
  });

  it('rejects a file over 8 MB with 413 and a non-image with 415', async () => {
    const { t, id } = await withItem();
    const huge = await t.call(`/api/items/${id}/image`, { as: owner, body: imageForm(Buffer.alloc(8 * 1024 * 1024 + 10, 1)) });
    expect(huge.status).toBe(413);
    const text = await t.call(`/api/items/${id}/image`, { as: owner, body: imageForm(Buffer.from('hello'), 'x.jpg') });
    expect(text.status).toBe(415);
  });

  it('rejects a request without a file', async () => {
    const { t, id } = await withItem();
    expect((await t.call(`/api/items/${id}/image`, { as: owner, body: new FormData() })).status).toBe(400);
  });

  it.each(['/images/..%2f..%2fetc%2fpasswd', '/images/abc.webp', '/images/0123456789abcdef.png', '/images/0123456789abcdef.webp'])('answers 404 for %s', async (path) => {
    const t = createTestApp();
    expect((await t.call(path, { as: 'anon' })).status).toBe(404);
  });

  it('replacing the image removes the old file when nothing else uses it, and keeps it when another item does', async () => {
    const { t, id } = await withItem();
    const other = (await (await t.call('/api/items', { as: owner, json: { title: 'Other' } })).json()) as { id: number };
    const first = await (await t.call(`/api/items/${id}/image`, { as: owner, body: imageForm(redPng) })).json();
    await t.call(`/api/items/${other.id}/image`, { as: owner, body: imageForm(redPng) }); // same bytes, same file
    const bluePng = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#00f' } }).png().toBuffer();
    await t.call(`/api/items/${id}/image`, { as: owner, body: imageForm(bluePng) });
    const dir = join(t.dataDir, 'images');
    expect(existsSync(join(dir, first.imageUrl.replace('/images/', '')))).toBe(true); // still used by `other`
    await t.call(`/api/items/${other.id}/image`, { as: owner, body: imageForm(bluePng) });
    expect(existsSync(join(dir, first.imageUrl.replace('/images/', '')))).toBe(false);
    for (const row of t.db.prepare('SELECT image_file f FROM items').all() as { f: string }[]) expect(existsSync(join(dir, row.f))).toBe(true);
  });

  it('deleting an item removes its image file when nothing else uses it', async () => {
    const { t, id } = await withItem();
    const dto = await (await t.call(`/api/items/${id}/image`, { as: owner, body: imageForm(redPng) })).json();
    const path = join(t.dataDir, 'images', dto.imageUrl.replace('/images/', ''));
    expect(existsSync(path)).toBe(true);
    await t.call(`/api/items/${id}`, { as: owner, method: 'DELETE' });
    expect(existsSync(path)).toBe(false);
  });

  it('imports an image from a URL through the safe fetcher', async () => {
    const fetcher: SafeFetch = async (url) => ({ finalUrl: url, contentType: 'image/png', status: 200, body: redPng });
    const t = createTestApp({ deps: { safeFetcher: fetcher } });
    const item = (await (await t.call('/api/items', { as: owner, json: { title: 'Pen' } })).json()) as { id: number };
    const res = await t.call(`/api/items/${item.id}/image-from-url`, { as: owner, json: { url: 'https://cdn.example/pen.png' } });
    expect(res.status).toBe(200);
    expect((await res.json()).imageUrl).toMatch(/^\/images\//);
  });

  it('blocks an image URL that points at a private address, and rejects non-images from URLs', async () => {
    const { t, id } = await withItem();
    const blocked = await t.call(`/api/items/${id}/image-from-url`, { as: owner, json: { url: 'http://10.0.0.5/pen.png' } });
    expect(blocked.status).toBe(400);
    expect(await blocked.json()).toEqual({ error: 'blocked' });
    const html: SafeFetch = async (url) => ({ finalUrl: url, contentType: 'text/html', status: 200, body: Buffer.from('<html></html>') });
    const t2 = createTestApp({ deps: { safeFetcher: html } });
    const item = (await (await t2.call('/api/items', { as: owner, json: { title: 'Pen' } })).json()) as { id: number };
    expect((await t2.call(`/api/items/${item.id}/image-from-url`, { as: owner, json: { url: 'https://x.example/page' } })).status).toBe(415);
  });

  it('forbids guests on image-from-url', async () => {
    const { t, id } = await withItem();
    expect((await t.call(`/api/items/${id}/image-from-url`, { as: guest(1), json: { url: 'https://x.example/a.png' } })).status).toBe(403);
  });
});
