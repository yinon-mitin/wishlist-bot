import { Hono } from 'hono';
import type { AppDeps, AppEnv } from '../../deps';

export function meRoutes(deps: AppDeps): Hono<AppEnv> {
  const { config } = deps;
  const r = new Hono<AppEnv>();
  r.get('/me', (c) =>
    c.json({
      viewer: c.get('viewer'),
      config: {
        currencies: config.currencies,
        defaultCurrency: config.defaultCurrency,
        birthday: config.birthday,
        botUsername: config.botUsername ?? null,
        appShortName: config.appShortName ?? null,
      },
    }),
  );
  return r;
}
