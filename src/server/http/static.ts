import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Handler } from 'hono';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

async function readIfFile(path: string): Promise<Buffer | null> {
  try {
    if (!(await stat(path)).isFile()) return null;
    return await readFile(path);
  } catch {
    return null;
  }
}

/** Serves the built SPA: real files from root, anything else falls back to index.html. */
export function staticHandler(root: string): Handler {
  const base = resolve(root);
  return async (c) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return c.notFound();
    }
    const candidate = resolve(join(base, normalize(pathname)));
    if (candidate === base || candidate.startsWith(base + sep)) {
      const file = candidate === base ? null : await readIfFile(candidate);
      if (file) {
        const cache = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
        return c.body(new Uint8Array(file), 200, {
          'Content-Type': TYPES[extname(candidate).toLowerCase()] ?? 'application/octet-stream',
          'Cache-Control': cache,
        });
      }
    }
    const index = await readIfFile(join(base, 'index.html'));
    if (!index) return c.notFound();
    return c.body(new Uint8Array(index), 200, { 'Content-Type': TYPES['.html']!, 'Cache-Control': 'no-cache' });
  };
}
