import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/server/db/db';
import { migrate } from '../../src/server/db/migrate';
import { fetchWishlist, importWishlist, toItemInput, type OhmywishesWish } from '../../src/server/import/ohmywishes';
import type { SafeFetch } from '../../src/server/services/ssrf';

const CURRENCIES = ['RUB', 'USD', 'ILS'];
const wish = (over: Partial<OhmywishesWish> = {}): OhmywishesWish => ({
  id: 'w1', title: 'Thermometer', description: 'Xiaomi, the small one', price: { price: 53, currency: 'ILS' },
  externalUri: 'https://shop.example/thermo?utm_source=ohmywishes', photos: [{ image: { url: 'https://cdn.example/a.webp' } }], ...over,
});

describe('toItemInput', () => {
  it('maps a wish: category, price in minor units, link without the tracking parameter', () => {
    expect(toItemInput(wish(), 'House', CURRENCIES)).toEqual({
      title: 'Thermometer', description: 'Xiaomi, the small one', category: 'House', priceMinor: 5300, currency: 'ILS',
      url: 'https://shop.example/thermo', priority: 'want',
    });
  });

  it('keeps the other query parameters of a link', () => {
    const input = toItemInput(wish({ externalUri: 'https://shop.example/p?id=7&utm_source=ohmywishes&c=3' }), 'x', CURRENCIES);
    expect(input.url).toBe('https://shop.example/p?id=7&c=3');
  });

  it('drops the price and the currency together when the currency is not enabled in this app', () => {
    const input = toItemInput(wish({ price: { price: 20, currency: 'EUR' } }), 'x', CURRENCIES);
    expect(input).toMatchObject({ priceMinor: null, currency: null });
  });

  it('rounds decimal prices to cents and treats a missing or zero price as no price', () => {
    expect(toItemInput(wish({ price: { price: 12.345, currency: 'USD' } }), 'x', CURRENCIES).priceMinor).toBe(1235);
    expect(toItemInput(wish({ price: null }), 'x', CURRENCIES)).toMatchObject({ priceMinor: null, currency: null });
    expect(toItemInput(wish({ price: { price: 0, currency: 'USD' } }), 'x', CURRENCIES)).toMatchObject({ priceMinor: null, currency: null });
  });

  it('ignores a link that is not http(s), and keeps missing text empty', () => {
    const input = toItemInput(wish({ externalUri: 'javascript:alert(1)', description: null }), 'x', CURRENCIES);
    expect(input).toMatchObject({ url: null, description: '' });
  });

  it('cuts a title that is longer than the app allows', () => {
    expect(toItemInput(wish({ title: 'x'.repeat(300) }), 'x', CURRENCIES).title).toHaveLength(200);
  });
});

describe('fetchWishlist', () => {
  const api: Record<string, unknown> = {
    '/users/jane': { item: { id: 'u1', username: 'jane' } },
    '/users/u1/wish-lists?limit=50&offset=0': { items: [{ id: 'l1', title: 'House' }, { id: 'l2', title: 'Music' }] },
    '/users/u1/wish-lists/l1/wishes?limit=20&offset=0': { items: [{ id: 'a' }] },
    '/users/u1/wish-lists/l2/wishes?limit=20&offset=0': { items: [{ id: 'b' }] },
    '/wishes-v2/a': { item: { id: 'a', title: 'Lamp', price: null, photos: [], description: '', externalUri: null } },
    '/wishes-v2/b': { item: { id: 'b', title: 'Piano', price: null, photos: [], description: '', externalUri: null } },
  };
  const fake = async (path: string) => {
    if (!(path in api)) throw new Error(`unexpected ${path}`);
    return api[path];
  };

  it('walks the lists of a user and returns each wish with its list title and full details', async () => {
    const got = await fetchWishlist('jane', fake);
    expect(got.map((g) => [g.category, g.wish.title])).toEqual([['House', 'Lamp'], ['Music', 'Piano']]);
  });

  it('pages through a list with more than 20 wishes', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}` }));
    const paged = async (path: string) => {
      if (path.startsWith('/wishes-v2/')) return { item: { id: path.slice(11), title: path.slice(11), price: null, photos: [], description: '', externalUri: null } };
      if (path.endsWith('offset=0') && path.includes('/l1/')) return { items: many };
      if (path.endsWith('offset=20') && path.includes('/l1/')) return { items: [{ id: 'last' }] };
      if (path.includes('wish-lists?')) return { items: [{ id: 'l1', title: 'Big' }] };
      return { item: { id: 'u1' } };
    };
    expect(await fetchWishlist('jane', paged)).toHaveLength(21);
  });
});

describe('importWishlist', () => {
  async function png() {
    return sharp({ create: { width: 8, height: 8, channels: 3, background: '#c00' } }).png().toBuffer();
  }
  const setup = async () => {
    const db = openDb(':memory:');
    migrate(db);
    const dataDir = mkdtempSync(join(tmpdir(), 'import-test-'));
    const body = await png();
    const fetcher: SafeFetch = async (url) => {
      if (url.includes('broken')) throw new Error('down');
      return { finalUrl: url, contentType: 'image/png', status: 200, body };
    };
    return { db, dataDir, fetcher };
  };
  const entries = [
    { category: 'House', wish: wish({ id: 'a', title: 'Lamp' }) },
    { category: 'Music', wish: wish({ id: 'b', title: 'Piano', photos: [{ image: { url: 'https://cdn.example/broken.webp' } }] }) },
  ];
  const rows = (db: Awaited<ReturnType<typeof setup>>['db']) =>
    db.prepare('SELECT title, category, status, image_file FROM items ORDER BY id').all() as { title: string; category: string; status: string; image_file: string | null }[];

  it('creates every wish as a hidden draft with its category and image', async () => {
    const { db, dataDir, fetcher } = await setup();
    const res = await importWishlist({ db, dataDir, currencies: CURRENCIES, now: new Date('2027-01-01T00:00:00Z'), fetcher }, entries);
    expect(res).toEqual({ created: 2, skipped: 0, imagesFailed: 1 });
    const got = rows(db);
    expect(got.map((r) => [r.title, r.category, r.status])).toEqual([['Lamp', 'House', 'draft'], ['Piano', 'Music', 'draft']]);
    expect(got[0]!.image_file).toMatch(/^[0-9a-f]{16}\.webp$/);
    expect(got[1]!.image_file).toBeNull();
  });

  it('can publish right away', async () => {
    const { db, dataDir, fetcher } = await setup();
    await importWishlist({ db, dataDir, currencies: CURRENCIES, now: new Date(), fetcher, publish: true }, entries);
    expect(rows(db).map((r) => r.status)).toEqual(['published', 'published']);
  });

  it('is safe to run twice: gifts that are already there are skipped', async () => {
    const { db, dataDir, fetcher } = await setup();
    const ctx = { db, dataDir, currencies: CURRENCIES, now: new Date(), fetcher };
    await importWishlist(ctx, entries);
    const again = await importWishlist(ctx, entries);
    expect(again).toMatchObject({ created: 0, skipped: 2 });
    expect(rows(db)).toHaveLength(2);
  });

  it('keeps the order of the original list', async () => {
    const { db, dataDir, fetcher } = await setup();
    await importWishlist({ db, dataDir, currencies: CURRENCIES, now: new Date(), fetcher }, entries);
    const { ITEM_ORDER } = await import('../../src/server/domain/items');
    const ordered = db.prepare(`SELECT title FROM items ORDER BY ${ITEM_ORDER}`).all() as { title: string }[];
    expect(ordered.map((r) => r.title)).toEqual(['Lamp', 'Piano']);
  });
});
