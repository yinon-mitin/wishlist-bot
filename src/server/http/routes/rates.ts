import { Hono } from 'hono';
import { HttpError, type AppDeps, type AppEnv } from '../../deps';

export function ratesRoutes(deps: AppDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.get('/rates', (c) => {
    const rates = deps.rates.get();
    if (!rates) throw new HttpError(503, 'rates_unavailable');
    return c.json(rates);
  });
  return r;
}
