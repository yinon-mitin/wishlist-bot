import { describe, expect, it } from 'vitest';
import { getLinkPreview, parseLinkPreview } from '../../src/server/services/linkPreview';
import { SafeFetchError, type SafeFetch } from '../../src/server/services/ssrf';
import { createTestApp, guest, owner } from '../helpers/testApp';

const BASE = 'https://shop.example/items/pen?id=1';

describe('parseLinkPreview', () => {
  it('reads OpenGraph title, description, image and site name', () => {
    const html = `<head><meta property="og:title" content="Fountain pen"><meta property="og:description" content="Blue ink"><meta property="og:image" content="https://cdn.example/pen.jpg"><meta property="og:site_name" content="Shop"></head>`;
    expect(parseLinkPreview(html, BASE)).toMatchObject({ title: 'Fountain pen', description: 'Blue ink', imageUrl: 'https://cdn.example/pen.jpg', siteName: 'Shop', priceMinor: null, currency: null });
  });

  it('makes a relative og:image absolute', () => {
    expect(parseLinkPreview(`<meta property="og:image" content="/img/pen.jpg">`, BASE).imageUrl).toBe('https://shop.example/img/pen.jpg');
    expect(parseLinkPreview(`<meta property="og:image" content="//cdn.example/p.jpg">`, BASE).imageUrl).toBe('https://cdn.example/p.jpg');
  });

  it('reads a price from JSON-LD Product offers, with grouping and decimal comma', () => {
    const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'Pen', image: ['https://cdn.example/a.jpg'], offers: { '@type': 'Offer', price: '1 299,00', priceCurrency: 'rub' } });
    const p = parseLinkPreview(`<script type="application/ld+json">${ld}</script>`, BASE);
    expect(p).toMatchObject({ title: 'Pen', priceMinor: 129900, currency: 'RUB', imageUrl: 'https://cdn.example/a.jpg' });
  });

  it('finds a Product inside @graph and in offers arrays, numeric prices included', () => {
    const ld = JSON.stringify({ '@graph': [{ '@type': 'WebSite' }, { '@type': ['Product', 'Thing'], name: 'Lamp', offers: [{ price: 49.9, priceCurrency: 'USD' }] }] });
    expect(parseLinkPreview(`<script type="application/ld+json">${ld}</script>`, BASE)).toMatchObject({ title: 'Lamp', priceMinor: 4990, currency: 'USD' });
  });

  it('survives broken JSON-LD', () => {
    expect(parseLinkPreview(`<title>T</title><script type="application/ld+json">{oops</script>`, BASE).title).toBe('T');
  });

  it('reads product:price meta tags', () => {
    const html = `<meta property="og:title" content="X"><meta property="product:price:amount" content="12.50"><meta property="product:price:currency" content="EUR">`;
    expect(parseLinkPreview(html, BASE)).toMatchObject({ priceMinor: 1250, currency: 'EUR' });
  });

  it('falls back to <title> and the description meta when there are no OpenGraph tags', () => {
    const p = parseLinkPreview(`<html><head><title> Plain page </title><meta name="description" content="About"></head></html>`, BASE);
    expect(p).toMatchObject({ title: 'Plain page', description: 'About', imageUrl: null });
  });

  it('returns all nulls for an empty document and ignores non-http(s) images', () => {
    expect(parseLinkPreview('', BASE)).toEqual({ title: null, description: null, imageUrl: null, priceMinor: null, currency: null, siteName: null });
    expect(parseLinkPreview(`<meta property="og:image" content="javascript:alert(1)">`, BASE).imageUrl).toBeNull();
  });

  it('does not return a currency without a parsable price', () => {
    expect(parseLinkPreview(`<meta property="product:price:amount" content="free"><meta property="product:price:currency" content="USD">`, BASE)).toMatchObject({ priceMinor: null, currency: null });
  });
});

describe('getLinkPreview', () => {
  const ok = (body: Buffer | string, contentType = 'text/html; charset=utf-8'): SafeFetch =>
    async (url) => ({ finalUrl: url, contentType, status: 200, body: Buffer.from(body) });

  it('decodes windows-1251 pages by the declared charset', async () => {
    const title = Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]); // "Привет"
    const body = Buffer.concat([Buffer.from('<html><head><title>'), title, Buffer.from('</title></head></html>')]);
    expect((await getLinkPreview('https://x.example/', ok(body, 'text/html; charset=windows-1251'))).title).toBe('Привет');
  });

  it('decodes by a <meta charset> when the header says nothing', async () => {
    const body = Buffer.concat([Buffer.from('<meta charset="windows-1251"><title>'), Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]), Buffer.from('</title>')]);
    expect((await getLinkPreview('https://x.example/', ok(body, 'text/html'))).title).toBe('Привет');
  });

  it('maps fetch failures to an error code with an otherwise empty preview', async () => {
    for (const code of ['blocked', 'too_large', 'unreachable', 'timeout'] as const) {
      const failing: SafeFetch = async () => {
        throw new SafeFetchError(code);
      };
      const p = await getLinkPreview('https://x.example/', failing);
      expect(p.error).toBe(code === 'timeout' ? 'unreachable' : code);
      expect(p.title).toBeNull();
    }
  });

  it('reports a non-HTML document as unreachable instead of parsing it', async () => {
    expect((await getLinkPreview('https://x.example/a.pdf', ok('%PDF-1.4', 'application/pdf'))).error).toBe('unreachable');
  });
});

describe('POST /api/link-preview', () => {
  it('is for the owner only', async () => {
    const t = createTestApp();
    expect((await t.call('/api/link-preview', { as: guest(1), json: { url: 'https://x.example/' } })).status).toBe(403);
  });

  it('rejects a body without a url', async () => {
    const t = createTestApp();
    expect((await t.call('/api/link-preview', { as: owner, json: {} })).status).toBe(400);
  });

  it('answers 200 with error:"blocked" for a private address, and the preview for a good page', async () => {
    const fetcher: SafeFetch = async (url) => ({ finalUrl: url, contentType: 'text/html', status: 200, body: Buffer.from('<title>Nice</title>') });
    const t = createTestApp({ deps: { safeFetcher: fetcher } });
    const good = await t.call('/api/link-preview', { as: owner, json: { url: 'https://x.example/' } });
    expect(await good.json()).toMatchObject({ title: 'Nice' });
    const real = createTestApp();
    const bad = await real.call('/api/link-preview', { as: owner, json: { url: 'http://169.254.169.254/latest' } });
    expect(bad.status).toBe(200);
    expect(await bad.json()).toMatchObject({ error: 'blocked', title: null });
  });
});
