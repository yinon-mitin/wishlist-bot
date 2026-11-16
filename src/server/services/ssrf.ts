import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

export type SafeFetchErrorCode = 'blocked' | 'bad_url' | 'too_large' | 'too_many_redirects' | 'timeout' | 'unreachable';

export class SafeFetchError extends Error {
  constructor(public code: SafeFetchErrorCode) {
    super(code);
  }
}

const v4 = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) v4.addSubnet(net, prefix, 'ipv4');

const v6 = new BlockList();
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['2001::', 32], ['2002::', 16], ['64:ff9b::', 96],
] as const) v6.addSubnet(net, prefix, 'ipv6');

/** Expands "::ffff:7f00:1" or "::ffff:127.0.0.1" into the embedded IPv4 address, or null. */
function embeddedV4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (dotted) return dotted[1]!;
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}

/** True for anything that must never be fetched on a user's behalf (private, loopback, link-local, ...). */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return true;
  if (family === 4) return v4.check(ip, 'ipv4');
  const mapped = embeddedV4(ip);
  if (mapped) return v4.check(mapped, 'ipv4');
  return v6.check(ip, 'ipv6');
}

const isLoopback = (ip: string) => ip === '::1' || (isIP(ip) === 4 && ip.startsWith('127.')) || embeddedV4(ip)?.startsWith('127.') === true;

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

export interface SafeFetchResult {
  finalUrl: string;
  contentType: string;
  status: number;
  body: Buffer;
}

export type SafeFetch = (url: string, opts?: SafeFetchOptions) => Promise<SafeFetchResult>;
export type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;

export interface SafeFetchFactoryOptions {
  /** Only for tests that talk to a local server. Never wired to configuration. */
  allowLoopback?: boolean;
  lookup?: Resolver;
}

const defaultResolver: Resolver = (hostname) => dnsLookup(hostname, { all: true });

function findSafeError(err: unknown): SafeFetchError | null {
  for (let e: unknown = err, i = 0; e && i < 5; i++, e = (e as { cause?: unknown }).cause) {
    if (e instanceof SafeFetchError) return e;
  }
  return null;
}

export function createSafeFetch(factory: SafeFetchFactoryOptions = {}): SafeFetch {
  const resolve = factory.lookup ?? defaultResolver;
  const blocked = (ip: string) => isBlockedAddress(ip) && !(factory.allowLoopback && isLoopback(ip));

  // The address that is checked is the address that is connected to: no second DNS lookup, so no rebinding window.
  const agent = new Agent({
    connect: {
      lookup: ((hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
        resolve(hostname)
          .then((addrs) => {
            if (addrs.length === 0 || addrs.some((a) => blocked(a.address))) return callback(new SafeFetchError('blocked'));
            if (options?.all) return callback(null, addrs);
            return callback(null, addrs[0]!.address, addrs[0]!.family);
          })
          .catch(() => callback(new SafeFetchError('unreachable')));
      }) as never,
    },
  });

  const checkUrl = (raw: string): URL => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new SafeFetchError('bad_url');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SafeFetchError('bad_url');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && blocked(host)) throw new SafeFetchError('blocked'); // literals never reach the lookup hook
    return url;
  };

  return async (rawUrl, opts = {}) => {
    const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
    const maxRedirects = opts.maxRedirects ?? 3;
    const signal = AbortSignal.timeout(opts.timeoutMs ?? 8000);
    let current = checkUrl(rawUrl);
    try {
      for (let hop = 0; ; hop++) {
        const res = await undiciFetch(current, {
          dispatcher: agent,
          redirect: 'manual',
          signal,
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; WishlistBot/1.0)', accept: 'text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5' },
        });
        const location = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && location) {
          await res.body?.cancel();
          if (hop >= maxRedirects) throw new SafeFetchError('too_many_redirects');
          current = checkUrl(new URL(location, current).toString());
          continue;
        }
        if (res.status >= 400) {
          await res.body?.cancel();
          throw new SafeFetchError('unreachable');
        }
        const declared = Number(res.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > maxBytes) {
          await res.body?.cancel();
          throw new SafeFetchError('too_large');
        }
        const chunks: Buffer[] = [];
        let total = 0;
        if (res.body) {
          for await (const chunk of res.body) {
            total += chunk.length;
            if (total > maxBytes) {
              await res.body.cancel().catch(() => undefined);
              throw new SafeFetchError('too_large');
            }
            chunks.push(Buffer.from(chunk));
          }
        }
        return { finalUrl: current.toString(), contentType: res.headers.get('content-type') ?? '', status: res.status, body: Buffer.concat(chunks) };
      }
    } catch (err) {
      const safe = findSafeError(err);
      if (safe) throw safe;
      if (signal.aborted || (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'))) throw new SafeFetchError('timeout');
      throw new SafeFetchError('unreachable');
    }
  };
}

/** The fetcher used in production: private networks are never reachable. */
export const safeFetch: SafeFetch = createSafeFetch();
