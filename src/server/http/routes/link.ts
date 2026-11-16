import { Hono } from 'hono';
import { z } from 'zod';
import { HttpError, type AppDeps, type AppEnv } from '../../deps';
import { getLinkPreview } from '../../services/linkPreview';
import { safeFetch } from '../../services/ssrf';
import { requireOwner } from '../guards';

const body = z.object({ url: z.string().max(2000) }).strict();

export function linkRoutes(deps: AppDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.post('/link-preview', requireOwner, async (c) => {
    const parsed = body.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, 'invalid_body');
    return c.json(await getLinkPreview(parsed.data.url, deps.safeFetcher ?? safeFetch));
  });
  return r;
}
