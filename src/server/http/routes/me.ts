import { Hono } from 'hono';
import { getOpenRound, daysUntil } from '../../domain/rounds';
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
  r.get('/home', (c) => {
    const round = getOpenRound(deps.db);
    return c.json({ date: round.date, daysLeft: Math.max(0, daysUntil(round.date, deps.clock(), config.timezone)) });
  });
  return r;
}
