import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createTestApp, guest } from '../helpers/testApp';

function webRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'wishlist-web-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>spa</title>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  return dir;
}

describe('http app', () => {
  it('answers /healthz without authorization', async () => {
    const t = createTestApp();
    const res = await t.call('/healthz', { as: 'anon' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects /api requests without authorization with 401', async () => {
    const t = createTestApp();
    expect((await t.call('/api/anything', { as: 'anon' })).status).toBe(401);
  });

  it('returns a JSON 404 for an unknown authorized /api path', async () => {
    const t = createTestApp();
    const res = await t.call('/api/nope', { as: guest(1) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('turns an unexpected exception into a bare 500 without a stack', async () => {
    const t = createTestApp({ app: { extraRoutes: (api: Hono<any>) => api.get('/boom', () => { throw new Error('secret detail'); }) } });
    const res = await t.call('/api/boom');
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: 'internal' });
    expect(text).not.toContain('secret detail');
  });

  it('serves index.html for an unknown non-api path and hashed assets as immutable', async () => {
    const t = createTestApp({ app: { webRoot: webRoot() } });
    const page = await t.call('/some/spa/route', { as: 'anon' });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>spa</title>');
    const asset = await t.call('/assets/app-abc123.js', { as: 'anon' });
    expect(asset.headers.get('content-type')).toContain('javascript');
    expect(asset.headers.get('cache-control')).toContain('immutable');
  });

  it('does not serve files outside the web root', async () => {
    const t = createTestApp({ app: { webRoot: webRoot() } });
    const res = await t.call('/..%2f..%2fetc%2fpasswd', { as: 'anon' });
    expect((await res.text())).not.toContain('root:');
  });
});
