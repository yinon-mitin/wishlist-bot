import type { Db } from '../db/db';
import { createItem, publishItem, updateItem, type ItemInput } from '../domain/items';
import { MAX_IMAGE_BYTES, processImage } from '../services/images';
import type { SafeFetch } from '../services/ssrf';

/** The parts of an ohmywishes.com wish that the import reads. */
export interface OhmywishesWish {
  id: string;
  title: string;
  description: string | null;
  price: { price: number; currency: string } | null;
  externalUri: string | null;
  photos: { image: { url: string } }[];
}

export interface ImportEntry {
  category: string;
  wish: OhmywishesWish;
}

/** Reads one JSON document from the site's public API; the path is relative to /api/v3. */
export type ApiGet = (path: string) => Promise<unknown>;

const API = 'https://ohmywishes.com/api/v3';

export const httpApiGet: ApiGet = async (path) => {
  const res = await fetch(API + path, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; WishlistBot/1.0)' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ohmywishes answered ${res.status} for ${path}`);
  return res.json();
};

const PAGE = 20;

/** Walks every list of a user and loads each wish in full (link and description are only in the detail). */
export async function fetchWishlist(username: string, get: ApiGet = httpApiGet): Promise<ImportEntry[]> {
  const user = ((await get(`/users/${encodeURIComponent(username)}`)) as { item: { id: string } }).item;
  const lists = ((await get(`/users/${user.id}/wish-lists?limit=50&offset=0`)) as { items: { id: string; title: string }[] }).items;
  const out: ImportEntry[] = [];
  for (const list of lists) {
    for (let offset = 0; ; offset += PAGE) {
      const page = ((await get(`/users/${user.id}/wish-lists/${list.id}/wishes?limit=${PAGE}&offset=${offset}`)) as { items: { id: string }[] }).items;
      for (const summary of page) {
        const detail = (await get(`/wishes-v2/${summary.id}`)) as { item: OhmywishesWish };
        out.push({ category: list.title, wish: detail.item });
      }
      if (page.length < PAGE) break;
    }
  }
  return out;
}

const text = (value: string | null | undefined, max: number) => (value ?? '').trim().slice(0, max);

function cleanUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.searchParams.delete('utm_source'); // ohmywishes adds its own tracking
    const clean = url.toString();
    return clean.length <= 2000 ? clean : null;
  } catch {
    return null;
  }
}

export function toItemInput(wish: OhmywishesWish, category: string, currencies: string[]): ItemInput {
  const currency = wish.price?.currency.toUpperCase() ?? '';
  const priceMinor = wish.price && currencies.includes(currency) ? Math.round(wish.price.price * 100) : 0;
  const priced = priceMinor > 0;
  return {
    title: text(wish.title, 200),
    description: text(wish.description, 4000),
    category: text(category, 100),
    priceMinor: priced ? priceMinor : null,
    currency: priced ? currency : null,
    url: cleanUrl(wish.externalUri),
    priority: 'want',
  };
}

export interface ImportContext {
  db: Db;
  dataDir: string;
  currencies: string[];
  now: Date;
  fetcher: SafeFetch;
  /** Hidden drafts by default, so the owner can look through them first. */
  publish?: boolean;
}

/** Creates the gifts that are not there yet (same title and category); photos that cannot be loaded are skipped. */
export async function importWishlist(ctx: ImportContext, entries: ImportEntry[]): Promise<{ created: number; skipped: number; imagesFailed: number }> {
  const result = { created: 0, skipped: 0, imagesFailed: 0 };
  const exists = ctx.db.prepare('SELECT 1 FROM items WHERE title = ? AND category = ?');
  for (const [index, { category, wish }] of entries.entries()) {
    const input = toItemInput(wish, category, ctx.currencies);
    if (exists.get(input.title, input.category)) {
      result.skipped++;
      continue;
    }
    // Lists show the newest first; stamping earlier entries later keeps the original order.
    const stamp = new Date(ctx.now.getTime() - index * 1000);
    const item = createItem(ctx.db, { ...input, status: 'draft' }, stamp);
    const photo = wish.photos[0]?.image.url;
    if (photo) {
      try {
        const fetched = await ctx.fetcher(photo, { maxBytes: MAX_IMAGE_BYTES });
        const { file } = await processImage(fetched.body, ctx.dataDir);
        updateItem(ctx.db, item.id, { imageFile: file }, stamp);
      } catch {
        result.imagesFailed++;
      }
    }
    if (ctx.publish) publishItem(ctx.db, item.id, stamp);
    result.created++;
  }
  return result;
}
