import { Hono } from 'hono';
import { z } from 'zod';
import { closeRound, previewReveal } from '../../domain/reveal';
import { HttpError, type AppDeps, type AppEnv } from '../../deps';
import { requireOwner } from '../guards';

const closeBody = z.object({ receivedItemIds: z.array(z.number().int().positive()).max(1000) }).strict();

export function roundsRoutes(deps: AppDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/rounds/current/reveal', requireOwner, (c) => c.json(previewReveal(deps.db, deps.config, deps.clock())));

  r.get('/rounds/:id/reveal', requireOwner, (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'not_found');
    return c.json(previewReveal(deps.db, deps.config, deps.clock(), id));
  });

  r.post('/rounds/:id/close', requireOwner, async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'not_found');
    const body = closeBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, 'invalid_body');
    return c.json(await closeRound(deps, id, body.data.receivedItemIds));
  });

  return r;
}
