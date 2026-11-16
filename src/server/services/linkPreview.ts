import * as cheerio from 'cheerio';
import { toMinor } from '../../shared/money';
import { SafeFetchError, safeFetch, type SafeFetch } from './ssrf';

export interface LinkPreview {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  priceMinor: number | null;
  currency: string | null;
  siteName: string | null;
}

export type LinkPreviewResult = LinkPreview & { error?: 'blocked' | 'unreachable' | 'too_large' };

const EMPTY: LinkPreview = { title: null, description: null, imageUrl: null, priceMinor: null, currency: null, siteName: null };

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

function absoluteHttp(value: unknown, base: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const u = new URL(value.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

type Json = Record<string, unknown>;

function jsonLdProduct($: cheerio.CheerioAPI): Json | null {
  const nodes: Json[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (v && typeof v === 'object') {
      nodes.push(v as Json);
      visit((v as Json)['@graph']);
    }
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      visit(JSON.parse($(el).text()));
    } catch {
      /* broken JSON-LD is common; ignore it */
    }
  });
  return (
    nodes.find((n) => {
      const t = n['@type'];
      return t === 'Product' || (Array.isArray(t) && t.includes('Product'));
    }) ?? null
  );
}

function offerPrice(product: Json): { priceMinor: number; currency: string | null } | null {
  const offers = ([] as unknown[]).concat(product.offers ?? []);
  for (const offer of offers) {
    if (!offer || typeof offer !== 'object') continue;
    const o = offer as Json;
    const raw = o.price ?? o.lowPrice;
    if (typeof raw !== 'string' && typeof raw !== 'number') continue;
    const priceMinor = toMinor(String(raw));
    if (priceMinor === null) continue;
    return { priceMinor, currency: typeof o.priceCurrency === 'string' ? o.priceCurrency : null };
  }
  return null;
}

export function parseLinkPreview(html: string, baseUrl: string): LinkPreview {
  const $ = cheerio.load(html);
  const meta = (key: string) => clean($(`meta[property="${key}"], meta[name="${key}"]`).first().attr('content'), 2000);
  const product = jsonLdProduct($);

  const ldImage = (() => {
    const img = product?.image;
    const first = Array.isArray(img) ? img[0] : img;
    return typeof first === 'object' && first !== null ? (first as Json).url : first;
  })();

  let priceMinor: number | null = null;
  let currency: string | null = null;
  const metaAmount = meta('product:price:amount') ?? meta('og:price:amount');
  if (metaAmount) {
    priceMinor = toMinor(metaAmount);
    currency = meta('product:price:currency') ?? meta('og:price:currency');
  }
  if (priceMinor === null && product) {
    const p = offerPrice(product);
    if (p) ({ priceMinor, currency } = p);
  }
  currency = priceMinor !== null && currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null;

  return {
    title: clean(meta('og:title') ?? product?.name ?? $('title').first().text(), 200),
    description: clean(meta('og:description') ?? product?.description ?? meta('description'), 1000),
    imageUrl: absoluteHttp(meta('og:image') ?? ldImage, baseUrl),
    priceMinor,
    currency,
    siteName: clean(meta('og:site_name'), 100),
  };
}

function decode(body: Buffer, contentType: string): string {
  let label = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  if (!label) label = /<meta[^>]+charset=["']?([\w-]+)/i.exec(body.subarray(0, 4096).toString('latin1'))?.[1];
  try {
    return new TextDecoder(label ?? 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

/** Fetches a page safely and extracts a preview. Failures give an empty preview plus an error code, never an exception. */
export async function getLinkPreview(url: string, fetcher: SafeFetch = safeFetch): Promise<LinkPreviewResult> {
  try {
    const res = await fetcher(url);
    if (!/html|xml/i.test(res.contentType)) return { ...EMPTY, error: 'unreachable' };
    return parseLinkPreview(decode(res.body, res.contentType), res.finalUrl);
  } catch (err) {
    const code = err instanceof SafeFetchError ? err.code : 'unreachable';
    return { ...EMPTY, error: code === 'blocked' || code === 'too_large' ? code : 'unreachable' };
  }
}
