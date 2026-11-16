import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSafeFetch, isBlockedAddress, SafeFetchError } from '../../src/server/services/ssrf';

describe('isBlockedAddress', () => {
  it.each(['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '172.31.255.255', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::7f00:1'])(
    'blocks %s',
    (ip) => expect(isBlockedAddress(ip)).toBe(true),
  );
  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700::1111', '::ffff:8.8.8.8'])('allows %s', (ip) => expect(isBlockedAddress(ip)).toBe(false));
  it('treats a non-IP string as blocked', () => expect(isBlockedAddress('not-an-ip')).toBe(true));
});

let server: Server;
let base: string;
const big = Buffer.alloc(3 * 1024 * 1024, 97);

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/ok') return void res.writeHead(200, { 'Content-Type': 'text/html' }).end('<title>hi</title>');
    if (url === '/big') return void res.writeHead(200, { 'Content-Type': 'text/html' }).end(big);
    if (url === '/hang') return; // never answers
    if (url === '/to-private') return void res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' }).end();
    if (url === '/to-ok') return void res.writeHead(302, { Location: '/ok' }).end();
    if (url.startsWith('/loop')) return void res.writeHead(302, { Location: `/loop${Number(url.slice(5) || 0) + 1}` }).end();
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof SafeFetchError) return e.code;
    throw e;
  }
  return 'no-error';
};

describe('createSafeFetch', () => {
  const local = createSafeFetch({ allowLoopback: true });

  it('blocks loopback by default, which also makes a redirect to 127.0.0.1 impossible', async () => {
    expect(await code(createSafeFetch({})(`${base}/ok`))).toBe('blocked');
  });

  it.each(['file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com', 'javascript:alert(1)', 'not a url'])('rejects %s', async (u) => {
    expect(await code(local(u))).toMatch(/bad_url|blocked/);
  });

  it('rejects a literal private IP host and an IPv6 loopback literal', async () => {
    expect(await code(local('http://10.0.0.5/'))).toBe('blocked');
    expect(await code(createSafeFetch({})('http://[::1]/'))).toBe('blocked');
    // decimal and hex spellings of 127.0.0.1 are normalised by URL and then blocked
    expect(await code(createSafeFetch({})('http://2130706433/'))).toBe('blocked');
    expect(await code(createSafeFetch({})('http://0x7f.1/'))).toBe('blocked');
  });

  it('blocks a hostname that resolves to a private address (DNS rebinding style)', async () => {
    const f = createSafeFetch({ lookup: async () => [{ address: '10.0.0.5', family: 4 }] });
    expect(await code(f('http://evil.example/'))).toBe('blocked');
  });

  it('blocks when any resolved address is private', async () => {
    const f = createSafeFetch({ lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }] });
    expect(await code(f('http://mixed.example/'))).toBe('blocked');
  });

  it('fetches a page and follows a relative redirect', async () => {
    const res = await local(`${base}/to-ok`);
    expect(res.finalUrl).toBe(`${base}/ok`);
    expect(res.contentType).toContain('text/html');
    expect(res.body.toString()).toBe('<title>hi</title>');
  });

  it('blocks a redirect to a private address', async () => {
    expect(await code(local(`${base}/to-private`))).toBe('blocked');
  });

  it('gives up after three redirects', async () => {
    expect(await code(local(`${base}/loop`))).toBe('too_many_redirects');
  });

  it('aborts a response larger than the limit', async () => {
    expect(await code(local(`${base}/big`, { maxBytes: 1024 }))).toBe('too_large');
  });

  it('times out on a server that never answers', async () => {
    expect(await code(local(`${base}/hang`, { timeoutMs: 200 }))).toBe('timeout');
  });
});
