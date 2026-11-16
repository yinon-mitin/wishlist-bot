import { serve } from '@hono/node-server';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import sharp from 'sharp';
import { createSafeFetch } from '../../src/server/services/ssrf';
import { BOT_TOKEN, createTestApp, guest, owner, type TestUser } from '../helpers/testApp';
import { signInitData } from '../helpers/initData';

export { guest, owner };
export type { TestUser };

const listen = (server: Server) => new Promise<number>((ok) => server.listen(0, '127.0.0.1', () => ok((server.address() as AddressInfo).port)));

/** A tiny shop: a product page with JSON-LD and a product photo. */
async function startShop() {
  const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#3b6ea5' } }).png().toBuffer();
  const server = createServer((req, res) => {
    if (req.url === '/kbd.png') return void res.writeHead(200, { 'Content-Type': 'image/png' }).end(png);
    const origin = `http://${req.headers.host}`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Keychron Q1</title>
      <script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Keychron Q1', description: 'Aluminium keyboard', image: `${origin}/kbd.png`, offers: { price: '189.00', priceCurrency: 'USD' } })}</script>
      </head><body>shop</body></html>`);
  });
  const port = await listen(server);
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/** A whole running app (in-memory DB, controllable clock, fake Telegram) on a random port. */
export async function startWorld() {
  const shop = await startShop();
  const t = createTestApp({
    app: { webRoot: resolve('dist/web') },
    deps: { safeFetcher: createSafeFetch({ allowLoopback: true }) },
  });
  const server = serve({ fetch: t.app.fetch, port: 0, hostname: '127.0.0.1' });
  await new Promise((ok) => server.once('listening', ok));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const initData = (user: TestUser, startParam?: string) =>
    signInitData({ botToken: BOT_TOKEN, user: { id: user.id, first_name: user.name, language_code: user.lang ?? 'en' }, authDate: t.clock.now, startParam });

  return {
    ...t,
    url,
    shop: shop.url,
    initData,
    /** Opens the mini-app the way Telegram does: signed initData in the URL hash. */
    async open(page: Page, user: TestUser, startParam?: string) {
      const params = new URLSearchParams({ tgWebAppData: initData(user, startParam), tgWebAppVersion: '8.0' });
      if (startParam) params.set('tgWebAppStartParam', startParam);
      await page.goto(`${url}/#${params.toString()}`);
    },
    /** Outside Telegram nobody answers the native confirm dialog, so the test answers it. */
    async answerConfirms(page: Page, answer: boolean) {
      await page.evaluate((ok) => {
        (window as unknown as { Telegram: { WebApp: { showConfirm: (m: string, cb: (v: boolean) => void) => void } } }).Telegram.WebApp.showConfirm = (_m, cb) => cb(ok);
      }, answer);
    },
    /** Direct API call as a user, for arranging state quickly. */
    async api<T = unknown>(user: TestUser, path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
      const res = await fetch(`${url}${path}`, {
        method: init.method ?? (init.json ? 'POST' : 'GET'),
        headers: { Authorization: `tma ${initData(user)}`, ...(init.json ? { 'Content-Type': 'application/json' } : {}) },
        body: init.json ? JSON.stringify(init.json) : undefined,
      });
      if (!res.ok) throw new Error(`${path} → ${res.status}`);
      return (await res.json()) as T;
    },
    async close() {
      server.close();
      shop.close();
    },
  };
}
export type World = Awaited<ReturnType<typeof startWorld>>;
